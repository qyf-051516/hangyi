package com.qyf.hangyi.auth.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("rpt_swap_request")
public class RptSwapRequest {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String requestId;
    private String requestType;
    private String requesterEmp;
    private String targetEmp;
    private String approverEmp;
    private String status;
    private String reason;
    private String sourceFlight;
    private String targetFlight;
    private String extraData;
    private String sourceId;
    private LocalDateTime sourceSyncAt;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
