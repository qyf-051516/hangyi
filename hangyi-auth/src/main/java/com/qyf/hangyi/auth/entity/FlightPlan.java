package com.qyf.hangyi.auth.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

@Data
@TableName("flight_plan")
public class FlightPlan {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String flightNo;
    private LocalDate planDate;
    private LocalTime planTime;
    private LocalTime arrivalTime;
    private LocalTime departureTime;
    private String flightType;
    private String airline;
    private String aircraftTypeName;
    private BigDecimal stayHours;
    private Boolean warningFlag;
    private String status;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
