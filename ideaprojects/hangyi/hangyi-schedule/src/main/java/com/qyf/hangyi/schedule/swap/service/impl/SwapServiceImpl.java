package com.qyf.hangyi.schedule.swap.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.qyf.hangyi.common.exception.BusinessException;
import com.qyf.hangyi.schedule.entity.Schedule;
import com.qyf.hangyi.schedule.entity.ScheduleDetail;
import com.qyf.hangyi.schedule.entity.ShiftTemplate;
import com.qyf.hangyi.schedule.mapper.ScheduleDetailMapper;
import com.qyf.hangyi.schedule.mapper.ScheduleMapper;
import com.qyf.hangyi.schedule.mapper.ShiftTemplateMapper;
import com.qyf.hangyi.schedule.service.ScheduleAssignmentComplianceService;
import com.qyf.hangyi.schedule.swap.dto.*;
import com.qyf.hangyi.schedule.swap.entity.SwapRequest;
import com.qyf.hangyi.schedule.swap.mapper.SwapRequestMapper;
import com.qyf.hangyi.schedule.swap.service.SwapService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.jdbc.core.JdbcTemplate;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeParseException;
import java.util.*;

@Service
public class SwapServiceImpl implements SwapService {

    @Autowired
    private SwapRequestMapper mapper;

    @Autowired
    private ScheduleDetailMapper detailMapper;

    @Autowired
    private ScheduleMapper scheduleMapper;

    @Autowired
    private ShiftTemplateMapper shiftTemplateMapper;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private ScheduleAssignmentComplianceService complianceService;

