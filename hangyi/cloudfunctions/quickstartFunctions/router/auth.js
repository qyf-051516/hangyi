/**
 * auth.js - 员工身份与个人资料
 * 涵盖：登录/注册/登出、个人资料 CRUD、头像、二维码、偏好设置
 */
const QRCode = require("qrcode");
const cloud = require("wx-server-sdk");
const cache = require("../cache");
const {
  db, _, COLLECTIONS,
  ok, fail, logOperation,
  getOpenContext, getSettingValue,
  normalizeAircraftType, hashToRole,
} = require("../utils");

const EMPLOYEE_NO_RE = /^[A-Z0-9_-]{1,30}$/;
const PHONE_RE = /^1\d{10}$/;
const LOGIN_VERIFICATION_FAILED = "员工验证失败，请使用手机号一键登录或联系管理员协助绑定";

// 登录限流：按 openid 记录时间戳，1 分钟窗口最多 10 次。
// 云函数实例间不共享内存，该 Map 只负责在靠近登录入口处快速熔断突发尝试，
// 与 assistant.js 的 consumeRateLimit 语义一致。
const LOGIN_RATE_WINDOW_MS = 60 * 1000;
const LOGIN_RATE_WINDOW_LIMIT = 10;
const loginRateBuckets = new Map();

const consumeLoginRateLimit = (openid) => {
  const now = Date.now();
  if (loginRateBuckets.size >= 500) {
    for (const [key, item] of loginRateBuckets.entries()) {
      if (now - item.lastSeenAt > 2 * 24 * 60 * 60 * 1000) loginRateBuckets.delete(key);
    }
  }
  const current = loginRateBuckets.get(openid) || {
    windowStartedAt: now,
    count: 0,
    lastSeenAt: now,
  };
  if (now - current.windowStartedAt >= LOGIN_RATE_WINDOW_MS) {
    current.windowStartedAt = now;
    current.count = 0;
  }
  current.lastSeenAt = now;
  if (current.count >= LOGIN_RATE_WINDOW_LIMIT) {
    loginRateBuckets.set(openid, current);
    return false;
  }
  current.count += 1;
  loginRateBuckets.set(openid, current);
  return true;
};

/**
 * 清除当前微信在其他员工记录上的绑定，保证一个 openid 只对应一个员工。
 * exceptStaffId 用于登录时保留即将绑定的目标员工；退出时不传即可全部解绑。
 */
const releaseOpenidBindings = async (openid, exceptStaffId = "") => {
  if (!openid) {
    cache.invalidate("PROFILE");
    return [];
  }

  const released = [];
  while (true) {
    const result = await db
      .collection(COLLECTIONS.STAFF)
      .where({ openid })
      .limit(100)
      .get();
    const matches = (result.data || []).filter((staff) => staff._id !== exceptStaffId);
    if (!matches.length) break;

    const now = new Date();
    await Promise.all(matches.map((staff) =>
      db.collection(COLLECTIONS.STAFF).doc(staff._id).update({
        data: {
          openid: "",
          updatedAt: now,
        },
      })
    ));
    released.push(...matches);
  }

  cache.invalidate("PROFILE");
  return released;
};

const bindOpenidToStaff = async (staffId, openid, data = {}) => {
  await releaseOpenidBindings(openid, staffId);
  await db.collection(COLLECTIONS.STAFF).doc(staffId).update({
    data: {
      ...data,
      openid,
      updatedAt: new Date(),
    },
  });
  cache.invalidate("PROFILE");
};

// ──────────────────────────────────────────────
// 登出
// ──────────────────────────────────────────────
const logoutStaff = async () => {
  const { openid } = getOpenContext();
  const released = await releaseOpenidBindings(openid);

  if (!released.length) {
    return ok({ unboundCount: 0, alreadyLoggedOut: true }, "当前已退出登录");
  }

  const primary = released[0];
  await logOperation(
    "LOGOUT",
    `${primary.name}（${primary.employeeNo}）登出`,
    {
      type: "auth",
      employeeNo: primary.employeeNo,
      name: primary.name,
      unboundCount: released.length,
    }
  );
  return ok({ unboundCount: released.length, alreadyLoggedOut: false }, "已退出登录");
};

