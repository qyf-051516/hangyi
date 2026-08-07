package com.qyf.hangyi.core.statistics.service.impl;

import com.qyf.hangyi.core.statistics.service.StatisticsService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.*;

@Service
public class StatisticsServiceImpl implements StatisticsService {

    @Autowired
    private JdbcTemplate jdbc;

    @Override
    public Map<String, Object> getScheduleStatistics(String scheduleDate) {
        String today = scheduleDate != null ? scheduleDate : LocalDate.now().toString();
        String weekAgo = LocalDate.parse(today).minusDays(7).toString();

        // 1. Group load comparison
        List<Map<String, Object>> groupStats = jdbc.queryForList(
                "SELECT e.group_id, tg.group_name, COUNT(DISTINCT e.id) as staff_count, " +
                        "COUNT(sd.id) as task_count " +
                        "FROM employee e LEFT JOIN team_group tg ON e.group_id = tg.id " +
                        "LEFT JOIN schedule_detail sd ON e.id = sd.employee_id " +
                        "AND sd.work_date = ? AND (sd.record_status IS NULL OR sd.record_status = 'active') " +
                        "WHERE e.status = 1 GROUP BY e.group_id, tg.group_name", today);
        for (Map<String, Object> row : groupStats) {
            int sc = ((Number) row.get("staff_count")).intValue();
            int tc = ((Number) row.get("task_count")).intValue();
            row.put("avgTasksPerStaff", sc > 0 ? Math.round(tc * 10.0 / sc) / 10.0 : 0);
            row.put("utilization", sc > 0 ? Math.round(tc * 100.0 / (sc * 3)) : 0);
        }

        // 2. Staff utilization
        List<Map<String, Object>> staffUtil = jdbc.queryForList(
                "SELECT e.id, e.name, e.emp_no, e.group_id, " +
                        "COUNT(sd.id) as task_count, " +
                        "(SELECT COUNT(*) FROM schedule_detail WHERE employee_id = e.id AND work_date >= ? " +
                        "AND (record_status IS NULL OR record_status = 'active')) as week_count " +
                        "FROM employee e LEFT JOIN schedule_detail sd ON e.id = sd.employee_id " +
                        "AND sd.work_date = ? AND (sd.record_status IS NULL OR sd.record_status = 'active') " +
                        "WHERE e.status = 1 " +
                        "GROUP BY e.id, e.name, e.emp_no, e.group_id ORDER BY task_count DESC", weekAgo, today);
        for (Map<String, Object> row : staffUtil) {
            int tc = ((Number) row.get("task_count")).intValue();
            int wc = ((Number) row.get("week_count")).intValue();
            int fatigue = Math.min(100, tc * 15 + Math.max(0, wc - 3) * 8);
            row.put("fatigueScore", fatigue);
            row.put("fatigueRisk", fatigue >= 70 ? "high" : fatigue >= 40 ? "medium" : "low");
            row.put("effectiveMinutes", tc * 30);
        }

        // 3. Qualification coverage
        List<Map<String, Object>> qualStats = jdbc.queryForList(
                "SELECT eq.aircraft_type_id, at.type_name as aircraft_type, " +
                        "COUNT(DISTINCT eq.employee_id) as qualified_count, " +
                        "(SELECT COUNT(*) FROM employee WHERE status = 1) as total_staff " +
                        "FROM employee_qualification eq " +
                        "LEFT JOIN aircraft_type at ON eq.aircraft_type_id = at.id " +
                        "GROUP BY eq.aircraft_type_id, at.type_name");
        for (Map<String, Object> row : qualStats) {
            int qc = ((Number) row.get("qualified_count")).intValue();
            int ts = ((Number) row.get("total_staff")).intValue();
            row.put("coverageRate", ts > 0 ? Math.round(qc * 100.0 / ts) : 0);
        }

        // 4. Night shift distribution (last 7 days)
        List<Map<String, Object>> nightDist = new ArrayList<>();
        for (int i = 6; i >= 0; i--) {
            String d = LocalDate.parse(today).minusDays(i).toString();
            List<Map<String, Object>> dayData = jdbc.queryForList(
                    "SELECT shift_group, COUNT(*) cnt FROM schedule_detail " +
                            "WHERE work_date = ? AND (record_status IS NULL OR record_status = 'active') " +
                            "GROUP BY shift_group", d);
            int total = 0, night = 0, morning = 0, afternoon = 0;
            for (Map<String, Object> row : dayData) {
                int c = ((Number) row.get("cnt")).intValue();
                total += c;
                String sg = String.valueOf(row.get("shift_group"));
                if ("NIGHT".equals(sg)) night = c;
                else if ("MORNING".equals(sg)) morning = c;
                else afternoon += c;
            }
            Map<String, Object> entry = new HashMap<>();
            entry.put("date", d);
            entry.put("total", total);
            entry.put("night", night);
            entry.put("morning", morning);
            entry.put("afternoon", afternoon);
            entry.put("nightRate", total > 0 ? Math.round(night * 100.0 / total) : 0);
            nightDist.add(entry);
        }

        Map<String, Object> result = new HashMap<>();
        result.put("groupStats", groupStats);
        result.put("staffUtilization", staffUtil);
        result.put("qualificationStats", qualStats);
        result.put("nightDistribution", nightDist);
        return result;
    }

