package com.qyf.hangyi.schedule.dto;

import com.qyf.hangyi.schedule.entity.ScheduleDetail;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;

@Data
public class ScheduleDetailVO {
    private Long id;
    private Long scheduleId;
    private Long employeeId;
    private String employeeName;
    private String employeePosition;
    private String employeeJobTitle;
    private LocalDate workDate;
    private Long shiftId;
    private String shiftCode;
    private String shiftName;
    private LocalTime shiftStartTime;
    private LocalTime shiftEndTime;
    private String shiftColor;
    private String shiftType;
    private String scheduleType;
    private String remark;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    /** 当天航班信息 */
    private List<Map<String, Object>> flights;
    /** 员工资质 */
    private List<Map<String, Object>> qualifications;

    public static ScheduleDetailVO from(ScheduleDetail d, Map<String, Object> emp,
                                         Map<String, Object> shiftInfo,
                                         List<Map<String, Object>> flights,
                                         List<Map<String, Object>> qualifications) {
        ScheduleDetailVO vo = new ScheduleDetailVO();
        vo.setId(d.getId());
        vo.setScheduleId(d.getScheduleId());
        vo.setEmployeeId(d.getEmployeeId());
        vo.setEmployeeName(emp != null ? (String) emp.get("name") : null);
        vo.setEmployeePosition(emp != null ? (String) emp.get("position") : null);
        vo.setEmployeeJobTitle(emp != null ? (String) emp.get("jobTitle") : null);
        vo.setWorkDate(d.getWorkDate());
        vo.setShiftId(d.getShiftId());
        if (shiftInfo != null) {
            vo.setShiftCode((String) shiftInfo.get("shiftCode"));
            vo.setShiftName((String) shiftInfo.get("shiftName"));
            vo.setShiftStartTime((LocalTime) shiftInfo.get("startTime"));
            vo.setShiftEndTime((LocalTime) shiftInfo.get("endTime"));
            vo.setShiftColor((String) shiftInfo.get("color"));
            vo.setShiftType((String) shiftInfo.get("shiftType"));
        }
        vo.setScheduleType(d.getScheduleType());
        vo.setRemark(d.getRemark());
        vo.setCreatedAt(d.getCreatedAt());
        vo.setUpdatedAt(d.getUpdatedAt());
        vo.setFlights(flights);
        vo.setQualifications(qualifications);
        return vo;
    }
}
