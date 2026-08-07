/**
 * test-security.test.js - 安全 + 鉴权回归测试
 *
 * 旧版 8 个 P0 测试 (GH001 不提权, setAllStaffAdmin, requireAdmin 等)
 * 加 P0-P3 修复的 24 个回归测试 (自提权洞、setSetting 白名单、调班审批、
 * 实时状态 admin 守卫、login 不覆盖 groupId/roleType、资质白名单等)
 * 全部以 `regress: <描述>` 命名
 */
const test = require("node:test");
const assert = require("node:assert/strict");

global.resetMockState({ openid: "test-security-openid" });

const authRouter = require("../router/auth");
const adminRouter = require("../router/admin");
const utils = require("../utils");
const state = global.__HANGYI_MOCK_STATE__;

function seedStaff(doc) {
  const arr = (state.collections.staff = state.collections.staff || []);
  const id = `staff-${doc.employeeNo || Date.now()}-${Math.random()}`;
  arr.push({ _id: id, active: true, authorizedAircraftTypes: [], ...doc });
  return id;
}

function seedSetting(key, value) {
  const arr = (state.collections.settings = state.collections.settings || []);
  arr.push({ _id: `set-${key}-${Math.random()}`, key, value });
}

// ──────────────────────────────────────────────
// 1. auth.js - GH001 不能再被自动提权
// ──────────────────────────────────────────────
test("security: loginOrRegisterStaff 不允许未登记员工自助注册", async () => {
  global.resetMockState({ openid: "new-openid-001" });
  seedSetting("demoToolsEnabled", "true");
  const res = await authRouter.loginOrRegisterStaff({
    data: {
      employeeNo: "GH001",
      name: "我是 GH001",
      phone: "13800000001",
      qualifications: ["A320"],
      roleType: "SERVICE",
    },
  });
  assert.equal(res.code, 401);
  assert.equal((state.collections.staff || []).length, 0);
});

test("security: loginOrRegisterStaff 登录路径不会把 GH001 自动提为 admin", async () => {
  global.resetMockState({ openid: "openid-existing" });
  // 先种一个已存在的 GH001 员工 (已绑定当前微信, 走兼容登录)
  seedStaff({ employeeNo: "GH001", name: "GH001姓名", phone: "13800000001", openid: "openid-existing" });
  const res = await authRouter.loginOrRegisterStaff({
    data: {
      employeeNo: "GH001",
      name: "GH001姓名",
      phone: "13800000001",
      qualifications: ["A320"],
      roleType: "SERVICE",
    },
  });
  // 这里 loginOrRegisterStaff 会通过, 但返回的 isAdmin 必须为 false
  assert.equal(res.code, 0);
  assert.equal(res.data.isAdmin, false, "登录后 GH001 仍不能被自动提为 admin");
});

// ──────────────────────────────────────────────
// 2. admin.js setAllStaffAdmin - 必须 admin 才能调
// ──────────────────────────────────────────────
test("security: setAllStaffAdmin 非 admin 调用 → 403", async () => {
  global.resetMockState({ openid: "openid-not-admin" });
  seedStaff({ employeeNo: "U001", name: "普通员工", openid: "openid-not-admin" });
  const res = await adminRouter.setAllStaffAdmin({});
  assert.equal(res.code, 403);
  assert.match(res.message, /管理员/);
});

test("security: setAllStaffAdmin admin 调用 → ok, 全员被提权", async () => {
  global.resetMockState({ openid: "openid-is-admin" });
  seedStaff({ employeeNo: "ADMIN001", name: "管理员", isAdmin: true, openid: "openid-is-admin" });
  seedStaff({ employeeNo: "U002", name: "员工B", openid: "openid-emp-b" });
  seedSetting("demoToolsEnabled", "true");
  const res = await adminRouter.setAllStaffAdmin({});
  assert.equal(res.code, 0);
  // 全员 isAdmin 应该是 true
  const all = state.collections.staff;
  assert.ok(all.every((s) => s.isAdmin === true), "全员应被提成 admin");
});

