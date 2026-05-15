package com.qyf.hangyi.dashboard.controller;

import com.qyf.hangyi.common.result.R;
import com.qyf.hangyi.dashboard.client.EmployeeFeignClient;
import com.qyf.hangyi.dashboard.client.FlightFeignClient;
import com.qyf.hangyi.dashboard.client.LeaveFeignClient;
import com.qyf.hangyi.dashboard.client.ScheduleFeignClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {

    @Autowired
    private EmployeeFeignClient employeeFeignClient;

    @Autowired
    private ScheduleFeignClient scheduleFeignClient;

    @Autowired
    private FlightFeignClient flightFeignClient;

    @Autowired
    private LeaveFeignClient leaveFeignClient;

    @GetMapping("/stats")
    public R<Map<String, Object>> stats() {
        Map<String, Object> stats = new HashMap<>();

        // Aggregate employee stats
        try {
            R<Map<String, Object>> empResp = employeeFeignClient.getStats();
            if (empResp != null && empResp.getData() != null) {
                stats.putAll(empResp.getData());
            }
            R<Long> countResp = employeeFeignClient.getCount();
            if (countResp != null && countResp.getData() != null) {
                stats.put("totalEmployees", countResp.getData());
            }
        } catch (Exception e) {
            stats.put("totalEmployees", 0L);
            stats.put("activeEmployees", 0L);
        }

        // Aggregate schedule stats
        try {
            R<Map<String, Object>> schedResp = scheduleFeignClient.getTodayStats();
            if (schedResp != null && schedResp.getData() != null) {
                stats.putAll(schedResp.getData());
            }
            R<Long> schedCountResp = scheduleFeignClient.getCount();
            if (schedCountResp != null && schedCountResp.getData() != null) {
                stats.put("scheduleCount", schedCountResp.getData());
            }
        } catch (Exception e) {
            stats.put("todayOnDuty", 0);
            stats.put("scheduleCount", 0L);
        }

        // Aggregate flight stats
        try {
            R<Map<String, Object>> flightResp = flightFeignClient.getTodayStats();
            if (flightResp != null && flightResp.getData() != null) {
                stats.putAll(flightResp.getData());
            }
        } catch (Exception e) {
            stats.put("todayFlights", 0L);
        }

        // Aggregate leave stats
        try {
            R<Map<String, Object>> leaveResp = leaveFeignClient.getPendingStats();
            if (leaveResp != null && leaveResp.getData() != null) {
                stats.putAll(leaveResp.getData());
            }
        } catch (Exception e) {
            stats.put("pendingLeaveCount", 0L);
        }

        return R.ok(stats);
    }
}
