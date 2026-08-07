/**
 * 航翼 · 公共工具模块
 * 从原 index.js 抽取的常量、工具函数、响应包装、数据访问基座。
 * 所有业务模块通过此文件共享基础设施。
 */
const cloud = require("wx-server-sdk");
const { AsyncLocalStorage } = require("node:async_hooks");
const { getCloudbaseContext } = require("@cloudbase/node-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const invocationContext = new AsyncLocalStorage();

// ── 集合名称常量 ────────────────────────────────────────────

const COLLECTIONS = {
  STAFF: "staff",
  FLIGHTS: "flights",
  SCHEDULES: "schedules",
  SWAP_REQUESTS: "swap_requests",
  SETTINGS: "settings",
  OPERATION_LOGS: "operation_logs",
  SCHEDULE_VERSIONS: "schedule_versions",
  LEAVE_REQUESTS: "leave_requests",
};

const SETTINGS_KEYS = {
  FATIGUE_MAX_CONTINUOUS_DAYS: "fatigueMaxContinuousDays",
  SERVICE_PREP_TIME_MINUTES: "servicePrepTimeMinutes",
  SERVICE_WRAP_TIME_MINUTES: "serviceWrapTimeMinutes",
  RELEASE_PREP_TIME_MINUTES: "releasePrepTimeMinutes",
  RELEASE_WRAP_TIME_MINUTES: "releaseWrapTimeMinutes",
  SERVICE_REQUIRED_COUNT: "serviceRequiredCount",
  RELEASE_REQUIRED_COUNT: "releaseRequiredCount",
  MIN_REST_INTERVAL_MINUTES: "minRestIntervalMinutes",
  MAX_CONSECUTIVE_NIGHT_SHIFTS: "maxConsecutiveNightShifts",
  MAX_DAILY_WORK_HOURS: "maxDailyWorkHours",
  HANGYI_API_URL: "hangyiApiUrl",
  HANGYI_API_KEY: "hangyiApiKey",
  HANGYI_SYNC_ENABLED: "hangyiSyncEnabled",
  ASSISTANT_API_URL: "assistantApiUrl",
  ASSISTANT_API_KEY: "assistantApiKey",
  ASSISTANT_ENABLED: "assistantEnabled",
  DEMO_TOOLS_ENABLED: "demoToolsEnabled",
};

// ── 响应包装 ────────────────────────────────────────────────

const ok = (data = null, message = "ok") => ({ code: 0, message, data });
const fail = (message = "error", code = -1, data = null) => ({ code, message, data });

// ── 工具函数 ────────────────────────────────────────────────

const formatDate = (date) => {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const formatDateTimeLocal = (date) => {
  const hh = `${date.getHours()}`.padStart(2, "0");
  const mm = `${date.getMinutes()}`.padStart(2, "0");
  return `${formatDate(date)}T${hh}:${mm}`;
};

const getShiftCode = (date) => {
  const h = date.getHours();
  if (h < 12) return "MORNING";
  if (h < 18) return "AFTERNOON";
  return "NIGHT";
};

const getShiftHours = (shiftCode) => {
  return ["MORNING", "AFTERNOON", "NIGHT"].includes(shiftCode) ? 8 : 0;
};

// ── 航司映射 ────────────────────────────────────────────────

const AIRLINE_NAME_MAP = {
  MU: "中国东方航空", CA: "中国国际航空", CZ: "中国南方航空",
  HU: "海南航空", ZH: "深圳航空", FM: "上海航空",
  SC: "山东航空", MF: "厦门航空", BK: "奥凯航空",
  HO: "吉祥航空", "9C": "春秋航空", FU: "福州航空",
  QW: "青岛航空", NX: "澳门航空", "3U": "四川航空",
  GS: "天津航空", GJ: "长龙航空", TV: "西藏航空",
  PN: "西部航空", EU: "成都航空", DR: "瑞丽航空",
  KY: "昆明航空", "8L": "祥鹏航空", NS: "河北航空",
  DZ: "东海航空",
};

const AIRLINE_FULL_TO_CODE = {};
for (const [code, full] of Object.entries(AIRLINE_NAME_MAP)) {
  AIRLINE_FULL_TO_CODE[full] = code;
}

const SHORT_NAME_MAP = {
  "东航": "MU", "国航": "CA", "南航": "CZ", "海航": "HU",
  "深航": "ZH", "上航": "FM", "山航": "SC", "厦航": "MF",
  "澳航": "NX", "春航": "9C", "吉航": "HO", "奥凯": "BK",
  "福航": "FU", "青航": "QW", "川航": "3U", "天航": "GS",
};

const matchAirline = (airline) => {
  const raw = String(airline || "").trim();
  if (!raw) return { code: "", fullName: "未知" };
  const upper = raw.toUpperCase();
  if (AIRLINE_NAME_MAP[upper]) return { code: upper, fullName: AIRLINE_NAME_MAP[upper] };
  // P2 修复: 先尝试 SHORT_NAME_MAP 精确匹配
  // 原顺序先做"includes 子串匹配", "南航" 会被误判为 "海南航空" (因为 "南航" 是 "海南航空" 的子串)
  if (SHORT_NAME_MAP[raw]) {
    const code = SHORT_NAME_MAP[raw];
    return { code, fullName: AIRLINE_NAME_MAP[code] };
  }
  // 模糊匹配: 用全称 includes 关系 (如 "南方" in "中国南方航空")
  for (const [code, fullName] of Object.entries(AIRLINE_NAME_MAP)) {
    if (raw.includes(fullName) || fullName.includes(raw)) return { code, fullName };
  }
  // 短中文/全称子串关系 (如 "上航" 包含在 "上海航空" 中)
  for (const [short, code] of Object.entries(SHORT_NAME_MAP)) {
    if (short.includes(raw) || raw.includes(short)) return { code, fullName: AIRLINE_NAME_MAP[code] };
  }
  return { code: raw, fullName: raw };
};

const normalizeAirlineName = (airline) => matchAirline(airline).fullName;

const normalizeAircraftType = (type) => {
  if (!type) return "A320";
  const map = {
    "320": "A320", "321": "A321", "319": "A319",
    "330": "A330", "350": "A350", "380": "A380",
    "737": "B737", "738": "B738", "739": "B739",
    "747": "B747", "757": "B757", "767": "B767",
    "777": "B777", "787": "B787",
    "38m": "B38M", "38M": "B38M",
    "a320": "A320", "a321": "A321",
    "b737": "B737", "b738": "B738",
    "b38m": "B38M",
    "arj21": "ARJ21", "c919": "C919",
  };
  return map[type] || map[type.toUpperCase()] || type.toUpperCase();
};

const hasQualification = (staff, airline, aircraftType) => {
  const airlines = staff.authorizedAirlines || [];
  const aircraftTypes = staff.authorizedAircraftTypes || [];
  // P2 修复: 兼容传入的航司是简写/短中文（"CZ" / "南航" / "中国南方航空" 等）。
  // staff.authorizedAirlines 在 seed 中是中文全称，schedule.airline 可能是任意形式。
  // 统一归一化后再比较，避免误判为"不匹配"。
  const normalizedAirline = normalizeAirlineName(airline);
  const normalizedAircraft = normalizeAircraftType(aircraftType);
  return airlines.includes(normalizedAirline) && aircraftTypes.includes(normalizedAircraft);
};

const normalizeReasonEvidence = (payload = {}) => {
  if (
    payload.reason !== undefined &&
    typeof payload.reason !== "string"
  ) {
    return { ok: false, message: "原因文字格式错误" };
  }
  if (
    payload.reasonText !== undefined &&
    typeof payload.reasonText !== "string"
  ) {
    return { ok: false, message: "原因文字格式错误" };
  }
  if (
    payload.reasonImages !== undefined &&
    !Array.isArray(payload.reasonImages)
  ) {
    return { ok: false, message: "原因图片格式错误" };
  }

  const reasonText = String(
    payload.reasonText !== undefined ? payload.reasonText : payload.reason || ""
  ).trim().slice(0, 500);
  const reasonImages = Array.isArray(payload.reasonImages)
    ? payload.reasonImages.map((item) => String(item || "").trim())
    : [];

  if (reasonImages.length > 6) {
    return { ok: false, message: "原因图片最多上传 6 张" };
  }
  if (
    reasonImages.some(
      (fileID) =>
        !fileID ||
        fileID.length > 1024 ||
        !/^cloud:\/\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+$/.test(fileID) ||
        !fileID.includes("/request-reasons/")
    )
  ) {
    return { ok: false, message: "原因图片必须来自申请凭证云存储目录" };
  }
  if (!reasonText && !reasonImages.length) {
    return { ok: false, message: "请填写原因或上传图片" };
  }

  return {
    ok: true,
    reason: reasonText,
    reasonText,
    reasonImages,
    reasonMode: reasonText && reasonImages.length
      ? "BOTH"
      : reasonImages.length
      ? "IMAGE"
      : "TEXT",
  };
};

const hashToRole = (str) => {
  let h = 0;
  for (let i = 0; i < (str || "").length; i++) h = ((h << 5) - h) + str.charCodeAt(i);
  const r = Math.abs(h) % 100;
  if (r < 60) return "SERVICE";
  if (r < 85) return "RELEASE";
  return "BOTH";
};

// ── 云函数上下文 ────────────────────────────────────────────

const readSdkOpenContext = () => {
  const wxContext = cloud.getWXContext();
  return {
    openid: wxContext.OPENID || "",
    appid: wxContext.APPID || "",
    unionid: wxContext.UNIONID || "",
    source: wxContext.SOURCE || "",
  };
};

/**
 * 为单次云函数调用保存可信上下文。
 * 云函数实例会被复用，混合小程序与控制台调用时不能依赖进程级缓存的 wxContext。
 */
const withInvocationContext = (context, callback) => {
  let trustedContext = null;
  if (context && typeof context === "object" && Object.keys(context).length) {
    try {
      const parsed = getCloudbaseContext(context) || {};
      trustedContext = {
        openid: parsed.WX_OPENID || "",
        appid: parsed.WX_APPID || "",
        unionid: parsed.WX_UNIONID || "",
        source: parsed.TCB_SOURCE || "",
      };
    } catch (_) {
      trustedContext = null;
    }
  }
  return invocationContext.run(trustedContext || readSdkOpenContext(), callback);
};

const getOpenContext = () => {
  return invocationContext.getStore() || readSdkOpenContext();
};

// ── 鉴权守卫 ────────────────────────────────────────────────

/**
 * 校验当前 openid 是否对应一个 isAdmin=true 的员工。
 * 返回 { ok: true, staff } 表示通过；
 * 返回 { ok: false, response } 表示被拒，调用方直接 return response。
 *
 * 约定:
 *  - 必须先 cloud.init() 完成（utils.js 顶部已初始化）
 *  - 复用 schedule.js / realtime.js 现有的"查 staff by openid + isAdmin===true"模式
 *  - 不再允许通过 employeeNo 硬编码（如 GH001）提权--纯读 isAdmin 字段
 */
const requireAdmin = async () => {
  const { openid } = getOpenContext();
  if (!openid) {
    return { ok: false, response: fail("当前未登录", 401) };
  }
  const res = await db
    .collection(COLLECTIONS.STAFF)
    .where({ openid })
    .limit(1)
    .get();
  const staff = res.data && res.data[0];
  if (!staff) {
    return { ok: false, response: fail("当前未登录，请先登录", 401) };
  }
  if (staff.isAdmin !== true) {
    return { ok: false, response: fail("权限不够，仅管理员可操作", 403) };
  }
  return { ok: true, staff };
};

/**
 * 校验当前 openid 是否绑定了有效员工。
 * 业务写操作必须从这里取得可信员工身份，不能相信客户端传入的工号或姓名。
 */
const requireActiveStaff = async () => {
  const { openid } = getOpenContext();
  if (!openid) {
    return { ok: false, response: fail("当前未登录", 401) };
  }
  const res = await db
    .collection(COLLECTIONS.STAFF)
    .where({ openid })
    .limit(1)
    .get();
  const staff = res.data && res.data[0];
  if (!staff) {
    return { ok: false, response: fail("当前微信未绑定员工，请先登录", 401) };
  }
  if (staff.active === false) {
    return { ok: false, response: fail("当前员工账号已停用", 403) };
  }
  return { ok: true, staff };
};

/**
 * 返回指定日期处于已批准请假区间内的员工工号集合。
 * 请假区间是排班可用性的事实来源；staff.onLeave 只保留为当天状态快照。
 */
const getApprovedLeaveEmployeeNos = async (targetDate) => {
  if (typeof targetDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    return new Set();
  }

  const employeeNos = new Set();
  const pageSize = 100;
  for (let offset = 0; offset < 1000; offset += pageSize) {
    let result;
    try {
      result = await db
        .collection(COLLECTIONS.LEAVE_REQUESTS)
        .where({ status: "APPROVED" })
        .skip(offset)
        .limit(pageSize)
        .get();
    } catch (error) {
      // 兼容尚未初始化 leave_requests 集合的旧环境。
      if (offset === 0) return employeeNos;
      throw error;
    }
    const rows = result.data || [];
    rows.forEach((item) => {
      if (
        typeof item.employeeNo === "string" &&
        item.startDate <= targetDate &&
        targetDate <= item.endDate
      ) {
        employeeNos.add(item.employeeNo);
      }
    });
    if (rows.length < pageSize) break;
  }
  return employeeNos;
};

const filterStaffAvailableOnDate = async (staffs, targetDate) => {
  const leaveEmployeeNos = await getApprovedLeaveEmployeeNos(targetDate);
  return (Array.isArray(staffs) ? staffs : []).filter(
    (staff) => staff && staff.active !== false && !leaveEmployeeNos.has(staff.employeeNo)
  );
};

// ── 数据库操作 ──────────────────────────────────────────────

const ensureCollection = async (name) => {
  try { await db.createCollection(name); } catch (e) { /* ignore */ }
};

const getSettingValue = async (key, fallback) => {
  const res = await db.collection(COLLECTIONS.SETTINGS).where({ key }).limit(1).get();
  return res.data.length ? res.data[0].value : fallback;
};

const setSettingValue = async (key, value) => {
  const res = await db.collection(COLLECTIONS.SETTINGS).where({ key }).limit(1).get();
  if (res.data.length) {
    await db.collection(COLLECTIONS.SETTINGS).doc(res.data[0]._id).update({
      data: { value, updatedAt: new Date() },
    });
  } else {
    await db.collection(COLLECTIONS.SETTINGS).add({
      data: { key, value, createdAt: new Date(), updatedAt: new Date() },
    });
  }
};

const parseScheduleDateTime = (value, scheduleDate) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const clockOnly = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  const date = clockOnly
    ? new Date(
      `${scheduleDate}T${String(clockOnly[1]).padStart(2, "0")}:${clockOnly[2]}:${clockOnly[3] || "00"}`
    )
    : new Date(raw);
  return Number.isFinite(date.getTime()) ? date : null;
};

const getScheduleTimeRange = (schedule = {}, fallbackDate = "") => {
  const scheduleDate = String(schedule.scheduleDate || fallbackDate || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduleDate)) return null;

  let start = parseScheduleDateTime(
    schedule._taskStart || schedule.taskStart || schedule.arrivalTime || "",
    scheduleDate
  );
  let end = parseScheduleDateTime(
    schedule._taskEnd || schedule.taskEnd || schedule.departureTime || "",
    scheduleDate
  );

  if (!start) {
    const shiftStartMap = {
      MORNING: "06:00",
      AFTERNOON: "14:00",
      NIGHT: "22:00",
    };
    start = parseScheduleDateTime(shiftStartMap[schedule.shiftCode], scheduleDate);
  }
  if (!start) return null;

  if (!end) {
    const durationHours = getShiftHours(schedule.shiftCode) || 2;
    end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
  } else if (end <= start) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  }

  return {
    start,
    end,
    minutes: Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000)),
  };
};