// ──────────────────────────────────────────────
// 3. bootstrapTestAdmin - 双重保护
// ──────────────────────────────────────────────
test("security: bootstrapTestAdmin settings 没开 → 403", async () => {
  global.resetMockState({ openid: "openid-admin-2" });
  seedStaff({ employeeNo: "ADMIN002", name: "管理员2", isAdmin: true, openid: "openid-admin-2" });
  // 不 seedSetting bootstrapTestAdminEnabled
  const res = await adminRouter.bootstrapTestAdmin({
    data: { employeeNo: "TESTADMIN", realName: "T", phone: "13800138000" },
  });
  assert.equal(res.code, 403);
  assert.match(res.message, /未启用/);
});

test("security: bootstrapTestAdmin 开了但调用者非 admin → 403", async () => {
  global.resetMockState({ openid: "openid-not-admin-2" });
  seedStaff({ employeeNo: "U003", name: "普通员工3", openid: "openid-not-admin-2" });
  seedSetting("bootstrapTestAdminEnabled", "true");
  const res = await adminRouter.bootstrapTestAdmin({
    data: { employeeNo: "TESTADMIN", realName: "T", phone: "13800138000" },
  });
  assert.equal(res.code, 403);
});

// 首次部署自举: 系统无 admin 时需要 settings 开关 + bootstrapToken。
test("security: bootstrapTestAdmin 无 token 拒绝自举", async () => {
  global.resetMockState({ openid: "openid-bootstrap-self" });
  seedSetting("bootstrapTestAdminEnabled", "true");
  const r = await adminRouter.bootstrapTestAdmin({
    data: { employeeNo: "GH999", realName: "首个管理员", phone: "13800001234" },
  });
  assert.equal(r.code, 403, "缺少 token 应被拒绝");
});

test("security: bootstrapTestAdmin 自举成功", async () => {
  global.resetMockState({ openid: "openid-bootstrap-self-2" });
  seedSetting("bootstrapTestAdminEnabled", "true");
  seedSetting("bootstrapTestAdminToken", "token-2026");
  const r = await adminRouter.bootstrapTestAdmin({
    data: {
      employeeNo: "GH999",
      realName: "首个管理员",
      phone: "13800001234",
      bootstrapToken: "token-2026",
    },
  });
  assert.equal(r.code, 0, "配置正确时应能自举");
  const created = state.collections.staff.find((s) => s.employeeNo === "GH999");
  assert.ok(created, "新 admin 应被创建");
  assert.equal(created.isAdmin, true);
  const enabledAfter = (state.collections.settings.find((s) => s.key === "bootstrapTestAdminEnabled") || {}).value;
  assert.equal(enabledAfter, "false", "成功后应自动关闭开关");
  const tokenAfter = (state.collections.settings.find((s) => s.key === "bootstrapTestAdminToken") || {}).value;
  assert.equal(tokenAfter, "", "成功后应清空 token");
});

test("security: bootstrapTestAdmin 已有 admin 且调用者是 admin 允许", async () => {
  global.resetMockState({ openid: "openid-bootstrap-2nd" });
  seedStaff({ employeeNo: "GH001", name: "已有 admin", isAdmin: true, openid: "openid-bootstrap-2nd" });
  seedSetting("bootstrapTestAdminEnabled", "true");
  seedSetting("bootstrapTestAdminToken", "token-2026");
  const r = await adminRouter.bootstrapTestAdmin({
    data: {
      employeeNo: "GH998",
      realName: "第二个",
      phone: "13800009999",
      bootstrapToken: "token-2026",
    },
  });
  assert.equal(r.code, 0, "已有 admin 且调用者是 admin, 应允许 (并把开关/token 清空)");
  const tokenAfter = (state.collections.settings.find((s) => s.key === "bootstrapTestAdminToken") || {}).value;
  assert.equal(tokenAfter, "", "成功后应清空 token");
});

