package com.qyf.hangyi.flight.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.qyf.hangyi.common.result.R;
import com.qyf.hangyi.flight.entity.FlightPlan;
import com.qyf.hangyi.flight.mapper.FlightPlanMapper;
import com.qyf.hangyi.flight.service.FlightSyncService;
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

    /**
     * 手动同步航班数据
     */
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
        return R.ok();
    }

    @PutMapping
    @PreAuthorize("hasRole('ADMIN')")
    public R<Void> update(@RequestBody FlightPlan flight) {
        flightPlanMapper.updateById(flight);
        return R.ok();
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public R<Void> delete(@PathVariable Long id) {
        flightPlanMapper.deleteById(id);
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
