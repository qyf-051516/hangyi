package com.qyf.hangyi.swap.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.qyf.hangyi.common.exception.BusinessException;
import com.qyf.hangyi.swap.dto.*;
import com.qyf.hangyi.swap.entity.SwapRequest;
import com.qyf.hangyi.swap.mapper.SwapRequestMapper;
import com.qyf.hangyi.swap.service.SwapService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.*;

@Service
public class SwapServiceImpl implements SwapService {

    @Autowired
    private SwapRequestMapper mapper;

    @Override
    @Transactional
    public Map<String, Object> createSwapRequest(Long userId, CreateSwapRequestDTO dto) {
        if (dto.getSourceScheduleId().equals(dto.getTargetScheduleId())) {
            throw new BusinessException("原排班和目标排班不能相同");
        }
        // Check for duplicate pending request
        Long count = mapper.selectCount(new LambdaQueryWrapper<SwapRequest>()
                .eq(SwapRequest::getSourceScheduleId, dto.getSourceScheduleId())
                .eq(SwapRequest::getTargetScheduleId, dto.getTargetScheduleId())
                .eq(SwapRequest::getStatus, "PENDING"));
        if (count > 0) throw new BusinessException("该代班申请已在审批中");

        SwapRequest req = new SwapRequest();
        req.setRequestType("SWAP");
        req.setSourceScheduleId(dto.getSourceScheduleId());
        req.setTargetScheduleId(dto.getTargetScheduleId());
        req.setReason(dto.getReason());
        req.setStatus("PENDING");
        req.setVerifier("MANUAL");
        req.setRequesterId(userId);
        mapper.insert(req);

        Map<String, Object> result = new HashMap<>();
        result.put("requestId", req.getId());
        result.put("sourceScheduleId", dto.getSourceScheduleId());
        result.put("targetScheduleId", dto.getTargetScheduleId());
        return result;
    }

    @Override
    @Transactional
    public Map<String, Object> createSwapApplication(Long userId, CreateSwapApplicationDTO dto) {
        LocalTime start = LocalTime.parse(dto.getStartTime());
        LocalTime end = LocalTime.parse(dto.getEndTime());
        if (!start.isBefore(end)) throw new BusinessException("结束时间需晚于开始时间");

        SwapRequest req = new SwapRequest();
        req.setRequestType("SHIFT_APPLY");
        req.setEmployeeNo(dto.getEmployeeNo());
        req.setName(dto.getName());
        req.setFlightNo(dto.getFlightNo());
        req.setStartTime(start);
        req.setEndTime(end);
        req.setReason(dto.getReason());
        req.setStatus("PENDING");
        req.setRequesterId(userId);
        mapper.insert(req);

        Map<String, Object> result = new HashMap<>();
        result.put("requestId", req.getId());
        result.put("employeeNo", dto.getEmployeeNo());
        result.put("flightNo", dto.getFlightNo());
        return result;
    }

    @Override
    public Page<SwapRequest> listRequests(String status, int page, int size) {
        return mapper.selectPage(new Page<>(page, size),
                new LambdaQueryWrapper<SwapRequest>()
                        .eq(status != null && !status.isEmpty(), SwapRequest::getStatus, status)
                        .orderByDesc(SwapRequest::getCreatedAt));
    }

    @Override
    @Transactional
    public Map<String, Object> approve(Long userId, Long requestId, String decision, String comment) {
        SwapRequest req = mapper.selectById(requestId);
        if (req == null) throw new BusinessException("申请不存在");
        if (!"PENDING".equals(req.getStatus())) throw new BusinessException("该申请已处理");

        String newStatus = "APPROVE".equals(decision) ? "APPROVED" : "REJECTED";
        req.setStatus(newStatus);
        req.setApproverId(userId);
        req.setComment(comment);
        mapper.updateById(req);

        Map<String, Object> result = new HashMap<>();
        result.put("requestId", requestId);
        result.put("status", newStatus);
        return result;
    }

    @Override
    public Map<String, Object> listMyNotifications(Long userId) {
        List<SwapRequest> list = mapper.selectList(new LambdaQueryWrapper<SwapRequest>()
                .eq(SwapRequest::getRequesterId, userId)
                .orderByDesc(SwapRequest::getUpdatedAt));

        int unreadCount = 0;
        List<Map<String, Object>> notifications = new ArrayList<>();
        for (SwapRequest item : list) {
            boolean unread = item.getRequesterReadAt() == null
                    || item.getRequesterReadAt().isBefore(item.getUpdatedAt() != null ? item.getUpdatedAt() : item.getCreatedAt());
            if (unread) unreadCount++;

            Map<String, Object> n = new HashMap<>();
            n.put("id", item.getId());
            n.put("requestType", item.getRequestType() != null ? item.getRequestType() : "SWAP");
            n.put("employeeNo", item.getEmployeeNo() != null ? item.getEmployeeNo() : "");
            n.put("name", item.getName() != null ? item.getName() : "");
            n.put("flightNo", item.getFlightNo() != null ? item.getFlightNo() : "");
            n.put("reason", item.getReason() != null ? item.getReason() : "");
            String st = item.getStatus();
            n.put("status", st);
            n.put("statusText", "PENDING".equals(st) ? "待审批" : "APPROVED".equals(st) ? "审批通过" : "审批驳回");
            n.put("comment", item.getComment() != null ? item.getComment() : "");
            n.put("unread", unread);
            n.put("createdAt", item.getCreatedAt());
            n.put("updatedAt", item.getUpdatedAt());
            n.put("message", "申请 " + ("PENDING".equals(st) ? "待审批" : "APPROVED".equals(st) ? "审批通过" : "审批驳回"));
            notifications.add(n);
        }

        Map<String, Object> result = new HashMap<>();
        result.put("notifications", notifications);
        result.put("unreadCount", unreadCount);
        return result;
    }

    @Override
    @Transactional
    public void markMyNotificationsRead(Long userId) {
        List<SwapRequest> list = mapper.selectList(new LambdaQueryWrapper<SwapRequest>()
                .eq(SwapRequest::getRequesterId, userId));
        LocalDateTime now = LocalDateTime.now();
        for (SwapRequest item : list) {
            item.setRequesterReadAt(now);
            mapper.updateById(item);
        }
    }
}
