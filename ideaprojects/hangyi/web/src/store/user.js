import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useUserStore = defineStore('user', () => {
  const token = ref(localStorage.getItem('token') || '')
  const refreshToken = ref(localStorage.getItem('refreshToken') || '')
  const userId = ref(localStorage.getItem('userId') || '')
  const username = ref(localStorage.getItem('username') || '')
  const realName = ref(localStorage.getItem('realName') || '')
  const roles = ref(readRolesFromToken(token.value))

  function setLogin(resp) {
    if (!resp?.token) {
      throw new Error('登录响应缺少访问令牌')
    }
    token.value = resp.token
    roles.value = readRolesFromToken(resp.token)
    refreshToken.value = resp.refreshToken || ''
    userId.value = resp.userId == null ? '' : String(resp.userId)
    username.value = resp.username || ''
    realName.value = resp.realName || ''
    localStorage.setItem('token', resp.token)
    persistOptional('refreshToken', refreshToken.value)
    persistOptional('userId', userId.value)
    persistOptional('username', username.value)
    persistOptional('realName', realName.value)
  }

  function updateToken(nextToken) {
    if (!nextToken) return
    token.value = nextToken
    roles.value = readRolesFromToken(nextToken)
    localStorage.setItem('token', nextToken)
  }

  function updateRefreshToken(nextToken) {
    if (!nextToken) return
    refreshToken.value = nextToken
    localStorage.setItem('refreshToken', nextToken)
  }

  function hasAnyRole(...allowedRoles) {
    return allowedRoles.some(role => roles.value.includes(normalizeRole(role)))
  }

  function logout() {
    token.value = ''
    refreshToken.value = ''
    userId.value = ''
    username.value = ''
    realName.value = ''
    roles.value = []
    localStorage.removeItem('token')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('userId')
    localStorage.removeItem('username')
    localStorage.removeItem('realName')
  }

  function persistOptional(key, value) {
    if (value) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  }

  return {
    token,
    refreshToken,
    userId,
    username,
    realName,
    roles,
    setLogin,
    updateToken,
    updateRefreshToken,
    hasAnyRole,
    logout
  }
})

function readRolesFromToken(token) {
  if (!token) return []

  try {
    const payloadPart = token.split('.')[1]
    if (!payloadPart) return []

    const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    const payload = JSON.parse(atob(padded))
    if (!Array.isArray(payload.roles)) return []

    return [...new Set(payload.roles.map(normalizeRole).filter(Boolean))]
  } catch {
    return []
  }
}

function normalizeRole(role) {
  return String(role || '').trim().toUpperCase().replace(/^ROLE_/, '')
}
