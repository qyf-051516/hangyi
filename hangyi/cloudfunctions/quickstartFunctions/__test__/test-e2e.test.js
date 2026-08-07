/**
 * test-e2e.test.js - 端到端测试套件
 *
 * 覆盖云函数核心端点中不依赖网络的关键路径
 * 已用源码检查覆盖:
 *   - syncToHangyi 的 4 个端点 (syncToHangyi/index.js)
 *   - 智能调度类 (smartSchedule* 等用到 orderBy 的)
 *   - schedule 端点中用到 _.gte / _.lte 的查询
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

global.resetMockState({ openid: "e2e-default" });

const authRouter = require("../router/auth");
const adminRouter = require("../router/admin");
const bootstrapRouter = require("../router/bootstrap");
const flightRouter = require("../router/flight");
const notificationRouter = require("../router/notification");
const realtimeRouter = require("../router/realtime");
const settingsRouter = require("../router/settings");
const swapRouter = require("../router/swap");
const leaveRouter = require("../router/leave");
const assistantRouter = require("../router/assistant");
const hangyiSyncRouter = require("../router/hangyi-sync");
const logRouter = require("../router/log");
const scheduleRouter = require("../router/schedule");
const quickstartFunction = require("../index");
const utilsRouter = require("../utils");
const cacheRouter = require("../cache");
const bootstrapAdminFunction = require("../../bootstrapAdmin/index");
const state = global.__HANGYI_MOCK_STATE__;

// ── 测试辅助 ────────────────────────────────────────────

// 仅改 openid, 不清空集合 (区别于 global.resetMockState)
function setOpenid(openid) {
  if (!global.__HANGYI_MOCK_STATE__) {
    global.resetMockState({ openid });
  } else {
    global.__HANGYI_MOCK_STATE__.openid = openid;
  }
}

function seedStaff(doc) {
  const arr = (state.collections.staff = state.collections.staff || []);
  const id = `staff-${doc.employeeNo || Date.now()}-${Math.random()}`;
  arr.push({ _id: id, active: true, onLeave: false, authorizedAircraftTypes: [], authorizedAirlines: [], ...doc });
  return id;
}
function seedFlight(doc) {
  const arr = (state.collections.flights = state.collections.flights || []);
  const id = `flight-${Math.random()}`;
  arr.push({ _id: id, ...doc });
  return id;
}
function seedSchedule(doc) {
  const arr = (state.collections.schedules = state.collections.schedules || []);
  const id = `sched-${Math.random()}`;
  arr.push({ _id: id, ...doc });
  return id;
}
function seedSetting(key, value) {
  const arr = (state.collections.settings = state.collections.settings || []);
  arr.push({ _id: `set-${key}-${Math.random()}`, key, value });
}
function seedSwap(doc) {
  const arr = (state.collections.swap_requests = state.collections.swap_requests || []);
  const id = `swap-${Math.random()}`;
  arr.push({ _id: id, status: "PENDING", ...doc });
  return id;
}
function seedLeave(doc) {
  const arr = (state.collections.leave_requests = state.collections.leave_requests || []);
  const id = `leave-${Math.random()}`;
  arr.push({ _id: id, status: "PENDING", ...doc });
  return id;
}
function seedOperationLog(doc) {
  const arr = (state.collections.operation_logs = state.collections.operation_logs || []);
  const id = `log-${Math.random()}`;
  arr.push({ _id: id, ...doc });
  return id;
}

function dateOffset(days = 0) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function seedDemoAdmin(openid) {
  const id = seedStaff({
    employeeNo: "DEMOADMIN",
    name: "演示管理员",
    openid,
    isAdmin: true,
  });
  seedSetting("demoToolsEnabled", "true");
  return id;
}

// ══════════════════════════════════════════════════════════════
// 模块 1: bootstrap (5 端点)
// ══════════════════════════════════════════════════════════════

test("e2e/bootstrap: getOpenId 返回 wxContext", async () => {
  global.resetMockState({ openid: "openid-bootstrap-test" });
  const r = await bootstrapRouter.getOpenId();
  assert.equal(r.code, 0);
  assert.equal(r.data.openid, "openid-bootstrap-test");
});

test("e2e/bootstrap: bootstrapData 创建集合 + 种子员工/配置", async () => {
  global.resetMockState({ openid: "", source: "" });
  const r = await bootstrapRouter.bootstrapData({
    data: { confirmText: "INITIALIZE_DEMO_DATA" },
  });
  assert.equal(r.code, 0);
  // staff 集合应有 60 名员工
  const staffCount = (state.collections.staff || []).length;
  assert.equal(staffCount, 60, "应 seed 60 名员工，硬编码 admin 已移除");
  // settings 集合应有默认配置
  const settingsCount = (state.collections.settings || []).length;
  assert.equal(settingsCount, 17, "应 seed 17 个默认配置");
  // 验证分组覆盖 A-H (P2-18 修复)
  const groups = new Set((state.collections.staff || []).map(s => s.groupId));
  assert.ok(groups.has("A组"));
  assert.ok(groups.has("H组"), "应包含 H 组 (修复 P2-18)");
});

test("e2e/bootstrap: bootstrapData 不会重复 seed 已存在员工", async () => {
  global.resetMockState({ openid: "", source: "" });
  state.collections.staff = state.collections.staff || [];
  // 预置 GH001
  seedStaff({ employeeNo: "GH001", name: "已存在" });
  const before = state.collections.staff.length;
  await bootstrapRouter.bootstrapData({ data: { confirmText: "INITIALIZE_DEMO_DATA" } });
  const gh001Count = state.collections.staff.filter(s => s.employeeNo === "GH001").length;
  assert.equal(gh001Count, 1, "不应重复插入 GH001");
});

test("e2e/bootstrap: 小程序客户端不能初始化演示数据", async () => {
  global.resetMockState({ openid: "openid-bootstrap-client", source: "wx_client" });
  const r = await quickstartFunction.main({
    type: "bootstrapData",
    data: { confirmText: "INITIALIZE_DEMO_DATA" },
  }, { __mockCloudbaseContext: { WX_OPENID: "openid-bootstrap-client", TCB_SOURCE: "wx_client" } });
  assert.equal(r.code, 403);
  assert.equal((state.collections.staff || []).length, 0);
});

test("e2e/context: 连续调用按本次上下文隔离 OPENID", async () => {
  global.resetMockState({ openid: "fallback-openid" });
  const first = await quickstartFunction.main({ type: "getOpenId", data: {} }, {
    __mockCloudbaseContext: { WX_OPENID: "context-openid-a", TCB_SOURCE: "wx_client" },
  });
  const second = await quickstartFunction.main({ type: "getOpenId", data: {} }, {
    __mockCloudbaseContext: { WX_OPENID: "context-openid-b", TCB_SOURCE: "wx_client" },
  });
  assert.equal(first.data.openid, "context-openid-a");
  assert.equal(second.data.openid, "context-openid-b");
});

test("e2e/bootstrap: resetDemoData 清空 + 重建", async () => {
  global.resetMockState({ openid: "openid-reset-admin" });
  seedDemoAdmin("openid-reset-admin");
  // 预存一些脏数据
  seedStaff({ employeeNo: "DIRTY001", name: "脏数据", openid: "dirty" });
  seedFlight({ flightNo: "DIRTY", scheduleDate: "2026-01-01" });
  const r = await bootstrapRouter.resetDemoData({ data: { confirmText: "RESET_DEMO_DATA" } });
  assert.equal(r.code, 0);
  // 脏数据应被清除
  const dirty = state.collections.staff.find(s => s.employeeNo === "DIRTY001");
  assert.equal(dirty, undefined);
  // 员工应被重新 seed
  const staffCount = (state.collections.staff || []).length;
  assert.equal(staffCount, 61, "应重建 60 名员工并保留当前管理员");
  const admin = state.collections.staff.find(s => s.employeeNo === "DEMOADMIN");
  assert.equal(admin.openid, "openid-reset-admin");
  assert.equal(admin.isAdmin, true);
  // 已下线的维修流量模拟数据不应再被生成
  const flightCount = (state.collections.flights || []).length;
  assert.equal(flightCount, 0);
});

test("e2e/bootstrap: resetDemoData 必须是管理员且显式开启演示工具", async () => {
  global.resetMockState({ openid: "openid-reset-disabled" });
  seedStaff({
    employeeNo: "ADMIN-DISABLED",
    name: "管理员",
    openid: "openid-reset-disabled",
    isAdmin: true,
  });
  seedFlight({ flightNo: "KEEP-ME", scheduleDate: dateOffset(1) });
  let r = await bootstrapRouter.resetDemoData();
  assert.equal(r.code, 403);
  assert.ok(state.collections.flights.some((item) => item.flightNo === "KEEP-ME"));

  global.resetMockState({ openid: "openid-reset-user" });
  seedStaff({
    employeeNo: "NORMAL-USER",
    name: "普通员工",
    openid: "openid-reset-user",
  });
  seedSetting("demoToolsEnabled", "true");
  r = await bootstrapRouter.resetDemoData();
  assert.equal(r.code, 403);
});

test("e2e/bootstrap: resetDemoData 缺 confirmText 二次确认被拒绝 (P1-F1)", async () => {
  global.resetMockState({ openid: "openid-reset-no-confirm" });
  seedDemoAdmin("openid-reset-no-confirm");
  seedSetting("demoToolsEnabled", "true");
  seedFlight({ flightNo: "KEEP-2", scheduleDate: dateOffset(1) });
  const r = await bootstrapRouter.resetDemoData({ data: {} });
  assert.equal(r.code, 400);
  assert.match(r.message, /confirmText/);
  // 未确认时不应发生任何清空重建
  assert.ok(state.collections.flights.some((item) => item.flightNo === "KEEP-2"));
});

// ══════════════════════════════════════════════════════════════
// 模块 2: auth (9 端点)
// ══════════════════════════════════════════════════════════════

test("e2e/auth: 手机号一键登录 完整流程 (预登记→登录→退出→换微信登录)", async () => {
  global.resetMockState({ openid: "openid-1" });
  seedStaff({
    employeeNo: "GH200", name: "测试用户", phone: "13800000200",
    authorizedAircraftTypes: ["A320", "B738"], groupId: "A组",
  });
  state.phoneByCode["code-gh200"] = { purePhoneNumber: "13800000200" };
  // 0) 未预绑定 openid 的旧表单登录必须被拒绝 (首次绑定只能走手机号一键登录)
  let r = await authRouter.loginOrRegisterStaff({
    data: { employeeNo: "GH200", name: "测试用户", phone: "13800000200" },
  });
  assert.equal(r.code, 401);
  assert.equal(state.collections.staff.find(s => s.employeeNo === "GH200").openid || "", "");
  // 1) 手机号一键登录完成首次绑定
  r = await authRouter.loginByPhone({ data: { phoneCode: "code-gh200" } });
  assert.equal(r.code, 0);
  assert.equal(r.data.isNew, false);
  assert.equal(r.data.groupId, "A组");
  // 2) 明确退出后允许在另一个微信重新绑定
  await authRouter.logoutStaff();
  setOpenid("openid-2");
  state.phoneByCode["code-gh200"] = { purePhoneNumber: "13800000200" };
  r = await authRouter.loginByPhone({ data: { phoneCode: "code-gh200" } });
  assert.equal(r.code, 0);
  assert.equal(r.data.isNew, false);
  // 3) 资质应被合并(去重)
  const persisted = state.collections.staff.find(s => s.employeeNo === "GH200");
  assert.ok(persisted.authorizedAircraftTypes.includes("A320"));
  assert.ok(persisted.authorizedAircraftTypes.includes("B738"));
  // 4) 验证 groupId 没被覆盖 (P1-5 修复)
  assert.equal(persisted.groupId, "A组");
});

test("e2e/auth: demo 模式允许 openid 为空档案用静态资料完成首次绑定", async () => {
  global.resetMockState({ openid: "openid-demo-bind" });
  seedSetting("demoToolsEnabled", "true");
  seedStaff({
    employeeNo: "GH900",
    name: "演示员工",
    phone: "11111111111",
    authorizedAircraftTypes: ["A320"],
    groupId: "A组",
  });
  const r = await authRouter.loginOrRegisterStaff({
    data: { employeeNo: "GH900", name: "演示员工", phone: "11111111111" },
  });
  assert.equal(r.code, 0, "demo 模式应允许静态资料首次绑定");
  const staff = state.collections.staff.find((s) => s.employeeNo === "GH900");
  assert.equal(staff.openid, "openid-demo-bind", "首次绑定应写入当前 openid");
  // 绑定后再次登录(已绑定当前微信)也应成功
  const r2 = await authRouter.loginOrRegisterStaff({
    data: { employeeNo: "GH900", name: "演示员工", phone: "11111111111" },
  });
  assert.equal(r2.code, 0);
});

test("e2e/auth: demo 模式已绑定其他微信的档案仍禁止抢占", async () => {
  global.resetMockState({ openid: "openid-demo-attacker" });
  seedSetting("demoToolsEnabled", "true");
  seedStaff({
    employeeNo: "GH901",
    name: "已绑定演示员工",
    phone: "11111111112",
    openid: "openid-demo-owner",
  });
  const r = await authRouter.loginOrRegisterStaff({
    data: { employeeNo: "GH901", name: "已绑定演示员工", phone: "11111111112" },
  });
  assert.equal(r.code, 401, "demo 模式也不允许抢占已绑定账号");
  assert.equal(
    state.collections.staff.find((s) => s.employeeNo === "GH901").openid,
    "openid-demo-owner",
    "原绑定不能被覆盖"
  );
});

test("e2e/auth: loginOrRegisterStaff 不信任客户端提交的资质", async () => {
  global.resetMockState({ openid: "x" });
  seedStaff({
    employeeNo: "GH201", name: "test", phone: "13800000201",
    authorizedAircraftTypes: ["B738"], openid: "x",
  });
  const r = await authRouter.loginOrRegisterStaff({
    data: { employeeNo: "GH201", name: "test", phone: "13800000201", qualifications: ["INVALID"] },
  });
  assert.equal(r.code, 0);
  assert.deepEqual(r.data.authorizedAircraftTypes, ["B738"]);
});

test("e2e/auth: loginOrRegisterStaff 拒绝无效工号 (空)", async () => {
  global.resetMockState({ openid: "x" });
  const r = await authRouter.loginOrRegisterStaff({ data: { name: "no-id" } });
  assert.equal(r.code, 400);
});

test("e2e/auth: 已绑定场景工号姓名不匹配 → 401", async () => {
  global.resetMockState({ openid: "x" });
  seedStaff({ employeeNo: "GH202", name: "原姓名", phone: "13800000202", openid: "x" });
  const r = await authRouter.loginOrRegisterStaff({
    data: { employeeNo: "GH202", name: "错的姓名", phone: "13800000202" },
  });
  assert.equal(r.code, 401);
});

test("e2e/auth: 未绑定微信不能通过工号表单覆盖预登记手机号", async () => {
  global.resetMockState({ openid: "openid-phone-mismatch" });
  seedStaff({ employeeNo: "GH202B", name: "预登记员工", phone: "13800000221" });
  const r = await authRouter.loginOrRegisterStaff({
    data: { employeeNo: "GH202B", name: "预登记员工", phone: "13800000222" },
  });
  assert.equal(r.code, 401);
  assert.equal(state.collections.staff[0].phone, "13800000221");
  assert.equal(state.collections.staff[0].openid || "", "");
});

test("e2e/auth: 缺少预登记手机号的档案不能被未绑定微信登录占用", async () => {
  global.resetMockState({ openid: "openid-missing-phone" });
  seedStaff({ employeeNo: "GH202M", name: "缺手机号员工", phone: "" });
  const r = await authRouter.loginOrRegisterStaff({
    data: { employeeNo: "GH202M", name: "缺手机号员工", phone: "13800000229" },
  });
  assert.equal(r.code, 401);
  assert.equal(state.collections.staff[0].openid || "", "");
});

test("e2e/auth: 未预登记员工不能通过 Web 主数据回源登录", async () => {
  global.resetMockState({ openid: "openid-java-sync" });
  seedSetting("hangyiApiUrl", "https://api.example.com");
  seedSetting("hangyiApiKey", "test-key");
  let called = false;
  global.__HANGYI_HTTP_REQUEST__ = async (request) => {
    called = true;
    return {
      ok: true,
      statusCode: 200,
      body: {
        code: 200,
        data: {
          employeeNo: "GHJAVA1",
          name: "跨端员工",
          phone: "13800000881",
          groupId: "B组",
          active: true,
          roleType: "BOTH",
          authorizedAirlines: ["CZ", "MU"],
          authorizedAircraftTypes: ["A320", "B738"],
          qualifications: [{
            aircraftType: "A320",
            certNo: "JX-GHJAVA1-A320",
            issueDate: "2025-01-01",
            validUntil: "2027-01-01",
            status: "VALID",
          }],
        },
      },
      error: null,
    };
  };
  try {
    const r = await authRouter.loginOrRegisterStaff({
      data: { employeeNo: "GHJAVA1", name: "跨端员工", phone: "13800000881" },
    });
    // 登录路径不再回源 Web 主数据：未预登记员工直接 401，等待定时同步 + 手机号一键登录。
    assert.equal(r.code, 401);
    assert.equal(called, false, "登录路径不应再调用 Web 主数据服务");
    assert.equal((state.collections.staff || []).length, 0);
  } finally {
    delete global.__HANGYI_HTTP_REQUEST__;
  }
});

test("e2e/auth: 已绑定其他微信的账号不能被工号登录抢占", async () => {
  global.resetMockState({ openid: "openid-attacker" });
  seedStaff({
    employeeNo: "GH202C",
    name: "已绑定员工",
    phone: "13800000223",
    openid: "openid-owner",
  });
  const r = await authRouter.loginOrRegisterStaff({
    data: { employeeNo: "GH202C", name: "已绑定员工", phone: "13800000223" },
  });
  assert.equal(r.code, 401);
  assert.equal(state.collections.staff[0].openid, "openid-owner");
});

test("e2e/auth: 生产模式不能由客户端自建员工和资质", async () => {
  global.resetMockState({ openid: "openid-forged-staff" });
  const r = await authRouter.loginOrRegisterStaff({
    data: {
      employeeNo: "FORGED001",
      name: "伪造员工",
      phone: "13800000999",
      groupId: "A组",
      roleType: "BOTH",
      qualifications: ["A320", "B737"],
    },
  });
  assert.equal(r.code, 401);
  assert.equal((state.collections.staff || []).length, 0);
});

test("e2e/auth: getMyProfile 每次读取当前绑定，账号切换不复用旧身份", async () => {
  global.resetMockState({ openid: "openid-profile" });
  const ordinaryId = seedStaff({
    employeeNo: "GH203",
    name: "普通员工",
    openid: "openid-profile",
    isAdmin: false,
  });
  const adminId = seedStaff({
    employeeNo: "GH203ADMIN",
    name: "管理员",
    openid: "",
    isAdmin: true,
  });
  const r1 = await authRouter.getMyProfile();
  assert.equal(r1.code, 0);
  assert.equal(r1.data.employeeNo, "GH203");

  // 模拟账号切换发生在另一个云函数实例，本实例没有收到缓存失效通知。
  state.collections.staff.find((item) => item._id === ordinaryId).openid = "";
  state.collections.staff.find((item) => item._id === adminId).openid = "openid-profile";

  const r2 = await authRouter.getMyProfile();
  assert.equal(r2.code, 0);
  assert.equal(r2.data.employeeNo, "GH203ADMIN");
  assert.equal(r2.data.isAdmin, true);
});

test("e2e/auth: getMyProfile 未登录 → 404", async () => {
  global.resetMockState({ openid: "openid-not-bound" });
  const r = await authRouter.getMyProfile();
  assert.equal(r.code, 404);
});

test("e2e/auth: getMyProfile 实时反映管理员授权，forceRefresh 保持兼容", async () => {
  global.resetMockState({ openid: "openid-profile-force" });
  const staffId = seedStaff({
    employeeNo: "GH203A",
    name: "外部授权员工",
    openid: "openid-profile-force",
    isAdmin: false,
  });
  const before = await authRouter.getMyProfile();
  assert.equal(before.data.isAdmin, false);

  const staff = state.collections.staff.find((item) => item._id === staffId);
  staff.isAdmin = true;

  const current = await authRouter.getMyProfile();
  assert.equal(current.data.isAdmin, true);
  const refreshed = await authRouter.getMyProfile({ data: { forceRefresh: true } });
  assert.equal(refreshed.data.isAdmin, true);
});

test("e2e/auth: updateMyProfile 仅允许本人更新手机号", async () => {
  global.resetMockState({ openid: "openid-upd" });
  seedStaff({
    employeeNo: "GH204",
    name: "王五",
    openid: "openid-upd",
    groupId: "A组",
    authorizedAircraftTypes: ["A320"],
  });
  const forbidden = await authRouter.updateMyProfile({
    data: { groupId: "D组", qualifications: ["A321", "B737"], phone: "13800001234" },
  });
  assert.equal(forbidden.code, 403);
  const r = await authRouter.updateMyProfile({
    data: { phone: "13800001234" },
  });
  assert.equal(r.code, 0);
  const p = state.collections.staff.find(s => s.employeeNo === "GH204");
  assert.equal(p.groupId, "A组");
  assert.deepEqual(p.authorizedAircraftTypes, ["A320"]);
  assert.equal(p.phone, "13800001234");
});

test("e2e/auth: updateMyProfile 手机号格式错 → 400", async () => {
  global.resetMockState({ openid: "openid-upd2" });
  seedStaff({ employeeNo: "GH205", name: "test", openid: "openid-upd2" });
  const r = await authRouter.updateMyProfile({
    data: { groupId: "A组", qualifications: ["A320"], phone: "12345" },
  });
  assert.equal(r.code, 400);
});

test("e2e/auth: updateMyAvatar 正常流程", async () => {
  global.resetMockState({ openid: "openid-avatar" });
  seedStaff({ employeeNo: "GH206", name: "test", openid: "openid-avatar" });
  const r = await authRouter.updateMyAvatar({ data: { avatarFileID: "cloud://mock/avatars/test.jpg" } });
  assert.equal(r.code, 0);
  const p = state.collections.staff.find(s => s.employeeNo === "GH206");
  assert.equal(p.avatarFileID, "cloud://mock/avatars/test.jpg");
});

test("e2e/auth: logoutStaff 清除 openid", async () => {
  global.resetMockState({ openid: "openid-logout" });
  seedStaff({ employeeNo: "GH207", name: "test", openid: "openid-logout" });
  const r = await authRouter.logoutStaff();
  assert.equal(r.code, 0);
  assert.equal(r.data.unboundCount, 1);
  const p = state.collections.staff.find(s => s.employeeNo === "GH207");
  assert.equal(p.openid, "", "openid 应被清空");
});

test("e2e/auth: logoutStaff 清除重复绑定并立即失效资料缓存", async () => {
  global.resetMockState({ openid: "openid-logout-duplicate" });
  seedStaff({ employeeNo: "GH207A", name: "旧账号", openid: "openid-logout-duplicate" });
  seedStaff({ employeeNo: "GH207B", name: "当前账号", openid: "openid-logout-duplicate" });

  const before = await authRouter.getMyProfile();
  assert.equal(before.code, 0);

  const r = await authRouter.logoutStaff();
  assert.equal(r.code, 0);
  assert.equal(r.data.unboundCount, 2);
  const stillBound = state.collections.staff.filter(s => s.openid === "openid-logout-duplicate");
  assert.equal(stillBound.length, 0, "同一微信的全部历史绑定都应清除");

  const after = await authRouter.getMyProfile();
  assert.equal(after.code, 404, "退出后不得从云函数缓存返回旧资料");
});

test("e2e/auth: logoutStaff 重复调用保持成功", async () => {
  global.resetMockState({ openid: "openid-already-logout" });
  const r = await authRouter.logoutStaff();
  assert.equal(r.code, 0);
  assert.equal(r.data.unboundCount, 0);
  assert.equal(r.data.alreadyLoggedOut, true);
});

test("e2e/auth: 切换员工登录时清除当前微信的旧绑定", async () => {
  global.resetMockState({ openid: "openid-switch-account" });
  seedStaff({ employeeNo: "GH207C", name: "旧员工", openid: "openid-switch-account" });
  seedStaff({
    employeeNo: "GH207D",
    name: "新员工",
    openid: "",
    authorizedAircraftTypes: ["A320"],
    phone: "13800000207",
    isAdmin: true,
  });
  state.phoneByCode["code-gh207d"] = { purePhoneNumber: "13800000207" };

  // 未绑定的新员工只能走手机号一键登录完成绑定/切换。
  const r = await authRouter.loginByPhone({ data: { phoneCode: "code-gh207d" } });
  assert.equal(r.code, 0);
  assert.equal(state.collections.staff.find(s => s.employeeNo === "GH207C").openid, "");
  assert.equal(
    state.collections.staff.find(s => s.employeeNo === "GH207D").openid,
    "openid-switch-account"
  );
  const profile = await authRouter.getMyProfile();
  assert.equal(profile.data.employeeNo, "GH207D");
  assert.equal(profile.data.isAdmin, true);
});

test("e2e/auth: generateMyProfileQrCode 正常返回 base64", async () => {
  global.resetMockState({ openid: "openid-qr" });
  seedStaff({
    employeeNo: "GH208", name: "二维码测试",
    openid: "openid-qr", authorizedAircraftTypes: ["A320", "B738"],
  });
  const r = await authRouter.generateMyProfileQrCode();
  assert.equal(r.code, 0);
  assert.ok(r.data.qrDataUrl.startsWith("data:image/png;base64,"));
  assert.ok(r.data.content.includes("GH208"));
  assert.ok(r.data.content.includes("A320/B738"));
});

test("e2e/auth: updateMyPreferences 嵌套字段更新", async () => {
  global.resetMockState({ openid: "openid-pref" });
  seedStaff({ employeeNo: "GH209", name: "test", openid: "openid-pref" });
  const r = await authRouter.updateMyPreferences({
    data: {
      preferredShifts: ["MORNING", "AFTERNOON"],
      preferredRestDays: ["SAT", "SUN"],
      maxMonthlyWorkHours: 160,
    },
  });
  assert.equal(r.code, 0);
  const p = state.collections.staff.find(s => s.employeeNo === "GH209");
  assert.deepEqual(p.preferences.preferredShifts, ["MORNING", "AFTERNOON"]);
  assert.equal(p.preferences.maxMonthlyWorkHours, 160);
});

test("e2e/auth: 猜测工号的扫码绑定端点已关闭", async () => {
  global.resetMockState({ openid: "openid-scan-new" });
  const r = await quickstartFunction.main({
    type: "bindStaffByScanCode",
    data: { scanCode: "GH210" },
  }, {});
  assert.equal(r.code, 400);
  assert.match(r.message, /未知操作类型/);
});

// ══════════════════════════════════════════════════════════════
// 模块 3: admin (4 端点)
// ══════════════════════════════════════════════════════════════

test("e2e/admin: setAllStaffAdmin 全员提权", async () => {
  global.resetMockState({ openid: "openid-admin" });
  seedStaff({ employeeNo: "GH000", name: "admin", openid: "openid-admin", isAdmin: true });
  seedStaff({ employeeNo: "GH300", name: "员工1" });
  seedStaff({ employeeNo: "GH301", name: "员工2" });
  seedSetting("demoToolsEnabled", "true");
  const r = await adminRouter.setAllStaffAdmin();
  assert.equal(r.code, 0);
  assert.equal(r.data.updated, 2);
  const all = state.collections.staff;
  assert.ok(all.every(s => s.isAdmin === true), "所有人都被提权");
});

test("e2e/admin: setAllStaffAdmin 生产模式默认禁用", async () => {
  global.resetMockState({ openid: "openid-admin-prod" });
  seedStaff({ employeeNo: "GHAP01", name: "admin", openid: "openid-admin-prod", isAdmin: true });
  seedStaff({ employeeNo: "GHAP02", name: "员工" });
  const r = await adminRouter.setAllStaffAdmin();
  assert.equal(r.code, 403);
  assert.equal(state.collections.staff.find((staff) => staff.employeeNo === "GHAP02").isAdmin, undefined);
});

test("e2e/admin: setAllStaffAdmin 非 admin → 403", async () => {
  global.resetMockState({ openid: "openid-not-admin" });
  seedStaff({ employeeNo: "GH999", name: "test", openid: "openid-not-admin" });
  const r = await adminRouter.setAllStaffAdmin();
  assert.equal(r.code, 403);
});

test("e2e/admin: setStaffAdmin (P0-1 修复) 非 admin → 403", async () => {
  global.resetMockState({ openid: "openid-x" });
  seedStaff({ employeeNo: "GH998", name: "test", openid: "openid-x" });
  const r = await adminRouter.setStaffAdmin({ data: { employeeNo: "GH998" } });
  assert.equal(r.code, 403, "P0-1 修复: 不能自提权");
});

test("e2e/admin: migrateStaffRoles 非 admin → 403", async () => {
  global.resetMockState({ openid: "openid-not-admin-mig" });
  seedStaff({ employeeNo: "GH997", name: "test", openid: "openid-not-admin-mig" });
  const r = await adminRouter.migrateStaffRoles();
  assert.equal(r.code, 403);
});

test("e2e/admin: getAdminDashboard 聚合排班、审批与风险", async () => {
  global.resetMockState({ openid: "openid-dashboard-admin" });
  const adminId = seedStaff({
    employeeNo: "GHDA01",
    name: "值班主管",
    openid: "openid-dashboard-admin",
    isAdmin: true,
    groupId: "A组",
  });
  seedStaff({
    employeeNo: "GHDA02",
    name: "待排员工",
    groupId: "B组",
    qualifications: [{ aircraftType: "A320", validUntil: dateOffset(30) }],
  });
  seedSchedule({
    scheduleDate: dateOffset(1),
    staffId: adminId,
    staffEmployeeNo: "GHDA01",
    status: "ASSIGNED",
    recordStatus: "active",
  });
  seedSwap({ status: "PENDING" });
  seedLeave({ status: "PENDING", employeeNo: "GHDA02" });
  seedOperationLog({
    action: "PUBLISH_SCHEDULE",
    operator: "值班主管",
    detail: "发布测试排班",
    createdAt: new Date(),
  });

  const r = await adminRouter.getAdminDashboard({
    data: { scheduleDate: dateOffset(1) },
  });
  assert.equal(r.code, 0);
  assert.equal(r.data.staff.active, 2);
  assert.equal(r.data.schedule.assignedPeople, 1);
  assert.equal(r.data.schedule.unassigned, 1);
  assert.equal(r.data.approvals.total, 2);
  assert.equal(r.data.qualifications.riskCount, 1);
  assert.equal(r.data.recentOperations.length, 1);
});

test("e2e/admin: listStaffForAdmin 支持筛选并隐藏完整手机号", async () => {
  global.resetMockState({ openid: "openid-staff-list-admin" });
  seedStaff({
    employeeNo: "GHSL00",
    name: "管理员",
    openid: "openid-staff-list-admin",
    isAdmin: true,
  });
  seedStaff({
    employeeNo: "GHSL01",
    name: "张三",
    groupId: "A组",
    roleType: "SERVICE",
    phone: "13812345678",
  });
  seedStaff({
    employeeNo: "GHSL02",
    name: "李四",
    groupId: "B组",
    roleType: "RELEASE",
  });

  const r = await adminRouter.listStaffForAdmin({
    data: { query: "张三", groupId: "A组", page: 1, pageSize: 10 },
  });
  assert.equal(r.code, 0);
  assert.equal(r.data.total, 1);
  assert.equal(r.data.list[0].phoneMasked, "138****5678");
  assert.equal(Object.hasOwn(r.data.list[0], "phone"), false);
});

test("e2e/admin: updateStaffForAdmin 标记受岗位或资质影响的未来排班", async () => {
  global.resetMockState({ openid: "openid-staff-update-admin" });
  seedStaff({
    employeeNo: "GHSU00",
    name: "管理员",
    openid: "openid-staff-update-admin",
    isAdmin: true,
  });
  const targetId = seedStaff({
    employeeNo: "GHSU01",
    name: "勤务员工",
    groupId: "A组",
    roleType: "SERVICE",
    authorizedAirlines: ["中国南方航空"],
    authorizedAircraftTypes: ["A320"],
  });
  const scheduleId = seedSchedule({
    scheduleDate: dateOffset(1),
    staffId: targetId,
    status: "ASSIGNED",
    recordStatus: "active",
    _taskType: "SERVICE",
    airline: "中国南方航空",
    aircraftType: "A320",
  });

  const r = await adminRouter.updateStaffForAdmin({
    data: {
      staffId: targetId,
      groupId: "B组",
      roleType: "RELEASE",
      active: true,
      isAdmin: false,
      authorizedAircraftTypes: ["B737"],
      authorizedAirlines: ["中国国际航空"],
    },
  });
  assert.equal(r.code, 0);
  assert.equal(r.data.impactedScheduleCount, 1);
  const updatedStaff = state.collections.staff.find((item) => item._id === targetId);
  assert.equal(updatedStaff.groupId, "B组");
  assert.equal(updatedStaff.roleType, "RELEASE");
  assert.deepEqual(updatedStaff.authorizedAircraftTypes, ["B737"]);
  assert.deepEqual(updatedStaff.authorizedAirlines, ["中国国际航空"]);
  const updatedSchedule = state.collections.schedules.find((item) => item._id === scheduleId);
  assert.equal(updatedSchedule.needsReassignment, true);
});

test("e2e/admin: updateStaffForAdmin 禁止管理员停用自己", async () => {
  global.resetMockState({ openid: "openid-self-lock-admin" });
  const adminId = seedStaff({
    employeeNo: "GHLOCK",
    name: "管理员",
    openid: "openid-self-lock-admin",
    isAdmin: true,
  });
  const r = await adminRouter.updateStaffForAdmin({
    data: { staffId: adminId, active: false },
  });
  assert.equal(r.code, 409);
});

test("e2e/bootstrapAdmin: 拒绝小程序端直接调用", async () => {
  global.resetMockState({
    openid: "openid-client-bootstrap",
    source: "wx_client",
  });
  seedStaff({
    employeeNo: "GH310",
    name: "普通员工",
    openid: "openid-client-bootstrap",
  });
  const r = await bootstrapAdminFunction.main({
    employeeNo: "GH310",
    confirmText: "CREATE_FIRST_ADMIN",
  });
  assert.equal(r.code, 403);
  assert.equal(state.collections.staff[0].isAdmin, undefined);

  state.openid = "";
  const sourceOnlyResult = await bootstrapAdminFunction.main({
    employeeNo: "GH310",
    confirmText: "CREATE_FIRST_ADMIN",
  });
  assert.equal(sourceOnlyResult.code, 403);
});

test("e2e/bootstrapAdmin: 控制台可将已绑定员工设为首个管理员", async () => {
  global.resetMockState({
    openid: "stale-client-openid",
    source: "wx_client",
  });
  seedStaff({
    employeeNo: "GH311",
    name: "首个管理员",
    openid: "openid-bound-admin",
  });
  const r = await bootstrapAdminFunction.main({
    employeeNo: "GH311",
    confirmText: "CREATE_FIRST_ADMIN",
  }, {
    __mockCloudbaseContext: {
      TCB_SOURCE: "",
      WX_OPENID: "",
    },
  });
  assert.equal(r.code, 0);
  assert.equal(r.data.isAdmin, true);
  const staff = state.collections.staff.find((item) => item.employeeNo === "GH311");
  assert.equal(staff.isAdmin, true);
  assert.equal(staff.adminGrantedBy, "CLOUD_CONSOLE_BOOTSTRAP");
});

test("e2e/bootstrapAdmin: 拒绝未绑定微信的员工", async () => {
  global.resetMockState({ openid: "console-placeholder-2" });
  state.openid = "";
  state.source = "";
  seedStaff({ employeeNo: "GH312", name: "未绑定员工", openid: "" });
  const r = await bootstrapAdminFunction.main({
    employeeNo: "GH312",
    confirmText: "CREATE_FIRST_ADMIN",
  });
  assert.equal(r.code, 409);
  assert.match(r.message, /尚未绑定微信/);
});

test("e2e/bootstrapAdmin: 可撤销未绑定的旧管理员并恢复管理权限", async () => {
  global.resetMockState({ openid: "console-placeholder-recovery" });
  state.openid = "";
  state.source = "";
  seedStaff({
    employeeNo: "GH312A",
    name: "失效管理员",
    openid: "",
    isAdmin: true,
  });
  seedStaff({
    employeeNo: "GH312B",
    name: "恢复管理员",
    openid: "openid-recovery-admin",
  });

  const r = await bootstrapAdminFunction.main({
    employeeNo: "GH312B",
    confirmText: "CREATE_FIRST_ADMIN",
  });
  assert.equal(r.code, 0);
  assert.deepEqual(r.data.revokedStaleAdmins, ["GH312A"]);
  assert.equal(
    state.collections.staff.find((item) => item.employeeNo === "GH312A").isAdmin,
    false
  );
  assert.equal(
    state.collections.staff.find((item) => item.employeeNo === "GH312B").isAdmin,
    true
  );
});

test("e2e/bootstrapAdmin: 已有管理员后拒绝再次自举", async () => {
  global.resetMockState({ openid: "console-placeholder-3" });
  state.openid = "";
  state.source = "";
  seedStaff({
    employeeNo: "GH313",
    name: "已有管理员",
    openid: "openid-existing-admin",
    isAdmin: true,
  });
  seedStaff({
    employeeNo: "GH314",
    name: "普通员工",
    openid: "openid-normal-staff",
  });
  const r = await bootstrapAdminFunction.main({
    employeeNo: "GH314",
    confirmText: "CREATE_FIRST_ADMIN",
  });
  assert.equal(r.code, 409);
  assert.equal(
    state.collections.staff.find((item) => item.employeeNo === "GH314").isAdmin,
    undefined
  );
});

// ══════════════════════════════════════════════════════════════
// 模块 4: settings (3 端点)
// ══════════════════════════════════════════════════════════════

test("e2e/settings: getSchedulingConfig 用缓存", async () => {
  global.resetMockState({ openid: "x" });
  seedSetting("fatigueMaxContinuousDays", 5);
  seedSetting("maxDailyWorkHours", 10);
  const r1 = await settingsRouter.getSchedulingConfig();
  assert.equal(r1.code, 0);
  assert.equal(r1.data.fatigueMaxContinuousDays, 5);
  assert.equal(r1.data.maxDailyWorkHours, 10);
  assert.equal(Object.hasOwn(r1.data, "longStayWarningHours"), false);
});

test("e2e/settings: updateSchedulingConfig 范围校验 (1-14)", async () => {
  global.resetMockState({ openid: "openid-config-admin" });
  seedStaff({
    employeeNo: "GH994",
    name: "管理员",
    openid: "openid-config-admin",
    isAdmin: true,
  });
  // 边界外值应被拒
  let r = await settingsRouter.updateSchedulingConfig({ data: { fatigueMaxContinuousDays: 0 } });
  assert.equal(r.code, 400);
  r = await settingsRouter.updateSchedulingConfig({ data: { fatigueMaxContinuousDays: 15 } });
  assert.equal(r.code, 400);
  // 边界内应成功
  r = await settingsRouter.updateSchedulingConfig({ data: { fatigueMaxContinuousDays: 7 } });
  assert.equal(r.code, 0);
  const persisted = state.collections.settings.find(s => s.key === "fatigueMaxContinuousDays");
  assert.equal(persisted.value, 7);
});

test("e2e/settings: updateSchedulingConfig 非管理员不可修改", async () => {
  global.resetMockState({ openid: "openid-config-user" });
  seedStaff({
    employeeNo: "GH993",
    name: "普通员工",
    openid: "openid-config-user",
  });
  const r = await settingsRouter.updateSchedulingConfig({
    data: { fatigueMaxContinuousDays: 7 },
  });
  assert.equal(r.code, 403);
});

test("e2e/settings: updateSchedulingConfig 可一次保存完整排班规则", async () => {
  global.resetMockState({ openid: "openid-config-full-admin" });
  cacheRouter.clear();
  seedStaff({
    employeeNo: "GHCF01",
    name: "管理员",
    openid: "openid-config-full-admin",
    isAdmin: true,
  });
  const payload = {
    fatigueMaxContinuousDays: 5,
    servicePrepTimeMinutes: 35,
    serviceWrapTimeMinutes: 20,
    releasePrepTimeMinutes: 25,
    releaseWrapTimeMinutes: 15,
    serviceRequiredCount: 2,
    releaseRequiredCount: 1,
    minRestIntervalMinutes: 45,
    maxConsecutiveNightShifts: 3,
    maxDailyWorkHours: 10,
    demoToolsEnabled: false,
  };
  const updated = await settingsRouter.updateSchedulingConfig({ data: payload });
  assert.equal(updated.code, 0);
  assert.deepEqual(updated.data, payload);

  const loaded = await settingsRouter.getSchedulingConfig();
  assert.equal(loaded.code, 0);
  assert.equal(loaded.data.minRestIntervalMinutes, 45);
  assert.equal(loaded.data.maxDailyWorkHours, 10);
  assert.equal(loaded.data.demoToolsEnabled, false);
});

test("e2e/settings: setSetting (P0-2 修复) 必须 admin + 白名单", async () => {
  global.resetMockState({ openid: "x" });
  seedStaff({ employeeNo: "GH996", name: "test", openid: "x" });
  // 非 admin
  let r = await settingsRouter.setSetting({ data: { key: "fatigueMaxContinuousDays", value: 9 } });
  assert.equal(r.code, 403);
  // admin
  global.resetMockState({ openid: "openid-sett" });
  seedStaff({ employeeNo: "GH995", name: "admin", openid: "openid-sett", isAdmin: true });
  r = await settingsRouter.setSetting({ data: { key: "fatigueMaxContinuousDays", value: 9 } });
  assert.equal(r.code, 0);
  r = await settingsRouter.setSetting({
    data: { key: "fatigueMaxContinuousDays", value: { $gt: 0 } },
  });
  assert.equal(r.code, 400);
});

// ══════════════════════════════════════════════════════════════
// 模块 5: flight (7 端点, 测基础流程)
// ══════════════════════════════════════════════════════════════

test("e2e/flight: updateFlightOperationalData 同步发动机与人工 ETA 并留痕", async () => {
  global.resetMockState({ openid: "openid-flight-ops-admin" });
  seedStaff({
    employeeNo: "GHF001",
    name: "航班资料管理员",
    openid: "openid-flight-ops-admin",
    isAdmin: true,
  });
  const scheduleDate = dateOffset(2);
  const flightId = seedFlight({
    key: `MU5101_${scheduleDate}`,
    flightNo: "MU5101",
    airline: "中国东方航空",
    aircraftType: "A320",
    scheduleDate,
    scheduledArrivalTime: `${scheduleDate}T10:00`,
  });
  const scheduleId = seedSchedule({
    flightId,
    flightNo: "MU5101",
    scheduleDate,
    airline: "中国东方航空",
    aircraftType: "A320",
  });
  const estimatedArrivalTime = `${scheduleDate}T10:25`;
  const r = await flightRouter.updateFlightOperationalData({
    data: {
      flightId,
      flightNo: "MU5101",
      scheduleDate,
      aircraftType: "A320",
      aircraftRegistration: "b-1234",
      engineModel: "CFM56-5B",
      estimatedArrivalTime,
    },
  });
  assert.equal(r.code, 0);
  assert.equal(r.data.affectedScheduleCount, 1);
  const flight = state.collections.flights.find((item) => item._id === flightId);
  assert.equal(flight.engineModel, "CFM56-5B");
  assert.equal(flight.aircraftRegistration, "B-1234");
  assert.equal(flight.estimatedArrivalTime, estimatedArrivalTime);
  assert.equal(flight.estimatedArrivalSource, "MANUAL");
  const schedule = state.collections.schedules.find((item) => item._id === scheduleId);
  assert.equal(schedule.engineModel, "CFM56-5B");
  assert.equal(schedule.estimatedArrivalTime, estimatedArrivalTime);
  assert.ok(
    state.collections.operation_logs.some(
      (item) => item.action === "UPDATE_FLIGHT_OPERATIONAL_DATA" && item.updatedAt
    )
  );

  const cleared = await flightRouter.updateFlightOperationalData({
    data: {
      flightId,
      estimatedArrivalTime: "",
    },
  });
  assert.equal(cleared.code, 0);
  const clearedFlight = state.collections.flights.find((item) => item._id === flightId);
  assert.equal(clearedFlight.estimatedArrivalTime, "");
  assert.equal(clearedFlight.estimatedArrivalSource, "");
  assert.equal(clearedFlight.arrivalTime, `${scheduleDate}T10:00`);
});

test("e2e/flight: updateFlightOperationalData 校验权限与参数类型", async () => {
  global.resetMockState({ openid: "openid-flight-ops-user" });
  seedStaff({
    employeeNo: "GHF002",
    name: "普通员工",
    openid: "openid-flight-ops-user",
  });
  let r = await flightRouter.updateFlightOperationalData({
    data: { flightNo: "MU5102", scheduleDate: dateOffset(1), engineModel: "LEAP-1A" },
  });
  assert.equal(r.code, 403);

  setOpenid("openid-flight-ops-admin-2");
  seedStaff({
    employeeNo: "GHF003",
    name: "管理员",
    openid: "openid-flight-ops-admin-2",
    isAdmin: true,
  });
  r = await flightRouter.updateFlightOperationalData({
    data: {
      flightNo: { $regex: ".*" },
      scheduleDate: dateOffset(1),
      engineModel: "LEAP-1A",
    },
  });
  assert.equal(r.code, 400);
});

test("e2e/flight: getRiskCenterDashboard 返回汇总", async () => {
  global.resetMockState({ openid: "x" });
  const today = new Date().toISOString().slice(0, 10);
  seedSetting("maxDailyWorkHours", 12);
  seedFlight({
    flightNo: "B1",
    airline: "中国南方航空",
    aircraftType: "A320",
    scheduleDate: today,
  });
  const staffId = seedStaff({
    employeeNo: "GH400",
    name: "员工A",
    active: true,
    onLeave: false,
    authorizedAirlines: ["中国东方航空"],
    authorizedAircraftTypes: ["B737"],
  });
  seedSchedule({
    staffId,
    flightNo: "B1",
    airline: "中国南方航空",
    aircraftType: "A320",
    scheduleDate: today,
    needsReassignment: true,
    shiftCode: "MORNING",
    recordStatus: "active",
  });
  // 另一条非待改派但资质不符的排班: 待改派不计入工时/资质, 但两种风险都要独立报告。
  seedSchedule({
    staffId,
    flightNo: "B9",
    airline: "中国国际航空",
    aircraftType: "A330",
    scheduleDate: today,
    shiftCode: "AFTERNOON",
    recordStatus: "active",
  });
  const r = await flightRouter.getRiskCenterDashboard({ data: { scheduleDate: today } });
  assert.equal(r.code, 0);
  assert.equal(r.data.reassignmentCount, 1);
  assert.equal(r.data.qualificationIssueCount, 1);
  assert.ok(r.data.availableStaffCount >= 1);
  assert.equal(Object.hasOwn(r.data, "longStayCount"), false);
});

test("e2e/flight: getWarningAnalytics 可只返回人员工作负荷", async () => {
  global.resetMockState({ openid: "x" });
  const today = new Date().toISOString().slice(0, 10);
  const staffId = seedStaff({
    employeeNo: "GH401",
    name: "员工B",
    groupId: "A",
    // getWarningAnalytics 是管理端分析端点 (requireAdmin)
    openid: "x",
    isAdmin: true,
  });
  seedFlight({
    flightNo: "B2",
    airline: "中国东方航空",
    aircraftType: "A320",
    scheduleDate: today,
  });
  seedSchedule({
    staffId,
    scheduleDate: today,
    shiftCode: "MORNING",
    recordStatus: "active",
  });

  const r = await flightRouter.getWarningAnalytics({
    data: { days: 7, includeFlowTrend: false },
  });
  assert.equal(r.code, 0);
  assert.equal(r.data.staffWorkloadRanking[0].employeeNo, "GH401");
  assert.equal(Object.hasOwn(r.data, "maintenanceFlowTrend"), false);

  const legacyFlag = await flightRouter.getWarningAnalytics({
    data: { includeFlowTrend: { $ne: false } },
  });
  assert.equal(legacyFlag.code, 0, "旧客户端参数应被忽略且不得恢复流量趋势");
  assert.equal(Object.hasOwn(legacyFlag.data, "maintenanceFlowTrend"), false);
});

test("e2e/flight: getFatigueScores 按工时分级", async () => {
  global.resetMockState({ openid: "x" });
  const r = await flightRouter.getFatigueScores({
    data: { staffs: [
      { staffId: "s1", totalWorkedHours: 20 },
      { staffId: "s2", totalWorkedHours: 60 },
      { staffId: "s3", totalWorkedHours: 100 },
    ] },
  });
  assert.equal(r.code, 0);
  const results = r.data.results;
  assert.equal(results[0].riskLevel, "low");
  assert.equal(results[1].riskLevel, "medium");
  assert.equal(results[2].riskLevel, "high");
});

test("e2e/flight: getMaintenanceForecast 按日期汇总", async () => {
  global.resetMockState({ openid: "x" });
  const r = await flightRouter.getMaintenanceForecast({
    data: { flights: [
      { flightNo: "M1", scheduleDate: "2026-06-17", stayHours: 2 },
      { flightNo: "M2", scheduleDate: "2026-06-17", stayHours: 3 },
      { flightNo: "M3", scheduleDate: "2026-06-18", stayHours: 4 },
    ] },
  });
  assert.equal(r.code, 0);
  const fc = r.data.dailyForecast;
  assert.equal(fc.length, 2, "应按日期分组");
  const day17 = fc.find(d => d.date === "2026-06-17");
  assert.equal(day17.flightCount, 2);
  assert.equal(day17.estimatedWorkload, 10); // (2+3)*2
});

test("e2e/flight: getQualificationStatus 计算剩余天数分级", async () => {
  global.resetMockState({ openid: "x" });
  const today = new Date();
  const makeDate = (offset) => {
    const d = new Date(today);
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  };
  seedStaff({
    employeeNo: "GH500", name: "资质测试", openid: "x",
    qualifications: [
      { aircraftType: "A320", certNo: "X1", validUntil: makeDate(120), status: "VALID" },
      { aircraftType: "B738", certNo: "X2", validUntil: makeDate(20), status: "EXPIRING" },
      { aircraftType: "A321", certNo: "X3", validUntil: makeDate(-10), status: "EXPIRED" },
    ],
  });
  const r = await flightRouter.getQualificationStatus();
  assert.equal(r.code, 0);
  assert.equal(r.data.summary.expired, 1);
  assert.ok(r.data.summary.expiring30 >= 1);
  assert.ok(r.data.summary.valid >= 1);
});

test("e2e/flight: getQualificationStatus 普通员工仅看本人，管理员可看全员", async () => {
  global.resetMockState({ openid: "openid-qualification-self" });
  seedStaff({
    employeeNo: "GHQ01",
    name: "本人",
    openid: "openid-qualification-self",
    authorizedAircraftTypes: ["A320"],
  });
  seedStaff({
    employeeNo: "GHQ02",
    name: "他人",
    authorizedAircraftTypes: ["B737"],
  });
  let r = await flightRouter.getQualificationStatus();
  assert.equal(r.code, 0);
  assert.equal(r.data.scope, "SELF");
  assert.deepEqual(r.data.list.map((item) => item.employeeNo), ["GHQ01"]);

  setOpenid("openid-qualification-admin");
  seedStaff({
    employeeNo: "GHQ00",
    name: "管理员",
    openid: "openid-qualification-admin",
    isAdmin: true,
  });
  r = await flightRouter.getQualificationStatus();
  assert.equal(r.code, 0);
  assert.equal(r.data.scope, "ALL");
  assert.equal(r.data.list.length, 3);
});

test("e2e/flight: 已下线的维修流量模拟端点不可访问", async () => {
  global.resetMockState({ openid: "openid-flow-demo" });
  seedDemoAdmin("openid-flow-demo");
  const r = await quickstartFunction.main({
    type: "simulateMaintenanceFlowTrend",
    data: { days: 7 },
  }, {});
  assert.equal(r.code, 400);
  assert.match(r.message, /未知操作类型/);
});

// ══════════════════════════════════════════════════════════════
// 模块 6: notification (2 端点)
// ══════════════════════════════════════════════════════════════

test("e2e/notification: listMyNotifications 列出自己名下", async () => {
  global.resetMockState({ openid: "openid-me" });
  seedSwap({ requesterOpenid: "openid-me", employeeNo: "GH600", name: "me", flightNo: "F1" });
  seedSwap({ requesterOpenid: "openid-other", employeeNo: "GH601", name: "other", flightNo: "F2" });
  const r = await notificationRouter.listMyNotifications();
  assert.equal(r.code, 0);
  assert.equal(r.data.notifications.length, 1);
  assert.equal(r.data.unreadCount, 1);
});

test("e2e/notification: listMyNotifications 已读标记", async () => {
  global.resetMockState({ openid: "openid-me2" });
  const old = new Date(Date.now() - 1000);
  seedSwap({ requesterOpenid: "openid-me2", employeeNo: "GH700", name: "me2", flightNo: "F1", updatedAt: old, requesterReadAt: old });
  const r = await notificationRouter.listMyNotifications();
  assert.equal(r.data.unreadCount, 0, "已读时间 >= 更新时间应不算未读");
});

test("e2e/notification: markMyNotificationsRead (P2-14 修复) 分页标记", async () => {
  global.resetMockState({ openid: "openid-me3" });
  for (let i = 0; i < 5; i++) seedSwap({ requesterOpenid: "openid-me3", flightNo: `F${i}` });
  seedSwap({ requesterOpenid: "openid-other3", flightNo: "other" });
  const r = await notificationRouter.markMyNotificationsRead();
  assert.equal(r.code, 0);
  assert.equal(r.data.updatedCount, 5);
  // 别人没被标记
  const other = state.collections.swap_requests.find(s => s.requesterOpenid === "openid-other3");
  assert.equal(other.requesterReadAt, undefined);
});

test("e2e/notification: 聚合调班与请假通知并按更新时间排序", async () => {
  global.resetMockState({ openid: "openid-notification-all" });
  seedSwap({
    requesterOpenid: "openid-notification-all",
    requestType: "SHIFT_APPLY",
    flightNo: "MU5101",
    updatedAt: new Date("2026-07-27T08:00:00Z"),
  });
  seedLeave({
    openid: "openid-notification-all",
    type: "ANNUAL",
    typeText: "年假",
    startDate: "2026-08-01",
    endDate: "2026-08-02",
    totalDays: 2,
    updatedAt: new Date("2026-07-27T09:00:00Z"),
  });

  const r = await notificationRouter.listMyNotifications();
  assert.equal(r.code, 0);
  assert.equal(r.data.notifications.length, 2);
  assert.equal(r.data.notifications[0].category, "LEAVE");
  assert.equal(r.data.notifications[0].message, "年假申请 待审批");
  assert.equal(r.data.notifications[1].category, "SWAP");
  assert.equal(r.data.unreadCount, 2);
});

test("e2e/notification: 一键已读同时覆盖调班与请假", async () => {
  global.resetMockState({ openid: "openid-notification-read-all" });
  const swapId = seedSwap({ requesterOpenid: "openid-notification-read-all" });
  const leaveId = seedLeave({ openid: "openid-notification-read-all" });
  seedLeave({ openid: "openid-other-notification" });

  const r = await notificationRouter.markMyNotificationsRead();
  assert.equal(r.code, 0);
  assert.equal(r.data.updatedCount, 2);
  assert.equal(r.data.swapUpdated, 1);
  assert.equal(r.data.leaveUpdated, 1);
  assert.ok(state.collections.swap_requests.find((item) => item._id === swapId).requesterReadAt);
  assert.ok(state.collections.leave_requests.find((item) => item._id === leaveId).requesterReadAt);
  assert.equal(
    state.collections.leave_requests.find((item) => item.openid === "openid-other-notification").requesterReadAt,
    undefined
  );
});

// ══════════════════════════════════════════════════════════════
// 模块 7: realtime (5 端点, 部分受 P0-4 限制)
// ══════════════════════════════════════════════════════════════

test("e2e/realtime: updateFlightRealtimeStatus (P0-4 修复) 非 admin → 403", async () => {
  global.resetMockState({ openid: "x" });
  seedStaff({ employeeNo: "GH800", name: "test", openid: "x" });
  const r = await realtimeRouter.updateFlightRealtimeStatus({ data: { flightNo: "X1", status: "DELAYED" } });
  assert.equal(r.code, 403);
});

test("e2e/realtime: updateFlightRealtimeStatus 无效 status → 400", async () => {
  global.resetMockState({ openid: "openid-r-admin" });
  seedStaff({ employeeNo: "GH801", name: "admin", openid: "openid-r-admin", isAdmin: true });
  const r = await realtimeRouter.updateFlightRealtimeStatus({ data: { flightNo: "X1", status: "INVALID" } });
  assert.equal(r.code, 400);
});

test("e2e/realtime: getFlightRealtimeStatuses 仅管理员可读", async () => {
  global.resetMockState({ openid: "x" });
  seedStaff({ employeeNo: "GH802", name: "管理员", openid: "x", isAdmin: true });
  seedSchedule({ flightNo: "X1", scheduleDate: "2026-06-17", realtimeStatus: "DELAYED" });
  const r = await realtimeRouter.getFlightRealtimeStatuses({ data: { scheduleDate: "2026-06-17" } });
  assert.equal(r.code, 0);
  assert.equal(r.data.statuses.length, 1);
});

test("e2e/realtime: getAvailableStaff 筛选空闲 + 资质匹配", async () => {
  global.resetMockState({ openid: "openid-available-admin" });
  seedStaff({
    employeeNo: "GH809", name: "管理员", openid: "openid-available-admin", isAdmin: true,
  });
  seedStaff({
    employeeNo: "GH810", name: "可派",
    authorizedAirlines: ["中国南方航空"], authorizedAircraftTypes: ["A320"],
    active: true, onLeave: false,
  });
  seedStaff({
    employeeNo: "GH811", name: "请假",
    authorizedAirlines: ["中国南方航空"], authorizedAircraftTypes: ["A320"],
    active: true, onLeave: true,
  });
  seedLeave({
    employeeNo: "GH811",
    status: "APPROVED",
    startDate: "2026-06-17",
    endDate: "2026-06-17",
  });
  seedStaff({
    employeeNo: "GH812", name: "资质不符",
    authorizedAirlines: ["中国国际航空"], authorizedAircraftTypes: ["A320"],
    active: true, onLeave: false,
  });
  const r = await realtimeRouter.getAvailableStaff({
    data: {
      scheduleDate: "2026-06-17",
      startTime: "08:00", endTime: "18:00",
      airline: "中国南方航空", aircraftType: "A320",
    },
  });
  assert.equal(r.code, 0);
  assert.equal(r.data.available.length, 1);
  assert.equal(r.data.available[0].employeeNo, "GH810");
});

test("e2e/realtime: reassignStaffTask 改班审计留痕", async () => {
  global.resetMockState({ openid: "openid-rs-admin" });
  seedStaff({ employeeNo: "GH820", name: "admin", openid: "openid-rs-admin", isAdmin: true });
  const newStaffId = seedStaff({
    employeeNo: "GH821",
    name: "新人员",
    groupId: "A组",
    roleType: "SERVICE",
    authorizedAirlines: ["中国南方航空"],
    authorizedAircraftTypes: ["A320"],
  });
  const schedId = seedSchedule({
    flightNo: "Y1", scheduleDate: "2026-06-17", _taskType: "SERVICE",
    staffId: "oldStaff", staffName: "旧人员",
    airline: "中国南方航空", aircraftType: "A320",
    _taskStart: "2026-06-17T09:00:00", _taskEnd: "2026-06-17T10:00:00",
  });
  const r = await realtimeRouter.reassignStaffTask({
    data: { flightNo: "Y1", taskType: "SERVICE", scheduleDate: "2026-06-17", newStaffId, oldStaffId: "oldStaff", reason: "测试" },
  });
  assert.equal(r.code, 0);
  const updated = state.collections.schedules.find(s => s._id === schedId);
  assert.equal(updated.staffId, newStaffId);
  assert.equal(updated.source, "REALTIME_REASSIGN");
  assert.equal(updated.reassignReason, "测试");
  assert.equal(updated.needsReassignment, false);
  assert.equal(updated.leaveRequestId, "");
});

test("e2e/realtime: reassignStaffTask 改班后单日工时超限被拒绝 (P1-C3)", async () => {
  global.resetMockState({ openid: "openid-rs-hours" });
  seedStaff({ employeeNo: "GH822", name: "admin", openid: "openid-rs-hours", isAdmin: true });
  const newStaffId = seedStaff({
    employeeNo: "GH823",
    name: "满工时人员",
    groupId: "A组",
    roleType: "SERVICE",
    authorizedAirlines: ["中国南方航空"],
    authorizedAircraftTypes: ["A320"],
  });
  seedSchedule({
    flightNo: "Y1", scheduleDate: "2026-06-17", _taskType: "SERVICE",
    staffId: "oldStaff", staffName: "旧人员",
    airline: "中国南方航空", aircraftType: "A320",
    _taskStart: "2026-06-17T09:00:00", _taskEnd: "2026-06-17T10:00:00",
  });
  // 目标人员当天已有 11.5 小时排班(10:30-22:00，与新任务不重叠但相加超 12 小时上限)
  seedSchedule({
    flightNo: "BUSY1", scheduleDate: "2026-06-17", _taskType: "SERVICE",
    staffId: newStaffId, staffName: "满工时人员",
    _taskStart: "2026-06-17T10:30:00", _taskEnd: "2026-06-17T22:00:00",
  });
  const r = await realtimeRouter.reassignStaffTask({
    data: { flightNo: "Y1", taskType: "SERVICE", scheduleDate: "2026-06-17", newStaffId, oldStaffId: "oldStaff", reason: "测试" },
  });
  assert.equal(r.code, 409);
  assert.match(r.message, /总工时/);
  const sched = state.collections.schedules.find(s => s.flightNo === "Y1");
  assert.equal(sched.staffId, "oldStaff", "改班被拒绝后原排班不应被改写");
});

test("e2e/realtime: propagateScheduleDelay (P0-4 修复 + P1-10) 调整全部后续任务", async () => {
  global.resetMockState({ openid: "openid-prop-admin" });
  seedStaff({ employeeNo: "GH830", name: "admin", openid: "openid-prop-admin", isAdmin: true });
  // 用未来日期, 避免和当前日期冲突
  const today = new Date().toISOString().slice(0, 10);
  // 用同一个 staffId 串联所有排班, 这样 propagate 才会"找到受影响人员"
  const sameStaff = "staff-same";
  seedSchedule({ flightNo: "DELAY", scheduleDate: today, staffId: sameStaff, _taskStart: today + "T09:00", _taskEnd: today + "T10:00" });
  seedSchedule({ flightNo: "NEXT1", scheduleDate: today, staffId: sameStaff, _taskStart: today + "T14:00", _taskEnd: today + "T15:00" });
  seedSchedule({ flightNo: "NEXT2", scheduleDate: today, staffId: sameStaff, _taskStart: today + "T18:00", _taskEnd: today + "T19:00" });
  seedSchedule({ flightNo: "PREV", scheduleDate: today, staffId: sameStaff, _taskStart: today + "T07:00", _taskEnd: today + "T08:00" });

  const r = await realtimeRouter.propagateScheduleDelay({
    data: { flightNo: "DELAY", scheduleDate: today, delayMinutes: 30 },
  });
  assert.equal(r.code, 0);
  // DELAY 自身: realtimeStatus 标记为 DELAYED
  const delay = state.collections.schedules.find(s => s.flightNo === "DELAY");
  assert.equal(delay.realtimeStatus, "DELAYED");
  // NEXT1 +30 分钟
  const next1 = state.collections.schedules.find(s => s.flightNo === "NEXT1");
  assert.equal(next1._taskStart, today + "T14:30", "P1-10 修复: 第一个后续任务被调整");
  // NEXT2 +30 分钟
  const next2 = state.collections.schedules.find(s => s.flightNo === "NEXT2");
  assert.equal(next2._taskStart, today + "T18:30", "P1-10 修复: 第二个后续任务也被调整");
  // PREV 不变
  const prev = state.collections.schedules.find(s => s.flightNo === "PREV");
  assert.equal(prev._taskStart, today + "T07:00", "受影响航班之前的任务不应被改");
});

test("e2e/realtime: propagateScheduleDelay 拒绝负数与 0 延误 (P1-C2)", async () => {
  global.resetMockState({ openid: "openid-prop-neg" });
  seedStaff({ employeeNo: "GH831", name: "admin", openid: "openid-prop-neg", isAdmin: true });
  const today = new Date().toISOString().slice(0, 10);
  seedSchedule({ flightNo: "NEG", scheduleDate: today, staffId: "s1" });

  const r = await realtimeRouter.propagateScheduleDelay({
    data: { flightNo: "NEG", scheduleDate: today, delayMinutes: -60 },
  });
  assert.equal(r.code, 400, "负数延误应被拒绝");
  assert.match(r.message, /1 ~ 720/);

  const zero = await realtimeRouter.propagateScheduleDelay({
    data: { flightNo: "NEG", scheduleDate: today, delayMinutes: 0 },
  });
  assert.equal(zero.code, 400, "0 分钟延误应被拒绝");

  // 排班不应被标记 DELAYED
  const sched = state.collections.schedules.find(s => s.flightNo === "NEG");
  assert.equal(sched.realtimeStatus || "", "", "被拒绝后不应标记延误");
});

// ══════════════════════════════════════════════════════════════
// 模块 8: swap (6 端点)
// ══════════════════════════════════════════════════════════════

test("e2e/swap: createSwapRequest 资质不匹配 → 409", async () => {
  global.resetMockState({ openid: "openid-csr" });
  // 源 staff 有 CZ 资质, 目标有 MU 资质
  const sourceId = seedStaff({ employeeNo: "GH900", name: "源", openid: "openid-csr", authorizedAirlines: ["中国南方航空"], authorizedAircraftTypes: ["A320"] });
  const targetId = seedStaff({ employeeNo: "GH901", name: "目标", authorizedAirlines: ["中国东方航空"], authorizedAircraftTypes: ["A320"] });
  const sourceSchedId = seedSchedule({ staffId: sourceId, flightNo: "S1", scheduleDate: dateOffset(2), airline: "中国南方航空", aircraftType: "A320" });
  const targetSchedId = seedSchedule({ staffId: targetId, flightNo: "T1", scheduleDate: dateOffset(2), airline: "中国东方航空", aircraftType: "A320" });
  const r = await swapRouter.createSwapRequest({ data: { sourceScheduleId: sourceSchedId, targetScheduleId: targetSchedId, reason: "测试" } });
  assert.equal(r.code, 409, "资质不匹配应被拒");
});

test("e2e/swap: createSwapRequest 资质匹配 → 200", async () => {
  global.resetMockState({ openid: "openid-csr2" });
  const sourceId = seedStaff({ employeeNo: "GH910", name: "源", openid: "openid-csr2", authorizedAirlines: ["中国南方航空"], authorizedAircraftTypes: ["A320"] });
  const targetId = seedStaff({ employeeNo: "GH911", name: "目标", authorizedAirlines: ["中国南方航空"], authorizedAircraftTypes: ["A320"] });
  const sourceSchedId = seedSchedule({ staffId: sourceId, flightNo: "S2", scheduleDate: dateOffset(2), airline: "中国南方航空", aircraftType: "A320" });
  const targetSchedId = seedSchedule({ staffId: targetId, flightNo: "T2", scheduleDate: dateOffset(2), airline: "中国南方航空", aircraftType: "A320" });
  const r = await swapRouter.createSwapRequest({ data: { sourceScheduleId: sourceSchedId, targetScheduleId: targetSchedId, reason: "测试" } });
  assert.equal(r.code, 0);
  assert.equal((state.collections.swap_requests || []).length, 1);
});

test("e2e/swap: createSwapApplication 调班申请", async () => {
  global.resetMockState({ openid: "openid-csa" });
  const staffId = seedStaff({
    employeeNo: "GH920",
    name: "申请人",
    openid: "openid-csa",
  });
  const scheduleId = seedSchedule({
    staffId,
    staffName: "申请人",
    staffEmployeeNo: "GH920",
    flightNo: "F1",
    scheduleDate: dateOffset(1),
    status: "ASSIGNED",
  });
  const r = await swapRouter.createSwapApplication({
    data: {
      sourceScheduleId: scheduleId,
      employeeNo: "FORGED",
      name: "伪造姓名",
      reason: "体检",
    },
  });
  assert.equal(r.code, 0);
  const app = state.collections.swap_requests.find(s => s.employeeNo === "GH920");
  assert.equal(app.status, "PENDING");
  assert.equal(app.requestType, "SHIFT_APPLY");
  assert.equal(app.name, "申请人");
  assert.equal(app.sourceScheduleId, scheduleId);
});

test("e2e/swap: 调班申请支持仅上传图片并生成审计轨迹", async () => {
  global.resetMockState({ openid: "openid-csa-image" });
  const staffId = seedStaff({
    employeeNo: "GH920I",
    name: "图片申请人",
    openid: "openid-csa-image",
  });
  const scheduleId = seedSchedule({
    staffId,
    staffName: "图片申请人",
    staffEmployeeNo: "GH920I",
    flightNo: "MU5201",
    scheduleDate: dateOffset(1),
    status: "ASSIGNED",
  });
  const fileID = "cloud://mock/request-reasons/swap/proof.jpg";
  const r = await swapRouter.createSwapApplication({
    data: {
      sourceScheduleId: scheduleId,
      reasonImages: [fileID],
    },
  });
  assert.equal(r.code, 0);
  const saved = state.collections.swap_requests.find(
    (item) => item._id === r.data.requestId
  );
  assert.equal(saved.reasonText, "");
  assert.equal(saved.reasonMode, "IMAGE");
  assert.deepEqual(saved.reasonImages, [fileID]);
  assert.equal(saved.verifier, "AUTO_COMPLIANCE");
  assert.equal(saved.auditTrail[0].action, "SUBMITTED");
  assert.ok(
    state.collections.operation_logs.some(
      (item) => item.action === "CREATE_SHIFT_APPLICATION"
    )
  );
});

test("e2e/swap: 调班申请拒绝非云存储图片凭证", async () => {
  global.resetMockState({ openid: "openid-csa-image-invalid" });
  const staffId = seedStaff({
    employeeNo: "GH920X",
    name: "申请人",
    openid: "openid-csa-image-invalid",
  });
  const scheduleId = seedSchedule({
    staffId,
    scheduleDate: dateOffset(1),
    status: "ASSIGNED",
  });
  const r = await swapRouter.createSwapApplication({
    data: {
      sourceScheduleId: scheduleId,
      reasonImages: ["https://example.com/forged.jpg"],
    },
  });
  assert.equal(r.code, 400);
});

test("e2e/swap: createSwapApplication 只能选择本人排班", async () => {
  global.resetMockState({ openid: "openid-swap-owner" });
  seedStaff({ employeeNo: "GH921", name: "申请人", openid: "openid-swap-owner" });
  const otherStaffId = seedStaff({ employeeNo: "GH922", name: "其他人" });
  const otherScheduleId = seedSchedule({
    staffId: otherStaffId,
    scheduleDate: dateOffset(1),
    status: "ASSIGNED",
  });
  let r = await swapRouter.createSwapApplication({
    data: { sourceScheduleId: otherScheduleId, reason: "r" },
  });
  assert.equal(r.code, 403);

  r = await swapRouter.createSwapApplication({
    data: { sourceScheduleId: { $regex: ".*" }, reason: "r" },
  });
  assert.equal(r.code, 400);
});

test("e2e/swap: listSwapRequests 按 status 筛选", async () => {
  global.resetMockState({ openid: "openid-list-swap-admin" });
  seedStaff({
    employeeNo: "GH923", name: "管理员", openid: "openid-list-swap-admin", isAdmin: true,
  });
  seedSwap({ status: "PENDING", flightNo: "P1" });
  seedSwap({ status: "APPROVED", flightNo: "A1" });
  const r = await swapRouter.listSwapRequests({ data: { status: "PENDING" } });
  assert.equal(r.code, 0);
  assert.equal(r.data.requests.length, 1);
  assert.equal(r.data.requests[0].flightNo, "P1");
});

test("e2e/swap: listSwapRequests 非管理员不可查看审批队列", async () => {
  global.resetMockState({ openid: "openid-list-swap-user" });
  seedStaff({
    employeeNo: "GH924",
    name: "普通员工",
    openid: "openid-list-swap-user",
  });
  seedSwap({ status: "PENDING", flightNo: "PRIVATE" });
  const r = await swapRouter.listSwapRequests({ data: { status: "PENDING" } });
  assert.equal(r.code, 403);
});

test("e2e/swap: listMySwapRequests 只返回本人并支持状态过滤", async () => {
  global.resetMockState({ openid: "openid-my-swap" });
  // 新版 listMySwapRequests 要求当前微信已绑定 active 员工 (requireActiveStaff)
  seedStaff({ employeeNo: "GH-SWAP-ME", name: "本人", openid: "openid-my-swap" });
  seedSwap({
    requesterOpenid: "openid-my-swap",
    status: "PENDING",
    requestType: "SHIFT_APPLY",
    flightNo: "MU5101",
  });
  seedSwap({
    requesterOpenid: "openid-my-swap",
    status: "CANCELLED",
    requestType: "SHIFT_APPLY",
    flightNo: "MU5102",
  });
  seedSwap({
    requesterOpenid: "openid-other-swap",
    status: "PENDING",
    flightNo: "MU5103",
  });

  let r = await swapRouter.listMySwapRequests({ data: {} });
  assert.equal(r.code, 0);
  assert.equal(r.data.list.length, 2);
  assert.equal(r.data.list[0].requestTypeText, "调班申请");

  r = await swapRouter.listMySwapRequests({ data: { status: "CANCELLED" } });
  assert.equal(r.code, 0);
  assert.equal(r.data.list.length, 1);
  assert.equal(r.data.list[0].flightNo, "MU5102");

  r = await swapRouter.listMySwapRequests({ data: { status: { $regex: ".*" } } });
  assert.equal(r.code, 400);
});

test("e2e/swap: approveSwapRequest (P0-3 修复) 非 admin → 403", async () => {
  global.resetMockState({ openid: "openid-asr" });
  seedStaff({ employeeNo: "GH930", name: "test", openid: "openid-asr" });
  const reqId = seedSwap({ status: "PENDING" });
  const r = await swapRouter.approveSwapRequest({ data: { requestId: reqId, decision: "APPROVE" } });
  assert.equal(r.code, 403);
});

test("e2e/swap: approveSwapRequest admin 审批通过 SHIFT_APPLY", async () => {
  global.resetMockState({ openid: "openid-asr2" });
  seedStaff({ employeeNo: "GH931", name: "admin", openid: "openid-asr2", isAdmin: true });
  const sourceStaffId = seedStaff({ employeeNo: "GH933", name: "申请人" });
  const replacementStaffId = seedStaff({
    employeeNo: "GH934",
    name: "替班人",
    authorizedAirlines: ["中国南方航空"],
    authorizedAircraftTypes: ["A320"],
  });
  const scheduleId = seedSchedule({
    staffId: sourceStaffId,
    staffName: "申请人",
    staffEmployeeNo: "GH933",
    scheduleDate: dateOffset(1),
    status: "ASSIGNED",
    airline: "中国南方航空",
    aircraftType: "A320",
  });
  const reqId = seedSwap({
    status: "PENDING",
    requestType: "SHIFT_APPLY",
    sourceStaffId,
    sourceScheduleId: scheduleId,
    employeeNo: "GH933",
    name: "申请人",
  });
  const r = await swapRouter.approveSwapRequest({
    data: { requestId: reqId, decision: "APPROVE", replacementStaffId },
  });
  assert.equal(r.code, 0);
  const updated = state.collections.swap_requests.find(s => s._id === reqId);
  assert.equal(updated.status, "APPROVED");
  assert.equal(updated.replacementEmployeeNo, "GH934");
  const updatedSchedule = state.collections.schedules.find(s => s._id === scheduleId);
  assert.equal(updatedSchedule.staffId, replacementStaffId);
  assert.equal(updatedSchedule.previousStaffId, sourceStaffId);
  assert.equal(updatedSchedule.status, "SWAPPED");
});

test("e2e/swap: SHIFT_APPLY 审批自动阻断单日工时超限", async () => {
  global.resetMockState({ openid: "openid-asr-hours-admin" });
  cacheRouter.clear();
  seedStaff({
    employeeNo: "GH939A",
    name: "管理员",
    openid: "openid-asr-hours-admin",
    isAdmin: true,
  });
  const sourceStaffId = seedStaff({ employeeNo: "GH939B", name: "申请人" });
  const replacementStaffId = seedStaff({
    employeeNo: "GH939C",
    name: "替班人",
    roleType: "SERVICE",
    authorizedAirlines: ["中国南方航空"],
    authorizedAircraftTypes: ["A320"],
  });
  const scheduleDate = dateOffset(1);
  const sourceScheduleId = seedSchedule({
    staffId: sourceStaffId,
    staffName: "申请人",
    staffEmployeeNo: "GH939B",
    scheduleDate,
    status: "ASSIGNED",
    airline: "中国南方航空",
    aircraftType: "A320",
    _taskType: "RELEASE",
    _taskStart: `${scheduleDate}T08:00:00`,
    _taskEnd: `${scheduleDate}T16:00:00`,
  });
  seedSchedule({
    staffId: replacementStaffId,
    staffName: "替班人",
    scheduleDate,
    status: "ASSIGNED",
    airline: "中国南方航空",
    aircraftType: "A320",
    _taskStart: `${scheduleDate}T18:00:00`,
    _taskEnd: `${scheduleDate}T20:00:00`,
  });
  seedSetting("maxDailyWorkHours", 8);
  seedSetting("minRestIntervalMinutes", 30);
  const requestId = seedSwap({
    requestType: "SHIFT_APPLY",
    sourceStaffId,
    sourceScheduleId,
    employeeNo: "GH939B",
    name: "申请人",
  });

  const r = await swapRouter.approveSwapRequest({
    data: {
      requestId,
      decision: "APPROVE",
      replacementStaffId,
    },
  });
  assert.equal(r.code, 409);
  assert.match(r.message, /资质与工时校验/);
  assert.ok(
    r.data.violations.some((item) => item.code === "ROLE_MISMATCH")
  );
  assert.ok(
    r.data.violations.some((item) => item.code === "DAILY_WORK_HOURS_EXCEEDED")
  );
  assert.equal(
    state.collections.swap_requests.find((item) => item._id === requestId).status,
    "PENDING"
  );
  assert.equal(
    state.collections.schedules.find((item) => item._id === sourceScheduleId).staffId,
    sourceStaffId
  );
});

test("e2e/swap: SHIFT_APPLY 审批必须指定替班人", async () => {
  global.resetMockState({ openid: "openid-asr-required" });
  seedStaff({
    employeeNo: "GH935",
    name: "管理员",
    openid: "openid-asr-required",
    isAdmin: true,
  });
  const sourceStaffId = seedStaff({ employeeNo: "GH936", name: "申请人" });
  const scheduleId = seedSchedule({
    staffId: sourceStaffId,
    scheduleDate: dateOffset(1),
    status: "ASSIGNED",
  });
  const reqId = seedSwap({
    requestType: "SHIFT_APPLY",
    sourceStaffId,
    sourceScheduleId: scheduleId,
  });
  const r = await swapRouter.approveSwapRequest({
    data: { requestId: reqId, decision: "APPROVE" },
  });
  assert.equal(r.code, 400);
  assert.equal(state.collections.swap_requests.find((item) => item._id === reqId).status, "PENDING");
  assert.equal(state.collections.schedules.find((item) => item._id === scheduleId).staffId, sourceStaffId);
});

test("e2e/swap: SWAP 审批会互换双方真实排班", async () => {
  global.resetMockState({ openid: "openid-swap-exchange-admin" });
  seedStaff({
    employeeNo: "ADMIN-EXCHANGE",
    name: "管理员",
    openid: "openid-swap-exchange-admin",
    isAdmin: true,
  });
  const sourceStaffId = seedStaff({
    employeeNo: "GH937",
    name: "甲",
    authorizedAirlines: ["中国南方航空"],
    authorizedAircraftTypes: ["A320"],
  });
  const targetStaffId = seedStaff({
    employeeNo: "GH938",
    name: "乙",
    authorizedAirlines: ["中国南方航空"],
    authorizedAircraftTypes: ["A320"],
  });
  const scheduleDate = dateOffset(1);
  const sourceScheduleId = seedSchedule({
    staffId: sourceStaffId,
    staffName: "甲",
    staffEmployeeNo: "GH937",
    scheduleDate,
    status: "ASSIGNED",
    airline: "中国南方航空",
    aircraftType: "A320",
  });
  const targetScheduleId = seedSchedule({
    staffId: targetStaffId,
    staffName: "乙",
    staffEmployeeNo: "GH938",
    scheduleDate,
    status: "ASSIGNED",
    airline: "中国南方航空",
    aircraftType: "A320",
  });
  const requestId = seedSwap({
    requestType: "SWAP",
    sourceStaffId,
    targetStaffId,
    sourceScheduleId,
    targetScheduleId,
    // 新流程: 对方确认后 status 才从 PENDING_TARGET_CONFIRMATION 变为 PENDING。
    // 本用例聚焦审批互换行为, 直接以“对方已同意”的中间状态进入审批。
    status: "PENDING",
    targetConsent: "ACCEPTED",
  });

  const r = await swapRouter.approveSwapRequest({
    data: { requestId, decision: "APPROVE" },
  });
  assert.equal(r.code, 0);
  assert.equal(
    state.collections.schedules.find((item) => item._id === sourceScheduleId).staffId,
    targetStaffId
  );
  assert.equal(
    state.collections.schedules.find((item) => item._id === targetScheduleId).staffId,
    sourceStaffId
  );
});

test("e2e/swap: approveSwapRequest 重复审批 → 409", async () => {
  global.resetMockState({ openid: "openid-asr3" });
  seedStaff({ employeeNo: "GH932", name: "admin", openid: "openid-asr3", isAdmin: true });
  const reqId = seedSwap({ status: "APPROVED" });
  const r = await swapRouter.approveSwapRequest({ data: { requestId: reqId, decision: "APPROVE" } });
  assert.equal(r.code, 409);
});

// ══════════════════════════════════════════════════════════════
// 模块 9: log (2 端点)
// ══════════════════════════════════════════════════════════════

test("e2e/log: queryOperationLogs 分页 + 按 action 筛选", async () => {
  global.resetMockState({ openid: "x" });
  seedStaff({ employeeNo: "LOGADMIN1", name: "日志管理员", openid: "x", isAdmin: true });
  seedOperationLog({ action: "LOGIN", detail: "user1 登录" });
  seedOperationLog({ action: "LOGIN", detail: "user2 登录" });
  seedOperationLog({ action: "PUBLISH", detail: "发布排班" });
  const r = await logRouter.queryOperationLogs({ data: { action: "LOGIN" } });
  assert.equal(r.code, 0);
  assert.equal(r.data.total, 2);
  assert.equal(r.data.logs.length, 2);
});

test("e2e/log: exportOperationLogs 正常返回 fileID", async () => {
  global.resetMockState({ openid: "x" });
  seedStaff({ employeeNo: "LOGADMIN2", name: "日志管理员", openid: "x", isAdmin: true });
  seedOperationLog({ action: "TEST", detail: "中文测试", createdAt: new Date() });
  const r = await logRouter.exportOperationLogs({ data: {} });
  assert.equal(r.code, 0);
  assert.ok(r.data.fileID, "应返回 fileID");
  assert.ok(r.data.cloudPath, "应返回 cloudPath");
  // CSV BOM 的存在已在 e2e/source 测试中验证
});

test("e2e/log: 日志查询拒绝非管理员并校验日期范围", async () => {
  global.resetMockState({ openid: "openid-log-normal" });
  seedStaff({
    employeeNo: "GHLN01",
    name: "普通员工",
    openid: "openid-log-normal",
  });
  let r = await logRouter.queryOperationLogs({ data: {} });
  assert.equal(r.code, 403);

  setOpenid("openid-log-admin");
  seedStaff({
    employeeNo: "GHLA01",
    name: "管理员",
    openid: "openid-log-admin",
    isAdmin: true,
  });
  r = await logRouter.queryOperationLogs({
    data: { startDate: "2026-08-10", endDate: "2026-08-01" },
  });
  assert.equal(r.code, 400);
});

// ══════════════════════════════════════════════════════════════
// 模块 10: 集成场景 (端到端流程)
// ══════════════════════════════════════════════════════════════

test("e2e/integration: 完整流程 - 登录→发布排班→审批调班→查看通知", async () => {
  // 注意: 全程用 setOpenid 切换身份 (resetMockState 会清空集合)
  global.resetMockState({ openid: "openid-flow-admin" });
  // 1) admin 登录
  seedStaff({ employeeNo: "GH950", name: "管理员", openid: "openid-flow-admin", isAdmin: true });
  let r = await authRouter.getMyProfile();
  assert.equal(r.data.isAdmin, true);

  // 2) admin 发布排班
  const staffId = seedStaff({
    employeeNo: "GH951", name: "员工A", groupId: "A组",
    openid: "openid-staff-a", authorizedAircraftTypes: ["A320"],
  });
  const replacementStaffId = seedStaff({
    employeeNo: "GH952", name: "员工B", groupId: "B组",
    openid: "openid-staff-b", authorizedAircraftTypes: ["A320"],
  });
  const futureDate = dateOffset(1);
  // 版本化发布: 先由管理员刷新排班表初始化版本文档, 再带 expectedVersion 发布。
  r = await scheduleRouter.getStaffScheduleTable({ data: { scheduleDate: futureDate } });
  assert.equal(r.code, 0);
  r = await scheduleRouter.publishScheduleEdits({
    data: { scheduleDate: futureDate, expectedVersion: 0, edits: [{ staffId, shiftCode: "MORNING" }] },
  });
  assert.equal(r.code, 0);
  // 验证: 排班被创建
  const schedule = state.collections.schedules.find(s => s.staffId === staffId);
  assert.ok(schedule);
  assert.equal(schedule.shiftCode, "MORNING");
  assert.equal(schedule.recordStatus, "active");

  // 3) 员工提交调班申请 (仅切换 openid, 保留状态)
  setOpenid("openid-staff-a");
  r = await swapRouter.createSwapApplication({
    data: { sourceScheduleId: schedule._id, reason: "请假" },
  });
  assert.equal(r.code, 0);
  const appId = r.data.requestId;

  // 4) 员工查看通知 (应 1 条未读)
  r = await notificationRouter.listMyNotifications();
  assert.equal(r.data.unreadCount, 1);
  assert.equal(r.data.notifications[0].flightNo, schedule.flightNo);

  // 5) admin 审批通过 (切回 admin)
  setOpenid("openid-flow-admin");
  r = await swapRouter.approveSwapRequest({
    data: { requestId: appId, decision: "APPROVE", replacementStaffId },
  });
  assert.equal(r.code, 0);
  assert.equal(state.collections.schedules.find(s => s._id === schedule._id).staffId, replacementStaffId);

  // 6) 员工再次查看通知 (状态变 APPROVED, updatedAt 变, 仍未读)
  setOpenid("openid-staff-a");
  r = await notificationRouter.listMyNotifications();
  assert.equal(r.data.notifications[0].status, "APPROVED");
  // 标记已读
  r = await notificationRouter.markMyNotificationsRead();
  assert.equal(r.data.updatedCount, 1);
  // 再次查看, 应 0 未读
  r = await notificationRouter.listMyNotifications();
  assert.equal(r.data.unreadCount, 0);
});

test("e2e/integration: bootstrap→admin 用 8 个分组 (P2-18)", async () => {
  global.resetMockState({ openid: "openid-bootstrap-admin" });
  seedDemoAdmin("openid-bootstrap-admin");
  // P1 修复: 破坏性重置必须带 confirmText 二次确认
  await bootstrapRouter.resetDemoData({ data: { confirmText: "RESET_DEMO_DATA" } });
  const groups = new Set((state.collections.staff || []).map(s => s.groupId));
  for (const g of ["A组", "B组", "C组", "D组", "E组", "F组", "G组", "H组"]) {
    assert.ok(groups.has(g), `应包含 ${g}`);
  }
});

test("e2e/integration: 资质匹配用真实业务场景", async () => {
  global.resetMockState({ openid: "x" });
  seedStaff({
    employeeNo: "GH960", name: "南航员工",
    authorizedAirlines: ["中国南方航空"], authorizedAircraftTypes: ["A320", "B738"],
  });
  // 短中文匹配
  assert.equal(utilsRouter.hasQualification(
    state.collections.staff.find(s => s.employeeNo === "GH960"),
    "南航", "320"
  ), true, "P2-11 修复: 短中文 + 数字机型码应匹配");
  // 简写匹配
  assert.equal(utilsRouter.hasQualification(
    state.collections.staff.find(s => s.employeeNo === "GH960"),
    "CZ", "B738"
  ), true, "简写应匹配");
  // 完全无资质
  assert.equal(utilsRouter.hasQualification(
    state.collections.staff.find(s => s.employeeNo === "GH960"),
    "MU", "A320"
  ), false, "MU 不应匹配 (员工没东航资质)");
});

test("e2e/schedule: 未来排班不能提前确认完成", async () => {
  global.resetMockState({ openid: "openid-complete-future" });
  const staffId = seedStaff({
    employeeNo: "GH970",
    name: "执行人",
    openid: "openid-complete-future",
  });
  const scheduleId = seedSchedule({
    staffId,
    scheduleDate: dateOffset(1),
    status: "ASSIGNED",
    recordStatus: "active",
  });
  const r = await scheduleRouter.completeSchedule({ data: { scheduleId } });
  assert.equal(r.code, 409);
  assert.equal(state.collections.schedules.find((item) => item._id === scheduleId).status, "ASSIGNED");
});

test("e2e/schedule: 非执行态排班不能确认完成", async () => {
  global.resetMockState({ openid: "openid-complete-draft" });
  const staffId = seedStaff({
    employeeNo: "GH971",
    name: "执行人",
    openid: "openid-complete-draft",
  });
  const scheduleId = seedSchedule({
    staffId,
    scheduleDate: dateOffset(0),
    status: "DRAFT",
    recordStatus: "active",
  });
  const r = await scheduleRouter.completeSchedule({ data: { scheduleId } });
  assert.equal(r.code, 409);
});

test("e2e/schedule: 已批准请假当天不能确认完成", async () => {
  global.resetMockState({ openid: "openid-complete-leave" });
  const staffId = seedStaff({
    employeeNo: "GH973",
    name: "请假员工",
    openid: "openid-complete-leave",
  });
  seedLeave({
    employeeNo: "GH973",
    status: "APPROVED",
    startDate: dateOffset(0),
    endDate: dateOffset(0),
  });
  const scheduleId = seedSchedule({
    staffId,
    scheduleDate: dateOffset(0),
    status: "ASSIGNED",
    recordStatus: "active",
  });
  const r = await scheduleRouter.completeSchedule({ data: { scheduleId } });
  assert.equal(r.code, 409);
  assert.match(r.message, /请假/);
});

test("e2e/schedule: TSV 导入部分失败时回滚本次已写入排班 (P1-B4)", async () => {
  global.resetMockState({ openid: "openid-tsv-rollback" });
  seedStaff({
    employeeNo: "TSVADM",
    name: "导入管理员",
    openid: "openid-tsv-rollback",
    isAdmin: true,
  });
  seedStaff({
    employeeNo: "TSV001",
    name: "维修员",
    authorizedAirlines: ["中国南方航空"],
    authorizedAircraftTypes: ["A320"],
  });
  const targetDate = dateOffset(2);
  const r = await scheduleRouter.importScheduleFromTSV({
    data: {
      scheduleDate: targetDate,
      flights: [
        {
          flightNo: "TSVOK",
          airline: "中国南方航空",
          aircraftType: "A320",
          departureTime: `${targetDate}T09:00`,
          scheduleDate: targetDate,
        },
        {
          flightNo: "TSVBAD",
          airline: "",
          aircraftType: "A320",
          departureTime: `${targetDate}T10:00`,
          scheduleDate: targetDate,
        },
      ],
    },
  });
  // 有失败行: 整批回滚, 不应留下第一条已写入的排班
  assert.equal(r.data.importedCount, 0, "存在失败行时本次导入应整体回滚");
  assert.ok(r.data.errors.length >= 1);
  const written = state.collections.schedules.find((s) => s.flightNo === "TSVOK");
  assert.equal(written, undefined, "回滚后不应残留 TSVOK 排班");
});

test("e2e/schedule: TSV 导入拒绝同航班同日重复排班 (P1-B6)", async () => {
  global.resetMockState({ openid: "openid-tsv-dup" });
  seedStaff({
    employeeNo: "TSVADM2",
    name: "导入管理员",
    openid: "openid-tsv-dup",
    isAdmin: true,
  });
  seedStaff({
    employeeNo: "TSV002",
    name: "维修员乙",
    authorizedAirlines: ["中国东方航空"],
    authorizedAircraftTypes: ["B738"],
  });
  const targetDate = dateOffset(2);
  seedSchedule({
    flightNo: "TSVDUP",
    scheduleDate: targetDate,
    staffId: "existing-staff",
  });
  const r = await scheduleRouter.importScheduleFromTSV({
    data: {
      scheduleDate: targetDate,
      flights: [
        {
          flightNo: "TSVDUP",
          airline: "中国东方航空",
          aircraftType: "B738",
          departureTime: `${targetDate}T11:00`,
          scheduleDate: targetDate,
        },
      ],
    },
  });
  assert.ok(r.data.errors.some((item) => /已存在排班/.test(item)), "重复排班应被检测并报错");
  // 重复导入不应追加新排班记录
  const dups = state.collections.schedules.filter((s) => s.flightNo === "TSVDUP");
  assert.equal(dups.length, 1, "重复导入不应新增排班记录");
});

test("e2e/schedule: 本人当日执行态排班可确认完成并留痕", async () => {
  global.resetMockState({ openid: "openid-complete-today" });
  const staffId = seedStaff({
    employeeNo: "GH972",
    name: "执行人",
    openid: "openid-complete-today",
  });
  const scheduleId = seedSchedule({
    staffId,
    flightNo: "CZ9001",
    scheduleDate: dateOffset(0),
    status: "ASSIGNED",
    recordStatus: "active",
  });
  const r = await scheduleRouter.completeSchedule({
    data: { scheduleId, completionRemark: "任务已交接" },
  });
  assert.equal(r.code, 0);
  const updated = state.collections.schedules.find((item) => item._id === scheduleId);
  assert.equal(updated.status, "COMPLETED");
  assert.equal(updated.completionRemark, "任务已交接");
  assert.equal(updated.completedByOpenid, "openid-complete-today");
  assert.ok(state.collections.operation_logs.some((item) => item.action === "COMPLETE_SCHEDULE"));
});

test("e2e/schedule: 管理端排班端点统一拒绝非管理员", async () => {
  global.resetMockState({ openid: "openid-schedule-normal-user" });
  seedStaff({
    employeeNo: "GHSN01",
    name: "普通员工",
    openid: "openid-schedule-normal-user",
  });
  const adminEndpoints = [
    "exportSchedule",
    "publishScheduleEdits",
    "preflightComplianceCheck",
    "optimizeStaffSchedule",
    "smartSchedule",
    "smartScheduleMultiDay",
    "smartScheduleSingle",
    "importScheduleFromTSV",
    "getScheduleStatistics",
    "getServiceScheduleTable",
    "publishServiceSchedule",
    "smartScheduleWithRoles",
    "getScheduleStatusOverview",
    "getScheduleHistory",
  ];
  for (const endpoint of adminEndpoints) {
    const r = await scheduleRouter[endpoint]({ data: {} });
    assert.equal(r.code, 403, `${endpoint} 应拒绝非管理员`);
  }
});

test("e2e/schedule: 打印排班总表导出包含打印标记", async () => {
  global.resetMockState({ openid: "openid-print-admin" });
  seedStaff({
    employeeNo: "GHPRINT0",
    name: "打印管理员",
    openid: "openid-print-admin",
    isAdmin: true,
  });
  const staffId = seedStaff({
    employeeNo: "GHPRINT1",
    name: "打印员工",
    groupId: "A组",
    roleType: "SERVICE",
    authorizedAirlines: ["中国东方航空"],
    authorizedAircraftTypes: ["A320"],
  });
  const scheduleDate = dateOffset(1);
  seedSchedule({
    staffId,
    staffName: "打印员工",
    staffEmployeeNo: "GHPRINT1",
    groupId: "A组",
    scheduleDate,
    flightNo: "MU5301",
    inboundFlightNo: "MU5301",
    outboundFlightNo: "MU5302",
    airline: "中国东方航空",
    aircraftRegistration: "B-5678",
    aircraftType: "A320",
    engineModel: "CFM56-5B",
    scheduledArrivalTime: `${scheduleDate}T09:00`,
    estimatedArrivalTime: `${scheduleDate}T09:18`,
    departureTime: `${scheduleDate}T11:30`,
    shiftCode: "MORNING",
    status: "ASSIGNED",
    recordStatus: "active",
  });

  const r = await scheduleRouter.exportSchedule({
    data: {
      scheduleDate,
      format: "xlsx",
      exportMode: "PRINT",
    },
  });
  assert.equal(r.code, 0);
  assert.equal(r.data.exportMode, "PRINT");
  assert.equal(r.data.printReady, true);
  assert.match(r.data.fileName, /排班总表_打印版/);
  assert.match(r.data.fileID, /schedule_print/);
  assert.ok(r.data.rowCount >= 1);
  assert.ok(
    state.collections.operation_logs.some(
      (item) => item.action === "EXPORT_SCHEDULE"
    )
  );
});

test("e2e/schedule: 勤务智能排班只生成预览，确认发布后写入完整人员与时间", async () => {
  global.resetMockState({ openid: "openid-service-schedule-admin" });
  cacheRouter.clear();
  const scheduleDate = dateOffset(2);
  seedStaff({
    employeeNo: "GHSS00",
    name: "管理员",
    openid: "openid-service-schedule-admin",
    isAdmin: true,
  });
  seedStaff({
    employeeNo: "GHSS01",
    name: "勤务甲",
    groupId: "A组",
    roleType: "SERVICE",
    authorizedAirlines: ["中国南方航空"],
    authorizedAircraftTypes: ["A320"],
  });
  seedStaff({
    employeeNo: "GHSS02",
    name: "放行乙",
    groupId: "B组",
    roleType: "RELEASE",
    authorizedAirlines: ["中国南方航空"],
    authorizedAircraftTypes: ["A320"],
  });
  seedSetting("serviceRequiredCount", 1);
  seedSetting("releaseRequiredCount", 1);
  seedSetting("servicePrepTimeMinutes", 30);
  seedSetting("serviceWrapTimeMinutes", 15);
  seedSetting("releasePrepTimeMinutes", 20);
  seedSetting("releaseWrapTimeMinutes", 10);
  seedSetting("minRestIntervalMinutes", 30);
  seedSetting("maxConsecutiveNightShifts", 2);
  seedSetting("maxDailyWorkHours", 12);
  seedFlight({
    flightNo: "CZ8801",
    airline: "中国南方航空",
    aircraftType: "A320",
    scheduleDate,
    arrivalTime: "09:00",
    departureTime: "11:00",
  });

  const preview = await scheduleRouter.smartScheduleWithRoles({
    data: { scheduleDate },
  });
  assert.equal(preview.code, 0);
  assert.equal(preview.data.assignments.length, 2);
  assert.equal(preview.data.stats.unfilledTaskCount, 0);
  assert.equal((state.collections.schedules || []).length, 0, "生成预览时不得写入排班");

  const published = await scheduleRouter.publishServiceSchedule({
    data: {
      scheduleDate,
      assignments: preview.data.assignments,
    },
  });
  assert.equal(published.code, 0);
  assert.equal(published.data.writtenCount, 2);
  const records = state.collections.schedules || [];
  assert.equal(records.length, 2);
  assert.deepEqual(
    records.map((item) => item.staffName).sort(),
    ["勤务甲", "放行乙"]
  );
  assert.ok(records.every((item) => item._taskStart && item._taskEnd));
});

test("e2e/schedule: 勤务发布拒绝人员不足的预览", async () => {
  global.resetMockState({ openid: "openid-service-shortage-admin" });
  seedStaff({
    employeeNo: "GHSH00",
    name: "管理员",
    openid: "openid-service-shortage-admin",
    isAdmin: true,
  });
  const staffId = seedStaff({
    employeeNo: "GHSH01",
    name: "勤务甲",
    groupId: "A组",
    roleType: "SERVICE",
    authorizedAirlines: ["中国南方航空"],
    authorizedAircraftTypes: ["A320"],
  });
  seedSetting("serviceRequiredCount", 2);
  seedSetting("releaseRequiredCount", 1);
  const r = await scheduleRouter.publishServiceSchedule({
    data: {
      scheduleDate: dateOffset(2),
      assignments: [{
        flightNo: "CZ8802",
        airline: "中国南方航空",
        aircraftType: "A320",
        taskType: "SERVICE",
        staff: [{ staffId }],
        taskWindow: {
          start: `${dateOffset(2)}T09:00:00`,
          end: `${dateOffset(2)}T10:00:00`,
        },
      }],
    },
  });
  assert.equal(r.code, 409);
  assert.equal((state.collections.schedules || []).length, 0);
});

// ══════════════════════════════════════════════════════════════
// 模块 11: 源码检查 (替代无法 mock 的端点)
// ══════════════════════════════════════════════════════════════

const scheduleSrc = fs.readFileSync(path.resolve(__dirname, "../router/schedule.js"), "utf8");
const bootstrapSrc = fs.readFileSync(path.resolve(__dirname, "../router/bootstrap.js"), "utf8");
const scheduleIndex = fs.readFileSync(path.resolve(__dirname, "../index.js"), "utf8");
const realtimeSrc = fs.readFileSync(path.resolve(__dirname, "../router/realtime.js"), "utf8");
const flightSrc = fs.readFileSync(path.resolve(__dirname, "../router/flight.js"), "utf8");
const authSrc = fs.readFileSync(path.resolve(__dirname, "../router/auth.js"), "utf8");
const swapSrc = fs.readFileSync(path.resolve(__dirname, "../router/swap.js"), "utf8");
const settingsSrc = fs.readFileSync(path.resolve(__dirname, "../router/settings.js"), "utf8");
const adminSrc = fs.readFileSync(path.resolve(__dirname, "../router/admin.js"), "utf8");
const notificationSrc = fs.readFileSync(path.resolve(__dirname, "../router/notification.js"), "utf8");
const assistantSrc = fs.readFileSync(path.resolve(__dirname, "../router/assistant.js"), "utf8");
const logSrc = fs.readFileSync(path.resolve(__dirname, "../router/log.js"), "utf8");
const utilsSrc = fs.readFileSync(path.resolve(__dirname, "../utils.js"), "utf8");
const syncToHangyiSrc = fs.readFileSync(path.resolve(__dirname, "../../syncToHangyi/index.js"), "utf8");

test("e2e/source: schedule.js 17 个端点都已导出", () => {
  const expected = [
    "getStaffScheduleTable", "exportSchedule", "getMySchedules", "publishScheduleEdits",
    "preflightComplianceCheck", "optimizeStaffSchedule", "smartSchedule", "smartScheduleMultiDay",
    "smartScheduleSingle", "importScheduleFromTSV", "getScheduleStatistics", "getServiceScheduleTable",
    "publishServiceSchedule", "smartScheduleWithRoles", "completeSchedule",
    "getScheduleStatusOverview", "getScheduleHistory",
  ];
  for (const fn of expected) {
    assert.ok(scheduleSrc.includes("const " + fn + " ="), "schedule.js 应有 const " + fn);
  }
});

test("e2e/source: flight.js 6 个公共端点都已导出", () => {
  const expected = [
    "updateFlightOperationalData",
    "getRiskCenterDashboard", "getWarningAnalytics", "getMaintenanceForecast",
    "getFatigueScores", "getQualificationStatus",
  ];
  for (const fn of expected) {
    assert.ok(flightSrc.includes("const " + fn + " ="), "flight.js 应有 const " + fn);
  }
  assert.equal(flightSrc.includes("getLongStayWarnings"), false);
  assert.equal(flightSrc.includes("simulateLongStayWarnings"), false);
  assert.equal(flightSrc.includes("predictFlightRisks"), false);
  assert.equal(flightSrc.includes("simulateMaintenanceFlowTrend"), false);
  assert.equal(flightSrc.includes("upsertFlight"), false);
});

test("e2e/source: index.js 合并所有 router", () => {
  const expectedRouters = [
    "authRouter", "bootstrapRouter", "scheduleRouter", "flightRouter",
    "swapRouter", "notificationRouter", "adminRouter", "settingsRouter",
    "logRouter", "realtimeRouter", "hangyiSyncRouter", "leaveRouter", "assistantRouter",
  ];
  for (const r of expectedRouters) {
    assert.ok(scheduleIndex.includes(r), "index.js 应引入 " + r);
  }
});

test("e2e/source: 服务异常不向客户端返回堆栈", () => {
  assert.equal(scheduleIndex.includes("stack: error.stack"), false);
  assert.ok(scheduleIndex.includes("服务暂时不可用，请稍后重试"));
  assert.ok(scheduleIndex.includes("withInvocationContext"));
});

test("e2e/source: hangyi-sync 全量同步有记录数上限并分批推送 (P1-D2)", () => {
  const hangyiSyncSrc = fs.readFileSync(
    path.resolve(__dirname, "../router/hangyi-sync.js"),
    "utf8"
  );
  assert.ok(hangyiSyncSrc.includes("MAX_FETCH_RECORDS"), "fetchAllFromCollection 应有最大记录数上限");
  assert.ok(hangyiSyncSrc.includes("SYNC_BATCH_SIZE"), "syncDataToHangyi 应分批推送");
  assert.ok(hangyiSyncSrc.includes("超过"), "超限时应明确报错");
});

test("e2e/source: settings setSetting 敏感密钥需二次确认 (P1-D3)", () => {
  assert.ok(settingsSrc.includes("SECRET_CONFIRM_TEXT"), "setSetting 应有敏感密钥确认常量");
  assert.ok(settingsSrc.includes("confirmText"), "setSetting 应校验 confirmText");
});

test("e2e/source: warnings 缓存分支审批队列失败有可见提示 (P1-H1)", () => {
  const warningsPage = fs.readFileSync(
    path.resolve(__dirname, "../../../miniprogram/pages/warnings/index.js"),
    "utf8"
  );
  assert.ok(warningsPage.includes("swapNotice"), "warnings 应有 swapNotice 提示字段");
  assert.ok(warningsPage.includes("catch"), "缓存分支应捕获 listSwapRequests 异常");
});

test("e2e/source: 智能调度 (P1-8 修复) 工时估算用 8h", () => {
  assert.ok(scheduleSrc.includes("count * 8"), "P1-8 修复: 应有 count * 8");
  assert.ok(!scheduleSrc.includes("count * 4"), "不应再有 count * 4");
});

test("e2e/source: smartScheduleWithRoles (P2-15 修复) 用 minRestInterval", () => {
  assert.ok(scheduleSrc.includes("minRestInterval"), "应使用 minRestInterval");
  // 在 smartScheduleWithRoles 函数体内不应再硬编码 30
  const m = scheduleSrc.match(/const smartScheduleWithRoles[\s\S]+?^\};$/m);
  if (m) {
    assert.ok(!m[0].includes("gapMin > 30"), "smartScheduleWithRoles 不应硬编码 30");
  }
});

test("e2e/source: parseTime 死代码已修 (P2-19)", () => {
  // 不应再有 "parseTime(...) || x ? new Date(x) : null" 模式
  const buggyPattern = /parseTime\(scheduleDate, f\.[a-zA-Z]+\) \|\| f\.[a-zA-Z]+ \? new Date/;
  assert.ok(!buggyPattern.test(scheduleSrc), "parseTime 死代码模式应已被修复");
});

test("e2e/source: hasQualification 归一化 (P2-11)", () => {
  assert.ok(utilsSrc.includes("normalizeAirlineName(airline)"), "应归一化航司");
  assert.ok(utilsSrc.includes("normalizeAircraftType(aircraftType)"), "应归一化机型");
});

test("e2e/source: matchAirline SHORT_NAME_MAP 优先 (P2 额外修复)", () => {
  // 应先尝试 SHORT_NAME_MAP 精确匹配
  const m = utilsSrc.indexOf("SHORT_NAME_MAP[raw]");
  const fullLoopIdx = utilsSrc.indexOf("fullName.includes(raw)");
  assert.ok(m > -1, "matchAirline 应包含 SHORT_NAME_MAP 精确匹配");
  assert.ok(m < fullLoopIdx, "SHORT_NAME_MAP 精确匹配应在 includes 子串匹配之前");
});

test("e2e/source: purgeCollection (P2-17 修复) 用 allSettled", () => {
  assert.ok(utilsSrc.includes("Promise.allSettled"), "purgeCollection 应用 allSettled");
});

test("e2e/source: bootstrap 8 分组 (P2-18)", () => {
  // 直接读 groups 数组字面量
  const m = bootstrapSrc.match(/const groups = \[(.*?)\]/s);
  assert.ok(m, "应能找到 groups 定义");
  const count = (m[1].match(/"[^"]+组"/g) || []).length;
  assert.equal(count, 8, "应包含 8 个分组");
});

test("e2e/source: publishScheduleEdits (P2-13 修复) 新记录加 recordStatus", () => {
  assert.ok(scheduleSrc.includes('recordStatus: "active"'), "P2-13 修复: 新排班应有 recordStatus: 'active'");
});

test("e2e/source: realtime 写操作加 admin 守卫 (P0-4)", () => {
  // 用 indexOf + 切分函数体, 避免 regex 停在第一个 return ok
  function fnBody(src, start) {
    const next = src.indexOf("exports.", start);
    return src.slice(start, next > 0 ? next : start + 2000);
  }
  const uIdx = realtimeSrc.indexOf("const updateFlightRealtimeStatus");
  const pIdx = realtimeSrc.indexOf("const propagateScheduleDelay");
  const rIdx = realtimeSrc.indexOf("const reassignStaffTask");
  assert.ok(fnBody(realtimeSrc, uIdx).includes("requireAdmin"), "updateFlightRealtimeStatus 应有 requireAdmin");
  assert.ok(fnBody(realtimeSrc, pIdx).includes("requireAdmin"), "propagateScheduleDelay 应有 requireAdmin");
  assert.ok(fnBody(realtimeSrc, rIdx).includes("requireAdmin"), "reassignStaffTask 应有 requireAdmin");
});

test("e2e/source: swap approveSwapRequest 加 admin 守卫 (P0-3)", () => {
  const fn = swapSrc.match(/const approveSwapRequest[\s\S]+?return ok\(\{ requestId/);
  assert.ok(fn && fn[0].includes("requireAdmin"), "approveSwapRequest 应有 requireAdmin");
});

test("e2e/source: settings setSetting 加 admin 守卫 + 白名单 (P0-2)", () => {
  const fn = settingsSrc.match(/const setSetting[\s\S]+?^\};$/m);
  assert.ok(fn && fn[0].includes("requireAdmin"), "setSetting 应有 requireAdmin");
  assert.ok(fn && fn[0].includes("ALLOWED_SETTING_KEYS"), "setSetting 应有 ALLOWED_SETTING_KEYS 白名单");
});

test("e2e/source: admin setStaffAdmin 加 admin 守卫 (P0-1)", () => {
  const fn = adminSrc.match(/const setStaffAdmin[\s\S]+?return ok/);
  assert.ok(fn && fn[0].includes("requireAdmin"), "setStaffAdmin 应有 requireAdmin");
});

test("e2e/source: auth loginOrRegisterStaff 不覆盖 groupId/roleType (P1-5)", () => {
  const fn = authSrc.match(/const loginOrRegisterStaff[\s\S]+?return ok/);
  assert.ok(
    fn && fn[0].includes("const finalGroupId = staff.groupId"),
    "既有员工登录必须使用管理员维护的 groupId"
  );
});

test("e2e/source: 资质白名单 (P1-6 修复) 含 B738/B38M", () => {
  // 登录不再信任客户端资质后, 机型归一化/种子白名单承载 B738/B38M。
  assert.ok(utilsSrc.includes("B738"), "机型归一化应含 B738");
  assert.ok(utilsSrc.includes("B38M"), "机型归一化应含 B38M");
});

test("e2e/source: 不再导出可猜工号的扫码绑定端点", () => {
  assert.equal(authSrc.includes("bindStaffByScanCode"), false);
});

test("e2e/source: notification markMyNotificationsRead 分页 (P2-14)", () => {
  const helper = notificationSrc.match(/const markCollectionRead[\s\S]+?return updatedCount/);
  const entry = notificationSrc.match(/const markMyNotificationsRead[\s\S]+?return ok/);
  assert.ok(helper && helper[0].includes("while (hasMore)"), "通知已读 helper 应用 while(hasMore) 分页");
  assert.ok(helper[0].includes("PAGE_SIZE"), "通知已读 helper 应有 PAGE_SIZE 常量");
  assert.ok(entry && entry[0].includes("markCollectionRead"), "markMyNotificationsRead 应复用分页 helper");
});

test("e2e/source: log exportOperationLogs 加 UTF-8 BOM (P3-22)", () => {
  const fn = logSrc.match(/const exportOperationLogs[\s\S]+?return ok/);
  assert.ok(fn && fn[0].includes("uFEFF"), "exportOperationLogs 应加 UTF-8 BOM");
  assert.ok(fn && fn[0].includes("csvCell"), "exportOperationLogs 应统一转义 CSV 单元格");
  assert.ok(fn && fn[0].includes("/^[=+\\-@]/"), "exportOperationLogs 应阻断公式注入");
});

test("e2e/source: utils callHangyiService 返回结构化结果 (P2-20)", () => {
  const m = utilsSrc.match(/const callHangyiService[\s\S]+?^\};$/m);
  assert.ok(m && m[0].includes("ok:"), "callHangyiService 应返回 ok 字段");
  assert.ok(m && m[0].includes("statusCode:"), "callHangyiService 应返回 statusCode");
  // 不应再有 catch { resolve(null) }
  const oldPattern = /catch \{ resolve\(null\); \}/;
  assert.ok(!oldPattern.test(m[0]), "callHangyiService 不应再有静默返回 null");
});

test("e2e/source: syncToHangyi 同步 statusCode 检查 (已存在修复)", () => {
  assert.ok(syncToHangyiSrc.includes("res.statusCode >= 200"), "syncToHangyi 应检查 HTTP statusCode");
  assert.ok(syncToHangyiSrc.includes("BATCH_SIZE = 30"), "syncToHangyi BATCH_SIZE 应为 30");
  // DEMO 联调放宽为 http(s) (生产应改回 https 严格校验), 但仍拒绝私网/非 origin。
  assert.ok(syncToHangyiSrc.includes('base.protocol === "https:" || base.protocol === "http:"'), "定时同步只允许公网 http(s)");
  assert.ok(syncToHangyiSrc.includes("isPrivateHostname(base.hostname)"), "定时同步必须拒绝私网地址");
  assert.ok(syncToHangyiSrc.includes("MAX_RESPONSE_BYTES"), "定时同步必须限制响应大小");
});

test("e2e/source: syncToHangyi 首次执行使用分页全量同步", () => {
  assert.ok(syncToHangyiSrc.includes("initialSync: true"));
  assert.ok(syncToHangyiSrc.includes("if (!initialSync) query = query.where"));
  assert.ok(syncToHangyiSrc.includes('orderBy("_id", "asc")'));
  assert.ok(syncToHangyiSrc.includes("skip += res.data.length"));
  assert.equal(syncToHangyiSrc.includes("Date.now() - 600000"), false);
  assert.ok(syncToHangyiSrc.includes('leave_requests: "/api/sync/leave-requests"'));
});

test("e2e/sync: 手动同步使用标准请假路径且部分失败不返回成功", async () => {
  global.resetMockState({ openid: "openid-sync-admin" });
  seedStaff({
    employeeNo: "SYNC001",
    name: "同步管理员",
    openid: "openid-sync-admin",
    isAdmin: true,
  });
  seedSetting("hangyiSyncEnabled", "true");
  seedSetting("hangyiApiUrl", "https://sync.example.test");
  seedSetting("hangyiApiKey", "sync-test-key");
  seedLeave({ employeeNo: "SYNC001", updatedAt: new Date() });
  const targets = [];
  global.__HANGYI_HTTP_REQUEST__ = async (request) => {
    targets.push(request.target);
    if (request.target.endsWith("/api/auth/verify")) {
      return { ok: true, statusCode: 200, body: { code: 200, data: {} } };
    }
    return { ok: false, statusCode: 500, body: { code: 500, msg: "upstream failed" }, error: "HTTP 500" };
  };
  try {
    const result = await hangyiSyncRouter.syncDataToHangyi({
      data: { token: "valid-token", collections: ["leave_requests"] },
    });
    assert.equal(result.code, 502);
    assert.deepEqual(result.data.failedCollections, ["leave_requests"]);
    assert.equal(result.data.results.leave_requests.status, "failed");
    assert.ok(targets.some((target) => target.endsWith("/api/sync/leave-requests")));
  } finally {
    delete global.__HANGYI_HTTP_REQUEST__;
  }
});

test("e2e/source: api.js callBackend 错误带 code (P3-23)", () => {
  const apiSrc = fs.readFileSync(path.resolve(__dirname, "../../../miniprogram/utils/api.js"), "utf8");
  assert.ok(apiSrc.includes("err.code = result.code"), "callBackend 应把 code 挂到 error 对象上");
});

// ══════════════════════════════════════════════════════════════
// 模块 8: leave (5 端点)
// ══════════════════════════════════════════════════════════════

const FUTURE_DATE = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

test("e2e/leave: createLeaveRequest 正常流程", async () => {
  global.resetMockState({ openid: "openid-leave-1" });
  seedStaff({ employeeNo: "GH701", name: "请假员工1", openid: "openid-leave-1" });
  const r = await leaveRouter.createLeaveRequest({
    data: {
      employeeNo: "GH701", name: "请假员工1",
      type: "SICK", startDate: FUTURE_DATE(1), endDate: FUTURE_DATE(3),
      reason: "发烧需要休息",
    },
  });
  assert.equal(r.code, 0, r.message);
  assert.equal(r.data.totalDays, 3);
  assert.equal(r.data.status, "PENDING");
  assert.ok(r.data.requestId);
});

test("e2e/leave: 请假支持仅上传图片并预检受影响排班", async () => {
  global.resetMockState({ openid: "openid-leave-image" });
  const staffId = seedStaff({
    employeeNo: "GH701I",
    name: "图片请假员工",
    openid: "openid-leave-image",
  });
  const leaveDate = FUTURE_DATE(2);
  const scheduleId = seedSchedule({
    staffId,
    staffName: "图片请假员工",
    staffEmployeeNo: "GH701I",
    scheduleDate: leaveDate,
    status: "ASSIGNED",
    recordStatus: "active",
    _taskStart: `${leaveDate}T08:00:00`,
    _taskEnd: `${leaveDate}T16:00:00`,
  });
  const fileID = "cloud://mock/request-reasons/leave/certificate.jpg";
  const r = await leaveRouter.createLeaveRequest({
    data: {
      type: "SICK",
      startDate: leaveDate,
      endDate: leaveDate,
      reasonImages: [fileID],
    },
  });
  assert.equal(r.code, 0);
  assert.equal(r.data.validationSnapshot.affectedScheduleCount, 1);
  assert.deepEqual(r.data.validationSnapshot.affectedScheduleIds, [scheduleId]);
  assert.equal(r.data.validationSnapshot.scheduledWorkHours, 8);
  const saved = state.collections.leave_requests.find(
    (item) => item._id === r.data.requestId
  );
  assert.equal(saved.reasonMode, "IMAGE");
  assert.equal(saved.reasonText, "");
  assert.deepEqual(saved.reasonImages, [fileID]);
  assert.equal(saved.auditTrail[0].action, "SUBMITTED");
  assert.ok(
    state.collections.operation_logs.some((item) => item.action === "CREATE_LEAVE")
  );
});

test("e2e/leave: 请假原因必须提供文字或有效云存储图片", async () => {
  global.resetMockState({ openid: "openid-leave-evidence-invalid" });
  seedStaff({
    employeeNo: "GH701X",
    name: "请假员工",
    openid: "openid-leave-evidence-invalid",
  });
  const empty = await leaveRouter.createLeaveRequest({
    data: {
      type: "SICK",
      startDate: FUTURE_DATE(1),
      endDate: FUTURE_DATE(1),
    },
  });
  assert.equal(empty.code, 400);
  const invalid = await leaveRouter.createLeaveRequest({
    data: {
      type: "SICK",
      startDate: FUTURE_DATE(1),
      endDate: FUTURE_DATE(1),
      reasonImages: { $regex: ".*" },
    },
  });
  assert.equal(invalid.code, 400);
});

test("e2e/leave: createLeaveRequest 过去日期 → 400", async () => {
  global.resetMockState({ openid: "openid-leave-1" });
  const pastDate = FUTURE_DATE(-5);
  const r = await leaveRouter.createLeaveRequest({
    data: {
      employeeNo: "GH701", name: "请假员工1", type: "SICK",
      startDate: pastDate, endDate: FUTURE_DATE(1), reason: "x",
    },
  });
  assert.equal(r.code, 400);
  assert.match(r.message, /过去日期/);
});

test("e2e/leave: createLeaveRequest 日期格式错 → 400", async () => {
  global.resetMockState({ openid: "openid-leave-1" });
  const r = await leaveRouter.createLeaveRequest({
    data: {
      employeeNo: "GH701", name: "请假员工1", type: "SICK",
      startDate: "2026/07/01", endDate: FUTURE_DATE(1), reason: "x",
    },
  });
  assert.equal(r.code, 400);
});

test("e2e/leave: createLeaveRequest 无效类型 → 400", async () => {
  global.resetMockState({ openid: "openid-leave-1" });
  const r = await leaveRouter.createLeaveRequest({
    data: {
      employeeNo: "GH701", name: "请假员工1", type: "INVALID",
      startDate: FUTURE_DATE(1), endDate: FUTURE_DATE(3), reason: "x",
    },
  });
  assert.equal(r.code, 400);
  assert.match(r.message, /类型无效/);
});

test("e2e/leave: createLeaveRequest 跨度超 365 → 400", async () => {
  global.resetMockState({ openid: "openid-leave-1" });
  const r = await leaveRouter.createLeaveRequest({
    data: {
      employeeNo: "GH701", name: "请假员工1", type: "ANNUAL",
      startDate: FUTURE_DATE(1), endDate: FUTURE_DATE(400), reason: "x",
    },
  });
  assert.equal(r.code, 400);
  assert.match(r.message, /365/);
});

test("e2e/leave: createLeaveRequest 忽略客户端伪造身份", async () => {
  global.resetMockState({ openid: "openid-leave-1" });
  seedStaff({ employeeNo: "GH701", name: "请假员工1", openid: "openid-leave-1" });
  const r = await leaveRouter.createLeaveRequest({
    data: {
      employeeNo: "GH999", name: "请假员工1",
      type: "SICK", startDate: FUTURE_DATE(1), endDate: FUTURE_DATE(3),
      reason: "x",
    },
  });
  assert.equal(r.code, 0);
  const saved = state.collections.leave_requests.find((item) => item._id === r.data.requestId);
  assert.equal(saved.employeeNo, "GH701");
  assert.equal(saved.name, "请假员工1");
});

test("e2e/leave: createLeaveRequest 时段冲突 → 409", async () => {
  global.resetMockState({ openid: "openid-leave-1" });
  seedStaff({ employeeNo: "GH701", name: "请假员工1", openid: "openid-leave-1" });
  // 第一次提交
  await leaveRouter.createLeaveRequest({
    data: {
      employeeNo: "GH701", name: "请假员工1", type: "SICK",
      startDate: FUTURE_DATE(1), endDate: FUTURE_DATE(5), reason: "first",
    },
  });
  // 第二次提交重叠
  const r = await leaveRouter.createLeaveRequest({
    data: {
      employeeNo: "GH701", name: "请假员工1", type: "ANNUAL",
      startDate: FUTURE_DATE(3), endDate: FUTURE_DATE(7), reason: "second",
    },
  });
  assert.equal(r.code, 409);
  assert.match(r.message, /已被请假申请覆盖/);
});

test("e2e/leave: withdrawLeaveRequest 撤回自己 PENDING → 200", async () => {
  global.resetMockState({ openid: "openid-leave-1" });
  const id = seedLeave({
    openid: "openid-leave-1", employeeNo: "GH701", name: "请假员工1",
    type: "SICK", startDate: FUTURE_DATE(1), endDate: FUTURE_DATE(2),
    totalDays: 2, reason: "x", status: "PENDING",
  });
  const r = await leaveRouter.withdrawLeaveRequest({ data: { requestId: id } });
  assert.equal(r.code, 0);
  assert.equal(r.data.status, "CANCELLED");
});

test("e2e/leave: withdrawLeaveRequest 撤回别人的 → 403", async () => {
  global.resetMockState({ openid: "openid-leave-other" });
  const id = seedLeave({
    openid: "openid-leave-1", employeeNo: "GH701", name: "请假员工1",
    type: "SICK", startDate: FUTURE_DATE(1), endDate: FUTURE_DATE(2),
    totalDays: 2, reason: "x", status: "PENDING",
  });
  const r = await leaveRouter.withdrawLeaveRequest({ data: { requestId: id } });
  assert.equal(r.code, 403);
});

test("e2e/leave: withdrawLeaveRequest 撤回已 APPROVED → 409", async () => {
  global.resetMockState({ openid: "openid-leave-1" });
  const id = seedLeave({
    openid: "openid-leave-1", employeeNo: "GH701", name: "请假员工1",
    type: "SICK", startDate: FUTURE_DATE(1), endDate: FUTURE_DATE(2),
    totalDays: 2, reason: "x", status: "APPROVED",
  });
  const r = await leaveRouter.withdrawLeaveRequest({ data: { requestId: id } });
  assert.equal(r.code, 409);
});

test("e2e/leave: listMyLeaveRequests 返回自己名下", async () => {
  global.resetMockState({ openid: "openid-leave-1" });
  seedLeave({ openid: "openid-leave-1", employeeNo: "GH701", name: "a", type: "SICK", startDate: FUTURE_DATE(1), endDate: FUTURE_DATE(2), totalDays: 2, reason: "x" });
  seedLeave({ openid: "openid-leave-1", employeeNo: "GH701", name: "a", type: "ANNUAL", startDate: FUTURE_DATE(10), endDate: FUTURE_DATE(15), totalDays: 6, reason: "y" });
  seedLeave({ openid: "openid-other", employeeNo: "GH702", name: "b", type: "PERSONAL", startDate: FUTURE_DATE(1), endDate: FUTURE_DATE(2), totalDays: 2, reason: "z" });
  const r = await leaveRouter.listMyLeaveRequests();
  assert.equal(r.code, 0);
  assert.equal(r.data.total, 2);
  for (const item of r.data.list) {
    assert.equal(item.employeeNo, "GH701");
  }
});

test("e2e/leave: listPendingLeaveRequests 非 admin → 403", async () => {
  global.resetMockState({ openid: "openid-non-admin" });
  seedStaff({ employeeNo: "GH801", name: "非管理员", openid: "openid-non-admin" });
  const r = await leaveRouter.listPendingLeaveRequests({});
  assert.equal(r.code, 403);
});

test("e2e/leave: listPendingLeaveRequests admin 过滤", async () => {
  global.resetMockState({ openid: "openid-admin-1" });
  seedStaff({ employeeNo: "ADMIN900", name: "管理员", isAdmin: true, openid: "openid-admin-1" });
  seedLeave({ openid: "openid-other", employeeNo: "GH701", name: "a", type: "SICK", startDate: FUTURE_DATE(1), endDate: FUTURE_DATE(2), totalDays: 2, reason: "pending" });
  seedLeave({ openid: "openid-other", employeeNo: "GH701", name: "a", type: "SICK", startDate: FUTURE_DATE(10), endDate: FUTURE_DATE(15), totalDays: 6, reason: "approved", status: "APPROVED" });
  let r = await leaveRouter.listPendingLeaveRequests({ data: { status: "PENDING" } });
  assert.equal(r.code, 0);
  assert.equal(r.data.total, 1);
  r = await leaveRouter.listPendingLeaveRequests({
    data: { status: { $regex: ".*" } },
  });
  assert.equal(r.code, 400);
});

test("e2e/leave: approveLeaveRequest 非 admin → 403", async () => {
  global.resetMockState({ openid: "openid-not-admin-1" });
  seedStaff({ employeeNo: "GH802", name: "普通员工", openid: "openid-not-admin-1" });
  const id = seedLeave({ openid: "openid-other", employeeNo: "GH701", type: "SICK", startDate: FUTURE_DATE(1), endDate: FUTURE_DATE(2), totalDays: 2, reason: "x" });
  const r = await leaveRouter.approveLeaveRequest({ data: { requestId: id, decision: "APPROVED" } });
  assert.equal(r.code, 403);
});

test("e2e/leave: approveLeaveRequest 批准 PENDING → 200", async () => {
  global.resetMockState({ openid: "openid-admin-2" });
  seedStaff({ employeeNo: "ADMIN901", name: "审批人", isAdmin: true, openid: "openid-admin-2" });
  const id = seedLeave({ openid: "openid-other", employeeNo: "GH701", name: "a", type: "SICK", startDate: FUTURE_DATE(1), endDate: FUTURE_DATE(2), totalDays: 2, reason: "x" });
  const r = await leaveRouter.approveLeaveRequest({ data: { requestId: id, decision: "APPROVED", comment: "同意" } });
  assert.equal(r.code, 0);
  assert.equal(r.data.status, "APPROVED");
  const updated = state.collections.leave_requests.find((l) => l._id === id);
  assert.equal(updated.status, "APPROVED");
  assert.equal(updated.approver, "审批人（ADMIN901）");
});

test("e2e/leave: approveLeaveRequest 覆盖今日 → 同步 staff.onLeave", async () => {
  global.resetMockState({ openid: "openid-admin-3" });
  seedStaff({ employeeNo: "ADMIN902", name: "审批人", isAdmin: true, openid: "openid-admin-3" });
  seedStaff({ employeeNo: "GH703", name: "请假员工", openid: "openid-staff-3", onLeave: false });
  const id = seedLeave({
    openid: "openid-staff-3", employeeNo: "GH703", name: "请假员工",
    type: "SICK", startDate: FUTURE_DATE(-1), endDate: FUTURE_DATE(2),
    totalDays: 4, reason: "x",
  });
  await leaveRouter.approveLeaveRequest({ data: { requestId: id, decision: "APPROVED" } });
  const staff = state.collections.staff.find((s) => s.employeeNo === "GH703");
  assert.equal(staff.onLeave, true, "覆盖今日的请假批准后, staff.onLeave 应为 true");
});

test("e2e/leave: 批准未来请假会标记已有排班并清理过期快照", async () => {
  global.resetMockState({ openid: "openid-admin-leave-impact" });
  seedStaff({
    employeeNo: "ADMIN904",
    name: "审批人",
    isAdmin: true,
    openid: "openid-admin-leave-impact",
  });
  const staffId = seedStaff({
    employeeNo: "GH704",
    name: "请假员工",
    openid: "openid-staff-leave-impact",
    onLeave: true,
  });
  const leaveDate = FUTURE_DATE(2);
  const scheduleId = seedSchedule({
    staffId,
    staffName: "请假员工",
    staffEmployeeNo: "GH704",
    scheduleDate: leaveDate,
    status: "ASSIGNED",
    recordStatus: "active",
  });
  const requestId = seedLeave({
    openid: "openid-staff-leave-impact",
    employeeNo: "GH704",
    name: "请假员工",
    type: "ANNUAL",
    startDate: leaveDate,
    endDate: leaveDate,
    totalDays: 1,
    reason: "休假",
  });

  const r = await leaveRouter.approveLeaveRequest({
    data: { requestId, decision: "APPROVED" },
  });
  assert.equal(r.code, 0);
  assert.equal(r.data.impactedScheduleCount, 1);
  const schedule = state.collections.schedules.find((item) => item._id === scheduleId);
  assert.equal(schedule.needsReassignment, true);
  assert.equal(schedule.leaveRequestId, requestId);
  assert.equal(schedule.reassignmentReason, "LEAVE_APPROVED");
  assert.equal(
    state.collections.staff.find((item) => item._id === staffId).onLeave,
    false,
    "未来请假不应让今天的 onLeave 快照保持为 true"
  );

  const table = await scheduleRouter.getStaffScheduleTable({
    data: { scheduleDate: leaveDate },
  });
  const row = table.data.rows.find((item) => item.employeeNo === "GH704");
  assert.equal(row.scheduleConflict, true);
  assert.equal(row.status, "LEAVE_CONFLICT");
  assert.equal(row.statusText, "休假冲突");
});

test("e2e/leave: approveLeaveRequest 重复审批 → 409", async () => {
  global.resetMockState({ openid: "openid-admin-4" });
  seedStaff({ employeeNo: "ADMIN903", name: "审批人", isAdmin: true, openid: "openid-admin-4" });
  const id = seedLeave({ openid: "openid-other", employeeNo: "GH701", name: "a", type: "SICK", startDate: FUTURE_DATE(1), endDate: FUTURE_DATE(2), totalDays: 2, reason: "x", status: "APPROVED" });
  const r = await leaveRouter.approveLeaveRequest({ data: { requestId: id, decision: "APPROVED" } });
  assert.equal(r.code, 409);
});

test("e2e/swap: withdrawSwapRequest 撤回自己 PENDING → 200", async () => {
  global.resetMockState({ openid: "openid-swap-1" });
  const id = seedSwap({ requesterOpenid: "openid-swap-1", status: "PENDING" });
  const r = await swapRouter.withdrawSwapRequest({ data: { requestId: id } });
  assert.equal(r.code, 0);
  assert.equal(r.data.status, "CANCELLED");
});

test("e2e/swap: withdrawSwapRequest 撤回别人的 → 403", async () => {
  global.resetMockState({ openid: "openid-swap-other" });
  const id = seedSwap({ requesterOpenid: "openid-swap-1", status: "PENDING" });
  const r = await swapRouter.withdrawSwapRequest({ data: { requestId: id } });
  assert.equal(r.code, 403);
});

test("e2e/swap: withdrawSwapRequest 撤回已 APPROVED → 409", async () => {
  global.resetMockState({ openid: "openid-swap-1" });
  const id = seedSwap({ requesterOpenid: "openid-swap-1", status: "APPROVED" });
  const r = await swapRouter.withdrawSwapRequest({ data: { requestId: id } });
  assert.equal(r.code, 409);
});

test("e2e/admin: getBootstrapStatus 任何登录员工可调", async () => {
  global.resetMockState({ openid: "openid-bs-1" });
  seedStaff({ employeeNo: "GH901", name: "任意员工", openid: "openid-bs-1" });
  const r = await adminRouter.getBootstrapStatus();
  assert.equal(r.code, 0);
  assert.equal(typeof r.data.enabled, "boolean");
  assert.equal(typeof r.data.tokenConfigured, "boolean");
  assert.equal(typeof r.data.adminCount, "number");
  assert.equal(r.data.currentUserBound, true);
  assert.equal(r.data.currentEmployeeNo, "GH901");
  assert.equal(r.data.usableAdminCount, 0);
  assert.equal(r.data.staleAdminCount, 0);
  assert.equal(r.data.consoleFunctionName, "bootstrapAdmin");
  assert.equal(r.data.consoleCall.employeeNo, "GH901");
  assert.equal(r.data.consoleCall.confirmText, "CREATE_FIRST_ADMIN");
  assert.ok(Array.isArray(r.data.steps));
});

test("e2e/source: 新页面工具路径与请假审批入口可用", () => {
  const leavePage = fs.readFileSync(path.join(__dirname, "../../..", "miniprogram/pages/leave/index.js"), "utf8");
  const bootstrapPage = fs.readFileSync(path.join(__dirname, "../../..", "miniprogram/pages/bootstrapAdmin/index.js"), "utf8");
  const swapPage = fs.readFileSync(path.join(__dirname, "../../..", "miniprogram/pages/swapRequest/index.js"), "utf8");
  const adminSchedulePage = fs.readFileSync(
    path.join(__dirname, "../../..", "miniprogram/pages/adminSchedule/index.js"),
    "utf8"
  );
  const scheduledSync = fs.readFileSync(
    path.join(__dirname, "../../..", "cloudfunctions/syncToHangyi/index.js"),
    "utf8"
  );
  const appConfig = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../../..", "miniprogram/app.json"), "utf8")
  );

  assert.ok(leavePage.includes('require("../../utils/api.js")'));
  assert.ok(bootstrapPage.includes('require("../../utils/api.js")'));
  assert.match(bootstrapPage, /callBackend\(\s*["']getMyProfile["']/);
  assert.ok(bootstrapPage.includes("forceRefresh: true"));
  assert.ok(bootstrapPage.includes("onCopyConsoleCall"));
  assert.ok(leavePage.includes('callBackend("listPendingLeaveRequests"'));
  assert.ok(leavePage.includes('callBackend("approveLeaveRequest"'));
  assert.ok(swapPage.includes('callBackend("listMySwapRequests"'));
  assert.ok(swapPage.includes('callBackend("withdrawSwapRequest"'));
  assert.ok(leavePage.includes('require("../../utils/media")'));
  assert.ok(swapPage.includes('require("../../utils/media")'));
  assert.ok(adminSchedulePage.includes('callBackend("updateFlightOperationalData"'));
  assert.ok(adminSchedulePage.includes('exportMode: "PRINT"'));
  assert.ok(adminSchedulePage.includes("engineModel"));
  assert.ok(adminSchedulePage.includes("estimatedArrivalTime"));
  assert.ok(scheduledSync.includes('operation_logs: "operation_logs"'));
  // leave_requests 暂时跳过: 服务器后端没有对应 /api/sync/leave-requests 端点。
  assert.ok(scheduledSync.includes("// leave_requests 暂时跳过"), "leave_requests 同步应被明确跳过");
  assert.equal(appConfig.pages.includes("pages/warningFlights/index"), false);
  assert.equal(
    fs.existsSync(path.join(__dirname, "../../..", "miniprogram/pages/warningFlights")),
    false
  );
  assert.equal(appConfig.pages.includes("pages/riskCenter/index"), false);
  assert.equal(
    fs.existsSync(path.join(__dirname, "../../..", "miniprogram/pages/riskCenter")),
    false
  );
});

// ══════════════════════════════════════════════════════════════
// 模块 13: assistant (4 端点)
// ══════════════════════════════════════════════════════════════

function seedAssistantConfig(enabled = true) {
  seedSetting("assistantApiUrl", "https://assistant.example.test");
  seedSetting("assistantApiKey", "test-assistant-key");
  seedSetting("assistantEnabled", enabled ? "true" : "false");
}

test("e2e/assistant: 未配置公网 RAG 时自动启用内置业务知识", async () => {
  global.resetMockState({ openid: "openid-assistant-disabled" });
  seedStaff({
    employeeNo: "GH980",
    name: "助手测试员工",
    openid: "openid-assistant-disabled",
  });
  let called = false;
  global.__HANGYI_ASSISTANT_HTTP_REQUEST__ = async () => {
    called = true;
    return { code: 200, data: {} };
  };
  const r = await assistantRouter.getAssistantStatus();
  delete global.__HANGYI_ASSISTANT_HTTP_REQUEST__;

  assert.equal(r.code, 0);
  assert.equal(r.data.enabled, true);
  assert.equal(r.data.ready, true);
  assert.equal(r.data.mode, "LOCAL_KNOWLEDGE");
  assert.equal(r.data.engineEnabled, true);
  assert.equal(called, false);
});

test("e2e/assistant: askAssistant 拒绝对象型问题参数", async () => {
  global.resetMockState({ openid: "openid-assistant-injection" });
  const r = await assistantRouter.askAssistant({
    data: { question: { $regex: ".*" }, mode: "KNOWLEDGE_ONLY" },
  });
  assert.equal(r.code, 400);
});

test("e2e/assistant: askAssistant 校验模式白名单", async () => {
  global.resetMockState({ openid: "openid-assistant-mode" });
  const r = await assistantRouter.askAssistant({
    data: { question: "如何调班", mode: { $ne: "KNOWLEDGE_ONLY" } },
  });
  assert.equal(r.code, 400);
});

test("e2e/assistant: askAssistant 拒绝非幂等请求标识", async () => {
  global.resetMockState({ openid: "openid-assistant-request-id" });
  const r = await assistantRouter.askAssistant({
    data: {
      question: "如何调班",
      mode: "KNOWLEDGE_ONLY",
      requestId: "bad id with spaces",
    },
  });
  assert.equal(r.code, 400);
});

test("e2e/assistant: askAssistant 仅允许已绑定员工", async () => {
  global.resetMockState({ openid: "openid-assistant-guest" });
  const r = await assistantRouter.askAssistant({
    data: { question: "如何调班", mode: "KNOWLEDGE_ONLY" },
  });
  assert.equal(r.code, 401);
});

test("e2e/assistant: 不安全的服务地址不会发起请求并降级到内置知识", async () => {
  global.resetMockState({ openid: "openid-assistant-private-url" });
  seedStaff({
    employeeNo: "GH985",
    name: "内网地址测试",
    openid: "openid-assistant-private-url",
  });
  seedSetting("assistantApiUrl", "https://127.0.0.1");
  seedSetting("assistantApiKey", "test-assistant-key");
  seedSetting("assistantEnabled", "true");
  const r = await assistantRouter.askAssistant({
    data: { question: "如何调班", mode: "KNOWLEDGE_ONLY" },
  });
  assert.equal(r.code, 0);
  assert.equal(r.data.localFallback, true);
  assert.match(r.data.answer, /调班申请/);
});

test("e2e/assistant: 内置知识回答业务问题并返回依据", async () => {
  global.resetMockState({ openid: "openid-assistant-local" });
  seedStaff({
    employeeNo: "GH986",
    name: "内置知识测试",
    openid: "openid-assistant-local",
  });
  const r = await assistantRouter.askAssistant({
    data: { question: "请假可以只上传图片吗？", mode: "KNOWLEDGE_ONLY" },
  });

  assert.equal(r.code, 0);
  assert.equal(r.data.localFallback, true);
  assert.match(r.data.answer, /图片凭证/);
  assert.equal(r.data.sources[0].id, "leave-evidence");
});

test("e2e/assistant: 公网 RAG 请求失败时自动降级", async () => {
  global.resetMockState({ openid: "openid-assistant-fallback" });
  seedStaff({
    employeeNo: "GH987",
    name: "降级测试",
    openid: "openid-assistant-fallback",
  });
  seedAssistantConfig(true);
  global.__HANGYI_ASSISTANT_HTTP_REQUEST__ = async () => {
    throw new Error("network unavailable");
  };
  const r = await assistantRouter.askAssistant({
    data: { question: "系统会校验哪些工时冲突？", mode: "KNOWLEDGE_ONLY" },
  });
  delete global.__HANGYI_ASSISTANT_HTTP_REQUEST__;

  assert.equal(r.code, 0);
  assert.equal(r.data.localFallback, true);
  assert.match(r.data.answer, /每日工时/);
});

test("e2e/assistant: askAssistant 透传服务契约但不泄露密钥", async () => {
  global.resetMockState({ openid: "openid-assistant-ok" });
  seedStaff({
    employeeNo: "GH981",
    name: "测试 人员",
    openid: "openid-assistant-ok",
  });
  seedAssistantConfig(true);
  const beforeRequest = Date.now();
  global.__HANGYI_ASSISTANT_HTTP_REQUEST__ = async (request) => {
    assert.equal(request.target, "https://assistant.example.test/api/assistant/internal/chat");
    assert.equal(request.method, "POST");
    assert.equal(request.headers["X-Internal-API-Key"], "test-assistant-key");
    assert.equal(request.headers["X-Wechat-Openid"], "openid-assistant-ok");
    assert.equal(request.headers["X-Wechat-Employee-No"], "GH981");
    assert.equal(request.headers["X-Wechat-Is-Admin"], "false");
    assert.equal(request.body.question, "连续值班后如何休息？");
    assert.equal(request.body.mode, "KNOWLEDGE_ONLY");
    assert.equal(request.body.sessionId, null);
    assert.equal(request.body.requestId, "wx-request-contract-001");
    assert.ok(request.body.deadlineAt >= beforeRequest + 16000);
    assert.ok(request.body.deadlineAt <= Date.now() + 18000);
    return {
      code: 200,
      data: {
        requestId: "req-1",
        messageId: "msg-1",
        sessionId: "session-1",
        answer: "测试答案",
        sources: [],
      },
    };
  };
  const r = await assistantRouter.askAssistant({
    data: {
      question: "连续值班后如何休息？",
      mode: "KNOWLEDGE_ONLY",
      requestId: "wx-request-contract-001",
    },
  });
  delete global.__HANGYI_ASSISTANT_HTTP_REQUEST__;

  assert.equal(r.code, 0);
  assert.equal(r.data.answer, "测试答案");
  assert.equal(JSON.stringify(r).includes("test-assistant-key"), false);
});

test("e2e/assistant: getAssistantStatus 返回基建状态", async () => {
  global.resetMockState({ openid: "openid-assistant-status" });
  seedStaff({
    employeeNo: "GH982",
    name: "状态测试",
    openid: "openid-assistant-status",
  });
  seedAssistantConfig(true);
  global.__HANGYI_ASSISTANT_HTTP_REQUEST__ = async () => ({
    code: 200,
    data: {
      phase: "FOUNDATION",
      engineEnabled: false,
      configured: false,
      ready: false,
      fallbackAvailable: true,
    },
  });
  const r = await assistantRouter.getAssistantStatus();
  delete global.__HANGYI_ASSISTANT_HTTP_REQUEST__;

  assert.equal(r.code, 0);
  assert.equal(r.data.reachable, true);
  assert.equal(r.data.phase, "FOUNDATION");
  assert.equal(r.data.engineEnabled, false);
  assert.equal(r.data.configured, true);
  assert.equal(r.data.ready, true);
  assert.equal(r.data.mode, "LOCAL_KNOWLEDGE");
  assert.equal(r.data.degraded, true);
});

test("e2e/assistant: 状态网络失败时标记不可达但保持内置问答可用", async () => {
  global.resetMockState({ openid: "openid-assistant-status-fallback" });
  seedStaff({
    employeeNo: "GH989",
    name: "状态降级测试",
    openid: "openid-assistant-status-fallback",
  });
  seedAssistantConfig(true);
  global.__HANGYI_ASSISTANT_HTTP_REQUEST__ = async () => {
    throw new Error("network unavailable");
  };
  try {
    const r = await assistantRouter.getAssistantStatus();
    assert.equal(r.code, 0);
    assert.equal(r.data.reachable, false);
    assert.equal(r.data.ready, true);
    assert.equal(r.data.mode, "LOCAL_KNOWLEDGE");
  } finally {
    delete global.__HANGYI_ASSISTANT_HTTP_REQUEST__;
  }
});

test("e2e/assistant: listAssistantHistory 校验条数并代理身份", async () => {
  global.resetMockState({ openid: "openid-assistant-history" });
  let r = await assistantRouter.listAssistantHistory({ data: { limit: "20" } });
  assert.equal(r.code, 400);

  seedStaff({
    employeeNo: "GH983",
    name: "历史测试",
    openid: "openid-assistant-history",
  });
  seedAssistantConfig(true);
  global.__HANGYI_ASSISTANT_HTTP_REQUEST__ = async (request) => {
    assert.equal(request.target, "https://assistant.example.test/api/assistant/internal/history?limit=10");
    assert.equal(request.headers["X-Wechat-Openid"], "openid-assistant-history");
    return { code: 200, data: [] };
  };
  r = await assistantRouter.listAssistantHistory({ data: { limit: 10 } });
  delete global.__HANGYI_ASSISTANT_HTTP_REQUEST__;
  assert.equal(r.code, 0);
  assert.deepEqual(r.data, []);
});

test("e2e/assistant: submitAssistantFeedback 校验并代理反馈", async () => {
  global.resetMockState({ openid: "openid-assistant-feedback" });
  seedStaff({
    employeeNo: "GH984",
    name: "反馈测试",
    openid: "openid-assistant-feedback",
  });
  seedAssistantConfig(true);

  let r = await assistantRouter.submitAssistantFeedback({
    data: { messageId: "msg-1", rating: { $ne: "UP" } },
  });
  assert.equal(r.code, 400);

  global.__HANGYI_ASSISTANT_HTTP_REQUEST__ = async (request) => {
    assert.deepEqual(request.body, {
      messageId: "msg-1",
      rating: "UP",
      comment: "有帮助",
    });
    return { code: 200, data: { accepted: true } };
  };
  r = await assistantRouter.submitAssistantFeedback({
    data: { messageId: "msg-1", rating: "up", comment: "有帮助" },
  });
  delete global.__HANGYI_ASSISTANT_HTTP_REQUEST__;
  assert.equal(r.code, 0);
  assert.equal(r.data.accepted, true);
});

test("e2e/assistant: 反馈上游失败必须返回失败", async () => {
  global.resetMockState({ openid: "openid-assistant-feedback-failed" });
  seedStaff({
    employeeNo: "GH990",
    name: "反馈失败测试",
    openid: "openid-assistant-feedback-failed",
  });
  seedAssistantConfig(true);
  global.__HANGYI_ASSISTANT_HTTP_REQUEST__ = async () => {
    throw new Error("feedback unavailable");
  };
  try {
    const r = await assistantRouter.submitAssistantFeedback({
      data: { messageId: "msg-feedback-failed", rating: "UP" },
    });
    assert.equal(r.code, 503);
    assert.match(r.message, /反馈提交失败/);
    assert.equal(r.data, null);
  } finally {
    delete global.__HANGYI_ASSISTANT_HTTP_REQUEST__;
  }
});

test("e2e/source: assistant 端点使用 HTTPS、内部密钥和服务端身份", () => {
  assert.ok(assistantSrc.includes('base.protocol !== "https:"'));
  assert.ok(assistantSrc.includes('"X-Internal-API-Key"'));
  assert.ok(assistantSrc.includes("requireActiveStaff"));
  assert.ok(!assistantSrc.includes("event.data.openid"));
});

test("e2e/source: 助手页面支持内置知识状态和快捷问题", () => {
  const miniRoot = path.resolve(__dirname, "../../../miniprogram");
  const assistantPage = fs.readFileSync(
    path.join(miniRoot, "pages/assistant/index.js"),
    "utf8"
  );
  const assistantView = fs.readFileSync(
    path.join(miniRoot, "pages/assistant/index.wxml"),
    "utf8"
  );
  assert.ok(assistantPage.includes('assistantMode === "LOCAL_KNOWLEDGE"'));
  assert.ok(assistantPage.includes("status.ready === true"));
  assert.ok(assistantPage.includes("slice().reverse().find"));
  assert.ok(assistantPage.includes("feedback: [\"UP\", \"DOWN\"]"));
  assert.ok(assistantPage.includes("requestId,"));
  assert.ok(assistantPage.includes("onSuggestionTap"));
  assert.ok(assistantView.includes("内置知识"));
  assert.ok(assistantView.includes("调班申请怎么提交"));
});

test("e2e/source: 高频页面采用手机优先的状态、筛选与审批交互", () => {
  const miniRoot = path.resolve(__dirname, "../../../miniprogram");
  const appStyle = fs.readFileSync(path.join(miniRoot, "app.wxss"), "utf8");
  const homeStyle = fs.readFileSync(
    path.join(miniRoot, "pages/index/index.wxss"),
    "utf8"
  );
  const homeView = fs.readFileSync(
    path.join(miniRoot, "pages/index/index.wxml"),
    "utf8"
  );
  const schedulePage = fs.readFileSync(
    path.join(miniRoot, "pages/staffSchedule/index.js"),
    "utf8"
  );
  const scheduleView = fs.readFileSync(
    path.join(miniRoot, "pages/staffSchedule/index.wxml"),
    "utf8"
  );
  const scheduleStyle = fs.readFileSync(
    path.join(miniRoot, "pages/staffSchedule/index.wxss"),
    "utf8"
  );
  const notificationPage = fs.readFileSync(
    path.join(miniRoot, "pages/notification/index.js"),
    "utf8"
  );
  const warningsPage = fs.readFileSync(
    path.join(miniRoot, "pages/warnings/index.js"),
    "utf8"
  );
  const warningsView = fs.readFileSync(
    path.join(miniRoot, "pages/warnings/index.wxml"),
    "utf8"
  );
  const mineView = fs.readFileSync(
    path.join(miniRoot, "pages/mine/index.wxml"),
    "utf8"
  );
  const mineStyle = fs.readFileSync(
    path.join(miniRoot, "pages/mine/index.wxss"),
    "utf8"
  );

  assert.ok(appStyle.includes("min-height: 64rpx"));
  assert.ok(appStyle.includes("--c-primary: #1178ee"));
  assert.ok(homeStyle.includes("flex: 1 1 280rpx"));
  assert.ok(homeStyle.includes("min-width: 240rpx"));
  assert.ok(homeStyle.includes("linear-gradient(135deg, #167df0"));
  assert.ok(!homeStyle.includes("width: calc(50% - 6rpx)"));
  assert.ok(homeView.includes("/images/menu/dashboard.svg"));
  assert.ok(!homeView.includes('<text class="quick-code'));
  assert.ok(schedulePage.includes("onInputQuery"));
  assert.ok(schedulePage.includes("onPickDate"));
  assert.ok(scheduleView.includes("schedule-overview"));
  assert.ok(scheduleView.includes("/images/menu/search.svg"));
  assert.ok(scheduleView.includes("/images/menu/chevron-down.svg"));
  assert.ok(scheduleView.includes("expandedStaffId === item.staffId"));
  assert.ok(!scheduleStyle.includes("min-width: 2500rpx"));
  assert.ok(notificationPage.includes('activeFilter: "ALL"'));
  assert.ok(notificationPage.includes("onToggleNotification"));
  assert.ok(warningsPage.includes("filteredCandidateList"));
  assert.ok(!warningsPage.includes(".slice(0, 6)"));
  assert.ok(!warningsPage.includes("getRiskCenterDashboard"));
  assert.ok(!warningsPage.includes("drawTrendChart"));
  assert.ok(!warningsView.includes("risk-command"));
  assert.ok(!warningsView.includes("维修流量趋势"));
  assert.ok(!warningsView.includes("flowTrendCanvas"));
  assert.ok(warningsView.includes("调班审批队列"));
  assert.ok(warningsView.includes("人员工作负荷"));
  assert.ok(!warningsView.includes('<text class="search-code'));
  assert.ok(warningsView.includes("选择替班人员"));
  assert.ok(mineView.includes("profile-hero"));
  assert.ok(mineView.includes("identity-strip"));
  assert.ok(mineView.includes("/images/menu/calendar.svg"));
  assert.ok(mineView.includes("/images/menu/qr-code.svg"));
  assert.ok(!mineView.includes('<text class="menu-icon'));
  assert.ok(mineStyle.includes(".menu-subtitle"));
  assert.ok(mineStyle.includes(".menu-icon-image"));
});

test("e2e/source: 管理员全功能有统一工作台、移动排班与参数入口", () => {
  const miniRoot = path.resolve(__dirname, "../../../miniprogram");
  const appConfig = JSON.parse(fs.readFileSync(path.join(miniRoot, "app.json"), "utf8"));
  const mineView = fs.readFileSync(path.join(miniRoot, "pages/mine/index.wxml"), "utf8");
  const adminCenterPage = fs.readFileSync(
    path.join(miniRoot, "pages/adminCenter/index.js"),
    "utf8"
  );
  const adminSchedulePage = fs.readFileSync(
    path.join(miniRoot, "pages/adminSchedule/index.js"),
    "utf8"
  );
  const adminScheduleView = fs.readFileSync(
    path.join(miniRoot, "pages/adminSchedule/index.wxml"),
    "utf8"
  );
  const adminScheduleStyle = fs.readFileSync(
    path.join(miniRoot, "pages/adminSchedule/index.wxss"),
    "utf8"
  );
  const servicePage = fs.readFileSync(
    path.join(miniRoot, "pages/serviceSchedule/index.js"),
    "utf8"
  );
  const managementPages = [
    "pages/adminCenter/index",
    "pages/staffManagement/index",
    "pages/adminSettings/index",
  ];
  managementPages.forEach((route) => assert.ok(appConfig.pages.includes(route)));
  assert.ok(mineView.includes("进入管理中心"));
  assert.equal((mineView.match(/onGoAdminCenter/g) || []).length, 1);
  assert.ok(!mineView.includes("onGoStaffManagement"));
  assert.ok(!mineView.includes("onGoAdminSettings"));
  assert.ok(!mineView.includes("onGoAuditLogs"));
  const adminCenterView = fs.readFileSync(
    path.join(miniRoot, "pages/adminCenter/index.wxml"),
    "utf8"
  );
  [
    "/pages/adminSchedule/index",
    "/pages/serviceSchedule/index",
    "/pages/warnings/index",
    "/pages/leave/index?mode=approval",
    "/pages/staffManagement/index",
    "/pages/qualificationWarnings/index",
    "/pages/completionStatus/index",
    "/pages/scheduleStats/index",
    "/pages/scheduleHistory/index",
    "/pages/auditLogs/index",
    "/pages/adminSettings/index",
  ].forEach((route) => assert.ok(adminCenterView.includes(route)));
  assert.ok(!adminCenterView.includes('<text class="module-code'));
  assert.ok(adminCenterPage.includes('callBackend("getAdminDashboard"'));
  assert.ok(adminSchedulePage.includes("dataset.staffid"));
  assert.ok(adminSchedulePage.includes("onBatchAssign"));
  assert.ok(adminScheduleView.includes("schedule-card"));
  assert.ok(!adminScheduleStyle.includes("min-width: 2500rpx"));
  assert.ok(servicePage.includes("decorateTasks"));
  assert.ok(servicePage.includes("unfilledTaskCount"));
});

test("e2e/source: 管理端 WXML 不在模板中调用 JavaScript 方法", () => {
  const miniRoot = path.resolve(__dirname, "../../../miniprogram");
  const pages = [
    "adminCenter", "staffManagement", "adminSettings", "adminSchedule",
    "serviceSchedule", "auditLogs", "scheduleHistory", "completionStatus",
    "scheduleStats", "leave", "warnings", "qualificationWarnings",
  ];
  const methodCallPattern = /\{\{[^}]*[A-Za-z_$][A-Za-z0-9_$]*\s*\(/;
  pages.forEach((pageName) => {
    const source = fs.readFileSync(
      path.join(miniRoot, `pages/${pageName}/index.wxml`),
      "utf8"
    );
    assert.equal(
      methodCallPattern.test(source),
      false,
      `${pageName} WXML 不应直接调用方法`
    );
  });
});

test("e2e/source: 退出登录清理账号缓存并跳转登录页", () => {
  const miniRoot = path.resolve(__dirname, "../../../miniprogram");
  const settingsPage = fs.readFileSync(
    path.join(miniRoot, "pages/settings/index.js"),
    "utf8"
  );
  const settingsView = fs.readFileSync(
    path.join(miniRoot, "pages/settings/index.wxml"),
    "utf8"
  );
  const cacheUtil = fs.readFileSync(
    path.join(miniRoot, "utils/cache.js"),
    "utf8"
  );

  assert.ok(settingsPage.includes('callBackend("logoutStaff", {}, { silent: true })'));
  assert.ok(settingsPage.includes("clearAllCache()"));
  assert.ok(settingsPage.includes('url: "/pages/quickLogin/index"'));
  assert.ok(settingsView.includes('bindtap="onLogout"'));
  assert.ok(settingsView.includes('disabled="{{loggingOut}}"'));
  assert.ok(cacheUtil.includes("startsWith(STORAGE_PREFIX)"));
});

test("e2e/source: 登录成功清理账号缓存并直接切换到我的页", () => {
  const miniRoot = path.resolve(__dirname, "../../../miniprogram");
  const authPage = fs.readFileSync(
    path.join(miniRoot, "pages/auth/index.js"),
    "utf8"
  );
  const quickLoginPage = fs.readFileSync(
    path.join(miniRoot, "pages/quickLogin/index.js"),
    "utf8"
  );
  const uiUtil = fs.readFileSync(
    path.join(miniRoot, "utils/ui.js"),
    "utf8"
  );
  const minePage = fs.readFileSync(
    path.join(miniRoot, "pages/mine/index.js"),
    "utf8"
  );
  const overviewPage = fs.readFileSync(
    path.join(miniRoot, "pages/index/index.js"),
    "utf8"
  );

  [authPage, quickLoginPage].forEach((source) => {
    assert.ok(source.includes("clearAllCache()"));
    assert.ok(source.includes('wx.switchTab({ url: "/pages/mine/index" })'));
    assert.ok(!source.includes("wx.navigateBack"));
  });
  assert.ok(uiUtil.includes("forceRefresh: forceRefresh === true"));
  assert.ok(minePage.includes('callBackend("getMyProfile", { forceRefresh: true })'));
  // 首页不再每次强制刷新个人资料 (避免绕过 30 秒缓存), 手动刷新才实时复核管理员身份。
  assert.ok(overviewPage.includes("loadIsAdmin(forceRefresh)"));
  assert.equal(overviewPage.includes('callBackend("getMyProfile", { forceRefresh: true })'), false);
});

test("e2e/source: 快速登录正确识别开发者工具且没有固定手机号旁路", () => {
  const quickLoginPage = fs.readFileSync(
    path.resolve(__dirname, "../../../miniprogram/pages/quickLogin/index.js"),
    "utf8"
  );
  assert.ok(quickLoginPage.includes('platform === "devtools"'));
  assert.equal(quickLoginPage.includes("miniprogramEnvVersion === \"develop\""), false);
  assert.equal(quickLoginPage.includes("DEV_TEST_PHONE"), false);
  assert.equal(quickLoginPage.includes("13800138000"), false);
});
