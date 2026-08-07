package com.qyf.hangyi.schedule.solver.service;

import com.qyf.hangyi.schedule.solver.domain.*;
import com.qyf.hangyi.schedule.solver.solver.SolverProperties;
import org.junit.jupiter.api.Test;
import org.optaplanner.core.api.solver.Solver;
import org.optaplanner.core.api.solver.SolverFactory;
import org.optaplanner.core.config.solver.SolverConfig;

import java.time.Duration;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class OptaPlannerScheduleServiceTest {

    @Test
    void solve_singleFlight_singleQualifiedEmployee_assignsFeasibly() {
        Employee e = new Employee();
        e.setId(1L);
        e.setAircraftTypeNames(List.of("B737"));

        Flight f = new Flight();
        f.setId(100L);
        f.setAircraftTypeName("B737");
        f.setDerivedShiftCode("MORNING");

        ShiftAssignment a = new ShiftAssignment(100L, "MORNING");

        SchedulePlan plan = new SchedulePlan();
        plan.setScheduleDate(LocalDate.of(2026, 6, 17));
        plan.setEmployeeList(List.of(e));
        plan.setFlightList(List.of(f));
        plan.setShiftList(List.of());
        plan.setAssignmentList(List.of(a));

        SolverConfig config = new SolverConfig()
                .withSolutionClass(SchedulePlan.class)
                .withEntityClasses(ShiftAssignment.class)
                .withConstraintProviderClass(com.qyf.hangyi.schedule.solver.constraint.ScheduleConstraintProvider.class)
                .withTerminationSpentLimit(Duration.ofSeconds(2));
        Solver<SchedulePlan> solver = SolverFactory.<SchedulePlan>create(config).buildSolver();
        SchedulePlan solved = solver.solve(plan);

        assertThat(solved.getScore().hardScore()).isEqualTo(0);
        assertThat(solved.getAssignmentList().get(0).getAssignedEmployee()).isNotNull();
        assertThat(solved.getAssignmentList().get(0).getAssignedEmployee().getId()).isEqualTo(1L);
    }
}