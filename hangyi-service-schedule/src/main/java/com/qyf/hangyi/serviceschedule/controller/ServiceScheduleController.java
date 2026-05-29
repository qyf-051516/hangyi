package com.qyf.hangyi.serviceschedule.controller;

import com.qyf.hangyi.common.result.R;
import com.qyf.hangyi.serviceschedule.service.ServiceScheduleService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/service-schedules")
public class ServiceScheduleController {

    @Autowired
    private ServiceScheduleService serviceScheduleService;

    @GetMapping
    public R<Map<String, Object>> getTable(@RequestParam(required = false) String scheduleDate) {
        return R.ok(serviceScheduleService.getServiceScheduleTable(scheduleDate));
    }

    @PostMapping("/publish")
    public R<Map<String, Object>> publish(@RequestBody Map<String, Object> payload) {
        return R.ok(serviceScheduleService.publishServiceSchedule(payload));
    }
}
