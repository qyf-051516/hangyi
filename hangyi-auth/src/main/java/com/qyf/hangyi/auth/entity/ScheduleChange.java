package com.qyf.hangyi.auth.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("schedule_change")
public class ScheduleChange {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long employeeId;
    private Long targetEmployeeId;
    private String changeType;
    private LocalDate fromDate;
    private LocalDate toDate;
    private String reason;
    private Integer status;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
