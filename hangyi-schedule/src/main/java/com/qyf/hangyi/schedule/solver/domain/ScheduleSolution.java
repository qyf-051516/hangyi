package com.qyf.hangyi.schedule.solver.domain;

import ai.timefold.solver.core.api.domain.solution.PlanningEntityCollectionProperty;
import ai.timefold.solver.core.api.domain.solution.PlanningScore;
import ai.timefold.solver.core.api.domain.solution.PlanningSolution;
import ai.timefold.solver.core.api.domain.solution.ProblemFactCollectionProperty;
import ai.timefold.solver.core.api.domain.valuerange.ValueRangeProvider;
import ai.timefold.solver.core.api.score.buildin.hardsoft.HardSoftScore;
import com.qyf.hangyi.schedule.entity.ShiftTemplate;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@PlanningSolution
public class ScheduleSolution {

    @ProblemFactCollectionProperty
    private List<Employee> employees;

    @ProblemFactCollectionProperty
    @ValueRangeProvider(id = "shiftRange")
    private List<ShiftTemplate> shifts;

    @PlanningEntityCollectionProperty
    private List<ShiftAssignment> shiftAssignments;

    @PlanningScore
    private HardSoftScore score;

    public ScheduleSolution(List<Employee> employees,
                            List<ShiftTemplate> shifts,
                            List<ShiftAssignment> assignments) {
        this.employees = employees;
        this.shifts = shifts;
        this.shiftAssignments = assignments;
    }
}
