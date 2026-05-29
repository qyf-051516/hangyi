package com.qyf.hangyi.auth.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("schedule_detail")
public class ScheduleDetail {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long scheduleId;
    private Long employeeId;
    private LocalDate workDate;
    private Long shiftId;
    private String scheduleType;
    private Long flightId;
    private String taskType;
    private LocalDateTime taskStart;
    private LocalDateTime taskEnd;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