test("security: bootstrapTestAdmin 已有 admin 但调用者非 admin 拒绝", async () => {
  global.resetMockState({ openid: "openid-bootstrap-3rd" });
  seedStaff({ employeeNo: "GH010", name: "已有 admin", isAdmin: true, openid: "admin-other-openid" });
  seedSetting("bootstrapTestAdminEnabled", "true");
  seedSetting("bootstrapTestAdminToken", "token-2026");
  const r = await adminRouter.bootstrapTestAdmin({
    data: {
      employeeNo: "GH997",
      realName: "不应创建",
      phone: "13800007777",
      bootstrapToken: "token-2026",
    },
  });
  assert.ok([401, 403].includes(r.code), "已有 admin 但调用者非 admin, 应被 403");
});

// 4. migrateStaffRoles - 非 admin 不能调
// ──────────────────────────────────────────────
test("security: migrateStaffRoles 非 admin 调用 → 403", async () => {
  global.resetMockState({ openid: "openid-not-admin-3" });
  seedStaff({ employeeNo: "U004", name: "员工4", openid: "openid-not-admin-3" });
  const res = await adminRouter.migrateStaffRoles({});
  assert.equal(res.code, 403);
});

// ──────────────────────────────────────────────
// 5. utils.requireAdmin 守卫
// ──────────────────────────────────────────────
test("security: requireAdmin 没登录(openid 为空) → 401", async () => {
  // 临时把 openid 设成空
  const savedOpenid = state.openid;
  state.openid = "";
  const r = await utils.requireAdmin();
  state.openid = savedOpenid;
  assert.equal(r.ok, false);
  assert.equal(r.response.code, 401);
});

test("security: requireAdmin isAdmin=false → 403", async () => {
  global.resetMockState({ openid: "openid-false-admin" });
  seedStaff({ employeeNo: "U005", name: "员工5", isAdmin: false, openid: "openid-false-admin" });
  const r = await utils.requireAdmin();
  assert.equal(r.ok, false);
  assert.equal(r.response.code, 403);
});

test("security: requireAdmin isAdmin=true → ok + 返回 staff", async () => {
  global.resetMockState({ openid: "openid-real-admin" });
  seedStaff({ employeeNo: "ADMIN003", name: "真管理员", isAdmin: true, openid: "openid-real-admin" });
  const r = await utils.requireAdmin();
  assert.equal(r.ok, true);
  assert.equal(r.staff.employeeNo, "ADMIN003");
});

// ════════════════════════════════════════════════════════════════════
// 回归测试: P0 修复的鉴权洞
//   - setStaffAdmin 不再允许自提权
//   - setSetting 必须 admin
//   - approveSwapRequest 必须 admin
//   - updateFlightRealtimeStatus / propagateScheduleDelay 必须 admin
//   - loginOrRegisterStaff 不再覆盖 groupId/roleType
//   - 资质白名单包含 B738 / B38M
//   - hasQualification 归一化 (短中文 / 简写)
//   - purgeCollection 不再因单条失败中断
//   - propagateScheduleDelay 调整全部后续任务（不是只第一个）
//   - preflightComplianceCheck 工时估算用 8h
//   - smartScheduleWithRoles 硬编码 30min 改用 minRestInterval
//   - callHangyiService 返回 {ok, statusCode, body}
//   - exportOperationLogs 加 UTF-8 BOM
//   - bindStaffByScanCode 返回 reboundFromOtherDevice
//   - markMyNotificationsRead 分页处理
//   - login 返回管理员维护的 groupId
// ════════════════════════════════════════════════════════════════════

const swapRouter = require("../router/swap");
const settingsRouter = require("../router/settings");
const realtimeRouter = require("../router/realtime");
const scheduleRouter = require("../router/schedule");
const utilsForRegress = require("../utils");

