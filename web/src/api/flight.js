import request from './request'

export function getFlightPage(params) {
  return request.get('/flights/page', { params })
}

export function createFlight(data) {
  return request.post('/flights', data)
}

export function updateFlight(data) {
  return request.put('/flights', data)
}

export function deleteFlight(id) {
  return request.delete(`/flights/${id}`)
}

export function syncFlights(date) {
  return request.post('/flights/sync', null, { params: { date } })
}
