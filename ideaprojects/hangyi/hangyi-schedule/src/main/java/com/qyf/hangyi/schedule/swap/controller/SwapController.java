package com.qyf.hangyi.schedule.swap.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.qyf.hangyi.common.sync.GuochuangSyncClient;
import com.qyf.hangyi.common.result.R;
import com.qyf.hangyi.schedule.swap.dto.*;
import com.qyf.hangyi.schedule.swap.entity.SwapRequest;
import com.qyf.hangyi.schedule.swap.service.SwapService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class SwapController {

    @Autowired
    private SwapService swapService;

    @Autowired
    private GuochuangSyncClient guochuangSyncClient;

    private Long getUserId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            throw new org.springframework.security.access.AccessDeniedException("未登录");
        }
        return Long.parseLong(String.valueOf(authentication.getPrincipal()));
    }

    private boolean canManageAll() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        return authentication != null && authentication.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_ADMIN")
                        || a.getAuthority().equals("ROLE_TEAM_LEADER"));
    }

    @PostMapping("/swap/requests")
    public R<Map<String, Object>> createSwapRequest(@Valid @RequestBody CreateSwapRequestDTO dto) {
        Map<String, Object> result = swapService.createSwapRequest(getUserId(), canManageAll(), dto);
        guochuangSyncClient.enqueuePush("swap_requests", Map.of(
            "_id", result.getOrDefault("requestId", "").toString(),
            "status", "PENDING",
            "updatedAt", new java.util.Date().toString()
        ));
        return R.ok(result);
    }

    @PostMapping("/swap/applications")
    public R<Map<String, Object>> createSwapApplication(@Valid @RequestBody CreateSwapApplicationDTO dto) {
        Map<String, Object> result = swapService.createSwapApplication(getUserId(), canManageAll(), dto);
        guochuangSyncClient.enqueuePush("swap_requests", Map.of(
            "_id", result.getOrDefault("requestId", "").toString(),
            "status", "PENDING",
            "updatedAt", new java.util.Date().toString()
        ));
        return R.ok(result);
    }

    @GetMapping("/swap/requests")
    public R<Page<SwapRequest>> listSwapRequests(
            @RequestParam(defaultValue = "PENDING") String status,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "50") int size) {
        // H-7: STAFF 只能看自己申请的；ADMIN/TEAM_LEADER 看全部
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        Long filterUserId = null;
        if (auth != null && auth.getAuthorities().stream()
                .noneMatch(a -> a.getAuthority().equals("ROLE_ADMIN")
                             || a.getAuthority().equals("ROLE_TEAM_LEADER"))) {
            filterUserId = Long.parseLong(auth.getName());
        }
        return R.ok(swapService.listRequests(status, page, size, filterUserId));
    }

    @PostMapping("/swap/requests/{id}/approve")
    @PreAuthorize("hasAnyRole('ADMIN','TEAM_LEADER')")
    public R<Map<String, Object>> approveSwapRequest(
            @PathVariable Long id,
            @RequestBody Map<String, String> body) {
        Map<String, Object> result = swapService.approve(getUserId(), id,
                body.getOrDefault("decision", "APPROVE"),
                body.getOrDefault("comment", ""));
        guochuangSyncClient.enqueuePush("swap_requests", Map.of(
            "_id", id.toString(),
            "status", "APPROVE".equalsIgnoreCase(body.get("decision")) ? "APPROVED" : "REJECTED",
            "updatedAt", new java.util.Date().toString()
        ));
        return R.ok(result);
    }

    @GetMapping("/notifications")
    public R<Map<String, Object>> listMyNotifications() {
        return R.ok(swapService.listMyNotifications(getUserId()));
    }

    @PutMapping("/notifications/read")
    public R<Void> markMyNotificationsRead() {
        swapService.markMyNotificationsRead(getUserId());
        return R.ok();
    }
}