// ──────────────────────────────────────────────
// 登录或注册
// ──────────────────────────────────────────────
const loginOrRegisterStaff = async (event) => {
  const payload = event.data || {};
  const employeeNo = String(payload.employeeNo || "").trim().toUpperCase();
  const name = String(payload.name || "").trim();
  const phone = String(payload.phone || "").trim();
  if (!EMPLOYEE_NO_RE.test(employeeNo)) return fail("工号格式不正确", 400);
  if (!name || name.length > 50) return fail("姓名格式不正确", 400);
  if (!PHONE_RE.test(phone)) return fail("手机号格式不正确", 400);

  const { openid } = getOpenContext();
  if (!openid) return fail("无法获取微信身份，请重新进入小程序", 401);
  const result = await db
    .collection(COLLECTIONS.STAFF)
    .where({ employeeNo })
    .limit(1)
    .get();

  if (result.data.length) {
    const staff = result.data[0];
    // A4 修复: 细分验证失败码。HTTP 401 与通用 message 不变（不泄露细节），
    // 仅通过 data.code 区分失败原因：
    //   PHONE_MISMATCH        手机号与档案不匹配
    //   NAME_MISMATCH         姓名与档案不匹配
    //   EMPLOYEE_NO_MISMATCH  工号在系统中无对应档案
    //   BINDING_CONFLICT      档案已被其他微信绑定
    //   STAFF_NOT_FOUND       档案未绑定微信且当前模式不允许静态资料首次绑定
    const codeFailure = (code) => fail(LOGIN_VERIFICATION_FAILED, 401, { code });
    if (!PHONE_RE.test(String(staff.phone || "").trim()) || staff.phone !== phone) {
      return codeFailure("PHONE_MISMATCH");
    }
    if (staff.name !== name) {
      return codeFailure("NAME_MISMATCH");
    }
    if (staff.active === false) {
      return codeFailure("LOGIN_VERIFICATION_FAILED");
    }
    const staffOpenid = String(staff.openid || "");
    if (staffOpenid && staffOpenid !== openid) {
      return codeFailure("BINDING_CONFLICT");
    }
    if (!staffOpenid) {
      const demoToolsEnabled = String(
        await getSettingValue("demoToolsEnabled", "false")
      ) === "true";
      if (!demoToolsEnabled) {
        return codeFailure("STAFF_NOT_FOUND");
      }
      // demo 模式：允许首次绑定，随后 bindOpenidToStaff 写入当前 openid
    }

    const nextAircraftTypes = Array.isArray(staff.authorizedAircraftTypes)
      ? staff.authorizedAircraftTypes
      : [];
    const finalGroupId = staff.groupId || "未分组";
    const finalRoleType = staff.roleType || "SERVICE";

    const updateData = {
      isAdmin: staff.isAdmin === true,
      updatedAt: new Date(),
    };
    await bindOpenidToStaff(staff._id, openid, updateData);

    await logOperation("LOGIN", `${name}（${employeeNo}）登录`, { type: "auth", employeeNo, name, isNew: false });
    // P1 修复: 返回更新后的 groupId/roleType，而非 update 之前的快照
    return ok({
      staffId: staff._id, employeeNo, name,
      groupId: finalGroupId,
      authorizedAircraftTypes: nextAircraftTypes,
      roleType: finalRoleType, isNew: false,
      isAdmin: staff.isAdmin === true,
      isBoss: staff.isBoss === true,
      isTestAdmin: staff.isTestAdmin === true,
    }, "登录成功");
  }

  // 禁止把 Web 主数据查询结果直接转化为当前 OPENID 的首次绑定。请先通过
  // 定时同步同步员工档案，再使用手机号一键登录完成微信凭证校验。
  // A4 修复: 工号在系统中无对应档案，返回细分错误码 EMPLOYEE_NO_MISMATCH
  return fail(LOGIN_VERIFICATION_FAILED, 401, {
    code: "EMPLOYEE_NO_MISMATCH",
  });
};

