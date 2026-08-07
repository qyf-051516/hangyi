import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  instances: [],
  message: vi.fn(),
  updateToken: vi.fn(),
  updateRefreshToken: vi.fn(),
  logout: vi.fn()
}))

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => {
      const instance = vi.fn(config => Promise.resolve(config))
      instance.post = vi.fn()
      instance.interceptors = {
        request: {
          use: vi.fn(handler => {
            instance.requestHandler = handler
          })
        },
        response: {
          use: vi.fn((fulfilled, rejected) => {
            instance.responseFulfilled = fulfilled
            instance.responseRejected = rejected
          })
        }
      }
      mocks.instances.push(instance)
      return instance
    })
  }
}))

vi.mock('element-plus', () => ({
  ElMessage: mocks.message
}))

vi.mock('../store/user', () => ({
  useUserStore: () => ({
    updateToken: mocks.updateToken,
    updateRefreshToken: mocks.updateRefreshToken,
    logout: mocks.logout
  })
}))

describe('request client', () => {
  let requestClient
  let refreshClient

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    localStorage.clear()
    mocks.instances.length = 0

    const requestModule = await import('./request')
    requestClient = requestModule.default
    ;[requestClient, refreshClient] = mocks.instances
  })

  it('attaches the latest access token to outgoing requests', () => {
    localStorage.setItem('token', 'access-token')

    expect(requestClient.requestHandler({ headers: {} })).toEqual({
      headers: {
        Authorization: 'Bearer access-token'
      }
    })
  })

  it('shares one refresh request across concurrent 401 responses', async () => {
    localStorage.setItem('refreshToken', 'refresh-token')
    refreshClient.post.mockResolvedValue({
      data: {
        code: 200,
        data: { token: 'renewed-token', refreshToken: 'rotated-refresh-token' }
      }
    })

    const firstRetry = requestClient.responseFulfilled({
      data: { code: 401 },
      config: { url: '/employees', headers: {} }
    })
    const secondRetry = requestClient.responseFulfilled({
      data: { code: 401 },
      config: { url: '/schedules', headers: {} }
    })

    const retriedConfigs = await Promise.all([firstRetry, secondRetry])

    expect(refreshClient.post).toHaveBeenCalledTimes(1)
    expect(refreshClient.post).toHaveBeenCalledWith('/auth/refresh', null, {
      headers: { Authorization: 'Bearer refresh-token' }
    })
    expect(mocks.updateToken).toHaveBeenCalledOnce()
    expect(mocks.updateToken).toHaveBeenCalledWith('renewed-token')
    expect(mocks.updateRefreshToken).toHaveBeenCalledWith('rotated-refresh-token')
    expect(requestClient).toHaveBeenCalledTimes(2)
    expect(retriedConfigs).toEqual([
      {
        url: '/employees',
        headers: { Authorization: 'Bearer renewed-token' },
        _retry: true
      },
      {
        url: '/schedules',
        headers: { Authorization: 'Bearer renewed-token' },
        _retry: true
      }
    ])
  })

  it('returns structured business errors without showing a silent toast', async () => {
    await expect(requestClient.responseFulfilled({
      data: { code: 403, msg: '当前账号无权操作', data: { resource: 'schedule' } },
      config: { silent: true }
    })).rejects.toMatchObject({
      message: '当前账号无权操作',
      code: 403,
      data: { resource: 'schedule' }
    })

    expect(mocks.message).not.toHaveBeenCalled()
  })

  it('normalizes server failures into a user-facing message', async () => {
    await expect(requestClient.responseRejected({
      config: {},
      response: { status: 503, data: {} }
    })).rejects.toMatchObject({
      message: '服务暂时不可用，请稍后重试',
      code: 503
    })

    expect(mocks.message).toHaveBeenCalledWith({
      message: '服务暂时不可用，请稍后重试',
      type: 'error',
      offset: 76,
      duration: 3200
    })
  })

  it('explains throttling and deadline responses instead of showing a generic failure', async () => {
    await expect(requestClient.responseRejected({
      config: { silent: true },
      response: { status: 429, data: {} }
    })).rejects.toMatchObject({
      message: '请求过于频繁，请稍后再试',
      code: 429
    })

    await expect(requestClient.responseRejected({
      config: { silent: true },
      response: { status: 408, data: {} }
    })).rejects.toMatchObject({
      message: '请求超时，请稍后重试',
      code: 408
    })
  })

  it('preserves the business code and data from non-2xx responses', async () => {
    await expect(requestClient.responseRejected({
      config: { silent: true },
      response: {
        status: 422,
        data: { code: 422, msg: '排班约束不满足', data: { hardScore: -1 } }
      }
    })).rejects.toMatchObject({
      message: '排班约束不满足',
      code: 422,
      data: { hardScore: -1 }
    })
  })
})
