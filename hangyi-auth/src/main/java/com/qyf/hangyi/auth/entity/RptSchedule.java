package com.qyf.hangyi.auth.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("rpt_schedule")
public class RptSchedule {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String scheduleKey;
    private String flightNo;
    private String airline;
    private String aircraftType;
    private LocalDate scheduleDate;
    private String shiftCode;
    private String staffId;
    private String staffName;
    private String employeeNo;
    private String groupId;
    private String status;
    private String sourceId;
    private String extraData;
    private LocalDateTime sourceSyncAt;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