// ──────────────────────────────────────────────
// 更新个人资料
// ──────────────────────────────────────────────
const updateMyProfile = async (event) => {
  const payload = event.data || {};
  if (payload.phone !== undefined && typeof payload.phone !== "string") {
    return fail("手机号格式不正确", 400);
  }
  if (payload.groupId !== undefined && typeof payload.groupId !== "string") {
    return fail("分组参数格式错误", 400);
  }
  if (payload.qualifications !== undefined && !Array.isArray(payload.qualifications)) {
    return fail("维修资质参数格式错误", 400);
  }
  if (
    Array.isArray(payload.qualifications) &&
    !payload.qualifications.every((item) => typeof item === "string")
  ) {
    return fail("维修资质参数格式错误", 400);
  }
  const phone = String(payload.phone || "").trim();

  if (phone && !/^1\d{10}$/.test(phone)) {
    return fail("手机号格式不正确", 400);
  }

  const { openid } = getOpenContext();
  const result = await db
    .collection(COLLECTIONS.STAFF)
    .where({ openid })
    .limit(1)
    .get();

  if (!result.data.length) return fail("当前未登录，请先登录", 404);

  const staff = result.data[0];
  const currentAircraftTypes = Array.isArray(staff.authorizedAircraftTypes)
    ? staff.authorizedAircraftTypes.map((item) => normalizeAircraftType(item)).sort()
    : [];
  if (payload.groupId !== undefined && payload.groupId.trim() !== String(staff.groupId || "")) {
    return fail("班组只能由管理员在人员管理中修改", 403);
  }
  if (payload.qualifications !== undefined) {
    const requestedAircraftTypes = Array.from(new Set(
      payload.qualifications.map((item) => normalizeAircraftType(item.trim())).filter(Boolean)
    )).sort();
    if (requestedAircraftTypes.join(",") !== currentAircraftTypes.join(",")) {
      return fail("维修资质只能由管理员在人员管理中修改", 403);
    }
  }

  await db.collection(COLLECTIONS.STAFF).doc(staff._id).update({
    data: {
      phone,
      updatedAt: new Date(),
    },
  });
  cache.invalidate("PROFILE");
  await logOperation(
    "UPDATE_PROFILE",
    `${staff.name || staff.employeeNo} 更新个人联系方式`,
    {
      type: "auth",
      employeeNo: staff.employeeNo || "",
      phoneChanged: phone !== String(staff.phone || ""),
    }
  );

  return ok(
    {
      staffId: staff._id,
      employeeNo: staff.employeeNo,
      name: staff.name,
      groupId: staff.groupId || "",
      phone,
      authorizedAircraftTypes: currentAircraftTypes,
      isAdmin: staff.isAdmin === true,
      isBoss: staff.isBoss === true,
    },
    "个人信息已更新"
  );
};

// ──────────────────────────────────────────────
// 更新头像
// ──────────────────────────────────────────────
const updateMyAvatar = async (event) => {
  const payload = event.data || {};
  const avatarFileID = String(payload.avatarFileID || "").trim();

  if (!avatarFileID) {
    return fail("头像文件ID不能为空", 400);
  }
  if (
    avatarFileID.length > 1024 ||
    !/^cloud:\/\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+$/.test(avatarFileID) ||
    !avatarFileID.includes("/avatars/")
  ) {
    return fail("头像必须来自头像云存储目录", 400);
  }

  const { openid } = getOpenContext();
  const result = await db
    .collection(COLLECTIONS.STAFF)
    .where({ openid })
    .limit(1)
    .get();

  if (!result.data.length) return fail("当前未登录，请先登录", 404);

  const staff = result.data[0];
  const employeeNo = String(staff.employeeNo || "");
  // C4 修复: 头像必须来自本人专属目录（前端约定 avatars/{employeeNo}_xxx 或 avatars/{employeeNo}/），
  // 防止把其他员工的头像文件 ID 写到本人档案。
  if (
    !avatarFileID.includes(`/avatars/${employeeNo}_`) &&
    !avatarFileID.includes(`/avatars/${employeeNo}/`)
  ) {
    return fail("头像必须来自本人头像云存储目录", 400);
  }
  await db.collection(COLLECTIONS.STAFF).doc(staff._id).update({
    data: {
      avatarFileID,
      updatedAt: new Date(),
    },
  });

  return ok({ avatarFileID }, "头像已更新");
};

