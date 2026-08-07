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
// 同名 action 由后 require 的覆盖（router 内部已确保 action 名无重复）
const allRouters = Object.assign(
  {},
  bootstrapRouter,
  authRouter,
  scheduleRouter,
  flightRouter,
  swapRouter,
  notificationRouter,
  adminRouter,
  settingsRouter,
  logRouter,
  realtimeRouter,
  hangyiSyncRouter,
  leaveRouter,
  assistantRouter
);

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
