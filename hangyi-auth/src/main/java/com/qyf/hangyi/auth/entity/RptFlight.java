package com.qyf.hangyi.auth.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("rpt_flight")
public class RptFlight {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String flightNo;
    private String airline;
    private String aircraftType;
    private LocalDate scheduleDate;
    private String arrivalTime;
    private String departureTime;
    private BigDecimal stayHours;
    private Boolean warningFlag;
    private String sourceId;
    private LocalDateTime sourceSyncAt;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
