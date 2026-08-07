package com.qyf.hangyi.schedule.solver.constraint;

import com.qyf.hangyi.schedule.solver.domain.*;
import org.junit.jupiter.api.Test;
import org.optaplanner.test.api.score.stream.ConstraintVerifier;

import java.time.LocalDate;
import java.util.List;

/**
 * R5 约束测试：同一员工当日至多一个指派（oneAssignmentPerEmployeePerDay）。
 * 同一员工被指派到 2 个不同航班视为违例（硬约束）。
 *
 * <p>测试设计要点（沿用 R1~R4 helper 模式）：
 * <ul>
 *   <li>每个测试独立构建一个完整的 {@link SchedulePlan}（通过 {@link #planWith}），
 *       后续约束若改成 join employeeList/flightList/shiftList，本 helper 已就位。</li>
 *   <li>{@code twoAssignmentsSameEmployee_penalizes} 覆盖核心违例：同一员工 + 2 个班次。</li>
 *   <li>{@code unassignedSlot_passes} 覆盖 null-branch：当 assignedEmployee == null
 *       时约束不应触发，验证前置 null-guard filter 正确。</li>
 *   <li>{@code twoDifferentEmployees_passes} 覆盖正交场景：不同员工各自 1 个指派，
 *       应不违例（确认 Joiners.equal 严格按 employee 引用匹配）。</li>
 * </ul>
 *
 * <p>模式参考：本约束是首个使用 {@code forEachUniquePair} 的约束（R1~R4 仅迭代单条
 * ShiftAssignment）。对 N 个同员工指派生成 C(N,2) = N*(N-1)/2 个 pair，每个 pair
 * 扣 1 hard，故 2 个同员工指派 = 1 pair = 1 hard penalty（spec 写的 2 是错误的）。
 */
class ScheduleConstraintProviderR5Test {

    private final ConstraintVerifier<ScheduleConstraintProvider, SchedulePlan> verifier =
            ConstraintVerifier.build(new ScheduleConstraintProvider(), SchedulePlan.class, ShiftAssignment.class);

    private Employee employee(long id) {
        Employee e = new Employee();
        e.setId(id);
        e.setAircraftTypeNames(List.of("B737"));
        return e;
    }

    private Flight flight(long id) {
        Flight fl = new Flight();
        fl.setId(id);
        fl.setAircraftTypeName("B737");
        return fl;
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
    void twoAssignmentsSameEmployee_penalizesBy1() {
        // 同一员工被指派到 2 个不同航班：forEachUniquePair 生成 1 个 pair → 1 hard penalty。
        // （spec 写的 penalizesBy(2) 是错的：pair 数 = C(2,2) = 1，不是 2）
        Employee e = employee(1L);
        Flight f1 = flight(100L);
        Flight f2 = flight(101L);

        ShiftAssignment a1 = new ShiftAssignment(100L, "MORNING");
        a1.setAssignedEmployee(e);
        ShiftAssignment a2 = new ShiftAssignment(101L, "MORNING");
        a2.setAssignedEmployee(e);

        SchedulePlan p = planWith(List.of(e), List.of(f1, f2), List.of(), List.of(a1, a2));

        verifier.verifyThat(ScheduleConstraintProvider::oneAssignmentPerEmployeePerDay)
                .given(p, a1, a2, f1, f2, e)
                .penalizesBy(1);
    }

    @Test
    void singleAssignment_passes() {
        // 单条指派：无 pair，约束不触发
        Employee e = employee(1L);
        Flight f1 = flight(100L);

        ShiftAssignment a1 = new ShiftAssignment(100L, "MORNING");
        a1.setAssignedEmployee(e);

        SchedulePlan p = planWith(List.of(e), List.of(f1), List.of(), List.of(a1));

        verifier.verifyThat(ScheduleConstraintProvider::oneAssignmentPerEmployeePerDay)
                .given(p, a1, f1, e)
                .penalizesBy(0);
    }

    @Test
    void twoDifferentEmployees_passes() {
        // 不同员工各自 1 个指派：Joiners.equal 不会把不同 employee 配对，应通过
        Employee e1 = employee(1L);
        Employee e2 = employee(2L);
        Flight f1 = flight(100L);
        Flight f2 = flight(101L);

        ShiftAssignment a1 = new ShiftAssignment(100L, "MORNING");
        a1.setAssignedEmployee(e1);
        ShiftAssignment a2 = new ShiftAssignment(101L, "MORNING");
        a2.setAssignedEmployee(e2);

        SchedulePlan p = planWith(List.of(e1, e2), List.of(f1, f2), List.of(), List.of(a1, a2));

        verifier.verifyThat(ScheduleConstraintProvider::oneAssignmentPerEmployeePerDay)
                .given(p, a1, a2, f1, f2, e1, e2)
                .penalizesBy(0);
    }

    @Test
    void unassignedSlot_passes() {
        // null-branch：当 assignedEmployee == null 时，约束不应触发
        // （前置 filter 已把 null 排除掉，这里验证 forEachUniquePair + filter 不会 NPE）
        Flight f1 = flight(100L);
        ShiftAssignment a1 = new ShiftAssignment(100L, "MORNING");
        // a1.assignedEmployee 保持 null

        SchedulePlan p = planWith(List.of(), List.of(f1), List.of(), List.of(a1));

        verifier.verifyThat(ScheduleConstraintProvider::oneAssignmentPerEmployeePerDay)
                .given(p, a1, f1)
                .penalizesBy(0);
    }
}