const validateStaffScheduleAssignment = async ({
  staff,
  targetSchedule,
  excludeScheduleIds = [],
}) => {
  const checkedAt = new Date();
  const violations = [];
  const scheduleDate = String((targetSchedule || {}).scheduleDate || "");
  const addViolation = (code, message, details = {}) => {
    violations.push({ code, message, severity: "HIGH", ...details });
  };

  if (!staff || !staff._id) {
    addViolation("STAFF_NOT_FOUND", "未找到待校验人员");
    return { passed: false, checkedAt, violations, workHours: 0 };
  }
  if (staff.active === false) {
    addViolation("STAFF_INACTIVE", "人员账号已停用");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduleDate)) {
    addViolation("INVALID_DATE", "排班日期无效");
    return { passed: false, checkedAt, violations, workHours: 0 };
  }

  const leaveEmployeeNos = await getApprovedLeaveEmployeeNos(scheduleDate);
  if (leaveEmployeeNos.has(staff.employeeNo)) {
    addViolation("APPROVED_LEAVE", "人员当天处于已批准请假区间");
  }

  const airline = String(targetSchedule.airline || "").trim();
  const aircraftType = String(targetSchedule.aircraftType || "").trim();
  if (
    airline &&
    airline !== "管理员发布" &&
    aircraftType &&
    !hasQualification(staff, airline, aircraftType)
  ) {
    addViolation(
      "QUALIFICATION_MISMATCH",
      `缺少 ${normalizeAirlineName(airline)} / ${normalizeAircraftType(aircraftType)} 所需资质`
    );
  }

  const requiredRole = String(
    targetSchedule._taskType || targetSchedule.taskType || targetSchedule.roleType || ""
  ).trim().toUpperCase();
  const staffRole = String(staff.roleType || "").trim().toUpperCase();
  if (
    ["SERVICE", "RELEASE"].includes(requiredRole) &&
    staffRole !== requiredRole &&
    staffRole !== "BOTH"
  ) {
    addViolation(
      "ROLE_MISMATCH",
      requiredRole === "SERVICE" ? "人员不具备勤务岗位资格" : "人员不具备放行岗位资格"
    );
  }

  const scheduleDay = new Date(`${scheduleDate}T12:00:00`);
  if (Number.isNaN(scheduleDay.getTime())) {
    addViolation("INVALID_DATE", "排班日期无效");
    return { passed: false, checkedAt, violations, workHours: 0 };
  }
  const previousDate = formatDate(
    new Date(scheduleDay.getTime() - 24 * 60 * 60 * 1000)
  );
  const nextDate = formatDate(
    new Date(scheduleDay.getTime() + 24 * 60 * 60 * 1000)
  );
  const currentRes = await db.collection(COLLECTIONS.SCHEDULES)
    .where({ staffId: staff._id, scheduleDate: _.gte(previousDate) })
    .limit(500)
    .get();
  const excluded = new Set(
    (Array.isArray(excludeScheduleIds) ? excludeScheduleIds : [])
      .filter((item) => typeof item === "string")
  );
  const activeSchedules = (currentRes.data || []).filter(
    (item) =>
      item.scheduleDate <= nextDate &&
      !excluded.has(item._id) &&
      item.recordStatus !== "archived" &&
      item.status !== "CANCELLED"
  );
  const sameDaySchedules = activeSchedules.filter(
    (item) => item.scheduleDate === scheduleDate
  );
  const targetRange = getScheduleTimeRange(targetSchedule, scheduleDate);
  const currentRanges = activeSchedules
    .map((item) => ({ schedule: item, range: getScheduleTimeRange(item, scheduleDate) }))
    .filter((item) => item.range);
  const sameDayRanges = currentRanges.filter(
    (item) => item.schedule.scheduleDate === scheduleDate
  );

  if (targetRange) {
    const overlap = currentRanges.find(
      ({ range }) => range.start < targetRange.end && range.end > targetRange.start
    );
    if (overlap) {
      addViolation("TIME_OVERLAP", "与已有排班时段重叠", {
        conflictScheduleId: overlap.schedule._id || "",
      });
    }
  } else if (sameDaySchedules.length) {
    addViolation("TIME_UNKNOWN_CONFLICT", "目标时段不完整，且人员当天已有排班");
  }

  const maxDailyWorkHours = Number(
    await getSettingValue(SETTINGS_KEYS.MAX_DAILY_WORK_HOURS, 12)
  );
  const existingMinutes = sameDayRanges.reduce(
    (sum, item) => sum + item.range.minutes,
    0
  );
  const targetMinutes = targetRange
    ? targetRange.minutes
    : (getShiftHours(targetSchedule.shiftCode) || 8) * 60;
  const totalMinutes = existingMinutes + targetMinutes;
  if (totalMinutes > maxDailyWorkHours * 60) {
    addViolation(
      "DAILY_WORK_HOURS_EXCEEDED",
      `预计单日工时 ${(totalMinutes / 60).toFixed(1)} 小时，超过上限 ${maxDailyWorkHours} 小时`,
      { totalMinutes, maxDailyWorkHours }
    );
  }

  if (targetRange && currentRanges.length) {
    const minRestIntervalMinutes = Number(
      await getSettingValue(SETTINGS_KEYS.MIN_REST_INTERVAL_MINUTES, 30)
    );
    const insufficientRest = currentRanges.find(({ range }) => {
      if (range.end <= targetRange.start) {
        return (targetRange.start.getTime() - range.end.getTime()) / 60000 < minRestIntervalMinutes;
      }
      if (targetRange.end <= range.start) {
        return (range.start.getTime() - targetRange.end.getTime()) / 60000 < minRestIntervalMinutes;
      }
      return false;
    });
    if (insufficientRest) {
      addViolation(
        "REST_INTERVAL_INSUFFICIENT",
        `与相邻任务休息间隔不足 ${minRestIntervalMinutes} 分钟`,
        { conflictScheduleId: insufficientRest.schedule._id || "", minRestIntervalMinutes }
      );
    }
  }

  return {
    passed: violations.length === 0,
    checkedAt,
    violations,
    workHours: Math.round((totalMinutes / 60) * 10) / 10,
  };
};

