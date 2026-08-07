package com.qyf.hangyi.schedule.service;

import com.qyf.hangyi.common.exception.BusinessException;
import com.qyf.hangyi.schedule.entity.ScheduleDetail;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.sql.Time;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * 服务端排班合规守卫。
 *
 * <p>所有会真实写入人员-航班关系的路径都必须在归档旧版本或更新明细前调用本类。
 * 这里不能依赖前端预检：请假、资质和既有排班可能已在申请提交之后变化。</p>
 */
@Service
public class ScheduleAssignmentComplianceService {

    private static final long MIN_REST_MINUTES = 8 * 60L;
    private static final BigDecimal DEFAULT_MAX_HOURS_PER_DAY = BigDecimal.valueOf(12);

    private final JdbcTemplate jdbc;

    public ScheduleAssignmentComplianceService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void validateAssignment(Long employeeId, ScheduleDetail incoming, Long excludedDetailId) {
        Set<Long> excluded = excludedDetailId == null ? Set.of() : Set.of(excludedDetailId);
        validateAssignments(List.of(copyWithEmployee(incoming, employeeId)), excluded, null);
    }

    /**
     * 校验同一次发布的完整候选集。replacingScheduleType 用于勤务发布：当前类型的
     * 旧版本会在校验通过后被归档，因此不应与候选版本互相冲突。
     */
    public void validateAssignments(
            Collection<ScheduleDetail> candidates,
            Set<Long> excludedDetailIds,
            String replacingScheduleType) {
        if (candidates == null || candidates.isEmpty()) {
            return;
        }

        Set<Long> excluded = excludedDetailIds == null ? Set.of() : Set.copyOf(excludedDetailIds);
        // 休息间隔可跨日，因此按员工聚合；工时仍按员工+工作日单独计算。
        Map<Long, List<TimeWindow>> candidateWindows = new HashMap<>();
        Map<EmployeeDate, List<TimeWindow>> persistedCache = new HashMap<>();
        Map<Long, EmployeePolicy> employeePolicies = new HashMap<>();

        for (ScheduleDetail candidate : candidates) {
            requireCandidate(candidate);
            EmployeePolicy policy = employeePolicies.computeIfAbsent(
                    candidate.getEmployeeId(), this::loadEmployeePolicy);
            ensureNotOnApprovedLeave(candidate.getEmployeeId(), candidate.getWorkDate());
            ensureFlightQualificationAndLicense(candidate, policy);

            TimeWindow incoming = toTimeWindow(candidate);
            EmployeeDate key = new EmployeeDate(candidate.getEmployeeId(), candidate.getWorkDate());
            List<TimeWindow> persisted = persistedCache.computeIfAbsent(key,
                    ignored -> loadPersistedWindows(candidate.getEmployeeId(), candidate.getWorkDate(),
                            excluded, replacingScheduleType));
            List<TimeWindow> inBatchForEmployee = candidateWindows.computeIfAbsent(
                    candidate.getEmployeeId(), ignored -> new ArrayList<>());

            ensureNoOverlapOrInsufficientRest(incoming, persisted);
            ensureNoOverlapOrInsufficientRest(incoming, inBatchForEmployee);

            List<TimeWindow> daily = persisted.stream()
                    .filter(window -> window.start().toLocalDate().equals(candidate.getWorkDate()))
                    .collect(java.util.stream.Collectors.toCollection(ArrayList::new));
            daily.addAll(inBatchForEmployee.stream()
                    .filter(window -> window.start().toLocalDate().equals(candidate.getWorkDate()))
                    .toList());
            daily.add(incoming);
            ensureDailyHours(daily, policy.maxHoursPerDay());
            inBatchForEmployee.add(incoming);
        }
    }

    private ScheduleDetail copyWithEmployee(ScheduleDetail source, Long employeeId) {
        if (source == null) {
            throw new BusinessException(400, "排班明细不能为空");
        }
        source.setEmployeeId(employeeId);
        return source;
    }

    private void requireCandidate(ScheduleDetail candidate) {
        if (candidate.getEmployeeId() == null || candidate.getWorkDate() == null) {
            throw new BusinessException(400, "排班人员和日期不能为空");
        }
        if (candidate.getTaskStart() == null != (candidate.getTaskEnd() == null)) {
            throw new BusinessException(400, "任务开始和结束时间必须同时填写");
        }
    }

