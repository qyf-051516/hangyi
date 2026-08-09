/**
 * assistant.js - 小程序智能助手安全代理
 * 小程序只调用云函数，Java 助手地址和内部密钥均从 settings 集合读取。
 */
const https = require("https");
const crypto = require("crypto");
const {
  db, COLLECTIONS, SETTINGS_KEYS,
  ok, fail, getOpenContext, logOperation,
} = require("../utils");
const { buildLocalAnswer } = require("./assistant-local");

const VALID_MODES = ["KNOWLEDGE_ONLY", "KNOWLEDGE_AND_LIVE"];
const VALID_RATINGS = ["UP", "DOWN"];
const MAX_RESPONSE_BYTES = 1024 * 1024;
// Java 端会在 deadlineAt 前主动停止外部检索/大模型调用。
// 云函数 HTTP 超时稍长于业务截止时间，保证 Java 有时间返回可控的超时结果，
// 避免小程序已降级但 Java 仍在生成、扣配额或写入历史。
const ASSISTANT_DEADLINE_BUDGET_MS = 17000;
const ASSISTANT_HTTP_TIMEOUT_MS = 20000;
const ASK_WINDOW_LIMIT = 10;
const ASK_WINDOW_MS = 60 * 1000;
const ASK_DAILY_LIMIT = 200;
const HISTORY_WINDOW_LIMIT = 30;
const HISTORY_WINDOW_MS = 60 * 1000;

// 云函数实例之间不共享内存，不能把该 Map 当作计费系统；它的职责是在最靠近
// 外部 RAG 调用的位置快速熔断突发请求。日配额同时限制单个热实例上的滥用，
// Java 服务仍需保留自己的身份级限流作为跨实例兜底。
const rateLimitBuckets = new Map();

const pruneRateLimitBuckets = (now) => {
  if (rateLimitBuckets.size < 500) return;
  for (const [key, item] of rateLimitBuckets.entries()) {
    if (now - item.lastSeenAt > 2 * 24 * 60 * 60 * 1000) rateLimitBuckets.delete(key);
  }
};

const consumeRateLimit = ({ openid, scope, windowLimit, windowMs, dailyLimit }) => {
  const now = Date.now();
  pruneRateLimitBuckets(now);
  const dayKey = new Date(now).toISOString().slice(0, 10);
  const key = `${scope}:${openid}`;
  const current = rateLimitBuckets.get(key) || {
    windowStartedAt: now,
    windowCount: 0,
    dayKey,
    dailyCount: 0,
    lastSeenAt: now,
  };
  if (current.dayKey !== dayKey) {
    current.dayKey = dayKey;
    current.dailyCount = 0;
  }
  if (now - current.windowStartedAt >= windowMs) {
    current.windowStartedAt = now;
    current.windowCount = 0;
  }
  current.lastSeenAt = now;
  const retryAfterSeconds = Math.max(1, Math.ceil((current.windowStartedAt + windowMs - now) / 1000));
  if (current.windowCount >= windowLimit) {
    rateLimitBuckets.set(key, current);
    return { allowed: false, reason: "WINDOW", retryAfterSeconds, remainingQuota: Math.max(0, dailyLimit - current.dailyCount) };
  }
  if (current.dailyCount >= dailyLimit) {
    rateLimitBuckets.set(key, current);
    return { allowed: false, reason: "DAILY", retryAfterSeconds: 0, remainingQuota: 0 };
  }
  current.windowCount += 1;
  current.dailyCount += 1;
  rateLimitBuckets.set(key, current);
  return {
    allowed: true,
    retryAfterSeconds: 0,
    remainingQuota: Math.max(0, dailyLimit - current.dailyCount),
  };
};

const normalizeQuestion = (rawQuestion) => String(rawQuestion || "")
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
  .replace(/[\u200B-\u200D\uFEFF]/g, "")
  .replace(/\s+/g, " ")
  .trim();

const isPromptInjectionAttempt = (question) => /(?:ignore|disregard|忽略|无视).{0,40}(?:previous|prior|上述|之前|指令)|(?:system\s*prompt|系统提示词|开发者指令|developer\s*message)|(?:reveal|show|泄露|展示).{0,30}(?:prompt|提示词|指令)/i.test(question);

const newAssistantRequestId = () => (
  `wx-${Date.now().toString(36)}-${crypto.randomBytes(8).toString("hex")}`
);

