import request from './request'

export const getServiceScheduleTable = (params) => request.get('/service-schedules', { params })
export const publishServiceSchedule = (data) => request.post('/service-schedules/publish', data)
