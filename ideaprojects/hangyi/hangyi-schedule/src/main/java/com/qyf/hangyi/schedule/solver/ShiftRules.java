package com.qyf.hangyi.schedule.solver;

import java.time.LocalTime;

/**
 * 排班规则常量与工具方法。
 *
 * 原本 SmartScheduleService 和 ProblemFactory 各自实现 timeToShiftCode，
 * 任何边界修改都得改两处。集中到这里。
 */
public final class ShiftRules {

    /** 早班/白班起点 */
    public static final LocalTime MORNING_START = LocalTime.of(8, 0);
    /** 晚班起点 */
    public static final LocalTime EVENING_START = LocalTime.of(16, 0);
    /** 早班结束（用于 R3 跨班间隔计算） */
    public static final int MORNING_START_HOUR = 8;

    /** R2 连续工作天数上限 */
    public static final int MAX_CONTINUOUS_DAYS = 3;
    /** R3 跨班最小间隔（小时） */
    public static final int MIN_CROSS_SHIFT_GAP_HOURS = 8;
    /** R4 月工时上限 */
    public static final int MONTHLY_HOUR_CAP = 176;
    /** C-b 夜班统计窗口 */
    public static final int NIGHT_WINDOW_DAYS = 7;
    /** C-b 窗口内最大夜班数 */
    public static final int NIGHT_WINDOW_MAX = 3;
    /** C-c 连续执勤天数上限 */
    public static final int MAX_CONSECUTIVE_ON_DUTY_DAYS = 6;

    private ShiftRules() {}

    /**
     * 根据 plan_time 推算 shift_code（使用硬编码默认阈值）。
     * 边界含左不含右：08:00 算 MORNING，16:00 算 EVENING，00:00 算 NIGHT。
     *
     * @deprecated 请使用 {@link #timeToShiftCode(LocalTime, LocalTime, LocalTime)} 从 shift_template 动态读取阈值
     */
    @Deprecated
    public static String timeToShiftCode(LocalTime t) {
        return timeToShiftCode(t, MORNING_START, EVENING_START);
    }

    /**
     * 根据 plan_time 推算 shift_code（使用从 shift_template 表读取的动态阈值）。
     * @param t 航班计划时间
     * @param morningStart 早班开始时间（如 08:00）
     * @param eveningStart 晚班开始时间（如 16:00）
     */
    public static String timeToShiftCode(LocalTime t, LocalTime morningStart, LocalTime eveningStart) {
        if (t == null) return "MORNING";
        if (!t.isBefore(morningStart) && t.isBefore(eveningStart)) return "MORNING";
        if (!t.isBefore(eveningStart)) return "EVENING";
        return "NIGHT";
    }

    /**
     * R3: 昨日班次结束到今 MORNING(8:00) 的间隔小时数。
     * 显式处理 endHour == 8 的特殊情况（前一日班次 8:00 结束 + 24h 跨日），
     * 不再依赖 "(8-8+24)%24 == 0" 的数学巧合。
     */
    public static int crossShiftGapHours(int prevEndHour) {
        if (prevEndHour == MORNING_START_HOUR) return 24;  // 显式兜底
        int gap = (MORNING_START_HOUR - prevEndHour + 24) % 24;
        return gap == 0 ? 24 : gap;
    }
}
