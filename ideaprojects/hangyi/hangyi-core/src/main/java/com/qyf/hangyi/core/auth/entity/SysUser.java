package com.qyf.hangyi.core.auth.entity;

import com.baomidou.mybatisplus.annotation.*;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.qyf.hangyi.common.serializer.MaskedSerializer;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("sys_user")
public class SysUser {
    @TableId(type = IdType.AUTO)
    private Long id;

    private String username;
    @JsonIgnore
    private String password;
    private String realName;
    @JsonSerialize(using = MaskedSerializer.class)
    private String phone;
    @JsonSerialize(using = MaskedSerializer.class)
    private String email;
    private String avatar;
    private String wechatOpenid;

    private Integer status;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
