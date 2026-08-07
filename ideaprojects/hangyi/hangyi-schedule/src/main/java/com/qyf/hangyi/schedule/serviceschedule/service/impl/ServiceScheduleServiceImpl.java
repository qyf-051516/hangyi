package com.qyf.hangyi.schedule.serviceschedule.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.qyf.hangyi.common.exception.BusinessException;
import com.qyf.hangyi.schedule.entity.Schedule;
import com.qyf.hangyi.schedule.entity.ScheduleDetail;
import com.qyf.hangyi.schedule.mapper.ScheduleDetailMapper;
import com.qyf.hangyi.schedule.mapper.ScheduleMapper;
import com.qyf.hangyi.schedule.service.ScheduleAssignmentComplianceService;
import com.qyf.hangyi.schedule.serviceschedule.service.ServiceScheduleService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeParseException;
import java.util.*;

@Service
public class ServiceScheduleServiceImpl implements ServiceScheduleService {

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private ScheduleDetailMapper detailMapper;

    @Autowired
    private ScheduleMapper scheduleMapper;

    @Autowired
    private ScheduleAssignmentComplianceService complianceService;

    @Override
    public Map<String, Object> getServiceScheduleTable(String scheduleDate) {
        String date = scheduleDate != null ? scheduleDate : LocalDate.now().toString();

        List<Map<String, Object>> schedules = jdbc.queryForList(
            "SELECT sd.*, e.name as staff_name, e.emp_no as staff_employee_no, " +
            "fp.flight_no, fp.airline, " +
            "COALESCE(fp.aircraft_type_name, at.type_name) as aircraft_type " +
            "FROM schedule_detail sd " +
            "LEFT JOIN employee e ON sd.employee_id = e.id " +
            "LEFT JOIN flight_plan fp ON sd.flight_id = fp.id " +
            "LEFT JOIN aircraft_type at ON fp.aircraft_type_id = at.id " +
            "WHERE sd.work_date = ? AND sd.task_type IS NOT NULL " +
            "AND (sd.record_status IS NULL OR sd.record_status = 'active') " +
            "ORDER BY sd.task_start, fp.flight_no, sd.task_type", date);

        // Group by flight + task type while preserving database order.
        Map<String, Map<String, Object>> taskGroups = new LinkedHashMap<>();
        for (Map<String, Object> s : schedules) {
            String flightNo = stringValue(s.get("flight_no"));
            String taskType = stringValue(s.get("task_type"));
            String flightKey = s.get("flight_id") != null
                    ? String.valueOf(s.get("flight_id"))
                    : flightNo;
            String key = flightKey + "_" + taskType;

            if (!taskGroups.containsKey(key)) {
                Map<String, Object> group = new LinkedHashMap<>();
                group.put("flightId", s.get("flight_id"));
                group.put("flightNo", flightNo);
                group.put("airline", stringValue(s.get("airline")));
                group.put("aircraftType", stringValue(s.get("aircraft_type")));
                group.put("taskType", taskType);
                group.put("taskStart", s.getOrDefault("task_start", ""));
                group.put("taskEnd", s.getOrDefault("task_end", ""));
                group.put("staff", new ArrayList<>());
                taskGroups.put(key, group);
            }

            Map<String, Object> staffEntry = new LinkedHashMap<>();
            staffEntry.put("staffId", s.get("employee_id"));
            staffEntry.put("name", stringValue(s.get("staff_name")));
            staffEntry.put("employeeNo", stringValue(s.get("staff_employee_no")));
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> staffList = (List<Map<String, Object>>) taskGroups.get(key).get("staff");
            staffList.add(staffEntry);
        }

        Map<String, Object> result = new HashMap<>();
        result.put("scheduleDate", date);
        result.put("tasks", new ArrayList<>(taskGroups.values()));
        result.put("total", taskGroups.size());
        return result;
    }

