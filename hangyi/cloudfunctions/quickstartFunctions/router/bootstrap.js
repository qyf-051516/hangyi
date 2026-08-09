/**
 * bootstrap.js - 初始化、重置演示数据、获取 openid
 * 涵盖：bootstrapData、resetDemoData、seedStaffIfNeeded、seedSettingsIfNeeded、getOpenId
 */
const {
  db, COLLECTIONS, SETTINGS_KEYS,
  ok, fail, logOperation,
  getOpenContext, getSettingValue, requireAdmin,
  ensureCollection, purgeCollection,
} = require("../utils");

const BOOTSTRAP_CONFIRM_TEXT = "INITIALIZE_DEMO_DATA";
const NON_CONSOLE_SOURCES = new Set([
  "wx_client", "wx_devtools", "wx_localdebug", "wx_http", "wx_unknown",
  "wx_trigger", "wx_paycallback", "wx_crawler", "web_client", "scf",
]);

// ──────────────────────────────────────────────
// 首次初始化：60 名员工（GH001-GH060）+ 17 个默认配置
// ──────────────────────────────────────────────
const seedStaffIfNeeded = async () => {
  const names = [
    "张伟","李强","王磊","赵敏","陈涛","刘洋","周凯","吴鹏","郑超","黄亮",
    "朱峰","胡斌","郭亮","何俊","高翔","林浩","罗勇","宋博","谢宁","彭涛",
    "许航","韩松","冯旭","邓凯","曹阳","潘磊","丁宇","沈晨","孙伟","杨帆",
    "吕鹏","魏杰","苏磊","蒋超","蔡明","贾勇","叶峰","阎涛","余斌","戴军",
    "田宇","董强","袁凯","柳林","鲍旭","顾飞","侯航","邵松","孟旭","段凯",
    "汤阳","尹涛","易磊","常宇","乔鹏","赖涛","龚斌","文杰","康勇","毛刚",
  ];

  // P2 修复: README/登录页都列了 8 个分组(A-H), 旧 seed 只填了 6 个, G/H 组员工会被分配到默认组。
  const groups = ["A组", "B组", "C组", "D组", "E组", "F组", "G组", "H组"];

  // 20 种航司资质组合--覆盖 TSV 中全部 12 家航司（每组合 3 家）
  // CA BK MF FM MU HO 9C FU QW SC NX HU
  const airlineCombos = [
    ["中国南方航空", "中国国际航空", "奥凯航空"],          // CZ CA BK
    ["中国东方航空", "厦门航空", "上海航空"],               // MU MF FM
    ["海南航空", "吉祥航空", "春秋航空"],                   // HU HO 9C
    ["中国国际航空", "福州航空", "青岛航空"],               // CA FU QW
    ["中国南方航空", "山东航空", "澳门航空"],               // CZ SC NX
    ["中国东方航空", "中国国际航空", "海南航空"],           // MU CA HU
    ["奥凯航空", "厦门航空", "深圳航空"],                   // BK MF ZH
    ["上海航空", "吉祥航空", "中国南方航空"],               // FM HO CZ
    ["春秋航空", "福州航空", "四川航空"],                   // 9C FU 3U
    ["青岛航空", "山东航空", "中国东方航空"],               // QW SC MU
    ["澳门航空", "中国国际航空", "天津航空"],               // NX CA GS
    ["海南航空", "奥凯航空", "厦门航空"],                   // HU BK MF
    ["中国南方航空", "上海航空", "春秋航空"],               // CZ FM 9C
    ["中国东方航空", "吉祥航空", "青岛航空"],               // MU HO QW
    ["中国国际航空", "山东航空", "福州航空"],               // CA SC FU
    ["深圳航空", "澳门航空", "海南航空"],                   // ZH NX HU
    ["厦门航空", "春秋航空", "中国南方航空"],               // MF 9C CZ
    ["奥凯航空", "上海航空", "吉祥航空"],                   // BK FM HO
    ["中国东方航空", "中国国际航空", "四川航空"],           // MU CA 3U
    ["青岛航空", "山东航空", "天津航空"],                   // QW SC GS
  ];

  // 15 种机型资质组合--覆盖 TSV 中全部 5 种机型（A320 A321 B737 B738 B38M）
  const aircraftCombos = [
    ["A320", "B737", "B738"],
    ["A320", "A321", "B738"],
    ["B738", "B38M", "A320"],
    ["A320", "B737", "B38M"],
    ["A321", "B738", "A320"],
    ["B737", "B738", "B38M"],
    ["A320", "A321", "B38M"],
    ["B738", "A320", "B737"],
    ["A321", "B38M", "A320"],
    ["B737", "A320", "B738"],
    ["A320", "B38M", "B738"],
    ["A321", "A320", "B737"],
    ["B738", "B38M", "B737"],
    ["A320", "A321", "B738", "B737"],
    ["B737", "B738", "A320", "B38M"],
  ];

  const tagCombos = [
    ["机务放行", "结构检查"],
    ["航线维修"],
    ["发动机检查"],
    ["航材保障"],
    ["排故专家"],
    ["电气检查"],
    ["机务放行", "发动机检查"],
    ["航线维修", "结构检查"],
    ["航材保障", "排故专家"],
    ["电气检查", "航线维修"],
  ];

  const seeds = names.map((name, index) => {
    const aircraftTypes = aircraftCombos[index % aircraftCombos.length];
    return {
    employeeNo: `GH${String(index + 1).padStart(3, "0")}`,
    name,
    phone: `1380000${String(index + 1).padStart(4, "0")}`,
    groupId: groups[index % groups.length],
    active: true,
    onLeave: false,
    authorizedAirlines: airlineCombos[index % airlineCombos.length],
    authorizedAircraftTypes: aircraftTypes,
    tags: tagCombos[index % tagCombos.length],
    roleType: index < 36 ? "SERVICE" : index < 50 ? "RELEASE" : "BOTH",
    qualifications: aircraftTypes.map((type, i) => {
      const daysOffset = ((index * 53 + i * 97) % 365) - 120;
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + daysOffset);
      const issueDate = new Date(validUntil);
      issueDate.setFullYear(issueDate.getFullYear() - 1);
      return {
        aircraftType: type,
        certNo: `JX-${String(index + 1).padStart(3, "0")}-${String.fromCharCode(65 + i)}`,
        issueDate: issueDate.toISOString().slice(0, 10),
        validUntil: validUntil.toISOString().slice(0, 10),
        status: daysOffset < 0 ? "EXPIRED" : daysOffset < 30 ? "EXPIRING" : "VALID"
      };
    }),
  };});

  // 批量查重：一次查询所有已存在的员工
  const existingByNo = new Map();
  const existingRes = await db.collection(COLLECTIONS.STAFF)
    .limit(200)
    .get();
  (existingRes.data || []).forEach((staff) => existingByNo.set(staff.employeeNo, staff));

  // 只添加不存在的员工，并行写入
  const newStaff = seeds.filter((staff) => !existingByNo.has(staff.employeeNo));
  if (newStaff.length) {
    await Promise.all(newStaff.map(item =>
      db.collection(COLLECTIONS.STAFF).add({
        data: {
          ...item,
          openid: "",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      })
    ));
  }

  // 早期演示数据没有手机号。只为仍为空的 GH001-GH060 补齐固定演示号，不覆盖真实号码。
  const missingPhoneRows = seeds.filter((seed) => {
    const existing = existingByNo.get(seed.employeeNo);
    return existing && !String(existing.phone || "").trim();
  });
  if (missingPhoneRows.length) {
    await Promise.all(missingPhoneRows.map((seed) => {
      const existing = existingByNo.get(seed.employeeNo);
      return db.collection(COLLECTIONS.STAFF).doc(existing._id).update({
        data: { phone: seed.phone, updatedAt: new Date() },
      });
    }));
  }

};