// ──────────────────────────────────────────────
// 获取个人资料
// ──────────────────────────────────────────────
const getMyProfile = async () => {
  const { openid } = getOpenContext();

  // 当前账号绑定和管理员权限属于鉴权敏感数据，必须实时读取。
  // 云函数实例间不共享内存缓存，账号切换后旧实例可能继续返回上一账号资料。
  const result = await db
    .collection(COLLECTIONS.STAFF)
    .where({ openid })
    .limit(1)
    .get();

  if (!result.data.length) return fail("当前未登录，请先登录", 404);

  const staff = result.data[0];
  const data = {
    staffId: staff._id,
    employeeNo: staff.employeeNo,
    name: staff.name,
    groupId: staff.groupId,
    phone: staff.phone || "",
    avatarFileID: staff.avatarFileID || "",
    authorizedAirlines: staff.authorizedAirlines || [],
    authorizedAircraftTypes: staff.authorizedAircraftTypes || [],
    tags: staff.tags || [],
    isAdmin: staff.isAdmin === true,
    isBoss: staff.isBoss === true,
    roleType: staff.roleType || hashToRole(staff.employeeNo || staff._id),
    groupOptions: staff.groupOptions || [],
    preferences: {
      preferredShifts: Array.isArray(staff.preferences && staff.preferences.preferredShifts)
        ? staff.preferences.preferredShifts
        : [],
      preferredRestDays: Array.isArray(staff.preferences && staff.preferences.preferredRestDays)
        ? staff.preferences.preferredRestDays
        : [],
      maxMonthlyWorkHours: Number(staff.preferences && staff.preferences.maxMonthlyWorkHours) || 180,
    },
  };
  return ok(data);
};

// ──────────────────────────────────────────────
// 生成个人资料二维码
// ──────────────────────────────────────────────
const generateMyProfileQrCode = async () => {
  const { openid } = getOpenContext();
  const result = await db
    .collection(COLLECTIONS.STAFF)
    .where({ openid })
    .limit(1)
    .get();

  if (!result.data.length) return fail("当前未登录，请先登录", 404);

  const staff = result.data[0];
  const qualification = (staff.authorizedAircraftTypes || []).join("/") || "-";
  const content = `工号:${staff.employeeNo || ""}\n姓名:${staff.name || ""}\n维修资质:${qualification}`;
  const qrDataUrl = await QRCode.toDataURL(content, {
    width: 360,
    margin: 1,
    errorCorrectionLevel: "M",
  });

  return ok({
    qrDataUrl,
    content,
    profile: {
      employeeNo: staff.employeeNo || "",
      name: staff.name || "",
      qualification,
    },
  });
};

// ──────────────────────────────────────────────
// 手机号一键登录
// 入参: { phoneCode }
//   - phoneCode：新版 getPhoneNumber 返回的动态 code，由微信开放接口换取手机号
// 行为:
//   1) 解出/拿到手机号
//   2) 在 staff 表按 phone 查询；找到则绑定当前 openid 并返回 staff 信息
//   3) 找不到 → 返回 fail('NOT_REGISTERED', 404)，由前端引导走老表单注册
// 不接受客户端明文 phoneNumber，避免伪造其他员工手机号登录。
// ──────────────────────────────────────────────
const loginByPhone = async (event) => {
  const payload = event.data || {};
  let phone = "";
  if (payload.phoneNumber !== undefined || payload.cloudID !== undefined) {
    return fail("不支持客户端明文手机号，请重新授权", 400);
  }

  if (payload.phoneCode !== undefined && typeof payload.phoneCode !== "string") {
    return fail("手机号授权码格式错误", 400);
  }
  const phoneCode = String(payload.phoneCode || "").trim();
  if (phoneCode) {
    try {
      const response = await cloud.openapi.phonenumber.getPhoneNumber({ code: phoneCode });
      const phoneInfo = response && (response.phoneInfo || response.result && response.result.phoneInfo) || {};
      phone = String(phoneInfo.purePhoneNumber || phoneInfo.phoneNumber || "").trim();
    } catch (e) {
      console.error("[loginByPhone] exchange phone code failed", e && e.message);
      return fail("手机号授权已失效，请重新授权", 401);
    }
  }
  if (!phoneCode) {
    return fail("缺少手机号授权凭证", 400);
  }
  if (!PHONE_RE.test(phone)) {
    return fail("手机号格式不正确", 400);
  }

  const { openid } = getOpenContext();
  if (!openid) return fail("无法获取微信身份，请重新进入小程序", 401);
  if (!consumeLoginRateLimit(openid)) {
    return fail("登录尝试过于频繁，请稍后再试", 429);
  }

  const res = await db
    .collection(COLLECTIONS.STAFF)
    .where({ phone })
    .limit(1)
    .get();

  if (!res.data.length) {
    return fail("该手机号未注册，请使用工号注册或联系管理员", 404, { code: "NOT_REGISTERED" });
  }

  const staff = res.data[0];
  if (staff.active === false) {
    return fail("账号已停用，请联系管理员", 403);
  }

  // 绑定当前 openid，并清理该微信在其他员工记录上的旧绑定。
  await bindOpenidToStaff(staff._id, openid);

  await logOperation("LOGIN_BY_PHONE", `${staff.name}（${staff.employeeNo}）手机号一键登录`, {
    type: "auth", employeeNo: staff.employeeNo, name: staff.name,
  });

  return ok({
    staffId: staff._id,
    employeeNo: staff.employeeNo,
    name: staff.name,
    groupId: staff.groupId,
    authorizedAircraftTypes: staff.authorizedAircraftTypes || [],
    roleType: staff.roleType || hashToRole(staff.employeeNo || staff._id),
    isAdmin: staff.isAdmin === true,
    isBoss: staff.isBoss === true,
    isTestAdmin: staff.isTestAdmin === true,
    isNew: false,
  }, "登录成功");
};