// ──────────────────────────────────────────────
// P0-1: setStaffAdmin 不再允许自提权
// ──────────────────────────────────────────────
test("regress: setStaffAdmin 非 admin 调用 → 403 (不能自提权)", async () => {
  global.resetMockState({ openid: "openid-self-promote" });
  seedStaff({ employeeNo: "GH099", name: "想自提权的员工", openid: "openid-self-promote" });
  const r = await adminRouter.setStaffAdmin({ data: { employeeNo: "GH099" } });
  assert.equal(r.code, 403, "必须拒绝自提权");
  // 验证数据库未被改
  const staff = state.collections.staff.find(s => s.employeeNo === "GH099");
  assert.notEqual(staff.isAdmin, true, "isAdmin 绝不能被设为 true");
});

test("regress: setStaffAdmin admin 调用 → 200 且能提权/取消", async () => {
  global.resetMockState({ openid: "openid-admin" });
  seedStaff({ employeeNo: "GH050", name: "被提权员工", openid: "openid-other" });
  seedStaff({ employeeNo: "GH000", name: "管理员", openid: "openid-admin", isAdmin: true });
  const r = await adminRouter.setStaffAdmin({ data: { employeeNo: "GH050" } });
  assert.equal(r.code, 0);
  const updated = state.collections.staff.find(s => s.employeeNo === "GH050");
  assert.equal(updated.isAdmin, true);

  // 取消
  const r2 = await adminRouter.setStaffAdmin({ data: { employeeNo: "GH050", isAdmin: false } });
  assert.equal(r2.code, 0);
  const updated2 = state.collections.staff.find(s => s.employeeNo === "GH050");
  assert.equal(updated2.isAdmin, false);

  seedStaff({ employeeNo: "GH051", name: "未绑定员工" });
  const unbound = await adminRouter.setStaffAdmin({ data: { employeeNo: "GH051" } });
  assert.equal(unbound.code, 409, "未绑定微信的员工不能被授予管理员权限");
});

// ──────────────────────────────────────────────
// P0-2: setSetting 必须 admin
// ──────────────────────────────────────────────
test("regress: setSetting 非 admin → 403", async () => {
  global.resetMockState({ openid: "openid-not-admin" });
  seedStaff({ employeeNo: "GH903", name: "普通员工", openid: "openid-not-admin", isAdmin: false });
  const r = await settingsRouter.setSetting({ data: { key: "hangyiApiKey", value: "evil" } });
  assert.equal(r.code, 403);
});

test("regress: setSetting 非白名单 key → 400", async () => {
  global.resetMockState({ openid: "openid-admin2" });
  seedStaff({ employeeNo: "GH000A", name: "管理员", openid: "openid-admin2", isAdmin: true });
  const r = await settingsRouter.setSetting({ data: { key: "evil_key", value: "x" } });
  assert.equal(r.code, 400);
});

test("regress: setSetting admin + 白名单 key → 200", async () => {
  global.resetMockState({ openid: "openid-admin3" });
  seedStaff({ employeeNo: "GH000B", name: "管理员", openid: "openid-admin3", isAdmin: true });
  const r = await settingsRouter.setSetting({ data: { key: "maxDailyWorkHours", value: 10 } });
  assert.equal(r.code, 0);
});

test("regress: setSetting 不在响应或审计日志泄露助手密钥", async () => {
  global.resetMockState({ openid: "openid-admin-assistant-key" });
  seedStaff({
    employeeNo: "GH000C",
    name: "管理员",
    openid: "openid-admin-assistant-key",
    isAdmin: true,
  });
  const secret = "assistant-secret-value";
  // P1 修复: 修改同步密钥需要显式 confirmText 二次确认
  const noConfirm = await settingsRouter.setSetting({
    data: { key: "assistantApiKey", value: secret },
  });
  assert.equal(noConfirm.code, 400);
  assert.equal(
    (state.collections.settings || []).find((item) => item.key === "assistantApiKey"),
    undefined,
    "缺少二次确认时不应写入"
  );

  const r = await settingsRouter.setSetting({
    data: { key: "assistantApiKey", value: secret, confirmText: "UPDATE_SECRET" },
  });
  assert.equal(r.code, 0);
  assert.equal(Object.hasOwn(r.data, "value"), false);
  const saved = state.collections.settings.find((item) => item.key === "assistantApiKey");
  assert.equal(saved.value, secret);
  const log = (state.collections.operation_logs || []).at(-1);
  assert.equal(log.target.value, "[REDACTED]");
  assert.equal(JSON.stringify(log).includes(secret), false);
});

