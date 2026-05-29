package com.qyf.hangyi.swap.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.qyf.hangyi.common.result.R;
import com.qyf.hangyi.swap.dto.*;
import com.qyf.hangyi.swap.entity.SwapRequest;
import com.qyf.hangyi.swap.service.SwapService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class SwapController {

    @Autowired
    private SwapService swapService;

    private Long getUserId() {
        Object principal = SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        if (principal instanceof String) return Long.parseLong((String) principal);
        return null;
    }

    @PostMapping("/swap/requests")
    public R<Map<String, Object>> createSwapRequest(@Valid @RequestBody CreateSwapRequestDTO dto) {
        return R.ok(swapService.createSwapRequest(getUserId(), dto));
    }

    @PostMapping("/swap/applications")
    public R<Map<String, Object>> createSwapApplication(@Valid @RequestBody CreateSwapApplicationDTO dto) {
        return R.ok(swapService.createSwapApplication(getUserId(), dto));
    }

    @GetMapping("/swap/requests")
    public R<Page<SwapRequest>> listSwapRequests(
            @RequestParam(defaultValue = "PENDING") String status,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "50") int size) {
        return R.ok(swapService.listRequests(status, page, size));
    }

    @PostMapping("/swap/requests/{id}/approve")
    public R<Map<String, Object>> approveSwapRequest(
            @PathVariable Long id,
            @RequestBody Map<String, String> body) {
        return R.ok(swapService.approve(getUserId(), id,
                body.getOrDefault("decision", "APPROVE"),
                body.getOrDefault("comment", "")));
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
