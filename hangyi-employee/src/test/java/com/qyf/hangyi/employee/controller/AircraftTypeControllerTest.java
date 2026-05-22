package com.qyf.hangyi.employee.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.qyf.hangyi.employee.entity.AircraftType;
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
class AircraftTypeControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void testList() throws Exception {
        mockMvc.perform(get("/api/aircraft-types/list"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.length()").value(2));
    }

    @Test
    void testListAll() throws Exception {
        mockMvc.perform(get("/api/aircraft-types/list-all"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
    }

    @Test
    void testCreate() throws Exception {
        AircraftType type = new AircraftType();
        type.setTypeCode("B738");
        type.setTypeName("波音737-800");
        type.setManufacturer("波音");
        type.setStatus(1);

        mockMvc.perform(post("/api/aircraft-types")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(type)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
    }

    @Test
    void testUpdate() throws Exception {
        AircraftType type = new AircraftType();
        type.setId(1L);
        type.setTypeName("波音737(更新)");

        mockMvc.perform(put("/api/aircraft-types")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(type)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
    }

    @Test
    void testDelete() throws Exception {
        mockMvc.perform(delete("/api/aircraft-types/2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
    }
}
