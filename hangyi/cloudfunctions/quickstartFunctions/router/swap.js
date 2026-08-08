/**
 * swap.js - 代班 / 调班申请与审批
 * 涵盖：createSwapApplication、listMySwapRequests、
 *       listSwapRequests、approveSwapRequest、withdrawSwapRequest
 *
 * 注意：SWAP（代班互换）类型仅用于兼容历史遗留数据，新申请一律
 *       创建为 SHIFT_APPLY（单人调班）；审批/撤回分支保留 SWAP 处理能力。
 *       审批/列表仅 ADMIN，不支持 BOSS 只读。
 */
const {
  db, COLLECTIONS, SETTINGS_KEYS,
  ok, fail, logOperation, callHangyiServiceChecked,
  hasQualification, normalizeReasonEvidence, formatDate,
  getOpenContext, getSettingValue, requireAdmin, requireActiveStaff,
  getApprovedLeaveEmployeeNos, validateStaffScheduleAssignment,
} = require("../utils");
const cache = require("../cache");

const SWAP_STATUS_TEXT = {
  PENDING_TARGET_CONFIRMATION: "等待对方确认",
  PENDING: "待审批",
  APPROVED: "审批通过",
  REJECTED: "审批驳回",
  CANCELLED: "已撤回",
};

const SWAP_TYPE_TEXT = {
  SHIFT_APPLY: "调班申请",
  SWAP: "代班互换",
};

const makeAuditEntry = (action, staff, status, detail = "") => ({
  action,
  status,
  operatorEmployeeNo: staff && staff.employeeNo || "",
  operatorName: staff && staff.name || "",
  detail: String(detail || "").slice(0, 200),
  at: new Date(),
});

const findActiveScheduleConflict = async (staffId, scheduleDate, excludedIds = []) => {
  if (!staffId || !scheduleDate) return null;
  const result = await db.collection(COLLECTIONS.SCHEDULES)
    .where({ staffId, scheduleDate })
    .limit(50)
    .get();
  const excluded = new Set(excludedIds);
  return (result.data || []).find(
    (item) =>
      !excluded.has(item._id) &&
      item.recordStatus !== "archived" &&
      item.status !== "CANCELLED"
  ) || null;
};


