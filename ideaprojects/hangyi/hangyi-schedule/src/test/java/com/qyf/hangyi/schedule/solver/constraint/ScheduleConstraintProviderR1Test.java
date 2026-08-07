package com.qyf.hangyi.schedule.solver.constraint;

import com.qyf.hangyi.schedule.solver.domain.*;
import org.junit.jupiter.api.Test;
import org.optaplanner.test.api.score.stream.ConstraintVerifier;
// HardSoftScore import removed: SchedulePlan now uses HardSoftLongScore (I20)

import java.time.LocalDate;
import java.util.List;

class ScheduleConstraintProviderR1Test {

    private final ConstraintVerifier<ScheduleConstraintProvider, SchedulePlan> verifier =
            ConstraintVerifier.build(new ScheduleConstraintProvider(), SchedulePlan.class, ShiftAssignment.class);

    @Test
    void aircraftQualificationMatch_qualifiedEmployee_passes() {
        Employee emp = new Employee();
        emp.setId(1L);
        emp.setAircraftTypeNames(List.of("B737"));

        Flight flight = new Flight();
        flight.setId(100L);
        flight.setAircraftTypeName("B737");

        ShiftAssignment a = new ShiftAssignment(100L, "MORNING");
        a.setAssignedEmployee(emp);

        verifier.verifyThat(ScheduleConstraintProvider::aircraftQualificationMatch)
                .given(a, flight, emp)
                .penalizesBy(0);
    }

    @Test
    void aircraftQualificationMatch_unqualifiedEmployee_penalizes() {
        Employee emp = new Employee();
        emp.setId(1L);
        emp.setAircraftTypeNames(List.of("A320"));  // 不含 B737

        Flight flight = new Flight();
        flight.setId(100L);
        flight.setAircraftTypeName("B737");

        ShiftAssignment a = new ShiftAssignment(100L, "MORNING");
        a.setAssignedEmployee(emp);

        verifier.verifyThat(ScheduleConstraintProvider::aircraftQualificationMatch)
                .given(a, flight, emp)
                .penalizesBy(1);
    }
}
