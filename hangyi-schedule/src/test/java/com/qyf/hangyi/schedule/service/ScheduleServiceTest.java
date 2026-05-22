package com.qyf.hangyi.schedule.service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.qyf.hangyi.schedule.client.EmployeeFeignClient;
import com.qyf.hangyi.schedule.client.FlightFeignClient;
import com.qyf.hangyi.schedule.client.QualificationFeignClient;
import com.qyf.hangyi.schedule.entity.Schedule;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

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
}
