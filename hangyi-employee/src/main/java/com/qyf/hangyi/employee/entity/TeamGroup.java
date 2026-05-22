package com.qyf.hangyi.employee.entity;

import com.baomidou.mybatisplus.annotation.*;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("team_group")
public class TeamGroup {
    @TableId(type = IdType.AUTO)
    private Long id;

    @NotBlank(message = "班组名称不能为空")
    private String groupName;
    private String groupCode;
    @NotBlank(message = "班组类型不能为空")
    private String groupType;
    private Long leaderId;
    private String description;
    private Integer status;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
