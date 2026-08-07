import request from './request'

export const getScheduleStatistics = (params, config = {}) =>
  request.get('/statistics/schedules', { ...config, params })
export const getStatusOverview = (params, config = {}) =>
  request.get('/statistics/status-overview', { ...config, params })
export const getPendingEmployees = (params, config = {}) =>
  request.get('/statistics/pending-employees', { ...config, params })
