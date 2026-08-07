package com.qyf.hangyi.schedule.solver.domain;

import java.time.LocalTime;
import java.util.Objects;
import org.optaplanner.core.api.domain.lookup.PlanningId;

public class Shift {
    @PlanningId
    private Long id;
    private String shiftCode;
    private LocalTime startTime;
    private LocalTime endTime;

    public Shift() {}

    /** 基于 {@link PlanningId} 的 equals —— OptaPlanner 多线程求解要求。 */
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Shift)) return false;
        Shift other = (Shift) o;
        return Objects.equals(id, other.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id);
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getShiftCode() { return shiftCode; }
    public void setShiftCode(String shiftCode) { this.shiftCode = shiftCode; }
    public LocalTime getStartTime() { return startTime; }
    public void setStartTime(LocalTime startTime) { this.startTime = startTime; }
    public LocalTime getEndTime() { return endTime; }
    public void setEndTime(LocalTime endTime) { this.endTime = endTime; }
}
