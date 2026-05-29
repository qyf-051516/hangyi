package com.qyf.hangyi.statistics.controller;

import com.qyf.hangyi.common.result.R;
import com.qyf.hangyi.statistics.service.StatisticsService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/statistics")
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
            @RequestParam(required = false) Long groupId,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        return R.ok(statisticsService.getStatusOverview(groupId, startDate, endDate));
    }
}
