package com.qyf.hangyi.schedule.solver.domain;

import com.qyf.hangyi.schedule.entity.ShiftTemplate;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalTime;

import static org.assertj.core.api.Assertions.assertThat;

class ShiftAssignmentTest {

    private ShiftTemplate shift(String type, LocalTime start, LocalTime end) {
        ShiftTemplate s = new ShiftTemplate();
        s.setShiftType(type);
        s.setStartTime(start);
        s.setEndTime(end);
        return s;
    }

    private ShiftAssignment assignment(Long id, Employee emp, LocalDate date, ShiftTemplate shift) {
        ShiftAssignment a = new ShiftAssignment();
        a.setId(id);
        a.setEmployee(emp);
        a.setWorkDate(date);
        a.setShift(shift);
        return a;
    }

    @Test
    void isRest_returnsTrueForRestType() {
        ShiftAssignment a = assignment(1L, new Employee(), LocalDate.now(),
                shift("REST", null, null));
        assertThat(a.isRest()).isTrue();
    }

    @Test
    void isRest_returnsFalseForNonRestType() {
        ShiftAssignment a = assignment(1L, new Employee(), LocalDate.now(),
                shift("DAY", LocalTime.of(8, 0), LocalTime.of(16, 0)));
        assertThat(a.isRest()).isFalse();
    }

    @Test
    void isRest_returnsFalseForNullShift() {
        ShiftAssignment a = assignment(1L, new Employee(), LocalDate.now(), null);
        assertThat(a.isRest()).isFalse();
    }

    @Test
    void isNightShift_returnsTrueForNightType() {
        ShiftAssignment a = assignment(1L, new Employee(), LocalDate.now(),
                shift("NIGHT", LocalTime.of(0, 0), LocalTime.of(8, 0)));
        assertThat(a.isNightShift()).isTrue();
    }

    @Test
    void isNightShift_returnsFalseForDayType() {
        ShiftAssignment a = assignment(1L, new Employee(), LocalDate.now(),
                shift("DAY", LocalTime.of(8, 0), LocalTime.of(16, 0)));
        assertThat(a.isNightShift()).isFalse();
    }

    @Test
    void isNightShift_returnsFalseForNullShift() {
        ShiftAssignment a = assignment(1L, new Employee(), LocalDate.now(), null);
        assertThat(a.isNightShift()).isFalse();
    }

    @Test
    void isWeekend_returnsTrueForSaturday() {
        ShiftAssignment a = assignment(1L, new Employee(), LocalDate.of(2026, 6, 6), null);
        assertThat(a.isWeekend()).isTrue();
    }

    @Test
    void isWeekend_returnsTrueForSunday() {
        ShiftAssignment a = assignment(1L, new Employee(), LocalDate.of(2026, 6, 7), null);
        assertThat(a.isWeekend()).isTrue();
    }

    @Test
    void isWeekend_returnsFalseForWeekday() {
        ShiftAssignment a = assignment(1L, new Employee(), LocalDate.of(2026, 6, 1), null);
        assertThat(a.isWeekend()).isFalse();
    }

    @Test
    void isConsecutiveDay_returnsTrueForAdjacentDates() {
        ShiftAssignment a1 = assignment(1L, new Employee(), LocalDate.of(2026, 6, 1), null);
        ShiftAssignment a2 = assignment(2L, new Employee(), LocalDate.of(2026, 6, 2), null);
        assertThat(a1.isConsecutiveDay(a2)).isTrue();
    }

    @Test
    void isConsecutiveDay_returnsFalseForNonAdjacentDates() {
        ShiftAssignment a1 = assignment(1L, new Employee(), LocalDate.of(2026, 6, 1), null);
        ShiftAssignment a2 = assignment(2L, new Employee(), LocalDate.of(2026, 6, 3), null);
        assertThat(a1.isConsecutiveDay(a2)).isFalse();
    }

    @Test
    void isConsecutiveDay_returnsFalseForSameDate() {
        ShiftAssignment a1 = assignment(1L, new Employee(), LocalDate.of(2026, 6, 1), null);
        ShiftAssignment a2 = assignment(2L, new Employee(), LocalDate.of(2026, 6, 1), null);
        assertThat(a1.isConsecutiveDay(a2)).isFalse();
    }

    @Test
    void getShiftDurationHours_crossesMidnight() {
        ShiftAssignment a = assignment(1L, new Employee(), LocalDate.now(),
                shift("NIGHT", LocalTime.of(22, 0), LocalTime.of(6, 0)));
        assertThat(a.getShiftDurationHours()).isEqualTo(8);
    }

    @Test
    void getShiftDurationHours_sameDay() {
        ShiftAssignment a = assignment(1L, new Employee(), LocalDate.now(),
                shift("DAY", LocalTime.of(8, 0), LocalTime.of(16, 0)));
        assertThat(a.getShiftDurationHours()).isEqualTo(8);
    }

    @Test
    void getShiftDurationHours_zeroForNullShift() {
        ShiftAssignment a = assignment(1L, new Employee(), LocalDate.now(), null);
        assertThat(a.getShiftDurationHours()).isZero();
    }

    @Test
    void getDayOfWeek_returnsCorrectValue() {
        // Monday returns 1 (getValue() % 7 = 1 % 7 = 1)
        ShiftAssignment a = assignment(1L, new Employee(), LocalDate.of(2026, 6, 1), null);
        assertThat(a.getDayOfWeek()).isEqualTo(1);
    }

    @Test
    void getWeekOfYear_returnsPositiveValue() {
        ShiftAssignment a = assignment(1L, new Employee(), LocalDate.of(2026, 6, 1), null);
        assertThat(a.getWeekOfYear()).isPositive();
    }
}
