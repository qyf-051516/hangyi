package com.qyf.hangyi.schedule.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.qyf.hangyi.schedule.entity.ScheduleChange;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc(addFilters = false)
@Transactional
class ScheduleChangeControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @AfterEach
    void clearSecurity() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void testPage() throws Exception {
        mockMvc.perform(get("/api/schedule-changes/page")
                        .param("page", "1")
                        .param("size", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.records.length()").value(1));
    }

    @Test
    void testPage_WithFilter() throws Exception {
        mockMvc.perform(get("/api/schedule-changes/page")
                        .param("page", "1")
                        .param("size", "20")
                        .param("employeeId", "1")
                        .param("status", "0"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.records.length()").value(1));
    }

    @Test
    void testCreate() throws Exception {
        ScheduleChange change = new ScheduleChange();
        change.setEmployeeId(1L);
        change.setChangeType("SWAP");
        change.setFromDate(LocalDate.of(2026, 5, 19));
        change.setFromShiftId(2L);
        change.setStatus(0);

        mockMvc.perform(post("/api/schedule-changes")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(change)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
    }

    @Test
    void testApprove() throws Exception {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("admin", null,
                        List.of(new SimpleGrantedAuthority("ROLE_ADMIN"))));

        mockMvc.perform(put("/api/schedule-changes/1/approve")
                        .param("status", "1")
                        .param("remark", "同意"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
    }
}
