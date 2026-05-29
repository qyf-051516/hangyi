package com.qyf.hangyi.swap.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class CreateSwapApplicationDTO {
    @NotNull private String employeeNo;
    @NotNull private String name;
    @NotNull private String flightNo;
    @NotNull private String startTime;  // HH:mm
    @NotNull private String endTime;    // HH:mm
    @NotNull private String reason;
}
