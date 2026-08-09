/**
 * admin.js - 员工管理员与角色管理
 * 涵盖：setStaffAdmin、setAllStaffAdmin、migrateStaffRoles
 */
const cache = require("../cache");
const {
  db, _, COLLECTIONS,
  ok, fail,
  requireAdmin, requireActiveStaff, getSettingValue, getOpenContext,
  formatDate, logOperation, getApprovedLeaveEmployeeNos,
  normalizeAirlineName, normalizeAircraftType, hasQualification,
} = require("../utils");

const GROUP_ALIASES = {
  group_a: "A组", group_b: "B组", group_c: "C组", group_d: "D组",
  group_e: "E组", group_f: "F组", group_g: "G组", group_h: "H组",
};
const VALID_GROUPS = ["A组", "B组", "C组", "D组", "E组", "F组", "G组", "H组"];
const normalizeGroupId = (value) => GROUP_ALIASES[value] || value;
const VALID_ROLES = ["SERVICE", "RELEASE", "BOTH"];

// ──────────────────────────────────────────────
// 设置员工为管理员（仅 admin 可调）
//  P0 修复: 原实现允许任意用户设置自己为 admin（仅校验 target.openid === openid），
//    形成自提权后即可调 setAllStaffAdmin 提权全员的严重漏洞。
//    新实现: 必须 admin 鉴权。首个管理员使用独立 bootstrapAdmin 云函数，
//    bootstrapTestAdmin 仅保留为旧版 Token 流程的兼容入口。
// ──────────────────────────────────────────────
const setStaffAdmin = async (event) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { employeeNo, isAdmin: targetIsAdmin = true } = event.data || {};
  if (typeof employeeNo !== "string" || !/^[A-Z0-9_-]{1,30}$/i.test(employeeNo.trim())) {
    return fail("工号格式错误", 400);
  }
  if (typeof targetIsAdmin !== "boolean") return fail("管理员状态格式错误", 400);
  const safeEmployeeNo = employeeNo.trim().toUpperCase();

  const targetRes = await db
    .collection(COLLECTIONS.STAFF)
    .where({ employeeNo: safeEmployeeNo })
    .limit(1)
    .get();
  if (!targetRes.data.length) return fail("未找到该员工", 404);

  const target = targetRes.data[0];
  const targetOpenidBound =
    typeof target.openid === "string" &&
    !!target.openid.trim();
  if (
    targetIsAdmin === true &&
    (target.active === false || !targetOpenidBound)
  ) {
    return fail("仅可授权已绑定微信的在职员工为管理员", 409);
  }
  if (target._id === guard.staff._id && targetIsAdmin === false) {
    return fail("不能取消自己的管理员权限", 409);
  }
  if (
    target.isAdmin === true &&
    target.active !== false &&
    targetOpenidBound &&
    targetIsAdmin === false
  ) {
    const adminResult = await db.collection(COLLECTIONS.STAFF)
      .where({ isAdmin: true })
      .limit(100)
      .get();
    const usableAdminCount = (adminResult.data || []).filter((staff) =>
      staff.active !== false &&
      typeof staff.openid === "string" &&
      !!staff.openid.trim()
    ).length;
    if (usableAdminCount <= 1) return fail("系统必须保留至少一名可用管理员", 409);
  }
  if (target.isAdmin === (targetIsAdmin === true)) {
    return ok(
      { employeeNo: safeEmployeeNo, name: target.name, isAdmin: target.isAdmin },
      "管理员状态未变"
    );
  }

  await db.collection(COLLECTIONS.STAFF).doc(target._id).update({
    data: {
      isAdmin: targetIsAdmin === true,
      updatedAt: new Date(),
    },
  });
  cache.invalidate("PROFILE");
  await logOperation(
    "SET_STAFF_ADMIN",
    `${targetIsAdmin ? "授予" : "取消"} ${target.name || target.employeeNo} 的管理员权限`,
    { type: "staff", staffId: target._id, employeeNo: target.employeeNo, isAdmin: targetIsAdmin }
  );

  return ok(
    { employeeNo: safeEmployeeNo, name: target.name, isAdmin: targetIsAdmin === true },
    targetIsAdmin === true ? "已设置为管理员" : "已取消管理员"
  );
};

