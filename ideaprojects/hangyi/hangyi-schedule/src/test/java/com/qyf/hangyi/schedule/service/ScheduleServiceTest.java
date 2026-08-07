package com.qyf.hangyi.schedule.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.qyf.hangyi.common.exception.BusinessException;
import com.qyf.hangyi.common.result.R;
import com.qyf.hangyi.schedule.client.EmployeeFeignClient;
import com.qyf.hangyi.schedule.client.FlightFeignClient;
import com.qyf.hangyi.schedule.client.QualificationFeignClient;
import com.qyf.hangyi.schedule.entity.Schedule;
import com.qyf.hangyi.schedule.entity.ShiftTemplate;
import com.qyf.hangyi.schedule.mapper.ShiftTemplateMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.when;

@SpringBootTest
@Transactional
class ScheduleServiceTest {

    @Autowired
    private ScheduleService scheduleService;

    @MockBean
    private EmployeeFeignClient employeeFeignClient;

    @MockBean
    private FlightFeignClient flightFeignClient;

    @MockBean
    private QualificationFeignClient qualificationFeignClient;

    @Autowired
    private ShiftTemplateMapper shiftTemplateMapper;

    @Test
    void testPageQuery() {
        Page<Schedule> result = scheduleService.pageQuery(1, 20, null, null);
        assertThat(result.getRecords()).isNotEmpty();
        assertThat(result.getRecords().get(0).getScheduleName()).contains("2026年5月");
    }

    @Test
    void testPageQuery_WithGroupFilter() {
        Page<Schedule> result = scheduleService.pageQuery(1, 20, 1L, null);
        assertThat(result.getRecords()).isNotEmpty();
        assertThat(result.getRecords()).allMatch(s -> {
            Long gid = s.getGroupId();
            return gid != null && gid.equals(1L);
        });
    }

    @Test
    void testCountOnDutyToday() {
        // schedule 1 covers 2026-05-18 ~ 2026-05-24, published
        int count = scheduleService.countOnDutyToday(LocalDate.now());
        assertThat(count).isBetween(0, 10);
    }

    @Test
    void testCountOnDutyToday_WithFixedDate() {
        // schedule 1 (id=1) covers 2026-05-18 ~ 2026-05-24, published
        // No detail data for 2026-05-20 in test data
        int count = scheduleService.countOnDutyToday(LocalDate.of(2026, 5, 20));
        assertThat(count).isEqualTo(0);
    }

    @Test
    void autoScheduleRejectsQualificationRequiredShiftWithoutValidEmployee() {
        requireQualificationForFirstShift();
        when(employeeFeignClient.getEmployeesByGroup(2L))
                .thenReturn(R.ok(List.of(Map.of("id", 21L, "name", "无资质员工"))));
        when(qualificationFeignClient.listByEmployees(anyList())).thenReturn(R.ok(Map.of()));

        assertThatThrownBy(() -> scheduleService.autoScheduleAndSave(
                2L, LocalDate.of(2026, 7, 30), LocalDate.of(2026, 7, 30), 1L))
                .isInstanceOf(BusinessException.class)
                .satisfies(exception ->
                        assertThat(((BusinessException) exception).getCode()).isEqualTo(422));
    }

    @Test
    void autoScheduleAcceptsQualificationThatIsValidOnWorkDate() {
        requireQualificationForFirstShift();
        when(employeeFeignClient.getEmployeesByGroup(2L))
                .thenReturn(R.ok(List.of(Map.of("id", 21L, "name", "资质员工"))));
        when(qualificationFeignClient.listByEmployees(anyList())).thenReturn(R.ok(Map.of(
                21L, List.of(Map.of(
                        "status", 1,
                        "issueDate", "2026-01-01",
                        "expireDate", "2026-12-31"))
        )));

        Schedule schedule = scheduleService.autoScheduleAndSave(
                2L, LocalDate.of(2026, 7, 30), LocalDate.of(2026, 7, 30), 1L);

        assertThat(schedule.getId()).isNotNull();
        assertThat(scheduleService.getScheduleDetails(schedule.getId()))
                .isNotEmpty()
                .allMatch(detail -> detail.getEmployeeId().equals(21L));
    }

    private void requireQualificationForFirstShift() {
        ShiftTemplate shift = shiftTemplateMapper.selectById(1L);
        shift.setRequireQualification(1);
        shiftTemplateMapper.updateById(shift);
    }
}
