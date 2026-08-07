package com.qyf.hangyi.schedule.solver.domain;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import org.optaplanner.core.api.domain.lookup.PlanningId;

public class Employee {
    @PlanningId
    private Long id;
    private String name;
    private String empNo;
    private Long groupId;
    private List<String> aircraftTypeNames;
    private String licenseType;          // TA/TH/TI/TL/NULL
    private Set<LocalDate> leaveDates;
    private int continuousDays;
    private int monthlyHours;
    private int monthlyNightCount;
    private int recent7DayNightCount;
    private String prevShiftCode;

    /**
     * 上一班次结束时间（精确到分钟）。用于 R3 跨班 8h 间隔计算，避免
     * int 小时粒度丢分钟（如 22:30 → 06:00 不是 8h 间隔）。
     *
     * <p><b>I9 修复</b>：新增字段。{@link #prevShiftEndHour} 保留为
     * fallback 兼容旧代码读取。优先使用 {@code prevShiftEndTime}。
     */
    private LocalDateTime prevShiftEndTime;

    /**
     * @deprecated I9: 使用 {@link #prevShiftEndTime} 精确到分钟，
     * int 小时粒度丢分钟 + 夜班跨日口径错。仅作 fallback 兼容旧调用。
     */
    @Deprecated
    private int prevShiftEndHour;

    public Employee() {}

    /** 基于 {@link PlanningId} 的 equals —— OptaPlanner 多线程求解要求。 */
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Employee)) return false;
        Employee other = (Employee) o;
        return Objects.equals(id, other.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id);
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getEmpNo() { return empNo; }
    public void setEmpNo(String empNo) { this.empNo = empNo; }
    public Long getGroupId() { return groupId; }
    public void setGroupId(Long groupId) { this.groupId = groupId; }
    public List<String> getAircraftTypeNames() { return aircraftTypeNames; }
    public void setAircraftTypeNames(List<String> aircraftTypeNames) { this.aircraftTypeNames = aircraftTypeNames; }
    public String getLicenseType() { return licenseType; }
    public void setLicenseType(String licenseType) { this.licenseType = licenseType; }
    public Set<LocalDate> getLeaveDates() { return leaveDates; }
    public void setLeaveDates(Set<LocalDate> leaveDates) { this.leaveDates = leaveDates; }
    public int getContinuousDays() { return continuousDays; }
    public void setContinuousDays(int continuousDays) { this.continuousDays = continuousDays; }
    public int getMonthlyHours() { return monthlyHours; }
    public void setMonthlyHours(int monthlyHours) { this.monthlyHours = monthlyHours; }
    public int getMonthlyNightCount() { return monthlyNightCount; }
    public void setMonthlyNightCount(int monthlyNightCount) { this.monthlyNightCount = monthlyNightCount; }
    public int getRecent7DayNightCount() { return recent7DayNightCount; }
    public void setRecent7DayNightCount(int recent7DayNightCount) { this.recent7DayNightCount = recent7DayNightCount; }
    public String getPrevShiftCode() { return prevShiftCode; }
    public void setPrevShiftCode(String prevShiftCode) { this.prevShiftCode = prevShiftCode; }
    public LocalDateTime getPrevShiftEndTime() { return prevShiftEndTime; }
    public void setPrevShiftEndTime(LocalDateTime prevShiftEndTime) { this.prevShiftEndTime = prevShiftEndTime; }
    public int getPrevShiftEndHour() { return prevShiftEndHour; }
    public void setPrevShiftEndHour(int prevShiftEndHour) { this.prevShiftEndHour = prevShiftEndHour; }
}
