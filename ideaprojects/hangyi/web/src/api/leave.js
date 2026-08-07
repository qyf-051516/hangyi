import request from './request'

export function getLeavePage(params, config = {}) {
  return request.get('/leaves/page', { ...config, params })
}

export function createLeave(data) {
  return request.post('/leaves', data)
}

export function approveLeave(id, params) {
  return request.put(`/leaves/${id}/approve`, null, { params })
}
