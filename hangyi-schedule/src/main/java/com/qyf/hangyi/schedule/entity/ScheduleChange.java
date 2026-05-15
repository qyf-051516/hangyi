package com.qyf.hangyi.schedule.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("schedule_change")
public class ScheduleChange {
    @TableId(type = IdType.AUTO)
    private Long id;

    private Long scheduleDetailId;
    private Long employeeId;
    private Long targetEmployeeId;
    private String changeType;
    private LocalDate fromDate;
    private Long fromShiftId;
    private LocalDate toDate;
    private Long toShiftId;
    private String reason;
    private Integer status;
    private Long approverId;
    private String approveRemark;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