// ──────────────────────────────────────────────
// 微信资料登录（仅适用于老用户：曾在本机微信登录过、st​aff.openid 已绑定）
// 入参: { nickName?, avatarUrl? } - 仅用于前端展示，不参与鉴权
// 行为:
//   1) 用当前 openid 在 staff 表查询
//   2) 找到则刷新 nickName/avatar（如果传了非空）并返回 staff
//   3) 找不到 → 返回 fail('NOT_REGISTERED', 404)，前端引导走老表单注册
//  这个入口不创建新账号--纯微信昵称/头像无法确定"你是谁"。
//    新员工首次必须走老表单（工号+姓名+手机号+资质）注册，然后才能用本入口。
// ──────────────────────────────────────────────
const loginByWechatProfile = async (event) => {
  const { openid } = getOpenContext();
  if (!openid) return fail("无法获取微信身份，请重新进入小程序", 401);

  const res = await db
    .collection(COLLECTIONS.STAFF)
    .where({ openid })
    .limit(1)
    .get();

  if (!res.data.length) {
    return fail("当前微信未绑定任何员工账号，请先使用工号注册", 404, { code: "NOT_REGISTERED" });
  }

  const staff = res.data[0];
  if (staff.active === false) {
    return fail("账号已停用，请联系管理员", 403);
  }

  // 可选：刷新昵称/头像（员工在微信改头像后能跟过来）。
  // avatarUrl 仅接受微信临时文件（wxfile://）或云存储文件 ID（cloud://），
  // 其余协议（如任意 http(s) URL）一律忽略，防止任意字符串被持久化造成 SSRF。
  const updateData = { updatedAt: new Date() };
  const nickName = event.data && event.data.nickName;
  const avatarUrl = event.data && event.data.avatarUrl;
  if (nickName) updateData.wechatNickName = String(nickName).slice(0, 32);
  const avatarUrlStr = typeof avatarUrl === "string" ? avatarUrl.trim() : "";
  if (
    avatarUrlStr &&
    (avatarUrlStr.startsWith("wxfile://") || avatarUrlStr.startsWith("cloud://"))
  ) {
    updateData.wechatAvatarUrl = avatarUrlStr.slice(0, 512);
  }
  if (Object.keys(updateData).length > 1) {
    await db.collection(COLLECTIONS.STAFF).doc(staff._id).update({ data: updateData });
  }

  cache.invalidate("PROFILE");

  await logOperation("LOGIN_BY_WECHAT", `${staff.name}（${staff.employeeNo}）微信资料登录`, {
    type: "auth", employeeNo: staff.employeeNo, name: staff.name,
  });

  return ok({
    staffId: staff._id,
    employeeNo: staff.employeeNo,
    name: staff.name,
    groupId: staff.groupId,
    authorizedAircraftTypes: staff.authorizedAircraftTypes || [],
    roleType: staff.roleType || hashToRole(staff.employeeNo || staff._id),
    isAdmin: staff.isAdmin === true,
    isBoss: staff.isBoss === true,
    isTestAdmin: staff.isTestAdmin === true,
    wechatNickName: staff.wechatNickName || (event.data && event.data.nickName) || "",
    isNew: false,
  }, "登录成功");
};

