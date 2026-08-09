/**
 * quickstartFunctions 入口
 * 原 4565 行单体已按业务域拆分为 router/ 下的 13 个模块
 * 本文件只负责：require 所有 router + 合并路由表 + 按 event.type 分发
 */
const { fail, withInvocationContext } = require("./utils");

// 业务域路由
const authRouter         = require("./router/auth");
const bootstrapRouter    = require("./router/bootstrap");
const scheduleRouter     = require("./router/schedule");
const flightRouter       = require("./router/flight");
const swapRouter         = require("./router/swap");
const notificationRouter = require("./router/notification");
const adminRouter        = require("./router/admin");
const settingsRouter     = require("./router/settings");
const logRouter          = require("./router/log");
const realtimeRouter     = require("./router/realtime");
const hangyiSyncRouter   = require("./router/hangyi-sync");
const leaveRouter        = require("./router/leave");
const assistantRouter    = require("./router/assistant");

// 合并路由表：action_type -> handler
// 检测同名 action 冲突,避免静默覆盖导致某入口失效(审查 M4)
const routerSources = [
  bootstrapRouter, authRouter, scheduleRouter, flightRouter, swapRouter,
  notificationRouter, adminRouter, settingsRouter, logRouter,
  realtimeRouter, hangyiSyncRouter, leaveRouter, assistantRouter,
];
const allRouters = {};
for (const source of routerSources) {
  for (const actionName of Object.keys(source)) {
    if (Object.prototype.hasOwnProperty.call(allRouters, actionName)) {
      console.error(`[ROUTE CONFLICT] action "${actionName}" 被多个 router 导出,已忽略后加载的 ${source.name || "router"}`);
      continue;
    }
    allRouters[actionName] = source[actionName];
  }
}

exports.main = async (event, context) => {
  return withInvocationContext(context, async () => {
    try {
      const { type } = event || {};
      const handler = allRouters[type];
      if (!handler) {
        return fail(`未知操作类型: ${String(type || "")}`, 400);
      }
      return await handler(event, context);
    } catch (error) {
      console.error("[quickstartFunctions] handler failed", {
        type: event && event.type,
        message: error && error.message,
        stack: error && error.stack,
      });
      return fail("服务暂时不可用，请稍后重试", 500);
    }
  });
};
