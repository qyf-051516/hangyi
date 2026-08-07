/**
 * log.js - 操作日志查询 / 导出
 * 涵盖：queryOperationLogs、exportOperationLogs
 */
const cloud = require("wx-server-sdk");
const {
  db, _, COLLECTIONS,
  ok, fail, requireAdmin,
  formatDate,
  ensureCollection,
} = require("../utils");

// ──────────────────────────────────────────────
// 分页查询操作日志
// ──────────────────────────────────────────────
const queryOperationLogs = async (event) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const payload = event.data || {};
  const page = Number(payload.page || 1);
  const pageSize = Number(payload.pageSize || 50);
  const { action, startDate, endDate } = payload;
  if (!Number.isInteger(page) || page < 1) return fail("页码格式错误", 400);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    return fail("每页条数需在 1 到 100 之间", 400);
  }
  const condition = {};
  if (action) {
    if (typeof action !== "string" || !/^[A-Z0-9_]{1,60}$/.test(action)) {
      return fail("操作类型参数格式错误", 400);
    }
    condition.action = action;
  }
  if (startDate || endDate) {
    if (startDate && (typeof startDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(startDate))) {
      return fail("开始日期格式错误", 400);
    }
    if (endDate && (typeof endDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(endDate))) {
      return fail("结束日期格式错误", 400);
    }
    if (startDate && endDate && startDate > endDate) return fail("开始日期不能晚于结束日期", 400);
    const start = startDate ? new Date(startDate) : new Date("2020-01-01");
    const end = endDate ? new Date(endDate + "T23:59:59") : new Date();
    condition.createdAt = _.gte(start).and(_.lte(end));
  }
  const totalRes = await db.collection(COLLECTIONS.OPERATION_LOGS).where(condition).count();
  const total = totalRes.total || 0;
  const res = await db.collection(COLLECTIONS.OPERATION_LOGS)
    .where(condition)
    .orderBy("createdAt", "desc")
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get();
  return ok({
    total,
    page,
    pageSize,
    logs: res.data || [],
  });
};

// ──────────────────────────────────────────────
// 导出操作日志为 CSV 上传至云存储
// ──────────────────────────────────────────────
const exportOperationLogs = async (event) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const payload = event.data || {};
  const { action, startDate, endDate } = payload;
  const page = Number(payload.page || 1);
  const pageSize = Number(payload.pageSize || 500);
  if (!Number.isInteger(page) || page < 1) return fail("页码格式错误", 400);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) {
    return fail("导出条数需在 1 到 500 之间", 400);
  }

  const condition = {};
  if (action) {
    if (typeof action !== "string" || !/^[A-Z0-9_]{1,60}$/.test(action)) {
      return fail("操作类型参数格式错误", 400);
    }
    condition.action = action;
  }
  if (startDate || endDate) {
    if (startDate && (typeof startDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(startDate))) {
      return fail("开始日期格式错误", 400);
    }
    if (endDate && (typeof endDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(endDate))) {
      return fail("结束日期格式错误", 400);
    }
    if (startDate && endDate && startDate > endDate) return fail("开始日期不能晚于结束日期", 400);
    const start = startDate ? new Date(startDate) : new Date("2020-01-01");
    const end = endDate ? new Date(endDate + "T23:59:59") : new Date();
    condition.createdAt = _.gte(start).and(_.lte(end));
  }

  // 确保集合存在（可能未初始化）
  await ensureCollection(COLLECTIONS.OPERATION_LOGS);

  let total = 0;
  let logs = [];
  try {
    const totalRes = await db.collection(COLLECTIONS.OPERATION_LOGS).where(condition).count();
    total = totalRes.total || 0;

    if (total > 0) {
      const res = await db.collection(COLLECTIONS.OPERATION_LOGS)
        .where(condition)
        .orderBy("createdAt", "desc")
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get();
      logs = res.data || [];
    }
  } catch (error) {
    // 集合不存在返回空结果
    total = 0;
    logs = [];
  }

  // 生成 CSV 内容
  const csvCell = (value) => {
    let text = String(value === undefined || value === null ? "" : value);
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, "\"\"")}"`;
  };
  const header = ["操作时间", "操作人", "操作类型", "详情", "目标"]
    .map(csvCell)
    .join(",");
  const rows = logs.map(l => {
    const time = l.createdAt ? new Date(l.createdAt).toLocaleString("zh-CN", { hour12: false }) : "";
    const actionLabel = ({
      PUBLISH_SCHEDULE: "发布排班",
      PUBLISH_SERVICE_SCHEDULE: "发布勤务排班",
      AUTO_SCHEDULE: "自动排班",
      REJECT_SWAP: "驳回调班",
      APPROVE_SWAP: "审批调班",
      APPROVE_SWAP_EXCHANGE: "审批互换",
      CREATE_SWAP: "提交互换申请",
      CREATE_SHIFT_APPLICATION: "提交调班申请",
      WITHDRAW_SWAP: "撤回调班申请",
      CREATE_LEAVE: "提交请假申请",
      WITHDRAW_LEAVE: "撤回请假申请",
      APPROVE_LEAVE: "批准请假",
      REJECT_LEAVE: "驳回请假",
      UPDATE_CONFIG: "修改配置",
      BOOTSTRAP_DATA: "初始化数据",
      LOGIN: "登录",
      LOGOUT: "登出",
      REGISTER: "注册",
      UPDATE_FLIGHT_STATUS: "更新航班状态",
      UPDATE_FLIGHT_OPERATIONAL_DATA: "更新航班运行数据",
      REALTIME_REASSIGN: "实时改班",
      PROPAGATE_DELAY: "延误传播",
    })[l.action] || l.action;
    const detail = l.detail || "";
    const target = JSON.stringify(l.target || "");
    return [time, l.operator || "", actionLabel, detail, target]
      .map(csvCell)
      .join(",");
  });

  // P3 修复: 加 UTF-8 BOM 让 Excel 正确识别中文编码
  const csvContent = "\uFEFF" + [header, ...rows].join("\n");

  // 上传到云存储
  const cloudPath = `exports/audit_logs_${formatDate(new Date())}_${Date.now()}.csv`;
  const uploadRes = await cloud.uploadFile({
    cloudPath,
    fileContent: Buffer.from(csvContent, "utf-8"),
  });

  return ok({
    total,
    exported: rows.length,
    fileID: uploadRes.fileID,
    cloudPath,
  });
};

// ──────────────────────────────────────────────
// 路由表
// ──────────────────────────────────────────────
module.exports = {
  queryOperationLogs,
  exportOperationLogs,
};
