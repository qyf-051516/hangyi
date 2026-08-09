package com.qyf.hangyi.core.auth.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.qyf.hangyi.common.exception.BusinessException;
import com.qyf.hangyi.core.auth.entity.RptFlight;
import com.qyf.hangyi.core.auth.entity.RptSchedule;
import com.qyf.hangyi.core.auth.entity.RptStaff;
import com.qyf.hangyi.core.auth.entity.RptSwapRequest;
import com.qyf.hangyi.core.auth.entity.RptSyncLog;
import com.qyf.hangyi.core.auth.entity.Schedule;
import com.qyf.hangyi.core.auth.entity.ScheduleChange;
import com.qyf.hangyi.core.auth.entity.ScheduleDetail;
import com.qyf.hangyi.core.auth.audit.entity.OperationLog;
import com.qyf.hangyi.core.auth.audit.mapper.OperationLogMapper;
import com.qyf.hangyi.core.auth.mapper.*;
import com.qyf.hangyi.core.employee.entity.AircraftType;
import com.qyf.hangyi.core.employee.entity.Employee;
import com.qyf.hangyi.core.employee.entity.EmployeeQualification;
import com.qyf.hangyi.core.employee.entity.TeamGroup;
import com.qyf.hangyi.core.employee.mapper.AircraftTypeMapper;
import com.qyf.hangyi.core.employee.mapper.EmployeeMapper;
import com.qyf.hangyi.core.employee.mapper.EmployeeQualificationMapper;
import com.qyf.hangyi.core.employee.mapper.TeamGroupMapper;
import com.qyf.hangyi.core.employee.leave.entity.LeaveRequest;
import com.qyf.hangyi.core.employee.leave.mapper.LeaveRequestMapper;
import com.qyf.hangyi.core.flight.entity.FlightPlan;
import com.qyf.hangyi.core.flight.mapper.FlightPlanMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class SyncService {

    private static final Logger log = LoggerFactory.getLogger(SyncService.class);
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    @Autowired private RptStaffMapper rptStaffMapper;
    @Autowired private RptFlightMapper rptFlightMapper;
    @Autowired private RptScheduleMapper rptScheduleMapper;
    @Autowired private RptSwapRequestMapper rptSwapRequestMapper;
    @Autowired private RptSyncLogMapper rptSyncLogMapper;
    @Autowired private EmployeeMapper employeeMapper;
    @Autowired private TeamGroupMapper teamGroupMapper;
    @Autowired private FlightPlanMapper flightPlanMapper;
    @Autowired private ScheduleDetailMapper scheduleDetailMapper;
    @Autowired private ScheduleChangeMapper scheduleChangeMapper;
    @Autowired private OperationLogMapper operationLogMapper;
    @Autowired private EmployeeQualificationMapper qualificationMapper;
    @Autowired private AircraftTypeMapper aircraftTypeMapper;
    @Autowired private ScheduleMapper scheduleMapper;
    @Autowired private LeaveRequestMapper leaveRequestMapper;

    /**
     * 多集合同步必须作为单个事务提交，避免前半批已落库、后半批失败后云端游标
     * 却继续推进造成跨端永久不一致。单集合入口仍保持各自的事务边界。
     */
    @Transactional(rollbackFor = Exception.class)
    public int syncBatch(Map<String, List<Map<String, Object>>> payload) {
        int total = 0;
        if (payload.containsKey("staff")) total += syncStaff(payload.get("staff"));
        if (payload.containsKey("flights")) total += syncFlights(payload.get("flights"));
        if (payload.containsKey("schedules")) total += syncSchedules(payload.get("schedules"));
        if (payload.containsKey("swap_requests")) total += syncSwapRequests(payload.get("swap_requests"));
        if (payload.containsKey("swap-requests")) total += syncSwapRequests(payload.get("swap-requests"));
        if (payload.containsKey("leave_requests")) total += syncLeaveRequests(payload.get("leave_requests"));
        if (payload.containsKey("leave-requests")) total += syncLeaveRequests(payload.get("leave-requests"));
        if (payload.containsKey("operation_logs")) total += syncOperationLogs(payload.get("operation_logs"));
        if (payload.containsKey("operation-logs")) total += syncOperationLogs(payload.get("operation-logs"));
        return total;
    }

    // ─── Staff ─────────────────────────────────────────────────

    @Transactional(rollbackFor = Exception.class)
    public int syncStaff(List<Map<String, Object>> records) {
        String batch = UUID.randomUUID().toString();
        int count = 0;
        // 确保 team_group 存在
        Map<String, Long> groupMap = ensureTeamGroups(records);
        for (Map<String, Object> rec : records) {
            String empNo = requiredText(rec, "employeeNo", "员工工号");
            upsertRptStaff(rec, empNo);
            upsertEmployee(rec, empNo, groupMap);
            count++;
        }
        logSync("staff", "INSERT", null, count, "SUCCESS", null, batch);
        return count;
    }

    // ─── Flights ───────────────────────────────────────────────

    @Transactional(rollbackFor = Exception.class)
    public int syncFlights(List<Map<String, Object>> records) {
        String batch = UUID.randomUUID().toString();
        int count = 0;
        for (Map<String, Object> rec : records) {
            String flightNo = requiredText(rec, "flightNo", "航班号");
            String schedDate = requiredText(rec, "scheduleDate", "航班日期");
            upsertRptFlight(rec, flightNo, schedDate);
            upsertFlightPlan(rec, flightNo, schedDate);
            count++;
        }
        logSync("flights", "INSERT", null, count, "SUCCESS", null, batch);
        return count;
    }

    // ─── Schedules ─────────────────────────────────────────────

    @Transactional(rollbackFor = Exception.class)
    public int syncSchedules(List<Map<String, Object>> records) {
        String batch = UUID.randomUUID().toString();
        int count = 0;
        // fetch employee mapping: employeeNo -> employee.id
        Map<String, Long> empMap = buildEmployeeMap();
        for (Map<String, Object> rec : records) {
            String fNo = requiredText(rec, "flightNo", "航班号");
            String sDate = requiredText(rec, "scheduleDate", "排班日期");
            String sCode = requiredText(rec, "shiftCode", "班次编码");
            String employeeNo = requiredText(rec, "staffEmployeeNo", "员工工号");
            String legacyKey = legacyScheduleKey(rec, fNo, sDate, sCode, employeeNo);
            String sourceKey = scheduleSourceKey(rec, legacyKey);
            upsertRptSchedule(rec, sourceKey, legacyKey);
            upsertScheduleDetail(rec, sourceKey, legacyKey, employeeNo, empMap);
            count++;
        }
        logSync("schedules", "INSERT", null, count, "SUCCESS", null, batch);
        return count;
    }

    // ─── Swap Requests ─────────────────────────────────────────

    @Transactional(rollbackFor = Exception.class)
    public int syncSwapRequests(List<Map<String, Object>> records) {
        String batch = UUID.randomUUID().toString();
        int count = 0;
        Map<String, Long> empMap = buildEmployeeMap();
        for (Map<String, Object> rec : records) {
            String reqId = requiredText(rec, "_id", "申请唯一标识");
            upsertRptSwapRequest(rec, reqId);
            upsertScheduleChange(rec, reqId, empMap);
            count++;
        }
        logSync("swap_requests", "INSERT", null, count, "SUCCESS", null, batch);
        return count;
    }

    // ─── Leave Requests ────────────────────────────────────────

    @Transactional(rollbackFor = Exception.class)
    public int syncLeaveRequests(List<Map<String, Object>> records) {
        String batch = UUID.randomUUID().toString();
        int count = 0;
        Map<String, Long> empMap = buildEmployeeMap();
        for (Map<String, Object> rec : records) {
            String requestId = requiredText(rec, "_id", "请假申请唯一标识");
            upsertLeaveRequest(rec, requestId, empMap);
            count++;
        }
        logSync("leave_requests", "UPSERT", null, count, "SUCCESS", null, batch);
        return count;
    }

    // ─── Operation Logs ─────────────────────────────────────────

    @Transactional(rollbackFor = Exception.class)
    public int syncOperationLogs(List<Map<String, Object>> records) {
        String batch = UUID.randomUUID().toString();
        int count = 0;
        for (Map<String, Object> rec : records) {
            String sourceId = requiredText(rec, "_id", "操作日志唯一标识");
            OperationLog existing = selectOneSafe(operationLogMapper,
                new LambdaQueryWrapper<OperationLog>().eq(OperationLog::getSourceId, sourceId),
                "operation_log.source_id");
            OperationLog operationLog = existing != null ? existing : new OperationLog();
            operationLog.setSourceId(sourceId);
            operationLog.setAction(requiredText(rec, "action", "操作类型"));
            operationLog.setDetail(String.valueOf(rec.getOrDefault("detail", "")));
            Object target = rec.get("target");
            operationLog.setTargetType("SYNC");
            operationLog.setTargetId(target == null ? null
                : (target instanceof Map || target instanceof Collection) ? toJson(target) : String.valueOf(target));
            Object operator = rec.get("operatorId");
            if (operator instanceof Number number) {
                operationLog.setOperatorId(number.longValue());
            } else if (operator != null && String.valueOf(operator).matches("\\d+")) {
                operationLog.setOperatorId(Long.parseLong(String.valueOf(operator)));
            }
            operationLog.setCreatedAt(parseOptionalDateTime(rec.get("createdAt"), LocalDateTime.now()));
            if (existing != null) operationLogMapper.updateById(operationLog);
            else operationLogMapper.insert(operationLog);
            count++;
        }
        logSync("operation_logs", "UPSERT", null, count, "SUCCESS", null, batch);
        return count;
    }

    // ═══════════════════════════════════════════════════════════
    // BUSINESS TABLE UPSERTS
    // ═══════════════════════════════════════════════════════════

    private void upsertEmployee(Map<String, Object> rec, String empNo, Map<String, Long> groupMap) {
        Employee exist = selectOneSafe(employeeMapper,
            new LambdaQueryWrapper<Employee>().eq(Employee::getEmpNo, empNo),
            "employee.emp_no");
        boolean active = toBool(rec.get("active"), true);
        String groupId = String.valueOf(rec.getOrDefault("groupId", ""));

        Employee emp = exist != null ? exist : new Employee();
        if (exist == null) emp.setEmpNo(empNo);
        emp.setName(String.valueOf(rec.getOrDefault("name", "")));
        emp.setPhone(String.valueOf(rec.getOrDefault("phone", "")));
        emp.setWorkType("FULL_TIME");
        String roleType = normalizeSyncedRoleType(rec.get("roleType"));
        emp.setRoleType(roleType);
        emp.setPosition(switch (roleType) {
            case "RELEASE" -> "放行";
            case "BOTH" -> "勤务放行";
            default -> "勤务";
        });
        emp.setTags(toJson(rec.get("tags")));
        emp.setAuthorizedAirlines(toJson(rec.get("authorizedAirlines")));
        emp.setAuthorizedAircraftTypes(toJson(rec.get("authorizedAircraftTypes")));
        String licenseType = optionalText(rec.get("licenseType"));
        emp.setLicenseType(!licenseType.isBlank() ? licenseType.toUpperCase(Locale.ROOT)
            : Set.of("RELEASE", "BOTH").contains(roleType) ? "TA" : "MECH");
        // employee.status 的正式语义是 1=在职、0=离职。请假状态保留在
        // rpt_staff.on_leave 和 leave_request，不能污染员工在职状态。
        emp.setStatus(active ? 1 : 0);
        Long syncedGroupId = groupMap.get(groupId);
        if (syncedGroupId == null && exist == null) syncedGroupId = groupMap.get("未分组");
        if (syncedGroupId != null) emp.setGroupId(syncedGroupId);
        if (exist == null) emp.setHireDate(LocalDate.now());

        if (exist != null) employeeMapper.updateById(emp);
        else employeeMapper.insert(emp);

        // Sync qualifications
        syncEmployeeQualifications(emp.getId(), rec);

    }

    private void syncEmployeeQualifications(Long employeeId, Map<String, Object> rec) {
        Object quals = rec.get("qualifications");
        if (!(quals instanceof List)) return;
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> qualList = (List<Map<String, Object>>) quals;

        // Delete existing qualifications for this employee
        qualificationMapper.delete(
            new LambdaQueryWrapper<EmployeeQualification>()
                .eq(EmployeeQualification::getEmployeeId, employeeId));

        for (Map<String, Object> q : qualList) {
            String typeCode = requiredText(q, "aircraftType", "机型编码");
            AircraftType at = selectOneSafe(aircraftTypeMapper,
                new LambdaQueryWrapper<AircraftType>().eq(AircraftType::getTypeCode, typeCode),
                "aircraft_type.type_code");
            if (at == null) {
                at = new AircraftType();
                at.setTypeCode(typeCode);
                at.setTypeName(typeCode);
                at.setStatus(1);
                aircraftTypeMapper.insert(at);
            }

            EmployeeQualification eq = new EmployeeQualification();
            eq.setEmployeeId(employeeId);
            eq.setAircraftTypeId(at.getId());
            eq.setQualType("AIRCRAFT_TYPE");
            eq.setQualCode(String.valueOf(q.getOrDefault("certNo", typeCode + "-" + employeeId)));
            eq.setQualName(typeCode + " 机型授权");
            String issueStr = String.valueOf(q.getOrDefault("issueDate", ""));
            if (!issueStr.isEmpty()) eq.setIssueDate(LocalDate.parse(issueStr));
            String expireStr = String.valueOf(q.getOrDefault("validUntil", ""));
            if (!expireStr.isEmpty()) eq.setExpireDate(LocalDate.parse(expireStr));
            String statusStr = String.valueOf(q.getOrDefault("status", "VALID"));
            eq.setStatus("EXPIRED".equals(statusStr) ? 0 : 1);
            eq.setCreatedAt(LocalDateTime.now());
            eq.setUpdatedAt(LocalDateTime.now());
            qualificationMapper.insert(eq);
        }
    }

    private void upsertFlightPlan(Map<String, Object> rec, String flightNo, String schedDate) {
        LocalDate date = schedDate.isEmpty() ? LocalDate.now() : LocalDate.parse(schedDate);
        LocalTime arrivalTime = parseTime(String.valueOf(rec.getOrDefault("arrivalTime", "")));
        LocalTime departureTime = parseTime(String.valueOf(rec.getOrDefault("departureTime", "")));
        String estimatedArrivalText = optionalText(rec.get("estimatedArrivalTime"));
        LocalDateTime estimatedArrivalTime = estimatedArrivalText.isBlank()
            ? null : parseOptionalDateTime(estimatedArrivalText, null);
        String flightType = String.valueOf(rec.getOrDefault("flightType", "")).trim().toUpperCase(Locale.ROOT);
        if (!"DEP".equals(flightType) && !"ARR".equals(flightType)) {
            flightType = departureTime != null ? "DEP" : "ARR";
        }
        LocalTime scheduledArrivalTime = parseTime(optionalText(rec.get("scheduledArrivalTime")));
        LocalTime planTime = "DEP".equals(flightType) ? departureTime
            : scheduledArrivalTime != null ? scheduledArrivalTime : arrivalTime;
        if (planTime == null) {
            planTime = departureTime != null ? departureTime : arrivalTime;
        }
        if (planTime == null) {
            throw new BusinessException(422, "同步航班缺少有效的计划时刻");
        }

        String sourceId = optionalText(rec.get("_id"));
        FlightPlan exist = sourceId.isBlank() ? null : selectOneSafe(flightPlanMapper,
            new LambdaQueryWrapper<FlightPlan>().eq(FlightPlan::getSourceId, sourceId),
            "flight_plan.source_id");
        if (exist == null) {
            exist = selectOneSafe(flightPlanMapper,
                new LambdaQueryWrapper<FlightPlan>()
                    .eq(FlightPlan::getFlightNo, flightNo)
                    .eq(FlightPlan::getPlanDate, date)
                    .eq(FlightPlan::getPlanTime, planTime),
                "flight_plan(flightNo+date+time)");
        }

        FlightPlan fp = exist != null ? exist : new FlightPlan();
        if (exist == null) { fp.setFlightNo(flightNo); fp.setPlanDate(date); }
        fp.setAirline(String.valueOf(rec.getOrDefault("airline", "")));
        fp.setRegistration(optionalText(rec.get("aircraftRegistration")));
        fp.setEngineModel(optionalText(rec.get("engineModel")));
        fp.setEstimatedArrivalTime(estimatedArrivalTime);
        if (!sourceId.isBlank()) fp.setSourceId(sourceId);
        String aircraftType = String.valueOf(rec.getOrDefault("aircraftType", "")).trim();
        fp.setAircraftTypeName(aircraftType);
        if (!aircraftType.isEmpty()) {
            AircraftType type = selectOneSafe(aircraftTypeMapper,
                    new LambdaQueryWrapper<AircraftType>()
                            .eq(AircraftType::getTypeCode, aircraftType)
                            .or()
                            .eq(AircraftType::getTypeName, aircraftType)
                            .last("LIMIT 1"),
                    "aircraft_type(typeCode|typeName)");
            if (type != null) {
                fp.setAircraftTypeId(type.getId());
                fp.setAircraftTypeName(type.getTypeName());
            }
        }
        fp.setArrivalTime(arrivalTime);
        fp.setDepartureTime(departureTime);
        fp.setPlanTime(planTime);
        fp.setFlightType(flightType);
        Object stay = rec.get("stayHours");
        fp.setStayHours(stay != null ? new BigDecimal(String.valueOf(stay)) : null);
        fp.setWarningFlag(toBool(rec.get("warningFlag"), false));
        fp.setIsRelease(toBool(rec.get("isRelease"), false));
        fp.setStatus("SCHEDULED");

        if (exist != null) flightPlanMapper.updateById(fp);
        else flightPlanMapper.insert(fp);
    }

    private void upsertScheduleDetail(Map<String, Object> rec, String sourceKey, String legacyKey,
                                      String employeeNo, Map<String, Long> empMap) {
        String schedName = String.valueOf(rec.getOrDefault("scheduleDate", ""));
        LocalDate workDate = schedName.isEmpty() ? LocalDate.now() : LocalDate.parse(schedName);

        Long employeeId = empMap.get(employeeNo);
        if (employeeId == null) {
            throw new BusinessException(422, "同步排班引用了不存在的员工");
        }

        // Ensure schedule master exists for this date range
        Schedule master = selectOneSafe(scheduleMapper,
            new LambdaQueryWrapper<Schedule>()
                .eq(Schedule::getStatus, 1)
                .le(Schedule::getStartDate, workDate)
                .ge(Schedule::getEndDate, workDate)
                .last("LIMIT 1"),
            "schedule.date_range");
        if (master == null) {
            master = new Schedule();
            master.setScheduleName("同步排班 " + schedName);
            master.setStartDate(workDate);
            master.setEndDate(workDate.plusDays(7));
            master.setStatus(1);
            master.setCreatedAt(LocalDateTime.now());
            master.setUpdatedAt(LocalDateTime.now());
            scheduleMapper.insert(master);
        }

        ScheduleDetail exist = selectOneSafe(scheduleDetailMapper,
            new LambdaQueryWrapper<ScheduleDetail>()
                .eq(ScheduleDetail::getSourceKey, sourceKey),
            "schedule_detail.source_key");
        if (exist == null && !sourceKey.equals(legacyKey)) {
            exist = selectOneSafe(scheduleDetailMapper,
                new LambdaQueryWrapper<ScheduleDetail>().eq(ScheduleDetail::getSourceKey, legacyKey),
                "schedule_detail.source_key(legacy)");
        }

        String sCode = String.valueOf(rec.getOrDefault("shiftCode", ""));
        Long shiftId = mapShiftCode(sCode);

        String taskType = String.valueOf(rec.getOrDefault("_taskType", ""));
        String tStart = String.valueOf(rec.getOrDefault("_taskStart", ""));
        String tEnd = String.valueOf(rec.getOrDefault("_taskEnd", ""));

        ScheduleDetail sd = exist != null ? exist : new ScheduleDetail();
        sd.setEmployeeId(employeeId);
        sd.setWorkDate(workDate);
        sd.setSourceKey(sourceKey);
        sd.setScheduleId(master.getId());
        sd.setShiftId(shiftId);
        sd.setScheduleType(String.valueOf(rec.getOrDefault("source", "AUTO")));
        sd.setSource("WECHAT_MINIAPP");
        String recordStatus = optionalText(rec.get("recordStatus"));
        String businessStatus = optionalText(rec.get("status"));
        sd.setRecordStatus("archived".equalsIgnoreCase(recordStatus)
            || "CANCELLED".equalsIgnoreCase(businessStatus) ? "archived" : "active");
        if (rec.containsKey("needsReassignment")) {
            boolean needsReassignment = toBool(rec.get("needsReassignment"), false);
            sd.setNeedsReassignment(needsReassignment);
            String leaveRequestId = optionalText(rec.get("leaveRequestId"));
            sd.setLeaveRequestId(needsReassignment
                ? resolveLeaveRequestId(leaveRequestId) : null);
        }
        String flightNo = String.valueOf(rec.getOrDefault("flightNo", ""));
        if (!flightNo.isBlank() && !flightNo.startsWith("ADMIN-")) {
            String flightType = String.valueOf(rec.getOrDefault("flightType", "")).trim().toUpperCase(Locale.ROOT);
            LambdaQueryWrapper<FlightPlan> flightQuery = new LambdaQueryWrapper<FlightPlan>()
                    .eq(FlightPlan::getFlightNo, flightNo)
                    .eq(FlightPlan::getPlanDate, workDate)
                    .eq("DEP".equals(flightType) || "ARR".equals(flightType),
                            FlightPlan::getFlightType, flightType)
                    .orderByAsc(FlightPlan::getPlanTime)
                    .last("LIMIT 1");
            FlightPlan flight = flightPlanMapper.selectOne(flightQuery);
            if (flight == null) {
                throw new BusinessException(422, "同步排班引用了不存在的航班");
            }
            sd.setFlightId(flight.getId());
        } else {
            // 管理员手工排班使用 ADMIN-yyyyMMdd 虚拟航班，不制造伪造航班主数据。
            sd.setFlightId(null);
        }
        sd.setTaskType("".equals(taskType) ? null : taskType);
        sd.setTaskStart(tStart.isBlank() ? null : parseOptionalDateTime(tStart, null));
        sd.setTaskEnd(tEnd.isBlank() ? null : parseOptionalDateTime(tEnd, null));

        if (exist != null) scheduleDetailMapper.updateById(sd);
        else scheduleDetailMapper.insert(sd);
    }

    private void upsertScheduleChange(Map<String, Object> rec, String reqId, Map<String, Long> empMap) {
        String sourceScheduleSourceId = optionalText(rec.get("sourceScheduleId"));
        String targetScheduleSourceId = optionalText(rec.get("targetScheduleId"));
        ScheduleDetail sourceDetail = resolveScheduleDetail(sourceScheduleSourceId);
        Long sourceDetailId = sourceDetail == null ? null : sourceDetail.getId();
        String reqOpenid = String.valueOf(rec.getOrDefault("requesterOpenid", ""));
        String employeeNo = String.valueOf(rec.getOrDefault("employeeNo", ""));
        Long empId = sourceDetail != null ? sourceDetail.getEmployeeId() : findEmployeeByOpenid(reqOpenid);
        if (empId == null && !employeeNo.isBlank()) {
            empId = empMap.get(employeeNo);
        }
        if (empId == null) {
            empId = optionalLong(rec.get("employeeId"));
        }
        if (empId == null) {
            throw new BusinessException(422, "同步调班申请引用了不存在的员工");
        }

        LocalDate fromDate = sourceDetail != null ? sourceDetail.getWorkDate()
                : optionalDate(rec.getOrDefault("workDate", rec.get("scheduleDate")));
        if (fromDate == null) {
            throw new BusinessException(422, "同步调班申请缺少排班日期");
        }
        ScheduleDetail targetDetail = resolveScheduleDetail(targetScheduleSourceId);

        String status = String.valueOf(rec.getOrDefault("status", "PENDING")).toUpperCase(Locale.ROOT);
        int st = mapRequestStatus(status);

        ScheduleChange exist = scheduleChangeMapper.selectOne(
            new LambdaQueryWrapper<ScheduleChange>()
                .eq(ScheduleChange::getSourceRequestId, reqId));

        ScheduleChange sc = exist != null ? exist : new ScheduleChange();
        sc.setSourceRequestId(reqId);
        sc.setSourceScheduleSourceId(sourceScheduleSourceId.isBlank() ? null : sourceScheduleSourceId);
        sc.setTargetScheduleSourceId(targetScheduleSourceId.isBlank() ? null : targetScheduleSourceId);
        sc.setScheduleDetailId(sourceDetailId);
        sc.setEmployeeId(empId);
        sc.setTargetEmployeeId(targetDetail != null
                ? targetDetail.getEmployeeId() : resolveTargetEmployeeId(rec, empMap));
        sc.setChangeType(String.valueOf(rec.getOrDefault("requestType", "SWAP")));
        sc.setFromDate(fromDate);
        sc.setFromShiftId(sourceDetail != null ? sourceDetail.getShiftId() : optionalLong(rec.get("fromShiftId")));
        sc.setToDate(targetDetail != null ? targetDetail.getWorkDate() : optionalDate(rec.get("toDate")));
        sc.setToShiftId(targetDetail != null ? targetDetail.getShiftId() : optionalLong(rec.get("toShiftId")));
        sc.setReason(String.valueOf(rec.getOrDefault("reason", "")));
        sc.setStatus(st);
        sc.setApproveRemark(String.valueOf(rec.getOrDefault("comment", "")));

        if (exist != null) scheduleChangeMapper.updateById(sc);
        else scheduleChangeMapper.insert(sc);
    }

    private void upsertLeaveRequest(Map<String, Object> rec, String requestId, Map<String, Long> empMap) {
        String employeeNo = requiredText(rec, "employeeNo", "员工工号");
        Long employeeId = empMap.get(employeeNo);
        if (employeeId == null) employeeId = findEmployeeByOpenid(optionalText(rec.get("openid")));
        if (employeeId == null) {
            throw new BusinessException(422, "同步请假申请引用了不存在的员工");
        }

        LocalDate startDate = optionalDate(rec.get("startDate"));
        LocalDate endDate = optionalDate(rec.get("endDate"));
        if (startDate == null) throw new BusinessException(422, "同步请假申请缺少开始日期");
        if (endDate == null) endDate = startDate;
        if (endDate.isBefore(startDate)) throw new BusinessException(422, "同步请假申请结束日期早于开始日期");

        LeaveRequest existing = leaveRequestMapper.selectOne(
            new LambdaQueryWrapper<LeaveRequest>().eq(LeaveRequest::getSourceRequestId, requestId));
        LeaveRequest leave = existing != null ? existing : new LeaveRequest();
        leave.setSourceRequestId(requestId);
        leave.setEmployeeId(employeeId);
        leave.setLeaveType(firstNonBlank(optionalText(rec.get("type")), optionalText(rec.get("leaveType")), "OTHER"));
        leave.setStartDate(startDate);
        leave.setEndDate(endDate);
        Object totalDays = rec.get("totalDays");
        leave.setTotalDays(totalDays == null ? BigDecimal.valueOf(ChronoUnit.DAYS.between(startDate, endDate) + 1L)
            : new BigDecimal(String.valueOf(totalDays)));
        leave.setReason(optionalText(rec.get("reason")));
        leave.setReasonMode(optionalText(rec.get("reasonMode")));
        leave.setReasonImages(toJson(rec.get("reasonImages")));
        leave.setValidationSnapshot(toJson(rec.get("validationSnapshot")));
        leave.setAuditTrail(toJson(rec.get("auditTrail")));
        leave.setStatus(mapRequestStatus(optionalText(rec.get("status")).toUpperCase(Locale.ROOT)));
        leave.setApproveRemark(optionalText(rec.get("comment")));
        leave.setCancelledAt(parseOptionalDateTime(rec.get("cancelledAt"), null));
        if (existing == null) {
            leave.setCreatedAt(parseOptionalDateTime(rec.get("createdAt"), LocalDateTime.now()));
            leaveRequestMapper.insert(leave);
        } else {
            leaveRequestMapper.updateById(leave);
        }
        updateLeaveReassignmentFlags(leave);
    }

    private void updateLeaveReassignmentFlags(LeaveRequest leave) {
        if (leave.getId() == null) return;
        if (Integer.valueOf(1).equals(leave.getStatus())) {
            scheduleDetailMapper.update(null, new LambdaUpdateWrapper<ScheduleDetail>()
                .eq(ScheduleDetail::getEmployeeId, leave.getEmployeeId())
                .between(ScheduleDetail::getWorkDate, leave.getStartDate(), leave.getEndDate())
                .eq(ScheduleDetail::getRecordStatus, "active")
                .and(wrapper -> wrapper.isNull(ScheduleDetail::getScheduleType)
                    .or().ne(ScheduleDetail::getScheduleType, "COMPLETED"))
                .set(ScheduleDetail::getNeedsReassignment, true)
                .set(ScheduleDetail::getLeaveRequestId, leave.getId()));
        } else {
            scheduleDetailMapper.update(null, new LambdaUpdateWrapper<ScheduleDetail>()
                .eq(ScheduleDetail::getLeaveRequestId, leave.getId())
                .set(ScheduleDetail::getNeedsReassignment, false)
                .set(ScheduleDetail::getLeaveRequestId, null));
        }
    }

    // ═══════════════════════════════════════════════════════════
    // RPT TABLE UPSERTS (keep existing)
    // ═══════════════════════════════════════════════════════════

    private void upsertRptStaff(Map<String, Object> rec, String empNo) {
        RptStaff exist = rptStaffMapper.selectOne(
            new LambdaQueryWrapper<RptStaff>().eq(RptStaff::getEmployeeNo, empNo));
        RptStaff entity = mapRptStaff(rec);
        entity.setSourceSyncAt(LocalDateTime.now());
        if (exist != null) { entity.setId(exist.getId()); rptStaffMapper.updateById(entity); }
        else rptStaffMapper.insert(entity);
    }

    private void upsertRptFlight(Map<String, Object> rec, String flightNo, String schedDate) {
        String sourceId = optionalText(rec.get("_id"));
        RptFlight exist = sourceId.isBlank() ? null : rptFlightMapper.selectOne(
            new LambdaQueryWrapper<RptFlight>().eq(RptFlight::getSourceId, sourceId));
        if (exist == null) {
            exist = rptFlightMapper.selectOne(
                new LambdaQueryWrapper<RptFlight>()
                    .eq(RptFlight::getFlightNo, flightNo)
                    .eq(RptFlight::getScheduleDate, LocalDate.parse(schedDate)));
        }
        RptFlight entity = mapRptFlight(rec);
        entity.setSourceSyncAt(LocalDateTime.now());
        if (exist != null) { entity.setId(exist.getId()); rptFlightMapper.updateById(entity); }
        else rptFlightMapper.insert(entity);
    }

    private void upsertRptSchedule(Map<String, Object> rec, String sourceKey, String legacyKey) {
        RptSchedule exist = rptScheduleMapper.selectOne(
            new LambdaQueryWrapper<RptSchedule>().eq(RptSchedule::getScheduleKey, sourceKey));
        if (exist == null && !sourceKey.equals(legacyKey)) {
            exist = rptScheduleMapper.selectOne(
                new LambdaQueryWrapper<RptSchedule>().eq(RptSchedule::getScheduleKey, legacyKey));
        }
        RptSchedule entity = mapRptSchedule(rec, sourceKey);
        entity.setSourceSyncAt(LocalDateTime.now());
        if (exist != null) { entity.setId(exist.getId()); rptScheduleMapper.updateById(entity); }
        else rptScheduleMapper.insert(entity);
    }

    private void upsertRptSwapRequest(Map<String, Object> rec, String reqId) {
        RptSwapRequest exist = rptSwapRequestMapper.selectOne(
            new LambdaQueryWrapper<RptSwapRequest>().eq(RptSwapRequest::getRequestId, reqId));
        RptSwapRequest entity = mapRptSwapRequest(rec);
        entity.setSourceSyncAt(LocalDateTime.now());
        if (exist != null) { entity.setId(exist.getId()); rptSwapRequestMapper.updateById(entity); }
        else rptSwapRequestMapper.insert(entity);
    }

    // ═══════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════

    private Map<String, Long> ensureTeamGroups(List<Map<String, Object>> records) {
        Map<String, Long> map = new HashMap<>();
        List<TeamGroup> allGroups = teamGroupMapper.selectList(
            new LambdaQueryWrapper<TeamGroup>().eq(TeamGroup::getStatus, 1));
        for (TeamGroup g : allGroups) {
            map.put(g.getGroupName(), g.getId());
            map.put(g.getGroupCode(), g.getId());
        }
        LinkedHashSet<String> requestedGroups = records.stream()
            .map(record -> optionalText(record.get("groupId")))
            .filter(value -> !value.isBlank())
            .collect(Collectors.toCollection(LinkedHashSet::new));
        requestedGroups.add("未分组");
        for (String groupName : requestedGroups) {
            if (map.containsKey(groupName)) continue;
            TeamGroup group = new TeamGroup();
            group.setGroupName(groupName);
            group.setGroupCode("WX_" + groupName);
            group.setGroupType("WECHAT_MINIAPP");
            group.setDescription("由微信小程序员工同步自动创建");
            group.setStatus(1);
            teamGroupMapper.insert(group);
            map.put(groupName, group.getId());
            map.put(group.getGroupCode(), group.getId());
        }
        return map;
    }

    private String legacyScheduleKey(Map<String, Object> rec, String flightNo, String scheduleDate,
                                     String shiftCode, String employeeNo) {
        String staffId = firstNonBlank(optionalText(rec.get("staffId")), employeeNo);
        String taskType = optionalText(rec.get("_taskType"));
        return flightNo + "_" + scheduleDate + "_" + shiftCode + "_" + staffId + "_" + taskType;
    }

    private String scheduleSourceKey(Map<String, Object> rec, String legacyKey) {
        String sourceId = optionalText(rec.get("_id"));
        return sourceId.isBlank() ? legacyKey : "WX:" + sourceId;
    }

    private ScheduleDetail resolveScheduleDetail(String externalId) {
        if (externalId == null || externalId.isBlank()) return null;
        ScheduleDetail detail = scheduleDetailMapper.selectOne(
            new LambdaQueryWrapper<ScheduleDetail>().eq(ScheduleDetail::getSourceKey, "WX:" + externalId));
        if (detail == null) {
            detail = scheduleDetailMapper.selectOne(
                new LambdaQueryWrapper<ScheduleDetail>().eq(ScheduleDetail::getSourceKey, externalId));
        }
        if (detail == null && externalId.matches("\\d+")) {
            detail = scheduleDetailMapper.selectById(Long.valueOf(externalId));
        }
        return detail;
    }

    private Long resolveLeaveRequestId(String externalId) {
        if (externalId == null || externalId.isBlank()) return null;
        LeaveRequest leave = leaveRequestMapper.selectOne(
            new LambdaQueryWrapper<LeaveRequest>().eq(LeaveRequest::getSourceRequestId, externalId));
        if (leave != null) return leave.getId();
        return externalId.matches("\\d+") ? Long.valueOf(externalId) : null;
    }

    private Long resolveTargetEmployeeId(Map<String, Object> rec, Map<String, Long> empMap) {
        String employeeNo = firstNonBlank(
            optionalText(rec.get("replacementEmployeeNo")),
            optionalText(rec.get("targetEmployeeNo")));
        if (!employeeNo.isBlank() && empMap.containsKey(employeeNo)) return empMap.get(employeeNo);
        Object value = rec.get("targetEmployeeId");
        return value != null && String.valueOf(value).matches("\\d+") ? Long.valueOf(String.valueOf(value)) : null;
    }

    private int mapRequestStatus(String status) {
        return switch (status) {
            case "APPROVED" -> 1;
            case "REJECTED" -> 2;
            case "CANCELLED" -> 3;
            default -> 0;
        };
    }

    private Map<String, Long> buildEmployeeMap() {
        Map<String, Long> map = new HashMap<>();
        List<Employee> all = employeeMapper.selectList(null);
        for (Employee e : all) {
            if (e.getEmpNo() != null) map.put(e.getEmpNo(), e.getId());
        }
        return map;
    }

    private Long findEmployeeByOpenid(String openid) {
        if (openid == null || openid.isEmpty()) return null;
        Employee e = employeeMapper.selectOne(
            new LambdaQueryWrapper<Employee>().eq(Employee::getOpenid, openid));
        return e != null ? e.getId() : null;
    }

    private String requiredText(Map<String, Object> record, String key, String label) {
        Object value = record.get(key);
        String text = value == null ? "" : String.valueOf(value).trim();
        if (text.isEmpty()) {
            throw new BusinessException(422, "同步记录缺少" + label);
        }
        return text;
    }

    private String optionalText(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    private String emptyToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    private Long optionalLong(Object value) {
        if (value == null || String.valueOf(value).isBlank()) {
            return null;
        }
        if (value instanceof Number number) {
            return number.longValue();
        }
        try {
            return Long.valueOf(String.valueOf(value));
        } catch (NumberFormatException exception) {
            throw new BusinessException(422, "同步记录中的编号格式不正确");
        }
    }

    private LocalDate optionalDate(Object value) {
        if (value == null || String.valueOf(value).isBlank()) {
            return null;
        }
        try {
            return value instanceof LocalDate date ? date : LocalDate.parse(String.valueOf(value));
        } catch (RuntimeException exception) {
            throw new BusinessException(422, "同步记录中的日期格式不正确");
        }
    }

    private LocalDateTime parseOptionalDateTime(Object value, LocalDateTime fallback) {
        if (value == null || String.valueOf(value).isBlank()) {
            return fallback;
        }
        try {
            String normalized = String.valueOf(value).trim().replace(" ", "T");
            return LocalDateTime.parse(normalized.length() > 19
                    ? normalized.substring(0, 19) : normalized);
        } catch (RuntimeException exception) {
            throw new BusinessException(422, "同步记录中的时间格式不正确");
        }
    }

    public Map<String, Object> findEmployeeByEmpNo(String empNo) {
        Employee e = employeeMapper.selectOne(
            new LambdaQueryWrapper<Employee>().eq(Employee::getEmpNo, empNo));
        if (e == null) return null;
        RptStaff rpt = rptStaffMapper.selectOne(
            new LambdaQueryWrapper<RptStaff>().eq(RptStaff::getEmployeeNo, empNo));
        TeamGroup group = e.getGroupId() == null ? null : teamGroupMapper.selectById(e.getGroupId());
        List<EmployeeQualification> qualificationRows = qualificationMapper.selectList(
            new LambdaQueryWrapper<EmployeeQualification>()
                .eq(EmployeeQualification::getEmployeeId, e.getId()));
        Set<Long> aircraftTypeIds = qualificationRows.stream()
            .map(EmployeeQualification::getAircraftTypeId)
            .filter(Objects::nonNull)
            .collect(Collectors.toCollection(LinkedHashSet::new));
        Map<Long, AircraftType> aircraftTypesById = aircraftTypeIds.isEmpty()
            ? Map.of()
            : aircraftTypeMapper.selectBatchIds(aircraftTypeIds).stream()
                .collect(Collectors.toMap(AircraftType::getId, type -> type));
        LinkedHashSet<String> authorizedAircraftTypes = qualificationRows.stream()
            .map(row -> aircraftTypesById.get(row.getAircraftTypeId()))
            .filter(Objects::nonNull)
            .map(type -> firstNonBlank(type.getTypeCode(), type.getTypeName()))
            .filter(value -> value != null && !value.isBlank())
            .collect(Collectors.toCollection(LinkedHashSet::new));
        if (rpt != null) authorizedAircraftTypes.addAll(parseStringList(rpt.getAuthorizedAircraftTypes()));

        List<Map<String, Object>> qualifications = rpt == null
            ? new ArrayList<>() : new ArrayList<>(parseObjectList(rpt.getQualifications()));
        if (qualifications.isEmpty()) {
            for (EmployeeQualification row : qualificationRows) {
                AircraftType type = aircraftTypesById.get(row.getAircraftTypeId());
                Map<String, Object> qualification = new LinkedHashMap<>();
                qualification.put("aircraftType", type == null ? "" : firstNonBlank(type.getTypeCode(), type.getTypeName()));
                qualification.put("certNo", firstNonBlank(row.getQualCode(), ""));
                qualification.put("issueDate", row.getIssueDate() == null ? "" : row.getIssueDate().toString());
                qualification.put("validUntil", row.getExpireDate() == null ? "" : row.getExpireDate().toString());
                qualification.put("status", row.getStatus() != null && row.getStatus() == 0 ? "EXPIRED" : "VALID");
                qualifications.add(qualification);
            }
        }

        Map<String, Object> result = new HashMap<>();
        result.put("id", e.getId());
        result.put("employeeNo", e.getEmpNo());
        result.put("name", e.getName());
        result.put("groupId", group == null ? "未分组" : group.getGroupName());
        result.put("phone", e.getPhone() != null ? e.getPhone() : "");
        result.put("active", rpt != null && rpt.getActive() != null
            ? rpt.getActive() : e.getStatus() == null || e.getStatus() == 1);
        result.put("onLeave", rpt != null && rpt.getOnLeave() != null
            ? rpt.getOnLeave() : false);
        result.put("roleType", normalizeRoleType(rpt == null ? null : rpt.getRoleType(), e));
        result.put("authorizedAirlines", parseStringList(rpt != null
            ? rpt.getAuthorizedAirlines() : e.getAuthorizedAirlines()));
        result.put("authorizedAircraftTypes", List.copyOf(authorizedAircraftTypes));
        result.put("qualifications", qualifications);
        return result;
    }

    private String normalizeRoleType(String rptRoleType, Employee employee) {
        String raw = firstNonBlank(rptRoleType, employee.getRoleType(), employee.getPosition(), employee.getWorkType(), "SERVICE");
        String upper = raw.trim().toUpperCase(Locale.ROOT);
        if (Set.of("SERVICE", "RELEASE", "BOTH").contains(upper)) return upper;
        if (raw.contains("勤务") && raw.contains("放行")) return "BOTH";
        if (raw.contains("放行")) return "RELEASE";
        return "SERVICE";
    }

    private String normalizeSyncedRoleType(Object value) {
        String raw = optionalText(value);
        String upper = raw.toUpperCase(Locale.ROOT);
        if (Set.of("SERVICE", "RELEASE", "BOTH").contains(upper)) return upper;
        if (raw.contains("勤务") && raw.contains("放行")) return "BOTH";
        if (raw.contains("放行")) return "RELEASE";
        return "SERVICE";
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) return value;
        }
        return "";
    }

    private List<String> parseStringList(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            return OBJECT_MAPPER.readValue(json, new TypeReference<List<String>>() {}).stream()
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(value -> !value.isEmpty())
                .distinct()
                .toList();
        } catch (Exception exception) {
            log.warn("Ignoring invalid synchronized string list", exception);
            return List.of();
        }
    }

    private List<Map<String, Object>> parseObjectList(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            return OBJECT_MAPPER.readValue(json, new TypeReference<List<Map<String, Object>>>() {});
        } catch (Exception exception) {
            log.warn("Ignoring invalid synchronized object list", exception);
            return List.of();
        }
    }

    private Long mapShiftCode(String code) {
        if ("MORNING".equalsIgnoreCase(code)) return 1L;
        if ("AFTERNOON".equalsIgnoreCase(code) || "EVENING".equalsIgnoreCase(code)) return 2L;
        if ("NIGHT".equalsIgnoreCase(code)) return 3L;
        if ("STANDBY".equalsIgnoreCase(code)) return 4L;
        return 5L; // REST
    }

    private LocalTime parseTime(String timeStr) {
        if (timeStr == null || timeStr.isBlank()) return null;
        try {
            String normalized = timeStr.trim();
            String timePart = normalized.contains("T")
                    ? normalized.substring(normalized.indexOf('T') + 1)
                    : normalized.contains(" ") ? normalized.substring(normalized.lastIndexOf(' ') + 1)
                    : normalized;
            if (timePart.length() >= 5) {
                return LocalTime.parse(timePart.substring(0, 5));
            }
        } catch (RuntimeException exception) {
            throw new BusinessException(422, "同步航班的时间格式不正确");
        }
        throw new BusinessException(422, "同步航班的时间格式不正确");
    }

    private String toJson(Object val) {
        if (val == null) return null;
        try {
            return OBJECT_MAPPER.writeValueAsString(val);
        } catch (Exception exception) {
            throw new BusinessException(422, "同步员工扩展字段格式不正确");
        }
    }

    // ═══════════════════════════════════════════════════════════
    // MAPPERS
    // ═══════════════════════════════════════════════════════════

    private RptStaff mapRptStaff(Map<String, Object> rec) {
        RptStaff s = new RptStaff();
        s.setEmployeeNo(String.valueOf(rec.getOrDefault("employeeNo", "")));
        s.setName(String.valueOf(rec.getOrDefault("name", "")));
        s.setGroupId(String.valueOf(rec.getOrDefault("groupId", "")));
        s.setActive(toBool(rec.get("active"), true));
        s.setOnLeave(toBool(rec.get("onLeave"), false));
        s.setRoleType(String.valueOf(rec.getOrDefault("roleType", "")));
        s.setPhone(String.valueOf(rec.getOrDefault("phone", "")));
        s.setIsAdmin(toBool(rec.get("isAdmin"), false));
        s.setOpenid(String.valueOf(rec.getOrDefault("openid", "")));
        s.setTags(toJson(rec.get("tags")));
        s.setAuthorizedAirlines(toJson(rec.get("authorizedAirlines")));
        s.setAuthorizedAircraftTypes(toJson(rec.get("authorizedAircraftTypes")));
        s.setQualifications(toJson(rec.get("qualifications")));
        s.setPreferences(toJson(rec.get("preferences")));
        s.setSourceId(emptyToNull(optionalText(rec.get("_id"))));
        return s;
    }

    private RptFlight mapRptFlight(Map<String, Object> rec) {
        RptFlight f = new RptFlight();
        f.setFlightNo(String.valueOf(rec.getOrDefault("flightNo", "")));
        f.setAirline(String.valueOf(rec.getOrDefault("airline", "")));
        f.setAircraftType(String.valueOf(rec.getOrDefault("aircraftType", "")));
        f.setEngineModel(optionalText(rec.get("engineModel")));
        f.setAircraftRegistration(optionalText(rec.get("aircraftRegistration")));
        f.setEstimatedArrivalTime(optionalText(rec.get("estimatedArrivalTime")));
        String sd = String.valueOf(rec.getOrDefault("scheduleDate", ""));
        f.setScheduleDate(sd.isEmpty() ? null : LocalDate.parse(sd));
        f.setArrivalTime(String.valueOf(rec.getOrDefault("arrivalTime", "")));
        f.setDepartureTime(String.valueOf(rec.getOrDefault("departureTime", "")));
        Object sh = rec.get("stayHours");
        f.setStayHours(sh != null ? new BigDecimal(String.valueOf(sh)) : null);
        f.setWarningFlag(toBool(rec.get("warningFlag"), false));
        f.setSourceId(emptyToNull(optionalText(rec.get("_id"))));
        return f;
    }

    private RptSchedule mapRptSchedule(Map<String, Object> rec, String sKey) {
        RptSchedule s = new RptSchedule();
        s.setScheduleKey(sKey);
        s.setFlightNo(String.valueOf(rec.getOrDefault("flightNo", "")));
        s.setAirline(String.valueOf(rec.getOrDefault("airline", "")));
        s.setAircraftType(String.valueOf(rec.getOrDefault("aircraftType", "")));
        s.setScheduleDate(optionalDate(rec.get("scheduleDate")));
        s.setShiftCode(String.valueOf(rec.getOrDefault("shiftCode", "")));
        s.setStaffId(String.valueOf(rec.getOrDefault("staffId", "")));
        s.setStaffName(String.valueOf(rec.getOrDefault("staffName", "")));
        s.setEmployeeNo(String.valueOf(rec.getOrDefault("staffEmployeeNo", "")));
        s.setGroupId(String.valueOf(rec.getOrDefault("groupId", "")));
        s.setStatus(String.valueOf(rec.getOrDefault("status", "ASSIGNED")));
        s.setSourceId(emptyToNull(optionalText(rec.get("_id"))));
        s.setExtraData(toJson(rec));
        return s;
    }

    private RptSwapRequest mapRptSwapRequest(Map<String, Object> rec) {
        RptSwapRequest r = new RptSwapRequest();
        r.setRequestId(String.valueOf(rec.getOrDefault("_id", "")));
        r.setRequestType(String.valueOf(rec.getOrDefault("requestType", "SWAP")));
        r.setRequesterEmp(firstNonBlank(optionalText(rec.get("employeeNo")), optionalText(rec.get("requesterOpenid"))));
        r.setTargetEmp(firstNonBlank(optionalText(rec.get("replacementEmployeeNo")), optionalText(rec.get("targetEmployeeNo"))));
        r.setApproverEmp(firstNonBlank(optionalText(rec.get("approverEmployeeNo")), optionalText(rec.get("approverOpenid"))));
        r.setStatus(String.valueOf(rec.getOrDefault("status", "PENDING")));
        r.setReason(String.valueOf(rec.getOrDefault("reason", "")));
        r.setSourceFlight(optionalText(rec.get("flightNo")));
        r.setTargetFlight(optionalText(rec.get("targetFlightNo")));
        r.setExtraData(toJson(rec));
        r.setSourceId(emptyToNull(optionalText(rec.get("_id"))));
        return r;
    }

    private void logSync(String collection, String action, String sourceId, int count, String status, String error, String batch) {
        RptSyncLog l = new RptSyncLog();
        l.setCollection(collection); l.setAction(action); l.setSourceId(sourceId);
        l.setRecordCount(count); l.setStatus(status); l.setErrorMsg(error); l.setSyncBatch(batch);
        rptSyncLogMapper.insert(l);
    }

    private Boolean toBool(Object val, boolean defaultVal) {
        if (val == null) return defaultVal;
        if (val instanceof Boolean) return (Boolean) val;
        String s = String.valueOf(val);
        return "true".equalsIgnoreCase(s) || "1".equals(s);
    }

    /**
     * 安全 selectOne:sourceKey 等非唯一键命中多行时取首条并告警,
     * 避免 TooManyResultsException 抛 RuntimeException 导致整批 500 回滚(审查 H3)。
     * 根治仍需为 employee.emp_no / aircraft_type.type_code 建唯一索引(见 db 迁移)。
     */
    private <T> T selectOneSafe(com.baomidou.mybatisplus.core.mapper.BaseMapper<T> mapper,
                                com.baomidou.mybatisplus.core.conditions.Wrapper<T> wrapper,
                                String what) {
        try {
            return mapper.selectOne(wrapper);
        } catch (org.apache.ibatis.exceptions.TooManyResultsException ex) {
            java.util.List<T> rows = mapper.selectList(wrapper);
            log.warn("SyncService: {} 命中 {} 条重复记录,取首条(建议为 {} 建唯一索引)",
                    what, rows == null ? 0 : rows.size(), what);
            if (rows == null || rows.isEmpty()) return null;
            return rows.get(0);
        }
    }
}
