package com.qyf.hangyi.schedule.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.qyf.hangyi.common.sync.GuochuangSyncClient;
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

    @Autowired
    private GuochuangSyncClient guochuangSyncClient;

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

    @PostMapping("/auto")
    @PreAuthorize("hasRole('ADMIN') or hasRole('TEAM_LEADER')")
    public R<Schedule> autoSchedule(@Valid @RequestBody ScheduleAutoRequest request) {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        Long userId = Long.valueOf(auth.getName());

        Schedule schedule = scheduleService.autoScheduleAndSave(
                request.getGroupId(), request.getStartDate(), request.getEndDate(), userId);
        guochuangSyncClient.enqueuePush("schedules", Map.of(
            "scheduleDate", schedule.getStartDate() != null ? schedule.getStartDate().toString() : "",
            "scheduleId", schedule.getId() != null ? schedule.getId().toString() : "",
            "updatedAt", new java.util.Date().toString()
        ));
        return R.ok(schedule);
    }

    @GetMapping("/{id}/details")
    public R<List<ScheduleDetail>> details(@PathVariable Long id) {
        return R.ok(scheduleService.getScheduleDetails(id));
    }

    @GetMapping("/{id}")
    public R<Schedule> getById(@PathVariable Long id) {
        Schedule s = scheduleService.getById(id);
        if (s == null) return R.notFound("排班不存在");
        return R.ok(s);
    }

    @GetMapping("/by-date")
    public R<List<ScheduleDetail>> byDate(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam(required = false) Long groupId) {
        return R.ok(scheduleService.getDetailsByDate(date, groupId));
    }

    @GetMapping("/gantt")
    public R<List<ScheduleDetailVO>> gantt(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam(required = false) Long groupId) {
        return R.ok(scheduleService.getGanttData(date, groupId));
    }

    @GetMapping("/gantt-range")
    public R<List<ScheduleDetailVO>> ganttRange(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @RequestParam(required = false) Long groupId) {
        return R.ok(scheduleService.getGanttDataRange(startDate, endDate, groupId));
    }

    @PutMapping("/{id}/publish")
    @PreAuthorize("hasRole('ADMIN')")
    public R<Void> publish(@PathVariable Long id,
                           @RequestParam(required = false) Integer version) {
        scheduleService.publishDraft(id, version);
        guochuangSyncClient.enqueuePush("schedules", Map.of(
            "scheduleId", id.toString(),
            "status", "PUBLISHED",
            "updatedAt", new java.util.Date().toString()
        ));
        return R.ok();
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public R<Void> delete(@PathVariable Long id) {
        Schedule s = scheduleService.getById(id);
        if (s == null) return R.notFound("排班不存在");
        if (s.getStatus() != null && s.getStatus() != 0) {
            return R.badRequest("只能删除草稿状态的排班");
        }
        scheduleService.deleteScheduleWithDetails(id);
        guochuangSyncClient.enqueuePush("schedules", Map.of(
            "_id", id.toString(),
            "deleted", true,
            "updatedAt", new java.util.Date().toString()
        ));
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
        Map<String, Object> result = smartScheduleService.smartSchedule(req);
        guochuangSyncClient.enqueuePush("schedules", Map.of(
            "scheduleDate", req.getScheduleDate() != null ? req.getScheduleDate().toString() : "",
            "updatedAt", new java.util.Date().toString()
        ));
        return R.ok(result);
    }

    @PostMapping("/smart-multi-day")
    public R<Map<String, Object>> smartScheduleMultiDay(@Valid @RequestBody MultiDayScheduleRequest req) {
        Map<String, Object> result = smartScheduleService.smartScheduleMultiDay(req);
        guochuangSyncClient.enqueuePush("schedules", Map.of(
            "updatedAt", new java.util.Date().toString()
        ));
        return R.ok(result);
    }

    @PostMapping("/smart-roles")
    public R<Map<String, Object>> smartScheduleWithRoles(@Valid @RequestBody RoleScheduleRequest req) {
        Map<String, Object> result = smartScheduleService.smartScheduleWithRoles(req);
        guochuangSyncClient.enqueuePush("schedules", Map.of(
            "updatedAt", new java.util.Date().toString()
        ));
        return R.ok(result);
    }

    @PostMapping("/optimize")
    public R<Map<String, Object>> optimizeStaffSchedule(@RequestBody Map<String, Object> payload) {
        Map<String, Object> result = smartScheduleService.optimizeStaffSchedule(payload);
        guochuangSyncClient.enqueuePush("schedules", Map.of(
            "updatedAt", new java.util.Date().toString()
        ));
        return R.ok(result);
    }

    @PostMapping("/import-tsv")
    public R<Map<String, Object>> importScheduleFromTSV(@RequestBody Map<String, String> body) {
        Map<String, Object> result = smartScheduleService.importFromTSV(body.get("tsvContent"), body.get("scheduleDate"));
        guochuangSyncClient.enqueuePush("schedules", Map.of(
            "scheduleDate", body.getOrDefault("scheduleDate", ""),
            "updatedAt", new java.util.Date().toString()
        ));
        return R.ok(result);
    }

    @PostMapping("/{id}/complete")
    public R<Void> completeSchedule(@PathVariable Long id) {
        smartScheduleService.completeSchedule(id);
        guochuangSyncClient.enqueuePush("schedules", Map.of(
            "scheduleId", id.toString(),
            "status", "COMPLETED",
            "updatedAt", new java.util.Date().toString()
        ));
        return R.ok();
    }

    @GetMapping("/history")
    public R<Map<String, Object>> getScheduleHistory(
            @RequestParam String scheduleDate) {
        return R.ok(smartScheduleService.getScheduleHistoryFull(scheduleDate));
    }
}
