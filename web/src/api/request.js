import axios from 'axios'
import { ElMessage } from 'element-plus'

const request = axios.create({
  baseURL: '/api',
  timeout: 30000
})

// 请求拦截器：添加 JWT
request.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 响应拦截器：统一处理错误
request.interceptors.response.use(
  res => {
    if (res.data.code !== 200) {
      ElMessage.error(res.data.msg || '请求失败')
      return Promise.reject(res.data.msg)
    }
    return res.data
  },
  error => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/#/login'
      ElMessage.error('登录已过期，请重新登录')
    } else {
      ElMessage.error(error.message || '网络错误')
    }
    return Promise.reject(error)
  }
)

export default request
