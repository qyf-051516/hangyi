package com.qyf.hangyi.core.employee.leave.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.qyf.hangyi.common.exception.BusinessException;
import com.qyf.hangyi.common.result.R;
import com.qyf.hangyi.core.employee.leave.dto.CreateLeaveRequest;
import com.qyf.hangyi.core.employee.leave.entity.LeaveRequest;
import com.qyf.hangyi.core.employee.leave.service.LeaveRequestService;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/leaves")
public class LeaveRequestController {

    private final LeaveRequestService leaveService;

    public LeaveRequestController(LeaveRequestService leaveService) {
        this.leaveService = leaveService;
    }

    @GetMapping("/page")
    public R<Page<LeaveRequest>> page(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) Long employeeId,
            @RequestParam(required = false) Integer status) {
        return R.ok(leaveService.page(page, size, employeeId, status));
    }

    @GetMapping("/mine")
    public R<Page<LeaveRequest>> mine(
            Authentication authentication,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) Integer status) {
        return R.ok(leaveService.myPage(currentUserId(authentication), page, size, status));
    }

    @PostMapping
    public R<LeaveRequest> create(
            Authentication authentication,
            @Valid @RequestBody CreateLeaveRequest request) {
        return R.ok(leaveService.create(
                currentUserId(authentication), canManageAll(authentication), request));
    }

    @PutMapping("/{id}/withdraw")
    public R<Void> withdraw(Authentication authentication, @PathVariable Long id) {
        leaveService.withdraw(currentUserId(authentication), id);
        return R.ok();
    }

    @GetMapping("/stats/pending")
    public R<Map<String, Object>> getPendingStats() {
        return R.ok(Map.of("pendingLeaveCount", leaveService.pendingCount()));
    }

    @PutMapping("/{id}/approve")
    @PreAuthorize("hasRole('ADMIN') or hasRole('TEAM_LEADER')")
    public R<Void> approve(
            Authentication authentication,
            @PathVariable Long id,
            @RequestParam Integer status,
            @RequestParam(required = false) String remark) {
        leaveService.approve(currentUserId(authentication), id, status, remark);
        return R.ok();
    }

    private Long currentUserId(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof Long userId)) {
            throw new BusinessException(401, "未获取到当前账号身份");
        }
        return userId;
    }

    private boolean canManageAll(Authentication authentication) {
        return authentication.getAuthorities().stream().anyMatch(authority ->
                "ROLE_ADMIN".equals(authority.getAuthority())
                        || "ROLE_TEAM_LEADER".equals(authority.getAuthority()));
    }
}
