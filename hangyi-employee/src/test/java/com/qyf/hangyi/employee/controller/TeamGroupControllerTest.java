package com.qyf.hangyi.employee.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.qyf.hangyi.employee.entity.TeamGroup;
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
class TeamGroupControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void testList() throws Exception {
        mockMvc.perform(get("/api/groups/list"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.length()").value(2));
    }

    @Test
    void testCreate() throws Exception {
        TeamGroup group = new TeamGroup();
        group.setGroupName("测试班组");
        group.setGroupCode("TEST-01");
        group.setGroupType("MAINTENANCE");
        group.setStatus(1);

        mockMvc.perform(post("/api/groups")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(group)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
    }

    @Test
    void testUpdate() throws Exception {
        TeamGroup group = new TeamGroup();
        group.setId(1L);
        group.setGroupName("机务一组(更新)");

        mockMvc.perform(put("/api/groups")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(group)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
    }

    @Test
    void testDelete() throws Exception {
        mockMvc.perform(delete("/api/groups/2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));
    }
}
