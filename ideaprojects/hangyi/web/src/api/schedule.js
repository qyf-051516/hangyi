import request from './request'

export function getSchedulePage(params, config = {}) {
  return request.get('/schedules/page', { ...config, params })
}

export function autoSchedule(data) {
  return request.post('/schedules/auto', data)
}

export function getScheduleDetails(id, config = {}) {
  return request.get(`/schedules/${id}/details`, config)
}

export function getSchedule(id, config = {}) {
  return request.get(`/schedules/${id}`, config)
}

export function getScheduleByDate(params) {
  return request.get('/schedules/by-date', { params })
}

export function getGanttRange(params, config = {}) {
  return request.get('/schedules/gantt-range', { ...config, params })
}

export function publishSchedule(id) {
  return request.put(`/schedules/${id}/publish`)
}

export function deleteSchedule(id) {
  return request.delete(`/schedules/${id}`)
}

export function getScheduleChangePage(params) {
  return request.get('/schedule-changes/page', { params })
}

export function createScheduleChange(data) {
  return request.post('/schedule-changes', data)
}

export function approveScheduleChange(id, params) {
  return request.put(`/schedule-changes/${id}/approve`, null, { params })
}

/**
 * 导出排班周期 Excel
 * 通过创建临时表单下载，绕过 axios 拦截器
 */
export function exportScheduleExcel(id, scheduleName = '') {
  return downloadFile(
    `/schedules/export/schedule/${id}`,
    `${sanitizeFilename(scheduleName) || `排班_${id}`}.xlsx`
  )
}

/**
 * 导出排班日报 Excel
 */
export function exportDailyExcel(date) {
  return downloadFile(`/schedules/export/daily?date=${encodeURIComponent(date)}`, `排班日报_${date}.xlsx`)
}

export function getScheduleHistory(scheduleDate, config = {}) {
  return request.get('/schedules/history', { ...config, params: { scheduleDate } })
}

async function downloadFile(url, filename) {
  const blob = await request.get(url, {
    responseType: 'blob',
    silent: true
  })

  await throwIfJsonError(blob)

  const blobUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = blobUrl
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(blobUrl)
}

async function throwIfJsonError(blob) {
  if (!(blob instanceof Blob)) {
    throw new Error('导出文件格式异常，请稍后重试')
  }

  if (!blob.type.includes('json')) return

  try {
    const payload = JSON.parse(await blob.text())
    throw new Error(payload?.msg || '导出失败，请稍后重试')
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('导出失败，请稍后重试')
    }
    throw error
  }
}

function sanitizeFilename(value) {
  return String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .slice(0, 80)
}
