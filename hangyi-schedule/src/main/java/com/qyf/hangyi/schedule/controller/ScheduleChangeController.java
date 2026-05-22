package com.qyf.hangyi.schedule.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.qyf.hangyi.common.result.R;
import com.qyf.hangyi.schedule.entity.ScheduleChange;
import com.qyf.hangyi.schedule.mapper.ScheduleChangeMapper;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/schedule-changes")
public class ScheduleChangeController {

    @Autowired
    private ScheduleChangeMapper scheduleChangeMapper;

    @GetMapping("/page")
    public R<Page<ScheduleChange>> page(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) Long employeeId,
            @RequestParam(required = false) Integer status) {
        return R.ok(scheduleChangeMapper.selectPage(new Page<>(page, size),
                new LambdaQueryWrapper<ScheduleChange>()
                        .eq(employeeId != null, ScheduleChange::getEmployeeId, employeeId)
                        .eq(status != null, ScheduleChange::getStatus, status)
                        .orderByDesc(ScheduleChange::getCreatedAt)));
    }

    @PostMapping
    public R<Void> create(@Valid @RequestBody ScheduleChange change) {
        scheduleChangeMapper.insert(change);
        return R.ok();
    }

    @PutMapping("/{id}/approve")
    @PreAuthorize("hasRole('ADMIN') or hasRole('TEAM_LEADER')")
    public R<Void> approve(@PathVariable Long id,
                           @RequestParam Integer status,
                           @RequestParam(required = false) String remark) {
        ScheduleChange change = scheduleChangeMapper.selectById(id);
        if (change == null) return R.fail("调班申请不存在");
        change.setStatus(status);
        change.setApproveRemark(remark);
        scheduleChangeMapper.updateById(change);
        return R.ok();
    }
}