const purgeCollection = async (name) => {
  // P2 修复: 原实现任一 doc.remove() 失败会导致整个 Promise.all reject，
  // 外层没有 try/catch，导致重置只删一半，状态错乱。
  // 改用 Promise.allSettled 容错, 统计成功数；外层 throw 让调用方知道部分失败。
  let totalRemoved = 0;
  while (true) {
    const res = await db.collection(name).limit(100).get();
    if (!res.data.length) break;
    const results = await Promise.allSettled(
      res.data.map((item) => db.collection(name).doc(item._id).remove())
    );
    const removed = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - removed;
    totalRemoved += removed;
    if (failed > 0) {
      console.warn(`purgeCollection(${name}): ${failed}/${results.length} docs 失败`);
    }
    // 如果这一批全部失败，终止循环避免死循环
    if (removed === 0) {
      throw new Error(`purgeCollection(${name}) 连续失败，已停止`);
    }
  }
  return totalRemoved;
};

// ── 审计日志 ────────────────────────────────────────────────

const logOperation = async (action, detail = "", target = null) => {
  try {
    const { openid } = getOpenContext();
    if (!openid) return;
    const staffRes = await db.collection(COLLECTIONS.STAFF).where({ openid }).limit(1).get();
    const staff = staffRes.data && staffRes.data[0];
    const operator = staff ? `${staff.name}（${staff.employeeNo}）` : openid;
    const now = new Date();
    await db.collection(COLLECTIONS.OPERATION_LOGS).add({
      data: { operator, openid, action, detail, target, createdAt: now, updatedAt: now },
    });
  } catch (e) {
    console.warn("日志写入失败:", e.message);
  }
};

