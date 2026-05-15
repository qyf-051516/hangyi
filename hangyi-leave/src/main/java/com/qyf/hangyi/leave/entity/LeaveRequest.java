package com.qyf.hangyi.leave.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("leave_request")
public class LeaveRequest {
    @TableId(type = IdType.AUTO)
    private Long id;

    private Long employeeId;
    private String leaveType;
    private LocalDate startDate;
    private LocalDate endDate;
    private BigDecimal totalDays;
    private String reason;
    private Integer status;
    private Long approverId;
    private String approveRemark;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
