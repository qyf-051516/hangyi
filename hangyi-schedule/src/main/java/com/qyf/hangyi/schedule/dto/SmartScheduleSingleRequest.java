package com.qyf.hangyi.schedule.dto;

import lombok.Data;
import java.time.LocalDate;

@Data
public class SmartScheduleSingleRequest {
    private String flightNo;
    private String airline;
    private String aircraftType;
    private LocalDate scheduleDate;
}