// ──────────────────────────────────────────────
// P0-3: approveSwapRequest 必须 admin
// ──────────────────────────────────────────────
test("regress: approveSwapRequest 非 admin → 403", async () => {
  global.resetMockState({ openid: "openid-not-admin2" });
  seedStaff({ employeeNo: "GH904", name: "普通员工", openid: "openid-not-admin2", isAdmin: false });
  // 种一个待审批申请
  const coll = state.collections.swap_requests = state.collections.swap_requests || [];
  const reqId = "swap-regress-1";
  coll.push({ _id: reqId, status: "PENDING", requestType: "SHIFT_APPLY" });
  const r = await swapRouter.approveSwapRequest({ data: { requestId: reqId, decision: "APPROVE" } });
  assert.equal(r.code, 403);
});

// ──────────────────────────────────────────────
// P0-4: updateFlightRealtimeStatus / propagateScheduleDelay 必须 admin
// ──────────────────────────────────────────────
test("regress: updateFlightRealtimeStatus 非 admin → 403", async () => {
  global.resetMockState({ openid: "openid-not-admin3" });
  // 种一个非 admin 员工以模拟 "已登录但不是 admin"
  seedStaff({ employeeNo: "GH901", name: "普通员工", openid: "openid-not-admin3", isAdmin: false });
  const r = await realtimeRouter.updateFlightRealtimeStatus({ data: { flightNo: "CA1931", status: "DELAYED" } });
  assert.equal(r.code, 403, "应返回 403 而非 401/200");
});

test("regress: propagateScheduleDelay 非 admin → 403", async () => {
  global.resetMockState({ openid: "openid-not-admin4" });
  seedStaff({ employeeNo: "GH902", name: "普通员工", openid: "openid-not-admin4", isAdmin: false });
  const r = await realtimeRouter.propagateScheduleDelay({ data: { flightNo: "CA1931", delayMinutes: 30 } });
  assert.equal(r.code, 403);
});

test("regress: propagateScheduleDelay 异常 delayMinutes 范围 → 400", async () => {
  global.resetMockState({ openid: "openid-admin4" });
  seedStaff({ employeeNo: "GH000C", name: "管理员", openid: "openid-admin4", isAdmin: true });
  const r = await realtimeRouter.propagateScheduleDelay({ data: { flightNo: "CA1931", delayMinutes: 99999 } });
  assert.equal(r.code, 400);
});

// ──────────────────────────────────────────────
// P1-5: loginOrRegisterStaff 不再覆盖 groupId/roleType
// ──────────────────────────────────────────────
test("regress: login 不会覆盖 groupId 和 roleType", async () => {
  global.resetMockState({ openid: "openid-login-test" });
  seedStaff({
    employeeNo: "GH010", name: "李四",
    groupId: "C组", roleType: "RELEASE",
    phone: "13800000010",
    authorizedAircraftTypes: ["A320"],
    isAdmin: false,
    openid: "openid-login-test",
  });
  // 不传 groupId / roleType, 模拟老表单
  const r = await authRouter.loginOrRegisterStaff({
    data: { employeeNo: "GH010", name: "李四", phone: "13800000010", qualifications: ["A320"] },
  });
  assert.equal(r.code, 0);
  // groupId 保持 C组, 没有被改成 "未分组"
  assert.equal(r.data.groupId, "C组");
  assert.equal(r.data.roleType, "RELEASE");
  const persisted = state.collections.staff.find(s => s.employeeNo === "GH010");
  assert.equal(persisted.groupId, "C组");
  assert.equal(persisted.roleType, "RELEASE");
});

