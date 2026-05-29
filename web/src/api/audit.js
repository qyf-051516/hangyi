import request from './request'

export const queryOperationLogs = (params) => request.get('/audit/logs', { params })
export const exportOperationLogs = (params) => request.get('/audit/logs/export', { params, responseType: 'blob' })
