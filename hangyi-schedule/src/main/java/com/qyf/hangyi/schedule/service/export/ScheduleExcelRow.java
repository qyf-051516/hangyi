package com.qyf.hangyi.schedule.service.export;

import com.alibaba.excel.annotation.ExcelProperty;
import lombok.Data;

import java.util.List;

/**
 * 排班周期导出行
 */
@Data
public class ScheduleExcelRow {

    @ExcelProperty("员工")
    private String empNo;

    @ExcelProperty("班次明细")
    private List<String> shifts;

    @ExcelProperty("出勤天数")
    private Integer workDays;

    @ExcelProperty("休息天数")
    private Integer restDays;
}