    private EmployeePolicy loadEmployeePolicy(Long employeeId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT max_hours_per_day, license_type FROM employee WHERE id = ? AND status = 1",
                employeeId);
        if (rows.size() != 1) {
            throw new BusinessException(409, "目标员工不存在或已停用");
        }
        Map<String, Object> row = rows.get(0);
        Object max = column(row, "max_hours_per_day");
        BigDecimal maxHours = max instanceof BigDecimal decimal ? decimal
                : max instanceof Number number ? BigDecimal.valueOf(number.doubleValue())
                : DEFAULT_MAX_HOURS_PER_DAY;
        if (maxHours.signum() <= 0) {
            throw new BusinessException(422, "目标员工每日最大工时配置无效");
        }
        Object license = column(row, "license_type");
        return new EmployeePolicy(maxHours, license == null ? "" : String.valueOf(license).trim().toUpperCase(Locale.ROOT));
    }

    private void ensureNotOnApprovedLeave(Long employeeId, LocalDate workDate) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM leave_request WHERE employee_id = ? AND status = 1 "
                        + "AND start_date <= ? AND COALESCE(end_date, start_date) >= ?",
                Integer.class, employeeId, workDate, workDate);
        if (count != null && count > 0) {
            throw new BusinessException(409, "目标员工当日处于已批准请假期间");
        }
    }

    private void ensureFlightQualificationAndLicense(ScheduleDetail candidate, EmployeePolicy policy) {
        boolean releaseTask = isReleaseTask(candidate.getTaskType());
        if (candidate.getFlightId() != null) {
            List<Map<String, Object>> flights = jdbc.queryForList(
                    "SELECT aircraft_type_id, is_release FROM flight_plan WHERE id = ?",
                    candidate.getFlightId());
            if (flights.size() != 1) {
                throw new BusinessException(422, "排班引用的航班不存在");
            }
            Map<String, Object> flight = flights.get(0);
            Object aircraftTypeId = column(flight, "aircraft_type_id");
            if (aircraftTypeId instanceof Number typeId) {
                Integer qualified = jdbc.queryForObject(
                        "SELECT COUNT(*) FROM employee_qualification WHERE employee_id = ? "
                                + "AND aircraft_type_id = ? AND status = 1 "
                                + "AND (issue_date IS NULL OR issue_date <= ?) "
                                + "AND (expire_date IS NULL OR expire_date >= ?)",
                        Integer.class, candidate.getEmployeeId(), typeId.longValue(),
                        candidate.getWorkDate(), candidate.getWorkDate());
                if (qualified == null || qualified == 0) {
                    throw new BusinessException(409, "目标员工缺少当前航班机型的有效资质");
                }
            }
            releaseTask = releaseTask || asBoolean(column(flight, "is_release"));
        }
        if (releaseTask && !Set.of("TA", "TL").contains(policy.licenseType())) {
            throw new BusinessException(409, "目标员工缺少航班放行所需执照");
        }
    }

    private List<TimeWindow> loadPersistedWindows(
            Long employeeId,
            LocalDate workDate,
            Set<Long> excludedDetailIds,
            String replacingScheduleType) {
        StringBuilder sql = new StringBuilder(
                "SELECT sd.id, sd.work_date, sd.task_start, sd.task_end, st.start_time AS shift_start, "
                        + "st.end_time AS shift_end FROM schedule_detail sd "
                        + "LEFT JOIN shift_template st ON st.id = sd.shift_id "
                        + "WHERE sd.employee_id = ? AND sd.work_date BETWEEN ? AND ? "
                        + "AND (sd.record_status IS NULL OR sd.record_status = 'active')");
        List<Object> args = new ArrayList<>();
        args.add(employeeId);
        args.add(workDate.minusDays(1));
        args.add(workDate.plusDays(1));
        if (replacingScheduleType != null && !replacingScheduleType.isBlank()) {
            sql.append(" AND (sd.schedule_type IS NULL OR sd.schedule_type <> ?)");
            args.add(replacingScheduleType);
        }
        if (!excludedDetailIds.isEmpty()) {
            sql.append(" AND sd.id NOT IN (");
            sql.append(String.join(",", java.util.Collections.nCopies(excludedDetailIds.size(), "?")));
            sql.append(')');
            args.addAll(excludedDetailIds);
        }
        List<Map<String, Object>> rows = jdbc.queryForList(sql.toString(), args.toArray());
        List<TimeWindow> windows = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            windows.add(toPersistedWindow(row));
        }
        return windows;
    }

    private TimeWindow toTimeWindow(ScheduleDetail detail) {
        if (detail.getTaskStart() != null) {
            if (!detail.getTaskEnd().isAfter(detail.getTaskStart())) {
                throw new BusinessException(400, "任务结束时间必须晚于开始时间");
            }
            return new TimeWindow(detail.getTaskStart(), detail.getTaskEnd());
        }
        if (detail.getShiftId() == null) {
            throw new BusinessException(422, "排班缺少任务时段或班次模板");
        }
        List<Map<String, Object>> shifts = jdbc.queryForList(
                "SELECT start_time, end_time FROM shift_template WHERE id = ? AND status = 1",
                detail.getShiftId());
        if (shifts.size() != 1) {
            throw new BusinessException(422, "排班引用的班次模板不存在或已停用");
        }
        return windowFromShift(detail.getWorkDate(), column(shifts.get(0), "start_time"),
                column(shifts.get(0), "end_time"));
    }

    private TimeWindow toPersistedWindow(Map<String, Object> row) {
        Object start = column(row, "task_start");
        Object end = column(row, "task_end");
        if (start instanceof LocalDateTime startTime && end instanceof LocalDateTime endTime) {
            if (!endTime.isAfter(startTime)) {
                throw new BusinessException(422, "已有活动排班的任务时段无效，请先修复历史数据");
            }
            return new TimeWindow(startTime, endTime);
        }
        LocalDate workDate = asLocalDate(column(row, "work_date"));
        return windowFromShift(workDate, column(row, "shift_start"), column(row, "shift_end"));
    }

    private TimeWindow windowFromShift(LocalDate workDate, Object startValue, Object endValue) {
        LocalTime start = asLocalTime(startValue);
        LocalTime end = asLocalTime(endValue);
        if (workDate == null || start == null || end == null) {
            throw new BusinessException(422, "排班缺少可用于合规校验的任务时段");
        }
        LocalDateTime startAt = workDate.atTime(start);
        LocalDateTime endAt = workDate.atTime(end);
        if (!endAt.isAfter(startAt)) {
            endAt = endAt.plusDays(1);
        }
        return new TimeWindow(startAt, endAt);
    }

    private void ensureNoOverlapOrInsufficientRest(TimeWindow incoming, List<TimeWindow> existing) {
        for (TimeWindow current : existing) {
            if (incoming.overlaps(current)) {
                throw new BusinessException(409, "目标员工已有时段冲突的排班");
            }
            long gap = incoming.gapMinutes(current);
            if (gap < MIN_REST_MINUTES) {
                throw new BusinessException(409, "调班后将低于最小休息间隔8小时");
            }
        }
    }

    private void ensureDailyHours(List<TimeWindow> windows, BigDecimal maxHours) {
        if (windows.isEmpty()) return;
        List<TimeWindow> sorted = windows.stream().sorted(Comparator.comparing(TimeWindow::start)).toList();
        LocalDateTime mergedStart = sorted.get(0).start();
        LocalDateTime mergedEnd = sorted.get(0).end();
        long minutes = 0;
        for (int i = 1; i < sorted.size(); i++) {
            TimeWindow next = sorted.get(i);
            if (next.start().isAfter(mergedEnd)) {
                minutes += Duration.between(mergedStart, mergedEnd).toMinutes();
                mergedStart = next.start();
                mergedEnd = next.end();
            } else if (next.end().isAfter(mergedEnd)) {
                mergedEnd = next.end();
            }
        }
        minutes += Duration.between(mergedStart, mergedEnd).toMinutes();
        if (BigDecimal.valueOf(minutes).compareTo(maxHours.multiply(BigDecimal.valueOf(60))) > 0) {
            throw new BusinessException(409, "排班后将超过员工每日最大工时");
        }
    }

    private Object column(Map<String, Object> row, String key) {
        Object exact = row.get(key);
        if (exact != null || row.containsKey(key)) return exact;
        for (Map.Entry<String, Object> entry : row.entrySet()) {
            if (entry.getKey().equalsIgnoreCase(key)) return entry.getValue();
        }
        return null;
    }

    private LocalDate asLocalDate(Object value) {
        if (value instanceof LocalDate date) return date;
        if (value instanceof java.sql.Date date) return date.toLocalDate();
        if (value == null) return null;
        return LocalDate.parse(String.valueOf(value));
    }

    private LocalTime asLocalTime(Object value) {
        if (value instanceof LocalTime time) return time;
        if (value instanceof Time time) return time.toLocalTime();
        if (value == null) return null;
        return LocalTime.parse(String.valueOf(value));
    }

    private boolean asBoolean(Object value) {
        if (value instanceof Boolean bool) return bool;
        if (value instanceof Number number) return number.intValue() != 0;
        return value != null && ("true".equalsIgnoreCase(String.valueOf(value)) || "1".equals(String.valueOf(value)));
    }

    private boolean isReleaseTask(String taskType) {
        String normalized = taskType == null ? "" : taskType.trim().toUpperCase(Locale.ROOT);
        return normalized.contains("RELEASE") || normalized.contains("放行");
    }

    private record EmployeePolicy(BigDecimal maxHoursPerDay, String licenseType) {}
    private record EmployeeDate(Long employeeId, LocalDate workDate) {}
    private record TimeWindow(LocalDateTime start, LocalDateTime end) {
        boolean overlaps(TimeWindow other) {
            return start.isBefore(other.end) && end.isAfter(other.start);
        }

        long gapMinutes(TimeWindow other) {
            if (!end.isAfter(other.start)) return Duration.between(end, other.start).toMinutes();
            return Duration.between(other.end, start).toMinutes();
        }
    }
}
