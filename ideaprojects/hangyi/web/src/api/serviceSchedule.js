import request from './request'

export const getServiceScheduleTable = (params, config = {}) =>
  request.get('/service-schedules', { ...config, params })
export const publishServiceSchedule = (data) => request.post('/service-schedules/publish', data)
