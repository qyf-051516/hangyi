package com.qyf.hangyi.schedule.solver.domain;

import java.time.LocalTime;
import java.util.Objects;
import org.optaplanner.core.api.domain.lookup.PlanningId;

public class Flight {
    @PlanningId
    private Long id;
    private String flightNo;
    private String airline;
    private String aircraftTypeName;
    private LocalTime planTime;
    private String derivedShiftCode;     // MORNING/EVENING/NIGHT
    /** 是否为放行航班（触发 TA/TL 持照硬约束）。 */
    private boolean isRelease;

    public Flight() {}

    /** 基于 {@link PlanningId} 的 equals —— OptaPlanner 多线程求解要求。 */
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Flight)) return false;
        Flight other = (Flight) o;
        return Objects.equals(id, other.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id);
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getFlightNo() { return flightNo; }
    public void setFlightNo(String flightNo) { this.flightNo = flightNo; }
    public String getAirline() { return airline; }
    public void setAirline(String airline) { this.airline = airline; }
    public String getAircraftTypeName() { return aircraftTypeName; }
    public void setAircraftTypeName(String aircraftTypeName) { this.aircraftTypeName = aircraftTypeName; }
    public LocalTime getPlanTime() { return planTime; }
    public void setPlanTime(LocalTime planTime) { this.planTime = planTime; }
    public String getDerivedShiftCode() { return derivedShiftCode; }
    public void setDerivedShiftCode(String derivedShiftCode) { this.derivedShiftCode = derivedShiftCode; }
    public boolean isRelease() { return isRelease; }
    public void setRelease(boolean release) { isRelease = release; }
}
