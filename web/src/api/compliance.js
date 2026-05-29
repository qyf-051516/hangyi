import request from './request'

export const preflightCheck = (data) => request.post('/compliance/preflight-check', data)
