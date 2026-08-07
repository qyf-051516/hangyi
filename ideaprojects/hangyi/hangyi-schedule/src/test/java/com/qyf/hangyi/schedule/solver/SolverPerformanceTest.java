package com.qyf.hangyi.schedule.solver;

import com.qyf.hangyi.schedule.solver.constraint.ScheduleConstraintProvider;
import com.qyf.hangyi.schedule.solver.domain.*;
import org.junit.jupiter.api.Test;
import org.optaplanner.core.api.solver.Solver;
import org.optaplanner.core.api.solver.SolverFactory;
import org.optaplanner.core.config.solver.SolverConfig;

import java.time.Duration;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class SolverPerformanceTest {

    private static final SolverFactory<SchedulePlan> FACTORY = SolverFactory.<SchedulePlan>create(
            new SolverConfig()
                    .withSolutionClass(SchedulePlan.class)
                    .withEntityClasses(ShiftAssignment.class)
                    .withConstraintProviderClass(ScheduleConstraintProvider.class)
                    .withTerminationSpentLimit(Duration.ofMillis(100)));

    static {
        // Warm up: force Drools constraint stream compilation once at class load.
        // Without this, the first measured solve pays ~1-2s of one-time setup
        // (constraint stream indexing, JIT) which dwarfs the actual solver time.
        FACTORY.buildSolver().solve(buildPlanStatic(2, 3));
    }

    private Solver<SchedulePlan> buildSolver(Duration limit) {
        SolverConfig config = new SolverConfig()
                .withSolutionClass(SchedulePlan.class)
                .withEntityClasses(ShiftAssignment.class)
                .withConstraintProviderClass(ScheduleConstraintProvider.class)
                .withTerminationSpentLimit(limit);
        return SolverFactory.<SchedulePlan>create(config).buildSolver();
    }

    @Test
    void smallScenario_5flights_10staff_under_500ms() {
        SchedulePlan plan = buildPlan(5, 10);
        long start = System.currentTimeMillis();
        SchedulePlan solved = buildSolver(Duration.ofMillis(300)).solve(plan);
        long elapsed = System.currentTimeMillis() - start;
        assertThat(solved.getScore().hardScore()).isEqualTo(0);
        System.out.printf("[perf] 5x10 solved in %d ms%n", elapsed);
        assertThat(elapsed).isLessThan(500);
    }

    @Test
    void typicalDay_30flights_20staff_under_2s() {
        SchedulePlan plan = buildPlan(30, 20);
        long start = System.currentTimeMillis();
        SchedulePlan solved = buildSolver(Duration.ofMillis(1500)).solve(plan);
        long elapsed = System.currentTimeMillis() - start;
        System.out.printf("[perf] 30x20 solved in %d ms (hard=%d, soft=%d)%n",
                elapsed, solved.getScore().hardScore(), solved.getScore().softScore());
        assertThat(elapsed).isLessThan(2000);
    }

    // ─── TODO 4 新增：退化场景 ───

    /**
     * 退化场景 1：资质退化。
     *
     * <p>50 员工中 30 个缺失资质（aircraftTypeNames 为 null 或不含 B737），
     * 50 个 B737 航班。求解器应能处理：只把 20 个有资质员工尝试匹配 50 航班，
     * 大量航班将无人可指派（assignedEmployee = null），hardScore 因 R1 违例 < 0。
     * <p>验证：求解在合理时间内返回，score 非空。
     */
    @Test
    void degraded_qualificationMissing_50staff30missing_50flights_under_5s() {
        SchedulePlan plan = buildPlanWithMissingLicenses(50, 30, 50);
        long start = System.currentTimeMillis();
        SchedulePlan solved = buildSolver(Duration.ofSeconds(4)).solve(plan);
        long elapsed = System.currentTimeMillis() - start;
        System.out.printf("[perf-degraded-qual] 50x30missing solved in %d ms (hard=%d, soft=%d)%n",
                elapsed, solved.getScore().hardScore(), solved.getScore().softScore());
        assertThat(solved.getScore()).isNotNull();
        assertThat(elapsed).isLessThan(5000);
        // 期望：hardScore < 0 因为大量航班无 B737 资质员工
        assertThat(solved.getScore().hardScore()).isLessThan(0);
    }

    /**
     * 退化场景 2：夜班集中退化。
     *
     * <p>10 员工 50 个 NIGHT 班。10 人最多每 7 天 3 夜班（C-b），
     * 50 班全部 NIGHT → 大量 C-b 违例。但求解器应能处理（不崩溃、在合理时间内返回）。
     */
    @Test
    void degraded_nightConcentration_10staff_50nightFlights_under_5s() {
        SchedulePlan plan = buildPlanAllNight(10, 50);
        long start = System.currentTimeMillis();
        SchedulePlan solved = buildSolver(Duration.ofSeconds(4)).solve(plan);
        long elapsed = System.currentTimeMillis() - start;
        System.out.printf("[perf-degraded-night] 10x50night solved in %d ms (hard=%d, soft=%d)%n",
                elapsed, solved.getScore().hardScore(), solved.getScore().softScore());
        assertThat(solved.getScore()).isNotNull();
        assertThat(elapsed).isLessThan(5000);
        // 期望：hardScore < 0 因为 10 员工无法分散 50 NIGHT 班（每人最多 3）
        assertThat(solved.getScore().hardScore()).isLessThan(0);
    }

    /**
     * 退化场景 3：月工时退化。
     *
     * <p>5 员工 200 个 MORNING 班。R4 限制每人 ≤ 22 班次（176h），
     * 5 人最多 110 班次，200 班必大量 R4 违例。
     * 验证：求解器在合理时间内返回（不因约束搜索空间爆炸卡死）。
     */
    @Test
    void degraded_monthlyHours_5staff_200morningFlights_under_10s() {
        SchedulePlan plan = buildPlanAllMorning(5, 200);
        long start = System.currentTimeMillis();
        SchedulePlan solved = buildSolver(Duration.ofSeconds(8)).solve(plan);
        long elapsed = System.currentTimeMillis() - start;
        System.out.printf("[perf-degraded-monthly] 5x200morning solved in %d ms (hard=%d, soft=%d)%n",
                elapsed, solved.getScore().hardScore(), solved.getScore().softScore());
        assertThat(solved.getScore()).isNotNull();
        assertThat(elapsed).isLessThan(10000);
        // 期望：hardScore < 0 因为 5 人最多 110 班次，无法分配 200 班
        assertThat(solved.getScore().hardScore()).isLessThan(0);
    }

    // ─── helper ───

    private SchedulePlan buildPlan(int flights, int staff) {
        return buildPlanStatic(flights, staff);
    }

    /**
     * 资质退化 plan：{@code qualifiedCount} 员工有 B737 资质，{@code totalStaff - qualifiedCount} 无。
     */
    private SchedulePlan buildPlanWithMissingLicenses(int totalStaff, int missingCount, int flights) {
        LocalDate today = LocalDate.of(2026, 6, 17);
        List<Employee> emps = new ArrayList<>();
        for (int i = 0; i < totalStaff; i++) {
            Employee e = new Employee();
            e.setId((long) (i + 1));
            if (i < missingCount) {
                // 缺资质：aircraftTypeNames = null
                e.setAircraftTypeNames(null);
            } else {
                e.setAircraftTypeNames(List.of("B737"));
            }
            e.setName("Staff" + i);
            emps.add(e);
        }
        List<Flight> fls = new ArrayList<>();
        List<ShiftAssignment> asgns = new ArrayList<>();
        for (int i = 0; i < flights; i++) {
            Flight f = new Flight();
            f.setId((long) (i + 1));
            f.setAircraftTypeName("B737");
            f.setDerivedShiftCode("MORNING");
            fls.add(f);
            asgns.add(new ShiftAssignment(f.getId(), f.getDerivedShiftCode()));
        }
        SchedulePlan plan = new SchedulePlan();
        plan.setScheduleDate(today);
        plan.setEmployeeList(emps);
        plan.setFlightList(fls);
        plan.setShiftList(List.of());
        plan.setPrevShiftAssignmentList(List.of());
        plan.setAssignmentList(asgns);
        return plan;
    }

    /** 夜班集中 plan：所有航班 NIGHT。 */
    private SchedulePlan buildPlanAllNight(int staff, int flights) {
        return buildPlanWithShift(staff, flights, "NIGHT");
    }

    /** 月工时退化 plan：所有航班 MORNING。 */
    private SchedulePlan buildPlanAllMorning(int staff, int flights) {
        return buildPlanWithShift(staff, flights, "MORNING");
    }

    private SchedulePlan buildPlanWithShift(int staff, int flights, String shiftCode) {
        LocalDate today = LocalDate.of(2026, 6, 17);
        List<Employee> emps = new ArrayList<>();
        for (int i = 0; i < staff; i++) {
            Employee e = new Employee();
            e.setId((long) (i + 1));
            e.setAircraftTypeNames(List.of("B737"));
            e.setName("Staff" + i);
            emps.add(e);
        }
        List<Flight> fls = new ArrayList<>();
        List<ShiftAssignment> asgns = new ArrayList<>();
        for (int i = 0; i < flights; i++) {
            Flight f = new Flight();
            f.setId((long) (i + 1));
            f.setAircraftTypeName("B737");
            f.setDerivedShiftCode(shiftCode);
            fls.add(f);
            asgns.add(new ShiftAssignment(f.getId(), shiftCode));
        }
        SchedulePlan plan = new SchedulePlan();
        plan.setScheduleDate(today);
        plan.setEmployeeList(emps);
        plan.setFlightList(fls);
        plan.setShiftList(List.of());
        plan.setPrevShiftAssignmentList(List.of());
        plan.setAssignmentList(asgns);
        return plan;
    }

    private static SchedulePlan buildPlanStatic(int flights, int staff) {
        LocalDate today = LocalDate.of(2026, 6, 17);
        List<Employee> emps = new ArrayList<>();
        for (int i = 0; i < staff; i++) {
            Employee e = new Employee();
            e.setId((long) (i + 1));
            e.setAircraftTypeNames(List.of("B737"));
            e.setName("Staff" + i);
            emps.add(e);
        }
        List<Flight> fls = new ArrayList<>();
        List<ShiftAssignment> asgns = new ArrayList<>();
        String[] shifts = {"MORNING", "EVENING", "NIGHT"};
        for (int i = 0; i < flights; i++) {
            Flight f = new Flight();
            f.setId((long) (i + 1));
            f.setAircraftTypeName("B737");
            f.setDerivedShiftCode(shifts[i % 3]);
            fls.add(f);
            asgns.add(new ShiftAssignment(f.getId(), f.getDerivedShiftCode()));
        }
        SchedulePlan plan = new SchedulePlan();
        plan.setScheduleDate(today);
        plan.setEmployeeList(emps);
        plan.setFlightList(fls);
        plan.setShiftList(List.of());
        plan.setPrevShiftAssignmentList(List.of());
        plan.setAssignmentList(asgns);
        return plan;
    }
}
