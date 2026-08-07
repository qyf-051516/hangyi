package com.qyf.hangyi.core.employee.leave.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.util.List;

public record CreateLeaveRequest(
        Long employeeId,
        @NotBlank(message = "请假类型不能为空")
        @Size(max = 50, message = "请假类型过长")
        String leaveType,
        @NotNull(message = "开始日期不能为空") LocalDate startDate,
        LocalDate endDate,
        @Size(max = 500, message = "请假原因不能超过500字") String reason,
        @Pattern(regexp = "TEXT|IMAGE|BOTH", message = "理由模式无效") String reasonMode,
        @Size(max = 9, message = "最多上传9张凭证图片") List<@Size(max = 500, message = "图片地址过长") String> reasonImages
) {
}
