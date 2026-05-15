package com.qyf.hangyi.schedule.solver.constraint;

import ai.timefold.solver.core.api.score.buildin.hardsoft.HardSoftScore;
import ai.timefold.solver.core.api.score.stream.Constraint;
import ai.timefold.solver.core.api.score.stream.ConstraintCollectors;
import ai.timefold.solver.core.api.score.stream.ConstraintFactory;
import ai.timefold.solver.core.api.score.stream.ConstraintProvider;
import ai.timefold.solver.core.api.score.stream.Joiners;
import com.qyf.hangyi.schedule.solver.domain.ShiftAssignment;

/**
 * 机务/地勤排班约束规则
 *
 * ====== 硬约束（必须满足）======
 * 1. 不能连续两个夜班
 * 2. 夜班后不能接早班（休息不足8小时）
 * 3. 每人每周至少休息2天
 * 4. 每人每周总工时不超过上限（默认40小时）
 *
 * ====== 软约束（尽量满足）======
 * 5. 周末班次尽量均分
 * 6. 班组内总工时尽量均衡
 * 7. 尽量安排连续相同班次
 */
public class ScheduleConstraintProvider implements ConstraintProvider {

    @Override
    public Constraint[] defineConstraints(ConstraintFactory factory) {
        return new Constraint[]{
                // 硬约束
                noConsecutiveNightShifts(factory),
                noNightToMorning(factory),
                minRestDaysPerWeek(factory),
                maxRestDaysPerWeek(factory),
                maxWeeklyHours(factory),
                // 软约束
                balanceWeekendShifts(factory),
                balanceTotalHours(factory),
                preferSameShiftType(factory),
        };
    }

    // =============================================
    // 硬约束
    // =============================================

    /**
     * 硬约束1：不能连续两个夜班
     */
    private Constraint noConsecutiveNightShifts(ConstraintFactory factory) {
        return factory.forEach(ShiftAssignment.class)
                .filter(ShiftAssignment::isNightShift)
                .join(ShiftAssignment.class,
                        Joiners.equal(ShiftAssignment::getEmployee, ShiftAssignment::getEmployee),
                        Joiners.equal(a -> a.getWorkDate().plusDays(1),
                                b -> b.getWorkDate()))
                .filter((a, b) -> b.isNightShift())
                .penalize(HardSoftScore.ofHard(1))
                .asConstraint("No consecutive night shifts");
    }

    /**
     * 硬约束2：夜班（00:00-08:00）后不能接早班（08:00-16:00）
     */
    private Constraint noNightToMorning(ConstraintFactory factory) {
        return factory.forEach(ShiftAssignment.class)
                .filter(ShiftAssignment::isNightShift)
                .join(ShiftAssignment.class,
                        Joiners.equal(ShiftAssignment::getEmployee, ShiftAssignment::getEmployee),
                        Joiners.equal(a -> a.getWorkDate().plusDays(1),
                                b -> b.getWorkDate()))
                .filter((night, next) -> next.getShift() != null
                        && "MORNING".equals(next.getShift().getShiftCode()))
                .penalize(HardSoftScore.ofHard(1))
                .asConstraint("No night to morning shift");
    }

    /**
     * 硬约束3：每人每周至少休息2天
     * 按自然周统计（通过周序号分组）
     */
    private Constraint minRestDaysPerWeek(ConstraintFactory factory) {
        return factory.forEach(ShiftAssignment.class)
                .filter(ShiftAssignment::isRest)
                .groupBy(ShiftAssignment::getEmployee,
                        ShiftAssignment::getWeekOfYear,
                        ConstraintCollectors.count())
                .filter((employee, week, restDays) -> restDays < 2)
                .penalize(HardSoftScore.ofHard(1),
                        (employee, week, restDays) -> 2 - restDays)
                .asConstraint("At least 2 rest days per week");
    }

    /**
     * 硬约束4：每人每周休息不超过2天（必须工作至少5天）
     * 与硬约束3配合形成精确的"工作5天+休息2天"节奏
     */
    private Constraint maxRestDaysPerWeek(ConstraintFactory factory) {
        return factory.forEach(ShiftAssignment.class)
                .filter(ShiftAssignment::isRest)
                .groupBy(ShiftAssignment::getEmployee,
                        ShiftAssignment::getWeekOfYear,
                        ConstraintCollectors.count())
                .filter((employee, week, restDays) -> restDays > 2)
                .penalize(HardSoftScore.ofHard(1),
                        (employee, week, restDays) -> restDays - 2)
                .asConstraint("At most 2 rest days per week");
    }

    /**
     * 硬约束5：每人每周总工时不超过上限
     * 按周汇总每个员工的工作时长，超过上限则惩罚
     */
    private Constraint maxWeeklyHours(ConstraintFactory factory) {
        return factory.forEach(ShiftAssignment.class)
                .filter(a -> !a.isRest())
                .groupBy(ShiftAssignment::getEmployee,
                        ShiftAssignment::getWeekOfYear,
                        ConstraintCollectors.sumLong(ShiftAssignment::getShiftDurationHours))
                .filter((employee, week, totalHours) ->
                        totalHours > employee.getMaxHoursPerWeek().longValue())
                .penalize(HardSoftScore.ofHard(1),
                        (employee, week, totalHours) ->
                                (int) (totalHours - employee.getMaxHoursPerWeek().longValue()))
                .asConstraint("Max weekly hours");
    }

    // =============================================
    // 软约束
    // =============================================

    /**
     * 软约束5：周末排班均衡 —— 每个员工周末班次数量差异尽量小
     */
    private Constraint balanceWeekendShifts(ConstraintFactory factory) {
        return factory.forEach(ShiftAssignment.class)
                .filter(a -> !a.isRest())
                .filter(ShiftAssignment::isWeekend)
                .groupBy(ShiftAssignment::getEmployee,
                        ConstraintCollectors.count())
                .penalize(HardSoftScore.ofSoft(1),
                        (employee, count) -> count * count)
                .asConstraint("Balance weekend shifts");
    }

    /**
     * 软约束6：班组内总工时尽量均衡
     * 对总工时较高的员工施加平方惩罚，以减少差异
     */
    private Constraint balanceTotalHours(ConstraintFactory factory) {
        return factory.forEach(ShiftAssignment.class)
                .filter(a -> !a.isRest())
                .groupBy(ShiftAssignment::getEmployee,
                        ConstraintCollectors.sumLong(ShiftAssignment::getShiftDurationHours))
                .penalize(HardSoftScore.ofSoft(1),
                        (employee, totalHours) -> (int) (totalHours * totalHours / 10))
                .asConstraint("Balance total hours");
    }

    /**
     * 软约束7：尽量安排连续相同班次（减少切换成本）
     * 相邻两天安排不同班次类型则轻微惩罚
     */
    private Constraint preferSameShiftType(ConstraintFactory factory) {
        return factory.forEach(ShiftAssignment.class)
                .filter(a -> !a.isRest())
                .join(ShiftAssignment.class,
                        Joiners.equal(ShiftAssignment::getEmployee, ShiftAssignment::getEmployee),
                        Joiners.equal(a -> a.getWorkDate().plusDays(1),
                                b -> b.getWorkDate()))
                .filter((a, b) -> !a.isRest() && !b.isRest()
                        && !a.getShift().getShiftType().equals(b.getShift().getShiftType()))
                .penalize(HardSoftScore.ofSoft(1))
                .asConstraint("Prefer same shift type");
    }
}
