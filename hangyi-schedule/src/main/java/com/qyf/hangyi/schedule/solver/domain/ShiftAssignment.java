package com.qyf.hangyi.schedule.solver.domain;

import ai.timefold.solver.core.api.domain.entity.PlanningEntity;
import ai.timefold.solver.core.api.domain.lookup.PlanningId;
import ai.timefold.solver.core.api.domain.variable.PlanningVariable;
import com.qyf.hangyi.schedule.entity.ShiftTemplate;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;

@Data
@NoArgsConstructor
@PlanningEntity
public class ShiftAssignment {

    @PlanningId
    private Long id;

    private Employee employee;

    private LocalDate workDate;

    @PlanningVariable(valueRangeProviderRefs = "shiftRange")
    private ShiftTemplate shift;

    public boolean isRest() {
        return shift != null && "REST".equals(shift.getShiftType());
    }

    public boolean isNightShift() {
        return shift != null && "NIGHT".equals(shift.getShiftType());
    }

    public long getShiftDurationHours() {
        if (shift == null) return 0;
        LocalTime start = shift.getStartTime();
        LocalTime end = shift.getEndTime();
        if (end.isAfter(start)) {
            return ChronoUnit.HOURS.between(start, end);
        }
        return ChronoUnit.HOURS.between(start, end) + 24;
    }

    public boolean isWeekend() {
        DayOfWeek dow = workDate.getDayOfWeek();
        return dow == DayOfWeek.SATURDAY || dow == DayOfWeek.SUNDAY;
    }

    public int getDayOfWeek() {
        return workDate.getDayOfWeek().getValue() % 7;
    }

    public int getWeekOfYear() {
        return workDate.get(java.time.temporal.IsoFields.WEEK_OF_WEEK_BASED_YEAR);
    }

    public boolean isConsecutiveDay(ShiftAssignment other) {
        return Math.abs(this.workDate.toEpochDay() - other.workDate.toEpochDay()) == 1;
    }
}
