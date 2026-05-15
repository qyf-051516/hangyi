package com.qyf.hangyi.employee.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("team_group")
public class TeamGroup {
    @TableId(type = IdType.AUTO)
    private Long id;

    private String groupName;
    private String groupCode;
    private String groupType;
    private Long leaderId;
    private String description;
    private Integer status;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
