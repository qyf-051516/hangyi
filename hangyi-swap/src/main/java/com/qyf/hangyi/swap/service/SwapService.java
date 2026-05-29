package com.qyf.hangyi.swap.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.qyf.hangyi.swap.dto.*;
import com.qyf.hangyi.swap.entity.SwapRequest;
import java.util.Map;

public interface SwapService {
    Map<String, Object> createSwapRequest(Long userId, CreateSwapRequestDTO dto);
    Map<String, Object> createSwapApplication(Long userId, CreateSwapApplicationDTO dto);
    Page<SwapRequest> listRequests(String status, int page, int size);
    Map<String, Object> approve(Long userId, Long requestId, String decision, String comment);
    Map<String, Object> listMyNotifications(Long userId);
    void markMyNotificationsRead(Long userId);
}
