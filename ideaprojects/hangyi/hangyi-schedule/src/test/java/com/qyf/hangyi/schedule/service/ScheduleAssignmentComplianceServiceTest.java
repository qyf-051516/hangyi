package com.qyf.hangyi.schedule.service;

import com.qyf.hangyi.common.exception.BusinessException;
import com.qyf.hangyi.schedule.entity.ScheduleDetail;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ScheduleAssignmentComplianceServiceTest {

    private JdbcTemplate jdbc;
    private ScheduleAssignmentComplianceService service;

    @BeforeEach
    void setUp() {
        jdbc = mock(JdbcTemplate.class);
        service = new ScheduleAssignmentComplianceService(jdbc);
        when(jdbc.queryForList(startsWith("SELECT max_hours_per_day, license_type"),
                org.mockito.ArgumentMatchers.<Object[]>any()))
                .thenReturn(List.of(Map.of("max_hours_per_day", 12, "license_type", "TA")));
        when(jdbc.queryForObject(startsWith("SELECT COUNT(*) FROM leave_request"),
                eq(Integer.class), any(), any(), any())).thenReturn(0);
        when(jdbc.queryForList(startsWith("SELECT sd.id, sd.work_date"),
                org.mockito.ArgumentMatchers.<Object[]>any())).thenReturn(List.of());
    }

    @Test
    void rejectsApprovedLeaveAtWriteTime() {
        when(jdbc.queryForObject(startsWith("SELECT COUNT(*) FROM leave_request"),
                eq(Integer.class), any(), any(), any())).thenReturn(1);

        assertThatThrownBy(() -> service.validateAssignment(11L, detail(8, 0, 12, 0), null))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("请假");
    }

    @Test
    void rejectsUnqualifiedFlightAssignment() {
        ScheduleDetail detail = detail(8, 0, 12, 0);
        detail.setFlightId(71L);
        when(jdbc.queryForList(startsWith("SELECT aircraft_type_id, is_release"),
                org.mockito.ArgumentMatchers.<Object[]>any()))
                .thenReturn(List.of(Map.of("aircraft_type_id", 3L, "is_release", false)));
        when(jdbc.queryForObject(startsWith("SELECT COUNT(*) FROM employee_qualification"),
                eq(Integer.class), any(), any(), any(), any())).thenReturn(0);

        assertThatThrownBy(() -> service.validateAssignment(11L, detail, null))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("机型");
    }

    @Test
    void rejectsInsufficientRestBetweenAssignments() {
        assertThatThrownBy(() -> service.validateAssignments(
                List.of(detail(8, 0, 16, 0), detail(20, 0, 23, 0)), Set.of(), null))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("休息间隔");
    }

    @Test
    void acceptsCompliantAssignment() {
        assertThatCode(() -> service.validateAssignment(11L, detail(8, 0, 12, 0), null))
                .doesNotThrowAnyException();
    }

    private ScheduleDetail detail(int startHour, int startMinute, int endHour, int endMinute) {
        LocalDate date = LocalDate.of(2026, 8, 4);
        ScheduleDetail detail = new ScheduleDetail();
        detail.setEmployeeId(11L);
        detail.setWorkDate(date);
        detail.setTaskStart(date.atTime(startHour, startMinute));
        detail.setTaskEnd(date.atTime(endHour, endMinute));
        detail.setRecordStatus("active");
        return detail;
    }
}