const getAssistantConfig = async () => {
  const keys = [
    SETTINGS_KEYS.ASSISTANT_API_URL,
    SETTINGS_KEYS.ASSISTANT_API_KEY,
    SETTINGS_KEYS.ASSISTANT_ENABLED,
  ];
  const res = await db.collection(COLLECTIONS.SETTINGS)
    .where({ key: db.command.in(keys) })
    .limit(keys.length)
    .get();
  const values = {};
  for (const item of res.data || []) values[item.key] = item.value;
  return {
    baseUrl: typeof values[SETTINGS_KEYS.ASSISTANT_API_URL] === "string"
      ? values[SETTINGS_KEYS.ASSISTANT_API_URL].trim()
      : "",
    apiKey: typeof values[SETTINGS_KEYS.ASSISTANT_API_KEY] === "string"
      ? values[SETTINGS_KEYS.ASSISTANT_API_KEY].trim()
      : "",
    enabled: String(values[SETTINGS_KEYS.ASSISTANT_ENABLED] || "false") === "true",
  };
};

const requireActiveStaff = async () => {
  const { openid } = getOpenContext();
  if (!openid) return { response: fail("当前未登录", 401) };
  const res = await db.collection(COLLECTIONS.STAFF)
    .where({ openid })
    .limit(1)
    .get();
  const staff = res.data && res.data[0];
  if (!staff) return { response: fail("请先登录后使用智能助手", 401) };
  if (staff.active === false) return { response: fail("当前账号已停用", 403) };
  return { openid, staff };
};

const isPrivateHostname = (hostname) => {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    return true;
  }
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")) {
    return true;
  }
  const parts = host.split(".");
  if (parts.length !== 4 || !parts.every((part) => /^\d{1,3}$/.test(part))) return false;
  const nums = parts.map(Number);
  if (nums.some((num) => num < 0 || num > 255)) return true;
  return nums[0] === 10
    || nums[0] === 127
    || (nums[0] === 169 && nums[1] === 254)
    || (nums[0] === 172 && nums[1] >= 16 && nums[1] <= 31)
    || (nums[0] === 192 && nums[1] === 168);
};

const buildTargetUrl = (baseUrl, path) => {
  let base;
  try {
    base = new URL(baseUrl);
  } catch (error) {
    throw Object.assign(new Error("助手服务地址配置无效"), { statusCode: 503 });
  }
  const isOriginOnly = (base.pathname === "/" || base.pathname === "")
    && !base.search
    && !base.hash
    && !base.username
    && !base.password;
  if (base.protocol !== "https:" || !isOriginOnly || isPrivateHostname(base.hostname)) {
    throw Object.assign(
      new Error("助手服务必须使用公网 HTTPS origin"),
      { statusCode: 503 }
    );
  }
  return new URL(path, base.origin);
};

const requestJson = (target, method, headers, body) => new Promise((resolve, reject) => {
  const payload = body == null ? "" : JSON.stringify(body);
  const req = https.request(target, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json; charset=utf-8",
      ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
      ...headers,
    },
    timeout: ASSISTANT_HTTP_TIMEOUT_MS,
  }, (res) => {
    const chunks = [];
    let size = 0;
    res.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_RESPONSE_BYTES) {
        req.destroy(new Error("助手响应过大"));
        return;
      }
      chunks.push(chunk);
    });
    res.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      let parsed = {};
      try {
        parsed = raw ? JSON.parse(raw) : {};
      } catch (error) {
        reject(new Error("助手服务返回了无效数据"));
        return;
      }
      if ((res.statusCode || 500) >= 400) {
        const err = new Error(parsed.msg || parsed.message || "助手服务请求失败");
        err.statusCode = res.statusCode;
        err.body = parsed;
        reject(err);
        return;
      }
      resolve(parsed);
    });
  });
  req.on("timeout", () => req.destroy(new Error("助手服务响应超时")));
  req.on("error", reject);
  if (payload) req.write(payload);
  req.end();
});

const callAssistant = async ({ config, path, method = "GET", staff, openid, body }) => {
  if (!config.enabled) throw Object.assign(new Error("智能助手尚未启用"), { statusCode: 403 });
  if (!config.baseUrl || !config.apiKey) {
    throw Object.assign(new Error("智能助手服务配置不完整"), { statusCode: 503 });
  }
  const target = buildTargetUrl(config.baseUrl, path);
  // 下游不得只信任可伪造的身份 header。使用与 Java 协定的 canonical
  // request 签名，覆盖方法、路径和查询参数、时间戳及云端派生身份。
  const timestamp = String(Date.now());
  const employeeNo = staff.employeeNo || "";
  const isAdmin = staff.isAdmin === true ? "true" : "false";
  const canonical = [
    String(method || "GET").toUpperCase(),
    `${target.pathname}${target.search}`,
    timestamp,
    openid,
    employeeNo,
    isAdmin,
  ].join("\n");
  const signature = crypto
    .createHmac("sha256", config.apiKey)
    .update(canonical, "utf8")
    .digest("hex");
  const headers = {
    "X-Internal-API-Key": config.apiKey,
    "X-Wechat-Openid": openid,
    "X-Wechat-Employee-No": employeeNo,
    "X-Wechat-Name": encodeURIComponent(staff.name || ""),
    "X-Wechat-Is-Admin": isAdmin,
    "X-Wechat-Timestamp": timestamp,
    "X-Wechat-Signature": signature,
  };

  const transport = typeof global !== "undefined" && global.__HANGYI_ASSISTANT_HTTP_REQUEST__;
  const response = transport
    ? await transport({ target: target.toString(), method, headers, body })
    : await requestJson(target, method, headers, body);

  if (!response || Number(response.code) !== 200) {
    const err = new Error((response && (response.msg || response.message)) || "助手服务返回失败");
    err.statusCode = Number(response && response.code) || 502;
    throw err;
  }
  return response.data;
};