    @Override
    public Map<String, Object> getStatusOverview(Long groupId, String startDate, String endDate) {
        // 强类型 LocalDate 解析，无效输入直接抛 400（避免 SQL 注入 + 日期格式错误）
        LocalDate start = (startDate != null && !startDate.isBlank())
                ? LocalDate.parse(startDate) : LocalDate.now().minusDays(30);
        LocalDate end = (endDate != null && !endDate.isBlank())
                ? LocalDate.parse(endDate) : LocalDate.now();

        StringBuilder sql = new StringBuilder(
                "SELECT sd.work_date, COUNT(*) total, " +
                        "SUM(CASE WHEN sd.schedule_type = 'COMPLETED' THEN 1 ELSE 0 END) completed " +
                        "FROM schedule_detail sd ");
        List<Object> params = new ArrayList<>();
        if (groupId != null) {
            sql.append("JOIN employee e ON sd.employee_id = e.id AND e.group_id = ? ");
            params.add(groupId);
        }
        sql.append("WHERE sd.work_date BETWEEN ? AND ? " +
                "AND (sd.record_status IS NULL OR sd.record_status = 'active') " +
                "GROUP BY sd.work_date ORDER BY sd.work_date");
        params.add(start);
        params.add(end);

        List<Map<String, Object>> dailyBreakdown = jdbc.queryForList(sql.toString(), params.toArray());
        long total = 0, completed = 0;
        for (Map<String, Object> row : dailyBreakdown) {
            long t = ((Number) row.get("total")).longValue();
            long c = ((Number) row.get("completed")).longValue();
            total += t;
            completed += c;
            row.put("pending", t - c);
        }

        Map<String, Object> result = new HashMap<>();
        result.put("dateRange", Map.of("start", start, "end", end));
        result.put("groupId", groupId);
        result.put("total", total);
        result.put("completed", completed);
        result.put("pending", total - completed);
        result.put("completedRate", total > 0 ? String.format("%.1f", completed * 100.0 / total) : "0.0");
        result.put("pendingRate", total > 0 ? String.format("%.1f", (total - completed) * 100.0 / total) : "0.0");
        result.put("dailyBreakdown", dailyBreakdown);
        return result;
    }

    @Override
    public java.util.List<Map<String, Object>> getPendingEmployees(Long groupId, String startDate, String endDate) {
        String start = startDate != null ? startDate : java.time.LocalDate.now().minusDays(30).toString();
        String end = endDate != null ? endDate : java.time.LocalDate.now().toString();

        StringBuilder sql = new StringBuilder(
            "SELECT e.id, e.name, e.emp_no, e.phone, e.group_id, tg.group_name, " +
            "sd.work_date, sd.shift_group, sd.schedule_type, " +
            "COALESCE(st.shift_name, '未知') as shift_name " +
            "FROM schedule_detail sd " +
            "JOIN employee e ON sd.employee_id = e.id " +
            "LEFT JOIN team_group tg ON e.group_id = tg.id " +
            "LEFT JOIN shift_template st ON sd.shift_id = st.id " +
            "WHERE sd.work_date BETWEEN ? AND ? " +
            "AND (sd.record_status IS NULL OR sd.record_status = 'active') " +
            "AND (sd.schedule_type IS NULL OR sd.schedule_type <> 'COMPLETED') ");
        java.util.List<Object> params = new java.util.ArrayList<>();
        params.add(start);
        params.add(end);

        if (groupId != null) {
            sql.append("AND e.group_id = ?");
            params.add(groupId);
        }
        sql.append(" ORDER BY sd.work_date DESC, e.name");

        List<Map<String, Object>> employees = jdbc.queryForList(sql.toString(), params.toArray());
        employees.forEach(employee -> employee.put("phone", maskPhone(employee.get("phone"))));
        return employees;
    }

    private String maskPhone(Object value) {
        if (value == null) {
            return null;
        }
        String phone = value.toString().trim();
        if (phone.isEmpty()) {
            return null;
        }
        if (phone.length() <= 7) {
            return phone.substring(0, Math.min(3, phone.length())) + "****";
        }
        return phone.substring(0, 3) + "****" + phone.substring(phone.length() - 4);
    }
}
