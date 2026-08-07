package com.qyf.hangyi.schedule.controller;

import com.qyf.hangyi.schedule.service.export.ScheduleExportService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(ScheduleExportController.class)
class ScheduleExportControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private ScheduleExportService scheduleExportService;

    @Test
    void testExportSchedule() throws Exception {
        mockMvc.perform(get("/api/schedules/export/schedule/1"))
                .andExpect(status().isOk());
    }

    @Test
    void testExportDaily() throws Exception {
        mockMvc.perform(get("/api/schedules/export/daily")
                        .param("date", "2026-05-23"))
                .andExpect(status().isOk());
    }
}
