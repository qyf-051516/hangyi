package com.qyf.hangyi.schedule.swap.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class CreateSwapRequestDTO {
    @NotNull private Long sourceScheduleId;
    @NotNull private Long targetScheduleId;
    private String reason = "临时代班";
}
