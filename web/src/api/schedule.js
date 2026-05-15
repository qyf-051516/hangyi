import request from './request'
import { ElMessage } from 'element-plus'

export function getSchedulePage(params) {
  return request.get('/schedules/page', { params })
}

export function autoSchedule(data) {
  return request.post('/schedules/auto', data)
}

export function getScheduleDetails(id) {
  return request.get(`/schedules/${id}/details`)
}

export function getScheduleByDate(params) {
  return request.get('/schedules/by-date', { params })
}

export function getGanttRange(params) {
  return request.get('/schedules/gantt-range', { params })
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
export function exportScheduleExcel(id) {
  downloadFile(`/api/schedules/export/schedule/${id}`, `排班_${id}.xlsx`)
}

/**
 * 导出排班日报 Excel
 */
export function exportDailyExcel(date) {
  downloadFile(`/api/schedules/export/daily?date=${date}`, `排班日报_${date}.xlsx`)
}

function downloadFile(url, filename) {
  const token = localStorage.getItem('token')
  const sep = url.includes('?') ? '&' : '?'
  const a = document.createElement('a')
  a.href = url + sep + 'token=' + encodeURIComponent(token)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
