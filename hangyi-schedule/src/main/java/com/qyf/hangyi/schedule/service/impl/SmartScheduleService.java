package com.qyf.hangyi.schedule.service.impl;

import com.qyf.hangyi.schedule.dto.SmartScheduleRequest;
import com.qyf.hangyi.schedule.dto.MultiDayScheduleRequest;
import com.qyf.hangyi.schedule.dto.RoleScheduleRequest;
import com.qyf.hangyi.schedule.entity.ScheduleDetail;
import com.qyf.hangyi.schedule.mapper.ScheduleDetailMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class SmartScheduleService {

    @Autowired private JdbcTemplate jdbc;
    @Autowired private ScheduleDetailMapper detailMapper;

    private static final int FATIGUE_MAX_DAYS = 3;
    private static final String[] SHIFTS = {"MORNING", "AFTERNOON", "NIGHT"};

    @Transactional
    public Map<String, Object> smartSchedule(SmartScheduleRequest req) {
        LocalDate date = req.getScheduleDate();
        List<Long> flightIds = req.getFlightIds();

        // 1. Query flights
        String inClause = flightIds.stream().map(String::valueOf).collect(Collectors.joining(","));
        List<Map<String, Object>> flights = jdbc.queryForList(
                "SELECT f.* FROM flight_plan f WHERE f.id IN (" + inClause + ")");
        if (flights.isEmpty()) throw new RuntimeException("未找到对应航班");

        // 2. Query active staff with qualifications
        List<Map<String, Object>> staff = jdbc.queryForList(
                "SELECT e.id, e.name, e.employee_no, e.group_id, " +
                        "GROUP_CONCAT(DISTINCT eq.aircraft_type) as aircraft_types, " +
                        "GROUP_CONCAT(DISTINCT eq.airline) as airlines " +
                        "FROM employee e " +
                        "LEFT JOIN employee_qualification eq ON e.id = eq.employee_id " +
                        "WHERE e.status = 'ACTIVE' AND e.on_leave = 0 " +
                        "GROUP BY e.id, e.name, e.employee_no, e.group_id");

        if (staff.isEmpty()) throw new RuntimeException("没有可用的维修人员");

        // 3. Monthly hours
        String monthStart = date.withDayOfMonth(1).toString();
        String nextDay = date.plusDays(1).toString();
        List<Map<String, Object>> monthScheds = jdbc.queryForList(
                "SELECT sd.employee_id, COUNT(*) cnt FROM schedule_detail sd " +
                        "WHERE sd.work_date >= ? AND sd.work_date < ? GROUP BY sd.employee_id",
                monthStart, nextDay);
        Map<Long, Integer> monthlyHours = new HashMap<>();
        for (Map<String, Object> row : monthScheds) {
            Long eid = ((Number) row.get("employee_id")).longValue();
            monthlyHours.put(eid, ((Number) row.get("cnt")).intValue() * 8);
        }

        // 4. Recent 30-day schedule data for fatigue calculation
        LocalDate thirtyAgo = date.minusDays(30);
        List<Map<String, Object>> recentScheds = jdbc.queryForList(
                "SELECT sd.employee_id, sd.work_date FROM schedule_detail sd " +
                        "WHERE sd.work_date >= ? AND sd.work_date <= ?", thirtyAgo, date);
        Map<Long, Set<LocalDate>> workDates = new HashMap<>();
        for (Map<String, Object> row : recentScheds) {
            Long eid = ((Number) row.get("employee_id")).longValue();
            LocalDate d = ((java.sql.Date) row.get("work_date")).toLocalDate();
            workDates.computeIfAbsent(eid, k -> new HashSet<>()).add(d);
        }

        Set<Long> todayWorked = new HashSet<>();
        for (Map.Entry<Long, Set<LocalDate>> e : workDates.entrySet()) {
            if (e.getValue().contains(date)) todayWorked.add(e.getKey());
        }

        Function<Long, Integer> getContinuous = (eid) -> {
            Set<LocalDate> dates = workDates.getOrDefault(eid, Set.of());
            int count = 0;
            for (int i = 1; i <= 10; i++) {
                if (dates.contains(date.minusDays(i))) count++;
                else break;
            }
            return count;
        };

        // 5. Assign staff to flights
        List<Map<String, Object>> assignments = new ArrayList<>();
        Set<Long> usedStaff = new HashSet<>();
        Set<Long> localWorked = new HashSet<>(todayWorked);

        for (int fi = 0; fi < flights.size(); fi++) {
            Map<String, Object> flight = flights.get(fi);
            String shiftCode = SHIFTS[fi % SHIFTS.length];
            String airline = String.valueOf(flight.getOrDefault("airline", "")).trim();
            String aircraftType = String.valueOf(flight.getOrDefault("aircraft_type", "")).trim();

            // Filter qualified candidates
            List<Map<String, Object>> candidates = staff.stream()
                    .filter(s -> {
                        Long sid = ((Number) s.get("id")).longValue();
                        if (usedStaff.contains(sid)) return false;
                        if (localWorked.contains(sid)) return false;
                        if (getContinuous.apply(sid) >= FATIGUE_MAX_DAYS) return false;
                        String airs = String.valueOf(s.getOrDefault("airlines", ""));
                        String types = String.valueOf(s.getOrDefault("aircraft_types", ""));
                        return airs.contains(airline) && types.contains(aircraftType);
                    })
                    .sorted((a, b) -> {
                        Long aid = ((Number) a.get("id")).longValue();
                        Long bid = ((Number) b.get("id")).longValue();
                        int w1 = localWorked.contains(aid) ? 1 : 0;
                        int w2 = localWorked.contains(bid) ? 1 : 0;
                        if (w1 != w2) return w1 - w2;
                        int c = getContinuous.apply(aid) - getContinuous.apply(bid);
                        if (c != 0) return c;
                        return Integer.compare(monthlyHours.getOrDefault(aid, 0), monthlyHours.getOrDefault(bid, 0));
                    })
                    .toList();

            Map<String, Object> chosen = candidates.isEmpty() ? null : candidates.get(0);
            Map<String, Object> result = new HashMap<>();
            result.put("flightId", flight.get("id"));
            result.put("flightNo", flight.get("flight_no"));
            result.put("airline", airline);
            result.put("aircraftType", aircraftType);
            result.put("shiftCode", shiftCode);

            if (chosen == null) {
                result.put("staffId", null);
                result.put("staffName", "");
                result.put("warning", "无人可用：" + airline + " " + aircraftType);
            } else {
                Long chosenId = ((Number) chosen.get("id")).longValue();
                usedStaff.add(chosenId);
                localWorked.add(chosenId);
                workDates.computeIfAbsent(chosenId, k -> new HashSet<>()).add(date);

                // Write schedule_detail
                ScheduleDetail detail = new ScheduleDetail();
                detail.setEmployeeId(chosenId);
                detail.setWorkDate(date);
                detail.setShiftGroup(shiftCode);
                detail.setScheduleType("SMART");
                detail.setFlightId(((Number) flight.get("id")).longValue());
                detail.setTaskType(null);
                detailMapper.insert(detail);

                result.put("staffId", chosenId);
                result.put("staffName", String.valueOf(chosen.getOrDefault("name", "")));
                result.put("staffEmployeeNo", String.valueOf(chosen.getOrDefault("employee_no", "")));
                result.put("continuousDays", getContinuous.apply(chosenId));
            }
            assignments.add(result);
        }

        Map<String, Object> resp = new HashMap<>();
        resp.put("scheduleDate", date.toString());
        resp.put("assignments", assignments);
        resp.put("totalFlights", flights.size());
        resp.put("assignedCount", assignments.stream().filter(a -> a.get("staffId") != null).count());
        return resp;
    }

    @Transactional
    public Map<String, Object> smartScheduleMultiDay(MultiDayScheduleRequest req) {
        LocalDate start = req.getStartDate();
        LocalDate end = req.getEndDate();
        long days = ChronoUnit.DAYS.between(start, end) + 1;
        List<Map<String, Object>> results = new ArrayList<>();
        for (int i = 0; i < days; i++) {
            LocalDate d = start.plusDays(i);
            List<Map<String, Object>> dayFlights = jdbc.queryForList(
                    "SELECT id FROM flight_plan WHERE status = 'ACTIVE' LIMIT 50");
            if (dayFlights.isEmpty()) continue;
            List<Long> fIds = dayFlights.stream()
                    .map(r -> ((Number) r.get("id")).longValue()).toList();
            SmartScheduleRequest sreq = new SmartScheduleRequest();
            sreq.setScheduleDate(d);
            sreq.setFlightIds(fIds);
            try {
                results.add(smartSchedule(sreq));
            } catch (Exception e) {
                Map<String, Object> err = new HashMap<>();
                err.put("date", d.toString());
                err.put("error", e.getMessage());
                results.add(err);
            }
        }
        Map<String, Object> resp = new HashMap<>();
        resp.put("dateRange", Map.of("start", start.toString(), "end", end.toString()));
        resp.put("days", days);
        resp.put("results", results);
        return resp;
    }

    @Transactional
    public Map<String, Object> smartScheduleWithRoles(RoleScheduleRequest req) {
        LocalDate date = req.getScheduleDate();
        List<Map<String, Object>> results = new ArrayList<>();
        int writtenCount = 0;

        for (RoleScheduleRequest.RoleAssignment a : req.getAssignments()) {
            List<Map<String, Object>> qualified = jdbc.queryForList(
                    "SELECT e.id, e.name, e.employee_no FROM employee e " +
                            "JOIN employee_qualification eq ON e.id = eq.employee_id " +
                            "WHERE e.status = 'ACTIVE' AND e.on_leave = 0 " +
                            "AND eq.aircraft_type = ? LIMIT ?", a.getAircraftType(), a.getRequiredCount());

            List<Map<String, Object>> assignedStaff = new ArrayList<>();
            for (int i = 0; i < Math.min(a.getRequiredCount(), qualified.size()); i++) {
                Map<String, Object> staffMember = qualified.get(i);
                Long staffId = ((Number) staffMember.get("id")).longValue();

                ScheduleDetail detail = new ScheduleDetail();
                detail.setEmployeeId(staffId);
                detail.setWorkDate(date);
                detail.setShiftGroup("MORNING");
                detail.setScheduleType("ADMIN_ROLES");
                detail.setTaskType(a.getTaskType());
                detail.setFlightId(null);
                detailMapper.insert(detail);
                writtenCount++;

                Map<String, Object> s = new HashMap<>();
                s.put("staffId", staffId);
                s.put("name", staffMember.get("name"));
                s.put("employeeNo", staffMember.get("employee_no"));
                assignedStaff.add(s);
            }

            Map<String, Object> r = new HashMap<>();
            r.put("flightNo", a.getFlightNo());
            r.put("taskType", a.getTaskType());
            r.put("assignedCount", assignedStaff.size());
            r.put("requiredCount", a.getRequiredCount());
            r.put("staff", assignedStaff);
            results.add(r);
        }

        Map<String, Object> resp = new HashMap<>();
        resp.put("scheduleDate", date.toString());
        resp.put("assignments", results);
        resp.put("writtenCount", writtenCount);
        return resp;
    }

    public Map<String, Object> optimizeStaffSchedule(Map<String, Object> payload) {
        List<Map<String, Object>> overloaded = jdbc.queryForList(
                "SELECT employee_id, COUNT(*) cnt FROM schedule_detail " +
                        "GROUP BY employee_id HAVING cnt > 3 ORDER BY cnt DESC");
        Map<String, Object> resp = new HashMap<>();
        resp.put("overloadedStaff", overloaded.size());
        resp.put("suggestion", "建议将任务从高负荷员工重新分配给低负荷员工");
        return resp;
    }

    @Transactional
    public Map<String, Object> importFromTSV(String tsvContent, String scheduleDate) {
        if (tsvContent == null || tsvContent.isBlank()) {
            throw new RuntimeException("TSV内容为空");
        }
        String[] lines = tsvContent.split("\n");
        int imported = 0;
        // Skip header line
        for (int i = 1; i < lines.length; i++) {
            String line = lines[i].trim();
            if (line.isEmpty()) continue;
            String[] cols = line.split("\t");
            if (cols.length < 4) continue;
            // Format: flightNo, airline, aircraftType, staffAssignments
            String flightNo = cols[0].trim();
            String airline = cols.length > 1 ? cols[1].trim() : "";
            String aircraftType = cols.length > 2 ? cols[2].trim() : "";

            ScheduleDetail detail = new ScheduleDetail();
            detail.setWorkDate(LocalDate.parse(scheduleDate));
            detail.setShiftGroup("MORNING");
            detail.setScheduleType("MANUAL");
            detailMapper.insert(detail);
            imported++;
        }
        Map<String, Object> resp = new HashMap<>();
        resp.put("scheduleDate", scheduleDate);
        resp.put("importedCount", imported);
        return resp;
    }

    @Transactional
    public void completeSchedule(Long detailId) {
        ScheduleDetail detail = detailMapper.selectById(detailId);
        if (detail == null) throw new RuntimeException("排班记录不存在");
        if ("COMPLETED".equals(detail.getScheduleType())) throw new RuntimeException("该排班已完成");
        detail.setScheduleType("COMPLETED");
        detailMapper.updateById(detail);
    }

    public List<Map<String, Object>> getScheduleHistory(String scheduleDate) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT sd.*, e.name as employee_name FROM schedule_detail sd " +
                        "LEFT JOIN employee e ON sd.employee_id = e.id " +
                        "WHERE sd.work_date = ? ORDER BY sd.shift_group", scheduleDate);
        return rows;
    }
}
