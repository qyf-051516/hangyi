package com.qyf.hangyi.schedule.solver.constraint;

import com.qyf.hangyi.schedule.solver.domain.*;
import org.optaplanner.core.api.score.buildin.hardsoftlong.HardSoftLongScore;
import org.optaplanner.core.api.score.stream.Constraint;
import org.optaplanner.core.api.score.stream.ConstraintCollectors;
import org.optaplanner.core.api.score.stream.ConstraintFactory;
import org.optaplanner.core.api.score.stream.ConstraintProvider;
import org.optaplanner.core.api.score.stream.Joiners;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Set;

@Component
public class ScheduleConstraintProvider implements ConstraintProvider {

    /** R3: 昨日 EVENING/NIGHT 结束到今 MORNING 开始的最短间隔（小时）。 */
    private static final int MIN_CROSS_SHIFT_GAP_HOURS = 8;

    /** R4: 月工时上限（小时）。 */
    private static final int MONTHLY_HOUR_CAP = 176;

    /** R4 简化：每班次按 8h 计（与原设计保持一致，后续可从 Shift.startTime/endTime 推导）。 */
    private static final int SHIFT_HOURS = 8;

    /** C-b: 近 7 天内允许的最大夜班次数（plan 内 count + 历史 recent7DayNightCount 兼容）。 */
    private static final int NIGHT_WINDOW_MAX = 3;

    @Override
    public Constraint[] defineConstraints(ConstraintFactory f) {
        return new Constraint[] {
                aircraftQualificationMatch(f),
                minCrossShiftGap(f),
                monthlyHourCap(f),
                oneAssignmentPerEmployeePerDay(f),
                releasePersonMustHoldLicense(f),
                nightShiftFrequencyLimit(f),
                employeeNotOnLeave(f),
                workloadBalance(f),
        };
    }

    /** R1: 员工 aircraftTypeNames 必须含航班 aircraftTypeName */
    public Constraint aircraftQualificationMatch(ConstraintFactory f) {
        return f.forEachIncludingNullVars(ShiftAssignment.class)
                .filter(a -> a.getAssignedEmployee() != null)
                .join(Flight.class,
                      Joiners.equal(ShiftAssignment::getFlightId, Flight::getId))
                .filter((a, fl) -> {
                    var types = a.getAssignedEmployee().getAircraftTypeNames();
                    return types == null || !types.contains(fl.getAircraftTypeName());
                })
                .penalize(HardSoftLongScore.ONE_HARD)
                .asConstraint("R1: aircraftQualificationMatch");
    }

    /**
     * R3: 昨日 EVENING/NIGHT 结束到今 MORNING 开始不足
     * {@link #MIN_CROSS_SHIFT_GAP_HOURS} 小时视为违例（硬约束）。
     *
     * <p><b>实现</b>：读 {@link Employee#getPrevShiftCode()} +
     * {@link Employee#getPrevShiftEndTime()}（精确分钟，支持跨日），join
     * {@link Shift} 取 today MORNING {@code startTime} 做
     * {@code Duration.between(prevEnd, todayStart).toHours()} 比较。
     *
     * <p>回退路径：当 {@code prevShiftEndTime} 为 null 时（老 DB 数据）用
     * {@code prevShiftEndHour} (int 小时) + 默认"昨日前一日"构造 LocalDateTime，
     * 与旧逻辑兼容。
     *
     * <p>为何不走 {@code prevShiftAssignmentList}：{@code join(ShiftAssignment)}
     * 用 planning variable 作 Joiner key 在 OptaPlanner 9.44 ConstraintStreams
     * 下不可靠（CLAUDE.md §4.0 pitfall）。改走 Employee 字段（fact）稳定。
     */
    public Constraint minCrossShiftGap(ConstraintFactory f) {
        return f.forEachIncludingNullVars(ShiftAssignment.class)
                .filter(a -> a.getAssignedEmployee() != null)
                .filter(a -> "MORNING".equals(a.getRequiredShiftCode()))
                .join(Shift.class,
                      Joiners.equal(ShiftAssignment::getRequiredShiftCode, Shift::getShiftCode))
                .filter((a, s) -> {
                    String prev = a.getAssignedEmployee().getPrevShiftCode();
                    if (prev == null) return false;
                    if (!"EVENING".equals(prev) && !"NIGHT".equals(prev)) return false;
                    long gapHours = computeGapHours(
                            a.getAssignedEmployee().getPrevShiftEndTime(),
                            a.getAssignedEmployee().getPrevShiftEndHour(),
                            s.getStartTime());
                    return gapHours >= 0 && gapHours < MIN_CROSS_SHIFT_GAP_HOURS;
                })
                .penalize(HardSoftLongScore.ONE_HARD)
                .asConstraint("R3: minCrossShiftGap(>=8h, Employee.prevShiftCode + prevShiftEndTime/prevShiftEndHour fallback)");
    }