// ──────────────────────────────────────────────
// 创建调班申请（单人申请）
// ──────────────────────────────────────────────
const createSwapApplication = async (event) => {
  const guard = await requireActiveStaff();
  if (!guard.ok) return guard.response;

  const payload = event.data || {};
  const sourceScheduleId = typeof payload.sourceScheduleId === "string"
    ? payload.sourceScheduleId.trim() : "";
  const reasonEvidence = normalizeReasonEvidence(payload);

  if (!sourceScheduleId) return fail("请选择需要调整的排班", 400);
  if (!reasonEvidence.ok) return fail(reasonEvidence.message, 400);

  const scheduleRes = await db.collection(COLLECTIONS.SCHEDULES).doc(sourceScheduleId).get();
  const schedule = scheduleRes.data;
  if (!schedule) return fail("排班记录不存在", 404);
  if (schedule.staffId !== guard.staff._id) {
    return fail("只能为自己的排班发起调班申请", 403);
  }
  if (schedule.status === "COMPLETED") return fail("已完成的排班不能申请调班", 409);
  if (!schedule.scheduleDate || schedule.scheduleDate <= formatDate(new Date())) {
    return fail("历史排班不能申请调班", 409);
  }

  const { openid } = getOpenContext();
  const pending = await db.collection(COLLECTIONS.SWAP_REQUESTS)
    .where({ sourceScheduleId, requesterOpenid: openid, status: "PENDING" })
    .limit(1)
    .get();
  if (pending.data && pending.data.length) {
    return fail("该排班已有待审批申请", 409);
  }

  const validationSnapshot = await validateStaffScheduleAssignment({
    staff: guard.staff,
    targetSchedule: schedule,
    excludeScheduleIds: [sourceScheduleId],
  });
  const now = new Date();
  const applyData = {
    requestType: "SHIFT_APPLY",
    employeeNo: guard.staff.employeeNo,
    name: guard.staff.name,
    sourceStaffId: guard.staff._id,
    sourceScheduleId,
    scheduleDate: schedule.scheduleDate,
    flightNo: schedule.flightNo || "",
    airline: schedule.airline || "",
    aircraftType: schedule.aircraftType || "",
    startTime: schedule._taskStart || schedule.arrivalTime || "",
    endTime: schedule._taskEnd || schedule.departureTime || "",
    reason: reasonEvidence.reason,
    reasonText: reasonEvidence.reasonText,
    reasonImages: reasonEvidence.reasonImages,
    reasonMode: reasonEvidence.reasonMode,
    status: "PENDING",
    verifier: "AUTO_COMPLIANCE",
    validationSnapshot,
    validatedAt: now,
    requesterOpenid: openid,
    auditTrail: [
      makeAuditEntry(
        "SUBMITTED",
        guard.staff,
        "PENDING",
        validationSnapshot.passed ? "原排班合规校验通过" : "原排班存在待处理合规项"
      ),
    ],
    createdAt: now,
    updatedAt: now,
  };
  const requestRes = await db.collection(COLLECTIONS.SWAP_REQUESTS).add({ data: applyData });

  await logOperation(
    "CREATE_SHIFT_APPLICATION",
    `${guard.staff.name}（${guard.staff.employeeNo}）提交调班申请`,
    {
      type: "swapRequest",
      requestId: requestRes._id,
      scheduleId: sourceScheduleId,
      reasonMode: reasonEvidence.reasonMode,
      imageCount: reasonEvidence.reasonImages.length,
      validationPassed: validationSnapshot.passed,
      validationViolations: validationSnapshot.violations,
      before: null,
      after: { status: "PENDING" },
    }
  );

  // 实时同步到 Hangyi
  const syncEnabled = String(await getSettingValue(SETTINGS_KEYS.HANGYI_SYNC_ENABLED, "false")) === "true";
  if (syncEnabled) {
    callHangyiServiceChecked("/api/sync/swap-requests", [{ _id: requestRes._id, ...applyData }])
      .catch((error) => {
        console.error("Hangyi同步失败:", error.message || "unknown");
        logOperation("HANGYI_SYNC_FAILED", `Hangyi同步调班申请失败: ${requestRes._id}`, {
          type: "swapRequest",
          requestId: requestRes._id,
          detail: String(error.message || "unknown").slice(0, 200),
        }).catch(() => {});
      });
  }

  return ok(
    {
      requestId: requestRes._id,
      employeeNo: guard.staff.employeeNo,
      name: guard.staff.name,
      sourceScheduleId,
      scheduleDate: schedule.scheduleDate,
      flightNo: schedule.flightNo || "",
      validationSnapshot,
    },
    "调班申请已提交，待审批"
  );
};

// ──────────────────────────────────────────────
// 列出当前用户自己的调班 / 代班申请
// ──────────────────────────────────────────────
const listMySwapRequests = async (event) => {
  const payload = event.data || {};
  const rawStatus = payload.status;
  if (rawStatus !== undefined && typeof rawStatus !== "string") {
    return fail("status 参数类型错误", 400);
  }

  const status = String(rawStatus || "").trim().toUpperCase();
  const validStatus = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"];
  if (status && !validStatus.includes(status)) {
    return fail("status 参数无效", 400);
  }

  const guard = await requireActiveStaff();
  if (!guard.ok) return guard.response;
  const { openid } = getOpenContext();

  const condition = { requesterOpenid: openid };
  if (status) condition.status = status;

  const result = await db
    .collection(COLLECTIONS.SWAP_REQUESTS)
    .where(condition)
    .orderBy("createdAt", "desc")
    .limit(100)
    .get();

  const incomingResult = await db
    .collection(COLLECTIONS.SWAP_REQUESTS)
    .where({ targetStaffId: guard.staff._id })
    .orderBy("createdAt", "desc")
    .limit(100)
    .get();
  const merged = new Map();
  [...(result.data || []), ...(incomingResult.data || [])].forEach((item) => merged.set(item._id, item));
  const list = Array.from(merged.values()).map((item) => ({
    _id: item._id,
    requestType: item.requestType || "SWAP",
    requestTypeText: SWAP_TYPE_TEXT[item.requestType || "SWAP"] || "调班申请",
    employeeNo: item.employeeNo || "",
    name: item.name || "",
    flightNo: item.flightNo || "",
    scheduleDate: item.scheduleDate || "",
    airline: item.airline || "",
    aircraftType: item.aircraftType || "",
    startTime: item.startTime || "",
    endTime: item.endTime || "",
    sourceScheduleId: item.sourceScheduleId || "",
    targetScheduleId: item.targetScheduleId || "",
    targetConsent: item.targetConsent || (item.requestType === "SWAP" ? "PENDING" : "NOT_REQUIRED"),
    isTargetParticipant: item.targetStaffId === guard.staff._id,
    reason: item.reason || "",
    reasonText: item.reasonText || item.reason || "",
    reasonImages: Array.isArray(item.reasonImages) ? item.reasonImages : [],
    reasonMode: item.reasonMode || (item.reason ? "TEXT" : ""),
    validationSnapshot: item.validationSnapshot || null,
    auditTrail: Array.isArray(item.auditTrail) ? item.auditTrail : [],
    status: item.status || "PENDING",
    statusText: SWAP_STATUS_TEXT[item.status] || item.status || "未知状态",
    comment: item.comment || "",
    replacementEmployeeNo: item.replacementEmployeeNo || "",
    replacementName: item.replacementName || "",
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || null,
    cancelledAt: item.cancelledAt || null,
  }));

  return ok({ list, total: list.length });
};


