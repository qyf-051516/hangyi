package com.qyf.hangyi.schedule.controller;

import com.qyf.hangyi.common.result.R;
import com.qyf.hangyi.schedule.service.export.ScheduleExportService;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.time.LocalDate;

@RestController
@RequestMapping("/api/schedules/export")
public class ScheduleExportController {

    @Autowired
    private ScheduleExportService scheduleExportService;

    /**
     * 导出排班周期 Excel
     */
    @GetMapping("/schedule/{id}")
    public void exportSchedule(@PathVariable Long id, HttpServletResponse response) throws IOException {
        scheduleExportService.exportScheduleExcel(id, response);
    }

    /**
     * 导出排班日报 Excel
     */
    @GetMapping("/daily")
    public void exportDaily(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            HttpServletResponse response) throws IOException {
        scheduleExportService.exportDailyScheduleExcel(date, response);
    }
}
