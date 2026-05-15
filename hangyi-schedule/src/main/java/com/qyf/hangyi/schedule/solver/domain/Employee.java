package com.qyf.hangyi.schedule.solver.domain;

import lombok.Data;
import lombok.NoArgsConstructor;
import java.math.BigDecimal;

/**
 * 排班求解器使用的员工模型（从 Employee 服务获取数据后转换）
 */
@Data
@NoArgsConstructor
public class Employee {
    private Long id;
    private String name;
    private String empNo;
    private Long groupId;
    private Integer status;
    private BigDecimal maxHoursPerDay;
    private BigDecimal maxHoursPerWeek;
}
