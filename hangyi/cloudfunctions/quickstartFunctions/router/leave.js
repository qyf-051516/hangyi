/**
 * leave.js - 请假申请 / 审批 / 撤回
 * 涵盖：createLeaveRequest、withdrawLeaveRequest、listMyLeaveRequests、
 *       listPendingLeaveRequests、approveLeaveRequest
 *
 * 集合 leave_requests 字段约定：
 *   _id, employeeNo, name, openid, type, startDate, endDate, totalDays,
 *   reason, status, approverOpenid, approver, approvedAt, comment,
 *   createdAt, updatedAt
 *
 * 状态机：PENDING -> APPROVED | REJECTED | CANCELLED
 *   - 员工可撤回自己的 PENDING 申请 (status -> CANCELLED)
 *   - admin 可审批 PENDING 申请 (status -> APPROVED|REJECTED)
 *   - 已审批或已撤回的不可再操作
 *
 * 鉴权约定（遵循 AGENTS.md §4.3）：
 *   - create / withdraw / listMine  -> 登录员工本人
 *   - listPending / approve         -> requireAdmin 守卫
 */
const {
  db, _, COLLECTIONS, SETTINGS_KEYS,
  ok, fail, logOperation, callHangyiServiceChecked,
  ensureCollection, requireAdmin, requireActiveStaff,
  getOpenContext, getSettingValue, getApprovedLeaveEmployeeNos,
  getScheduleTimeRange, normalizeReasonEvidence,
} = require("../utils");
const cache = require("../cache");

// 类型白名单
const VALID_TYPES = ["SICK", "PERSONAL", "TRAINING", "ANNUAL", "OTHER"];
const TYPE_LABEL = {
  SICK: "病假",
  PERSONAL: "事假",
  TRAINING: "培训",
  ANNUAL: "年假",
  OTHER: "其他",
};
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const dayDiff = (start, end) => {
  const a = new Date(start + "T00:00:00Z").getTime();
  const b = new Date(end + "T00:00:00Z").getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
};

const todayISO = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const makeAuditEntry = (action, staff, status, detail = "") => ({
  action,
  status,
  operatorEmployeeNo: staff && staff.employeeNo || "",
  operatorName: staff && staff.name || "",
  detail: String(detail || "").slice(0, 200),
  at: new Date(),
});

// 时段冲突检查：与现有 PENDING / APPROVED 的请假重叠则拒绝
const checkOverlap = async ({ employeeNo, startDate, endDate, excludeId }) => {
  const cond = {
    employeeNo,
    status: db.command.in(["PENDING", "APPROVED"]),
  };
  const res = await db.collection(COLLECTIONS.LEAVE_REQUESTS).where(cond).limit(100).get();
  for (const item of res.data || []) {
    if (excludeId && item._id === excludeId) continue;
    // 重叠：a.start <= b.end && b.start <= a.end
    if (item.startDate <= endDate && startDate <= item.endDate) {
      return item;
    }
  }
  return null;
};

// staff.onLeave 仅保存今天的状态快照，实际排班冲突以 leave_requests 日期区间为准。
const refreshStaffLeaveSnapshot = async (employeeNo) => {
  const staffRes = await db.collection(COLLECTIONS.STAFF)
    .where({ employeeNo })
    .limit(1)
    .get();
  const staff = staffRes.data && staffRes.data[0];
  if (!staff) return null;

  const leaveEmployeeNos = await getApprovedLeaveEmployeeNos(todayISO());
  const onLeave = leaveEmployeeNos.has(employeeNo);
  await db.collection(COLLECTIONS.STAFF).doc(staff._id).update({
    data: { onLeave, updatedAt: new Date() },
  });
  return { ...staff, onLeave };
};

const getStaffByEmployeeNo = async (employeeNo) => {
  const staffRes = await db.collection(COLLECTIONS.STAFF)
    .where({ employeeNo })
    .limit(1)
    .get();
  return staffRes.data && staffRes.data[0] || null;
};

const getImpactedSchedules = async (req, staff) => {
  if (!staff || !staff._id) return [];
  const scheduleRes = await db.collection(COLLECTIONS.SCHEDULES)
    .where({
      staffId: staff._id,
      scheduleDate: _.gte(req.startDate),
    })
    .limit(500)
    .get();
  return (scheduleRes.data || []).filter(
    (item) =>
      item.scheduleDate <= req.endDate &&
      item.recordStatus !== "archived" &&
      item.status !== "COMPLETED"
  );
};