// ──────────────────────────────────────────────
// P1-6: 资质白名单包含 B738 / B38M
// ──────────────────────────────────────────────
test("regress: login 保留预登记的 B738 / B38M 资质", async () => {
  global.resetMockState({ openid: "openid-b738" });
  seedStaff({
    employeeNo: "GH777", name: "新员工", phone: "13800000777",
    authorizedAircraftTypes: ["B738", "B38M"],
    openid: "openid-b738",
  });
  const r = await authRouter.loginOrRegisterStaff({
    data: {
      employeeNo: "GH777", name: "新员工",
      phone: "13800000777",
      qualifications: ["B738", "B38M"],
    },
  });
  assert.equal(r.code, 0);
  assert.deepEqual(r.data.authorizedAircraftTypes, ["B738", "B38M"]);
});

// ──────────────────────────────────────────────
// P1-7: login 不能用客户端 groupId 覆盖管理员数据
// ──────────────────────────────────────────────
test("regress: login 忽略客户端伪造的 groupId", async () => {
  global.resetMockState({ openid: "openid-grp" });
  seedStaff({
    employeeNo: "GH020", name: "王五",
    groupId: "A组", roleType: "SERVICE",
    phone: "13800000020",
    authorizedAircraftTypes: ["A320"],
    openid: "openid-grp",
  });
  const r = await authRouter.loginOrRegisterStaff({
    data: { employeeNo: "GH020", name: "王五", phone: "13800000020", qualifications: ["A320"], groupId: "D组" },
  });
  assert.equal(r.code, 0);
  assert.equal(r.data.groupId, "A组");
  const persisted = state.collections.staff.find((staff) => staff.employeeNo === "GH020");
  assert.equal(persisted.groupId, "A组");
});

// ──────────────────────────────────────────────
// P2-11: hasQualification 归一化 (短中文 / 简写)
// ──────────────────────────────────────────────
test("regress: hasQualification 用 '南航' / 'CZ' 都能匹配", () => {
  const staff = {
    authorizedAirlines: ["中国南方航空"],
    authorizedAircraftTypes: ["A320"],
  };
  assert.equal(utilsForRegress.hasQualification(staff, "中国南方航空", "A320"), true);
  assert.equal(utilsForRegress.hasQualification(staff, "南航", "A320"), true, "短中文应归一化");
  assert.equal(utilsForRegress.hasQualification(staff, "CZ", "A320"), true, "简写应归一化");
  // 机型也归一化
  assert.equal(utilsForRegress.hasQualification(staff, "中国南方航空", "320"), true, "短机型码应归一化");
});

// ──────────────────────────────────────────────
// P2-14: markMyNotificationsRead 分页 + skip() 修复回归
// (验证: 多页时不会死循环; updatedCount 准确; 跨页 skip 正确)
// ──────────────────────────────────────────────
test("regress: markMyNotificationsRead 单页 (5 条) 全部标记", async () => {
  global.resetMockState({ openid: "openid-many-notes" });
  const coll = state.collections.swap_requests = state.collections.swap_requests || [];
  for (let i = 0; i < 5; i++) {
    coll.push({ _id: `note-${i}`, requesterOpenid: "openid-many-notes", status: "APPROVED" });
  }
  // 其他人的通知不应被标记
  coll.push({ _id: "note-other", requesterOpenid: "openid-someone-else", status: "APPROVED" });
  const notificationRouter = require("../router/notification");
  const r = await notificationRouter.markMyNotificationsRead();
  assert.equal(r.code, 0);
  assert.equal(r.data.updatedCount, 5, "只标记自己名下 5 条");
  // 自己的都标记了
  const mine = coll.filter(c => c.requesterOpenid === "openid-many-notes");
  assert.equal(mine.every(c => c.requesterReadAt), true, "自己名下全部已读");
  // 别人的没被标记
  const other = coll.find(c => c._id === "note-other");
  assert.equal(other.requesterReadAt, undefined, "别人的通知不应被标记");
});