// ──────────────────────────────────────────────
// 一键全员管理员（演示模式）
// ──────────────────────────────────────────────
const setAllStaffAdmin = async () => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const demoToolsEnabled = String(await getSettingValue("demoToolsEnabled", "false")) === "true";
  if (!demoToolsEnabled) {
    return fail("全员管理员仅供演示环境使用，请先开启演示工具", 403);
  }

  const staffRes = await db
    .collection(COLLECTIONS.STAFF)
    .limit(200)
    .get();
  const staffs = staffRes.data || [];
  let updated = 0;
  for (let i = 0; i < staffs.length; i++) {
    const s = staffs[i];
    if (!s.isAdmin) {
      await db.collection(COLLECTIONS.STAFF).doc(s._id).update({
        data: { isAdmin: true, updatedAt: new Date() },
      });
      updated++;
    }
  }
  cache.invalidate("PROFILE");
  cache.invalidate("STAFF_ALL");
  await logOperation(
    "SET_ALL_STAFF_ADMIN",
    `演示模式下将 ${updated} 人设置为管理员`,
    { type: "staff", total: staffs.length, updated, demoOnly: true }
  );
  return ok({ total: staffs.length, updated }, `已将 ${updated} 人设置为管理员，当前共 ${staffs.length} 人`);
};

// ──────────────────────────────────────────────
// 一次性：自举第一个管理员
// 入参: { employeeNo, realName, phone, groupId? }
// 行为: 1) 把所有现有 staff.isAdmin 置为 false (除本人外)
//       2) 创建/更新指定 employeeNo, isAdmin=true, isTestAdmin=true, roleType=ADMIN
//       3) 失效缓存
//
// 防护: settings 表里 `bootstrapTestAdminEnabled` 必须显式为 "true"。
// 首次部署还需要在云开发控制台配置 `bootstrapTestAdminToken`，调用时传同值。
// 成功创建管理员后会自动关闭开关并清空一次性 token。
// ──────────────────────────────────────────────
const bootstrapTestAdmin = async (event) => {
  // 不允许通过“当前没有管理员”绕过开关自举，避免任何未登录用户创建管理员。
  const enabled = await getSettingValue("bootstrapTestAdminEnabled", "false");
  const allowBySetting = String(enabled) === "true";
  if (!allowBySetting) {
    return fail("bootstrapTestAdmin 未启用: 请在云开发控制台将 settings.bootstrapTestAdminEnabled 设为 true", 403);
  }

  // 若已有管理员，只有管理员可以调用；首次自举还必须校验一次性 token。
  const existingAdmins = await db.collection(COLLECTIONS.STAFF)
    .where({ isAdmin: true }).limit(1).get();
  const hasAdmin = (existingAdmins.data || []).length > 0;
  if (hasAdmin) {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;
  } else {
    const configuredToken = await getSettingValue("bootstrapTestAdminToken", "");
    const submittedToken = typeof (event.data || {}).bootstrapToken === "string"
      ? event.data.bootstrapToken.trim()
      : "";
    if (!configuredToken || !submittedToken || submittedToken !== String(configuredToken)) {
      return fail("首次管理员自举凭证无效", 403);
    }
  }

  const payload = event.data || {};
  const employeeNo = typeof payload.employeeNo === "string" ? payload.employeeNo.trim().toUpperCase() : "";
  const realName = typeof payload.realName === "string" ? payload.realName.trim().slice(0, 50) : "";
  const phone = typeof payload.phone === "string" ? payload.phone.trim() : "";
  const groupId = typeof payload.groupId === "string"
    ? normalizeGroupId(payload.groupId.trim().slice(0, 30))
    : "A组";
  if (!employeeNo || !realName || !phone) {
    return fail("缺少 employeeNo / realName / phone 参数", 400);
  }
  if (!/^[A-Z0-9_-]{1,30}$/.test(employeeNo)) return fail("工号格式不正确", 400);
  if (!/^1\d{10}$/.test(phone)) {
    return fail("手机号格式不正确", 400);
  }

  // 第 1 步：把现有所有 admin 都撤销（包括 GH001 硬编码的特权账号）
  const allStaffRes = await db
    .collection(COLLECTIONS.STAFF)
    .limit(500)
    .get();
  const allStaffs = allStaffRes.data || [];
  const revoked = [];
  for (const s of allStaffs) {
    if (s.isAdmin === true) {
      await db.collection(COLLECTIONS.STAFF).doc(s._id).update({
        data: { isAdmin: false, updatedAt: new Date() },
      });
      revoked.push(s.employeeNo);
    }
  }

  // 第 2 步：找/创建目标 employeeNo
  const targetRes = await db
    .collection(COLLECTIONS.STAFF)
    .where({ employeeNo })
    .limit(1)
    .get();
  const now = new Date();
  const adminFields = {
    isAdmin: true,
    isTestAdmin: true,
    roleType: "ADMIN",
    updatedAt: now,
  };

  let result;
  if (targetRes.data.length) {
    const target = targetRes.data[0];
    await db.collection(COLLECTIONS.STAFF).doc(target._id).update({
      data: { ...adminFields, realName, phone },
    });
    result = { action: "updated", _id: target._id, employeeNo, realName, phone };
  } else {
    const newDoc = {
      employeeNo,
      realName,
      name: realName,
      phone,
      groupId: VALID_GROUPS.includes(groupId) ? groupId : "A组",
      roleType: "ADMIN",
      isAdmin: true,
      isTestAdmin: true,
      authorizedAirlines: [],
      authorizedAircraftTypes: [],
      qualifications: [],
      active: true,
      onLeave: false,
      createdAt: now,
      updatedAt: now,
    };
    const addRes = await db.collection(COLLECTIONS.STAFF).add({ data: newDoc });
    result = { action: "created", _id: addRes._id, ...newDoc };
  }

  cache.invalidate("PROFILE");
  cache.invalidate("STAFF_ALL");
  // 一次性开关：成功后自动关闭，避免遗忘导致管理员创建入口长期暴露。
  const bootstrapSettings = await db.collection(COLLECTIONS.SETTINGS).limit(200).get();
  for (const setting of bootstrapSettings.data || []) {
    if (setting.key === "bootstrapTestAdminEnabled" || setting.key === "bootstrapTestAdminToken") {
      await db.collection(COLLECTIONS.SETTINGS).doc(setting._id).update({
        data: {
          value: setting.key === "bootstrapTestAdminEnabled" ? "false" : "",
          updatedAt: new Date(),
        },
      });
    }
  }
  cache.invalidate("SETTINGS");

  return ok({
    adminEmployeeNo: employeeNo,
    revokedPrevious: revoked,
    ...result,
  }, `测试管理员 ${employeeNo} 已就绪（已撤销 ${revoked.length} 个旧 admin）`);
};

