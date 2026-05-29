import request from './request'

export const createSwapRequest = (data) => request.post('/swap/requests', data)
export const createSwapApplication = (data) => request.post('/swap/applications', data)
export const listSwapRequests = (params) => request.get('/swap/requests', { params })
export const approveSwapRequest = (id, data) => request.post(`/swap/requests/${id}/approve`, data)
export const listNotifications = () => request.get('/notifications')
export const markNotificationsRead = () => request.put('/notifications/read')
