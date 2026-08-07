package com.qyf.hangyi.schedule.solver.constraint;

import com.qyf.hangyi.schedule.solver.domain.*;
import org.junit.jupiter.api.Test;
import org.optaplanner.test.api.score.stream.ConstraintVerifier;

import java.time.LocalDate;
import java.util.List;

/**
 * C-b 约束测试：员工近 7 天夜班次数上限 {@code nightShiftFrequencyLimit(<=3)}。
 *
 * <p><b>本测试适配 commit 4（C4+C5+C6）后的 C-b 重写</b>：新 C-b 用 ConstraintStreams
 * groupBy + count plan 内 NIGHT 指派数，叠加 {@code Employee.recent7DayNightCount}
 * 历史窗兼容值。
 *
 * <p>语义：{@code (planNights + recent7DayNightCount) > 3} → 违例。
 */
class ScheduleConstraintProviderCbTest {

    private final ConstraintVerifier<ScheduleConstraintProvider, SchedulePlan> verifier =
            ConstraintVerifier.build(new ScheduleConstraintProvider(), SchedulePlan.class, ShiftAssignment.class);

    private Employee emp(int recent7DayNight) {
        Employee e = new Employee();
        e.setId(1L);
        e.setAircraftTypeNames(List.of("B737"));
        e.setRecent7DayNightCount(recent7DayNight);
        return e;
    }

    private Flight flight(long id) {
        Flight f = new Flight();
        f.setId(id);
        f.setAircraftTypeName("B737");
        return f;
    }

    private SchedulePlan planWith(List<Employee> employees, List<Flight> flights,
                                  List<Shift> shifts, List<ShiftAssignment> assignments) {
        SchedulePlan p = new SchedulePlan();
        p.setScheduleDate(LocalDate.of(2026, 6, 19));
        p.setEmployeeList(employees);
        p.setFlightList(flights);
        p.setShiftList(shifts);
        p.setAssignmentList(assignments);
        return p;
    }

    @Test
    void recent7Day3_plan1Night_total4_penalizes() {
        // 兼容路径：recent7Day=3 + planNights=1 = 4 > 3 → 1 hard
        Employee e = emp(3);
        Flight f = flight(100L);
        ShiftAssignment a = new ShiftAssignment(100L, "NIGHT");
        a.setAssignedEmployee(e);
        SchedulePlan p = planWith(List.of(e), List.of(f), List.of(), List.of(a));

        verifier.verifyThat(ScheduleConstraintProvider::nightShiftFrequencyLimit)
                .given(p, a, f, e)
                .penalizesBy(1);
    }

    @Test
    void recent7Day2_plan1Night_total3_passes() {
        // 边界：recent7Day=2 + planNights=1 = 3 不 > 3 → 通过
        Employee e = emp(2);
        Flight f = flight(100L);
        ShiftAssignment a = new ShiftAssignment(100L, "NIGHT");
        a.setAssignedEmployee(e);
        SchedulePlan p = planWith(List.of(e), List.of(f), List.of(), List.of(a));

        verifier.verifyThat(ScheduleConstraintProvider::nightShiftFrequencyLimit)
                .given(p, a, f, e)
                .penalizesBy(0);
    }

    @Test
    void recent7Day0_plan1Night_total1_passes() {
        Employee e = emp(0);
        Flight f = flight(100L);
        ShiftAssignment a = new ShiftAssignment(100L, "NIGHT");
        a.setAssignedEmployee(e);
        SchedulePlan p = planWith(List.of(e), List.of(f), List.of(), List.of(a));

        verifier.verifyThat(ScheduleConstraintProvider::nightShiftFrequencyLimit)
                .given(p, a, f, e)
                .penalizesBy(0);
    }

    @Test
    void recent7Day3_planMorning_passes() {
        // 正交：C-b 仅约束 NIGHT 班次
        Employee e = emp(3);
        Flight f = flight(100L);
        ShiftAssignment a = new ShiftAssignment(100L, "MORNING");
        a.setAssignedEmployee(e);
        SchedulePlan p = planWith(List.of(e), List.of(f), List.of(), List.of(a));

        verifier.verifyThat(ScheduleConstraintProvider::nightShiftFrequencyLimit)
                .given(p, a, f, e)
                .penalizesBy(0);
    }

    @Test
    void unassignedSlot_passes() {
        Flight f = flight(100L);
        ShiftAssignment a = new ShiftAssignment(100L, "NIGHT");
        // a.assignedEmployee 保持 null
        SchedulePlan p = planWith(List.of(), List.of(f), List.of(), List.of(a));

        verifier.verifyThat(ScheduleConstraintProvider::nightShiftFrequencyLimit)
                .given(p, a, f)
                .penalizesBy(0);
    }
}
