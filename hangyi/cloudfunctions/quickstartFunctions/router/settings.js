/**
 * settings.js - 配置项读写
 * 涵盖：getSchedulingConfig、updateSchedulingConfig、setSetting
 */
const cache = require("../cache");
const {
  SETTINGS_KEYS,
  ok, fail, logOperation,
  getSettingValue, setSettingValue,
  requireAdmin,
} = require("../utils");

// ──────────────────────────────────────────────
// 获取排班配置（带缓存）
// ──────────────────────────────────────────────
const getSchedulingConfig = async () => {
  const cached = cache.get("SETTINGS");
  if (cached) return ok(cached);

  const [
    fatigueMaxContinuousDays,
    servicePrepTimeMinutes,
    serviceWrapTimeMinutes,
    releasePrepTimeMinutes,
    releaseWrapTimeMinutes,
    serviceRequiredCount,
    releaseRequiredCount,
    minRestIntervalMinutes,
    maxConsecutiveNightShifts,
    maxDailyWorkHours,
    demoToolsEnabled,
  ] = await Promise.all([
    getSettingValue(SETTINGS_KEYS.FATIGUE_MAX_CONTINUOUS_DAYS, 3),
    getSettingValue(SETTINGS_KEYS.SERVICE_PREP_TIME_MINUTES, 30),
    getSettingValue(SETTINGS_KEYS.SERVICE_WRAP_TIME_MINUTES, 15),
    getSettingValue(SETTINGS_KEYS.RELEASE_PREP_TIME_MINUTES, 20),
    getSettingValue(SETTINGS_KEYS.RELEASE_WRAP_TIME_MINUTES, 10),
    getSettingValue(SETTINGS_KEYS.SERVICE_REQUIRED_COUNT, 2),
    getSettingValue(SETTINGS_KEYS.RELEASE_REQUIRED_COUNT, 1),
    getSettingValue(SETTINGS_KEYS.MIN_REST_INTERVAL_MINUTES, 30),
    getSettingValue(SETTINGS_KEYS.MAX_CONSECUTIVE_NIGHT_SHIFTS, 2),
    getSettingValue(SETTINGS_KEYS.MAX_DAILY_WORK_HOURS, 12),
    getSettingValue(SETTINGS_KEYS.DEMO_TOOLS_ENABLED, "false"),
  ]);
  const data = {
    fatigueMaxContinuousDays: Number(fatigueMaxContinuousDays),
    servicePrepTimeMinutes: Number(servicePrepTimeMinutes),
    serviceWrapTimeMinutes: Number(serviceWrapTimeMinutes),
    releasePrepTimeMinutes: Number(releasePrepTimeMinutes),
    releaseWrapTimeMinutes: Number(releaseWrapTimeMinutes),
    serviceRequiredCount: Number(serviceRequiredCount),
    releaseRequiredCount: Number(releaseRequiredCount),
    minRestIntervalMinutes: Number(minRestIntervalMinutes),
    maxConsecutiveNightShifts: Number(maxConsecutiveNightShifts),
    maxDailyWorkHours: Number(maxDailyWorkHours),
    demoToolsEnabled: String(demoToolsEnabled) === "true",
  };
  cache.set("SETTINGS", {}, data);
  return ok(data);
};

