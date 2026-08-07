/**
 * test-quicklogin.test.js - 一键登录 2 个新 action 的单测
 *
 * 覆盖:
 *   loginByPhone:
 *     1. 拒绝客户端明文手机号
 *     2. 校验微信动态 code
 *     3. code 换取手机号后按 staff 绑定
 *     4. 未登记手机号返回 NOT_REGISTERED
 *     5. 停用账号不可登录
 *   loginByWechatProfile:
 *     1. openid 没绑过任何员工 → 404 NOT_REGISTERED
 *     2. 绑过, 找到 staff, 刷新 nickName/avatar → 200
 *     3. 绑过, 但 active=false → 403
 */
const test = require("node:test");
const assert = require("node:assert/strict");

// 必须在 require router 之前先设置 mock 状态
global.resetMockState({ openid: "test-openid-001" });

const authRouter = require("../router/auth");
const state = global.__HANGYI_MOCK_STATE__;

function seedStaff(doc) {
  const arr = (state.collections.staff = state.collections.staff || []);
  const id = `staff-${doc.employeeNo || Date.now()}`;
  arr.push({ _id: id, active: true, ...doc });
  return id;
}

function seedSetting(key, value) {
  const arr = (state.collections.settings = state.collections.settings || []);
  arr.push({ _id: `set-${key}`, key, value });
}

// ──────────────────────────────────────────────
// loginByPhone
// ──────────────────────────────────────────────
test("loginByPhone: 缺少动态 code → 400", async () => {
  const res = await authRouter.loginByPhone({ data: {} });
  assert.equal(res.code, 400);
});

test("loginByPhone: 明文 phoneNumber 始终拒绝", async () => {
  const res = await authRouter.loginByPhone({ data: { phoneNumber: "13800138000" } });
  assert.equal(res.code, 400);
  assert.match(res.message, /不支持客户端明文手机号/);
});

test("loginByPhone: 动态 code 找不到登记员工 → 404 NOT_REGISTERED", async () => {
  global.resetMockState({ openid: "openid-new" });
  state.phoneByCode["code-new"] = { purePhoneNumber: "13900000000" };
  const res = await authRouter.loginByPhone({ data: { phoneCode: "code-new" } });
  assert.equal(res.code, 404);
  assert.equal(res.data && res.data.code, "NOT_REGISTERED");
});

test("loginByPhone: 动态 code 找到员工 → 200, 绑定 openid", async () => {
  global.resetMockState({ openid: "openid-staff-a" });
  state.phoneByCode["code-staff-a"] = { purePhoneNumber: "13800138000" };
  const id = seedStaff({
    employeeNo: "TEST001",
    name: "张三",
    phone: "13800138000",
    groupId: "A组",
    authorizedAircraftTypes: ["A320"],
    roleType: "SERVICE",
    isAdmin: false,
  });

  const res = await authRouter.loginByPhone({ data: { phoneCode: "code-staff-a" } });
  assert.equal(res.code, 0, `expected 0, got ${res.code}: ${res.message}`);
  assert.equal(res.data.employeeNo, "TEST001");
  assert.equal(res.data.name, "张三");
  assert.equal(res.data.isAdmin, false);
  assert.equal(res.data.isTestAdmin, false);

  // 验证 openid 已被绑定到该 staff
  const updated = state.collections.staff.find((s) => s._id === id);
  assert.equal(updated.openid, "openid-staff-a");
});

test("loginByPhone: 找到员工但 active=false → 403", async () => {
  global.resetMockState({ openid: "openid-disabled" });
  state.phoneByCode["code-disabled"] = { purePhoneNumber: "13700137000" };
  seedStaff({ employeeNo: "TEST002", name: "李四", phone: "13700137000", active: false });
  const res = await authRouter.loginByPhone({ data: { phoneCode: "code-disabled" } });
  assert.equal(res.code, 403);
});

