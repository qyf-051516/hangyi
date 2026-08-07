package com.qyf.hangyi.schedule.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.qyf.hangyi.common.exception.BusinessException;
import com.qyf.hangyi.common.result.R;
import com.qyf.hangyi.schedule.entity.ScheduleChange;
import com.qyf.hangyi.schedule.entity.ScheduleDetail;
import com.qyf.hangyi.schedule.mapper.ScheduleChangeMapper;
import com.qyf.hangyi.schedule.mapper.ScheduleDetailMapper;
import com.qyf.hangyi.schedule.service.ScheduleAssignmentComplianceService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.Authentication;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Objects;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;

@RestController
@RequestMapping("/api/schedule-changes")
public class ScheduleChangeController {

    @Autowired
    private ScheduleChangeMapper scheduleChangeMapper;

    @Autowired
    private ScheduleDetailMapper scheduleDetailMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ScheduleAssignmentComplianceService complianceService;

    @GetMapping("/page")
    public R<Page<ScheduleChange>> page(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) Long employeeId,
            @RequestParam(required = false) Integer status,
            Authentication authentication) {
        Long effectiveEmployeeId = employeeId;
        if (!canManageAll(authentication)) {
            effectiveEmployeeId = resolveEmployeeIdByUserId(currentUserId(authentication));
        }
        Long queryEmployeeId = effectiveEmployeeId;
        return R.ok(scheduleChangeMapper.selectPage(new Page<>(page, size),
                new LambdaQueryWrapper<ScheduleChange>()
                        .eq(queryEmployeeId != null, ScheduleChange::getEmployeeId, queryEmployeeId)
                        .eq(status != null, ScheduleChange::getStatus, status)
                        .orderByDesc(ScheduleChange::getCreatedAt)));
    }

    @PostMapping
    @Transactional
    public R<Void> create(@Valid @RequestBody ScheduleChange change,
                          Authentication authentication) {
        if (change.getScheduleDetailId() == null) {
            throw new BusinessException(400, "排班明细不能为空");
        }
        ScheduleDetail detail = scheduleDetailMapper.selectById(change.getScheduleDetailId());
        if (detail == null || "archived".equalsIgnoreCase(detail.getRecordStatus())) {
            throw new BusinessException(400, "排班明细不存在或已归档");
        }
        if (!canManageAll(authentication)) {
            Long employeeId = resolveEmployeeIdByUserId(currentUserId(authentication));
            if (!Objects.equals(detail.getEmployeeId(), employeeId)) {
                throw new BusinessException(403, "只能申请变更自己的排班");
            }
        }
        change.setEmployeeId(detail.getEmployeeId());
        change.setFromDate(detail.getWorkDate());
        change.setFromShiftId(detail.getShiftId());
        change.setStatus(0);
        scheduleChangeMapper.insert(change);
        return R.ok();
    }

    @PutMapping("/{id}/approve")
    @Transactional
    public R<Void> approve(@PathVariable Long id,
                           @RequestParam Integer status,
                           @RequestParam(required = false) String remark,
                           Authentication authentication) {
        if (status == null || (status != 1 && status != 2)) {
            throw new BusinessException(400, "审批状态只能是 1（通过）或 2（驳回）");
        }
        if (status == 2 && (remark == null || remark.isBlank())) {
            throw new BusinessException(400, "驳回时必须填写原因");
        }
        ScheduleChange change = scheduleChangeMapper.selectById(id);
        if (change == null) return R.notFound("调班申请不存在");
        if (change.getStatus() == null || change.getStatus() != 0) {
            throw new BusinessException("调班申请已处理");
        }
        Long approverId = currentUserId(authentication);
        int updated = scheduleChangeMapper.update(null, new LambdaUpdateWrapper<ScheduleChange>()
                .eq(ScheduleChange::getId, id)
                .eq(ScheduleChange::getStatus, 0)
                .set(ScheduleChange::getStatus, status)
                .set(ScheduleChange::getApproverId, approverId)
                .set(ScheduleChange::getApproveRemark, remark));
        if (updated != 1) {
            throw new BusinessException("调班申请已被其他审批人处理");
        }
        if (status == 1) {
            applyChange(change);
        }
        return R.ok();
    }

    private void applyChange(ScheduleChange change) {
        if (change.getScheduleDetailId() == null) {
            throw new BusinessException("调班申请缺少排班明细");
        }
        ScheduleDetail detail = scheduleDetailMapper.selectById(change.getScheduleDetailId());
        if (detail == null || "archived".equalsIgnoreCase(detail.getRecordStatus())) {
            throw new BusinessException("待变更的排班不存在或已归档");
        }
        if (!Objects.equals(detail.getEmployeeId(), change.getEmployeeId())) {
            throw new BusinessException("排班人员已变化，请重新提交申请");
        }
        ScheduleDetail proposed = copyDetail(detail);
        Long targetEmployeeId = change.getTargetEmployeeId() == null
                ? detail.getEmployeeId() : change.getTargetEmployeeId();
        LocalDate targetDate = change.getToDate() == null ? detail.getWorkDate() : change.getToDate();
        proposed.setEmployeeId(targetEmployeeId);
        proposed.setWorkDate(targetDate);
        if (change.getToShiftId() != null) {
            proposed.setShiftId(change.getToShiftId());
        }
        moveTaskWindowToDate(proposed, targetDate);
        // 审批时重新校验请假、真实航班机型资质、放行执照、时段冲突、
        // 每日工时与最小休息间隔，避免申请提交后业务状态发生变化而被绕过。
        complianceService.validateAssignment(targetEmployeeId, proposed, detail.getId());

        proposed.setScheduleType("SWAP");
        proposed.setSource("SCHEDULE_CHANGE");
        proposed.setRemark("调班申请 #" + change.getId());
        if (!Objects.equals(targetEmployeeId, detail.getEmployeeId())) {
            proposed.setNeedsReassignment(false);
            proposed.setLeaveRequestId(null);
        }
        scheduleDetailMapper.updateById(proposed);
    }

    private ScheduleDetail copyDetail(ScheduleDetail source) {
        ScheduleDetail target = new ScheduleDetail();
        target.setId(source.getId());
        target.setSourceKey(source.getSourceKey());
        target.setScheduleId(source.getScheduleId());
        target.setEmployeeId(source.getEmployeeId());
        target.setWorkDate(source.getWorkDate());
        target.setShiftId(source.getShiftId());
        target.setShiftGroup(source.getShiftGroup());
        target.setScheduleType(source.getScheduleType());
        target.setRemark(source.getRemark());
        target.setFlightId(source.getFlightId());
        target.setTaskType(source.getTaskType());
        target.setTaskStart(source.getTaskStart());
        target.setTaskEnd(source.getTaskEnd());
        target.setSource(source.getSource());
        target.setRecordStatus(source.getRecordStatus());
        target.setNeedsReassignment(source.getNeedsReassignment());
        target.setLeaveRequestId(source.getLeaveRequestId());
        target.setPrepTime(source.getPrepTime());
        target.setWrapTime(source.getWrapTime());
        return target;
    }

    private void moveTaskWindowToDate(ScheduleDetail detail, LocalDate targetDate) {
        LocalDateTime start = detail.getTaskStart();
        LocalDateTime end = detail.getTaskEnd();
        if (start == null && end == null) return;
        if (start == null || end == null || !end.isAfter(start)) {
            throw new BusinessException(422, "原排班任务时段无效，无法调班");
        }
        Duration duration = Duration.between(start, end);
        LocalDateTime movedStart = targetDate.atTime(start.toLocalTime());
        detail.setTaskStart(movedStart);
        detail.setTaskEnd(movedStart.plus(duration));
    }

    private boolean canManageAll(Authentication authentication) {
        return authentication != null && authentication.getAuthorities().stream()
                .anyMatch(authority -> authority.getAuthority().equals("ROLE_ADMIN")
                        || authority.getAuthority().equals("ROLE_TEAM_LEADER"));
    }

    private Long currentUserId(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()) {
            throw new BusinessException(401, "未登录");
        }
        try {
            return Long.valueOf(String.valueOf(authentication.getPrincipal()));
        } catch (NumberFormatException exception) {
            throw new BusinessException(401, "登录身份无效");
        }
    }

    private Long resolveEmployeeIdByUserId(Long userId) {
        List<Long> employeeIds = jdbcTemplate.query(
                "SELECT id FROM employee WHERE user_id = ? AND status = 1",
                (resultSet, rowNum) -> resultSet.getLong(1),
                userId);
        if (employeeIds.size() != 1) {
            throw new BusinessException(403, "当前账号未绑定唯一的在职员工");
        }
        return employeeIds.get(0);
    }
}
