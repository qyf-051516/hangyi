package com.qyf.hangyi.employee.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("aircraft_type")
public class AircraftType {
    @TableId(type = IdType.AUTO)
    private Long id;

    private String typeCode;
    private String typeName;
    private String manufacturer;
    private Integer status;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
