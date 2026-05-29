package com.qyf.hangyi.schedule.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;
import java.time.LocalDate;
import java.util.List;

@Data
public class RoleScheduleRequest {
    @NotNull private LocalDate scheduleDate;
    @NotNull private List<RoleAssignment> assignments;

    @Data
    public static class RoleAssignment {
        private String flightNo;
        private String airline;
        private String aircraftType;
        private String taskType;
        private int requiredCount;
    }
}