    @Override
    @Transactional
    public Map<String, Object> createSwapRequest(Long userId, boolean canManageAll, CreateSwapRequestDTO dto) {
        if (dto.getSourceScheduleId().equals(dto.getTargetScheduleId())) {
            throw new BusinessException("原排班和目标排班不能相同");
        }
        ScheduleDetail source = requireActiveDetail(dto.getSourceScheduleId(), "原排班");
        ScheduleDetail target = requireActiveDetail(dto.getTargetScheduleId(), "目标排班");
        if (Objects.equals(source.getEmployeeId(), target.getEmployeeId())) {
            throw new BusinessException("原排班和目标排班属于同一员工，无需交换");
        }
        if (!canManageAll && !Objects.equals(resolveEmployeeIdByUserId(userId), source.getEmployeeId())) {
            throw new BusinessException(403, "只能为自己的排班发起交换申请");
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
        req.setSourceStaffId(source.getEmployeeId());
        req.setTargetStaffId(target.getEmployeeId());
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
    public Map<String, Object> createSwapApplication(Long userId, boolean canManageAll, CreateSwapApplicationDTO dto) {
        LocalTime start = parseTime(dto.getStartTime(), "开始时间");
        LocalTime end = parseTime(dto.getEndTime(), "结束时间");
        if (!start.isBefore(end)) throw new BusinessException("结束时间需晚于开始时间");
        Map<String, Object> employee = resolveEmployeeByNo(dto.getEmployeeNo());
        if (!Objects.equals(String.valueOf(employee.get("name")), dto.getName())) {
            throw new BusinessException("工号与姓名不匹配");
        }
        if (!canManageAll && !Objects.equals(resolveEmployeeIdByUserId(userId), asLong(employee.get("id")))) {
            throw new BusinessException(403, "只能为自己申请临时班次");
        }
        requireFlight(dto.getFlightNo(), dto.getWorkDate());

        SwapRequest req = new SwapRequest();
        req.setRequestType("SHIFT_APPLY");
        req.setEmployeeNo(dto.getEmployeeNo());
        req.setName(dto.getName());
        req.setFlightNo(dto.getFlightNo());
        req.setWorkDate(dto.getWorkDate());
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
        return listRequests(status, page, size, null);
    }

    @Override
    public Page<SwapRequest> listRequests(String status, int page, int size, Long requesterId) {
        // H-7: requesterId 非空时只返回该用户作为申请人的记录
        return mapper.selectPage(new Page<>(page, size),
                new LambdaQueryWrapper<SwapRequest>()
                        .eq(status != null && !status.isEmpty(), SwapRequest::getStatus, status)
                        .eq(requesterId != null, SwapRequest::getRequesterId, requesterId)
                        .orderByDesc(SwapRequest::getCreatedAt));
    }

    @Override
    @Transactional
    public Map<String, Object> approve(Long userId, Long requestId, String decision, String comment) {
        SwapRequest req = mapper.selectById(requestId);
        if (req == null) throw new BusinessException("申请不存在");
        if (!"PENDING".equals(req.getStatus())) throw new BusinessException("该申请已处理");

        String normalizedDecision = decision == null ? "" : decision.trim().toUpperCase(Locale.ROOT);
        if (!Set.of("APPROVE", "REJECT").contains(normalizedDecision)) {
            throw new BusinessException(400, "审批决定只能是 APPROVE 或 REJECT");
        }
        if ("REJECT".equals(normalizedDecision) && (comment == null || comment.isBlank())) {
            throw new BusinessException(400, "驳回时必须填写原因");
        }
        String newStatus = "APPROVE".equals(normalizedDecision) ? "APPROVED" : "REJECTED";
        int updated = mapper.update(null, new LambdaUpdateWrapper<SwapRequest>()
                .eq(SwapRequest::getId, requestId)
                .eq(SwapRequest::getStatus, "PENDING")
                .set(SwapRequest::getStatus, newStatus)
                .set(SwapRequest::getApproverId, userId)
                .set(SwapRequest::getComment, comment));
        if (updated != 1) {
            throw new BusinessException("该申请已被其他审批人处理");
        }
        if ("APPROVED".equals(newStatus)) {
            applyApprovedRequest(req, userId);
        }

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

    private void applyApprovedRequest(SwapRequest request, Long approverId) {
        if ("SWAP".equals(request.getRequestType())) {
            applySwap(request);
            return;
        }
        if ("SHIFT_APPLY".equals(request.getRequestType())) {
            applyTemporaryShift(request, approverId);
            return;
        }
        throw new BusinessException(400, "不支持的申请类型");
    }

    private void applySwap(SwapRequest request) {
        ScheduleDetail source = requireActiveDetail(request.getSourceScheduleId(), "原排班");
        ScheduleDetail target = requireActiveDetail(request.getTargetScheduleId(), "目标排班");
        if (!Objects.equals(source.getEmployeeId(), request.getSourceStaffId())
                || !Objects.equals(target.getEmployeeId(), request.getTargetStaffId())) {
            throw new BusinessException("排班人员已变化，请重新发起申请");
        }
        Long sourceEmployeeId = source.getEmployeeId();
        source.setEmployeeId(target.getEmployeeId());
        target.setEmployeeId(sourceEmployeeId);
        complianceService.validateAssignments(
                List.of(source, target), Set.of(source.getId(), target.getId()), null);
        detailMapper.updateById(source);
        detailMapper.updateById(target);
    }

    private void applyTemporaryShift(SwapRequest request, Long approverId) {
        Map<String, Object> employee = resolveEmployeeByNo(request.getEmployeeNo());
        Long employeeId = asLong(employee.get("id"));
        Map<String, Object> flight = requireFlight(request.getFlightNo(), request.getWorkDate());
        Long flightId = asLong(flight.get("id"));
        Long duplicateCount = detailMapper.selectCount(new LambdaQueryWrapper<ScheduleDetail>()
                .eq(ScheduleDetail::getEmployeeId, employeeId)
                .eq(ScheduleDetail::getWorkDate, request.getWorkDate())
                .eq(ScheduleDetail::getFlightId, flightId)
                .eq(ScheduleDetail::getRecordStatus, "active"));
        if (duplicateCount > 0) {
            throw new BusinessException("该员工已经安排了同一航班任务");
        }

        ShiftTemplate shift = findClosestShift(request.getStartTime());
        Schedule schedule = getOrCreateSwapSchedule(request.getWorkDate(), approverId);
        ScheduleDetail detail = new ScheduleDetail();
        detail.setScheduleId(schedule.getId());
        detail.setEmployeeId(employeeId);
        detail.setWorkDate(request.getWorkDate());
        detail.setShiftId(shift.getId());
        detail.setShiftGroup(shift.getShiftCode());
        detail.setScheduleType("SWAP");
        detail.setFlightId(flightId);
        detail.setTaskType("TEMP_SHIFT");
        detail.setTaskStart(request.getWorkDate().atTime(request.getStartTime()));
        detail.setTaskEnd(request.getWorkDate().atTime(request.getEndTime()));
        detail.setSource("SWAP");
        detail.setRecordStatus("active");
        detail.setRemark("临时班次申请 #" + request.getId());
        complianceService.validateAssignment(employeeId, detail, null);
        detailMapper.insert(detail);
    }

    private Schedule getOrCreateSwapSchedule(LocalDate date, Long creatorId) {
        List<Schedule> schedules = scheduleMapper.selectList(new LambdaQueryWrapper<Schedule>()
                .eq(Schedule::getScheduleType, "SWAP")
                .eq(Schedule::getStartDate, date)
                .eq(Schedule::getEndDate, date)
                .eq(Schedule::getStatus, 1)
                .orderByDesc(Schedule::getId));
        if (!schedules.isEmpty()) {
            return schedules.get(0);
        }
        Schedule schedule = new Schedule();
        schedule.setScheduleName("调班与临时班次 " + date);
        schedule.setStartDate(date);
        schedule.setEndDate(date);
        schedule.setStatus(1);
        schedule.setScheduleType("SWAP");
        schedule.setCreatedBy(creatorId);
        schedule.setPublishedAt(LocalDateTime.now());
        scheduleMapper.insert(schedule);
        return schedule;
    }

    private ShiftTemplate findClosestShift(LocalTime startTime) {
        List<ShiftTemplate> shifts = shiftTemplateMapper.selectList(
                new LambdaQueryWrapper<ShiftTemplate>().eq(ShiftTemplate::getStatus, 1));
        return shifts.stream()
                .filter(shift -> shift.getStartTime() != null)
                .min(Comparator.comparingLong(shift ->
                        circularMinuteDistance(shift.getStartTime(), startTime)))
                .orElseThrow(() -> new BusinessException("没有可用班次模板"));
    }

    private long circularMinuteDistance(LocalTime left, LocalTime right) {
        long difference = Math.abs(left.toSecondOfDay() - right.toSecondOfDay()) / 60;
        return Math.min(difference, 24 * 60 - difference);
    }

    private ScheduleDetail requireActiveDetail(Long id, String label) {
        ScheduleDetail detail = detailMapper.selectById(id);
        if (detail == null || "archived".equalsIgnoreCase(detail.getRecordStatus())) {
            throw new BusinessException(label + "不存在或已归档");
        }
        return detail;
    }

    private Long resolveEmployeeIdByUserId(Long userId) {
        List<Long> ids = jdbc.query(
                "SELECT id FROM employee WHERE user_id = ? AND status = 1",
                (rs, rowNum) -> rs.getLong(1),
                userId);
        if (ids.size() != 1) {
            throw new BusinessException(403, "当前账号未绑定唯一的在职员工");
        }
        return ids.get(0);
    }

    private Map<String, Object> resolveEmployeeByNo(String employeeNo) {
        List<Map<String, Object>> employees = jdbc.queryForList(
                "SELECT id, name, user_id FROM employee WHERE emp_no = ? AND status = 1",
                employeeNo);
        if (employees.size() != 1) {
            throw new BusinessException("员工不存在或已停用");
        }
        return employees.get(0);
    }

    private Map<String, Object> requireFlight(String flightNo, LocalDate workDate) {
        List<Map<String, Object>> flights = jdbc.queryForList(
                "SELECT id, plan_time FROM flight_plan WHERE flight_no = ? AND plan_date = ? " +
                        "AND status = 'SCHEDULED' ORDER BY plan_time, id",
                flightNo, workDate);
        if (flights.isEmpty()) {
            throw new BusinessException("申请日期没有对应的计划航班");
        }
        return flights.get(0);
    }

    private LocalTime parseTime(String value, String fieldName) {
        try {
            return LocalTime.parse(value);
        } catch (DateTimeParseException exception) {
            throw new BusinessException(400, fieldName + "格式应为 HH:mm");
        }
    }

    private Long asLong(Object value) {
        if (!(value instanceof Number number)) {
            throw new BusinessException("关联数据格式异常");
        }
        return number.longValue();
    }
}
