package com.qyf.hangyi.dashboard.controller;

import com.qyf.hangyi.common.result.R;
import com.qyf.hangyi.dashboard.client.EmployeeFeignClient;
import com.qyf.hangyi.dashboard.client.FlightFeignClient;
import com.qyf.hangyi.dashboard.client.LeaveFeignClient;
import com.qyf.hangyi.dashboard.client.ScheduleFeignClient;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Map;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(DashboardController.class)
@AutoConfigureMockMvc(addFilters = false)
class DashboardControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private EmployeeFeignClient employeeFeignClient;

    @MockBean
    private ScheduleFeignClient scheduleFeignClient;

    @MockBean
    private FlightFeignClient flightFeignClient;

    @MockBean
    private LeaveFeignClient leaveFeignClient;

    @Test
    void testStats() throws Exception {
        when(employeeFeignClient.getStats()).thenReturn(R.ok(Map.of("activeEmployees", 80)));
        when(employeeFeignClient.getCount()).thenReturn(R.ok(100L));
        when(scheduleFeignClient.getTodayStats()).thenReturn(R.ok(Map.of("todayOnDuty", 30)));
        when(scheduleFeignClient.getCount()).thenReturn(R.ok(5L));
        when(flightFeignClient.getTodayStats()).thenReturn(R.ok(Map.of("todayFlights", 45)));
        when(leaveFeignClient.getPendingStats()).thenReturn(R.ok(Map.of("pendingLeaveCount", 8)));

        mockMvc.perform(get("/api/dashboard/stats"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.activeEmployees").value(80))
                .andExpect(jsonPath("$.data.totalEmployees").value(100))
                .andExpect(jsonPath("$.data.todayOnDuty").value(30))
                .andExpect(jsonPath("$.data.scheduleCount").value(5))
                .andExpect(jsonPath("$.data.todayFlights").value(45))
                .andExpect(jsonPath("$.data.pendingLeaveCount").value(8));
    }

    @Test
    void testStats_WithAllServicesDown() throws Exception {
        when(employeeFeignClient.getStats()).thenThrow(new RuntimeException("Down"));
        when(employeeFeignClient.getCount()).thenThrow(new RuntimeException("Down"));
        when(scheduleFeignClient.getTodayStats()).thenThrow(new RuntimeException("Down"));
        when(scheduleFeignClient.getCount()).thenThrow(new RuntimeException("Down"));
        when(flightFeignClient.getTodayStats()).thenThrow(new RuntimeException("Down"));
        when(leaveFeignClient.getPendingStats()).thenThrow(new RuntimeException("Down"));

        mockMvc.perform(get("/api/dashboard/stats"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.totalEmployees").value(0))
                .andExpect(jsonPath("$.data.activeEmployees").value(0))
                .andExpect(jsonPath("$.data.todayOnDuty").value(0))
                .andExpect(jsonPath("$.data.scheduleCount").value(0))
                .andExpect(jsonPath("$.data.todayFlights").value(0))
                .andExpect(jsonPath("$.data.pendingLeaveCount").value(0));
    }
}
