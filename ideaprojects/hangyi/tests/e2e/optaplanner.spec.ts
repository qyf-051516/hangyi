import { test, expect } from '@playwright/test';

/**
 * Web 端智能排班 (OptaPlanner) E2E 测试
 *
 * 流程:
 *   1. 浏览器登录 web 端 (admin/123456)
 *   2. 跳转到 /#/service-schedule 页面，验证标题"勤务排班"
 *   3. 从 localStorage 拿 token，调网关 9000 的 smart 排班接口
 *   4. 验证响应里 solver.engine 包含 "optaplanner" 且 feasible=true
 */
const webBaseUrl = process.env.HANGYI_WEB_URL
  || `http://localhost:${process.env.VITE_DEV_PORT || '5173'}`;
const gatewayBaseUrl = process.env.HANGYI_GATEWAY_URL
  || process.env.VITE_API_TARGET
  || `http://${process.env.GATEWAY_HOST || 'localhost'}:${process.env.GATEWAY_PORT || '9000'}`;

test('web 智能排班 preview 调通 OptaPlanner', async ({ page, request }) => {
  // 1) 登录
  await page.goto(webBaseUrl);
  // el-input 渲染为 input，placeholder 是中文，按 placeholder 定位
  await page.getByPlaceholder('用户名').fill('admin');
  await page.getByPlaceholder('密码').fill('123456');
  await page.getByRole('button', { name: /登录/ }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 15000 });

  // 2) 跳勤务排班页
  await page.goto(`${webBaseUrl}/#/service-schedule`);
  await expect(page.locator('.page-heading')).toContainText('勤务排班');

  // 3) 拿 localStorage 里的 token (key 为 "token"，存的是 JWT 字符串)
  const token = await page.evaluate(() => localStorage.getItem('token') || '');
  expect(token).not.toBe('');

  // 4) 调网关 smart 排班接口 (preview=true 不入库；2026-06-17 有真实航班 114-123)
  const res = await request.post(`${gatewayBaseUrl}/api/schedules/smart`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { scheduleDate: '2026-06-17', flightIds: [114, 115, 116], preview: true },
  });
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(body.code).toBe(200);
  expect(body.data.solver).toBeDefined();
  expect(body.data.solver.engine).toContain('optaplanner');
  expect(body.data.solver.feasible).toBe(true);
});
