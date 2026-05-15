package com.qyf.hangyi.employee.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("employee_preference")
public class EmployeePreference {
    @TableId(type = IdType.AUTO)
    private Long id;

    private Long employeeId;
    private String prefType;
    private String prefKey;
    private String prefValue;
    private Integer priority;
    private LocalDate effectiveFrom;
    private LocalDate effectiveTo;
    private Integer status;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
