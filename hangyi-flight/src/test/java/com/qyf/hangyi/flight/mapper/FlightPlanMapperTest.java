package com.qyf.hangyi.flight.mapper;

import com.qyf.hangyi.flight.entity.FlightPlan;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Transactional
class FlightPlanMapperTest {

    @Autowired
    private FlightPlanMapper flightPlanMapper;

    @Test
    void testSelectById() {
        FlightPlan plan = flightPlanMapper.selectById(1L);
        assertThat(plan).isNotNull();
        assertThat(plan.getFlightNo()).isEqualTo("CZ3288");
    }

    @Test
    void testSelectList() {
        List<FlightPlan> list = flightPlanMapper.selectList(null);
        assertThat(list).hasSize(3);
    }

    @Test
    void testSelectByFlightType() {
        List<FlightPlan> dep = flightPlanMapper.selectList(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<FlightPlan>()
                        .eq(FlightPlan::getFlightType, "DEP"));
        assertThat(dep).hasSize(2);
    }
}
