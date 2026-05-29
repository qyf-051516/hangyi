package com.qyf.hangyi.auth.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("rpt_staff")
public class RptStaff {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String employeeNo;
    private String name;
    private String groupId;
    private Boolean active;
    private Boolean onLeave;
    private String roleType;
    private String phone;
    private Boolean isAdmin;
    private String openid;
    private String tags;
    private String authorizedAirlines;
    private String authorizedAircraftTypes;
    private String qualifications;
    private String preferences;
    private String sourceId;
    private LocalDateTime sourceSyncAt;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
