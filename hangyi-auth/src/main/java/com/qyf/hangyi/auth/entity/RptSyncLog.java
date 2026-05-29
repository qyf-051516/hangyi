package com.qyf.hangyi.auth.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("rpt_sync_log")
public class RptSyncLog {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String collection;
    private String action;
    private String sourceId;
    private Integer recordCount;
    private String status;
    private String errorMsg;
    private String syncBatch;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
}