// ── Hangyi 统一认证服务调用 ──────────────────────────────────

const HANGYI_TIMEOUT_MS = 10000;
const HANGYI_MAX_RESPONSE_BYTES = 1024 * 1024;
const https = require("https");

const isPrivateHostname = (hostname) => {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")) return true;
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

const buildHangyiTarget = (baseUrl, endpoint) => {
  let base;
  try {
    base = new URL(baseUrl);
  } catch (_) {
    throw new Error("hangyiApiUrl 配置无效");
  }
  const isOriginOnly = (base.pathname === "/" || base.pathname === "")
    && !base.search && !base.hash && !base.username && !base.password;
  if (base.protocol !== "https:" || !isOriginOnly || isPrivateHostname(base.hostname)) {
    throw new Error("hangyiApiUrl 必须是公网 HTTPS origin");
  }
  if (typeof endpoint !== "string" || !endpoint.startsWith("/api/")) {
    throw new Error("Hangyi 接口路径无效");
  }
  return new URL(endpoint, base.origin);
};

const callHangyiService = async (endpoint, payload, method = "POST", extraHeaders = {}) => {
  const baseUrl = await getSettingValue(SETTINGS_KEYS.HANGYI_API_URL, "");
  if (!baseUrl) return { ok: false, error: "hangyiApiUrl 未配置", statusCode: 0, body: null };
  const apiKey = await getSettingValue(SETTINGS_KEYS.HANGYI_API_KEY, "");
  let urlObj;
  try {
    urlObj = buildHangyiTarget(baseUrl, endpoint);
  } catch (error) {
    return { ok: false, error: error.message, statusCode: 0, body: null, rawBody: "" };
  }
  const postData = method !== "GET" ? JSON.stringify(payload) : null;

  // HTTPS 不再无条件关证书校验。生产环境应使用受信 CA 签发的证书；
  // 如使用自签证书，可通过 settings 表的 `hangyiApiCaPem` 配置 PEM 内容后传 ca。
  // 注意: caPem 的获取必须在 new Promise 之外 (Promise 内的箭头函数不是 async)
  let caPem = "";
  caPem = await getSettingValue("hangyiApiCaPem", "");

  // P2 修复: 原实现所有错误都返回 null, 调用方无法区分 "服务挂了" / "4xx" / "5xx" / "超时"
  // 新实现: 返回结构化结果 { ok, statusCode, body, error }, 让调用方按需处理。
  return new Promise((resolve) => {
    const headers = {
      "Content-Type": "application/json",
      ...extraHeaders,
    };
    if (apiKey) headers["X-Internal-API-Key"] = apiKey;
    if (postData) headers["Content-Length"] = Buffer.byteLength(postData);

    const testTransport = typeof global !== "undefined" && global.__HANGYI_HTTP_REQUEST__;
    if (typeof testTransport === "function") {
      Promise.resolve(testTransport({
        target: urlObj.toString(), method, headers, payload,
      })).then(resolve, (error) => resolve({
        ok: false, statusCode: 0, body: null, rawBody: "", error: error.message || "network error",
      }));
      return;
    }

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method,
      headers,
      timeout: HANGYI_TIMEOUT_MS,
    };
    if (caPem) options.ca = caPem;

    const req = https.request(options,
      (res) => {
        const chunks = [];
        let size = 0;
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > HANGYI_MAX_RESPONSE_BYTES) {
            req.destroy(new Error("Hangyi 服务响应过大"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          let parsed = null;
          try { parsed = JSON.parse(body); } catch { parsed = null; }
          const statusCode = res.statusCode || 0;
          const ok = statusCode >= 200 && statusCode < 300;
          resolve({
            ok,
            statusCode,
            body: parsed,
            rawBody: body,
            error: ok ? null : `HTTP ${statusCode}`,
          });
        });
      }
    );
    req.on("error", (e) => resolve({ ok: false, statusCode: 0, body: null, rawBody: "", error: e.message || "network error" }));
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, statusCode: 0, body: null, rawBody: "", error: "timeout" }); });
    if (postData) req.write(postData);
    req.end();
  });
};

