package com.qyf.hangyi.core.flight.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.qyf.hangyi.common.exception.BusinessException;
import com.qyf.hangyi.common.sync.GuochuangSyncClient;
import com.qyf.hangyi.common.result.R;
import com.qyf.hangyi.core.flight.entity.FlightPlan;
import com.qyf.hangyi.core.flight.mapper.FlightPlanMapper;
import com.qyf.hangyi.core.flight.service.FlightSyncService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/flights")
public class FlightPlanController {

    @Autowired
    private FlightPlanMapper flightPlanMapper;

    @Autowired
    private FlightSyncService flightSyncService;

    @Autowired
    private GuochuangSyncClient guochuangSyncClient;

    @GetMapping("/page")
    public R<Page<FlightPlan>> page(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam(required = false) String flightNo) {
        return R.ok(flightPlanMapper.selectPage(new Page<>(page, size),
                new LambdaQueryWrapper<FlightPlan>()
                        .eq(date != null, FlightPlan::getPlanDate, date)
                        .like(flightNo != null && !flightNo.isEmpty(), FlightPlan::getFlightNo, flightNo)
                        .orderByAsc(FlightPlan::getPlanDate, FlightPlan::getPlanTime)));
    }

    @PostMapping("/sync")
    @PreAuthorize("hasRole('ADMIN')")
    public R<Map<String, Object>> sync(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        int count = flightSyncService.syncFlights(date);
        return R.ok(Map.of("date", date.toString(), "count", count));
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public R<Void> create(@Valid @RequestBody FlightPlan flight) {
        flightPlanMapper.insert(flight);
        guochuangSyncClient.enqueuePush("flights", Map.of(
            "flightNo", flight.getFlightNo() != null ? flight.getFlightNo() : "",
            "scheduleDate", flight.getPlanDate() != null ? flight.getPlanDate().toString() : "",
            "updatedAt", new java.util.Date().toString()
        ));
        return R.ok();
    }

    @PutMapping
    @PreAuthorize("hasRole('ADMIN')")
    public R<Void> update(@Valid @RequestBody FlightPlan flight) {
        if (flight.getId() == null) {
            throw new BusinessException(400, "航班ID不能为空");
        }
        if (flightPlanMapper.selectById(flight.getId()) == null) {
            throw new BusinessException(404, "航班不存在");
        }
        flightPlanMapper.updateById(flight);
        guochuangSyncClient.enqueuePush("flights", Map.of(
            "flightNo", flight.getFlightNo() != null ? flight.getFlightNo() : "",
            "scheduleDate", flight.getPlanDate() != null ? flight.getPlanDate().toString() : "",
            "updatedAt", new java.util.Date().toString()
        ));
        return R.ok();
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public R<Void> delete(@PathVariable Long id) {
        if (flightPlanMapper.deleteById(id) == 0) {
            throw new BusinessException(404, "航班不存在");
        }
        guochuangSyncClient.enqueuePush("flights", Map.of(
            "_id", id.toString(),
            "deleted", true,
            "updatedAt", new java.util.Date().toString()
        ));
        return R.ok();
    }

    @GetMapping("/stats/today")
    public R<Map<String, Object>> getTodayStats() {
        LocalDate today = LocalDate.now();
        long count = flightPlanMapper.selectCount(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<FlightPlan>()
                        .eq(FlightPlan::getPlanDate, today));
        Map<String, Object> stats = new HashMap<>();
        stats.put("todayFlights", count);
        return R.ok(stats);
    }
}
