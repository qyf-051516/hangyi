package com.qyf.hangyi.schedule.solver.service;

import com.qyf.hangyi.common.exception.BusinessException;
import com.qyf.hangyi.schedule.dto.SmartScheduleRequest;
import com.qyf.hangyi.schedule.solver.ShiftRules;
import com.qyf.hangyi.schedule.solver.domain.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.Time;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.*;

@Component
public class ProblemFactory {

    @Autowired
    private JdbcTemplate jdbc;

    public SchedulePlan buildForDate(SmartScheduleRequest req) {
        LocalDate date = req.getScheduleDate();
        boolean preview = req.isPreview();

        SchedulePlan plan = new SchedulePlan();
        plan.setScheduleDate(date);
        plan.setPreview(preview);

        // 先加载 shift_template 获取动态阈值（O-10）
        plan.setShiftList(loadShifts());
        plan.setEmployeeList(loadEmployees(date, req.getGroupId()));
        plan.setFlightList(loadFlights(req.getFlightIds(), date, plan.getShiftList()));
        plan.setAssignmentList(buildAssignments(plan.getFlightList(), date, plan.getShiftList()));

        return plan;
    }

    private List<Employee> loadEmployees(LocalDate date, Long groupId) {
        String monthStart = date.withDayOfMonth(1).toString();
        String nextDay = date.plusDays(1).toString();
        String sevenDaysAgo = date.minusDays(7).toString();
        String yesterday = date.minusDays(1).toString();

        List<Map<String, Object>> rows;
        String employeeSql = "SELECT id, name, emp_no, group_id, license_type FROM employee " +
                "WHERE status = 1";
        if (groupId == null) {
            rows = jdbc.queryForList(employeeSql);
        } else {
            rows = jdbc.queryForList(employeeSql + " AND group_id = ?", groupId);
        }

        if (rows.isEmpty()) return List.of();

        // 收集所有员工 ID + 批量加载关联数据（O-2: 消除 N+1 查询）
        List<Long> empIds = new ArrayList<>();
        List<Employee> emps = new ArrayList<>();
        Map<Long, Employee> empMap = new HashMap<>();
        for (Map<String, Object> r : rows) {
            Employee e = new Employee();
            Long id = ((Number) r.get("id")).longValue();
            e.setId(id);
            e.setName((String) r.get("name"));
            e.setEmpNo((String) r.get("emp_no"));
            Object gid = r.get("group_id");
            e.setGroupId(gid == null ? null : ((Number) gid).longValue());
            e.setLicenseType((String) r.get("license_type"));
            emps.add(e);
            empIds.add(id);
            empMap.put(id, e);
        }

        // 批量加载资质
        Map<Long, List<String>> quals = batchLoadQualifications(empIds);
        // 批量加载请假
        Map<Long, Set<LocalDate>> leaves = batchLoadLeaves(empIds, date);
        // 批量加载月工时统计
        Map<Long, MonthlyStat> stats = batchLoadMonthlyStats(empIds, monthStart, nextDay, date);
        // 批量加载近7日夜班数
        Map<Long, Integer> nightCounts = batchLoadRecentNightCounts(empIds, sevenDaysAgo, date);
        // 批量加载昨日班次
        Map<Long, PrevShift> prevShifts = batchLoadPrevShifts(empIds, yesterday);

        for (Employee e : emps) {
            Long id = e.getId();
            e.setAircraftTypeNames(quals.getOrDefault(id, List.of()));
            e.setLeaveDates(leaves.getOrDefault(id, Set.of()));
            MonthlyStat stat = stats.getOrDefault(id, new MonthlyStat());
            e.setMonthlyHours(stat.hours);
            e.setMonthlyNightCount(stat.nightCount);
            e.setContinuousDays(stat.continuousDays);
            e.setRecent7DayNightCount(nightCounts.getOrDefault(id, 0));
            PrevShift prev = prevShifts.getOrDefault(id, new PrevShift());
            e.setPrevShiftCode(prev.shiftCode);
            e.setPrevShiftEndHour(prev.endHour);
        }
        return emps;
    }

