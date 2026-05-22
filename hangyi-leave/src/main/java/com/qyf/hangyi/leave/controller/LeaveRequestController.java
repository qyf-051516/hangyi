package com.qyf.hangyi.leave.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.qyf.hangyi.common.result.R;
import com.qyf.hangyi.leave.entity.LeaveRequest;
import com.qyf.hangyi.leave.mapper.LeaveRequestMapper;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/leaves")
public class LeaveRequestController {

    @Autowired
    private LeaveRequestMapper leaveRequestMapper;

    @GetMapping("/page")
    public R<Page<LeaveRequest>> page(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) Long employeeId,
            @RequestParam(required = false) Integer status) {
        return R.ok(leaveRequestMapper.selectPage(new Page<>(page, size),
                new LambdaQueryWrapper<LeaveRequest>()
                        .eq(employeeId != null, LeaveRequest::getEmployeeId, employeeId)
                        .eq(status != null, LeaveRequest::getStatus, status)
                        .orderByDesc(LeaveRequest::getCreatedAt)));
    }

    @PostMapping
    public R<Void> create(@Valid @RequestBody LeaveRequest leave) {
        leaveRequestMapper.insert(leave);
        return R.ok();
    }

    @GetMapping("/stats/pending")
    public R<Map<String, Object>> getPendingStats() {
        long count = leaveRequestMapper.selectCount(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<LeaveRequest>()
                        .eq(LeaveRequest::getStatus, 0));
        return R.ok(Map.of("pendingLeaveCount", count));
    }

    @PutMapping("/{id}/approve")
    @PreAuthorize("hasRole('ADMIN') or hasRole('TEAM_LEADER')")
    public R<Void> approve(@PathVariable Long id,
                           @RequestParam Integer status,
                           @RequestParam(required = false) String remark) {
        LeaveRequest leave = leaveRequestMapper.selectById(id);
        if (leave == null) return R.fail("请假申请不存在");
        leave.setStatus(status);
        leave.setApproveRemark(remark);
        leaveRequestMapper.updateById(leave);
        return R.ok();
    }
}