    /**
     * I9: 计算 prev shift 结束到当前 MORNING start 的小时间隔。
     *
     * <p><b>保留以备 SmartScheduleService 等历史调用方使用</b> —— {@code Employee}
     * 字段上仍有 {@code prevShiftEndTime}/{@code prevShiftEndHour}，
     * 服务层其他逻辑（如响应展示）可能仍在读。
     *
     * <p><b>R3 主路径已不再调用</b> —— 改用 prevShiftAssignmentList + Duration。
     *
     * @return 小时间隔；morningStart 为 null 时返回 -1（不违例）
     */
    private static long computeGapHours(LocalDateTime prevEndTime, int prevEndHourFallback,
                                         LocalTime morningStart) {
        if (morningStart == null) return -1;
        if (prevEndTime != null) {
            LocalDateTime morningStartDt = prevEndTime.toLocalDate().atTime(morningStart);
            if (!morningStartDt.isAfter(prevEndTime)) {
                morningStartDt = morningStartDt.plusDays(1);
            }
            return Duration.between(prevEndTime, morningStartDt).toHours();
        }
        int endHour = prevEndHourFallback;
        int startHour = morningStart.getHour();
        int gap = (startHour - endHour + 24) % 24;
        if (gap == 0) gap = 24;
        return gap;
    }

    /** R4: 单班工时上限（小时）。 */
    private static final int MAX_MONTHLY_SHIFT_COUNT = 22;  // 22 * 8 = 176h

    /**
     * R4: 员工月工时上限（硬约束）。
     *
     * <p><b>重写说明（C5 + M2）</b>：使用预计算的 {@code ShiftAssignment.hours} 字段
     * 做 {@code groupBy + sumLong}，避免 OptaPlanner 9.44 ConstraintVerifier 在
     * 多 SA + groupBy + sumLong on join 场景下的 groupBy=0 异常。
     *
     * <p>hours 字段由 ProblemFactory 在构造 SA 时按
     * {@code Duration.between(shift.start, shift.end).toHours()} 算出，
     * 写入 fact 字段。R4 走单 SA groupBy + sumLong 路径稳定。
     */
    public Constraint monthlyHourCap(ConstraintFactory f) {
        return f.forEach(ShiftAssignment.class)
                .filter(a -> a.getAssignedEmployee() != null)
                .groupBy(ShiftAssignment::getAssignedEmployee,
                         ConstraintCollectors.sumLong(ShiftAssignment::getHours))
                // 计入 ProblemFactory 已加载的本月历史工时(审查 H2: 原约束只统计 plan 内,月累计失效)
                .filter((emp, totalHours) -> totalHours + emp.getMonthlyHours() > MONTHLY_HOUR_CAP)
                .penalizeLong(HardSoftLongScore.ONE_HARD,
                              (emp, totalHours) -> totalHours + emp.getMonthlyHours() - MONTHLY_HOUR_CAP)
                .asConstraint("R4: monthlyHourCap(sumLong hours + monthlyHours <= 176h, M2)");
    }

    /**
     * R5: 同一员工当日至多一个指派（硬约束）。forEach + join + Joiners.lessThan(id) 去重。
     */
    public Constraint oneAssignmentPerEmployeePerDay(ConstraintFactory f) {
        return f.forEach(ShiftAssignment.class)
                .filter(a -> a.getAssignedEmployee() != null)
                .join(ShiftAssignment.class,
                      Joiners.equal(ShiftAssignment::getAssignedEmployee,
                                    ShiftAssignment::getAssignedEmployee),
                      Joiners.lessThan(ShiftAssignment::getId,
                                       ShiftAssignment::getId))
                .penalize(HardSoftLongScore.ONE_HARD)
                .asConstraint("R5: oneAssignmentPerEmployeePerDay");
    }

