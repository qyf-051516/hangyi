package com.qyf.hangyi.schedule.entity;

import com.baomidou.mybatisplus.annotation.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("schedule_change")
public class ScheduleChange {
    @TableId(type = IdType.AUTO)
    private Long id;

    private String sourceRequestId;
    @NotNull(message = "排班明细不能为空")
    private Long scheduleDetailId;
    @NotNull(message = "员工不能为空")
    private Long employeeId;
    private Long targetEmployeeId;
    @NotBlank(message = "变更类型不能为空")
    private String changeType;
    @NotNull(message = "原排班日期不能为空")
    private LocalDate fromDate;
    private Long fromShiftId;
    private LocalDate toDate;
    private Long toShiftId;
    private String reason;
    private Integer status;
    private Long approverId;
    private String approveRemark;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