// ──────────────────────────────────────────────
// 首次初始化：17 个默认配置项
// ──────────────────────────────────────────────
const seedSettingsIfNeeded = async () => {
  const defaults = [
    { key: SETTINGS_KEYS.FATIGUE_MAX_CONTINUOUS_DAYS, value: 3, remark: "连续工作天数阈值" },
    { key: SETTINGS_KEYS.SERVICE_PREP_TIME_MINUTES, value: 30, remark: "勤务提前到位时间（分钟）" },
    { key: SETTINGS_KEYS.SERVICE_WRAP_TIME_MINUTES, value: 15, remark: "勤务收尾返回时间（分钟）" },
    { key: SETTINGS_KEYS.RELEASE_PREP_TIME_MINUTES, value: 20, remark: "放行提前到位时间（分钟）" },
    { key: SETTINGS_KEYS.RELEASE_WRAP_TIME_MINUTES, value: 10, remark: "放行收尾返回时间（分钟）" },
    { key: SETTINGS_KEYS.SERVICE_REQUIRED_COUNT, value: 2, remark: "每航班勤务人数（双人制）" },
    { key: SETTINGS_KEYS.RELEASE_REQUIRED_COUNT, value: 1, remark: "每航班放行人数" },
    { key: SETTINGS_KEYS.MIN_REST_INTERVAL_MINUTES, value: 30, remark: "最小休息间隔（分钟）" },
    { key: SETTINGS_KEYS.MAX_CONSECUTIVE_NIGHT_SHIFTS, value: 2, remark: "连续夜班上限" },
    { key: SETTINGS_KEYS.MAX_DAILY_WORK_HOURS, value: 12, remark: "单人日工时上限" },
    { key: SETTINGS_KEYS.HANGYI_API_URL, value: "", remark: "Hangyi统一认证服务地址（部署后配置）" },
    { key: SETTINGS_KEYS.HANGYI_API_KEY, value: "", remark: "Hangyi内部API密钥（部署后配置）" },
    { key: SETTINGS_KEYS.HANGYI_SYNC_ENABLED, value: "false", remark: "是否启用Hangyi数据同步" },
    { key: SETTINGS_KEYS.ASSISTANT_API_URL, value: "", remark: "智能助手公网HTTPS服务地址" },
    { key: SETTINGS_KEYS.ASSISTANT_API_KEY, value: "", remark: "智能助手内部API密钥" },
    { key: SETTINGS_KEYS.ASSISTANT_ENABLED, value: "false", remark: "是否启用智能助手" },
    { key: SETTINGS_KEYS.DEMO_TOOLS_ENABLED, value: "false", remark: "是否允许管理员使用演示数据工具" },
  ];

  // 批量查重：一次查询所有已存在的配置
  const existingKeys = new Set();
  const existingRes = await db.collection(COLLECTIONS.SETTINGS)
    .limit(200)
    .get();
  (existingRes.data || []).forEach(s => existingKeys.add(s.key));

  // 只添加不存在的配置，并行写入
  const newItems = defaults.filter(d => !existingKeys.has(d.key));
  if (newItems.length) {
    await Promise.all(newItems.map(item =>
      db.collection(COLLECTIONS.SETTINGS).add({
        data: {
          ...item,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      })
    ));
  }

};

// ──────────────────────────────────────────────
// 首次进入：创建集合 + 种子数据
// ──────────────────────────────────────────────
const bootstrapData = async (event) => {
  const invocation = getOpenContext();
  const sourceChain = String(invocation.source || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (invocation.openid || sourceChain.some((item) => NON_CONSOLE_SOURCES.has(item))) {
    return fail("初始化只能在云开发控制台执行", 403);
  }
  const confirmText = typeof (event && event.data || {}).confirmText === "string"
    ? event.data.confirmText.trim()
    : "";
  if (confirmText !== BOOTSTRAP_CONFIRM_TEXT) {
    return fail(`confirmText 必须为 ${BOOTSTRAP_CONFIRM_TEXT}`, 400);
  }

  await ensureCollection(COLLECTIONS.STAFF);
  await ensureCollection(COLLECTIONS.FLIGHTS);
  await ensureCollection(COLLECTIONS.SCHEDULES);
  await ensureCollection(COLLECTIONS.SWAP_REQUESTS);
  await ensureCollection(COLLECTIONS.LEAVE_REQUESTS);
  await ensureCollection(COLLECTIONS.SETTINGS);
  await ensureCollection(COLLECTIONS.OPERATION_LOGS);
  await ensureCollection(COLLECTIONS.SCHEDULE_VERSIONS);
  await seedStaffIfNeeded();
  await seedSettingsIfNeeded();

  const staffCount = await db.collection(COLLECTIONS.STAFF).count();
  await logOperation("BOOTSTRAP_DATA", `初始化数据：${staffCount.total} 名员工`, { type: "bootstrap", staffTotal: staffCount.total });
  return ok({
    initialized: true,
    staffTotal: staffCount.total,
    demoEmployeeNoRange: ["GH001", "GH060"],
  });
};

const RESET_DEMO_CONFIRM_TEXT = "RESET_DEMO_DATA";

// ──────────────────────────────────────────────
// 重置演示数据（清空 + 重建）
// ──────────────────────────────────────────────
const resetDemoData = async (event) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const demoToolsEnabled = String(
    await getSettingValue(SETTINGS_KEYS.DEMO_TOOLS_ENABLED, "false")
  ) === "true";
  if (!demoToolsEnabled) {
    return fail("演示数据工具未启用", 403);
  }
  // P1 修复: 破坏性操作需要显式二次确认，防止误触或脚本误触发清空重建。
  const confirmText = String((event && event.data && event.data.confirmText) || "").trim();
  if (confirmText.trim() !== RESET_DEMO_CONFIRM_TEXT) {
    return fail(`重置演示数据需传 confirmText="${RESET_DEMO_CONFIRM_TEXT}" 二次确认`, 400);
  }

  // 重建人员时保留当前管理员，避免重置后系统失去唯一管理员。
  const adminSnapshot = {
    employeeNo: guard.staff.employeeNo,
    name: guard.staff.name || guard.staff.realName || "管理员",
    realName: guard.staff.realName || guard.staff.name || "管理员",
    phone: guard.staff.phone || "",
    groupId: guard.staff.groupId || "A组",
    roleType: guard.staff.roleType || "ADMIN",
    openid: guard.staff.openid,
    isAdmin: true,
    isTestAdmin: guard.staff.isTestAdmin === true,
    active: true,
    onLeave: false,
  };

  await ensureCollection(COLLECTIONS.STAFF);
  await ensureCollection(COLLECTIONS.FLIGHTS);
  await ensureCollection(COLLECTIONS.SCHEDULES);
  await ensureCollection(COLLECTIONS.SWAP_REQUESTS);
  await ensureCollection(COLLECTIONS.LEAVE_REQUESTS);
  await ensureCollection(COLLECTIONS.SETTINGS);
  await ensureCollection(COLLECTIONS.OPERATION_LOGS);
  await ensureCollection(COLLECTIONS.SCHEDULE_VERSIONS);

  await purgeCollection(COLLECTIONS.SWAP_REQUESTS);
  await purgeCollection(COLLECTIONS.LEAVE_REQUESTS);
  await purgeCollection(COLLECTIONS.SCHEDULES);
  await purgeCollection(COLLECTIONS.FLIGHTS);
  await purgeCollection(COLLECTIONS.STAFF);
  // 版本元数据一并清空,避免重建后展示与旧发布版本矛盾的排班历史(审查发现)
  await purgeCollection(COLLECTIONS.SCHEDULE_VERSIONS);
  // 审计日志保留(重置动作本身已写入审计),设置由 seedSettingsIfNeeded 合并重建

  await seedStaffIfNeeded();
  await seedSettingsIfNeeded();

  const existingAdmin = await db.collection(COLLECTIONS.STAFF)
    .where({ employeeNo: adminSnapshot.employeeNo })
    .limit(1)
    .get();
  if (existingAdmin.data && existingAdmin.data[0]) {
    await db.collection(COLLECTIONS.STAFF).doc(existingAdmin.data[0]._id).update({
      data: { ...adminSnapshot, updatedAt: new Date() },
    });
  } else {
    await db.collection(COLLECTIONS.STAFF).add({
      data: {
        ...adminSnapshot,
        authorizedAirlines: guard.staff.authorizedAirlines || [],
        authorizedAircraftTypes: guard.staff.authorizedAircraftTypes || [],
        qualifications: guard.staff.qualifications || [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  const staffCount = await db.collection(COLLECTIONS.STAFF).count();
  await logOperation("RESET_DEMO_DATA", `${adminSnapshot.name} 重建演示数据`, {
    type: "bootstrap",
    staffTotal: staffCount.total,
  });
  return ok(
    {
      reset: true,
      staffTotal: staffCount.total,
      adminPreserved: adminSnapshot.employeeNo,
      demoEmployeeNoRange: ["GH001", "GH060"],
    },
    "演示人员与业务申请数据已重建"
  );
};

// ──────────────────────────────────────────────
// 获取当前 openid
// ──────────────────────────────────────────────
const getOpenId = async () => ok(getOpenContext());

// ──────────────────────────────────────────────
// 路由表
// ──────────────────────────────────────────────
module.exports = {
  bootstrapData,
  resetDemoData,
  getOpenId,
};
