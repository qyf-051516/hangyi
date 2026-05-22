package com.qyf.hangyi.leave.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.qyf.hangyi.leave.entity.LeaveRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc(addFilters = false)
@Transactional
class LeaveRequestControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void testPage() throws Exception {
        mockMvc.perform(get("/api/leaves/page")
                        .param("page", "1")
                        .param("size", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.records[0].leaveType").value("ANNUAL"));
    }

    @Test
    void testPage_WithEmployeeFilter() throws Exception {
        mockMvc.perform(get("/api/leaves/page")
                        .param("page", "1")
                        .param("size", "20")
                        .param("employeeId", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.records.length()").value(2));
    }

    @Test
    void testCreate() throws Exception {
        LeaveRequest leave = new LeaveRequest();
        leave.setEmployeeId(1L);
        leave.setLeaveType("ANNUAL");
        leave.setStartDate(LocalDate.of(2026, 7, 1));
        leave.setEndDate(LocalDate.of(2026, 7, 2));
        leave.setTotalDays(new BigDecimal("2.0"));
        leave.setReason("测试请假");
        leave.setStatus(0);

        mockMvc.perform(post("/api/leaves")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(leave)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
    }

    @Test
    void testGetPendingStats() throws Exception {
        mockMvc.perform(get("/api/leaves/stats/pending"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.pendingLeaveCount").value(2));
    }
}
