package com.qyf.hangyi.core.statistics.dashboard;

import com.qyf.hangyi.common.result.R;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class DashboardControllerTest {

    private JdbcTemplate jdbc;
    private DashboardController controller;

    @BeforeEach
    void setUp() {
        jdbc = mock(JdbcTemplate.class);
        controller = new DashboardController();
        ReflectionTestUtils.setField(controller, "jdbc", jdbc);
    }

    @Test
    void statsIncludesTodayShiftDistribution() {
        String today = LocalDate.now().toString();
        when(jdbc.queryForObject("SELECT COUNT(*) FROM employee WHERE status = 1", Long.class))
                .thenReturn(18L);
        when(jdbc.queryForObject(
                contains("COUNT(DISTINCT employee_id)"),
                eq(Long.class),
                eq(today)))
                .thenReturn(11L);
        when(jdbc.queryForObject(
                "SELECT COUNT(*) FROM flight_plan WHERE plan_date = ?",
                Long.class,
                today))
                .thenReturn(7L);
        when(jdbc.queryForObject(
                "SELECT COUNT(DISTINCT schedule_id) FROM schedule_detail",
                Long.class))
                .thenReturn(4L);
        when(jdbc.queryForObject(
                "SELECT COUNT(*) FROM leave_request WHERE status = 0",
                Long.class))
                .thenReturn(2L);
        when(jdbc.queryForList(contains("COUNT(DISTINCT sd.employee_id)"), eq(today)))
                .thenReturn(List.of(
                        Map.of("shift_name", "白班", "employee_count", 7L),
                        Map.of("shift_name", "夜班", "employee_count", 4L)));

        R<Map<String, Object>> response = controller.stats();

        assertThat(response.getCode()).isEqualTo(200);
        assertThat(response.getData())
                .containsEntry("totalEmployees", 18L)
                .containsEntry("todayOnDuty", 11L)
                .containsEntry("pendingLeaveCount", 2L);
        assertThat(response.getData().get("todayShiftCount"))
                .isEqualTo(Map.of("白班", 7L, "夜班", 4L));
    }

    @Test
    void healthTreatsAnEmptyScheduleTableAsReady() {
        when(jdbc.queryForObject("SELECT 1", Integer.class)).thenReturn(1);
        when(jdbc.queryForObject("SELECT COUNT(*) FROM schedule", Long.class)).thenReturn(0L);

        R<Map<String, Object>> response = controller.health();

        assertThat(response.getCode()).isEqualTo(200);
        assertThat(response.getData().get("scheduler"))
                .isEqualTo(Map.of("status", "UP", "display", "READY"));
    }
}
