package com.qyf.hangyi.schedule.service.export;

import com.alibaba.excel.EasyExcel;
import com.alibaba.excel.write.style.column.LongestMatchColumnWidthStyleStrategy;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.qyf.hangyi.schedule.client.EmployeeFeignClient;
import com.qyf.hangyi.schedule.entity.Schedule;
import com.qyf.hangyi.schedule.entity.ScheduleDetail;
import com.qyf.hangyi.schedule.entity.ShiftTemplate;
import com.qyf.hangyi.schedule.mapper.ScheduleDetailMapper;
import com.qyf.hangyi.schedule.mapper.ScheduleMapper;
import com.qyf.hangyi.schedule.mapper.ShiftTemplateMapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class ScheduleExportService {

    @Autowired
    private ScheduleMapper scheduleMapper;

    @Autowired
    private ScheduleDetailMapper detailMapper;

    @Autowired
    private EmployeeFeignClient employeeFeignClient;

    @Autowired
    private ShiftTemplateMapper shiftTemplateMapper;

    public void exportScheduleExcel(Long scheduleId, HttpServletResponse response) throws IOException {
        Schedule schedule = scheduleMapper.selectById(scheduleId);
        if (schedule == null) {
            throw new RuntimeException("排班不存在");
        }

        List<ScheduleDetail> details = detailMapper.selectList(
                new LambdaQueryWrapper<ScheduleDetail>()
                        .eq(ScheduleDetail::getScheduleId, scheduleId));

        Map<Long, String> empNameMap = loadEmployeeNameMap();
        Map<Long, String> shiftNameMap = loadShiftNameMap();

        Map<Long, List<ScheduleDetail>> byEmployee = details.stream()
                .collect(Collectors.groupingBy(ScheduleDetail::getEmployeeId));

        List<LocalDate> dates = details.stream()
                .map(ScheduleDetail::getWorkDate)
                .distinct()
                .sorted()
                .collect(Collectors.toList());

        String fileName = URLEncoder.encode(
                schedule.getScheduleName() + ".xlsx", StandardCharsets.UTF_8);
        response.setContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        response.setHeader("Content-Disposition", "attachment; filename*=UTF-8''" + fileName);

        List<ScheduleExcelRow> rows = new ArrayList<>();
        for (Map.Entry<Long, List<ScheduleDetail>> entry : byEmployee.entrySet()) {
            Map<LocalDate, ScheduleDetail> dateMap = entry.getValue().stream()
                    .collect(Collectors.toMap(ScheduleDetail::getWorkDate, d -> d));

            ScheduleExcelRow row = new ScheduleExcelRow();
            row.setEmpNo(empNameMap.getOrDefault(entry.getKey(), "未知"));

            List<String> shifts = new ArrayList<>();
            for (LocalDate date : dates) {
                ScheduleDetail d = dateMap.get(date);
                shifts.add(d != null ? shiftNameMap.getOrDefault(d.getShiftId(), "") : "休");
            }
            row.setShifts(shifts);

            long workDays = entry.getValue().size();
            row.setWorkDays((int) workDays);
            row.setRestDays(dates.size() - (int) workDays);

            rows.add(row);
        }

        EasyExcel.write(response.getOutputStream(), ScheduleExcelRow.class)
                .registerWriteHandler(new LongestMatchColumnWidthStyleStrategy())
                .sheet(schedule.getScheduleName())
                .doWrite(rows);
    }

    public void exportDailyScheduleExcel(LocalDate date, HttpServletResponse response) throws IOException {
        List<ScheduleDetail> details = detailMapper.selectList(
                new LambdaQueryWrapper<ScheduleDetail>()
                        .eq(ScheduleDetail::getWorkDate, date));

        Map<Long, String> empNameMap = loadEmployeeNameMap();
        Map<Long, String> shiftNameMap = loadShiftNameMap();

        String fileName = URLEncoder.encode(
                "排班日报_" + date + ".xlsx", StandardCharsets.UTF_8);
        response.setContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        response.setHeader("Content-Disposition", "attachment; filename*=UTF-8''" + fileName);

        List<DailyScheduleRow> rows = details.stream()
                .map(d -> {
                    DailyScheduleRow row = new DailyScheduleRow();
                    row.setEmployeeName(empNameMap.getOrDefault(d.getEmployeeId(), "未知"));
                    row.setShiftName(shiftNameMap.getOrDefault(d.getShiftId(), ""));
                    row.setWorkDate(d.getWorkDate().toString());
                    row.setScheduleType(d.getScheduleType());
                    return row;
                })
                .collect(Collectors.toList());

        EasyExcel.write(response.getOutputStream(), DailyScheduleRow.class)
                .registerWriteHandler(new LongestMatchColumnWidthStyleStrategy())
                .sheet("排班日报_" + date.format(DateTimeFormatter.ofPattern("yyyyMMdd")))
                .doWrite(rows);
    }

    @SuppressWarnings("unchecked")
    private Map<Long, String> loadEmployeeNameMap() {
        var response = employeeFeignClient.listAll();
        if (response.getData() == null) return Map.of();

        Map<Long, String> nameMap = new HashMap<>();
        for (Map<String, Object> emp : (List<Map<String, Object>>) response.getData()) {
            Object id = emp.get("id");
            Object empNo = emp.get("empNo");
            Object name = emp.get("name");
            if (id != null) {
                Long eid = (id instanceof Number) ? ((Number) id).longValue() : Long.valueOf(id.toString());
                String label = (empNo != null ? empNo : "") + " " + (name != null ? name : "");
                nameMap.put(eid, label);
            }
        }
        return nameMap;
    }

    private Map<Long, String> loadShiftNameMap() {
        return shiftTemplateMapper.selectList(null).stream()
                .collect(Collectors.toMap(ShiftTemplate::getId,
                        ShiftTemplate::getShiftName));
    }
}
