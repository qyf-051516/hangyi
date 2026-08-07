import { describe, expect, it, vi } from 'vitest'
import { resolveAuthNavigation, safeRedirect } from './guards'

const resolveExistingRoute = value => ({
  matched: value === '/missing' ? [] : [{}],
  name: value === '/404' ? 'NotFound' : 'KnownRoute'
})

describe('route guards', () => {
  it('redirects unauthenticated users to login with the original path', () => {
    expect(resolveAuthNavigation(
      { meta: { requiresAuth: true }, fullPath: '/schedules?page=2' },
      '',
      resolveExistingRoute
    )).toEqual({
      name: 'Login',
      query: { redirect: '/schedules?page=2' }
    })
  })

  it('returns authenticated users from login to a safe internal route', () => {
    expect(resolveAuthNavigation(
      { name: 'Login', meta: {}, query: { redirect: '/schedules' } },
      'access-token',
      resolveExistingRoute
    )).toBe('/schedules')
  })

  it('falls back to dashboard for unsafe or unknown redirects', () => {
    for (const redirect of ['https://example.com', '//example.com', '/missing', '/404']) {
      expect(resolveAuthNavigation(
        { name: 'Login', meta: {}, query: { redirect } },
        'access-token',
        resolveExistingRoute
      )).toEqual({ name: 'Dashboard' })
    }
  })

  it('allows routes that do not require an authentication redirect', () => {
    const resolver = vi.fn(resolveExistingRoute)

    expect(resolveAuthNavigation(
      { name: 'Dashboard', meta: {}, query: {} },
      'access-token',
      resolver
    )).toBe(true)
    expect(resolver).not.toHaveBeenCalled()
  })

  it('accepts only existing internal redirect paths', () => {
    expect(safeRedirect('/dashboard', resolveExistingRoute)).toBe('/dashboard')
    expect(safeRedirect('dashboard', resolveExistingRoute)).toBeNull()
    expect(safeRedirect(null, resolveExistingRoute)).toBeNull()
    expect(safeRedirect('/dashboard', null)).toBeNull()
  })
})