// ──────────────────────────────────────────────
// 为旧数据补充角色（60% SERVICE / 25% RELEASE / 15% BOTH）
// ──────────────────────────────────────────────
const migrateStaffRoles = async () => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const staffRes = await db
    .collection(COLLECTIONS.STAFF)
    .limit(200)
    .get();
  const staffs = staffRes.data || [];
  let updated = 0;
  for (let i = 0; i < staffs.length; i++) {
    const s = staffs[i];
    if (!s.roleType) {
      // 按索引分配：前60% SERVICE，再25% RELEASE，剩余 BOTH
      const roleType = i < staffs.length * 0.6 ? "SERVICE" : i < staffs.length * 0.85 ? "RELEASE" : "BOTH";
      await db.collection(COLLECTIONS.STAFF).doc(s._id).update({
        data: { roleType, updatedAt: new Date() },
      });
      updated++;
    }
  }
  cache.invalidate("STAFF_ALL");
  await logOperation(
    "MIGRATE_STAFF_ROLES",
    `为 ${updated} 人补充岗位角色`,
    { type: "staff", total: staffs.length, updated }
  );
  return ok({ total: staffs.length, updated }, `已为 ${updated} 人补充角色`);
};

// ──────────────────────────────────────────────
// 路由表
// ──────────────────────────────────────────────

