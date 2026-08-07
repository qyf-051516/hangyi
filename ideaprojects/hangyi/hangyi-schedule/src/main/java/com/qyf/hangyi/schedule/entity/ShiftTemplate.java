package com.qyf.hangyi.schedule.entity;

import com.baomidou.mybatisplus.annotation.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDateTime;
import java.time.LocalTime;

@Data
@TableName("shift_template")
public class ShiftTemplate {
    @TableId(type = IdType.AUTO)
    private Long id;

    @NotBlank(message = "班次编码不能为空")
    private String shiftCode;
    @NotBlank(message = "班次名称不能为空")
    private String shiftName;
    @NotNull(message = "开始时间不能为空")
    private LocalTime startTime;
    @NotNull(message = "结束时间不能为空")
    private LocalTime endTime;
    private String shiftType;
    private String color;
    private Integer requireQualification;
    private Integer status;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
