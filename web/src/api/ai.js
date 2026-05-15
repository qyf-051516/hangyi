import request from './request'

export function getSuggestions(data) {
  return request.post('/ai/scheduling-suggestions', data)
}

export function aiQuery(query) {
  return request.post('/ai/query', { query })
}

export function detectConflicts(data) {
  return request.post('/ai/conflict-detection', data)
}
