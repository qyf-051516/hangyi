package com.qyf.hangyi.flight.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

@Data
@TableName("flight_plan")
public class FlightPlan {
    @TableId(type = IdType.AUTO)
    private Long id;

    private String flightNo;
    private Long aircraftTypeId;
    private String registration;
    private LocalDate planDate;
    private LocalTime planTime;
    private String flightType;
    private String routeFrom;
    private String routeTo;
    private String gate;
    private String status;
    private String remark;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
