package com.qyf.hangyi.schedule.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;
import java.time.LocalTime;

@Data
@TableName("shift_template")
public class ShiftTemplate {
    @TableId(type = IdType.AUTO)
    private Long id;

    private String shiftCode;
    private String shiftName;
    private LocalTime startTime;
    private LocalTime endTime;
    private String shiftType;
    private String color;
    private Integer requireQualification;
    private Integer status;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
