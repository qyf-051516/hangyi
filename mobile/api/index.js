// UniApp API 封装
const BASE_URL = 'http://localhost:8080/api'

function getToken() {
  return uni.getStorageSync('token')
}

function request(method, url, data = {}, options = {}) {
  return new Promise((resolve, reject) => {
    const token = getToken()
    const header = { 'Content-Type': 'application/json' }
    if (token) {
      header['Authorization'] = 'Bearer ' + token
    }

    uni.request({
      url: BASE_URL + url,
      method,
      data,
      header,
      ...options,
      success: (res) => {
        if (res.statusCode === 401) {
          uni.removeStorageSync('token')
          uni.reLaunch({ url: '/pages/login/login' })
          reject(new Error('登录已过期'))
          return
        }
        if (res.data.code === 200) {
          resolve(res.data.data)
        } else {
          uni.showToast({ title: res.data.msg || '请求失败', icon: 'none' })
          reject(res.data.msg)
        }
      },
      fail: (err) => {
        uni.showToast({ title: '网络异常', icon: 'none' })
        reject(err)
      }
    })
  })
}

export default {
  // ========== 认证 ==========
  login(username, password) {
    return request('POST', '/auth/login', { username, password })
  },

  // ========== 排班 ==========
  getTodaySchedule(groupId) {
    const date = new Date().toISOString().slice(0, 10)
    return request('GET', '/schedules/by-date', { date, groupId })
  },

  getMySchedule(employeeId) {
    const date = new Date().toISOString().slice(0, 10)
    return request('GET', '/schedules/by-date', { date })
  },

  getScheduleByDate(date) {
    return request('GET', '/schedules/by-date', { date })
  },

  // ========== 换班 ==========
  createSwap(data) {
    return request('POST', '/schedule-changes', data)
  },

  getMySwaps(employeeId) {
    return request('GET', '/schedule-changes/page', { employeeId, size: 999 })
  },

  // ========== 请假 ==========
  createLeave(data) {
    return request('POST', '/leaves', data)
  },

  getMyLeaves(employeeId) {
    return request('GET', '/leaves/page', { employeeId, size: 999 })
  },

  // ========== 员工 ==========
  getEmployeeList() {
    return request('GET', '/employees/page', { page: 1, size: 999 })
  }
}
