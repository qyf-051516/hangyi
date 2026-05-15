package com.qyf.hangyi.schedule.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("schedule_rule")
public class ScheduleRule {
    @TableId(type = IdType.AUTO)
    private Long id;

    private String ruleCode;
    private String ruleName;
    private String ruleType;
    private String ruleContent;
    private Integer penaltyWeight;
    private String description;
    private Integer enabled;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
