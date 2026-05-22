package com.qyf.hangyi.schedule.solver.constraint;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ScheduleConstraintProviderTest {

    @Test
    void provider_shouldBeInstantiable() {
        ScheduleConstraintProvider provider = new ScheduleConstraintProvider();
        assertThat(provider).isNotNull();
    }
}
