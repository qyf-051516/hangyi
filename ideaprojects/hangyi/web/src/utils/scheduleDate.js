const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export function countScheduleDays(startDate, endDate) {
  const start = parseIsoDate(startDate)
  const end = parseIsoDate(endDate)
  if (start == null || end == null || end < start) return 0
  return Math.floor((end - start) / 86400000) + 1
}

export function getDefaultPlanningPeriod(referenceDate = new Date()) {
  const start = new Date(referenceDate)
  if (Number.isNaN(start.getTime())) {
    throw new TypeError('referenceDate must be a valid date')
  }

  start.setHours(12, 0, 0, 0)
  const weekday = start.getDay()
  const daysUntilMonday = weekday === 1 ? 0 : (8 - weekday) % 7
  start.setDate(start.getDate() + daysUntilMonday)

  const end = new Date(start)
  end.setDate(start.getDate() + 6)

  return {
    startDate: formatLocalDate(start),
    endDate: formatLocalDate(end)
  }
}

export function formatLocalDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseIsoDate(value) {
  const match = ISO_DATE_PATTERN.exec(value || '')
  if (!match) return null

  const [, yearText, monthText, dayText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const timestamp = Date.UTC(year, month - 1, day)
  const parsed = new Date(timestamp)

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null
  }

  return timestamp
}
