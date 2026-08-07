import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useUserStore } from './user'

function createToken(payload) {
  const encoded = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `header.${encoded}.signature`
}

describe('user store', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('normalizes and deduplicates roles from a JWT', () => {
    const store = useUserStore()
    store.setLogin({
      token: createToken({
        roles: ['ROLE_admin', ' team_leader ', 'ADMIN', '', null]
      }),
      username: 'admin'
    })

    expect(store.roles).toEqual(['ADMIN', 'TEAM_LEADER'])
    expect(store.hasAnyRole('role_admin')).toBe(true)
    expect(store.hasAnyRole('boss', 'team_leader')).toBe(true)
    expect(store.hasAnyRole('scheduler')).toBe(false)
  })

  it('falls back to no roles for malformed JWT payloads', () => {
    localStorage.setItem('token', 'not.a-valid-payload.signature')
    const store = useUserStore()

    expect(store.roles).toEqual([])
    expect(store.hasAnyRole('ADMIN')).toBe(false)
  })

  it('persists login data and clears optional empty values', () => {
    const store = useUserStore()
    store.setLogin({
      token: createToken({ roles: ['ADMIN'] }),
      refreshToken: '',
      userId: 42,
      username: 'admin',
      realName: '系统管理员'
    })

    expect(localStorage.getItem('token')).toBe(store.token)
    expect(localStorage.getItem('refreshToken')).toBeNull()
    expect(localStorage.getItem('userId')).toBe('42')
    expect(localStorage.getItem('realName')).toBe('系统管理员')
  })

  it('rejects login responses without an access token', () => {
    const store = useUserStore()

    expect(() => store.setLogin({ username: 'admin' }))
      .toThrow('登录响应缺少访问令牌')
    expect(localStorage.getItem('token')).toBeNull()
  })

  it('updates token roles and removes all authentication data on logout', () => {
    const store = useUserStore()
    store.setLogin({
      token: createToken({ roles: ['ADMIN'] }),
      refreshToken: 'refresh-token',
      username: 'admin'
    })

    store.updateToken(createToken({ roles: ['ROLE_BOSS'] }))
    store.updateRefreshToken('rotated-refresh-token')
    expect(store.roles).toEqual(['BOSS'])
    expect(store.refreshToken).toBe('rotated-refresh-token')
    expect(localStorage.getItem('refreshToken')).toBe('rotated-refresh-token')

    store.logout()
    expect(store.token).toBe('')
    expect(store.roles).toEqual([])
    expect(localStorage.length).toBe(0)
  })
})
