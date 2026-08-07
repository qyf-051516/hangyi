package com.qyf.hangyi.schedule.service.impl;

import com.qyf.hangyi.common.exception.BusinessException;
import com.qyf.hangyi.schedule.dto.RoleScheduleRequest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;

import java.sql.Time;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SmartScheduleServiceRoleTest {

    @Mock
    private JdbcTemplate jdbc;

    @InjectMocks
    private SmartScheduleService service;

    @Test
    void roleSchedulingFailsAtomicallyWhenQualifiedHeadcountIsInsufficient() {
        RoleScheduleRequest request = new RoleScheduleRequest();
        request.setScheduleDate(LocalDate.of(2026, 7, 30));
        RoleScheduleRequest.RoleAssignment assignment = new RoleScheduleRequest.RoleAssignment();
        assignment.setFlightNo("CA1234");
        assignment.setAircraftType("B737");
        assignment.setTaskType("RELEASE");
        assignment.setRequiredCount(2);
        request.setAssignments(List.of(assignment));
        when(jdbc.queryForList(anyString(), any(Object[].class)))
                .thenReturn(List.of(Map.of(
                        "id", 71L,
                        "airline", "中国国际航空",
                        "aircraft_type_name", "B737",
                        "plan_time", Time.valueOf(LocalTime.of(8, 0)))))
                .thenReturn(List.of(Map.of(
                        "id", 11L,
                        "name", "唯一可用人员",
                        "emp_no", "HY011",
                        "license_type", "TA",
                        "workload", 0)));

        assertThatThrownBy(() -> service.smartScheduleWithRoles(request))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("可用资质人员不足")
                .satisfies(exception ->
                        assertThat(((BusinessException) exception).getCode()).isEqualTo(422));
    }
}
