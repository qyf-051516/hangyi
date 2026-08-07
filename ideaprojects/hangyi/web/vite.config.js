import { resolve } from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolveViteRuntime } from './src/config/runtime.js'

export default defineConfig(({ mode }) => {
  const envDir = resolve(process.cwd(), '..')
  const env = {
    ...loadEnv(mode, envDir, ''),
    ...process.env
  }
  const { gatewayTarget, devPort, previewPort } = resolveViteRuntime(env)

  return {
    envDir,
    plugins: [vue()],
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.js',
      clearMocks: true,
      restoreMocks: true,
      environmentOptions: {
        jsdom: {
          url: 'http://localhost/'
        }
      }
    },
    server: {
      port: devPort,
      strictPort: true,
      proxy: createApiProxy(gatewayTarget)
    },
    preview: {
      port: previewPort,
      strictPort: true,
      proxy: createApiProxy(gatewayTarget)
    }
  }
})

function createApiProxy(gatewayTarget) {
  return {
    '/api': {
      target: gatewayTarget,
      changeOrigin: true
    }
  }
}
