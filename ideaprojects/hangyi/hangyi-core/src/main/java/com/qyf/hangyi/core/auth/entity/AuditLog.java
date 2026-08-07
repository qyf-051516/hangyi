package com.qyf.hangyi.core.auth.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("audit_log")
public class AuditLog {
    @TableId(type = IdType.AUTO)
    private Long id;

    private String operator;
    private String openid;
    private String action;
    private String detail;
    private String target;
    private LocalDateTime createdAt;
}
