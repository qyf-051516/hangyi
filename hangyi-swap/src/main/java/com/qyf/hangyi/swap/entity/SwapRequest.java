package com.qyf.hangyi.swap.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDateTime;
import java.time.LocalTime;

@Data
@TableName("swap_request")
public class SwapRequest {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String requestType;  // SWAP / SHIFT_APPLY
    private Long sourceScheduleId;
    private Long targetScheduleId;
    private Long sourceStaffId;
    private Long targetStaffId;
    private String employeeNo;
    private String name;
    private String flightNo;
    private LocalTime startTime;
    private LocalTime endTime;
    private String reason;
    private String status;        // PENDING / APPROVED / REJECTED
    private String verifier;
    private String comment;
    private Long requesterId;
    private Long approverId;
    private LocalDateTime requesterReadAt;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
