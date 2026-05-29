package com.qyf.hangyi.schedule.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;
import java.time.LocalDate;

@Data
public class MultiDayScheduleRequest {
    @NotNull private LocalDate startDate;
    @NotNull private LocalDate endDate;
}
