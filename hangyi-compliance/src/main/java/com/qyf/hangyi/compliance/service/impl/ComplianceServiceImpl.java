package com.qyf.hangyi.compliance.service.impl;

import com.qyf.hangyi.compliance.service.ComplianceService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import java.time.LocalDate;
import java.util.*;

@Service
public class ComplianceServiceImpl implements ComplianceService {

    @Autowired
    private JdbcTemplate jdbc;

    private static final int FATIGUE_MAX_DAYS = 3;
    private static final int MAX_DAILY_HOURS = 12;

    @Override
    public Map<String, Object> preflightCheck(String scheduleDate, List<Map<String, Object>> edits) {
        if (scheduleDate == null || edits == null) {
            throw new RuntimeException("参数不足");
        }
        List<Map<String, Object>> violations = new ArrayList<>();

        // Load staff map
        List<Map<String, Object>> staffList = jdbc.queryForList(
            "SELECT id, name, employee_no, group_id FROM employee WHERE status = 'ACTIVE'");
        Map<String, Map<String, Object>> staffByEmpNo = new HashMap<>();
        Map<Long, Map<String, Object>> staffById = new HashMap<>();
        for (Map<String, Object> s : staffList) {
            staffByEmpNo.put(String.valueOf(s.get("employee_no")), s);
            staffById.put(((Number) s.get("id")).longValue(), s);
        }

        // Load existing schedules for the date
        List<Map<String, Object>> existingScheds = jdbc.queryForList(
            "SELECT * FROM schedule_detail WHERE work_date = ?", scheduleDate);

        // Merge edits with existing schedules
        Set<String> editedEmpNos = new HashSet<>();
        List<Map<String, Object>> finalSchedules = new ArrayList<>();
        for (Map<String, Object> edit : edits) {
            editedEmpNos.add(String.valueOf(edit.get("employeeNo")));
            finalSchedules.add(edit);
        }
        for (Map<String, Object> sched : existingScheds) {
            String empNo = String.valueOf(sched.getOrDefault("employee_no", ""));
            if (!editedEmpNos.contains(empNo)) {
                finalSchedules.add(sched);
            }
        }

        Map<String, String> shiftTimeMap = Map.of(
            "MORNING", "08:00-12:00", "AFTERNOON", "13:00-18:00", "NIGHT", "19:00-23:00");

        // Check 1: CONCURRENT_SCHEDULE - same person, same shift, multiple schedules
        Map<String, Boolean> staffShiftMap = new HashMap<>();
        for (Map<String, Object> s : finalSchedules) {
            String shiftCode = String.valueOf(s.getOrDefault("shiftCode", s.getOrDefault("shift_group", "")));
            if (shiftCode.isEmpty()) continue;
            String empNo = String.valueOf(s.getOrDefault("employeeNo", s.getOrDefault("employee_no", "")));
            String key = empNo + "_" + shiftCode;
            if (staffShiftMap.containsKey(key)) {
                Map<String, Object> staff = staffByEmpNo.get(empNo);
                Map<String, Object> v = new HashMap<>();
                v.put("type", "CONCURRENT_SCHEDULE");
                v.put("severity", "HIGH");
                v.put("staffId", s.getOrDefault("staffId", s.getOrDefault("employee_id", "")));
                v.put("staffName", staff != null ? staff.get("name") : empNo);
                v.put("description", (staff != null ? staff.get("name") : empNo) + " 在 " + shiftCode + " (" + shiftTimeMap.getOrDefault(shiftCode, "") + ") 被多次排班");
                v.put("suggestion", "移除重复排班");
                violations.add(v);
            }
            staffShiftMap.put(key, true);
        }

        // Check 2: EXCEED_CONTINUOUS - worked too many consecutive days
        LocalDate today = LocalDate.parse(scheduleDate);
        String sevenAgo = today.minusDays(7).toString();
        List<Map<String, Object>> recentScheds = jdbc.queryForList(
            "SELECT sd.*, e.employee_no FROM schedule_detail sd " +
            "JOIN employee e ON sd.employee_id = e.id " +
            "WHERE sd.work_date >= ? AND sd.work_date <= ?", sevenAgo, scheduleDate);

        Map<String, Set<String>> empDates = new HashMap<>();
        for (Map<String, Object> s : recentScheds) {
            String empNo = String.valueOf(s.get("employee_no"));
            String d = String.valueOf(s.get("work_date")).substring(0, 10);
            empDates.computeIfAbsent(empNo, k -> new HashSet<>()).add(d);
        }

        for (Map.Entry<String, Set<String>> entry : empDates.entrySet()) {
            String empNo = entry.getKey();
            Set<String> dates = entry.getValue();
            // Count consecutive days backward from today
            int consecutive = 0;
            for (int i = 0; i < dates.size(); i++) {
                LocalDate check = today.minusDays(i);
                if (dates.contains(check.toString())) consecutive++;
                else break;
            }
            if (consecutive > FATIGUE_MAX_DAYS) {
                Map<String, Object> staff = staffByEmpNo.get(empNo);
                Map<String, Object> v = new HashMap<>();
                v.put("type", "EXCEED_CONTINUOUS");
                v.put("severity", "MEDIUM");
                v.put("staffName", staff != null ? staff.get("name") : empNo);
                v.put("description", (staff != null ? staff.get("name") : empNo) + " 连续工作 " + consecutive + " 天，超过阈值 " + FATIGUE_MAX_DAYS + " 天");
                v.put("suggestion", "安排休息一天");
                violations.add(v);
            }
        }

        // Check 3: EXCEED_WORK_HOURS
        Map<String, Integer> empScheduleCount = new HashMap<>();
        for (Map<String, Object> s : finalSchedules) {
            String empNo = String.valueOf(s.getOrDefault("employeeNo", s.getOrDefault("employee_no", "")));
            if (empNo.isEmpty()) continue;
            empScheduleCount.merge(empNo, 1, Integer::sum);
        }
        for (Map.Entry<String, Integer> entry : empScheduleCount.entrySet()) {
            int count = entry.getValue();
            if (count * 4 > MAX_DAILY_HOURS) {
                String empNo = entry.getKey();
                Map<String, Object> staff = staffByEmpNo.get(empNo);
                Map<String, Object> v = new HashMap<>();
                v.put("type", "EXCEED_WORK_HOURS");
                v.put("severity", "MEDIUM");
                v.put("staffName", staff != null ? staff.get("name") : empNo);
                v.put("description", (staff != null ? staff.get("name") : empNo) + " 当日排班 " + count + " 个，估算工时 " + (count * 4) + "h，超过上限 " + MAX_DAILY_HOURS + "h");
                v.put("suggestion", "减少该人员排班任务");
                violations.add(v);
            }
        }

        // Check 4: SAME_GROUP_CONCENTRATION - same flight, same group, >=2 staff
        Map<String, List<Map<String, Object>>> flightGroupMap = new HashMap<>();
        for (Map<String, Object> s : finalSchedules) {
            String flightNo = String.valueOf(s.getOrDefault("flightNo", ""));
            if (flightNo.isEmpty()) continue;
            String empNo = String.valueOf(s.getOrDefault("employeeNo", s.getOrDefault("employee_no", "")));
            Map<String, Object> staff = staffByEmpNo.get(empNo);
            if (staff == null) continue;
            String groupId = String.valueOf(staff.getOrDefault("group_id", ""));
            String key = flightNo + "_" + groupId;
            flightGroupMap.computeIfAbsent(key, k -> new ArrayList<>()).add(staff);
        }
        for (Map.Entry<String, List<Map<String, Object>>> entry : flightGroupMap.entrySet()) {
            if (entry.getValue().size() >= 2) {
                String[] parts = entry.getKey().split("_");
                String flightNo = parts[0];
                String groupId = parts.length > 1 ? parts[1] : "";
                List<String> names = entry.getValue().stream()
                    .map(s -> String.valueOf(s.get("name"))).toList();
                Map<String, Object> v = new HashMap<>();
                v.put("type", "SAME_GROUP_CONCENTRATION");
                v.put("severity", "LOW");
                v.put("staffName", String.join(", ", names));
                v.put("description", flightNo + " 有 " + entry.getValue().size() + " 名 " + groupId + " 人员同时排班");
                v.put("suggestion", "适当分散班组");
                violations.add(v);
            }
        }

        long highCount = violations.stream().filter(v -> "HIGH".equals(v.get("severity"))).count();
        long mediumCount = violations.stream().filter(v -> "MEDIUM".equals(v.get("severity"))).count();

        Map<String, Object> result = new HashMap<>();
        result.put("passed", violations.isEmpty());
        result.put("violations", violations);
        result.put("summary", Map.of("totalViolations", violations.size(), "highCount", highCount, "mediumCount", mediumCount));
        return result;
    }
}
