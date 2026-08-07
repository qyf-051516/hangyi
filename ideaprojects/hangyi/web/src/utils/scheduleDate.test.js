import { describe, expect, it } from 'vitest'
import {
  countScheduleDays,
  formatLocalDate,
  getDefaultPlanningPeriod
} from './scheduleDate'

describe('schedule date utilities', () => {
  it('counts schedule dates inclusively', () => {
    expect(countScheduleDays('2026-07-27', '2026-07-27')).toBe(1)
    expect(countScheduleDays('2026-07-27', '2026-08-02')).toBe(7)
  })

  it('handles leap days and month boundaries', () => {
    expect(countScheduleDays('2024-02-28', '2024-03-01')).toBe(3)
    expect(countScheduleDays('2025-02-28', '2025-03-01')).toBe(2)
  })

  it('rejects reversed, missing, and invalid dates', () => {
    expect(countScheduleDays('2026-08-02', '2026-07-27')).toBe(0)
    expect(countScheduleDays('', '2026-07-27')).toBe(0)
    expect(countScheduleDays('2026-02-30', '2026-03-02')).toBe(0)
    expect(countScheduleDays('2026/07/27', '2026-08-02')).toBe(0)
  })

  it('uses the current Monday for a Monday reference date', () => {
    expect(getDefaultPlanningPeriod(new Date(2026, 6, 27, 8))).toEqual({
      startDate: '2026-07-27',
      endDate: '2026-08-02'
    })
  })

  it('uses the next Monday for other weekdays', () => {
    expect(getDefaultPlanningPeriod(new Date(2026, 6, 28, 20))).toEqual({
      startDate: '2026-08-03',
      endDate: '2026-08-09'
    })
  })

  it('formats local calendar dates and rejects invalid references', () => {
    expect(formatLocalDate(new Date(2026, 0, 9, 23))).toBe('2026-01-09')
    expect(() => getDefaultPlanningPeriod(new Date('invalid')))
      .toThrow('referenceDate must be a valid date')
  })
})
