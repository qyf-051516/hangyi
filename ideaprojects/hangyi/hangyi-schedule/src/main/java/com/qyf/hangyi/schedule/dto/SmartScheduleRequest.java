package com.qyf.hangyi.schedule.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;
import java.time.LocalDate;
import java.util.List;

@Data
public class SmartScheduleRequest {
    @NotNull private LocalDate scheduleDate;
    @NotNull private List<Long> flightIds;
    /** preview 模式：不写 DB（仅算方案） */
    private boolean preview = false;
    /** 班组 ID（null 表示全站；DB schedule.group_id 允许 NULL） */
    private Long groupId;
}
