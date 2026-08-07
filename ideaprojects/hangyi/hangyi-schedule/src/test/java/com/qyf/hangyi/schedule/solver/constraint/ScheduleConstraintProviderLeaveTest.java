package com.qyf.hangyi.schedule.solver.constraint;

import com.qyf.hangyi.schedule.solver.domain.*;
import org.junit.jupiter.api.Test;
import org.optaplanner.test.api.score.stream.ConstraintVerifier;

import java.time.LocalDate;
import java.util.List;
import java.util.Set;

import static java.util.Collections.emptySet;

/**
 * I15 约束测试：员工请假日拒排（硬约束）。
 *
 * <p>{@link ScheduleConstraintProvider#employeeNotOnLeave} 检查
 * ShiftAssignment.assignedEmployee.leaveDates 是否包含
 * SchedulePlan.scheduleDate，包含则 penalize ONE_HARD。
 *
 * <p>planDate 来源：SchedulePlan.scheduleDate（plan 按"日"粒度求解）。
 */
class ScheduleConstraintProviderLeaveTest {

    private static final LocalDate PLAN_DATE = LocalDate.of(2026, 6, 19);

    private final ConstraintVerifier<ScheduleConstraintProvider, SchedulePlan> verifier =
            ConstraintVerifier.build(new ScheduleConstraintProvider(), SchedulePlan.class, ShiftAssignment.class);

    private Employee emp(long id, Set<LocalDate> leaves) {
        Employee e = new Employee();
        e.setId(id);
        e.setAircraftTypeNames(List.of("B737"));
        e.setLeaveDates(leaves);
        return e;
    }

    private Flight flight(long id) {
        Flight fl = new Flight();
        fl.setId(id);
        fl.setAircraftTypeName("B737");
        return fl;
    }

    private SchedulePlan planWith(LocalDate date, List<Employee> employees,
                                  List<Flight> flights, List<ShiftAssignment> assignments) {
        SchedulePlan p = new SchedulePlan();
        p.setScheduleDate(date);
        p.setEmployeeList(employees);
        p.setFlightList(flights);
        p.setShiftList(List.of());
        p.setAssignmentList(assignments);
        return p;
    }

    @Test
    void employeeOnLeave_todayAssignment_penalizes() {
        // 请假包含 planDate → 1 hard
        Employee e = emp(1L, Set.of(PLAN_DATE));
        Flight fl = flight(100L);
        ShiftAssignment a = new ShiftAssignment(100L, "MORNING");
        a.setAssignedEmployee(e);
        SchedulePlan p = planWith(PLAN_DATE, List.of(e), List.of(fl), List.of(a));

        verifier.verifyThat(ScheduleConstraintProvider::employeeNotOnLeave)
                .given(p, PLAN_DATE, a, fl, e)
                .penalizesBy(1);
    }

    @Test
    void employeeOnLeave_otherDate_passes() {
        // 请假不含 planDate → 0
        Employee e = emp(1L, Set.of(PLAN_DATE.plusDays(1)));
        Flight fl = flight(100L);
        ShiftAssignment a = new ShiftAssignment(100L, "MORNING");
        a.setAssignedEmployee(e);
        SchedulePlan p = planWith(PLAN_DATE, List.of(e), List.of(fl), List.of(a));

        verifier.verifyThat(ScheduleConstraintProvider::employeeNotOnLeave)
                .given(p, PLAN_DATE, a, fl, e)
                .penalizesBy(0);
    }

    @Test
    void employeeNoLeaveDates_passes() {
        // leaveDates=null → 0
        Employee e = emp(1L, null);
        Flight fl = flight(100L);
        ShiftAssignment a = new ShiftAssignment(100L, "MORNING");
        a.setAssignedEmployee(e);
        SchedulePlan p = planWith(PLAN_DATE, List.of(e), List.of(fl), List.of(a));

        verifier.verifyThat(ScheduleConstraintProvider::employeeNotOnLeave)
                .given(p, PLAN_DATE, a, fl, e)
                .penalizesBy(0);
    }

    @Test
    void employeeEmptyLeaveDates_passes() {
        // leaveDates=emptySet → 0
        Employee e = emp(1L, emptySet());
        Flight fl = flight(100L);
        ShiftAssignment a = new ShiftAssignment(100L, "MORNING");
        a.setAssignedEmployee(e);
        SchedulePlan p = planWith(PLAN_DATE, List.of(e), List.of(fl), List.of(a));

        verifier.verifyThat(ScheduleConstraintProvider::employeeNotOnLeave)
                .given(p, PLAN_DATE, a, fl, e)
                .penalizesBy(0);
    }

    @Test
    void unassignedSlot_passes() {
        // null employee → null guard
        Flight fl = flight(100L);
        ShiftAssignment a = new ShiftAssignment(100L, "MORNING");
        SchedulePlan p = planWith(PLAN_DATE, List.of(), List.of(fl), List.of(a));

        verifier.verifyThat(ScheduleConstraintProvider::employeeNotOnLeave)
                .given(p, PLAN_DATE, a, fl)
                .penalizesBy(0);
    }

    @Test
    void multipleLeaveDates_todayInList_penalizes() {
        // 请假多日，今天在列表里 → 1 hard
        Employee e = emp(1L, Set.of(
                PLAN_DATE.minusDays(2),
                PLAN_DATE,
                PLAN_DATE.plusDays(3)));
        Flight fl = flight(100L);
        ShiftAssignment a = new ShiftAssignment(100L, "MORNING");
        a.setAssignedEmployee(e);
        SchedulePlan p = planWith(PLAN_DATE, List.of(e), List.of(fl), List.of(a));

        verifier.verifyThat(ScheduleConstraintProvider::employeeNotOnLeave)
                .given(p, PLAN_DATE, a, fl, e)
                .penalizesBy(1);
    }
}