// ──────────────────────────────────────────────
// 列出待审批/已审批申请
// ──────────────────────────────────────────────
const listSwapRequests = async (event) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const rawStatus = (event.data || {}).status;
  const VALID_STATUS = ["PENDING", "APPROVED", "REJECTED"];
  if (rawStatus !== undefined && typeof rawStatus !== "string") {
    return fail("status 参数类型错误", 400);
  }
  const status = String(rawStatus || "PENDING").trim().toUpperCase();
  if (!VALID_STATUS.includes(status)) return fail("status 参数无效", 400);
  const result = await db
    .collection(COLLECTIONS.SWAP_REQUESTS)
    .where({ status })
    .orderBy("createdAt", "desc")
    .limit(50)
    .get();

  return ok({ requests: result.data });
};

// ──────────────────────────────────────────────
// 审批通过/驳回
// ──────────────────────────────────────────────
const approveSwapRequest = async (event) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const payload = event.data || {};
  if (typeof payload.requestId !== "string") return fail("申请ID类型错误", 400);
  if (payload.decision !== undefined && typeof payload.decision !== "string") {
    return fail("审批动作类型错误", 400);
  }
  if (payload.comment !== undefined && typeof payload.comment !== "string") {
    return fail("审批备注类型错误", 400);
  }
  if (payload.replacementStaffId !== undefined && typeof payload.replacementStaffId !== "string") {
    return fail("替班员工ID类型错误", 400);
  }

  const requestId = payload.requestId.trim();
  const decision = String(payload.decision || "APPROVE").trim().toUpperCase();
  const comment = String(payload.comment || "").trim().slice(0, 200);
  const replacementStaffId = String(payload.replacementStaffId || "").trim();
  if (!requestId) return fail("缺少申请ID", 400);
  if (requestId.length > 64) return fail("申请ID格式错误", 400);
  if (!["APPROVE", "REJECT"].includes(decision)) return fail("审批动作无效", 400);

  const reqRes = await db.collection(COLLECTIONS.SWAP_REQUESTS).doc(requestId).get();
  const req = reqRes.data;
  if (!req) return fail("申请不存在", 404);
  if (req.status !== "PENDING") return fail("该申请已处理", 409);

  const { openid } = getOpenContext();

  if (decision === "REJECT") {
    const now = new Date();
    const auditTrail = [
      ...(Array.isArray(req.auditTrail) ? req.auditTrail : []),
      makeAuditEntry("REJECTED", guard.staff, "REJECTED", comment || "未填写审批备注"),
    ].slice(-20);
    await db.collection(COLLECTIONS.SWAP_REQUESTS).doc(requestId).update({
      data: {
        status: "REJECTED",
        approverOpenid: openid,
        comment,
        auditTrail,
        updatedAt: now,
      },
    });
    await logOperation("REJECT_SWAP", `驳回了调班申请 ${requestId}，原因: ${comment || "无"}`, {
      type: "swapRequest",
      requestId,
      before: { status: "PENDING" },
      after: { status: "REJECTED", comment },
    });
    return ok({ requestId }, "已驳回代班申请");
  }

  const requestType = req.requestType || (req.targetScheduleId ? "SWAP" : "SHIFT_APPLY");
  if (!["SHIFT_APPLY", "SWAP"].includes(requestType)) {
    return fail("申请类型无效", 409);
  }
  if (!req.sourceScheduleId) {
    return fail("审批失败：申请未关联原排班，请申请人重新提交", 409);
  }
  if (requestType === "SWAP" && req.targetConsent !== "ACCEPTED") {
    return fail("审批失败：对方尚未同意该互换申请", 409);
  }

  const sourceScheduleRes = await db.collection(COLLECTIONS.SCHEDULES).doc(req.sourceScheduleId).get();
  const sourceSchedule = sourceScheduleRes.data;
  if (!sourceSchedule) return fail("审批失败：原排班记录不存在", 404);
  if (sourceSchedule.status === "COMPLETED" || sourceSchedule.recordStatus === "archived") {
    return fail("审批失败：原排班已完成或已归档", 409);
  }
  if (sourceSchedule.scheduleDate && sourceSchedule.scheduleDate < formatDate(new Date())) {
    return fail("审批失败：历史排班不能调整", 409);
  }
  if (req.sourceStaffId && sourceSchedule.staffId !== req.sourceStaffId) {
    return fail("审批失败：原排班人员已发生变化，请重新提交", 409);
  }

  if (requestType === "SHIFT_APPLY") {
    if (!replacementStaffId) return fail("请选择替班员工", 400);
    if (replacementStaffId === sourceSchedule.staffId) {
      return fail("替班员工不能是申请人本人", 409);
    }

    const replacementRes = await db.collection(COLLECTIONS.STAFF).doc(replacementStaffId).get();
    const replacement = replacementRes.data;
    if (!replacement || replacement.active === false) {
      return fail("替班员工不存在或已停用", 404);
    }

    const validationSnapshot = await validateStaffScheduleAssignment({
      staff: replacement,
      targetSchedule: sourceSchedule,
      excludeScheduleIds: [req.sourceScheduleId],
    });
    if (!validationSnapshot.passed) {
      return fail("替班员工未通过系统资质与工时校验", 409, validationSnapshot);
    }

    const now = new Date();
    const originalStaff = {
      staffId: sourceSchedule.staffId || "",
      staffName: sourceSchedule.staffName || req.name || "",
      staffEmployeeNo: sourceSchedule.staffEmployeeNo || req.employeeNo || "",
      groupId: sourceSchedule.groupId || "",
      openid: sourceSchedule.openid || req.requesterOpenid || "",
    };
    const scheduleUpdate = {
      staffId: replacement._id,
      staffName: replacement.name,
      staffEmployeeNo: replacement.employeeNo,
      groupId: replacement.groupId,
      openid: replacement.openid || "",
      status: "SWAPPED",
      previousStaffId: originalStaff.staffId,
      previousStaffName: originalStaff.staffName,
      previousStaffEmployeeNo: originalStaff.staffEmployeeNo,
      swapRequestId: requestId,
      needsReassignment: false,
      leaveRequestId: "",
      reassignmentReason: "",
      updatedAt: now,
    };

    await db.collection(COLLECTIONS.SCHEDULES).doc(req.sourceScheduleId).update({
      data: scheduleUpdate,
    });
    await db.collection(COLLECTIONS.SWAP_REQUESTS).doc(requestId).update({
      data: {
        status: "APPROVED",
        approverOpenid: openid,
        comment,
        replacementStaffId: replacement._id,
        replacementEmployeeNo: replacement.employeeNo,
        replacementName: replacement.name,
        validationSnapshot,
        validatedAt: now,
        auditTrail: [
          ...(Array.isArray(req.auditTrail) ? req.auditTrail : []),
          makeAuditEntry(
            "APPROVED",
            guard.staff,
            "APPROVED",
            `系统校验通过，替班人员 ${replacement.name}（${replacement.employeeNo}）`
          ),
        ].slice(-20),
        approvedAt: now,
        updatedAt: now,
      },
    });

    cache.invalidate("SCHEDULE_TABLE");
    await logOperation(
      "APPROVE_SHIFT_APPLICATION",
      `审批通过调班申请 ${requestId}，由 ${replacement.name}（${replacement.employeeNo}）替班`,
      {
        type: "swapRequest",
        requestId,
        scheduleId: req.sourceScheduleId,
        sourceStaffId: originalStaff.staffId,
        replacementStaffId: replacement._id,
        validationSnapshot,
        before: {
          status: "PENDING",
          staffId: originalStaff.staffId,
        },
        after: {
          status: "APPROVED",
          staffId: replacement._id,
        },
      }
    );

    const syncEnabled = String(await getSettingValue(SETTINGS_KEYS.HANGYI_SYNC_ENABLED, "false")) === "true";
    if (syncEnabled) {
      callHangyiServiceChecked("/api/sync/schedules", [{
        _id: req.sourceScheduleId,
        ...sourceSchedule,
        ...scheduleUpdate,
      }]).catch((error) => {
        console.error("Hangyi排班同步失败:", error.message || "unknown");
        logOperation("HANGYI_SYNC_FAILED", `Hangyi同步审批排班失败: ${req.sourceScheduleId}`, {
          type: "schedule",
          scheduleId: req.sourceScheduleId,
          detail: String(error.message || "unknown").slice(0, 200),
        }).catch(() => {});
      });
    }

    return ok({
      requestId,
      scheduleId: req.sourceScheduleId,
      replacementStaffId: replacement._id,
      replacementEmployeeNo: replacement.employeeNo,
      replacementName: replacement.name,
      validationSnapshot,
    }, "审批通过，已完成替班");
  }

  if (!req.targetScheduleId) {
    return fail("审批失败：互换申请未关联目标排班", 409);
  }
  const targetScheduleRes = await db.collection(COLLECTIONS.SCHEDULES).doc(req.targetScheduleId).get();
  const targetSchedule = targetScheduleRes.data;

  if (!targetSchedule) return fail("审批失败：目标排班记录不存在", 404);
  if (targetSchedule.status === "COMPLETED" || targetSchedule.recordStatus === "archived") {
    return fail("审批失败：目标排班已完成或已归档", 409);
  }
  if (!targetSchedule.scheduleDate || targetSchedule.scheduleDate < formatDate(new Date())) {
    return fail("审批失败：历史目标排班不能调整", 409);
  }
  if (req.targetStaffId && targetSchedule.staffId !== req.targetStaffId) {
    return fail("审批失败：目标排班人员已发生变化，请重新提交", 409);
  }

  const sourceStaffRes = await db.collection(COLLECTIONS.STAFF).doc(sourceSchedule.staffId).get();
  const targetStaffRes = await db.collection(COLLECTIONS.STAFF).doc(targetSchedule.staffId).get();
  const sourceStaff = sourceStaffRes.data;
  const targetStaff = targetStaffRes.data;
  if (!sourceStaff || !targetStaff || sourceStaff.active === false || targetStaff.active === false) {
    return fail("审批失败：排班人员不存在或已停用", 409);
  }

  const [sourceLeaveNos, targetLeaveNos] = await Promise.all([
    getApprovedLeaveEmployeeNos(targetSchedule.scheduleDate),
    getApprovedLeaveEmployeeNos(sourceSchedule.scheduleDate),
  ]);
  if (sourceLeaveNos.has(sourceStaff.employeeNo)) {
    return fail("审批失败：申请人在目标排班日期处于已批准请假状态", 409);
  }
  if (targetLeaveNos.has(targetStaff.employeeNo)) {
    return fail("审批失败：目标员工在原排班日期处于已批准请假状态", 409);
  }

  const [sourceConflict, targetConflict] = await Promise.all([
    findActiveScheduleConflict(
      sourceStaff._id,
      targetSchedule.scheduleDate,
      [req.sourceScheduleId, req.targetScheduleId]
    ),
    findActiveScheduleConflict(
      targetStaff._id,
      sourceSchedule.scheduleDate,
      [req.sourceScheduleId, req.targetScheduleId]
    ),
  ]);
  if (sourceConflict || targetConflict) {
    return fail("审批失败：互换后存在同日排班冲突", 409, {
      sourceConflictScheduleId: sourceConflict ? sourceConflict._id : "",
      targetConflictScheduleId: targetConflict ? targetConflict._id : "",
    });
  }

  const targetCanTakeSource = hasQualification(targetStaff, sourceSchedule.airline, sourceSchedule.aircraftType);
  const sourceCanTakeTarget = hasQualification(sourceStaff, targetSchedule.airline, targetSchedule.aircraftType);

  if (!sourceCanTakeTarget || !targetCanTakeSource) {
    return fail("审批失败：资质复核未通过", 409, {
      sourceCanTakeTarget,
      targetCanTakeSource,
    });
  }

  const [sourceValidation, targetValidation] = await Promise.all([
    validateStaffScheduleAssignment({
      staff: sourceStaff,
      targetSchedule,
      excludeScheduleIds: [req.sourceScheduleId, req.targetScheduleId],
    }),
    validateStaffScheduleAssignment({
      staff: targetStaff,
      targetSchedule: sourceSchedule,
      excludeScheduleIds: [req.sourceScheduleId, req.targetScheduleId],
    }),
  ]);
  if (!sourceValidation.passed || !targetValidation.passed) {
    return fail("审批失败：系统复核发现资质、请假或工时冲突", 409, {
      sourceValidation,
      targetValidation,
    });
  }

  const approvedAt = new Date();
  await db.collection(COLLECTIONS.SCHEDULES).doc(req.sourceScheduleId).update({
    data: {
      staffId: targetStaff._id,
      staffName: targetStaff.name,
      staffEmployeeNo: targetStaff.employeeNo,
      groupId: targetStaff.groupId,
      openid: targetStaff.openid || "",
      status: "SWAPPED",
      needsReassignment: false,
      leaveRequestId: "",
      reassignmentReason: "",
      updatedAt: approvedAt,
    },
  });

  await db.collection(COLLECTIONS.SCHEDULES).doc(req.targetScheduleId).update({
    data: {
      staffId: sourceStaff._id,
      staffName: sourceStaff.name,
      staffEmployeeNo: sourceStaff.employeeNo,
      groupId: sourceStaff.groupId,
      openid: sourceStaff.openid || "",
      status: "SWAPPED",
      needsReassignment: false,
      leaveRequestId: "",
      reassignmentReason: "",
      updatedAt: approvedAt,
    },
  });

  await db.collection(COLLECTIONS.SWAP_REQUESTS).doc(requestId).update({
    data: {
      status: "APPROVED",
      approverOpenid: openid,
      comment,
      validationSnapshot: {
        passed: true,
        sourceValidation,
        targetValidation,
      },
      validatedAt: approvedAt,
      auditTrail: [
        ...(Array.isArray(req.auditTrail) ? req.auditTrail : []),
        makeAuditEntry("APPROVED", guard.staff, "APPROVED", "系统复核通过并完成双方排班互换"),
      ].slice(-20),
      approvedAt,
      updatedAt: approvedAt,
    },
  });

  cache.invalidate("SCHEDULE_TABLE");
  await logOperation("APPROVE_SWAP_EXCHANGE", `审批通过了互换排班申请 ${requestId}：${sourceStaff.name}  ${targetStaff.name}`, {
    type: "swapRequest",
    requestId,
    sourceStaff: sourceStaff.name,
    targetStaff: targetStaff.name,
    validationSnapshot: { passed: true, sourceValidation, targetValidation },
    before: { status: "PENDING" },
    after: { status: "APPROVED" },
  });
  return ok({
    requestId,
    validationSnapshot: { passed: true, sourceValidation, targetValidation },
  }, "审批通过，已完成互换");
};


