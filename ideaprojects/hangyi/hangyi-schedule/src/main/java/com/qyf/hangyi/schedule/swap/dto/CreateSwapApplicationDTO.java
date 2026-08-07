package com.qyf.hangyi.schedule.swap.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDate;

@Data
public class CreateSwapApplicationDTO {
    @NotNull private String employeeNo;
    @NotNull private String name;
    @NotNull private String flightNo;
    @NotNull private LocalDate workDate;
    @NotNull private String startTime;  // HH:mm
    @NotNull private String endTime;    // HH:mm
    @NotNull private String reason;
}
