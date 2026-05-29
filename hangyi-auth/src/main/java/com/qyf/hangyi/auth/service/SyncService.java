package com.qyf.hangyi.auth.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.qyf.hangyi.auth.entity.*;
import com.qyf.hangyi.auth.mapper.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class SyncService {

    private static final Logger log = LoggerFactory.getLogger(SyncService.class);

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

    // ─── Staff ─────────────────────────────────────────────────

    public int syncStaff(List<Map<String, Object>> records) {
        String batch = UUID.randomUUID().toString();
        int count = 0;
        // 确保 team_group 存在
        Map<String, Long> groupMap = ensureTeamGroups(records);
        for (Map<String, Object> rec : records) {
            try {
                String empNo = String.valueOf(rec.getOrDefault("employeeNo", ""));
                // rpt_staff
                upsertRptStaff(rec, empNo);
                // employee 业务表
                upsertEmployee(rec, empNo, groupMap);
                count++;
            } catch (Exception e) {
                log.error("sync staff error: {}", e.getMessage());
                logSync("staff", "INSERT", String.valueOf(rec.get("_id")), 0, "FAILED", e.getMessage(), batch);
            }
        }
        logSync("staff", "INSERT", null, count, "SUCCESS", null, batch);
        return count;
    }

    // ─── Flights ───────────────────────────────────────────────

    public int syncFlights(List<Map<String, Object>> records) {
        String batch = UUID.randomUUID().toString();
        int count = 0;
        for (Map<String, Object> rec : records) {
            try {
                String flightNo = String.valueOf(rec.getOrDefault("flightNo", ""));
                String schedDate = String.valueOf(rec.getOrDefault("scheduleDate", ""));
                // rpt_flight
                upsertRptFlight(rec, flightNo, schedDate);
                // flight_plan 业务表
                upsertFlightPlan(rec, flightNo, schedDate);
                count++;
            } catch (Exception e) {
                log.error("sync flight error: {}", e.getMessage());
            }
        }
        logSync("flights", "INSERT", null, count, "SUCCESS", null, batch);
        return count;
    }

    // ─── Schedules ─────────────────────────────────────────────

    public int syncSchedules(List<Map<String, Object>> records) {
        String batch = UUID.randomUUID().toString();
        int count = 0;
        // fetch employee mapping: employeeNo -> employee.id
        Map<String, Long> empMap = buildEmployeeMap();
        for (Map<String, Object> rec : records) {
            try {
                String fNo = String.valueOf(rec.getOrDefault("flightNo", ""));
                String sDate = String.valueOf(rec.getOrDefault("scheduleDate", ""));
                String sCode = String.valueOf(rec.getOrDefault("shiftCode", ""));
                String staffId = String.valueOf(rec.getOrDefault("staffId", ""));
                String taskType = String.valueOf(rec.getOrDefault("_taskType", ""));
                String sKey = fNo + "_" + sDate + "_" + sCode + "_" + staffId + "_" + taskType;
                // rpt_schedule
                upsertRptSchedule(rec, sKey);
                // schedule_detail 业务表
                String employeeNo = String.valueOf(rec.getOrDefault("staffEmployeeNo", ""));
                upsertScheduleDetail(rec, sKey, employeeNo, empMap);
                count++;
            } catch (Exception e) {
                log.error("sync schedule error: {}", e.getMessage());
            }
        }
        logSync("schedules", "INSERT", null, count, "SUCCESS", null, batch);
        return count;
    }

    // ─── Swap Requests ─────────────────────────────────────────

    public int syncSwapRequests(List<Map<String, Object>> records) {
        String batch = UUID.randomUUID().toString();
        int count = 0;
        Map<String, Long> empMap = buildEmployeeMap();
        for (Map<String, Object> rec : records) {
            try {
                String reqId = String.valueOf(rec.getOrDefault("_id", ""));
                // rpt_swap_request
                upsertRptSwapRequest(rec, reqId);
                // schedule_change 业务表
                upsertScheduleChange(rec, reqId, empMap);
                count++;
            } catch (Exception e) {
                log.error("sync swap error: {}", e.getMessage());
            }
        }
        logSync("swap_requests", "INSERT", null, count, "SUCCESS", null, batch);
        return count;
    }

    // ═══════════════════════════════════════════════════════════
    // BUSINESS TABLE UPSERTS
    // ═══════════════════════════════════════════════════════════

    private void upsertEmployee(Map<String, Object> rec, String empNo, Map<String, Long> groupMap) {
        Employee exist = employeeMapper.selectOne(
            new LambdaQueryWrapper<Employee>().eq(Employee::getEmpNo, empNo));
        boolean active = toBool(rec.get("active"), true);
        boolean onLeave = toBool(rec.get("onLeave"), false);
        String groupId = String.valueOf(rec.getOrDefault("groupId", ""));

        Employee emp = exist != null ? exist : new Employee();
        if (exist == null) emp.setEmpNo(empNo);
        emp.setName(String.valueOf(rec.getOrDefault("name", "")));
        emp.setPhone(String.valueOf(rec.getOrDefault("phone", "")));
        emp.setWorkType("FULL_TIME");
        emp.setStatus(onLeave ? 2 : (active ? 1 : 3));
        emp.setRoleType(String.valueOf(rec.getOrDefault("roleType", "")));
        emp.setOpenid(String.valueOf(rec.getOrDefault("openid", "")));
        emp.setAuthorizedAirlines(toJsonArray(rec.get("authorizedAirlines")));
        emp.setAuthorizedAircraftTypes(toJsonArray(rec.get("authorizedAircraftTypes")));
        emp.setTags(toJsonArray(rec.get("tags")));
        if (groupMap.containsKey(groupId)) emp.setGroupId(groupMap.get(groupId));
        if (exist == null) emp.setHireDate(LocalDate.now());

        if (exist != null) employeeMapper.updateById(emp);
        else employeeMapper.insert(emp);
    }

    private void upsertFlightPlan(Map<String, Object> rec, String flightNo, String schedDate) {
        LocalDate date = schedDate.isEmpty() ? LocalDate.now() : LocalDate.parse(schedDate);
        FlightPlan exist = flightPlanMapper.selectOne(
            new LambdaQueryWrapper<FlightPlan>()
                .eq(FlightPlan::getFlightNo, flightNo)
                .eq(FlightPlan::getPlanDate, date));

        String arrStr = String.valueOf(rec.getOrDefault("arrivalTime", ""));
        String depStr = String.valueOf(rec.getOrDefault("departureTime", ""));

        FlightPlan fp = exist != null ? exist : new FlightPlan();
        if (exist == null) { fp.setFlightNo(flightNo); fp.setPlanDate(date); }
        fp.setAirline(String.valueOf(rec.getOrDefault("airline", "")));
        fp.setAircraftTypeName(String.valueOf(rec.getOrDefault("aircraftType", "")));
        fp.setArrivalTime(parseTime(arrStr));
        fp.setDepartureTime(parseTime(depStr));
        fp.setPlanTime(fp.getArrivalTime() != null ? fp.getArrivalTime() : fp.getDepartureTime());
        fp.setFlightType(depStr.length() > 5 ? "DEP" : "ARR");
        Object stay = rec.get("stayHours");
        fp.setStayHours(stay != null ? new BigDecimal(String.valueOf(stay)) : null);
        fp.setWarningFlag(toBool(rec.get("warningFlag"), false));
        fp.setStatus("SCHEDULED");

        if (exist != null) flightPlanMapper.updateById(fp);
        else flightPlanMapper.insert(fp);
    }

    private void upsertScheduleDetail(Map<String, Object> rec, String sKey, String employeeNo, Map<String, Long> empMap) {
        // find or create schedule (master record)
        String schedName = String.valueOf(rec.getOrDefault("scheduleDate", ""));
        LocalDate workDate = schedName.isEmpty() ? LocalDate.now() : LocalDate.parse(schedName);

        // find employee
        Long employeeId = empMap.get(employeeNo);
        if (employeeId == null) return;

        // check existing by schedule_key approximation
        ScheduleDetail exist = scheduleDetailMapper.selectOne(
            new LambdaQueryWrapper<ScheduleDetail>()
                .eq(ScheduleDetail::getEmployeeId, employeeId)
                .eq(ScheduleDetail::getWorkDate, workDate));

        // map shift_code to shift_id (1=MORNING,2=EVENING,3=NIGHT)
        String sCode = String.valueOf(rec.getOrDefault("shiftCode", ""));
        Long shiftId = mapShiftCode(sCode);

        String taskType = String.valueOf(rec.getOrDefault("_taskType", ""));
        String tStart = String.valueOf(rec.getOrDefault("_taskStart", ""));
        String tEnd = String.valueOf(rec.getOrDefault("_taskEnd", ""));

        ScheduleDetail sd = exist != null ? exist : new ScheduleDetail();
        if (exist == null) { sd.setEmployeeId(employeeId); sd.setWorkDate(workDate); }
        sd.setShiftId(shiftId);
        sd.setScheduleType(String.valueOf(rec.getOrDefault("source", "AUTO")));
        sd.setTaskType("".equals(taskType) ? null : taskType);
        sd.setTaskStart("".equals(tStart) ? null : LocalDateTime.parse(tStart.replace("T", " ").substring(0, 19), java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));
        sd.setTaskEnd("".equals(tEnd) ? null : LocalDateTime.parse(tEnd.replace("T", " ").substring(0, 19), java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")));

        if (exist != null) scheduleDetailMapper.updateById(sd);
        else scheduleDetailMapper.insert(sd);
    }

    private void upsertScheduleChange(Map<String, Object> rec, String reqId, Map<String, Long> empMap) {
        String reqOpenid = String.valueOf(rec.getOrDefault("requesterOpenid", ""));
        Long empId = findEmployeeByOpenid(reqOpenid);
        if (empId == null) return;

        String status = String.valueOf(rec.getOrDefault("status", "PENDING"));
        int st = "APPROVED".equals(status) ? 1 : ("REJECTED".equals(status) ? 2 : 0);

        ScheduleChange exist = scheduleChangeMapper.selectList(
            new LambdaQueryWrapper<ScheduleChange>()
                .eq(ScheduleChange::getEmployeeId, empId)
                .eq(ScheduleChange::getReason, String.valueOf(rec.getOrDefault("reason", ""))))
            .stream().findFirst().orElse(null);

        ScheduleChange sc = exist != null ? exist : new ScheduleChange();
        if (exist == null) sc.setEmployeeId(empId);
        sc.setChangeType(String.valueOf(rec.getOrDefault("requestType", "SWAP")));
        sc.setReason(String.valueOf(rec.getOrDefault("reason", "")));
        sc.setStatus(st);

        if (exist != null) scheduleChangeMapper.updateById(sc);
        else scheduleChangeMapper.insert(sc);
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
        RptFlight exist = rptFlightMapper.selectOne(
            new LambdaQueryWrapper<RptFlight>()
                .eq(RptFlight::getFlightNo, flightNo)
                .eq(RptFlight::getScheduleDate, LocalDate.parse(schedDate)));
        RptFlight entity = mapRptFlight(rec);
        entity.setSourceSyncAt(LocalDateTime.now());
        if (exist != null) { entity.setId(exist.getId()); rptFlightMapper.updateById(entity); }
        else rptFlightMapper.insert(entity);
    }

    private void upsertRptSchedule(Map<String, Object> rec, String sKey) {
        RptSchedule exist = rptScheduleMapper.selectOne(
            new LambdaQueryWrapper<RptSchedule>().eq(RptSchedule::getScheduleKey, sKey));
        RptSchedule entity = mapRptSchedule(rec, sKey);
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
        Set<String> groupNames = records.stream()
            .map(r -> String.valueOf(r.getOrDefault("groupId", "")))
            .filter(s -> !s.isEmpty() && !"未分组".equals(s))
            .collect(Collectors.toSet());
        Map<String, Long> map = new HashMap<>();
        for (String name : groupNames) {
            TeamGroup exist = teamGroupMapper.selectOne(
                new LambdaQueryWrapper<TeamGroup>().eq(TeamGroup::getGroupName, name));
            if (exist != null) {
                map.put(name, exist.getId());
            } else {
                TeamGroup g = new TeamGroup();
                g.setGroupName(name);
                g.setGroupCode(name.replace("组", ""));
                g.setGroupType("MAINTENANCE");
                g.setStatus(1);
                teamGroupMapper.insert(g);
                map.put(name, g.getId());
            }
        }
        // also handle "未分组"
        TeamGroup unassigned = teamGroupMapper.selectOne(
            new LambdaQueryWrapper<TeamGroup>().eq(TeamGroup::getGroupCode, "UNASSIGNED"));
        if (unassigned == null) {
            TeamGroup g = new TeamGroup();
            g.setGroupName("未分组"); g.setGroupCode("UNASSIGNED"); g.setGroupType("MAINTENANCE"); g.setStatus(1);
            teamGroupMapper.insert(g);
            unassigned = g;
        }
        map.put("未分组", unassigned.getId());
        return map;
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

    private Long mapShiftCode(String code) {
        if ("MORNING".equalsIgnoreCase(code)) return 1L;
        if ("EVENING".equalsIgnoreCase(code)) return 2L;
        if ("NIGHT".equalsIgnoreCase(code)) return 3L;
        if ("STANDBY".equalsIgnoreCase(code)) return 4L;
        return 5L; // REST
    }

    private LocalTime parseTime(String timeStr) {
        if (timeStr == null || timeStr.isEmpty() || timeStr.length() < 16) return null;
        try {
            // Format: "2026-05-29T08:00" or "2026-05-29T08:00:00"
            String timePart = timeStr.contains("T") ? timeStr.split("T")[1] : timeStr;
            if (timePart.length() >= 5) {
                return LocalTime.parse(timePart.substring(0, 5));
            }
        } catch (Exception e) { log.debug("parse time error: {}", timeStr); }
        return null;
    }

    private String toJsonArray(Object val) {
        if (val == null) return null;
        if (val instanceof List) {
            return "[" + ((List<?>) val).stream()
                .map(v -> "\"" + String.valueOf(v).replace("\"", "\\\"") + "\"")
                .collect(Collectors.joining(",")) + "]";
        }
        return String.valueOf(val);
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
        s.setSourceId(String.valueOf(rec.getOrDefault("_id", "")));
        return s;
    }

    private RptFlight mapRptFlight(Map<String, Object> rec) {
        RptFlight f = new RptFlight();
        f.setFlightNo(String.valueOf(rec.getOrDefault("flightNo", "")));
        f.setAirline(String.valueOf(rec.getOrDefault("airline", "")));
        f.setAircraftType(String.valueOf(rec.getOrDefault("aircraftType", "")));
        String sd = String.valueOf(rec.getOrDefault("scheduleDate", ""));
        f.setScheduleDate(sd.isEmpty() ? null : LocalDate.parse(sd));
        f.setArrivalTime(String.valueOf(rec.getOrDefault("arrivalTime", "")));
        f.setDepartureTime(String.valueOf(rec.getOrDefault("departureTime", "")));
        Object sh = rec.get("stayHours");
        f.setStayHours(sh != null ? new BigDecimal(String.valueOf(sh)) : null);
        f.setWarningFlag(toBool(rec.get("warningFlag"), false));
        f.setSourceId(String.valueOf(rec.getOrDefault("_id", "")));
        return f;
    }

    private RptSchedule mapRptSchedule(Map<String, Object> rec, String sKey) {
        RptSchedule s = new RptSchedule();
        s.setScheduleKey(sKey);
        s.setFlightNo(String.valueOf(rec.getOrDefault("flightNo", "")));
        s.setStaffName(String.valueOf(rec.getOrDefault("staffName", "")));
        s.setEmployeeNo(String.valueOf(rec.getOrDefault("staffEmployeeNo", "")));
        s.setGroupId(String.valueOf(rec.getOrDefault("groupId", "")));
        s.setStatus(String.valueOf(rec.getOrDefault("status", "ASSIGNED")));
        s.setSourceId(String.valueOf(rec.getOrDefault("_id", "")));
        return s;
    }

    private RptSwapRequest mapRptSwapRequest(Map<String, Object> rec) {
        RptSwapRequest r = new RptSwapRequest();
        r.setRequestId(String.valueOf(rec.getOrDefault("_id", "")));
        r.setRequestType(String.valueOf(rec.getOrDefault("requestType", "SWAP")));
        r.setRequesterEmp(String.valueOf(rec.getOrDefault("requesterOpenid", "")));
        r.setStatus(String.valueOf(rec.getOrDefault("status", "PENDING")));
        r.setReason(String.valueOf(rec.getOrDefault("reason", "")));
        r.setSourceId(String.valueOf(rec.getOrDefault("_id", "")));
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
}