const markSchedulesForReassignment = async (req, staff, requestId) => {
  const impacted = await getImpactedSchedules(req, staff);
  const now = new Date();
  for (const item of impacted) {
    await db.collection(COLLECTIONS.SCHEDULES).doc(item._id).update({
      data: {
        needsReassignment: true,
        leaveRequestId: requestId,
        reassignmentReason: "LEAVE_APPROVED",
        updatedAt: now,
      },
    });
  }
  if (impacted.length) cache.invalidate("SCHEDULE_TABLE");
  return impacted;
};

// ──────────────────────────────────────────────
// 创建请假申请
// ──────────────────────────────────────────────
const createLeaveRequest = async (event) => {
  await ensureCollection(COLLECTIONS.LEAVE_REQUESTS);
  const payload = event.data || {};

  const type = typeof payload.type === "string" ? payload.type.trim().toUpperCase() : "";
  const startDate = typeof payload.startDate === "string" ? payload.startDate.trim() : "";
  const endDate = typeof payload.endDate === "string" ? payload.endDate.trim() : "";
  const reasonEvidence = normalizeReasonEvidence(payload);

  if (!VALID_TYPES.includes(type)) return fail("请假类型无效", 400);
  if (!DATE_RE.test(startDate)) return fail("开始日期格式错误（YYYY-MM-DD）", 400);
  if (!DATE_RE.test(endDate)) return fail("结束日期格式错误（YYYY-MM-DD）", 400);
  if (startDate > endDate) return fail("结束日期不能早于开始日期", 400);
  if (startDate < todayISO()) return fail("不能申请过去日期的请假", 400);
  const totalDays = dayDiff(startDate, endDate);
  if (totalDays > 365) return fail("请假跨度不能超过 365 天", 400);
  if (!reasonEvidence.ok) return fail(reasonEvidence.message, 400);

  const guard = await requireActiveStaff();
  if (!guard.ok) return guard.response;
  const { openid } = getOpenContext();
  const employeeNo = guard.staff.employeeNo;
  const name = guard.staff.name;

  // 时段重叠
  const conflict = await checkOverlap({ employeeNo, startDate, endDate });
  if (conflict) {
    return fail(`该时间段已被请假申请覆盖（${conflict.startDate} 至 ${conflict.endDate}）`, 409, {
      conflictId: conflict._id,
      conflictStatus: conflict.status,
    });
  }

  const now = new Date();
  const impactedSchedules = await getImpactedSchedules(
    { startDate, endDate },
    guard.staff
  );
  const impactedMinutes = impactedSchedules.reduce((sum, schedule) => {
    const range = getScheduleTimeRange(schedule, schedule.scheduleDate);
    return sum + (range ? range.minutes : 0);
  }, 0);
  const validationSnapshot = {
    checkedAt: now,
    passed: true,
    affectedScheduleCount: impactedSchedules.length,
    affectedScheduleIds: impactedSchedules.map((item) => item._id),
    scheduledWorkHours: Math.round((impactedMinutes / 60) * 10) / 10,
    requiresReassignment: impactedSchedules.length > 0,
  };
  const doc = {
    employeeNo,
    name,
    openid,
    type,
    typeText: TYPE_LABEL[type] || type,
    startDate,
    endDate,
    totalDays,
    reason: reasonEvidence.reason,
    reasonText: reasonEvidence.reasonText,
    reasonImages: reasonEvidence.reasonImages,
    reasonMode: reasonEvidence.reasonMode,
    status: "PENDING",
    validationSnapshot,
    validatedAt: now,
    auditTrail: [
      makeAuditEntry(
        "SUBMITTED",
        guard.staff,
        "PENDING",
        impactedSchedules.length
          ? `系统识别 ${impactedSchedules.length} 条排班待审批后改派`
          : "系统未发现请假区间内的排班冲突"
      ),
    ],
    createdAt: now,
    updatedAt: now,
  };
  const res = await db.collection(COLLECTIONS.LEAVE_REQUESTS).add({ data: doc });

  // 同步到 Java 后端（失败不影响主流程）
  const syncEnabled = String(await getSettingValue(SETTINGS_KEYS.HANGYI_SYNC_ENABLED, "false")) === "true";
  if (syncEnabled) {
    callHangyiServiceChecked("/api/sync/leave-requests", [{ _id: res._id, ...doc }])
      .catch((error) => console.error("Hangyi leave 同步失败:", error.message || "unknown"));
  }

  await logOperation("CREATE_LEAVE", `${name}（${employeeNo}）提交请假 ${startDate} 至 ${endDate} (${totalDays} 天)`, {
    type: "leave",
    requestId: res._id,
    employeeNo,
    leaveType: type,
    totalDays,
    reasonMode: reasonEvidence.reasonMode,
    imageCount: reasonEvidence.reasonImages.length,
    validationSnapshot,
    before: null,
    after: { status: "PENDING" },
  });

  return ok({
    requestId: res._id,
    totalDays,
    status: "PENDING",
    startDate,
    endDate,
    validationSnapshot,
  }, "请假申请已提交");
};