const getAssistantStatus = async () => {
  const identity = await requireActiveStaff();
  if (identity.response) return identity.response;
  const config = await getAssistantConfig();
  if (!config.enabled) {
    // enabled 反映真实配置开关;本地知识可用性单独用 localKnowledgeAvailable 表达(审查 M6)
    return ok({
      enabled: false,
      configured: false,
      reachable: false,
      ready: false,
      engineEnabled: false,
      mode: "LOCAL_KNOWLEDGE",
      degraded: true,
      localKnowledgeAvailable: true,
      message: "内置业务知识可用（未启用在线引擎）",
    });
  }
  if (!config.baseUrl || !config.apiKey) {
    return ok({
      enabled: true,
      configured: false,
      reachable: true,
      ready: true,
      engineEnabled: true,
      mode: "LOCAL_KNOWLEDGE",
      degraded: true,
      message: "当前使用内置业务知识",
    });
  }
  try {
    const data = await callAssistant({
      config,
      path: "/api/assistant/internal/status",
      staff: identity.staff,
      openid: identity.openid,
    });
    if (!data || data.engineEnabled !== true || data.ready === false) {
      return ok({
        ...(data || {}),
        enabled: true,
        configured: true,
        reachable: true,
        ready: true,
        mode: "LOCAL_KNOWLEDGE",
        degraded: true,
        fallbackAvailable: true,
        message: "联网知识库引擎未启用，已切换内置业务知识",
      });
    }
    return ok({
      enabled: true,
      configured: true,
      reachable: true,
      ready: true,
      mode: "RAG",
      ...(data || {}),
    });
  } catch (error) {
    return ok({
      enabled: true,
      configured: true,
      reachable: false,
      ready: true,
      engineEnabled: true,
      mode: "LOCAL_KNOWLEDGE",
      degraded: true,
      message: "联网知识库暂不可用，已切换内置业务知识",
      externalMessage: error.message || "助手服务不可用",
    });
  }
};

