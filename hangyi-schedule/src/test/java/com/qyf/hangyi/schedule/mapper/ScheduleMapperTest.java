package com.qyf.hangyi.schedule.mapper;

import com.qyf.hangyi.schedule.entity.Schedule;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Transactional
class ScheduleMapperTest {

    @Autowired
    private ScheduleMapper scheduleMapper;

    @Test
    void testSelectById() {
        Schedule schedule = scheduleMapper.selectById(1L);
        assertThat(schedule).isNotNull();
        assertThat(schedule.getScheduleName()).contains("2026年5月");
        assertThat(schedule.getStatus()).isEqualTo(1);
    }

    @Test
    void testCount() {
        Long count = scheduleMapper.selectCount(null);
        assertThat(count).isPositive();
    }
}
