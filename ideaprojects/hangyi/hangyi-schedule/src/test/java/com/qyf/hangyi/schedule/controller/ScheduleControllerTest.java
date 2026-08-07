package com.qyf.hangyi.schedule.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc(addFilters = false)
@Transactional
class ScheduleControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @AfterEach
    void clearSecurity() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void testList() throws Exception {
        mockMvc.perform(get("/api/schedules/list"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.length()").value(1));
    }

    @Test
    void testPage() throws Exception {
        mockMvc.perform(get("/api/schedules/page")
                        .param("page", "1")
                        .param("size", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.records.length()").value(1));
    }

    @Test
    void testDetails() throws Exception {
        mockMvc.perform(get("/api/schedules/1/details"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.length()").value(3));
    }

    @Test
    void testByDate() throws Exception {
        mockMvc.perform(get("/api/schedules/by-date")
                        .param("date", "2026-05-18"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.length()").value(2));
    }

    @Test
    void testCount() throws Exception {
        mockMvc.perform(get("/api/schedules/count"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data").value(1));
    }

    @Test
    void testGetTodayStats() throws Exception {
        mockMvc.perform(get("/api/schedules/stats/today"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.todayOnDuty").isNumber());
    }

    @Test
    void testPublish() throws Exception {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("admin", null,
                        List.of(new SimpleGrantedAuthority("ROLE_ADMIN"))));

        mockMvc.perform(put("/api/schedules/1/publish"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
    }

    @Test
    void testDeletePublishedScheduleIsRejected() throws Exception {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("admin", null,
                        List.of(new SimpleGrantedAuthority("ROLE_ADMIN"))));

        mockMvc.perform(delete("/api/schedules/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(400))
                .andExpect(jsonPath("$.msg").value("只能删除草稿状态的排班"));
    }

    @Test
    void testDeleteDraftScheduleAlsoDeletesDetails() throws Exception {
        jdbcTemplate.update("""
                INSERT INTO schedule
                    (id, schedule_name, group_id, start_date, end_date, status, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, 2L, "待删除草稿", 1L, "2026-06-01", "2026-06-07", 0, 1L);
        jdbcTemplate.update("""
                INSERT INTO schedule_detail
                    (id, schedule_id, employee_id, work_date, shift_id, schedule_type)
                VALUES (?, ?, ?, ?, ?, ?)
                """, 4L, 2L, 1L, "2026-06-01", 1L, "AUTO");

        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("admin", null,
                        List.of(new SimpleGrantedAuthority("ROLE_ADMIN"))));

        mockMvc.perform(delete("/api/schedules/2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));

        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM schedule WHERE id = 2", Integer.class)).isZero();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM schedule_detail WHERE schedule_id = 2", Integer.class)).isZero();
    }

    @Test
    void testPublishDraftRejectsStaleVersionBeforeWriting() throws Exception {
        jdbcTemplate.update("""
                INSERT INTO schedule
                    (id, schedule_name, group_id, start_date, end_date, status, version, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, 9L, "版本校验草稿", 1L, "2026-06-01", "2026-06-01", 0, 0, 1L);

        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("admin", null,
                        List.of(new SimpleGrantedAuthority("ROLE_ADMIN"))));

        mockMvc.perform(put("/api/schedules/9/publish").param("version", "2"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value(409));

        assertThat(jdbcTemplate.queryForObject(
                "SELECT status FROM schedule WHERE id = 9", Integer.class)).isZero();
    }

    @Test
    void testAutoScheduleRejectsReversedDateRange() throws Exception {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("1", null,
                        List.of(new SimpleGrantedAuthority("ROLE_ADMIN"))));

        mockMvc.perform(post("/api/schedules/auto")
                        .contentType("application/json")
                        .content("""
                                {
                                  "groupId": 1,
                                  "startDate": "2026-06-07",
                                  "endDate": "2026-06-01"
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(400))
                .andExpect(jsonPath("$.msg").value("结束日期不能早于开始日期"));
    }
}
