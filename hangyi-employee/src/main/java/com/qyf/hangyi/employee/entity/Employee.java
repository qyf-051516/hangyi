package com.qyf.hangyi.employee.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("employee")
public class Employee {
    @TableId(type = IdType.AUTO)
    private Long id;

    private Long userId;
    private Long groupId;
    private String empNo;
    private String name;
    private String idCard;
    private String phone;
    private Integer gender;
    private String position;
    private String jobTitle;
    private String workType;
    private LocalDate hireDate;
    private Integer status;
    private BigDecimal maxHoursPerDay;
    private BigDecimal maxHoursPerWeek;
    private String avatar;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
