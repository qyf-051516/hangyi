package com.qyf.hangyi.schedule.solver.domain;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Objects;
import org.optaplanner.core.api.domain.entity.PlanningEntity;
import org.optaplanner.core.api.domain.lookup.PlanningId;
import org.optaplanner.core.api.domain.variable.PlanningVariable;

@PlanningEntity
public class ShiftAssignment {
    /**
     * 唯一 ID —— {@code flightId} 不唯一（同航班可被多人指派），必须用独立
     * {@code id} 作为 {@link PlanningId}，否则 OptaPlanner 多线程求解因 equals
     * 冲突抛 {@code IllegalStateException}。
     *
     * <p>由 {@code ProblemFactory.buildForDate} 构造时分配（递增 counter 或
     * {@code System.nanoTime()} 或 DB 预生成）。
     */
    @PlanningId
    private Long id;

    /** 关联航班 ID（业务字段，非 PlanningId）。 */
    private Long flightId;
    private String requiredShiftCode;

    /**
     * 该 ShiftAssignment 的工作日期。
     *
     * <p>{@link com.qyf.hangyi.schedule.solver.domain.Flight} 仅存 {@code planTime}（LocalTime，无日期）。
     * 但 R3 跨班 gap 需要"prev.endTime"和"today.startTime"两个 LocalDateTime
     * 做 Duration.between —— 必须有日期字段才能 join prev（昨日）vs today（今日）。
     *
     * <p>装载时机：
     * <ul>
     *   <li>今天的 SA（{@code SchedulePlan.assignmentList}）：ProblemFactory 构造时
     *       按 {@code req.getScheduleDate()} 写入。</li>
     *   <li>昨日的 SA（{@code SchedulePlan.prevShiftAssignmentList}）：
     *       ProblemFactory 查 schedule_detail 时按 {@code work_date = prevDate} 写入。</li>
     * </ul>
     *
     * <p>非 PlanningVariable —— 求解期间不变。OptaPlanner 视为 embedded fact 字段。
     */
    private LocalDate shiftDate;

    /**
     * 班次开始的 LocalDateTime（R3 跨班 gap + 当前 SA 工时计算用）。
     *
     * <p>ProblemFactory 构造时按 {@code shiftDate.atTime(shift.startTime)} 写入。
     * 非 PlanningVariable —— fact 字段，求解期间不变。
     */
    private LocalDateTime shiftStart;

    /**
     * 班次结束的 LocalDateTime。仅 prev SA fact 使用（R3 跨班 gap 比较"昨日结束 vs 今晨开始"）。
     *
     * <p>ProblemFactory 查 schedule_detail 时按 {@code prev.shiftDate.atTime(shift.endTime)} 写入。
     * 对今天的 SA 该字段留 null（R3 不读今天的 endTime）。
     */
    private LocalDateTime endTime;

    /**
     * I9 / R4 重写：该 ShiftAssignment 对应班次的时长（小时）。
     * 由 {@code ProblemFactory} 构造时根据 {@code Shift.startTime/endTime} 计算
     * ({@code Duration.between(start, end).toHours()})，存到 SA 上供 R4
     * {@code groupBy + sumLong(SA::getHours)} 使用。
     *
     * <p><b>为何不在约束里 join Shift 取 Duration</b>：OptaPlanner 9.44
     * ConstraintVerifier 在多 SA + groupBy + sumLong on join 场景下行为异常
     * （groupBy 计 0）。改用预计算字段后是单 SA 的 groupBy + sumLong，
     * ConstraintVerifier 行为稳定。
     *
     * <p><b>非 PlanningVariable</b>：构造后不变的事实字段，OptaPlanner 不会
     * 把它当 planning variable。Solver 启动时等于"embedded fact"——按当前
     * SA 的 hours 算 R4，setter 仅供 ProblemFactory 使用。
     */
    private long hours;

    @PlanningVariable(valueRangeProviderRefs = "employeeList")
    private Employee assignedEmployee;   // 允许 null

    public ShiftAssignment() {}

    /**
     * @deprecated 兼容入口：{@code id = flightId} 临时占位，ProblemFactory 迁移后须改用 3/4 参数构造。
     *             新代码不应使用 —— {@code flightId} 不唯一（同航班可被多人指派），
     *             作 {@link PlanningId} 会让 OptaPlanner 多线程求解因 equals 冲突抛
     *             {@code IllegalStateException}。
     */
    @Deprecated
    public ShiftAssignment(Long flightId, String requiredShiftCode) {
        this.flightId = flightId;
        this.requiredShiftCode = requiredShiftCode;
        this.id = flightId;
    }

    /** 正确构造：id 由 ProblemFactory 分配并保证全局唯一。 */
    public ShiftAssignment(Long id, Long flightId, String requiredShiftCode) {
        this.id = id;
        this.flightId = flightId;
        this.requiredShiftCode = requiredShiftCode;
    }

    /** 正确构造：id + flightId + requiredShiftCode + hours。ProblemFactory 构造时调用，按 Shift 时长设 hours。 */
    public ShiftAssignment(Long id, Long flightId, String requiredShiftCode, long hours) {
        this.id = id;
        this.flightId = flightId;
        this.requiredShiftCode = requiredShiftCode;
        this.hours = hours;
    }

    /** 基于 {@link PlanningId} 的 equals —— OptaPlanner 多线程求解要求。 */
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof ShiftAssignment)) return false;
        ShiftAssignment other = (ShiftAssignment) o;
        return Objects.equals(id, other.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id);
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getFlightId() { return flightId; }
    public void setFlightId(Long flightId) { this.flightId = flightId; }
    public String getRequiredShiftCode() { return requiredShiftCode; }
    public void setRequiredShiftCode(String requiredShiftCode) { this.requiredShiftCode = requiredShiftCode; }
    public LocalDate getShiftDate() { return shiftDate; }
    public void setShiftDate(LocalDate shiftDate) { this.shiftDate = shiftDate; }
    public LocalDateTime getShiftStart() { return shiftStart; }
    public void setShiftStart(LocalDateTime shiftStart) { this.shiftStart = shiftStart; }
    public LocalDateTime getEndTime() { return endTime; }
    public void setEndTime(LocalDateTime endTime) { this.endTime = endTime; }
    public long getHours() { return hours; }
    public void setHours(long hours) { this.hours = hours; }
    public Employee getAssignedEmployee() { return assignedEmployee; }
    public void setAssignedEmployee(Employee assignedEmployee) { this.assignedEmployee = assignedEmployee; }
}