// ──────────────────────────────────────────────
// 撤回调班 / 代班申请（仅申请人本人，且状态必须是 PENDING）
// ──────────────────────────────────────────────
const withdrawSwapRequest = async (event) => {
  const requestId = typeof (event.data || {}).requestId === "string"
    ? event.data.requestId.trim() : "";
  if (!requestId) return fail("缺少 requestId", 400);

  const res = await db.collection(COLLECTIONS.SWAP_REQUESTS).doc(requestId).get();
  const req = res.data;
  if (!req) return fail("申请不存在", 404);

  const { openid } = getOpenContext();
  if (req.requesterOpenid !== openid) return fail("只能撤回自己的申请", 403);
  if (!["PENDING", "PENDING_TARGET_CONFIRMATION"].includes(req.status)) return fail(`已审批或已撤回的申请不能再撤回（当前状态：${req.status}）`, 409);
  // 兼容历史 SWAP 数据：对方已明确同意后不允许单方面撤回（需先沟通）
  if (req.requestType === "SWAP" && req.targetConsent === "ACCEPTED") {
    return fail("对方已同意的互换申请需先通知对方再撤回", 409);
  }

  const now = new Date();
  await db.collection(COLLECTIONS.SWAP_REQUESTS).doc(requestId).update({
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

  await logOperation("WITHDRAW_SWAP", `撤回调班/代班申请 ${requestId}`, {
    type: "swapRequest",
    requestId,
    before: { status: "PENDING" },
    after: { status: "CANCELLED" },
  });

  return ok({ requestId, status: "CANCELLED" }, "已撤回");
};

// ──────────────────────────────────────────────
// 路由表
// ──────────────────────────────────────────────
module.exports = {
  createSwapApplication,
  listMySwapRequests,
  listSwapRequests,
  approveSwapRequest,
  withdrawSwapRequest,
};