    /**
     * C-a: 放行航班必须由持有 TA 或 TL 资质的员工执行（硬约束）。
     */
    public Constraint releasePersonMustHoldLicense(ConstraintFactory f) {
        return f.forEachIncludingNullVars(ShiftAssignment.class)
                .filter(a -> a.getAssignedEmployee() != null)
                .join(Flight.class, Joiners.equal(ShiftAssignment::getFlightId, Flight::getId))
                .filter((a, fl) -> fl.isRelease())
                .filter((a, fl) -> {
                    String lt = a.getAssignedEmployee().getLicenseType();
                    return lt == null || (!lt.equals("TA") && !lt.equals("TL"));
                })
                .penalize(HardSoftLongScore.ONE_HARD)
                .asConstraint("C-a: releasePersonMustHoldLicense(TA/TL)");
    }

    /**
     * C-b: 员工 plan 内夜班次数上限（硬约束）。
     *
     * <p><b>重写说明（C4）</b>：groupBy + count plan 内 NIGHT，不依赖 Employee.recent7DayNightCount。
     * 暂叠加该字段作为历史窗兼容值。
     */
    public Constraint nightShiftFrequencyLimit(ConstraintFactory f) {
        return f.forEach(ShiftAssignment.class)
                .filter(a -> a.getAssignedEmployee() != null)
                .filter(a -> "NIGHT".equals(a.getRequiredShiftCode()))
                .groupBy(ShiftAssignment::getAssignedEmployee, ConstraintCollectors.count())
                .filter((emp, count) -> count + emp.getRecent7DayNightCount() > NIGHT_WINDOW_MAX)
                .penalize(HardSoftLongScore.ONE_HARD, (emp, count) -> count)
                .asConstraint("C-b: nightShiftFrequencyLimit(plan + recent7Day compat)");
    }

    /**
     * I15: 请假日拒排约束（硬约束）。员工在 {@code leaveDates} 中的日期
     * 不能被指派任何 ShiftAssignment。
     *
     * <p><b>planDate 来源</b>：{@link SchedulePlan#getScheduleDateFact()}
     * 暴露为单元素 {@code @ProblemFactCollectionProperty<LocalDate>}。
     * Constraint Stream 不能直接访问 {@code @PlanningSolution} 类本身。
     *
     * <p>Null-safe：leaveDates 为 null 或不包含 scheduleDate 则通过。
     */
    public Constraint employeeNotOnLeave(ConstraintFactory f) {
        return f.forEach(ShiftAssignment.class)
                .filter(a -> a.getAssignedEmployee() != null)
                .join(LocalDate.class)
                .filter((a, date) -> {
                    Set<LocalDate> leaves = a.getAssignedEmployee().getLeaveDates();
                    if (leaves == null || leaves.isEmpty()) return false;
                    return leaves.contains(date);
                })
                .penalize(HardSoftLongScore.ONE_HARD)
                .asConstraint("I15: employeeNotOnLeave");
    }

    /**
     * S1: 工时均衡（软约束）。每个员工的指派数平方作为 soft 罚分，
     * 鼓励均匀分布（quadratic penalty → 多数人少做事比少数人多做事罚分小）。
     *
     * <p><b>I18 修复</b>：原 stub "每指派扣 1 soft" 等价于"最小化总指派数"，
     * 与 R5/R2 等硬约束"必须有人"冲突（OptaPlanner 会试图让 slot 不指派）。
     * 改为 groupBy 员工 + count + 平方罚分。
     *
     * <p><b>workaround</b>：OptaPlanner 9.44 ConstraintStreams 的
     * {@code groupBy + penalize(ONE_SOFT, BiFunction)} 期望 lambda 返回
     * int，cast 用 (int) 强转避免 long → int 报错。
     */
    public Constraint workloadBalance(ConstraintFactory f) {
        return f.forEach(ShiftAssignment.class)
                .filter(a -> a.getAssignedEmployee() != null)
                .groupBy(ShiftAssignment::getAssignedEmployee, ConstraintCollectors.count())
                .penalizeLong(HardSoftLongScore.ONE_SOFT,
                              (emp, count) -> count * count)
                .asConstraint("S1: workloadBalance(quadratic penalty, I18, M1: penalizeLong)");
    }
}
