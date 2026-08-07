package com.qyf.hangyi.core.employee.leave.entity;

import com.baomidou.mybatisplus.annotation.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("leave_request")
public class LeaveRequest {
    @TableId(type = IdType.AUTO)
    private Long id;

    private String sourceRequestId;

    @NotNull(message = "员工ID不能为空")
    private Long employeeId;
    @NotBlank(message = "请假类型不能为空")
    private String leaveType;
    @NotNull(message = "开始日期不能为空")
    private LocalDate startDate;
    private LocalDate endDate;
    private BigDecimal totalDays;
    private String reason;
    private String reasonMode;
    private String reasonImages;
    private String validationSnapshot;
    private String auditTrail;
    private Integer status;
    private Long approverId;
    private String approveRemark;
    private LocalDateTime cancelledAt;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
