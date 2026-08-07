package com.qyf.hangyi.schedule.solver.domain;

import org.optaplanner.core.api.domain.solution.PlanningEntityCollectionProperty;
import org.optaplanner.core.api.domain.solution.PlanningScore;
import org.optaplanner.core.api.domain.solution.PlanningSolution;
import org.optaplanner.core.api.domain.solution.ProblemFactCollectionProperty;
import org.optaplanner.core.api.domain.valuerange.ValueRangeProvider;
import org.optaplanner.core.api.score.buildin.hardsoftlong.HardSoftLongScore;

import java.time.LocalDate;
import java.util.List;

@PlanningSolution
public class SchedulePlan {

    private LocalDate scheduleDate;
    private boolean preview;

    @ProblemFactCollectionProperty
    private List<Employee> employeeList;

    /**
     * I15: 当前 plan 的日期，作为单元素问题事实暴露给 constraint stream。
     * Constraint Stream 不能直接访问 {@code @PlanningSolution} 类本身，
     * 必须通过 {@code @ProblemFactCollectionProperty} 暴露。
     */
    @ProblemFactCollectionProperty
    public List<LocalDate> getScheduleDateFact() {
        return scheduleDate == null ? List.of() : List.of(scheduleDate);
    }

    @ProblemFactCollectionProperty
    private List<Flight> flightList;

    @ProblemFactCollectionProperty
    private List<Shift> shiftList;

    /**
     * I9 / R3 重写：昨日（{@code scheduleDate.minusDays(1)}）已落库的排班，
     * 作为 problem fact 暴露给 R3 跨班 gap 约束。
     *
     * <p>与 {@link #assignmentList} 不冲突 —— {@code assignmentList} 是
     * planning entity（求解可变），本字段是 fact（只读历史）。每个元素的
     * {@code assignedEmployee} + {@code requiredShiftCode} 用于 join today's
     * ShiftAssignment，再 join Shift 取 {@code startTime} / {@code endTime}
     * 做 {@code Duration.between(prevEnd, currStart).toHours()} 计算。
     *
     * <p>装载时机：{@code ProblemFactory.buildForDate} 末尾查询
     * {@code schedule_detail}（work_date = yesterday）构造。
     */
    @ProblemFactCollectionProperty
    private List<ShiftAssignment> prevShiftAssignmentList;

    @PlanningEntityCollectionProperty
    private List<ShiftAssignment> assignmentList;

    /**
     * 求解分数（{@code HardSoftLongScore}）。{@link PlanningScore} 由 OptaPlanner
     * 求解期间写入，读出来用于 SmartScheduleService 评估 feasible 性。
     *
     * <p>{@code HardSoftLongScore} 选型理由：{@link com.qyf.hangyi.schedule.solver.constraint.ScheduleConstraintProvider}
     * 中 R4 monthlyHourCap 用 {@code sumLong(hours)} 在 100+ 员工场景下 score
     * 会超出 {@code int} 范围（{@code HardSoftScore} 在 >2³¹ 时溢出）。
     */
    @PlanningScore
    private HardSoftLongScore score;

    public SchedulePlan() {
        // I9 / M2: 防御性初始化 prevShiftAssignmentList 为空列表，避免 OptaPlanner
        // solver descriptor 在 @ProblemFactCollectionProperty field 为 null 时抛
        // IllegalArgumentException("factCollectionProperty should never return null")。
        this.prevShiftAssignmentList = java.util.List.of();
    }

    public LocalDate getScheduleDate() { return scheduleDate; }
    public void setScheduleDate(LocalDate scheduleDate) { this.scheduleDate = scheduleDate; }
    public boolean isPreview() { return preview; }
    public void setPreview(boolean preview) { this.preview = preview; }

    /**
     * 员工列表作为 planning variable value range。
     *
     * <p><b>I19 修复</b>：防御性返回 {@code List.of()} 避免 {@code null}/empty
     * 时 OptaPlanner 抛 {@code IllegalArgumentException}。Empty 仍可能让
     * 求解器拒解（SolverConfig 行为），但比直接 NPE 友好。调用方应保证非空。
     */
    @ValueRangeProvider(id = "employeeList")
    public List<Employee> getEmployeeList() {
        return employeeList == null ? java.util.List.of() : employeeList;
    }
    public void setEmployeeList(List<Employee> employeeList) { this.employeeList = employeeList; }

    public List<Flight> getFlightList() { return flightList; }
    public void setFlightList(List<Flight> flightList) { this.flightList = flightList; }
    public List<Shift> getShiftList() { return shiftList; }
    public void setShiftList(List<Shift> shiftList) { this.shiftList = shiftList; }
    public List<ShiftAssignment> getPrevShiftAssignmentList() {
        return prevShiftAssignmentList == null ? java.util.List.of() : prevShiftAssignmentList;
    }
    public void setPrevShiftAssignmentList(List<ShiftAssignment> prevShiftAssignmentList) {
        this.prevShiftAssignmentList = prevShiftAssignmentList;
    }
    public List<ShiftAssignment> getAssignmentList() { return assignmentList; }
    public void setAssignmentList(List<ShiftAssignment> assignmentList) { this.assignmentList = assignmentList; }
    public HardSoftLongScore getScore() { return score; }
    public void setScore(HardSoftLongScore score) { this.score = score; }
}
