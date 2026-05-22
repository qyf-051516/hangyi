package com.qyf.hangyi.employee.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.qyf.hangyi.employee.entity.EmployeePreference;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc(addFilters = false)
@Transactional
class EmployeePreferenceControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void testListByEmployee() throws Exception {
        mockMvc.perform(get("/api/preferences/employee/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
    }

    @Test
    void testCreate() throws Exception {
        EmployeePreference pref = new EmployeePreference();
        pref.setEmployeeId(1L);
        pref.setPrefType("SHIFT");
        pref.setPrefKey("preferred_shift");
        pref.setPrefValue("MORNING");
        pref.setStatus(1);

        mockMvc.perform(post("/api/preferences")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(pref)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
    }

    @Test
    void testUpdate() throws Exception {
        EmployeePreference pref = new EmployeePreference();
        pref.setId(1L);
        pref.setPrefValue("EVENING");

        mockMvc.perform(put("/api/preferences")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(pref)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
    }

    @Test
    void testDelete() throws Exception {
        mockMvc.perform(delete("/api/preferences/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
    }
}
