package com.qyf.hangyi.schedule.service.impl;

import com.qyf.hangyi.common.exception.BusinessException;
import com.qyf.hangyi.schedule.dto.SmartScheduleRequest;
import com.qyf.hangyi.schedule.dto.MultiDayScheduleRequest;
import com.qyf.hangyi.schedule.dto.RoleScheduleRequest;
import com.qyf.hangyi.schedule.entity.ScheduleDetail;
import com.qyf.hangyi.schedule.mapper.ScheduleDetailMapper;
import com.qyf.hangyi.schedule.service.ScheduleAssignmentComplianceService;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.qyf.hangyi.schedule.solver.ShiftRules;
import com.qyf.hangyi.schedule.solver.domain.SchedulePlan;
import com.qyf.hangyi.schedule.solver.service.OptaPlannerScheduleService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * 智能排班 Service（OptaPlanner 委派门面）。
 *
 * <p>自 T16 (2026-06-19) 起改为门面：
 * <ul>
 *   <li>{@code smartSchedule} 委派给 {@link OptaPlannerScheduleService#solve(SmartScheduleRequest)}</li>
 *   <li>{@code smartScheduleMultiDay} 外层循环按天委派给单日 smartSchedule</li>
 *   <li>{@code smartScheduleWithRoles} 按机型资质、放行执照、请假和当日占用分配角色任务</li>
 *   <li>{@code optimizeStaffSchedule} 保留纯 SQL 分析（不走求解器）</li>
 * </ul>
 *
 * <p>下列方法不在 T16 重构范围，保留旧实现以避免 controller 端点回归：
 * {@code importFromTSV} / {@code completeSchedule} /
 * {@code getScheduleHistory} / {@code getScheduleHistoryFull} / {@code timeToShiftCode}。</p>
 */
@Service
public class SmartScheduleService {

    @Autowired private OptaPlannerScheduleService solver;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private ScheduleDetailMapper detailMapper;
    @Autowired private TransactionTemplate transactionTemplate;
    @Autowired private ScheduleAssignmentComplianceService complianceService;

    /** 每次查询 shift_template 表，避免缓存脏读（模板可能被管理员修改） */
    private Map<String, Long> getShiftIdMap() {
        Map<String, Long> loaded = new HashMap<>();
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT id, shift_code FROM shift_template WHERE status = 1");
        for (Map<String, Object> r : rows) {
            loaded.put(String.valueOf(r.get("shift_code")), ((Number) r.get("id")).longValue());
        }
        return loaded;
    }

    /**
     * 单日智能排班。委派给 OptaPlanner 求解；非预览模式写 schedule_detail。
     * 整个流程在 @Transactional 内：getOrCreateScheduleHeader 的 SELECT/INSERT +
     * writeDetails 的 DELETE/INSERT 共享同一连接，避免 HikariCP 切连接导致
     * LAST_INSERT_ID() 错位和 uk_emp_date 死锁。
     */
    @org.springframework.transaction.annotation.Transactional
    public Map<String, Object> smartSchedule(SmartScheduleRequest req) {
        SchedulePlan plan = solver.solve(req);

        if (!req.isPreview()) {
            Long scheduleId = getOrCreateScheduleHeader(req.getScheduleDate());
            writeDetails(scheduleId, plan, req.getScheduleDate());
        }

        return toResponse(plan);
    }

    /**
     * 多日智能排班：外层循环每天取当天 SCHEDULED 航班，逐日委派给 smartSchedule。
     * 单日失败不影响其他天，结果中带 error 字段。
     */
    public Map<String, Object> smartScheduleMultiDay(MultiDayScheduleRequest req) {
        LocalDate start = req.getStartDate();
        LocalDate end = req.getEndDate();
        long days = ChronoUnit.DAYS.between(start, end) + 1;
        List<Map<String, Object>> results = new ArrayList<>();
        for (int i = 0; i < days; i++) {
            LocalDate d = start.plusDays(i);
            List<Long> fIds = jdbc.queryForList(
                    "SELECT id FROM flight_plan WHERE status = 'SCHEDULED' AND plan_date = ? ORDER BY plan_time",
                    Long.class, d);
            SmartScheduleRequest sreq = new SmartScheduleRequest();
            sreq.setScheduleDate(d);
            sreq.setFlightIds(fIds);
            sreq.setGroupId(req.getGroupId());
            sreq.setPreview(req.isPreview());
            try {
                Map<String, Object> dayResult = transactionTemplate.execute(
                        status -> smartSchedule(sreq));
                if (dayResult == null) {
                    throw new BusinessException(500, "当日排班事务未返回结果");
                }
                results.add(dayResult);
            } catch (Exception e) {
                Map<String, Object> err = new HashMap<>();
                err.put("date", d.toString());
                err.put("error", e.getMessage());
                results.add(err);
            }
        }
        Map<String, Object> resp = new HashMap<>();
        resp.put("dateRange", Map.of("start", start.toString(), "end", end.toString()));
        resp.put("days", days);
        resp.put("results", results);
        return resp;
    }

    /** 行政角色排班：按任务所需人数分配当日可用且资质匹配的员工。 */
    @Transactional
    public Map<String, Object> smartScheduleWithRoles(RoleScheduleRequest req) {
        LocalDate date = req.getScheduleDate();
        Set<Long> selectedEmployeeIds = new HashSet<>();
        List<RoleScheduleSelection> selections = new ArrayList<>();
        for (RoleScheduleRequest.RoleAssignment assignment : req.getAssignments()) {
            Map<String, Object> flight = requireScheduledFlight(assignment.getFlightNo(), date);
            Long flightId = numberValue(flight.get("id"), "航班编号");
            String aircraftType = assignment.getAircraftType() == null
                    || assignment.getAircraftType().isBlank()
                    ? String.valueOf(flight.getOrDefault("aircraft_type_name", ""))
                    : assignment.getAircraftType().trim();
            boolean releaseTask = isReleaseTask(assignment.getTaskType());
            List<Map<String, Object>> candidates = findRoleCandidates(date, aircraftType, releaseTask);
            List<Map<String, Object>> available = candidates.stream()
                    .filter(candidate -> !selectedEmployeeIds.contains(
                            numberValue(candidate.get("id"), "员工编号")))
                    .limit(assignment.getRequiredCount())
                    .toList();
            if (available.size() < assignment.getRequiredCount()) {
                throw new BusinessException(422,
                        assignment.getFlightNo() + " 的“" + assignment.getTaskType()
                                + "”任务可用资质人员不足，需要 " + assignment.getRequiredCount()
                                + " 人，当前仅 " + available.size() + " 人");
            }
            for (Map<String, Object> employee : available) {
                Long employeeId = numberValue(employee.get("id"), "员工编号");
                selectedEmployeeIds.add(employeeId);
                selections.add(new RoleScheduleSelection(
                        flightId,
                        assignment.getFlightNo(),
                        String.valueOf(flight.getOrDefault("airline", assignment.getAirline())),
                        aircraftType,
                        assignment.getTaskType().trim(),
                        toLocalTime(flight.get("plan_time")),
                        employeeId,
                        String.valueOf(employee.getOrDefault("name", "")),
                        String.valueOf(employee.getOrDefault("emp_no", ""))));
            }
        }

        Long scheduleId = getOrCreateScheduleHeader(date);
        jdbc.update("DELETE FROM schedule_detail WHERE work_date = ? AND source = 'ADMIN_ROLES'", date);
        Map<String, Long> shiftIds = getShiftIdMap();
        for (RoleScheduleSelection selection : selections) {
            String shiftCode = ShiftRules.timeToShiftCode(
                    selection.planTime(), ShiftRules.MORNING_START, ShiftRules.EVENING_START);
            Long shiftId = shiftIds.get(shiftCode);
            if (shiftId == null) {
                throw new BusinessException(422, "班次模板缺少 " + shiftCode + " 班次");
            }
            ScheduleDetail detail = new ScheduleDetail();
            detail.setScheduleId(scheduleId);
            detail.setEmployeeId(selection.employeeId());
            detail.setWorkDate(date);
            detail.setShiftId(shiftId);
            detail.setShiftGroup(shiftCode);
            detail.setScheduleType("ADMIN_ROLES");
            detail.setFlightId(selection.flightId());
            detail.setTaskType(selection.taskType());
            if (selection.planTime() != null) {
                detail.setTaskStart(date.atTime(selection.planTime()));
                detail.setTaskEnd(date.atTime(selection.planTime()).plusHours(1));
            }
            detail.setSource("ADMIN_ROLES");
            detail.setRecordStatus("active");
            detailMapper.insert(detail);
        }

        List<Map<String, Object>> responseAssignments = selections.stream()
                .map(selection -> {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("flightId", selection.flightId());
                    item.put("flightNo", selection.flightNo());
                    item.put("airline", selection.airline());
                    item.put("aircraftType", selection.aircraftType());
                    item.put("taskType", selection.taskType());
                    item.put("staffId", selection.employeeId());
                    item.put("staffName", selection.employeeName());
                    item.put("staffEmployeeNo", selection.employeeNo());
                    return item;
                })
                .toList();
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("scheduleId", scheduleId);
        response.put("scheduleDate", date.toString());
        response.put("scheduleType", "ADMIN_ROLES");
        response.put("assignedCount", selections.size());
        response.put("assignments", responseAssignments);
        return response;
    }

    /**
     * 优化建议：纯 SQL 分析，不走求解器。找出当月排班过载员工（>3 次）。
     */
    public Map<String, Object> optimizeStaffSchedule(Map<String, Object> payload) {
        // M-12: 接受 payload.monthStart（格式 yyyy-MM-dd），缺省当月 1 号
        LocalDate monthStart;
        Object ms = payload != null ? payload.get("monthStart") : null;
        if (ms instanceof String s && !s.isBlank()) {
            monthStart = LocalDate.parse(s).withDayOfMonth(1);
        } else if (ms instanceof LocalDate ld) {
            monthStart = ld.withDayOfMonth(1);
        } else {
            monthStart = LocalDate.now().withDayOfMonth(1);
        }
        LocalDate nextMonth = monthStart.plusMonths(1);
        List<Map<String, Object>> overloaded = jdbc.queryForList(
                "SELECT sd.employee_id, COUNT(*) AS cnt, e.name FROM schedule_detail sd " +
                "JOIN employee e ON e.id = sd.employee_id " +
                "WHERE sd.work_date >= ? AND sd.work_date < ? " +
                "AND (sd.record_status IS NULL OR sd.record_status = 'active') " +
                "GROUP BY sd.employee_id, e.name HAVING cnt > 3 ORDER BY cnt DESC",
                monthStart, nextMonth);
        List<Map<String, Object>> details = new ArrayList<>();
        for (Map<String, Object> r : overloaded) {
            Map<String, Object> d = new HashMap<>();
            d.put("employeeId", r.get("employee_id"));
            d.put("name", r.get("name"));
            d.put("scheduleCount", r.get("cnt"));
            details.add(d);
        }
        Map<String, Object> resp = new HashMap<>();
        resp.put("overloadedStaff", details.size());
        resp.put("details", details);
        resp.put("monthStart", monthStart.toString());
        resp.put("suggestion", "建议将任务从高负荷员工重新分配给低负荷员工");
        return resp;
    }

    // ─── 保留旧实现（T16 不动，避免 controller 端点回归）───

    /**
     * TSV 批量导入。保留原实现，T16 不涉及。
     */
    @Transactional
    public Map<String, Object> importFromTSV(String tsvContent, String scheduleDate) {
        if (tsvContent == null || tsvContent.isBlank()) {
            throw new BusinessException(400, "TSV内容为空");
        }
        LocalDate date = parseImportDate(scheduleDate);
        Long scheduleId = getOrCreateScheduleHeader(date);
        String[] lines = tsvContent.split("\\R");
        List<ScheduleDetail> candidates = new ArrayList<>();
        Set<String> sourceKeys = new HashSet<>();
        for (int i = 1; i < lines.length; i++) {
            String line = lines[i].trim();
            if (line.isEmpty()) continue;
            String[] cols = line.split("\t", -1);
            if (cols.length < 2) {
                throw new BusinessException(400, "TSV 第 " + (i + 1) + " 行至少需要航班号和员工工号");
            }
            String flightNo = cols[0].trim();
            String employeeNo = cols[1].trim();
            if (flightNo.isEmpty() || employeeNo.isEmpty()) {
                throw new BusinessException(400, "TSV 第 " + (i + 1) + " 行航班号或员工工号为空");
            }
            List<Long> employeeIds = jdbc.query(
                    "SELECT id FROM employee WHERE emp_no = ? AND status = 1",
                    (rs, rowNum) -> rs.getLong(1), employeeNo);
            if (employeeIds.size() != 1) {
                throw new BusinessException(400, "TSV 第 " + (i + 1) + " 行员工不存在或已停用");
            }
            List<Long> flightIds = jdbc.query(
                    "SELECT id FROM flight_plan WHERE flight_no = ? AND plan_date = ? " +
                            "AND status = 'SCHEDULED' ORDER BY plan_time, id",
                    (rs, rowNum) -> rs.getLong(1), flightNo, date);
            if (flightIds.isEmpty()) {
                throw new BusinessException(400, "TSV 第 " + (i + 1) + " 行航班不存在");
            }
            String shiftCode = cols.length > 2 && !cols[2].isBlank()
                    ? cols[2].trim().toUpperCase(Locale.ROOT) : "MORNING";
            Long shiftId = getShiftIdMap().get(shiftCode);
            if (shiftId == null) {
                throw new BusinessException(400, "TSV 第 " + (i + 1) + " 行班次编码不存在");
            }

            ScheduleDetail detail = new ScheduleDetail();
            detail.setScheduleId(scheduleId);
            detail.setEmployeeId(employeeIds.get(0));
            detail.setWorkDate(date);
            detail.setShiftId(shiftId);
            detail.setShiftGroup(shiftCode);
            detail.setScheduleType("MANUAL");
            detail.setFlightId(flightIds.get(0));
            detail.setSource("TSV");
            detail.setRecordStatus("active");
            String sourceKey = "TSV:" + date + ":" + detail.getFlightId() + ":"
                    + detail.getEmployeeId() + ":" + detail.getShiftId();
            if (!sourceKeys.add(sourceKey)) {
                throw new BusinessException(409, "TSV 中存在重复的航班、员工和班次组合");
            }
            detail.setSourceKey(sourceKey);
            if (cols.length > 3 && !cols[3].isBlank()) {
                detail.setTaskStart(date.atTime(parseTsvTime(cols[3], i + 1, "开始时间")));
            }
            if (cols.length > 4 && !cols[4].isBlank()) {
                LocalTime endTime = parseTsvTime(cols[4], i + 1, "结束时间");
                LocalDateTime end = date.atTime(endTime);
                if (detail.getTaskStart() != null && !end.isAfter(detail.getTaskStart())) {
                    end = end.plusDays(1);
                }
                detail.setTaskEnd(end);
            }
            detail.setRemark("TSV import: " + flightNo);
            candidates.add(detail);
        }
        if (candidates.isEmpty()) {
            throw new BusinessException(400, "TSV 中没有可导入的排班记录");
        }

        Map<String, Long> existingIds = new HashMap<>();
        for (ScheduleDetail candidate : candidates) {
            ScheduleDetail existing = detailMapper.selectOne(
                    new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<ScheduleDetail>()
                            .eq(ScheduleDetail::getSourceKey, candidate.getSourceKey()));
            if (existing != null) {
                existingIds.put(candidate.getSourceKey(), existing.getId());
            }
        }
        complianceService.validateAssignments(candidates, new HashSet<>(existingIds.values()), null);
        for (ScheduleDetail candidate : candidates) {
            Long existingId = existingIds.get(candidate.getSourceKey());
            if (existingId != null) {
                candidate.setId(existingId);
                detailMapper.updateById(candidate);
            } else {
                detailMapper.insert(candidate);
            }
        }
        Map<String, Object> resp = new HashMap<>();
        resp.put("scheduleDate", scheduleDate);
        resp.put("importedCount", candidates.size());
        return resp;
    }

    private LocalTime parseTsvTime(String value, int rowNumber, String fieldName) {
        try {
            return LocalTime.parse(value.trim());
        } catch (java.time.format.DateTimeParseException exception) {
            throw new BusinessException(400,
                    "TSV 第 " + rowNumber + " 行" + fieldName + "格式应为 HH:mm");
        }
    }

    private LocalDate parseImportDate(String value) {
        try {
            return LocalDate.parse(value);
        } catch (RuntimeException exception) {
            throw new BusinessException(400, "排班日期格式应为 YYYY-MM-DD");
        }
    }

    private Map<String, Object> requireScheduledFlight(String flightNo, LocalDate date) {
        List<Map<String, Object>> flights = jdbc.queryForList(
                "SELECT id, flight_no, airline, aircraft_type_name, plan_time " +
                        "FROM flight_plan WHERE flight_no = ? AND plan_date = ? " +
                        "AND status = 'SCHEDULED' ORDER BY plan_time, id",
                flightNo, date);
        if (flights.size() != 1) {
            throw new BusinessException(422,
                    flights.isEmpty() ? "排班日期没有航班 " + flightNo
                            : "同日存在多个航班号 " + flightNo + "，无法唯一识别");
        }
        return flights.get(0);
    }

    private List<Map<String, Object>> findRoleCandidates(
            LocalDate date, String aircraftType, boolean releaseTask) {
        StringBuilder sql = new StringBuilder(
                "SELECT e.id, e.name, e.emp_no, e.license_type, " +
                        "(SELECT COUNT(*) FROM schedule_detail history " +
                        " WHERE history.employee_id = e.id " +
                        " AND history.work_date >= ? AND history.work_date < ? " +
                        " AND (history.record_status IS NULL OR history.record_status = 'active')) AS workload " +
                        "FROM employee e WHERE e.status = 1 " +
                        "AND NOT EXISTS (SELECT 1 FROM leave_request lr WHERE lr.employee_id = e.id " +
                        " AND lr.status = 1 AND lr.start_date <= ? AND lr.end_date >= ?) " +
                        "AND NOT EXISTS (SELECT 1 FROM schedule_detail occupied " +
                        " WHERE occupied.employee_id = e.id AND occupied.work_date = ? " +
                        " AND (occupied.record_status IS NULL OR occupied.record_status = 'active') " +
                        " AND (occupied.source IS NULL OR occupied.source <> 'ADMIN_ROLES')) ");
        List<Object> params = new ArrayList<>();
        params.add(date.withDayOfMonth(1));
        params.add(date.withDayOfMonth(1).plusMonths(1));
        params.add(date);
        params.add(date);
        params.add(date);
        if (aircraftType != null && !aircraftType.isBlank()) {
            sql.append("AND EXISTS (SELECT 1 FROM employee_qualification eq " +
                    "JOIN aircraft_type at ON at.id = eq.aircraft_type_id " +
                    "WHERE eq.employee_id = e.id AND eq.status = 1 " +
                    "AND (eq.issue_date IS NULL OR eq.issue_date <= ?) " +
                    "AND (eq.expire_date IS NULL OR eq.expire_date >= ?) " +
                    "AND (at.type_name = ? OR at.type_code = ?)) ");
            params.add(date);
            params.add(date);
            params.add(aircraftType);
            params.add(aircraftType);
        }
        if (releaseTask) {
            sql.append("AND e.license_type IN ('TA', 'TL') ");
        }
        sql.append("ORDER BY workload, e.id");
        return jdbc.queryForList(sql.toString(), params.toArray());
    }

    private boolean isReleaseTask(String taskType) {
        String normalized = taskType == null ? "" : taskType.trim().toUpperCase(Locale.ROOT);
        return normalized.contains("RELEASE") || normalized.contains("放行");
    }

    private Long numberValue(Object value, String label) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        try {
            return Long.valueOf(String.valueOf(value));
        } catch (RuntimeException exception) {
            throw new BusinessException(502, label + "格式异常");
        }
    }

    private LocalTime toLocalTime(Object value) {
        if (value instanceof LocalTime time) {
            return time;
        }
        if (value instanceof java.sql.Time time) {
            return time.toLocalTime();
        }
        if (value == null || String.valueOf(value).isBlank()) {
            return null;
        }
        return LocalTime.parse(String.valueOf(value));
    }

    private record RoleScheduleSelection(
            Long flightId,
            String flightNo,
            String airline,
            String aircraftType,
            String taskType,
            LocalTime planTime,
            Long employeeId,
            String employeeName,
            String employeeNo) {
    }

    /** 完成排班（手动标记完成） */
    @Transactional
    public void completeSchedule(Long detailId) {
        ScheduleDetail detail = detailMapper.selectById(detailId);
        if (detail == null) throw new BusinessException(404, "排班记录不存在");
        if ("archived".equalsIgnoreCase(detail.getRecordStatus())) {
            throw new BusinessException(409, "归档排班不能标记完成");
        }
        if (Boolean.TRUE.equals(detail.getNeedsReassignment())) {
            throw new BusinessException(409, "待改派排班不能标记完成");
        }
        if ("COMPLETED".equals(detail.getScheduleType())) {
            throw new BusinessException(409, "该排班已完成");
        }
        Integer publishable = jdbc.queryForObject(
                "SELECT COUNT(*) FROM schedule s JOIN schedule_detail sd ON sd.schedule_id = s.id "
                        + "WHERE sd.id = ? AND s.status = 1 AND sd.work_date <= ? "
                        + "AND (sd.record_status IS NULL OR sd.record_status = 'active')",
                Integer.class, detailId, LocalDate.now());
        if (publishable == null || publishable != 1) {
            throw new BusinessException(409, "只能完成当前已发布且已生效的排班");
        }
        int updated = detailMapper.update(null, new LambdaUpdateWrapper<ScheduleDetail>()
                .eq(ScheduleDetail::getId, detailId)
                .and(wrapper -> wrapper.isNull(ScheduleDetail::getRecordStatus)
                        .or().eq(ScheduleDetail::getRecordStatus, "active"))
                .and(wrapper -> wrapper.isNull(ScheduleDetail::getScheduleType)
                        .or().ne(ScheduleDetail::getScheduleType, "COMPLETED"))
                .set(ScheduleDetail::getScheduleType, "COMPLETED"));
        if (updated != 1) {
            throw new BusinessException(409, "排班状态已变化，请刷新后重试");
        }
    }

    public List<Map<String, Object>> getScheduleHistory(String scheduleDate) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT sd.*, e.name as employee_name, e.emp_no as emp_no, " +
                        "st.shift_name, st.shift_code, f.flight_no " +
                        "FROM schedule_detail sd " +
                        "LEFT JOIN employee e ON sd.employee_id = e.id " +
                        "LEFT JOIN shift_template st ON sd.shift_id = st.id " +
                        "LEFT JOIN flight_plan f ON sd.flight_id = f.id " +
                        "WHERE sd.work_date = ? AND (sd.record_status IS NULL OR sd.record_status = 'active') " +
                        "ORDER BY sd.shift_group, e.name",
                scheduleDate);
        return rows;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getScheduleHistoryFull(String scheduleDate) {
        Map<String, Object> result = new HashMap<>();

        List<Map<String, Object>> active = jdbc.queryForList(
                "SELECT sd.id, sd.employee_id, sd.work_date, sd.shift_group as shift_code, " +
                        "sd.schedule_type as status, sd.created_at, " +
                        "e.name as staff_name, e.emp_no as staff_employee_no, " +
                        "st.shift_name, f.flight_no " +
                        "FROM schedule_detail sd " +
                        "LEFT JOIN employee e ON sd.employee_id = e.id " +
                        "LEFT JOIN shift_template st ON sd.shift_id = st.id " +
                        "LEFT JOIN flight_plan f ON sd.flight_id = f.id " +
                        "WHERE sd.work_date = ? AND sd.schedule_type != 'COMPLETED' " +
                        "AND (sd.record_status IS NULL OR sd.record_status = 'active') " +
                        "ORDER BY st.shift_name, e.name",
                scheduleDate);

        List<Map<String, Object>> archived = jdbc.queryForList(
                "SELECT sd.id, sd.employee_id, sd.work_date, sd.shift_group as shift_code, " +
                        "sd.schedule_type as status, sd.updated_at as archived_at, " +
                        "e.name as staff_name, e.emp_no as staff_employee_no, " +
                        "st.shift_name, f.flight_no " +
                        "FROM schedule_detail sd " +
                        "LEFT JOIN employee e ON sd.employee_id = e.id " +
                        "LEFT JOIN shift_template st ON sd.shift_id = st.id " +
                        "LEFT JOIN flight_plan f ON sd.flight_id = f.id " +
                        "WHERE sd.work_date = ? AND (sd.schedule_type = 'COMPLETED' " +
                        "OR sd.record_status = 'archived') " +
                        "ORDER BY sd.updated_at DESC",
                scheduleDate);

        List<Map<String, Object>> publishHistory = jdbc.queryForList(
                "SELECT s.id, s.schedule_name as detail, s.published_at as created_at, " +
                        "s.created_by, 'PUBLISH_SCHEDULE' as action " +
                        "FROM schedule s " +
                        "WHERE s.status = 1 AND (s.start_date <= ? AND s.end_date >= ?) " +
                        "ORDER BY s.published_at DESC",
                scheduleDate, scheduleDate);

        result.put("active", active);
        result.put("archived", archived);
        result.put("activeCount", active.size());
        result.put("archivedCount", archived.size());
        result.put("publishHistory", publishHistory);
        return result;
    }

    // ─── 辅助方法 ───

    private Long getOrCreateScheduleHeader(LocalDate date) {
        // 1) 优先复用当天已有的智能排班 header（同事务内 SELECT 锁保证并发安全）
        List<Map<String, Object>> existing = jdbc.queryForList(
                "SELECT id FROM schedule " +
                "WHERE start_date <= ? AND end_date >= ? AND schedule_name LIKE '智能排班%' " +
                "ORDER BY id DESC LIMIT 1", date, date);
        if (!existing.isEmpty()) {
            return ((Number) existing.get(0).get("id")).longValue();
        }
        // 2) INSERT 新 header（用 KeyHolder 拿自增 ID，避开 LAST_INSERT_ID 跨连接问题）
        // 注：group_id 不再"复用"——智能排班是全站视角，置 NULL
        String scheduleName = "智能排班 " + date;
        org.springframework.jdbc.support.GeneratedKeyHolder kh =
                new org.springframework.jdbc.support.GeneratedKeyHolder();
        jdbc.update(con -> {
            java.sql.PreparedStatement ps = con.prepareStatement(
                    "INSERT INTO schedule (schedule_name, start_date, end_date, status, created_at) " +
                            "VALUES (?, ?, ?, 0, NOW())",
                    java.sql.Statement.RETURN_GENERATED_KEYS);
            ps.setString(1, scheduleName);
            ps.setObject(2, date);
            ps.setObject(3, date);
            return ps;
        }, kh);
        Number key = kh.getKey();
        if (key == null) throw new BusinessException(500, "INSERT schedule 未返回自增 ID");
        return key.longValue();
    }

    /**
     * 把求解器产出的 SchedulePlan 落库为 schedule_detail。
     * 跳过未分配的（assignedEmployee == null）。
     * 幂等：先清掉当天 source=SMART 的旧行（避免 uk_emp_date 重复键冲突），
     *       再 INSERT 新行。仅在 smartSchedule 的 @Transactional 内调用。
     */
    @Transactional
    protected void writeDetails(Long scheduleId, SchedulePlan plan, LocalDate date) {
        // 1) 幂等：清掉当天旧的 SMART 源行
        int deleted = jdbc.update(
                "DELETE FROM schedule_detail WHERE work_date = ? AND source = 'SMART'",
                date);

        // 2) 构建 shift_code → shift_id 映射
        Map<String, Long> shiftIdMap = getShiftIdMap();

        // 3) C-3: 查询当天已存在的 (employee_id) — 含 MANUAL 行；solver 不知道
        //    uk_emp_date 唯一键，求解时会把已排员工也指派，第二次 INSERT 撞键。
        //    在写库前先预查占用集合，写入时直接跳过，让问题在数据层隐式消失。
        Set<Long> busyEmpIds = new HashSet<>();
        jdbc.query(
                "SELECT DISTINCT employee_id FROM schedule_detail WHERE work_date = ? " +
                        "AND (record_status IS NULL OR record_status = 'active')",
                rs -> { while (rs.next()) busyEmpIds.add(rs.getLong(1)); },
                date);

        // 4) 逐个 INSERT 使用 MyBatis-Plus（O-7: MetaObjectHandler 自动填充 created_at/updated_at）
        int inserted = 0;
        int skippedBusy = 0;
        for (var a : plan.getAssignmentList()) {
            if (a.getAssignedEmployee() == null) continue;
            Long shiftId = shiftIdMap.get(a.getRequiredShiftCode());
            if (shiftId == null) {
                a.setAssignedEmployee(null);
                continue;
            }
            Long empId = a.getAssignedEmployee().getId();
            if (busyEmpIds.contains(empId)) {
                skippedBusy++;
                a.setAssignedEmployee(null);
                continue;
            }
            ScheduleDetail detail = new ScheduleDetail();
            detail.setScheduleId(scheduleId);
            detail.setEmployeeId(empId);
            detail.setWorkDate(date);
            detail.setShiftId(shiftId);
            detail.setShiftGroup(a.getRequiredShiftCode());
            detail.setScheduleType("SMART");
            detail.setFlightId(a.getFlightId());
            detail.setSource("SMART");
            detail.setRecordStatus("active");
            detailMapper.insert(detail);
            inserted++;
        }
        org.slf4j.LoggerFactory.getLogger(SmartScheduleService.class)
                .info("writeDetails: date={} scheduleId={} deleted={} inserted={} skippedBusy={}",
                        date, scheduleId, deleted, inserted, skippedBusy);
    }

    /**
     * 把求解器结果序列化为与旧实现兼容的 Map 响应。
     * 注：去掉旧实现的 continuousDays（求解器约束自动管疲劳，重复字段不需要）。
     */
    private Map<String, Object> toResponse(SchedulePlan plan) {
        // 构建 flightId → Flight 映射（响应补充 flightNo/airline/aircraftType）
        Map<Long, com.qyf.hangyi.schedule.solver.domain.Flight> flightMap = new HashMap<>();
        for (var f : plan.getFlightList()) flightMap.put(f.getId(), f);

        List<Map<String, Object>> assignments = new ArrayList<>();
        int unassigned = 0;
        for (var a : plan.getAssignmentList()) {
            Map<String, Object> r = new HashMap<>();
            r.put("flightId", a.getFlightId());
            r.put("shiftCode", a.getRequiredShiftCode());
            var fl = flightMap.get(a.getFlightId());
            if (fl != null) {
                r.put("flightNo", fl.getFlightNo());
                r.put("airline", fl.getAirline());
                r.put("aircraftType", fl.getAircraftTypeName());
            }
            if (a.getAssignedEmployee() != null) {
                r.put("staffId", a.getAssignedEmployee().getId());
                r.put("staffName", a.getAssignedEmployee().getName());
                r.put("staffEmployeeNo", a.getAssignedEmployee().getEmpNo());
            } else {
                r.put("staffId", null);
                r.put("staffName", "");
                r.put("warning", "无人可用");
                unassigned++;
            }
            assignments.add(r);
        }
        Map<String, Object> resp = new HashMap<>();
        resp.put("scheduleDate", plan.getScheduleDate().toString());
        resp.put("preview", plan.isPreview());
        resp.put("assignments", assignments);
        resp.put("totalFlights", plan.getFlightList().size());
        resp.put("assignedCount", assignments.size() - unassigned);
        resp.put("unassignedCount", unassigned);

        var score = plan.getScore();
        if (score != null) {
            Map<String, Object> sm = new HashMap<>();
            sm.put("engine", "optaplanner-9.44.0");
            sm.put("score", score.hardScore() + "hard/" + score.softScore() + "soft");
            sm.put("feasible", score.hardScore() >= 0);
            sm.put("termination", "TIME_LIMIT");
            resp.put("solver", sm);
        }
        return resp;
    }
}
