import request from './request'

export function login(data, config = {}) {
  return request.post('/auth/login', data, {
    silent: true,
    skipAuthRefresh: true,
    ...config
  })
}

export function logout(refreshToken) {
  return request.post('/auth/logout', { refreshToken }, {
    silent: true,
    skipAuthRefresh: true
  })
}
