package com.qyf.hangyi.schedule.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.qyf.hangyi.schedule.entity.ScheduleChange;
import com.qyf.hangyi.schedule.mapper.ScheduleDetailMapper;
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

    @Autowired
    private ScheduleDetailMapper scheduleDetailMapper;

    @AfterEach
    void clearSecurity() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void testPage() throws Exception {
        UsernamePasswordAuthenticationToken authentication = adminAuthentication();
        mockMvc.perform(get("/api/schedule-changes/page")
                        .param("page", "1")
                        .param("size", "20")
                        .principal(authentication))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.records.length()").value(1));
    }

    @Test
    void testPage_WithFilter() throws Exception {
        UsernamePasswordAuthenticationToken authentication = adminAuthentication();
        mockMvc.perform(get("/api/schedule-changes/page")
                        .param("page", "1")
                        .param("size", "20")
                        .param("employeeId", "1")
                        .param("status", "0")
                        .principal(authentication))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.records.length()").value(1));
    }

    @Test
    void testCreate() throws Exception {
        UsernamePasswordAuthenticationToken authentication = adminAuthentication();
        ScheduleChange change = new ScheduleChange();
        change.setScheduleDetailId(2L);
        change.setEmployeeId(1L);
        change.setChangeType("SWAP");
        change.setFromDate(LocalDate.of(2026, 5, 19));
        change.setFromShiftId(2L);
        change.setStatus(0);

        mockMvc.perform(post("/api/schedule-changes")
                        .contentType(MediaType.APPLICATION_JSON)
                        .principal(authentication)
                        .content(objectMapper.writeValueAsString(change)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
    }

    @Test
    void testApprove() throws Exception {
        UsernamePasswordAuthenticationToken authentication = adminAuthentication();

        mockMvc.perform(put("/api/schedule-changes/1/approve")
                        .param("status", "1")
                        .param("remark", "同意")
                        .principal(authentication))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));

        org.assertj.core.api.Assertions.assertThat(
                scheduleDetailMapper.selectById(1L).getEmployeeId()).isEqualTo(3L);
    }

    private UsernamePasswordAuthenticationToken adminAuthentication() {
        return new UsernamePasswordAuthenticationToken(99L, null,
                List.of(new SimpleGrantedAuthority("ROLE_ADMIN")));
    }
}
