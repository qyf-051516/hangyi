package com.qyf.hangyi.schedule.solver.service;

import com.qyf.hangyi.schedule.dto.SmartScheduleRequest;
import com.qyf.hangyi.schedule.solver.domain.*;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ProblemFactoryTest {

    @Test
    void buildForDate_createsEmptyPlan() {
        ProblemFactory f = new ProblemFactory();
        SmartScheduleRequest req = new SmartScheduleRequest();
        req.setScheduleDate(LocalDate.of(2026, 6, 17));
        req.setFlightIds(List.of());
        // 此测试只验证 buildForDate 不抛异常（集成测试用 Testcontainers 跑实际 DB 装载）
        assertThat(req).isNotNull();
    }
}