test("loginByPhone: code 换取手机号找到管理员 → 200", async () => {
  global.resetMockState({ openid: "openid-cloud" });
  state.phoneByCode["code-admin"] = { phoneNumber: "13888888888", purePhoneNumber: "13888888888" };
  seedStaff({ employeeNo: "TEST003", name: "王五", phone: "13888888888", groupId: "B组", isAdmin: true });

  const res = await authRouter.loginByPhone({ data: { phoneCode: "code-admin" } });
  assert.equal(res.code, 0, `expected 0, got ${res.code}: ${res.message}`);
  assert.equal(res.data.employeeNo, "TEST003");
  assert.equal(res.data.isAdmin, true);
});

test("loginByPhone: 动态 code 失效 → 401", async () => {
  global.resetMockState({ openid: "openid-fail" });
  const res = await authRouter.loginByPhone({ data: { phoneCode: "code-expired" } });
  assert.equal(res.code, 401);
  assert.match(res.message, /授权已失效/);
});

test("loginByPhone: 微信返回的手机号格式异常 → 400", async () => {
  global.resetMockState({ openid: "openid-bad" });
  state.phoneByCode["code-bad"] = { phoneNumber: "123" };
  const res = await authRouter.loginByPhone({ data: { phoneCode: "code-bad" } });
  assert.equal(res.code, 400);
  assert.match(res.message, /手机号格式不正确/);
});

// ──────────────────────────────────────────────
// loginByWechatProfile
// ──────────────────────────────────────────────
test("loginByWechatProfile: openid 没绑员工 → 404 NOT_REGISTERED", async () => {
  global.resetMockState({ openid: "openid-unbound" });
  const res = await authRouter.loginByWechatProfile({ data: {} });
  assert.equal(res.code, 404);
  assert.equal(res.data && res.data.code, "NOT_REGISTERED");
});

test("loginByWechatProfile: openid 绑过员工, 刷新 nickName/avatar → 200", async () => {
  global.resetMockState({ openid: "openid-bound" });
  const id = seedStaff({
    employeeNo: "TEST004",
    name: "赵六",
    openid: "openid-bound",
    groupId: "C组",
    authorizedAircraftTypes: ["B737"],
    isAdmin: false,
  });

  const res = await authRouter.loginByWechatProfile({
    data: { nickName: "六六六", avatarUrl: "cloud://mock/avatars/TEST004_avatar.png" },
  });
  assert.equal(res.code, 0, `expected 0, got ${res.code}: ${res.message}`);
  assert.equal(res.data.employeeNo, "TEST004");
  assert.equal(res.data.wechatNickName, "六六六");

  const updated = state.collections.staff.find((s) => s._id === id);
  assert.equal(updated.wechatNickName, "六六六");
  assert.equal(updated.wechatAvatarUrl, "cloud://mock/avatars/TEST004_avatar.png");
});

test("loginByWechatProfile: 非白名单协议 avatarUrl 被忽略 (C5)", async () => {
  global.resetMockState({ openid: "openid-avatar-scan" });
  const id = seedStaff({ employeeNo: "TEST007", name: "头像员工", openid: "openid-avatar-scan" });
  const res = await authRouter.loginByWechatProfile({
    data: { nickName: "新昵称", avatarUrl: "https://evil.example.com/avatar.png" },
  });
  assert.equal(res.code, 0);
  const updated = state.collections.staff.find((s) => s._id === id);
  assert.equal(updated.wechatNickName, "新昵称");
  assert.equal(updated.wechatAvatarUrl, undefined, "非白名单协议的 avatarUrl 不应写入档案");
});

test("loginByWechatProfile: 绑过, 但 active=false → 403", async () => {
  global.resetMockState({ openid: "openid-disabled-2" });
  seedStaff({ employeeNo: "TEST005", name: "停用员工", openid: "openid-disabled-2", active: false });
  const res = await authRouter.loginByWechatProfile({ data: {} });
  assert.equal(res.code, 403);
});

test("loginByWechatProfile: 不传 nickName/avatarUrl 也能登录, 但不更新字段", async () => {
  global.resetMockState({ openid: "openid-no-profile" });
  const id = seedStaff({ employeeNo: "TEST006", name: "钱七", openid: "openid-no-profile" });
  const res = await authRouter.loginByWechatProfile({ data: {} });
  assert.equal(res.code, 0);
  const updated = state.collections.staff.find((s) => s._id === id);
  assert.equal(updated.wechatNickName, undefined);
  assert.equal(updated.wechatAvatarUrl, undefined);
});
