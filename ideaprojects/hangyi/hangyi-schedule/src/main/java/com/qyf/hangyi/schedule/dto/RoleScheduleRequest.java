package com.qyf.hangyi.schedule.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;
import java.time.LocalDate;
import java.util.List;

@Data
public class RoleScheduleRequest {
    @NotNull private LocalDate scheduleDate;
    @NotEmpty(message = "角色排班任务不能为空")
    @Valid
    private List<RoleAssignment> assignments;

    @Data
    public static class RoleAssignment {
        @NotBlank(message = "航班号不能为空")
        private String flightNo;
        private String airline;
        private String aircraftType;
        @NotBlank(message = "任务类型不能为空")
        private String taskType;
        @Min(value = 1, message = "需求人数至少为 1")
        @Max(value = 20, message = "单项任务需求人数不能超过 20")
        private int requiredCount;
    }
}