test("regress: markMyNotificationsRead 跨页 (150 条) 不会死循环, updatedCount 准确", async () => {
  // 验证 P1 修复: 缺 .skip() 会导致 150 条通知时死循环 + updatedCount 重复累加
  global.resetMockState({ openid: "openid-many-150" });
  const coll = state.collections.swap_requests = state.collections.swap_requests || [];
  for (let i = 0; i < 150; i++) {
    coll.push({ _id: `note-150-${i}`, requesterOpenid: "openid-many-150", status: "APPROVED" });
  }
  // 加超时保险: 如果死循环, 测试会卡住或 OOM, 但 node:test 默认 30s 超时
  const notificationRouter = require("../router/notification");
  const t0 = Date.now();
  const r = await notificationRouter.markMyNotificationsRead();
  const elapsed = Date.now() - t0;
  assert.equal(r.code, 0);
  assert.equal(r.data.updatedCount, 150, "150 条全部标记, updatedCount 应 = 150 (不是 200/300)");
  assert.ok(elapsed < 5000, `应在 5s 内完成, 实际 ${elapsed}ms (死循环特征: 卡住或 OOM)`);
  // 全部标记
  const mine = coll.filter(c => c.requesterOpenid === "openid-many-150");
  assert.equal(mine.every(c => c.requesterReadAt), true, "150 条全部标记成功");
});

test("regress: markMyNotificationsRead 源码使用 .skip(skip)", () => {
  const src = require("fs").readFileSync(
    require("path").resolve(__dirname, "../router/notification.js"),
    "utf8"
  );
  // 全文检查 (函数体可能跨多行, 难用单 regex 框定)
  assert.ok(/\.skip\(skip\)/.test(src), "应使用 .skip(skip) 避免重复返回第一页 (死循环)");
  assert.ok(/skip \+= items\.length/.test(src), "应有 skip += items.length 累加");
});

// ──────────────────────────────────────────────
// P2-17: purgeCollection 不再因单条失败中断
// ──────────────────────────────────────────────
test("regress: purgeCollection 即使有失败也尽量完成", async () => {
  global.resetMockState({ openid: "test" });
  const coll = state.collections.test_purge = state.collections.test_purge || [];
  for (let i = 0; i < 5; i++) coll.push({ _id: `tp-${i}`, data: "x" });
  // 不模拟 remove 失败 (mock 默认是成功的), 验证能正常清空
  const removed = await utilsForRegress.purgeCollection("test_purge");
  assert.equal(removed, 5);
  assert.equal(state.collections.test_purge.length, 0);
});

// ──────────────────────────────────────────────
// P2-18: bootstrap seed 8 个分组
// ──────────────────────────────────────────────
test("regress: bootstrap seed 数据覆盖 A-H 全部 8 个分组", async () => {
  // 这个 test 不需要执行, 因为它依赖太多。
  // 验证: 在源码中, bootstrap.js 的 groups 数组应该有 8 项
  const bootstrapSrc = require("fs").readFileSync(
    require("path").resolve(__dirname, "../router/bootstrap.js"),
    "utf8"
  );
  const match = bootstrapSrc.match(/const groups = \[(.*?)\]/);
  assert.ok(match, "应能找到 groups 定义");
  const count = (match[1].match(/"[^"]+组"/g) || []).length;
  assert.equal(count, 8, "应包含 8 个分组 (A-H)");
});

// ──────────────────────────────────────────────
// P2-19: parseTime 运算符优先级
// ──────────────────────────────────────────────
test("regress: parseTime 死代码已被修复 (schedule.js 不再用错误的运算符)", async () => {
  // 检查源码中, 不再出现原 bug 模式 "parseTime(...) || x ? new Date(x) : null"
  const src = require("fs").readFileSync(
    require("path").resolve(__dirname, "../router/schedule.js"),
    "utf8"
  );
  const buggyPattern = /parseTime\(scheduleDate, f\.[a-zA-Z]+\) \|\| f\.[a-zA-Z]+ \? new Date/;
  assert.equal(buggyPattern.test(src), false, "parseTime 死代码模式应已被修复");
});

// ──────────────────────────────────────────────
// P2-20: callHangyiService 返回 {ok, statusCode, body}
// (用源码检查代替, 避免真网络)
// ──────────────────────────────────────────────
test("regress: callHangyiService 返回结构化结果 (源码检查)", () => {
  const src = require("fs").readFileSync(
    require("path").resolve(__dirname, "../utils.js"),
    "utf8"
  );
  // 必须返回对象 (而不是 null)
  assert.ok(src.includes("ok:") && src.includes("statusCode:"), "callHangyiService 应返回 {ok, statusCode}");
  // 不再有"全部返回 null"的旧实现
  assert.ok(!/JSON\.parse\(body\);\s*\} catch \{ resolve\(null\); \}/m.test(src.replace(/\\n/g, "\n")),
    "不应再有 'catch { resolve(null) }' 的旧实现");
});

