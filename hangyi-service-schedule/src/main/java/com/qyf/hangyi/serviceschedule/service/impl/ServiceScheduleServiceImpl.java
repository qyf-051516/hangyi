package com.qyf.hangyi.serviceschedule.service.impl;

import com.qyf.hangyi.schedule.entity.ScheduleDetail;
import com.qyf.hangyi.schedule.mapper.ScheduleDetailMapper;
import com.qyf.hangyi.serviceschedule.service.ServiceScheduleService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.*;

@Service
public class ServiceScheduleServiceImpl implements ServiceScheduleService {

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private ScheduleDetailMapper detailMapper;

    @Override
    public Map<String, Object> getServiceScheduleTable(String scheduleDate) {
        String date = scheduleDate != null ? scheduleDate : LocalDate.now().toString();

        List<Map<String, Object>> schedules = jdbc.queryForList(
            "SELECT sd.*, e.name as staff_name, e.employee_no as staff_employee_no " +
            "FROM schedule_detail sd " +
            "LEFT JOIN employee e ON sd.employee_id = e.id " +
            "WHERE sd.work_date = ? AND sd.task_type IS NOT NULL " +
            "AND (sd.record_status IS NULL OR sd.record_status = 'active')", date);

        // Group by flightNo + taskType
        Map<String, Map<String, Object>> taskGroups = new LinkedHashMap<>();
        for (Map<String, Object> s : schedules) {
            String flightNo = String.valueOf(s.getOrDefault("flight_no", s.getOrDefault("flightNo", "")));
            String taskType = String.valueOf(s.get("task_type"));
            String key = flightNo + "_" + taskType;

            if (!taskGroups.containsKey(key)) {
                Map<String, Object> group = new HashMap<>();
                group.put("flightNo", flightNo);
                group.put("airline", s.getOrDefault("airline", ""));
                group.put("aircraftType", s.getOrDefault("aircraft_type", ""));
                group.put("taskType", taskType);
                group.put("taskStart", s.getOrDefault("task_start", ""));
                group.put("taskEnd", s.getOrDefault("task_end", ""));
                group.put("staff", new ArrayList<>());
                taskGroups.put(key, group);
            }

            Map<String, Object> staffEntry = new HashMap<>();
            staffEntry.put("staffId", s.get("employee_id"));
            staffEntry.put("name", s.getOrDefault("staff_name", ""));
            staffEntry.put("employeeNo", s.getOrDefault("staff_employee_no", ""));
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
        String scheduleDate = String.valueOf(payload.getOrDefault("scheduleDate", LocalDate.now().toString()));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> assignments = (List<Map<String, Object>>) payload.getOrDefault("assignments", List.of());

        if (assignments.isEmpty()) {
            throw new RuntimeException("没有可发布的排班内容");
        }

        // Archive existing service schedules for this date
        jdbc.update("UPDATE schedule_detail SET record_status = 'archived', " +
            "updated_at = NOW() WHERE work_date = ? AND task_type IS NOT NULL", scheduleDate);

        // Write new schedules
        int writtenCount = 0;
        for (Map<String, Object> a : assignments) {
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> staffList = (List<Map<String, Object>>) a.getOrDefault("staff", List.of());
            if (staffList.isEmpty()) {
                continue;
            }

            for (Map<String, Object> staffEntry : staffList) {
                ScheduleDetail detail = new ScheduleDetail();
                detail.setEmployeeId(((Number) staffEntry.get("staffId")).longValue());
                detail.setWorkDate(LocalDate.parse(scheduleDate));
                detail.setShiftGroup("MORNING");
                detail.setScheduleType("ADMIN_ROLES");
                detail.setTaskType(String.valueOf(a.getOrDefault("taskType", "")));
                detail.setTaskStart(java.time.LocalDateTime.parse(scheduleDate + "T" + String.valueOf(a.getOrDefault("taskStart", "08:00:00"))));
                detail.setTaskEnd(java.time.LocalDateTime.parse(scheduleDate + "T" + String.valueOf(a.getOrDefault("taskEnd", "12:00:00"))));
                detailMapper.insert(detail);
                writtenCount++;
            }
        }

        Map<String, Object> result = new HashMap<>();
        result.put("scheduleDate", scheduleDate);
        result.put("writtenCount", writtenCount);
        return result;
    }
}