    @Override
    @Transactional
    public Map<String, Object> publishServiceSchedule(Map<String, Object> payload) {
        LocalDate workDate = parseScheduleDate(payload.get("scheduleDate"));
        String scheduleDate = workDate.toString();
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> assignments = (List<Map<String, Object>>) payload.getOrDefault("assignments", List.of());

        if (assignments.isEmpty()) {
            throw new BusinessException(400, "没有可发布的排班内容");
        }

        List<ScheduleDetail> details = buildDetails(workDate, assignments);
        if (details.isEmpty()) {
            throw new BusinessException(400, "至少需要为一项勤务任务安排人员");
        }

        // 服务端校验完整候选集后才归档旧版本。不能只依赖预览页：请假、资质和
        // 既有任务会在管理员打开页面后变化。
        complianceService.validateAssignments(details, Set.of(), "SERVICE");

        jdbc.update("UPDATE schedule_detail SET record_status = 'archived', " +
                "updated_at = NOW() WHERE work_date = ? AND schedule_type = 'SERVICE' " +
                "AND (record_status IS NULL OR record_status = 'active')", scheduleDate);
        scheduleMapper.update(null, new LambdaUpdateWrapper<Schedule>()
                .eq(Schedule::getScheduleType, "SERVICE")
                .eq(Schedule::getStartDate, workDate)
                .eq(Schedule::getEndDate, workDate)
                .eq(Schedule::getStatus, 1)
                .set(Schedule::getStatus, 0));

        Schedule schedule = new Schedule();
        schedule.setScheduleName("勤务排班 " + scheduleDate);
        schedule.setStartDate(workDate);
        schedule.setEndDate(workDate);
        schedule.setStatus(1);
        schedule.setScheduleType("SERVICE");
        schedule.setPublishedAt(LocalDateTime.now());
        scheduleMapper.insert(schedule);
        if (schedule.getId() == null) {
            throw new IllegalStateException("勤务排班主记录创建失败");
        }

        for (ScheduleDetail detail : details) {
            detail.setScheduleId(schedule.getId());
            detailMapper.insert(detail);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("scheduleId", schedule.getId());
        result.put("scheduleDate", scheduleDate);
        result.put("writtenCount", details.size());
        return result;
    }

    private List<ScheduleDetail> buildDetails(
            LocalDate workDate,
            List<Map<String, Object>> assignments) {
        List<ScheduleDetail> details = new ArrayList<>();
        for (Map<String, Object> a : assignments) {
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> staffList = (List<Map<String, Object>>) a.getOrDefault("staff", List.of());
            if (staffList.isEmpty()) {
                continue;
            }

            String taskType = stringValue(a.get("taskType"));
            if (taskType.isBlank()) {
                throw new BusinessException(400, "勤务任务类型不能为空");
            }
            LocalDateTime taskStart = parseTaskTime(
                    workDate,
                    a.getOrDefault("taskStart", "08:00"),
                    "任务开始时间");
            LocalDateTime taskEnd = parseTaskTime(
                    workDate,
                    a.getOrDefault("taskEnd", "12:00"),
                    "任务结束时间");
            if (!taskEnd.isAfter(taskStart)) {
                taskEnd = taskEnd.plusDays(1);
            }

            for (Map<String, Object> staffEntry : staffList) {
                ScheduleDetail detail = new ScheduleDetail();
                detail.setEmployeeId(parseRequiredLong(staffEntry.get("staffId"), "人员编号"));
                detail.setWorkDate(workDate);
                detail.setShiftGroup("MORNING");
                detail.setScheduleType("SERVICE");
                detail.setFlightId(parseOptionalLong(a.get("flightId"), "航班编号"));
                detail.setTaskType(taskType);
                detail.setTaskStart(taskStart);
                detail.setTaskEnd(taskEnd);
                detail.setSource("MANUAL");
                detail.setRecordStatus("active");
                details.add(detail);
            }
        }
        return details;
    }

    private LocalDate parseScheduleDate(Object value) {
        String text = stringValue(value);
        if (text.isBlank()) {
            return LocalDate.now();
        }
        try {
            return LocalDate.parse(text);
        } catch (DateTimeParseException exception) {
            throw new BusinessException(400, "排班日期格式应为 YYYY-MM-DD");
        }
    }

    private LocalDateTime parseTaskTime(LocalDate date, Object value, String fieldName) {
        String text = stringValue(value);
        try {
            if (text.contains("T")) {
                return LocalDateTime.parse(text);
            }
            return date.atTime(LocalTime.parse(text));
        } catch (DateTimeParseException exception) {
            throw new BusinessException(400, fieldName + "格式应为 HH:mm");
        }
    }

    private Long parseRequiredLong(Object value, String fieldName) {
        Long parsed = parseOptionalLong(value, fieldName);
        if (parsed == null) {
            throw new BusinessException(400, fieldName + "不能为空");
        }
        return parsed;
    }

    private Long parseOptionalLong(Object value, String fieldName) {
        if (value == null || stringValue(value).isBlank()) {
            return null;
        }
        if (value instanceof Number number) {
            return number.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException exception) {
            throw new BusinessException(400, fieldName + "格式不正确");
        }
    }

    private static String stringValue(Object value) {
        return value == null ? "" : String.valueOf(value);
    }
}