// 业务写入后的即时同步使用该包装。callHangyiService 为了便于鉴权等
// 调用方检查响应，网络和 HTTP 失败会解析为 { ok: false }；这里将其恢复为
// rejection，防止只写 .catch() 的后台同步静默丢数据。
const callHangyiServiceChecked = async (endpoint, payload, method = "POST", extraHeaders = {}) => {
  const result = await callHangyiService(endpoint, payload, method, extraHeaders);
  const rawBodyCode = result && result.body ? result.body.code : null;
  const hasBodyFailure = rawBodyCode != null && Number(rawBodyCode) !== 200;
  if (!result || !result.ok || hasBodyFailure) {
    const detail = result && (
      result.error
      || (result.body && (result.body.msg || result.body.message))
      || result.rawBody
    );
    const error = new Error(detail || "Hangyi 同步失败");
    error.statusCode = result && result.statusCode || 0;
    error.syncResult = result || null;
    throw error;
  }
  return result;
};

module.exports = {
  db, _,
  COLLECTIONS, SETTINGS_KEYS,
  ok, fail,
  formatDate, formatDateTimeLocal, getShiftCode, getShiftHours,
  AIRLINE_NAME_MAP, matchAirline, normalizeAirlineName, normalizeAircraftType,
  hasQualification, normalizeReasonEvidence, hashToRole,
  getOpenContext, withInvocationContext,
  requireAdmin, requireActiveStaff,
  getApprovedLeaveEmployeeNos, filterStaffAvailableOnDate,
  ensureCollection, getSettingValue, setSettingValue, purgeCollection,
  getScheduleTimeRange, validateStaffScheduleAssignment,
  logOperation, callHangyiService, callHangyiServiceChecked,

};
