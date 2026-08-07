package com.qyf.hangyi.schedule.solver.constraint;

import com.qyf.hangyi.schedule.solver.domain.*;
import org.junit.jupiter.api.Test;
import org.optaplanner.test.api.score.stream.ConstraintVerifier;

import java.time.LocalDate;
import java.util.List;

/**
 * C-a 约束测试：放行航班（{@code flight.isRelease() == true}）必须由持有 TA 或 TL
 * 资质的员工执行，否则视为硬约束违例。
 *
 * <p>注意：每个测试独立构建一个完整的 {@link SchedulePlan}（通过 {@link #planWith}），
 * 以便后续 C-b~C-c / S1~S2 同样模式可复用，且未来约束若需要 join
 * {@code @ProblemFactCollectionProperty} 列表时不会因 facts 缺失而误判。
 */
class ScheduleConstraintProviderCaTest {

    private final ConstraintVerifier<ScheduleConstraintProvider, SchedulePlan> verifier =
            ConstraintVerifier.build(new ScheduleConstraintProvider(), SchedulePlan.class, ShiftAssignment.class);

    private Employee emp(String licenseType) {
        Employee e = new Employee();
        e.setId(1L);
        e.setAircraftTypeNames(List.of("B737"));
        e.setLicenseType(licenseType);
        return e;
    }

    private Flight releaseFlight() {
        Flight f = new Flight();
        f.setId(100L);
        f.setAircraftTypeName("B737");
        f.setRelease(true);
        return f;
    }

    /**
     * 构造一个最小可用的 {@link SchedulePlan}，把 facts 注入到 @ProblemFactCollectionProperty
     * 集合中。后续约束若改成 join employeeList/flightList/shiftList，本 helper 已就位。
     */
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
    void releaseFlight_taLicense_passes() {
        Employee e = emp("TA");
        Flight f = releaseFlight();
        ShiftAssignment a = new ShiftAssignment(100L, "MORNING");
        a.setAssignedEmployee(e);
        SchedulePlan p = planWith(List.of(e), List.of(f), List.of(), List.of(a));

        verifier.verifyThat(ScheduleConstraintProvider::releasePersonMustHoldLicense)
                .given(p, a, f, e)
                .penalizesBy(0);
    }

    @Test
    void releaseFlight_tlLicense_passes() {
        // 边界：TL 也属于放行资质的有效执照类型
        Employee e = emp("TL");
        Flight f = releaseFlight();
        ShiftAssignment a = new ShiftAssignment(100L, "MORNING");
        a.setAssignedEmployee(e);
        SchedulePlan p = planWith(List.of(e), List.of(f), List.of(), List.of(a));

        verifier.verifyThat(ScheduleConstraintProvider::releasePersonMustHoldLicense)
                .given(p, a, f, e)
                .penalizesBy(0);
    }

    @Test
    void releaseFlight_noLicense_penalizes() {
        Employee e = emp(null);
        Flight f = releaseFlight();
        ShiftAssignment a = new ShiftAssignment(100L, "MORNING");
        a.setAssignedEmployee(e);
        SchedulePlan p = planWith(List.of(e), List.of(f), List.of(), List.of(a));

        verifier.verifyThat(ScheduleConstraintProvider::releasePersonMustHoldLicense)
                .given(p, a, f, e)
                .penalizesBy(1);
    }

    @Test
    void releaseFlight_otherLicense_penalizes() {
        // 边界：TH / TI 等非放行资质应被视为违例
        Employee e = emp("TH");
        Flight f = releaseFlight();
        ShiftAssignment a = new ShiftAssignment(100L, "MORNING");
        a.setAssignedEmployee(e);
        SchedulePlan p = planWith(List.of(e), List.of(f), List.of(), List.of(a));

        verifier.verifyThat(ScheduleConstraintProvider::releasePersonMustHoldLicense)
                .given(p, a, f, e)
                .penalizesBy(1);
    }

    @Test
    void nonReleaseFlight_noLicense_passes() {
        // C-a 仅约束放行航班；非放行航班不检查执照类型
        Employee e = emp(null);
        Flight f = new Flight();
        f.setId(100L);
        f.setAircraftTypeName("B737");
        f.setRelease(false);
        ShiftAssignment a = new ShiftAssignment(100L, "MORNING");
        a.setAssignedEmployee(e);
        SchedulePlan p = planWith(List.of(e), List.of(f), List.of(), List.of(a));

        verifier.verifyThat(ScheduleConstraintProvider::releasePersonMustHoldLicense)
                .given(p, a, f, e)
                .penalizesBy(0);
    }

    @Test
    void unassignedSlot_passes() {
        // null-branch: 当 assignedEmployee == null 时，约束不应触发
        // （前置 filter 已把 null 排除掉，这里验证不误伤未指派的 slot）
        Flight f = releaseFlight();
        ShiftAssignment a = new ShiftAssignment(100L, "MORNING");
        // a.assignedEmployee 保持 null
        SchedulePlan p = planWith(List.of(), List.of(f), List.of(), List.of(a));

        verifier.verifyThat(ScheduleConstraintProvider::releasePersonMustHoldLicense)
                .given(p, a, f)
                .penalizesBy(0);
    }
}
