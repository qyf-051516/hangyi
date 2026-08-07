export const DEFAULT_RUNTIME = Object.freeze({
  devPort: 5173,
  previewPort: 9003,
  gatewayTarget: 'http://localhost:9000'
})

export function resolveViteRuntime(env = {}) {
  const gatewayPort = readPort(env.GATEWAY_PORT, 9000)
  const gatewayHost = env.GATEWAY_HOST || 'localhost'

  return {
    devPort: readPort(env.VITE_DEV_PORT, DEFAULT_RUNTIME.devPort),
    previewPort: readPort(env.VITE_PREVIEW_PORT, DEFAULT_RUNTIME.previewPort),
    gatewayTarget: env.VITE_API_TARGET || `http://${gatewayHost}:${gatewayPort}`
  }
}

function readPort(value, fallback) {
  const port = Number(value)
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : fallback
}
