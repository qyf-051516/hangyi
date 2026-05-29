package com.qyf.hangyi.auth.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.qyf.hangyi.auth.entity.*;
import com.qyf.hangyi.auth.mapper.*;
import com.qyf.hangyi.common.result.R;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/reports/guochuang")
public class ReportController {

    @Autowired private RptStaffMapper rptStaffMapper;
    @Autowired private RptFlightMapper rptFlightMapper;
    @Autowired private RptScheduleMapper rptScheduleMapper;
    @Autowired private RptSwapRequestMapper rptSwapRequestMapper;
    @Autowired private RptSyncLogMapper rptSyncLogMapper;

    @GetMapping("/staff-summary")
    public R<Map<String, Object>> staffSummary() {
        List<RptStaff> all = rptStaffMapper.selectList(null);
        long activeCount = all.stream().filter(s -> Boolean.TRUE.equals(s.getActive())).count();
        Map<String, Long> byGroup = all.stream()
                .filter(s -> Boolean.TRUE.equals(s.getActive()))
                .collect(Collectors.groupingBy(
                    s -> s.getGroupId() != null ? s.getGroupId() : "未分组",
                    Collectors.counting()));
        Map<String, Long> byRole = all.stream()
                .filter(s -> Boolean.TRUE.equals(s.getActive()))
                .collect(Collectors.groupingBy(
                    s -> s.getRoleType() != null ? s.getRoleType() : "未知",
                    Collectors.counting()));

        return R.ok(Map.of(
            "totalCount", all.size(),
            "activeCount", activeCount,
            "byGroup", byGroup,
            "byRole", byRole
        ));
    }

    @GetMapping("/daily-schedule")
    public R<Map<String, Object>> dailySchedule(@RequestParam(required = false) String date) {
        String queryDate = date != null ? date : LocalDate.now().toString();
        List<RptSchedule> schedules = rptScheduleMapper.selectList(
            new LambdaQueryWrapper<RptSchedule>().eq(RptSchedule::getScheduleDate, queryDate));

        long assignedCount = schedules.stream()
                .filter(s -> "ASSIGNED".equals(s.getStatus())).count();
        long completedCount = schedules.stream()
                .filter(s -> "COMPLETED".equals(s.getStatus())).count();

        return R.ok(Map.of(
            "date", queryDate,
            "totalSchedules", schedules.size(),
            "assignedCount", assignedCount,
            "completedCount", completedCount,
            "schedules", schedules
        ));
    }

    @GetMapping("/swap-stats")
    public R<Map<String, Object>> swapStats() {
        List<RptSwapRequest> all = rptSwapRequestMapper.selectList(null);
        long pending = all.stream().filter(s -> "PENDING".equals(s.getStatus())).count();
        long approved = all.stream().filter(s -> "APPROVED".equals(s.getStatus())).count();
        long rejected = all.stream().filter(s -> "REJECTED".equals(s.getStatus())).count();

        return R.ok(Map.of(
            "total", all.size(),
            "pending", pending,
            "approved", approved,
            "rejected", rejected
        ));
    }

    @GetMapping("/sync-status")
    public R<List<RptSyncLog>> syncStatus() {
        List<RptSyncLog> logs = rptSyncLogMapper.selectList(
            new LambdaQueryWrapper<RptSyncLog>()
                .orderByDesc(RptSyncLog::getCreatedAt)
                .last("LIMIT 50"));
        return R.ok(logs);
    }
}
