package com.qyf.hangyi.auth.entity;

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
    private String phone;
    private String position;
    private String workType;
    private LocalDate hireDate;
    private Integer status;
    private String roleType;
    private String openid;
    private String tags;
    private String authorizedAirlines;
    private String authorizedAircraftTypes;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