// ──────────────────────────────────────────────
// 更新排班疲劳阈值
// ──────────────────────────────────────────────
const updateSchedulingConfig = async (event) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const payload = event.data || {};
  const numericSpecs = {
    fatigueMaxContinuousDays: {
      key: SETTINGS_KEYS.FATIGUE_MAX_CONTINUOUS_DAYS,
      min: 1,
      max: 14,
      integer: true,
      label: "连续工作天数",
    },
    servicePrepTimeMinutes: {
      key: SETTINGS_KEYS.SERVICE_PREP_TIME_MINUTES,
      min: 0,
      max: 180,
      integer: true,
      label: "勤务提前到位时间",
    },
    serviceWrapTimeMinutes: {
      key: SETTINGS_KEYS.SERVICE_WRAP_TIME_MINUTES,
      min: 0,
      max: 180,
      integer: true,
      label: "勤务收尾时间",
    },
    releasePrepTimeMinutes: {
      key: SETTINGS_KEYS.RELEASE_PREP_TIME_MINUTES,
      min: 0,
      max: 180,
      integer: true,
      label: "放行提前到位时间",
    },
    releaseWrapTimeMinutes: {
      key: SETTINGS_KEYS.RELEASE_WRAP_TIME_MINUTES,
      min: 0,
      max: 180,
      integer: true,
      label: "放行收尾时间",
    },
    serviceRequiredCount: {
      key: SETTINGS_KEYS.SERVICE_REQUIRED_COUNT,
      min: 1,
      max: 10,
      integer: true,
      label: "每航班勤务人数",
    },
    releaseRequiredCount: {
      key: SETTINGS_KEYS.RELEASE_REQUIRED_COUNT,
      min: 1,
      max: 10,
      integer: true,
      label: "每航班放行人数",
    },
    minRestIntervalMinutes: {
      key: SETTINGS_KEYS.MIN_REST_INTERVAL_MINUTES,
      min: 0,
      max: 480,
      integer: true,
      label: "最小休息间隔",
    },
    maxConsecutiveNightShifts: {
      key: SETTINGS_KEYS.MAX_CONSECUTIVE_NIGHT_SHIFTS,
      min: 1,
      max: 7,
      integer: true,
      label: "连续夜班上限",
    },
    maxDailyWorkHours: {
      key: SETTINGS_KEYS.MAX_DAILY_WORK_HOURS,
      min: 1,
      max: 24,
      label: "单人日工时上限",
    },
  };

  const updates = {};
  for (const [field, spec] of Object.entries(numericSpecs)) {
    if (payload[field] === undefined) continue;
    const value = Number(payload[field]);
    if (
      !Number.isFinite(value) ||
      value < spec.min ||
      value > spec.max ||
      (spec.integer && !Number.isInteger(value))
    ) {
      return fail(`${spec.label}需在 ${spec.min} 到 ${spec.max} 之间`, 400);
    }
    updates[field] = value;
  }
  if (payload.demoToolsEnabled !== undefined) {
    if (typeof payload.demoToolsEnabled !== "boolean") {
      return fail("演示工具开关格式错误", 400);
    }
    updates.demoToolsEnabled = payload.demoToolsEnabled;
  }
  if (!Object.keys(updates).length) return fail("没有可更新的排班配置", 400);

  await Promise.all(Object.entries(updates).map(([field, value]) => {
    if (field === "demoToolsEnabled") {
      return setSettingValue(SETTINGS_KEYS.DEMO_TOOLS_ENABLED, value ? "true" : "false");
    }
    return setSettingValue(numericSpecs[field].key, value);
  }));
  cache.invalidate("SETTINGS");
  cache.invalidate("STATS");
  const changedFields = Object.keys(updates);
  await logOperation(
    "UPDATE_CONFIG",
    `更新排班配置：${changedFields.join("、")}`,
    { type: "config", changedFields, values: updates }
  );
  return ok(updates, "排班配置已更新");
};

// ──────────────────────────────────────────────
// 通用：设置任意配置项
//  P0 修复: 任何登录用户都能改 hangyiApiKey / hangyiSyncEnabled 等敏感配置。
//    新实现: 必须 admin 鉴权；普通员工改配置只能走 updateSchedulingConfig 走白名单。
//    允许覆盖的 key 仍以 SETTINGS_KEYS 白名单为准，防止误写不存在的 key。
// ──────────────────────────────────────────────
const ALLOWED_SETTING_KEYS = new Set(Object.values(SETTINGS_KEYS));
const SENSITIVE_SETTING_KEYS = new Set([
  SETTINGS_KEYS.HANGYI_API_KEY,
  SETTINGS_KEYS.ASSISTANT_API_KEY,
]);
const SECRET_CONFIRM_TEXT = "UPDATE_SECRET";

const setSetting = async (event) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const payload = event.data || {};
  if (typeof payload.key !== "string") return fail("配置键名类型错误", 400);
  const key = payload.key.trim();
  const value = payload.value;
  if (!key) return fail("缺少配置键名", 400);
  if (!ALLOWED_SETTING_KEYS.has(key)) {
    return fail(`配置 ${key} 不在白名单内`, 400);
  }
  if (!["string", "number", "boolean"].includes(typeof value)) {
    return fail("配置值仅支持字符串、数字或布尔值", 400);
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    return fail("配置值必须是有限数字", 400);
  }
  if (typeof value === "string" && value.length > 4096) {
    return fail("配置值长度不能超过 4096 个字符", 400);
  }

  // P1 修复: 同步密钥属于高敏配置，误改会直接中断跨端链路。
  // admin 修改时必须有显式二次确认字符串，防止误操作/脚本误触发。
  const isSensitive = SENSITIVE_SETTING_KEYS.has(key);
  if (isSensitive && String(payload.confirmText || "").trim() !== SECRET_CONFIRM_TEXT) {
    return fail(`修改同步密钥需传 confirmText="${SECRET_CONFIRM_TEXT}" 二次确认`, 400);
  }

  await setSettingValue(key, value);
  cache.invalidate("SETTINGS");
  await logOperation("UPDATE_SETTING", `${guard.staff.name} 更新配置 ${key}`, {
    type: "config",
    key,
    value: isSensitive ? "[REDACTED]" : value,
  });
  return ok(
    isSensitive ? { key, updated: true } : { key, value },
    `配置 ${key} 已更新`
  );
};

// ──────────────────────────────────────────────
// 路由表
// ──────────────────────────────────────────────
module.exports = {
  getSchedulingConfig,
  updateSchedulingConfig,
  setSetting,
};