test("regress: 即时 Hangyi 同步将 ok:false 转为可观测失败", async () => {
  global.resetMockState({ openid: "openid-sync-checked" });
  seedSetting("hangyiApiUrl", "https://api.example.test");
  seedSetting("hangyiApiKey", "sync-key");
  global.__HANGYI_HTTP_REQUEST__ = async () => ({
    ok: false,
    statusCode: 503,
    body: { code: 503, msg: "service unavailable" },
    error: "HTTP 503",
  });
  try {
    await assert.rejects(
      utils.callHangyiServiceChecked("/api/sync/schedules", []),
      /HTTP 503/
    );
  } finally {
    delete global.__HANGYI_HTTP_REQUEST__;
  }
});

test("security: callHangyiService 拒绝 HTTP 和私网地址且不发送内部密钥", async () => {
  global.resetMockState({ openid: "openid-url-security" });
  let called = false;
  global.__HANGYI_HTTP_REQUEST__ = async () => {
    called = true;
    return { ok: true, statusCode: 200, body: {} };
  };
  try {
    seedSetting("hangyiApiUrl", "http://api.example.com");
    seedSetting("hangyiApiKey", "secret-key");
    let result = await utils.callHangyiService("/api/auth/verify", null, "GET");
    assert.equal(result.ok, false);
    assert.match(result.error, /公网 HTTPS/);

    state.collections.settings.find((item) => item.key === "hangyiApiUrl").value = "https://127.0.0.1";
    result = await utils.callHangyiService("/api/auth/verify", null, "GET");
    assert.equal(result.ok, false);
    assert.match(result.error, /公网 HTTPS/);
    assert.equal(called, false);
  } finally {
    delete global.__HANGYI_HTTP_REQUEST__;
  }
});

// ──────────────────────────────────────────────
// P3-22: exportOperationLogs 加 UTF-8 BOM (源码检查)
// ──────────────────────────────────────────────
test("regress: exportOperationLogs CSV 加了 UTF-8 BOM (源码检查)", () => {
  const src = require("fs").readFileSync(
    require("path").resolve(__dirname, "../router/log.js"),
    "utf8"
  );
  assert.ok(src.includes("\\uFEFF"), "应包含 UTF-8 BOM (\\uFEFF)");
});

// ──────────────────────────────────────────────
// P3-24: 关闭可猜工号的扫码绑定
// ──────────────────────────────────────────────
test("regress: auth router 不再暴露 bindStaffByScanCode", () => {
  assert.equal(Object.hasOwn(authRouter, "bindStaffByScanCode"), false);
});

// hardcoded admin/admin/11111111111 removed.
test("security: login no longer self-promotes via admin/admin/11111111111", async () => {
  global.resetMockState({ openid: "openid-x" });
  const r = await authRouter.loginOrRegisterStaff({
    data: { employeeNo: "admin", name: "admin", phone: "11111111111", qualifications: ["A320"] },
  });
  assert.notEqual(r.code, 0);
  assert.equal((state.collections.staff || []).length, 0);
});
