package com.qyf.hangyi.schedule.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.qyf.hangyi.schedule.entity.ShiftTemplate;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalTime;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc(addFilters = false)
@Transactional
class ShiftTemplateControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void testList() throws Exception {
        mockMvc.perform(get("/api/shifts/list"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.length()").value(3));
    }

    @Test
    void testCreate() throws Exception {
        ShiftTemplate shift = new ShiftTemplate();
        shift.setShiftCode("TEST");
        shift.setShiftName("测试班次");
        shift.setStartTime(LocalTime.of(10, 0));
        shift.setEndTime(LocalTime.of(18, 0));
        shift.setShiftType("DAY");

        mockMvc.perform(post("/api/shifts")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(shift)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
    }

    @Test
    void testUpdate() throws Exception {
        ShiftTemplate shift = new ShiftTemplate();
        shift.setId(1L);
        shift.setShiftName("早班(更新)");

        mockMvc.perform(put("/api/shifts")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(shift)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
    }

    @Test
    void testDelete() throws Exception {
        mockMvc.perform(delete("/api/shifts/3"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
    }
}
