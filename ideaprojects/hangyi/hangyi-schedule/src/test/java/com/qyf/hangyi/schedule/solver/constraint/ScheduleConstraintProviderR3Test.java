package com.qyf.hangyi.schedule.solver.constraint;

import com.qyf.hangyi.schedule.solver.domain.*;
import org.junit.jupiter.api.Test;
import org.optaplanner.test.api.score.stream.ConstraintVerifier;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;

/**
 * R3 约束测试：跨班次最小间隔。员工昨日 EVENING/NIGHT 结束到今 MORNING 开始
 * 不足 8h 视为违例（硬约束）。
 *
 * <p><b>当前实现（2026-06-20 回归）</b>：R3 读 {@link Employee#getPrevShiftCode()} +
 * {@link Employee#getPrevShiftEndTime()}（fallback {@code prevShiftEndHour}）+
 * join Shift 取 today MORNING startTime 做 Duration 比较。
 *
 * <p><b>为何放弃 M2 设计的 prevShiftAssignmentList join</b>：
 * {@code join(ShiftAssignment)} 用 planning variable 作 Joiner key 在 OptaPlanner
 * 9.44 ConstraintStreams 下不可靠（CLAUDE.md §4.0 pitfall），单元测试 + E2E 都
 * 命中空 join。改走 Employee 字段（fact）稳定。
 */
class ScheduleConstraintProviderR3Test {

    private final ConstraintVerifier<ScheduleConstraintProvider, SchedulePlan> verifier =
            ConstraintVerifier.build(new ScheduleConstraintProvider(), SchedulePlan.class, ShiftAssignment.class);

    /** 兼容路径：仅设 prevShiftCode + prevEndHour（int 小时）。R3 走 fallback 分支。 */
    private Employee empWithPrevLegacy(String prevShift, int prevEndHour) {
        Employee e = new Employee();
        e.setId(1L);
        e.setAircraftTypeNames(List.of("B737"));
        e.setPrevShiftCode(prevShift);
        e.setPrevShiftEndHour(prevEndHour);
        return e;
    }

    /** 主路径：精确到分钟的 prevShiftEndTime（I9 升级）。 */
    private Employee empWithPrevMinute(String prevShift, LocalDateTime prevEndTime) {
        Employee e = new Employee();
        e.setId(1L);
        e.setAircraftTypeNames(List.of("B737"));
        e.setPrevShiftCode(prevShift);
        e.setPrevShiftEndTime(prevEndTime);
        return e;
    }

    private Flight flight100() {
        Flight fl = new Flight();
        fl.setId(100L);
        fl.setAircraftTypeName("B737");
        return fl;
    }

    /** MORNING 班次模板：8:00 - 17:00。 */
    private Shift morningShift() {
        Shift s = new Shift();
        s.setId(1L);
        s.setShiftCode("MORNING");
        s.setStartTime(LocalTime.of(8, 0));
        s.setEndTime(LocalTime.of(17, 0));
        return s;
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
    void yesterdayEveningEnd22_todayMorningStart8_gap10h_passes() {
        // 22→08 = 10h ≥ 8：通过
        Employee e = empWithPrevLegacy("EVENING", 22);
        Flight fl = flight100();
        Shift s = morningShift();
        ShiftAssignment a = new ShiftAssignment(100L, "MORNING");
        a.setAssignedEmployee(e);
        SchedulePlan p = planWith(List.of(e), List.of(fl), List.of(s), List.of(a));

        verifier.verifyThat(ScheduleConstraintProvider::minCrossShiftGap)
                .given(p, a, fl, e, s)
                .penalizesBy(0);
    }

    @Test
    void yesterdayNightEnd2_todayMorningStart8_gap6h_penalizes() {
        // 02→08 = 6h < 8：违例
        Employee e = empWithPrevLegacy("NIGHT", 2);
        Flight fl = flight100();
        Shift s = morningShift();
        ShiftAssignment a = new ShiftAssignment(100L, "MORNING");
        a.setAssignedEmployee(e);
        SchedulePlan p = planWith(List.of(e), List.of(fl), List.of(s), List.of(a));

        verifier.verifyThat(ScheduleConstraintProvider::minCrossShiftGap)
                .given(p, a, fl, e, s)
                .penalizesBy(1);
    }

    @Test
    void unassignedSlot_passes() {
        Flight fl = flight100();
        Shift s = morningShift();
        ShiftAssignment a = new ShiftAssignment(100L, "MORNING");
        SchedulePlan p = planWith(List.of(), List.of(fl), List.of(s), List.of(a));

        verifier.verifyThat(ScheduleConstraintProvider::minCrossShiftGap)
                .given(p, a, fl, s)
                .penalizesBy(0);
    }

    @Test
    void prevShiftEndHour0_edgeCase_passes() {
        // endHour=0 → startHour=8 → gap=8，不 < 8：通过
        Employee e = empWithPrevLegacy("NIGHT", 0);
        Flight fl = flight100();
        Shift s = morningShift();
        ShiftAssignment a = new ShiftAssignment(100L, "MORNING");
        a.setAssignedEmployee(e);
        SchedulePlan p = planWith(List.of(e), List.of(fl), List.of(s), List.of(a));

        verifier.verifyThat(ScheduleConstraintProvider::minCrossShiftGap)
                .given(p, a, fl, e, s)
                .penalizesBy(0);
    }

    @Test
    void yesterdayEveningEnd2200_todayMorningStart8_minutePrecision_passes() {
        // I9 主路径：LocalDateTime 精确分钟 → 22:00 → 08:00 = 10h ≥ 8：通过
        Employee e = empWithPrevMinute("EVENING", LocalDateTime.of(2026, 6, 18, 22, 0));
        Flight fl = flight100();
        Shift s = morningShift();
        ShiftAssignment a = new ShiftAssignment(100L, "MORNING");
        a.setAssignedEmployee(e);
        SchedulePlan p = planWith(List.of(e), List.of(fl), List.of(s), List.of(a));

        verifier.verifyThat(ScheduleConstraintProvider::minCrossShiftGap)
                .given(p, a, fl, e, s)
                .penalizesBy(0);
    }

    @Test
    void yesterdayNightEnd0200_todayMorningStart8_minutePrecision_penalizes() {
        // I9 主路径：02:00 → 08:00 = 6h < 8：违例
        Employee e = empWithPrevMinute("NIGHT", LocalDateTime.of(2026, 6, 18, 2, 0));
        Flight fl = flight100();
        Shift s = morningShift();
        ShiftAssignment a = new ShiftAssignment(100L, "MORNING");
        a.setAssignedEmployee(e);
        SchedulePlan p = planWith(List.of(e), List.of(fl), List.of(s), List.of(a));

        verifier.verifyThat(ScheduleConstraintProvider::minCrossShiftGap)
                .given(p, a, fl, e, s)
                .penalizesBy(1);
    }
}