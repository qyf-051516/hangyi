package com.qyf.hangyi.schedule.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;
import java.time.LocalDate;
import java.util.List;

@Data
public class SmartScheduleRequest {
    @NotNull private LocalDate scheduleDate;
    @NotNull private List<Long> flightIds;
}
