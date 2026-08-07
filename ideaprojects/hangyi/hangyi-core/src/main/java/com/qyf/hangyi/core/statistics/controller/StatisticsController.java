package com.qyf.hangyi.core.statistics.controller;

import com.qyf.hangyi.common.result.R;
import com.qyf.hangyi.core.statistics.service.StatisticsService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import jakarta.validation.constraints.Min;

import java.util.Map;

@RestController
@RequestMapping("/api/statistics")
@org.springframework.validation.annotation.Validated
public class StatisticsController {

    @Autowired
    private StatisticsService statisticsService;

    @GetMapping("/schedules")
    public R<Map<String, Object>> getScheduleStatistics(
            @RequestParam(required = false) String scheduleDate) {
        return R.ok(statisticsService.getScheduleStatistics(scheduleDate));
    }

    @GetMapping("/status-overview")
    public R<Map<String, Object>> getScheduleStatusOverview(
            @RequestParam(required = false) @Min(1) Long groupId,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        return R.ok(statisticsService.getStatusOverview(groupId, startDate, endDate));
    }

    @GetMapping("/pending-employees")
    public R<java.util.List<Map<String, Object>>> getPendingEmployees(
            @RequestParam(required = false) @Min(1) Long groupId,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        return R.ok(statisticsService.getPendingEmployees(groupId, startDate, endDate));
    }
}
