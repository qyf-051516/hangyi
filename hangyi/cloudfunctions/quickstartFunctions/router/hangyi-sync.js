/**
 * hangyi-sync.js - Hangyi 统一认证 & 跨端数据同步
 * 涵盖：verifyHangyiToken、syncDataToHangyi
 */
const {
  db, SETTINGS_KEYS,
  ok, fail, callHangyiService,
  getSettingValue, requireAdmin,
} = require("../utils");

const SYNC_ENDPOINTS = Object.freeze({
  staff: "/api/sync/staff",
  flights: "/api/sync/flights",
  schedules: "/api/sync/schedules",
  swap_requests: "/api/sync/swap-requests",
  leave_requests: "/api/sync/leave-requests",
  operation_logs: "/api/sync/operation-logs",
});

// 单集合全量拉取与单次推送的保护上限：集合过大时拒绝全量同步，
// 避免云函数超时或后端被超大请求打垮。
const MAX_FETCH_RECORDS = 10000;
const SYNC_BATCH_SIZE = 200;

// ──────────────────────────────────────────────
// 分页拉取集合全部数据（同步到 Web 端用）
// ──────────────────────────────────────────────
const fetchAllFromCollection = async (collectionName) => {
  const all = [];
  const pageSize = 100;
  let offset = 0;
  while (true) {
    const res = await db.collection(collectionName)
      .orderBy("_id", "asc")
      .skip(offset)
      .limit(pageSize)
      .get();
    if (!res.data.length) break;
    all.push(...res.data);
    offset += res.data.length;
    if (all.length > MAX_FETCH_RECORDS) {
      throw new Error(`集合 ${collectionName} 超过 ${MAX_FETCH_RECORDS} 条上限，请改用增量同步`);
    }
  }
  return all;
};

// ──────────────────────────────────────────────
// 校验 Hangyi token 是否有效
// ──────────────────────────────────────────────
const verifyHangyiToken = async (event) => {
  const rawToken = (event.data || {}).token;
  if (!rawToken || typeof rawToken !== "string") return fail("token is required", 400);
  const token = rawToken.trim();

  // P2 修复: callHangyiService 现在返回 {ok, statusCode, body, error}
  const result = await callHangyiService(
    "/api/auth/verify",
    null,
    "GET",
    { "Authorization": `Bearer ${token}` }
  );

  if (!result || !result.ok) return fail(`Hangyi认证服务不可用: ${result && result.error || "no response"}`, 503);
  const body = result.body || {};
  if (body.code !== 200) return fail(body.msg || "token无效", 401);
  return ok(body.data, "token验证成功");
};

// ──────────────────────────────────────────────
// 同步数据到 Hangyi 后端
// 鉴权: 1) settings 表 HANGYI_SYNC_ENABLED 必须为 "true"
//       2) 调用方必须是 admin（双向同步会冲后端数据，不能让普通员工触发）
//       3) 必须传 token 并能通过 Hangyi 端 verifyHangyiToken 验证
// ──────────────────────────────────────────────
const syncDataToHangyi = async (event) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const enabled = await getSettingValue(SETTINGS_KEYS.HANGYI_SYNC_ENABLED, "false");
  if (String(enabled) !== "true") return fail("Hangyi同步未启用", 400);

  const { collections, token } = event.data || {};
  if (typeof token !== "string" || !token.trim()) return fail("缺少 token 参数", 400);
  // 复用 verifyHangyiToken 的逻辑：先验 token 有效性
  const verifyResult = await callHangyiService(
    "/api/auth/verify",
    null,
    "GET",
    { "Authorization": `Bearer ${token}` }
  );
  if (!verifyResult || !verifyResult.ok || (verifyResult.body || {}).code !== 200) {
    return fail("Hangyi token 验证失败", 401);
  }

  if (collections != null && !Array.isArray(collections)) {
    return fail("collections 必须是数组", 400);
  }
  const requestedCollections = collections || Object.keys(SYNC_ENDPOINTS);
  if (!requestedCollections.every((item) => typeof item === "string" && SYNC_ENDPOINTS[item])) {
    return fail("包含不支持的同步集合", 400);
  }
  const targetCollections = [...new Set(requestedCollections)];

  const results = {};
  for (const col of targetCollections) {
    try {
      const data = await fetchAllFromCollection(col);
      const totalCount = data.length;
      // 分批推送，避免单次请求体过大；任一批失败即标记该集合失败
      let status = "ok";
      let msg = "";
      let httpStatus = 0;
      for (let i = 0; i < data.length; i += SYNC_BATCH_SIZE) {
        const batch = data.slice(i, i + SYNC_BATCH_SIZE);
        const result = await callHangyiService(SYNC_ENDPOINTS[col], batch);
        const rBody = result && result.body;
        httpStatus = result ? result.statusCode : 0;
        if (!result || !result.ok || !rBody || rBody.code !== 200) {
          status = "failed";
          msg = rBody ? rBody.msg : (result ? result.error : "no response");
          break;
        }
      }
      results[col] = {
        count: totalCount,
        status,
        msg: status === "ok" ? "ok" : msg,
        httpStatus,
      };
    } catch (e) {
      results[col] = { count: 0, status: "error", error: e.message };
    }
  }
  const failedCollections = Object.entries(results)
    .filter(([, result]) => result.status !== "ok")
    .map(([collection]) => collection);
  if (failedCollections.length) {
    return fail("同步部分失败，请修复后重试", 502, {
      results,
      failedCollections,
      successCount: targetCollections.length - failedCollections.length,
      totalCount: targetCollections.length,
    });
  }
  return ok({
    results,
    failedCollections: [],
    successCount: targetCollections.length,
    totalCount: targetCollections.length,
  }, "同步完成");
};

// ──────────────────────────────────────────────
// 路由表
// ──────────────────────────────────────────────
module.exports = {
  verifyHangyiToken,
  syncDataToHangyi,
};
