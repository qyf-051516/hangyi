package com.qyf.hangyi.flight.entity;

import com.baomidou.mybatisplus.annotation.*;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

@Data
@TableName("flight_plan")
public class FlightPlan {
    @TableId(type = IdType.AUTO)
    private Long id;

    @NotBlank(message = "航班号不能为空")
    private String flightNo;
    private Long aircraftTypeId;
    @NotNull(message = "计划日期不能为空")
    private LocalDate planDate;
    private String registration;
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
