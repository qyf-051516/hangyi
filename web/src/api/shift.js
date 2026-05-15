import request from './request'

export function getShiftList() {
  return request.get('/shifts/list')
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
