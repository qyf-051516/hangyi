package com.qyf.hangyi.schedule.service.export;

import com.alibaba.excel.annotation.ExcelProperty;
import lombok.Data;

/**
 * 排班日报导出行
 */
@Data
public class DailyScheduleRow {

    @ExcelProperty("员工姓名")
    private String employeeName;

    @ExcelProperty("班次")
    private String shiftName;

    @ExcelProperty("日期")
    private String workDate;

    @ExcelProperty("排班方式")
    private String scheduleType;
}
