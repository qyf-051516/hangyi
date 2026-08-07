package com.qyf.hangyi.core.statistics.dashboard;

import com.qyf.hangyi.common.result.R;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {

    private static final Logger log = LoggerFactory.getLogger(DashboardController.class);

    @Autowired
    private JdbcTemplate jdbc;

    @GetMapping("/health")
    public R<Map<String, Object>> health() {
        Map<String, Object> result = new HashMap<>();

        // 1. 后端服务 — 控制器能响应就算 UP
        result.put("backend", probe("UP", "RUNNING", null, null));

        // 2. 数据库 — SELECT 1
        try {
            jdbc.queryForObject("SELECT 1", Integer.class);
            result.put("database", probe("UP", "CONNECTED", null, null));
        } catch (Exception e) {
            log.warn("Dashboard database health check failed", e);
            result.put("database", probe("DOWN", null, null, "数据库检查失败"));
        }

        // 3. 排班服务 — 通过是否能查 schedule 表判断
        //    (所有服务共享同一 MySQL，schedule 表存在 = 排班数据可读写)
        try {
            jdbc.queryForObject("SELECT COUNT(*) FROM schedule", Long.class);
            result.put("scheduler", probe("UP", "READY", null, null));
        } catch (Exception e) {
            log.warn("Dashboard scheduler health check failed", e);
            result.put("scheduler", probe("DOWN", null, null, "排班数据检查失败"));
        }


        return R.ok(result);
    }

    /**
     * 构造健康项。前端 renderHealthItem 兼容 UP/OK/RUNNING/READY/HEALTHY/CONNECTED/AVAILABLE
     * 走"正常"绿色通道；DOWN/ERROR/FAILED 走"异常"红；DEGRADED/WARN 走"降级"黄。
     * 字段：status（主语义）、display（可读文案，可选）、detail（异常时详情，可选）
     */
    private Map<String, Object> probe(String status, String display, String level, String detail) {
        Map<String, Object> item = new HashMap<>();
        item.put("status", status);
        if (display != null) item.put("display", display);
        if (detail != null) item.put("detail", detail);
        return item;
    }

    @GetMapping("/stats")
    public R<Map<String, Object>> stats() {
        Map<String, Object> stats = new HashMap<>();
        String today = LocalDate.now().toString();

        try {
            Long total = jdbc.queryForObject("SELECT COUNT(*) FROM employee WHERE status = 1", Long.class);
            stats.put("totalEmployees", total != null ? total : 0);
        } catch (Exception e) { stats.put("totalEmployees", 0L); }

        try {
            Long onDuty = jdbc.queryForObject(
                """
                SELECT COUNT(DISTINCT employee_id)
                FROM schedule_detail
                WHERE work_date = ?
                  AND (record_status IS NULL OR record_status = 'active')
                """, Long.class, today);
            stats.put("todayOnDuty", onDuty != null ? onDuty : 0);
        } catch (Exception e) { stats.put("todayOnDuty", 0); }

        try {
            Long flights = jdbc.queryForObject(
                "SELECT COUNT(*) FROM flight_plan WHERE plan_date = ?", Long.class, today);
            stats.put("todayFlights", flights != null ? flights : 0);
        } catch (Exception e) { stats.put("todayFlights", 0L); }

        try {
            Long schedCount = jdbc.queryForObject(
                "SELECT COUNT(DISTINCT schedule_id) FROM schedule_detail", Long.class);
            stats.put("scheduleCount", schedCount != null ? schedCount : 0);
        } catch (Exception e) { stats.put("scheduleCount", 0L); }

        try {
            Long pendingLeave = jdbc.queryForObject(
                "SELECT COUNT(*) FROM leave_request WHERE status = 0", Long.class);
            stats.put("pendingLeaveCount", pendingLeave != null ? pendingLeave : 0);
        } catch (Exception e) { stats.put("pendingLeaveCount", 0L); }

        Map<String, Long> todayShiftCount = new LinkedHashMap<>();
        try {
            List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT
                    COALESCE(NULLIF(st.shift_name, ''), NULLIF(sd.shift_group, ''), '未分配班次') AS shift_name,
                    COUNT(DISTINCT sd.employee_id) AS employee_count
                FROM schedule_detail sd
                LEFT JOIN shift_template st ON st.id = sd.shift_id
                WHERE sd.work_date = ?
                  AND (sd.record_status IS NULL OR sd.record_status = 'active')
                GROUP BY COALESCE(NULLIF(st.shift_name, ''), NULLIF(sd.shift_group, ''), '未分配班次')
                ORDER BY employee_count DESC, shift_name
                """, today);
            for (Map<String, Object> row : rows) {
                Object count = row.get("employee_count");
                todayShiftCount.put(
                        String.valueOf(row.get("shift_name")),
                        count instanceof Number number ? number.longValue() : 0L);
            }
        } catch (Exception ignored) {
            // 单项统计失败不影响其余概览数据。
        }
        stats.put("todayShiftCount", todayShiftCount);

        return R.ok(stats);
    }
}
