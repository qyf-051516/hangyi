import request from './request'

export const getScheduleStatistics = (params) => request.get('/statistics/schedules', { params })
export const getStatusOverview = (params) => request.get('/statistics/status-overview', { params })
