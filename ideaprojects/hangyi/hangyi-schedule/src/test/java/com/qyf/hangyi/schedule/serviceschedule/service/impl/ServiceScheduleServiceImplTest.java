package com.qyf.hangyi.schedule.serviceschedule.service.impl;

import com.qyf.hangyi.common.exception.BusinessException;
import com.qyf.hangyi.schedule.entity.Schedule;
import com.qyf.hangyi.schedule.entity.ScheduleDetail;
import com.qyf.hangyi.schedule.mapper.ScheduleDetailMapper;
import com.qyf.hangyi.schedule.mapper.ScheduleMapper;
import com.qyf.hangyi.schedule.service.ScheduleAssignmentComplianceService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ServiceScheduleServiceImplTest {

    @Mock
    private JdbcTemplate jdbc;

    @Mock
    private ScheduleDetailMapper detailMapper;

    @Mock
    private ScheduleMapper scheduleMapper;

    @Mock
    private ScheduleAssignmentComplianceService complianceService;

    @InjectMocks
    private ServiceScheduleServiceImpl service;

    @Test
    void getServiceScheduleTableJoinsFlightAndAircraftData() {
        when(jdbc.queryForList(anyString(), (Object) any()))
                .thenReturn(List.of(
                        Map.ofEntries(
                                Map.entry("flight_id", 71L),
                                Map.entry("flight_no", "CA1234"),
                                Map.entry("airline", "中国国际航空"),
                                Map.entry("aircraft_type", "波音 737-800"),
                                Map.entry("task_type", "RELEASE"),
                                Map.entry("task_start", LocalDateTime.of(2026, 7, 29, 8, 0)),
                                Map.entry("task_end", LocalDateTime.of(2026, 7, 29, 9, 0)),
                                Map.entry("employee_id", 11L),
                                Map.entry("staff_name", "陈航"),
                                Map.entry("staff_employee_no", "HY011")
                        ),
                        Map.ofEntries(
                                Map.entry("flight_id", 71L),
                                Map.entry("flight_no", "CA1234"),
                                Map.entry("airline", "中国国际航空"),
                                Map.entry("aircraft_type", "波音 737-800"),
                                Map.entry("task_type", "RELEASE"),
                                Map.entry("task_start", LocalDateTime.of(2026, 7, 29, 8, 0)),
                                Map.entry("task_end", LocalDateTime.of(2026, 7, 29, 9, 0)),
                                Map.entry("employee_id", 12L),
                                Map.entry("staff_name", "林晓"),
                                Map.entry("staff_employee_no", "HY012")
                        )
                ));

        Map<String, Object> result = service.getServiceScheduleTable("2026-07-29");

        assertThat(result.get("total")).isEqualTo(1);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> tasks = (List<Map<String, Object>>) result.get("tasks");
        assertThat(tasks).singleElement().satisfies(task -> {
            assertThat(task)
                    .containsEntry("flightId", 71L)
                    .containsEntry("flightNo", "CA1234")
                    .containsEntry("airline", "中国国际航空")
                    .containsEntry("aircraftType", "波音 737-800");
            assertThat((List<?>) task.get("staff")).hasSize(2);
        });

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbc).queryForList(sql.capture(), (Object) any());
        assertThat(sql.getValue())
                .contains("LEFT JOIN flight_plan")
                .contains("LEFT JOIN aircraft_type")
                .contains("ORDER BY sd.task_start");
    }

    @Test
    void publishCreatesMasterBeforeLinkedDetails() {
        when(scheduleMapper.insert(any(Schedule.class))).thenAnswer(invocation -> {
            Schedule schedule = invocation.getArgument(0);
            schedule.setId(88L);
            return 1;
        });
        when(detailMapper.insert(any(ScheduleDetail.class))).thenReturn(1);

        Map<String, Object> result = service.publishServiceSchedule(Map.of(
                "scheduleDate", "2026-07-29",
                "assignments", List.of(Map.of(
                        "flightId", 71L,
                        "taskType", "RELEASE",
                        "taskStart", "23:30",
                        "taskEnd", "00:20",
                        "staff", List.of(
                                Map.of("staffId", 11L),
                                Map.of("staffId", "12")
                        )
                ))
        ));

        ArgumentCaptor<Schedule> scheduleCaptor = ArgumentCaptor.forClass(Schedule.class);
        verify(complianceService).validateAssignments(any(), any(), org.mockito.ArgumentMatchers.eq("SERVICE"));
        verify(scheduleMapper).insert(scheduleCaptor.capture());
        assertThat(scheduleCaptor.getValue())
                .extracting(
                        Schedule::getId,
                        Schedule::getScheduleName,
                        Schedule::getScheduleType,
                        Schedule::getStatus,
                        Schedule::getStartDate,
                        Schedule::getEndDate)
                .containsExactly(
                        88L,
                        "勤务排班 2026-07-29",
                        "SERVICE",
                        1,
                        LocalDate.of(2026, 7, 29),
                        LocalDate.of(2026, 7, 29));

        ArgumentCaptor<ScheduleDetail> detailCaptor = ArgumentCaptor.forClass(ScheduleDetail.class);
        verify(detailMapper, org.mockito.Mockito.times(2)).insert(detailCaptor.capture());
        assertThat(detailCaptor.getAllValues()).allSatisfy(detail -> {
            assertThat(detail.getScheduleId()).isEqualTo(88L);
            assertThat(detail.getFlightId()).isEqualTo(71L);
            assertThat(detail.getScheduleType()).isEqualTo("SERVICE");
            assertThat(detail.getRecordStatus()).isEqualTo("active");
            assertThat(detail.getTaskEnd()).isAfter(detail.getTaskStart());
        });
        assertThat(result)
                .containsEntry("scheduleId", 88L)
                .containsEntry("writtenCount", 2);
    }

    @Test
    void publishRejectsAssignmentsWithoutStaffBeforeArchiving() {
        Map<String, Object> payload = Map.of(
                "scheduleDate", "2026-07-29",
                "assignments", List.of(Map.of(
                        "taskType", "RELEASE",
                        "staff", List.of()
                ))
        );

        assertThatThrownBy(() -> service.publishServiceSchedule(payload))
                .isInstanceOf(BusinessException.class)
                .hasMessage("至少需要为一项勤务任务安排人员");
    }
}
