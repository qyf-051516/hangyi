package com.qyf.hangyi.core.statistics.service.impl;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class StatisticsServiceImplTest {

    private JdbcTemplate jdbc;
    private StatisticsServiceImpl service;

    @BeforeEach
    void setUp() {
        jdbc = mock(JdbcTemplate.class);
        service = new StatisticsServiceImpl();
        ReflectionTestUtils.setField(service, "jdbc", jdbc);
    }

    @Test
    void pendingEmployeesMasksPhoneWithoutDatabaseFunction() {
        Map<String, Object> employee = new HashMap<>();
        employee.put("phone", "13812345678");
        List<Map<String, Object>> rows = new ArrayList<>();
        rows.add(employee);
        when(jdbc.queryForList(anyString(), any(Object[].class))).thenReturn(rows);

        List<Map<String, Object>> result = service.getPendingEmployees(null, null, null);

        assertThat(result).singleElement()
                .extracting(row -> row.get("phone"))
                .isEqualTo("138****5678");
    }

    @Test
    void statusOverviewReturnsZeroSummaryWhenNoSchedulesExist() {
        when(jdbc.queryForList(anyString(), any(Object[].class))).thenReturn(List.of());

        Map<String, Object> result = service.getStatusOverview(null, null, null);

        assertThat(result)
                .containsEntry("total", 0L)
                .containsEntry("completed", 0L)
                .containsEntry("pending", 0L)
                .containsEntry("completedRate", "0.0")
                .containsEntry("dailyBreakdown", List.of());
    }
}
