import axios from 'axios'
import { ElMessage } from 'element-plus'
import { useUserStore } from '../store/user'

const request = axios.create({
  baseURL: '/api',
  timeout: 30000
})

const refreshClient = axios.create({
  baseURL: '/api',
  timeout: 15000
})

const TOAST_DEDUPE_WINDOW_MS = 5000
const toastDedupeMap = new Map()

let refreshPromise = null
let authFailureHandled = false

request.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

request.interceptors.response.use(
  async response => {
    const payload = response.data
    if (!payload || payload.code == null || payload.code === 200) {
      if (String(response.config?.url || '').includes('/auth/login')) {
        authFailureHandled = false
      }
      return payload
    }

    if (payload.code === 401 && !response.config.skipAuthRefresh) {
      return retryAfterRefresh(response.config)
    }

    const error = createBusinessError(payload)
    if (!response.config.silent) showErrorMessage(error.message)
    return Promise.reject(error)
  },
  async error => {
    const config = error.config || {}
    if (error.response?.status === 401 && !config.skipAuthRefresh) {
      return retryAfterRefresh(config)
    }

    const friendlyError = normalizeTransportError(error)
    if (!config.silent) showErrorMessage(friendlyError.message)
    return Promise.reject(friendlyError)
  }
)

async function retryAfterRefresh(config = {}) {
  const requestUrl = String(config.url || '')
  const cannotRefresh = config._retry ||
    config.skipAuthRefresh ||
    requestUrl.includes('/auth/login') ||
    requestUrl.includes('/auth/refresh')

  if (cannotRefresh || !localStorage.getItem('refreshToken')) {
    handleAuthFailure()
    return Promise.reject(createAuthError())
  }

  config._retry = true

  try {
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null
      })
    }
    const token = await refreshPromise
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${token}`
    return request(config)
  } catch (error) {
    handleAuthFailure()
    return Promise.reject(error)
  }
}

async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('refreshToken')
  if (!refreshToken) throw createAuthError()

  const response = await refreshClient.post('/auth/refresh', null, {
    headers: { Authorization: `Bearer ${refreshToken}` }
  })
  const payload = response.data
  const token = payload?.code === 200 ? payload.data?.token : null
  const nextRefreshToken = payload?.code === 200 ? payload.data?.refreshToken : null

  if (!token || !nextRefreshToken) {
    throw createAuthError(payload?.msg)
  }

  updateTokens(token, nextRefreshToken)
  authFailureHandled = false
  return token
}

function handleAuthFailure() {
  if (authFailureHandled) return
  authFailureHandled = true

  clearAuthStorage()
  showErrorMessage('登录状态已过期，请重新登录')

  const currentRoute = window.location.hash.replace(/^#/, '') || '/dashboard'
  const redirectQuery = currentRoute.startsWith('/login')
    ? ''
    : `?redirect=${encodeURIComponent(currentRoute)}`
  const targetHash = `#/login${redirectQuery}`

  if (window.location.hash !== targetHash) {
    window.location.replace(`/${targetHash}`)
  }
}

function clearAuthStorage() {
  try {
    useUserStore().logout()
    return
  } catch {
    // 请求可能早于 Pinia 初始化，继续执行存储兜底清理。
  }
  for (const key of ['token', 'refreshToken', 'userId', 'username', 'realName']) {
    localStorage.removeItem(key)
  }
}

function updateTokens(token, refreshToken) {
  try {
    useUserStore().updateToken(token)
    useUserStore().updateRefreshToken(refreshToken)
  } catch {
    localStorage.setItem('token', token)
    localStorage.setItem('refreshToken', refreshToken)
  }
}

function createBusinessError(payload) {
  const error = new Error(payload.msg || '请求未能完成')
  error.code = payload.code
  error.data = payload.data
  return error
}

function createAuthError(message = '登录状态已过期，请重新登录') {
  const error = new Error(message)
  error.code = 401
  return error
}

function normalizeTransportError(error) {
  const serverMessage = error.response?.data?.msg
  let message = serverMessage

  if (!message && error.code === 'ECONNABORTED') {
    message = '请求超时，请稍后重试'
  } else if (!message && error.response?.status === 408) {
    message = '请求超时，请稍后重试'
  } else if (!message && error.response?.status === 429) {
    message = '请求过于频繁，请稍后再试'
  } else if (!message && !error.response) {
    message = '暂时无法连接服务，请检查网络后重试'
  } else if (!message && error.response?.status === 403) {
    message = '当前账号没有此操作权限'
  } else if (!message && error.response?.status === 404) {
    message = '请求的服务不存在或已调整'
  } else if (!message && error.response?.status >= 500) {
    message = '服务暂时不可用，请稍后重试'
  }

  const normalized = new Error(message || '请求失败，请稍后重试')
  normalized.code = error.response?.data?.code || error.response?.status || error.code
  normalized.data = error.response?.data?.data
  normalized.cause = error
  return normalized
}

function showErrorMessage(message) {
  if (!message) return

  const now = Date.now()
  for (const [text, timestamp] of toastDedupeMap.entries()) {
    if (now - timestamp >= TOAST_DEDUPE_WINDOW_MS) {
      toastDedupeMap.delete(text)
    }
  }

  const lastShownAt = toastDedupeMap.get(message)
  if (lastShownAt && now - lastShownAt < TOAST_DEDUPE_WINDOW_MS) return

  toastDedupeMap.set(message, now)
  ElMessage({
    message,
    type: 'error',
    offset: 76,
    duration: 3200
  })
}

export default request