// ──────────────────────────────────────────────
// 引导状态查询（仅返回脱敏信息）
// 任何登录员工都可调用，用来查看"现在能不能自举 admin"
// ──────────────────────────────────────────────
const getBootstrapStatus = async () => {
  const guard = await requireActiveStaff();
  if (!guard.ok) return guard.response;
  const enabled = String(await getSettingValue("bootstrapTestAdminEnabled", "false")) === "true";
  const tokenConfigured = !!(await getSettingValue("bootstrapTestAdminToken", ""));
  const existingAdmins = await db.collection(COLLECTIONS.STAFF)
    .where({ isAdmin: true }).limit(100).get();
  const adminCountResult = await db.collection(COLLECTIONS.STAFF)
    .where({ isAdmin: true }).count();
  const adminCount = adminCountResult.total || 0;
  const usableAdmins = (existingAdmins.data || []).filter((staff) =>
    staff.active !== false &&
    typeof staff.openid === "string" &&
    !!staff.openid.trim()
  );
  const usableAdminCount = usableAdmins.length;
  const staleAdminCount = Math.max(0, adminCount - usableAdminCount);
  const staffTotal = await db.collection(COLLECTIONS.STAFF).count();
  const { openid } = getOpenContext();
  let currentStaff = null;
  if (openid) {
    const currentResult = await db.collection(COLLECTIONS.STAFF)
      .where({ openid })
      .limit(1)
      .get();
    currentStaff = (currentResult.data || [])[0] || null;
  }

  const currentEmployeeNo = currentStaff ? currentStaff.employeeNo || "" : "";
  const currentName = currentStaff
    ? currentStaff.name || currentStaff.realName || currentEmployeeNo
    : "";
  const currentPhone = currentStaff ? currentStaff.phone || "" : "";
  const currentUserIsAdmin = !!(
    currentStaff &&
    currentStaff.active !== false &&
    currentStaff.isAdmin === true
  );
  const consoleCall = {
    employeeNo: currentEmployeeNo || "GH001",
    confirmText: "CREATE_FIRST_ADMIN",
  };

  let steps;
  if (currentUserIsAdmin) {
    steps = [
      "当前微信账号已经具备管理员权限，无需再次自举",
      "返回“我的”或首页即可进入管理员功能",
    ];
  } else if (usableAdminCount > 0) {
    steps = [
      "系统已经存在可用管理员，首个管理员自举已自动关闭",
      "请让现有管理员通过 setStaffAdmin 为你的工号授权",
    ];
  } else if (!currentStaff) {
    steps = [
      "请先返回登录页，使用准备设为管理员的工号完成登录",
      "登录成功后重新进入“我的 → 管理员引导”",
    ];
  } else {
    steps = [
      "1. 在微信开发者工具上传并部署 cloudfunctions/bootstrapAdmin",
      "2. 打开函数管理页面 → bootstrapAdmin → 云端测试，不要在小程序调试器中调用",
      `3. 使用页面下方参数执行，目标工号为 ${currentEmployeeNo}`,
      "4. 执行成功后回到本页，点击“刷新管理员状态”",
    ];
    if (staleAdminCount > 0) {
      steps.unshift(`检测到 ${staleAdminCount} 个未绑定或已停用的旧管理员，执行时会撤销这些失效权限`);
    }
  }

  return ok({
    enabled,
    tokenConfigured,
    adminCount,
    usableAdminCount,
    staleAdminCount,
    staffTotal: staffTotal.total,
    currentUserBound: !!currentStaff,
    currentUserIsAdmin,
    currentEmployeeNo,
    currentName,
    currentPhone,
    consoleFunctionName: "bootstrapAdmin",
    consoleCall,
    steps,
    // 兼容旧的 settings + token 自举方式。
    sampleCall: {
      type: "bootstrapTestAdmin",
      data: {
        employeeNo: currentEmployeeNo || "GH001",
        realName: currentName || "你的姓名",
        phone: currentPhone || "13800000000",
        bootstrapToken: "<与 settings.bootstrapTestAdminToken 完全相同>",
      },
    },
  });
};