    private Map<Long, List<String>> batchLoadQualifications(List<Long> empIds) {
        if (empIds.isEmpty()) return Map.of();
        String inClause = empIds.stream().map(id -> "?").reduce((a, b) -> a + "," + b).orElse("?");
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT eq.employee_id, at.type_name FROM employee_qualification eq " +
                "JOIN aircraft_type at ON eq.aircraft_type_id = at.id " +
                "WHERE eq.employee_id IN (" + inClause + ") AND eq.status = 1 " +
                "AND (eq.expire_date IS NULL OR eq.expire_date >= CURRENT_DATE)",
                empIds.toArray());
        Map<Long, List<String>> result = new HashMap<>();
        for (Map<String, Object> r : rows) {
            Long empId = ((Number) r.get("employee_id")).longValue();
            result.computeIfAbsent(empId, k -> new ArrayList<>()).add((String) r.get("type_name"));
        }
        return result;
    }

    private Map<Long, Set<LocalDate>> batchLoadLeaves(List<Long> empIds, LocalDate date) {
        if (empIds.isEmpty()) return Map.of();
        String inClause = empIds.stream().map(id -> "?").reduce((a, b) -> a + "," + b).orElse("?");
        List<Object> params = new ArrayList<>(empIds);
        params.add(date);
        params.add(date);
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT employee_id, start_date, end_date FROM leave_request " +
                "WHERE employee_id IN (" + inClause + ") AND status = 1 " +
                "AND start_date <= ? AND end_date >= ?",
                params.toArray());
        Map<Long, Set<LocalDate>> result = new HashMap<>();
        for (Map<String, Object> r : rows) {
            Long empId = ((Number) r.get("employee_id")).longValue();
            LocalDate s = ((java.sql.Date) r.get("start_date")).toLocalDate();
            LocalDate e = ((java.sql.Date) r.get("end_date")).toLocalDate();
            Set<LocalDate> set = result.computeIfAbsent(empId, k -> new HashSet<>());
            for (LocalDate d = s; !d.isAfter(e); d = d.plusDays(1)) set.add(d);
        }
        return result;
    }

    private Map<Long, MonthlyStat> batchLoadMonthlyStats(
            List<Long> empIds, String monthStart, String nextDay, LocalDate scheduleDate) {
        if (empIds.isEmpty()) return Map.of();
        String inClause = empIds.stream().map(id -> "?").reduce((a, b) -> a + "," + b).orElse("?");
        List<Object> params = new ArrayList<>(empIds);
        params.add(monthStart);
        params.add(nextDay);
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT employee_id, work_date, shift_group FROM schedule_detail " +
                "WHERE employee_id IN (" + inClause + ") AND work_date >= ? AND work_date < ? " +
                "AND (record_status IS NULL OR record_status = 'active')",
                params.toArray());
        // 按员工分组
        Map<Long, List<Map<String, Object>>> grouped = new HashMap<>();
        for (Map<String, Object> r : rows) {
            Long empId = ((Number) r.get("employee_id")).longValue();
            grouped.computeIfAbsent(empId, k -> new ArrayList<>()).add(r);
        }
        Map<Long, MonthlyStat> result = new HashMap<>();
        for (Long empId : empIds) {
            List<Map<String, Object>> empRows = grouped.getOrDefault(empId, List.of());
            MonthlyStat s = new MonthlyStat();
            s.hours = empRows.size() * 8;
            Set<LocalDate> dates = new HashSet<>();
            for (Map<String, Object> r : empRows) dates.add(((java.sql.Date) r.get("work_date")).toLocalDate());
            s.nightCount = (int) empRows.stream().filter(r -> "NIGHT".equals(r.get("shift_group"))).count();
            if (!dates.isEmpty()) {
                LocalDate previousDate = scheduleDate.minusDays(1);
                int streak = 0;
                for (int i = 0; i < 30; i++) {
                    if (dates.contains(previousDate.minusDays(i))) streak++;
                    else break;
                }
                s.continuousDays = streak;
            }
            result.put(empId, s);
        }
        return result;
    }

    private Map<Long, Integer> batchLoadRecentNightCounts(List<Long> empIds, String sevenDaysAgo, LocalDate date) {
        if (empIds.isEmpty()) return Map.of();
        String inClause = empIds.stream().map(id -> "?").reduce((a, b) -> a + "," + b).orElse("?");
        List<Object> params = new ArrayList<>(empIds);
        params.add(sevenDaysAgo);
        params.add(date);
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT employee_id, COUNT(*) AS cnt FROM schedule_detail " +
                "WHERE employee_id IN (" + inClause + ") AND work_date >= ? AND work_date <= ? " +
                "AND shift_group = 'NIGHT' AND (record_status IS NULL OR record_status = 'active') " +
                "GROUP BY employee_id",
                params.toArray());
        Map<Long, Integer> result = new HashMap<>();
        for (Map<String, Object> r : rows) {
            result.put(((Number) r.get("employee_id")).longValue(), ((Number) r.get("cnt")).intValue());
        }
        return result;
    }

    private Map<Long, PrevShift> batchLoadPrevShifts(List<Long> empIds, String yesterday) {
        if (empIds.isEmpty()) return Map.of();
        // 使用子查询取每个员工最新的昨日班次
        String inClause = empIds.stream().map(id -> "?").reduce((a, b) -> a + "," + b).orElse("?");
        List<Object> params = new ArrayList<>(empIds);
        params.add(java.sql.Date.valueOf(yesterday));
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT sd.employee_id, sd.shift_group, st.end_time FROM schedule_detail sd " +
                "JOIN (SELECT employee_id, MAX(id) AS max_id FROM schedule_detail " +
                "  WHERE employee_id IN (" + inClause + ") AND work_date = ? AND shift_group IS NOT NULL " +
                "  AND (record_status IS NULL OR record_status = 'active') " +
                "  GROUP BY employee_id) latest ON sd.id = latest.max_id " +
                "LEFT JOIN shift_template st ON sd.shift_id = st.id",
                params.toArray());
        Map<Long, PrevShift> result = new HashMap<>();
        for (Map<String, Object> r : rows) {
            PrevShift p = new PrevShift();
            p.shiftCode = (String) r.get("shift_group");
            Object et = r.get("end_time");
            if (et instanceof java.sql.Time t) p.endHour = t.toLocalTime().getHour();
            else if (et instanceof LocalTime t) p.endHour = t.getHour();
            result.put(((Number) r.get("employee_id")).longValue(), p);
        }
        return result;
    }

    private List<Flight> loadFlights(List<Long> flightIds, LocalDate date, List<Shift> shifts) {
        if (flightIds == null || flightIds.isEmpty()) return List.of();
        // O-10: 从 shift_template 动态读取早晚班分界时间
        LocalTime morningStart = LocalTime.of(8, 0);
        LocalTime eveningStart = LocalTime.of(16, 0);
        for (Shift s : shifts) {
            if ("MORNING".equals(s.getShiftCode()) && s.getStartTime() != null) {
                morningStart = s.getStartTime();
            } else if ("EVENING".equals(s.getShiftCode()) && s.getStartTime() != null) {
                eveningStart = s.getStartTime();
            }
        }
        String inClause = // M-10: 当前是 ? 占位参数化绑定, 安全; 风格上可改 NamedParameterJdbcTemplate
        flightIds.stream().map(id -> "?").reduce((a, b) -> a + "," + b).orElse("NULL");
        List<Object> flightParams = new ArrayList<>(flightIds);
        flightParams.add(date);
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT id, flight_no, airline, aircraft_type_name, plan_time, " +
                "COALESCE(is_release, 0) AS is_release FROM flight_plan " +
                "WHERE id IN (" + inClause + ") AND plan_date = ? AND status = 'SCHEDULED'",
                flightParams.toArray());
        if (rows.size() != new HashSet<>(flightIds).size()) {
            throw new BusinessException(400, "部分航班不存在、不属于排班日期或不是待执行状态");
        }
        List<Flight> flights = new ArrayList<>();
        for (Map<String, Object> r : rows) {
            Flight f = new Flight();
            f.setId(((Number) r.get("id")).longValue());
            f.setFlightNo((String) r.get("flight_no"));
            f.setAirline((String) r.get("airline"));
            f.setAircraftTypeName((String) r.get("aircraft_type_name"));
            Object pt = r.get("plan_time");
            if (pt instanceof Time t) {
                LocalTime lt = t.toLocalTime();
                f.setPlanTime(lt);
                f.setDerivedShiftCode(ShiftRules.timeToShiftCode(lt, morningStart, eveningStart));
            } else if (pt instanceof LocalTime t) {
                f.setPlanTime(t);
                f.setDerivedShiftCode(ShiftRules.timeToShiftCode(t, morningStart, eveningStart));
            }
            // O-1: 从 DB 读取 is_release 列，启用 C-a 放行持照约束
            Object isRelease = r.get("is_release");
            f.setRelease(isRelease != null && ((Number) isRelease).intValue() == 1);
            flights.add(f);
        }
        return flights;
    }

    private List<Shift> loadShifts() {
        return jdbc.queryForList(
                "SELECT id, shift_code, start_time, end_time FROM shift_template WHERE status = 1")
                .stream()
                .map(r -> {
                    Shift s = new Shift();
                    s.setId(((Number) r.get("id")).longValue());
                    s.setShiftCode((String) r.get("shift_code"));
                    Object st = r.get("start_time");
                    Object et = r.get("end_time");
                    if (st instanceof Time t1) s.setStartTime(t1.toLocalTime());
                    else if (st instanceof LocalTime t1) s.setStartTime(t1);
                    if (et instanceof Time t2) s.setEndTime(t2.toLocalTime());
                    else if (et instanceof LocalTime t2) s.setEndTime(t2);
                    return s;
                }).toList();
    }

    private List<ShiftAssignment> buildAssignments(List<Flight> flights, LocalDate date, List<Shift> shifts) {
        Map<String, Long> shiftHours = new HashMap<>();
        for (Shift s : shifts) {
            if (s.getStartTime() != null && s.getEndTime() != null) {
                long h = java.time.Duration.between(s.getStartTime(), s.getEndTime()).toHours();
                if (h <= 0) h += 24;
                shiftHours.put(s.getShiftCode(), h);
            } else {
                shiftHours.put(s.getShiftCode(), 8L);
            }
        }
        List<ShiftAssignment> list = new ArrayList<>();
        long seq = 1;
        for (Flight f : flights) {
            long hours = shiftHours.getOrDefault(f.getDerivedShiftCode(), 8L);
            list.add(new ShiftAssignment(seq++, f.getId(), f.getDerivedShiftCode(), hours));
        }
        return list;
    }

    private static class MonthlyStat {
        int hours; int nightCount; int continuousDays;
    }

    private static class PrevShift { String shiftCode; int endHour; }

}