// ──────────────────────────────────────────────
// 员工撤回自己的请假申请（仅 PENDING 状态）
// ──────────────────────────────────────────────
const withdrawLeaveRequest = async (event) => {
  await ensureCollection(COLLECTIONS.LEAVE_REQUESTS);
  const requestId = typeof (event.data || {}).requestId === "string"
    ? event.data.requestId.trim() : "";
  if (!requestId) return fail("缺少 requestId", 400);

  const res = await db.collection(COLLECTIONS.LEAVE_REQUESTS).doc(requestId).get();
  const req = res.data;
  if (!req) return fail("请假申请不存在", 404);

  const { openid } = getOpenContext();
  if (req.openid !== openid) return fail("只能撤回自己的请假申请", 403);
  if (req.status !== "PENDING") return fail(`已审批或已撤回的申请不能再撤回（当前状态：${req.status}）`, 409);

  const now = new Date();
  await db.collection(COLLECTIONS.LEAVE_REQUESTS).doc(requestId).update({
    data: {
      status: "CANCELLED",
      cancelledAt: now,
      auditTrail: [
        ...(Array.isArray(req.auditTrail) ? req.auditTrail : []),
        makeAuditEntry(
          "WITHDRAWN",
          { employeeNo: req.employeeNo, name: req.name },
          "CANCELLED",
          "申请人主动撤回"
        ),
      ].slice(-20),
      updatedAt: now,
    },
  });

  await logOperation("WITHDRAW_LEAVE", `${req.name}（${req.employeeNo}）撤回了请假申请 ${requestId}`, {
    type: "leave",
    requestId,
    employeeNo: req.employeeNo,
    before: { status: "PENDING" },
    after: { status: "CANCELLED" },
  });

  await refreshStaffLeaveSnapshot(req.employeeNo);
  return ok({ requestId, status: "CANCELLED" }, "已撤回");
};

// ──────────────────────────────────────────────
// 员工列出自己的请假申请
// ──────────────────────────────────────────────
const listMyLeaveRequests = async (event) => {
  await ensureCollection(COLLECTIONS.LEAVE_REQUESTS);
  const { openid } = getOpenContext();
  const res = await db.collection(COLLECTIONS.LEAVE_REQUESTS)
    .where({ openid })
    .orderBy("createdAt", "desc")
    .limit(100)
    .get();
  const list = (res.data || []).map((item) => ({
    _id: item._id,
    employeeNo: item.employeeNo || "",
    name: item.name || "",
    type: item.type,
    typeText: item.typeText || TYPE_LABEL[item.type] || item.type,
    startDate: item.startDate,
    endDate: item.endDate,
    totalDays: item.totalDays,
    reason: item.reason || "",
    reasonText: item.reasonText || item.reason || "",
    reasonImages: Array.isArray(item.reasonImages) ? item.reasonImages : [],
    reasonMode: item.reasonMode || (item.reason ? "TEXT" : ""),
    validationSnapshot: item.validationSnapshot || null,
    auditTrail: Array.isArray(item.auditTrail) ? item.auditTrail : [],
    status: item.status,
    comment: item.comment || "",
    approver: item.approver || "",
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || null,
  }));
  return ok({ list, total: list.length });
};

