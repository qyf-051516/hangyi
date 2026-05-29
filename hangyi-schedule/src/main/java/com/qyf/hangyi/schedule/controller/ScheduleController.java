package com.qyf.hangyi.schedule.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.qyf.hangyi.common.result.R;
import com.qyf.hangyi.schedule.dto.MultiDayScheduleRequest;
import com.qyf.hangyi.schedule.dto.RoleScheduleRequest;
import com.qyf.hangyi.schedule.dto.ScheduleAutoRequest;
import com.qyf.hangyi.schedule.dto.ScheduleDetailVO;
import com.qyf.hangyi.schedule.dto.SmartScheduleRequest;
import com.qyf.hangyi.schedule.entity.Schedule;
import com.qyf.hangyi.schedule.entity.ScheduleDetail;
import com.qyf.hangyi.schedule.service.ScheduleService;
import com.qyf.hangyi.schedule.service.impl.SmartScheduleService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/schedules")
public class ScheduleController {

    @Autowired
    private ScheduleService scheduleService;

    @Autowired
    private SmartScheduleService smartScheduleService;

    @GetMapping("/list")
    public R<List<Schedule>> list() {
        return R.ok(scheduleService.list());
    }

    @GetMapping("/page")
    public R<Page<Schedule>> page(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) Long groupId,
            @RequestParam(required = false) Integer status) {
        return R.ok(scheduleService.pageQuery(page, size, groupId, status));
    }

    /**
     * 智能自动排班
     */
    @PostMapping("/auto")
    @PreAuthorize("hasRole('ADMIN') or hasRole('TEAM_LEADER')")
    public R<Schedule> autoSchedule(@Valid @RequestBody ScheduleAutoRequest request) {
        // 从 SecurityContext 取 userId (由网关通过 HeaderAuthFilter 设置)
        var auth = SecurityContextHolder.getContext().getAuthentication();
        Long userId = Long.valueOf(auth.getName());

        Schedule schedule = scheduleService.autoScheduleAndSave(
                request.getGroupId(), request.getStartDate(), request.getEndDate(), userId);
        return R.ok(schedule);
    }

    /**
     * 获取排班详情
     */
    @GetMapping("/{id}/details")
    public R<List<ScheduleDetail>> details(@PathVariable Long id) {
        return R.ok(scheduleService.getScheduleDetails(id));
    }

    /**
     * 按日期查询排班
     */
    @GetMapping("/by-date")
    public R<List<ScheduleDetail>> byDate(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam(required = false) Long groupId) {
        return R.ok(scheduleService.getDetailsByDate(date, groupId));
    }

    /**
     * 甘特图数据：包含员工信息、班次信息、航班、资质
     */
    @GetMapping("/gantt")
    public R<List<ScheduleDetailVO>> gantt(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam(required = false) Long groupId) {
        return R.ok(scheduleService.getGanttData(date, groupId));
    }

    /**
     * 甘特图数据（日期范围）
     */
    @GetMapping("/gantt-range")
    public R<List<ScheduleDetailVO>> ganttRange(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @RequestParam(required = false) Long groupId) {
        return R.ok(scheduleService.getGanttDataRange(startDate, endDate, groupId));
    }

    @PutMapping("/{id}/publish")
    @PreAuthorize("hasRole('ADMIN')")
    public R<Void> publish(@PathVariable Long id) {
        Schedule s = scheduleService.getById(id);
        if (s == null) return R.fail("排班不存在");
        s.setStatus(1); // 已发布
        scheduleService.updateById(s);
        return R.ok();
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public R<Void> delete(@PathVariable Long id) {
        scheduleService.removeById(id);
        return R.ok();
    }

    @GetMapping("/count")
    public R<Long> getCount() {
        return R.ok(scheduleService.count());
    }

    @GetMapping("/stats/today")
    public R<Map<String, Object>> getTodayStats() {
        LocalDate today = LocalDate.now();
        int onDuty = scheduleService.countOnDutyToday(today);
        return R.ok(Map.of("todayOnDuty", onDuty));
    }

    @PostMapping("/smart")
    public R<Map<String, Object>> smartSchedule(@Valid @RequestBody SmartScheduleRequest req) {
        return R.ok(smartScheduleService.smartSchedule(req));
    }

    @PostMapping("/smart-multi-day")
    public R<Map<String, Object>> smartScheduleMultiDay(@Valid @RequestBody MultiDayScheduleRequest req) {
        return R.ok(smartScheduleService.smartScheduleMultiDay(req));
    }

    @PostMapping("/smart-roles")
    public R<Map<String, Object>> smartScheduleWithRoles(@Valid @RequestBody RoleScheduleRequest req) {
        return R.ok(smartScheduleService.smartScheduleWithRoles(req));
    }

    @PostMapping("/optimize")
    public R<Map<String, Object>> optimizeStaffSchedule(@RequestBody Map<String, Object> payload) {
        return R.ok(smartScheduleService.optimizeStaffSchedule(payload));
    }

    @PostMapping("/import-tsv")
    public R<Map<String, Object>> importScheduleFromTSV(@RequestBody Map<String, String> body) {
        return R.ok(smartScheduleService.importFromTSV(body.get("tsvContent"), body.get("scheduleDate")));
    }

    @PostMapping("/{id}/complete")
    public R<Void> completeSchedule(@PathVariable Long id) {
        smartScheduleService.completeSchedule(id);
        return R.ok();
    }

    @GetMapping("/history")
    public R<List<Map<String, Object>>> getScheduleHistory(
            @RequestParam String scheduleDate) {
        return R.ok(smartScheduleService.getScheduleHistory(scheduleDate));
    }
}