// ──────────────────────────────────────────────
// 管理员工作台聚合数据
// ──────────────────────────────────────────────
const getAdminDashboard = async (event) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const rawDate = (event.data || {}).scheduleDate;
  if (rawDate !== undefined && (
    typeof rawDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)
  )) return fail("排班日期格式错误", 400);
  const scheduleDate = rawDate || formatDate(new Date());

  const [staffRes, scheduleRes, swapRes, leaveRes, leaveEmployeeNos] = await Promise.all([
    db.collection(COLLECTIONS.STAFF).limit(200).get(),
    db.collection(COLLECTIONS.SCHEDULES)
      .where({ scheduleDate })
      .limit(500)
      .get(),
    db.collection(COLLECTIONS.SWAP_REQUESTS)
      .where({ status: "PENDING" })
      .limit(100)
      .get(),
    db.collection(COLLECTIONS.LEAVE_REQUESTS)
      .where({ status: "PENDING" })
      .limit(100)
      .get(),
    getApprovedLeaveEmployeeNos(scheduleDate),
  ]);

  const staffs = (staffRes.data || []).filter((staff) => staff.isTestAdmin !== true);
  const activeStaff = staffs.filter((staff) => staff.active !== false);
  const schedules = (scheduleRes.data || []).filter(
    (schedule) => schedule.recordStatus !== "archived" && schedule.status !== "CANCELLED"
  );
  const assignedStaffIds = new Set(schedules.map((schedule) => schedule.staffId).filter(Boolean));
  const unassignedStaff = activeStaff.filter(
    (staff) => !assignedStaffIds.has(staff._id) && !leaveEmployeeNos.has(staff.employeeNo)
  );
  const leaveConflicts = schedules.filter((schedule) =>
    schedule.needsReassignment === true ||
    leaveEmployeeNos.has(schedule.staffEmployeeNo || "")
  );

  let qualificationRiskCount = 0;
  const now = Date.now();
  staffs.forEach((staff) => {
    (staff.qualifications || []).forEach((qualification) => {
      if (!qualification.validUntil || qualification.validUntil === "未知") return;
      const expiry = new Date(qualification.validUntil).getTime();
      if (Number.isFinite(expiry) && expiry - now <= 60 * 86400000) {
        qualificationRiskCount += 1;
      }
    });
  });

  let recentOperations = [];
  try {
    const logRes = await db.collection(COLLECTIONS.OPERATION_LOGS)
      .orderBy("createdAt", "desc")
      .limit(5)
      .get();
    recentOperations = (logRes.data || []).map((item) => ({
      action: item.action || "",
      operator: item.operator || "",
      detail: String(item.detail || "").slice(0, 160),
      createdAt: item.createdAt || null,
    }));
  } catch (_) {
    recentOperations = [];
  }

  const pendingSwapCount = (swapRes.data || []).length;
  const pendingLeaveCount = (leaveRes.data || []).length;
  const issueCount =
    unassignedStaff.length +
    leaveConflicts.length +
    pendingSwapCount +
    pendingLeaveCount +
    qualificationRiskCount;

  return ok({
    scheduleDate,
    operator: {
      employeeNo: guard.staff.employeeNo || "",
      name: guard.staff.name || guard.staff.realName || "",
    },
    staff: {
      total: staffs.length,
      active: activeStaff.length,
      inactive: staffs.length - activeStaff.length,
      admins: staffs.filter((staff) => staff.isAdmin === true).length,
    },
    schedule: {
      total: schedules.length,
      assignedPeople: assignedStaffIds.size,
      completed: schedules.filter((schedule) => schedule.status === "COMPLETED").length,
      unassigned: unassignedStaff.length,
      leaveConflicts: leaveConflicts.length,
    },
    approvals: {
      swap: pendingSwapCount,
      leave: pendingLeaveCount,
      total: pendingSwapCount + pendingLeaveCount,
    },
    qualifications: {
      riskCount: qualificationRiskCount,
    },
    issueCount,
    health: issueCount === 0 ? "HEALTHY" : leaveConflicts.length > 0 ? "CRITICAL" : "ATTENTION",
    recentOperations,
  });
};

