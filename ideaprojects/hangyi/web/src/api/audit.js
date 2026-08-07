import request from './request'

export const queryOperationLogs = (params, config = {}) =>
  request.get('/audit/logs', { ...config, params })
export const exportOperationLogs = (params, config = {}) =>
  request.get('/audit/logs/export', { ...config, params, responseType: 'blob' })