// ──────────────────────────────────────────────
// 排班偏好设置
// ──────────────────────────────────────────────
const appendPreferenceUpdates = (payload, updateData) => {
  const { preferredShifts, preferredRestDays, maxMonthlyWorkHours, preferredGroups } = payload || {};
  if (preferredShifts !== undefined) {
    if (!Array.isArray(preferredShifts)) return "班次偏好必须是数组";
    if (
      preferredShifts.length > 3 ||
      !preferredShifts.every((shift) => typeof shift === "string" && ["MORNING", "AFTERNOON", "NIGHT"].includes(shift))
    ) return "班次偏好值无效";
    updateData["preferences.preferredShifts"] = Array.from(new Set(preferredShifts));
  }
  if (preferredRestDays !== undefined) {
    if (!Array.isArray(preferredRestDays)) return "休息日偏好必须是数组";
    if (
      preferredRestDays.length > 7 ||
      !preferredRestDays.every((day) => typeof day === "string" && ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].includes(day))
    ) return "休息日参数格式错误";
    updateData["preferences.preferredRestDays"] = Array.from(new Set(preferredRestDays));
  }
  if (maxMonthlyWorkHours !== undefined) {
    if (typeof maxMonthlyWorkHours !== "number" || maxMonthlyWorkHours < 0 || maxMonthlyWorkHours > 744) {
      return "每月工时上限必须为 0-744 的数字";
    }
    updateData["preferences.maxMonthlyWorkHours"] = maxMonthlyWorkHours;
  }
  if (preferredGroups !== undefined) {
    if (!Array.isArray(preferredGroups)) return "班组偏好必须是数组";
    if (
      preferredGroups.length > 8 ||
      !preferredGroups.every((group) => typeof group === "string" && /^[A-H]组$/.test(group))
    ) return "班组参数格式错误";
    updateData["preferences.preferredGroups"] = Array.from(new Set(preferredGroups));
  }
  return "";
};

const updateMyPreferences = async (event) => {
  const { openid } = getOpenContext();
  if (!openid) return fail("未登录", 401);
  const res = await db.collection(COLLECTIONS.STAFF).where({ openid }).limit(1).get();
  if (!res.data || res.data.length === 0) return fail("未找到员工信息", 401);
  const updateData = {};
  const validationMessage = appendPreferenceUpdates(event.data || {}, updateData);
  if (validationMessage) return fail(validationMessage, 400);

  updateData.updatedAt = new Date();
  await db.collection(COLLECTIONS.STAFF).doc(res.data[0]._id).update({ data: updateData });
  return ok(null, "偏好设置已保存");
};

// 联系方式与排班偏好在同一份员工文档中一次更新，避免前端两次请求出现
// "手机号已保存、偏好失败" 的半提交状态。
const saveMySettings = async (event) => {
  const payload = event.data || {};
  if (payload.phone !== undefined && typeof payload.phone !== "string") {
    return fail("手机号格式不正确", 400);
  }
  const phone = String(payload.phone || "").trim();
  if (phone && !PHONE_RE.test(phone)) return fail("手机号格式不正确", 400);
  const { openid } = getOpenContext();
  if (!openid) return fail("未登录", 401);
  const res = await db.collection(COLLECTIONS.STAFF).where({ openid }).limit(1).get();
  const staff = res.data && res.data[0];
  if (!staff || staff.active === false) return fail("当前员工未绑定或已停用", 401);
  const updateData = { phone, updatedAt: new Date() };
  const validationMessage = appendPreferenceUpdates(payload, updateData);
  if (validationMessage) return fail(validationMessage, 400);
  await db.collection(COLLECTIONS.STAFF).doc(staff._id).update({ data: updateData });
  cache.invalidate("PROFILE");
  await logOperation("SAVE_MY_SETTINGS", `${staff.name || staff.employeeNo} 更新账号设置与排班偏好`, {
    type: "auth",
    employeeNo: staff.employeeNo || "",
    phoneChanged: phone !== String(staff.phone || ""),
    preferenceFields: Object.keys(updateData).filter((key) => key.startsWith("preferences.")),
  });
  return ok(null, "设置已保存");
};

// ──────────────────────────────────────────────
// 路由表
// ──────────────────────────────────────────────
module.exports = {
  loginOrRegisterStaff,
  loginByPhone,
  loginByWechatProfile,
  logoutStaff,
  getMyProfile,
  generateMyProfileQrCode,
  updateMyProfile,
  updateMyAvatar,
  updateMyPreferences,
  saveMySettings,
};
