package com.qyf.hangyi.schedule.swap.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.qyf.hangyi.schedule.swap.dto.*;
import com.qyf.hangyi.schedule.swap.entity.SwapRequest;
import java.util.Map;

public interface SwapService {
    Map<String, Object> createSwapRequest(Long userId, boolean canManageAll, CreateSwapRequestDTO dto);
    Map<String, Object> createSwapApplication(Long userId, boolean canManageAll, CreateSwapApplicationDTO dto);
    Page<SwapRequest> listRequests(String status, int page, int size);
    Page<SwapRequest> listRequests(String status, int page, int size, Long requesterId);
    Map<String, Object> approve(Long userId, Long requestId, String decision, String comment);
    Map<String, Object> listMyNotifications(Long userId);
    void markMyNotificationsRead(Long userId);
}
