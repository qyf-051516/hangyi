package com.qyf.hangyi.employee.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("employee_qualification")
public class EmployeeQualification {
    @TableId(type = IdType.AUTO)
    private Long id;

    private Long employeeId;
    private Long aircraftTypeId;
    private String qualType;
    private String qualCode;
    private String qualName;
    private LocalDate issueDate;
    private LocalDate expireDate;
    private Integer status;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
