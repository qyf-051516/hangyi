import { describe, expect, it } from 'vitest'
import { DEFAULT_RUNTIME, resolveViteRuntime } from './runtime'

describe('frontend runtime ports', () => {
  it('uses the project port matrix by default', () => {
    expect(resolveViteRuntime()).toEqual({
      devPort: 5173,
      previewPort: 9003,
      gatewayTarget: 'http://localhost:9000'
    })
  })

  it('allows explicit environment overrides', () => {
    expect(resolveViteRuntime({
      VITE_DEV_PORT: '15173',
      VITE_PREVIEW_PORT: '19003',
      VITE_API_TARGET: 'http://gateway.internal:19000'
    })).toEqual({
      devPort: 15173,
      previewPort: 19003,
      gatewayTarget: 'http://gateway.internal:19000'
    })
  })

  it('derives the proxy target from the shared gateway host and port', () => {
    expect(resolveViteRuntime({
      GATEWAY_HOST: 'gateway.internal',
      GATEWAY_PORT: '19000'
    }).gatewayTarget).toBe('http://gateway.internal:19000')
  })

  it('falls back when a configured port is invalid', () => {
    expect(resolveViteRuntime({
      VITE_DEV_PORT: '0',
      VITE_PREVIEW_PORT: 'not-a-port'
    })).toEqual(DEFAULT_RUNTIME)
  })
})