const askAssistant = async (event) => {
  const payload = event.data || {};
  if (typeof payload.question !== "string") return fail("问题类型错误", 400);
  const question = normalizeQuestion(payload.question);
  if (!question) return fail("请输入问题", 400);
  if (question.length > 500) return fail("问题不能超过 500 字", 400);
  if (isPromptInjectionAttempt(question)) {
    return fail("问题包含不支持的指令性内容，请改用具体业务问题", 400);
  }

  let ragFallbackReason = ""; // RAG 降级原因,随审计记录便于运维(审查 M5)
  const mode = payload.mode == null ? "KNOWLEDGE_ONLY" : payload.mode;
  if (typeof mode !== "string" || !VALID_MODES.includes(mode)) {
    return fail("问答模式无效", 400);
  }
  const sessionId = payload.sessionId == null ? "" : payload.sessionId;
  if (typeof sessionId !== "string" || sessionId.length > 64) {
    return fail("会话标识格式错误", 400);
  }
  const rawRequestId = payload.requestId == null ? "" : payload.requestId;
  if (typeof rawRequestId !== "string" || rawRequestId.length > 64) {
    return fail("请求标识格式错误", 400);
  }
  const requestId = rawRequestId.trim() || newAssistantRequestId();
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(requestId)) {
    return fail("请求标识格式错误", 400);
  }

  const identity = await requireActiveStaff();
  if (identity.response) return identity.response;
  const quota = consumeRateLimit({
    openid: identity.openid,
    scope: "ask",
    windowLimit: ASK_WINDOW_LIMIT,
    windowMs: ASK_WINDOW_MS,
    dailyLimit: ASK_DAILY_LIMIT,
  });
  if (!quota.allowed) {
    const message = quota.reason === "DAILY"
      ? "今日智能助手问答额度已用完，请明日再试"
      : `请求过于频繁，请 ${quota.retryAfterSeconds} 秒后再试`;
    return fail(message, 429, {
      retryAfterSeconds: quota.retryAfterSeconds,
      remainingQuota: quota.remainingQuota,
    });
  }

  const config = await getAssistantConfig();
  if (config.enabled && config.baseUrl && config.apiKey) {
    try {
      const data = await callAssistant({
        config,
        path: "/api/assistant/internal/chat",
        method: "POST",
        staff: identity.staff,
        openid: identity.openid,
        body: {
          question,
          mode,
          sessionId: sessionId || null,
          requestId,
          deadlineAt: Date.now() + ASSISTANT_DEADLINE_BUDGET_MS,
        },
      });
      await logOperation("ASK_ASSISTANT", `${identity.staff.name || identity.staff.employeeNo} 使用智能助手问答`, {
        type: "assistant",
        employeeNo: identity.staff.employeeNo || "",
        requestId,
        mode,
        questionLength: question.length,
        answerMode: "RAG",
      });
      return ok({
        ...(data || {}),
        remainingQuota: quota.remainingQuota,
        retryAfterSeconds: quota.retryAfterSeconds,
      });
    } catch (error) {
      // 公网 RAG 不可用时继续使用内置知识，不让整个入口失效；但必须留痕便于运维定位(审查 M5)
      console.error("RAG fallback to local, reason:", error && error.message ? error.message : String(error));
      ragFallbackReason = String((error && error.statusCode) || (error && error.message) || error || "unknown");
    }
  }
  const localAnswer = buildLocalAnswer({
    question,
    isAdmin: identity.staff.isAdmin === true,
    sessionId,
  });
  await logOperation("ASK_ASSISTANT", `${identity.staff.name || identity.staff.employeeNo} 使用智能助手问答`, {
    type: "assistant",
    employeeNo: identity.staff.employeeNo || "",
    requestId,
    mode,
    questionLength: question.length,
    answerMode: "LOCAL_KNOWLEDGE",
    fallbackReason: ragFallbackReason || undefined,
  });
  return ok({
    ...localAnswer,
    remainingQuota: quota.remainingQuota,
    retryAfterSeconds: quota.retryAfterSeconds,
  });
};

const listAssistantHistory = async (event) => {
  const payload = event.data || {};
  const limit = payload.limit == null ? 20 : payload.limit;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    return fail("历史条数需在 1 至 50 之间", 400);
  }
  const identity = await requireActiveStaff();
  if (identity.response) return identity.response;
  const quota = consumeRateLimit({
    openid: identity.openid,
    scope: "history",
    windowLimit: HISTORY_WINDOW_LIMIT,
    windowMs: HISTORY_WINDOW_MS,
    dailyLimit: 1000,
  });
  if (!quota.allowed) {
    return fail(`历史读取过于频繁，请 ${quota.retryAfterSeconds} 秒后再试`, 429, {
      retryAfterSeconds: quota.retryAfterSeconds,
    });
  }
  const config = await getAssistantConfig();
  if (!config.enabled || !config.baseUrl || !config.apiKey) return ok([]);
  try {
    const data = await callAssistant({
      config,
      path: `/api/assistant/internal/history?limit=${limit}`,
      staff: identity.staff,
      openid: identity.openid,
    });
    return ok(data);
  } catch (error) {
    return ok([]);
  }
};

const submitAssistantFeedback = async (event) => {
  const payload = event.data || {};
  const messageId = typeof payload.messageId === "string" ? payload.messageId.trim() : "";
  const rating = typeof payload.rating === "string" ? payload.rating.trim().toUpperCase() : "";
  const comment = typeof payload.comment === "string" ? payload.comment.trim().slice(0, 500) : "";
  if (!messageId || messageId.length > 64) return fail("消息标识格式错误", 400);
  if (!VALID_RATINGS.includes(rating)) return fail("反馈类型无效", 400);

  const identity = await requireActiveStaff();
  if (identity.response) return identity.response;
  if (messageId.startsWith("local-message-")) {
    return ok({ accepted: true, localFallback: true });
  }
  const config = await getAssistantConfig();
  if (!config.enabled || !config.baseUrl || !config.apiKey) {
    return ok({ accepted: true, localFallback: true });
  }
  try {
    const data = await callAssistant({
      config,
      path: "/api/assistant/internal/feedback",
      method: "POST",
      staff: identity.staff,
      openid: identity.openid,
      body: { messageId, rating, comment },
    });
    return ok(data);
  } catch (error) {
    const upstreamCode = Number(error && error.statusCode);
    const statusCode = upstreamCode >= 400 && upstreamCode < 500 ? upstreamCode : 503;
    return fail(
      error && error.message ? `反馈提交失败：${error.message}` : "反馈提交失败",
      statusCode
    );
  }
};

module.exports = {
  getAssistantStatus,
  askAssistant,
  listAssistantHistory,
  submitAssistantFeedback,
};
