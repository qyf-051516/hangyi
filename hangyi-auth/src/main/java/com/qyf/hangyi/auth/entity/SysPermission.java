package com.qyf.hangyi.auth.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("sys_permission")
public class SysPermission {
    @TableId(type = IdType.AUTO)
    private Long id;

    private Long parentId;
    private String permName;
    private String permCode;
    private Integer type;
    private String path;
    private String icon;
    private Integer sortOrder;
    private Integer status;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
