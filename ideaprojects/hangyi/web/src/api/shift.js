import request from './request'

export function getShiftList(config = {}) {
  return request.get('/shifts/list', config)
}

export function createShift(data) {
  return request.post('/shifts', data)
}

export function updateShift(data) {
  return request.put('/shifts', data)
}

export function deleteShift(id) {
  return request.delete(`/shifts/${id}`)
}
