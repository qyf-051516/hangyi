package com.qyf.hangyi.employee.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.qyf.hangyi.employee.entity.EmployeeQualification;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc(addFilters = false)
@Transactional
class QualificationControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void testPage() throws Exception {
        mockMvc.perform(get("/api/qualifications/page")
                        .param("page", "1")
                        .param("size", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.records.length()").value(2));
    }

    @Test
    void testPage_WithEmployeeFilter() throws Exception {
        mockMvc.perform(get("/api/qualifications/page")
                        .param("page", "1")
                        .param("size", "20")
                        .param("employeeId", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
    }

    @Test
    void testListByEmployee() throws Exception {
        mockMvc.perform(get("/api/qualifications/employee/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
    }

    @Test
    void testExpiring() throws Exception {
        mockMvc.perform(get("/api/qualifications/expiring"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
    }

    @Test
    void testCreate() throws Exception {
        EmployeeQualification q = new EmployeeQualification();
        q.setEmployeeId(1L);
        q.setQualType("AIRCRAFT_TYPE");
        q.setQualCode("B737-AUTH");
        q.setIssueDate(LocalDate.now());
        q.setExpireDate(LocalDate.now().plusYears(1));
        q.setStatus(1);

        mockMvc.perform(post("/api/qualifications")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(q)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
    }

    @Test
    void testDelete() throws Exception {
        mockMvc.perform(delete("/api/qualifications/2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
    }
}
