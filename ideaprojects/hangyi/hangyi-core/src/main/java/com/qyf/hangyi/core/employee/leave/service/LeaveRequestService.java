package com.qyf.hangyi.core.employee.leave.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.qyf.hangyi.common.exception.BusinessException;
import com.qyf.hangyi.common.sync.GuochuangSyncClient;
import com.qyf.hangyi.core.auth.entity.ScheduleDetail;
import com.qyf.hangyi.core.auth.mapper.ScheduleDetailMapper;
import com.qyf.hangyi.core.employee.entity.Employee;
import com.qyf.hangyi.core.employee.leave.dto.CreateLeaveRequest;
import com.qyf.hangyi.core.employee.leave.entity.LeaveRequest;
import com.qyf.hangyi.core.employee.leave.mapper.LeaveRequestMapper;
import com.qyf.hangyi.core.employee.mapper.EmployeeMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class LeaveRequestService {

    private final LeaveRequestMapper leaveMapper;
    private final EmployeeMapper employeeMapper;
    private final ScheduleDetailMapper scheduleDetailMapper;
    private final GuochuangSyncClient syncClient;
    private final ObjectMapper objectMapper;

    public LeaveRequestService(
            LeaveRequestMapper leaveMapper,
            EmployeeMapper employeeMapper,
            ScheduleDetailMapper scheduleDetailMapper,
            GuochuangSyncClient syncClient,
            ObjectMapper objectMapper
    ) {
        this.leaveMapper = leaveMapper;
        this.employeeMapper = employeeMapper;
        this.scheduleDetailMapper = scheduleDetailMapper;
        this.syncClient = syncClient;
        this.objectMapper = objectMapper;
    }

    public Page<LeaveRequest> page(int page, int size, Long employeeId, Integer status) {
        return leaveMapper.selectPage(new Page<>(page, size),
                new LambdaQueryWrapper<LeaveRequest>()
                        .eq(employeeId != null, LeaveRequest::getEmployeeId, employeeId)
                        .eq(status != null, LeaveRequest::getStatus, status)
                        .orderByDesc(LeaveRequest::getCreatedAt));
    }

    public Page<LeaveRequest> myPage(Long userId, int page, int size, Integer status) {
        return page(page, size, requireEmployeeForUser(userId).getId(), status);
    }

    @Transactional
    public LeaveRequest create(Long userId, boolean canManageAll, CreateLeaveRequest request) {
        Employee requestedEmployee = resolveTargetEmployee(userId, canManageAll, request.employeeId());
        // 先锁员工行，再查日期重叠，避免并发提交形成两条 overlapping PENDING 记录。
        Employee employee = employeeMapper.lockActiveById(requestedEmployee.getId());
        if (employee == null) {
            throw new BusinessException(409, "员工不存在或已停用，请刷新后重试");
        }
        LocalDate startDate = request.startDate();
        LocalDate endDate = request.endDate() == null ? startDate : request.endDate();
        if (endDate.isBefore(startDate)) {
            throw new BusinessException(400, "结束日期不能早于开始日期");
        }
        if (ChronoUnit.DAYS.between(startDate, endDate) > 365) {
            throw new BusinessException(400, "单次请假不能超过366天");
        }
        List<String> images = sanitizeImages(request.reasonImages());
        String reason = request.reason() == null ? "" : request.reason().trim();
        String mode = normalizeReasonMode(request.reasonMode(), reason, images);
        if (reason.isBlank() && images.isEmpty()) {
            throw new BusinessException(400, "请填写文字理由或上传图片凭证");
        }
        long overlaps = leaveMapper.selectCount(new LambdaQueryWrapper<LeaveRequest>()
                .eq(LeaveRequest::getEmployeeId, employee.getId())
                .in(LeaveRequest::getStatus, List.of(0, 1))
                .le(LeaveRequest::getStartDate, endDate)
                .and(wrapper -> wrapper.isNull(LeaveRequest::getEndDate)
                        .or().ge(LeaveRequest::getEndDate, startDate)));
        if (overlaps > 0) {
            throw new BusinessException(409, "该日期范围已有待审批或已批准的请假申请");
        }

        LeaveRequest leave = new LeaveRequest();
        leave.setEmployeeId(employee.getId());
        leave.setLeaveType(request.leaveType().trim());
        leave.setStartDate(startDate);
        leave.setEndDate(endDate);
        leave.setTotalDays(BigDecimal.valueOf(ChronoUnit.DAYS.between(startDate, endDate) + 1));
        leave.setReason(reason);
        leave.setReasonMode(mode);
        leave.setReasonImages(writeImages(images));
        leave.setValidationSnapshot("{\"overlapChecked\":true}");
        leave.setAuditTrail("[]");
        leave.setStatus(0);
        leaveMapper.insert(leave);
        enqueue(leave, images, "PENDING");
        return leave;
    }

    @Transactional
    public void withdraw(Long userId, Long id) {
        Employee employee = requireEmployeeForUser(userId);
        int updated = leaveMapper.update(null, new LambdaUpdateWrapper<LeaveRequest>()
                .eq(LeaveRequest::getId, id)
                .eq(LeaveRequest::getEmployeeId, employee.getId())
                .eq(LeaveRequest::getStatus, 0)
                .set(LeaveRequest::getStatus, 3)
                .set(LeaveRequest::getCancelledAt, LocalDateTime.now()));
        if (updated != 1) {
            throw new BusinessException(409, "请假申请不存在、不属于当前员工或已处理");
        }
        enqueue(leaveMapper.selectById(id), List.of(), "CANCELLED");
    }

    @Transactional
    public void approve(Long approverId, Long id, int status, String remark) {
        if (status != 1 && status != 2) {
            throw new BusinessException(400, "审批状态无效，请输入 1(通过) 或 2(驳回)");
        }
        String safeRemark = remark == null ? "" : remark.trim();
        if (status == 2 && safeRemark.isBlank()) {
            throw new BusinessException(400, "驳回时必须填写原因");
        }
        int updated = leaveMapper.update(null, new LambdaUpdateWrapper<LeaveRequest>()
                .eq(LeaveRequest::getId, id)
                .eq(LeaveRequest::getStatus, 0)
                .set(LeaveRequest::getStatus, status)
                .set(LeaveRequest::getApproverId, approverId)
                .set(LeaveRequest::getApproveRemark, safeRemark));
        if (updated != 1) {
            throw new BusinessException(409, "请假申请不存在或已被其他审批人处理");
        }
        LeaveRequest leave = leaveMapper.selectById(id);
        if (status == 1 && leave != null) {
            scheduleDetailMapper.update(null, new LambdaUpdateWrapper<ScheduleDetail>()
                    .eq(ScheduleDetail::getEmployeeId, leave.getEmployeeId())
                    .between(ScheduleDetail::getWorkDate, leave.getStartDate(), leave.getEndDate())
                    .eq(ScheduleDetail::getRecordStatus, "active")
                    .and(wrapper -> wrapper.isNull(ScheduleDetail::getScheduleType)
                            .or().ne(ScheduleDetail::getScheduleType, "COMPLETED"))
                    .set(ScheduleDetail::getNeedsReassignment, true)
                    .set(ScheduleDetail::getLeaveRequestId, leave.getId()));
        }
        enqueue(leave, List.of(), status == 1 ? "APPROVED" : "REJECTED");
    }

    public long pendingCount() {
        return leaveMapper.selectCount(new LambdaQueryWrapper<LeaveRequest>()
                .eq(LeaveRequest::getStatus, 0));
    }

    private Employee resolveTargetEmployee(Long userId, boolean canManageAll, Long requestedEmployeeId) {
        if (canManageAll && requestedEmployeeId != null) {
            Employee employee = employeeMapper.selectById(requestedEmployeeId);
            if (employee == null || !Integer.valueOf(1).equals(employee.getStatus())) {
                throw new BusinessException(404, "员工不存在或已停用");
            }
            return employee;
        }
        return requireEmployeeForUser(userId);
    }

    private Employee requireEmployeeForUser(Long userId) {
        List<Employee> employees = employeeMapper.selectList(new LambdaQueryWrapper<Employee>()
                .eq(Employee::getUserId, userId)
                .eq(Employee::getStatus, 1));
        if (employees.size() != 1) {
            throw new BusinessException(403, "当前账号未绑定唯一的在职员工");
        }
        return employees.get(0);
    }

    private List<String> sanitizeImages(List<String> input) {
        if (input == null || input.isEmpty()) return List.of();
        List<String> result = new ArrayList<>();
        for (String value : input) {
            String image = value == null ? "" : value.trim();
            if (image.isBlank()) continue;
            if (!(image.startsWith("https://") || image.startsWith("cloud://"))) {
                throw new BusinessException(400, "图片凭证地址必须使用 HTTPS 或云存储地址");
            }
            result.add(image);
        }
        return List.copyOf(result);
    }

    private String normalizeReasonMode(String requested, String reason, List<String> images) {
        String derived = !reason.isBlank() && !images.isEmpty() ? "BOTH"
                : images.isEmpty() ? "TEXT" : "IMAGE";
        if (requested != null && !requested.isBlank() && !requested.equals(derived)) {
            throw new BusinessException(400, "理由模式与已提交的文字或图片不匹配");
        }
        return derived;
    }

    private String writeImages(List<String> images) {
        try {
            return objectMapper.writeValueAsString(images);
        } catch (Exception error) {
            throw new BusinessException(500, "图片凭证保存失败");
        }
    }

    private void enqueue(LeaveRequest leave, List<String> images, String status) {
        if (leave == null) return;
        Map<String, Object> record = new LinkedHashMap<>();
        record.put("_id", String.valueOf(leave.getId()));
        record.put("employeeId", String.valueOf(leave.getEmployeeId()));
        record.put("leaveType", leave.getLeaveType());
        record.put("startDate", String.valueOf(leave.getStartDate()));
        record.put("endDate", String.valueOf(leave.getEndDate()));
        record.put("reason", leave.getReason() == null ? "" : leave.getReason());
        record.put("reasonMode", leave.getReasonMode());
        record.put("reasonImages", images);
        record.put("status", status);
        record.put("updatedAt", LocalDateTime.now().toString());
        syncClient.enqueuePush("leave_requests", record);
    }
}