// ──────────────────────────────────────────────
// admin 列出待审批请假申请（可按状态/员工号过滤）
// ──────────────────────────────────────────────
const listPendingLeaveRequests = async (event) => {
  await ensureCollection(COLLECTIONS.LEAVE_REQUESTS);
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const payload = event.data || {};
  if (payload.status !== undefined && typeof payload.status !== "string") {
    return fail("status 参数类型错误", 400);
  }
  if (payload.employeeNo !== undefined && typeof payload.employeeNo !== "string") {
    return fail("employeeNo 参数类型错误", 400);
  }
  const status = typeof payload.status === "string" ? payload.status.trim().toUpperCase() : "PENDING";
  if (!["PENDING", "APPROVED", "REJECTED", "CANCELLED"].includes(status)) {
    return fail("status 参数无效", 400);
  }
  const employeeNo = typeof payload.employeeNo === "string" ? payload.employeeNo.trim().toUpperCase() : "";

  const cond = { status };
  if (employeeNo) cond.employeeNo = employeeNo;

  const res = await db.collection(COLLECTIONS.LEAVE_REQUESTS)
    .where(cond)
    .orderBy("createdAt", "desc")
    .limit(200)
    .get();

  return ok({
    list: res.data || [],
    total: (res.data || []).length,
  });
};

// ──────────────────────────────────────────────
// admin 审批请假申请（通过 / 驳回）
// ──────────────────────────────────────────────
const approveLeaveRequest = async (event) => {
  await ensureCollection(COLLECTIONS.LEAVE_REQUESTS);
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const payload = event.data || {};
  const requestId = typeof payload.requestId === "string" ? payload.requestId.trim() : "";
  const decision = typeof payload.decision === "string" ? payload.decision.trim().toUpperCase() : "";
  const comment = typeof payload.comment === "string" ? payload.comment.trim().slice(0, 200) : "";

  if (!requestId) return fail("缺少 requestId", 400);
  if (!["APPROVED", "REJECTED"].includes(decision)) {
    return fail("decision 必须是 APPROVED 或 REJECTED", 400);
  }

  const res = await db.collection(COLLECTIONS.LEAVE_REQUESTS).doc(requestId).get();
  const req = res.data;
  if (!req) return fail("请假申请不存在", 404);
  if (req.status !== "PENDING") {
    return fail(`该申请已处理（当前状态：${req.status}）`, 409);
  }

  const now = new Date();
  const impactedPreview = decision === "APPROVED"
    ? await getImpactedSchedules(req, await getStaffByEmployeeNo(req.employeeNo))
    : [];
  const auditTrail = [
    ...(Array.isArray(req.auditTrail) ? req.auditTrail : []),
    makeAuditEntry(
      decision === "APPROVED" ? "APPROVED" : "REJECTED",
      guard.staff,
      decision,
      comment || (decision === "APPROVED" ? "审批通过" : "审批驳回")
    ),
  ].slice(-20);
  await db.collection(COLLECTIONS.LEAVE_REQUESTS).doc(requestId).update({
    data: {
      status: decision,
      approverOpenid: guard.staff.openid,
      approver: `${guard.staff.name}（${guard.staff.employeeNo}）`,
      approvedAt: now,
      comment,
      auditTrail,
      validationSnapshot: {
        ...(req.validationSnapshot || {}),
        checkedAt: now,
        approvedImpactCount: impactedPreview.length,
        approvedImpactScheduleIds: impactedPreview.map((item) => item._id),
      },
      validatedAt: now,
      updatedAt: now,
    },
  });

  let impactedSchedules = [];
  if (decision === "APPROVED") {
    const staff = await refreshStaffLeaveSnapshot(req.employeeNo);
    impactedSchedules = await markSchedulesForReassignment(req, staff, requestId);
  } else {
    await refreshStaffLeaveSnapshot(req.employeeNo);
  }

  await logOperation(
    decision === "APPROVED" ? "APPROVE_LEAVE" : "REJECT_LEAVE",
    `${guard.staff.name}（${guard.staff.employeeNo}）${decision === "APPROVED" ? "批准" : "驳回"}了请假 ${requestId}：${req.name}（${req.employeeNo}）`,
    {
      type: "leave",
      requestId,
      employeeNo: req.employeeNo,
      decision,
      comment,
      before: { status: "PENDING" },
      after: {
        status: decision,
        impactedScheduleCount: impactedSchedules.length,
      },
    }
  );

  return ok({
    requestId,
    status: decision,
    impactedScheduleCount: impactedSchedules.length,
    impactedScheduleIds: impactedSchedules.map((item) => item._id),
  }, decision === "APPROVED" ? "已批准" : "已驳回");
};

module.exports = {
  createLeaveRequest,
  withdrawLeaveRequest,
  listMyLeaveRequests,
  listPendingLeaveRequests,
  approveLeaveRequest,
};
