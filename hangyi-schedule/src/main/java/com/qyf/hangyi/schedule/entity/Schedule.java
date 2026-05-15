package com.qyf.hangyi.schedule.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("schedule")
public class Schedule {
    @TableId(type = IdType.AUTO)
    private Long id;

    private String scheduleName;
    private Long groupId;
    private LocalDate startDate;
    private LocalDate endDate;
    private Integer status;
    private Long createdBy;
    private LocalDateTime publishedAt;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