// ──────────────────────────────────────────────
// 人员管理列表
// ──────────────────────────────────────────────
const listStaffForAdmin = async (event) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const payload = event.data || {};
  const query = typeof payload.query === "string" ? payload.query.trim().toLowerCase().slice(0, 50) : "";
  if (payload.query !== undefined && typeof payload.query !== "string") {
    return fail("搜索参数格式错误", 400);
  }
  const groupId = typeof payload.groupId === "string"
    ? normalizeGroupId(payload.groupId)
    : payload.groupId || "";
  const roleType = payload.roleType || "";
  const status = payload.status || "ALL";
  if (groupId && !VALID_GROUPS.includes(groupId)) return fail("班组筛选值无效", 400);
  if (roleType && !VALID_ROLES.includes(roleType)) return fail("角色筛选值无效", 400);
  if (!["ALL", "ACTIVE", "INACTIVE", "ADMIN"].includes(status)) {
    return fail("状态筛选值无效", 400);
  }
  const page = Number(payload.page || 1);
  const pageSize = Number(payload.pageSize || 30);
  if (!Number.isInteger(page) || page < 1) return fail("页码格式错误", 400);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    return fail("每页条数需在 1 到 50 之间", 400);
  }

  const staffRes = await db.collection(COLLECTIONS.STAFF).limit(200).get();
  const all = (staffRes.data || [])
    .filter((staff) => staff.isTestAdmin !== true)
    .sort((a, b) => String(a.employeeNo || "").localeCompare(String(b.employeeNo || "")));
  const filtered = all.filter((staff) => {
    if (query) {
      const haystack = `${staff.employeeNo || ""} ${staff.name || staff.realName || ""}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (groupId && normalizeGroupId(staff.groupId) !== groupId) return false;
    if (roleType && staff.roleType !== roleType) return false;
    if (status === "ACTIVE" && staff.active === false) return false;
    if (status === "INACTIVE" && staff.active !== false) return false;
    if (status === "ADMIN" && staff.isAdmin !== true) return false;
    return true;
  });
  const start = (page - 1) * pageSize;
  const list = filtered.slice(start, start + pageSize).map((staff) => ({
    staffId: staff._id,
    employeeNo: staff.employeeNo || "",
    name: staff.name || staff.realName || "",
    groupId: normalizeGroupId(staff.groupId || ""),
    roleType: VALID_ROLES.includes(staff.roleType) ? staff.roleType : "SERVICE",
    active: staff.active !== false,
    isAdmin: staff.isAdmin === true,
    openidBound: typeof staff.openid === "string" && !!staff.openid.trim(),
    phoneMasked: staff.phone
      ? `${String(staff.phone).slice(0, 3)}****${String(staff.phone).slice(-4)}`
      : "",
    authorizedAircraftTypes: Array.isArray(staff.authorizedAircraftTypes)
      ? staff.authorizedAircraftTypes
      : [],
    authorizedAirlines: Array.isArray(staff.authorizedAirlines)
      ? staff.authorizedAirlines
      : [],
  }));

  return ok({
    list,
    total: filtered.length,
    page,
    pageSize,
    summary: {
      total: all.length,
      active: all.filter((staff) => staff.active !== false).length,
      inactive: all.filter((staff) => staff.active === false).length,
      admins: all.filter((staff) => staff.isAdmin === true).length,
      bound: all.filter((staff) => typeof staff.openid === "string" && !!staff.openid.trim()).length,
    },
  });
};

// ──────────────────────────────────────────────
// 更新人员的管理字段
// ──────────────────────────────────────────────
const updateStaffForAdmin = async (event) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const payload = event.data || {};
  if (typeof payload.staffId !== "string" || !payload.staffId.trim()) {
    return fail("人员ID格式错误", 400);
  }
  const targetResult = await db.collection(COLLECTIONS.STAFF).doc(payload.staffId.trim()).get();
  const target = targetResult.data;
  if (!target || !target._id) return fail("未找到目标人员", 404);

  const updates = {};
  if (payload.active !== undefined) {
    if (typeof payload.active !== "boolean") return fail("在职状态格式错误", 400);
    updates.active = payload.active;
  }
  if (payload.isAdmin !== undefined) {
    if (typeof payload.isAdmin !== "boolean") return fail("管理员状态格式错误", 400);
    updates.isAdmin = payload.isAdmin;
  }
  if (payload.groupId !== undefined) {
    const groupId = typeof payload.groupId === "string"
      ? normalizeGroupId(payload.groupId)
      : "";
    if (!VALID_GROUPS.includes(groupId)) {
      return fail("班组格式错误", 400);
    }
    updates.groupId = groupId;
  }
  if (payload.roleType !== undefined) {
    if (typeof payload.roleType !== "string" || !VALID_ROLES.includes(payload.roleType)) {
      return fail("角色格式错误", 400);
    }
    updates.roleType = payload.roleType;
  }
  if (payload.authorizedAircraftTypes !== undefined) {
    if (
      !Array.isArray(payload.authorizedAircraftTypes) ||
      payload.authorizedAircraftTypes.length > 20 ||
      !payload.authorizedAircraftTypes.every((item) =>
        typeof item === "string" && /^[A-Za-z0-9-]{2,12}$/.test(item.trim())
      )
    ) return fail("维修资质格式错误", 400);
    updates.authorizedAircraftTypes = Array.from(new Set(
      payload.authorizedAircraftTypes.map((item) => normalizeAircraftType(item.trim()))
    ));
  }
  if (payload.authorizedAirlines !== undefined) {
    if (
      !Array.isArray(payload.authorizedAirlines) ||
      payload.authorizedAirlines.length > 20 ||
      !payload.authorizedAirlines.every((item) =>
        typeof item === "string" &&
        item.trim().length >= 1 &&
        item.trim().length <= 30 &&
        !/[\u0000-\u001f]/.test(item)
      )
    ) return fail("航司授权格式错误", 400);
    updates.authorizedAirlines = Array.from(new Set(
      payload.authorizedAirlines
        .map((item) => normalizeAirlineName(item.trim()))
        .filter(Boolean)
    ));
  }
  if (!Object.keys(updates).length) return fail("没有可更新的字段", 400);

  const projectedTarget = { ...target, ...updates };
  const projectedOpenidBound =
    typeof projectedTarget.openid === "string" &&
    !!projectedTarget.openid.trim();
  if (
    projectedTarget.isAdmin === true &&
    (projectedTarget.active === false || !projectedOpenidBound)
  ) {
    return fail("管理员必须是在职且已绑定微信的员工", 409);
  }
  const affectsOwnAccess =
    target._id === guard.staff._id &&
    (updates.active === false || updates.isAdmin === false);
  if (affectsOwnAccess) return fail("不能停用自己或取消自己的管理员权限", 409);

  if (
    target.isAdmin === true &&
    target.active !== false &&
    typeof target.openid === "string" &&
    !!target.openid.trim() &&
    (updates.isAdmin === false || updates.active === false)
  ) {
    const adminResult = await db.collection(COLLECTIONS.STAFF)
      .where({ isAdmin: true })
      .limit(100)
      .get();
    const usableAdminCount = (adminResult.data || []).filter((staff) =>
      staff.active !== false &&
      typeof staff.openid === "string" &&
      !!staff.openid.trim()
    ).length;
    if (usableAdminCount <= 1) return fail("系统必须保留至少一名可用管理员", 409);
  }

  const changedFields = Object.keys(updates);
  await db.collection(COLLECTIONS.STAFF).doc(target._id).update({
    data: { ...updates, updatedAt: new Date() },
  });
  let impactedScheduleCount = 0;
  if (
    updates.active === false ||
    updates.roleType !== undefined ||
    updates.authorizedAircraftTypes !== undefined ||
    updates.authorizedAirlines !== undefined
  ) {
    const projectedStaff = { ...target, ...updates };
    const scheduleResult = await db.collection(COLLECTIONS.SCHEDULES)
      .where({
        staffId: target._id,
        scheduleDate: _.gte(formatDate(new Date())),
      })
      .limit(200)
      .get();
    for (const schedule of (scheduleResult.data || [])) {
      if (schedule.recordStatus === "archived" || schedule.status === "CANCELLED") continue;
      const roleMismatch = schedule._taskType === "SERVICE"
        ? !["SERVICE", "BOTH"].includes(projectedStaff.roleType)
        : schedule._taskType === "RELEASE"
          ? !["RELEASE", "BOTH"].includes(projectedStaff.roleType)
          : false;
      const qualificationMismatch = (
        !!schedule.airline &&
        !!schedule.aircraftType &&
        !hasQualification(projectedStaff, schedule.airline, schedule.aircraftType)
      );
      if (projectedStaff.active === false || roleMismatch || qualificationMismatch) {
        await db.collection(COLLECTIONS.SCHEDULES).doc(schedule._id).update({
          data: {
            needsReassignment: true,
            reassignmentReason: projectedStaff.active === false
              ? "人员已停用"
              : roleMismatch ? "岗位角色已变更" : "维修资质已变更",
            updatedAt: new Date(),
          },
        });
        impactedScheduleCount += 1;
      }
    }
  }
  cache.invalidate("PROFILE");
  cache.invalidate("STAFF_ALL");
  cache.invalidate("SCHEDULE_TABLE");
  await logOperation(
    "UPDATE_STAFF_ADMIN",
    `更新 ${target.name || target.employeeNo} 的管理资料：${changedFields.join("、")}`,
    {
      type: "staff",
      staffId: target._id,
      employeeNo: target.employeeNo,
      changedFields,
      impactedScheduleCount,
    }
  );

  return ok({
    staffId: target._id,
    employeeNo: target.employeeNo,
    changedFields,
    impactedScheduleCount,
  }, "人员资料已更新");
};

module.exports = {
  setStaffAdmin,
  setAllStaffAdmin,
  // 兼容入口：旧版 Token 自举流程仍由 security 回归测试覆盖，保留导出。
  bootstrapTestAdmin,
  migrateStaffRoles,
  getBootstrapStatus,
  getAdminDashboard,
  listStaffForAdmin,
  updateStaffForAdmin,
};
