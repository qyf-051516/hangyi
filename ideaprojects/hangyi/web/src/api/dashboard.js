import request from './request'

export function getDashboardStats(config = {}) {
  return request.get('/dashboard/stats', config)
}

/**
 * 系统健康检查
 * 后端路由: GET /api/dashboard/health
 * 预期返回: { backend, database, scheduler }，每项包含 status
 * 失败时由 Dashboard 端降级处理，并提供页面内重试入口
 */
export function getSystemHealth(config = {}) {
  return request.get('/dashboard/health', config)
}
