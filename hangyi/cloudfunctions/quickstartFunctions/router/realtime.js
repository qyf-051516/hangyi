/**
 * realtime.js - 实时调班功能
 * 涵盖：updateFlightRealtimeStatus、getFlightRealtimeStatuses、
 *       getAvailableStaff、reassignStaffTask、propagateScheduleDelay
 */
const {
  db, _, COLLECTIONS, SETTINGS_KEYS,
  ok, fail, logOperation,
  requireAdmin,
  formatDate, formatDateTimeLocal,
  filterStaffAvailableOnDate, normalizeAirlineName, normalizeAircraftType,
  getSettingValue,
  hasQualification,
} = require("../utils");
const cache = require("../cache");

const parseClockMinutes = (value, allowEndOfDay = false) => {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/) ||
    raw.match(/(?:T|\s)(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (allowEndOfDay && hour === 24 && minute === 0) return 1440;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
};

// ──────────────────────────────────────────────
// 更新航班实时状态（正常/延误/取消/已到达）
// ──────────────────────────────────────────────
const updateFlightRealtimeStatus = async (event) => {
  //  P0 修复: 标记航班延误/取消会影响所有下游排班和展示，必须 admin 鉴权
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { flightNo, scheduleDate, status, remark } = event.data || {};
  if (
    typeof flightNo !== "string" ||
    !/^[A-Za-z0-9_-]{1,20}$/.test(flightNo.trim()) ||
    typeof status !== "string"
  ) return fail("航班号或状态格式错误", 400);
  if (scheduleDate !== undefined && (
    typeof scheduleDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(scheduleDate)
  )) return fail("排班日期格式错误", 400);
  if (remark !== undefined && typeof remark !== "string") {
    return fail("备注格式错误", 400);
  }
  const safeRemark = (typeof remark === "string") ? remark.slice(0, 200) : "";

  const date = scheduleDate || formatDate(new Date());
  const VALID_STATUSES = ["ON_TIME", "DELAYED", "CANCELLED", "ARRIVED"];
  if (!VALID_STATUSES.includes(status)) return fail("无效状态值", 400);

  // 更新匹配的排班记录
  const cond = { flightNo, scheduleDate: date };
  const schedRes = await db.collection(COLLECTIONS.SCHEDULES).where(cond).limit(100).get();
  const schedules = schedRes.data || [];
  let updatedCount = 0;
  for (const s of schedules) {
    await db.collection(COLLECTIONS.SCHEDULES).doc(s._id).update({
      data: { realtimeStatus: status, realtimeRemark: safeRemark, updatedAt: new Date() },
    });
    updatedCount++;
  }

  const statusLabels = { ON_TIME: "正常", DELAYED: "延误", CANCELLED: "取消", ARRIVED: "已到达" };
  const detail = safeRemark
    ? `航班 ${flightNo} 状态更新为 ${statusLabels[status]}（${safeRemark}）`
    : `航班 ${flightNo} 状态更新为 ${statusLabels[status]}`;
  await logOperation("UPDATE_FLIGHT_STATUS", detail, { flightNo, scheduleDate: date, status, remark: safeRemark });
  cache.invalidate("SCHEDULE_TABLE");

  return ok({ updated: updatedCount, flightNo, status });
};

// ──────────────────────────────────────────────
// 获取指定日期的航班实时状态
// ──────────────────────────────────────────────
const getFlightRealtimeStatuses = async (event) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { scheduleDate } = event.data || {};
  if (scheduleDate !== undefined && (
    typeof scheduleDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(scheduleDate)
  )) return fail("排班日期格式错误", 400);
  const date = scheduleDate || formatDate(new Date());

  const schedRes = await db.collection(COLLECTIONS.SCHEDULES)
    .where({ scheduleDate: date, realtimeStatus: _.exists(true) })
    .limit(200)
    .get();
  const schedules = schedRes.data || [];

  // 合并按航班号去重
  const flightMap = {};
  for (const s of schedules) {
    if (!s.flightNo) continue;
    if (!flightMap[s.flightNo]) {
      flightMap[s.flightNo] = {
        flightNo: s.flightNo,
        airline: s.airline || "",
        aircraftType: s.aircraftType || "",
        engineModel: s.engineModel || "",
        aircraftRegistration: s.aircraftRegistration || "",
        estimatedArrivalTime: s.estimatedArrivalTime || s.arrivalTime || "",
        realtimeStatus: s.realtimeStatus || "ON_TIME",
        realtimeRemark: s.realtimeRemark || "",
        updatedAt: s.updatedAt || null,
      };
    }
  }

  return ok({ statuses: Object.values(flightMap), scheduleDate: date });
};

// ──────────────────────────────────────────────
// 查询空闲可用人员
// ──────────────────────────────────────────────
const getAvailableStaff = async (event) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const payload = event.data || {};
  const stringFields = ["scheduleDate", "startTime", "endTime", "airline", "aircraftType"];
  for (const field of stringFields) {
    if (payload[field] !== undefined && typeof payload[field] !== "string") {
      return fail(`${field} 参数类型错误`, 400);
    }
  }
  if (
    payload.excludeStaffIds !== undefined &&
    (
      !Array.isArray(payload.excludeStaffIds) ||
      !payload.excludeStaffIds.every((item) => typeof item === "string")
    )
  ) {
    return fail("excludeStaffIds 参数格式错误", 400);
  }

  const scheduleDate = String(payload.scheduleDate || "").trim();
  const startTime = String(payload.startTime || "").trim();
  const endTime = String(payload.endTime || "").trim();
  const airline = String(payload.airline || "").trim();
  const aircraftType = String(payload.aircraftType || "").trim();
  const excludeStaffIds = payload.excludeStaffIds || [];
  const date = scheduleDate || formatDate(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail("scheduleDate 日期格式错误", 400);
  const qStartMin = startTime ? parseClockMinutes(startTime) : 0;
  const qEndMin = endTime ? parseClockMinutes(endTime, true) : 1440;
  if (qStartMin === null) return fail("startTime 时间格式错误", 400);
  if (qEndMin === null) return fail("endTime 时间格式错误", 400);
  if (qStartMin >= qEndMin) return fail("结束时间必须晚于开始时间", 400);
  const [maxDailyWorkHours, minRestIntervalMinutes] = await Promise.all([
    getSettingValue(SETTINGS_KEYS.MAX_DAILY_WORK_HOURS, 12).then(Number),
    getSettingValue(SETTINGS_KEYS.MIN_REST_INTERVAL_MINUTES, 30).then(Number),
  ]);

  // 获取所有在职人员
  const staffRes = await db.collection(COLLECTIONS.STAFF)
    .where({ active: true })
    .limit(200)
    .get();
  const allStaff = await filterStaffAvailableOnDate(staffRes.data || [], date);

  // 获取当日所有排班，构建忙时映射
  const schedRes = await db.collection(COLLECTIONS.SCHEDULES)
    .where({ scheduleDate: date })
    .limit(500)
    .get();
  const schedules = schedRes.data || [];

  const busyRanges = {};
  for (const s of schedules) {
    if (s.recordStatus === "archived" || s.status === "CANCELLED") continue;
    const sid = s.staffId;
    if (!sid) continue;
    if (!busyRanges[sid]) busyRanges[sid] = [];

    // 尝试从排班记录中提取任务时间
    let taskStart = s._taskStart || "";
    let taskEnd = s._taskEnd || "";
    // 如果无 _taskStart/_taskEnd，用 departureTime 和 stayHours 估算
    if (!taskStart && s.departureTime) {
      taskStart = String(s.departureTime);
    }
    if (taskStart) {
      const startMatch = taskStart.match(/(\d{1,2}):(\d{2})/);
      const endMatch = taskEnd.match(/(\d{1,2}):(\d{2})/);
      const sMin = startMatch ? parseClockMinutes(`${startMatch[1]}:${startMatch[2]}`) : null;
      const eMin = endMatch
        ? parseClockMinutes(`${endMatch[1]}:${endMatch[2]}`, true)
        : (sMin !== null ? Math.min(1440, sMin + 120) : null);
      if (sMin !== null && eMin !== null) {
        busyRanges[sid].push({ startMin: sMin, endMin: eMin });
      }
    } else {
      busyRanges[sid].push({ startMin: 0, endMin: 1440 });
    }
  }

  const excludedSet = new Set(excludeStaffIds || []);
  const available = allStaff.filter(staff => {
    if (excludedSet.has(staff._id)) return false;
    if (!staff.active) return false;

    // 资质匹配
    if (
      airline &&
      airline !== "管理员发布" &&
      (
        !Array.isArray(staff.authorizedAirlines) ||
        !staff.authorizedAirlines.includes(normalizeAirlineName(airline))
      )
    ) return false;
    if (
      aircraftType &&
      (
        !Array.isArray(staff.authorizedAircraftTypes) ||
        !staff.authorizedAircraftTypes.includes(normalizeAircraftType(aircraftType))
      )
    ) return false;

    // 时段冲突检查
    const busy = busyRanges[staff._id] || [];
    for (const b of busy) {
      if (b.startMin < qEndMin && b.endMin > qStartMin) return false;
    }
    const existingMinutes = busy.reduce(
      (sum, range) => sum + Math.max(0, range.endMin - range.startMin),
      0
    );
    const proposedMinutes = qEndMin - qStartMin;
    if (existingMinutes + proposedMinutes > maxDailyWorkHours * 60) return false;
    for (const b of busy) {
      const gap = b.endMin <= qStartMin
        ? qStartMin - b.endMin
        : qEndMin <= b.startMin
        ? b.startMin - qEndMin
        : 0;
      if (gap > 0 && gap < minRestIntervalMinutes) return false;
    }
    return true;
  });

  return ok({
    available: available.map(s => ({
      staffId: s._id,
      employeeNo: s.employeeNo,
      name: s.name,
      groupId: s.groupId,
      roleType: s.roleType || "",
      authorizedAirlines: s.authorizedAirlines || [],
      authorizedAircraftTypes: s.authorizedAircraftTypes || [],
      compliancePassed: true,
      complianceText: "资质、请假、时段与工时校验通过",
    })),
    scheduleDate: date,
    queryTimeRange: { start: startTime || "00:00", end: endTime || "24:00" },
    complianceRules: { maxDailyWorkHours, minRestIntervalMinutes },
  });
};

// ──────────────────────────────────────────────
// 一键改班（管理员直接改班 + 审计留痕）
// ──────────────────────────────────────────────
const reassignStaffTask = async (event) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const payload = event.data || {};
  const stringFields = ["flightNo", "taskType", "scheduleDate", "newStaffId", "oldStaffId", "reason"];
  for (const field of stringFields) {
    if (payload[field] !== undefined && typeof payload[field] !== "string") {
      return fail(`${field} 参数类型错误`, 400);
    }
  }
  const { flightNo, taskType, scheduleDate, newStaffId, oldStaffId } = payload;
  const reason = String(payload.reason || "").trim().slice(0, 200);
  if (!flightNo || !newStaffId || !taskType) return fail("缺少必要参数", 400);
  const safeFlightNo = flightNo.trim();
  const safeNewStaffId = newStaffId.trim();
  const safeOldStaffId = String(oldStaffId || "").trim();
  const validDocumentId = (value) =>
    value.length >= 1 &&
    value.length <= 128 &&
    !/[\u0000-\u001f/\\]/.test(value);
  if (!/^[A-Za-z0-9_-]{1,20}$/.test(safeFlightNo)) return fail("航班号格式错误", 400);
  if (!validDocumentId(safeNewStaffId)) return fail("目标人员ID格式错误", 400);
  if (safeOldStaffId && !validDocumentId(safeOldStaffId)) {
    return fail("原人员ID格式错误", 400);
  }
  if (safeOldStaffId && safeOldStaffId === safeNewStaffId) return fail("新旧人员不能相同", 409);
  if (!["SERVICE", "RELEASE"].includes(taskType)) return fail("任务类型无效", 400);

  const date = scheduleDate || formatDate(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail("排班日期格式错误", 400);

  // 获取新旧人员信息
  const newStaffRes = await db.collection(COLLECTIONS.STAFF).doc(safeNewStaffId).get();
  const newStaff = newStaffRes.data || {};
  if (!newStaff || !newStaff._id) return fail("未找到目标人员", 404);
  if (newStaff.active === false) return fail("目标人员已停用", 409);
  if (
    taskType === "SERVICE" &&
    !["SERVICE", "BOTH"].includes(newStaff.roleType)
  ) return fail("目标人员不具备勤务角色", 409);
  if (
    taskType === "RELEASE" &&
    !["RELEASE", "BOTH"].includes(newStaff.roleType)
  ) return fail("目标人员不具备放行角色", 409);

  const availableOnDate = await filterStaffAvailableOnDate([newStaff], date);
  if (!availableOnDate.length) return fail("目标人员当天处于已批准请假区间", 409);

  // 查找匹配的排班记录
  const cond = { scheduleDate: date, flightNo: safeFlightNo, _taskType: taskType };
  if (safeOldStaffId) cond.staffId = safeOldStaffId;

  const schedRes = await db.collection(COLLECTIONS.SCHEDULES)
    .where(cond)
    .limit(10)
    .get();
  const schedules = schedRes.data || [];
  if (!schedules.length) return fail("未找到待改班的排班记录", 404);
  const targetSchedule = schedules[0];
  if (!hasQualification(
    newStaff,
    targetSchedule.airline || "",
    targetSchedule.aircraftType || ""
  )) return fail("目标人员缺少该航班所需资质", 409);

  const targetStart = new Date(targetSchedule._taskStart || "");
  const targetEnd = new Date(targetSchedule._taskEnd || "");
  const maxDailyWorkHours = Number(await getSettingValue(SETTINGS_KEYS.MAX_DAILY_WORK_HOURS, 12));
  const minRestIntervalMinutes = Number(await getSettingValue(SETTINGS_KEYS.MIN_REST_INTERVAL_MINUTES, 30));
  if (Number.isFinite(targetStart.getTime()) && Number.isFinite(targetEnd.getTime())) {
    const assignedResult = await db.collection(COLLECTIONS.SCHEDULES)
      .where({ staffId: safeNewStaffId, scheduleDate: date })
      .limit(100)
      .get();
    // 目标人员当日已有任务的分钟区间（与 getAvailableStaff 同一口径）
    const taskStartMin = parseClockMinutes(targetSchedule._taskStart) ?? 0;
    const taskEndMin = parseClockMinutes(targetSchedule._taskEnd, true) ?? 1440;
    const busyRanges = [];
    for (const schedule of assignedResult.data || []) {
      if (schedule.recordStatus === "archived" || schedule.status === "CANCELLED") continue;
      const startMin = parseClockMinutes(schedule._taskStart);
      if (startMin === null) continue;
      const endMin = parseClockMinutes(schedule._taskEnd, true);
      busyRanges.push({ startMin, endMin: endMin === null ? Math.min(1440, startMin + 120) : endMin });
    }
    // 时段重叠冲突
    const hasConflict = busyRanges.some((range) =>
      range.startMin < taskEndMin && range.endMin > taskStartMin
    );
    if (hasConflict) return fail("目标人员在该时段已有排班", 409);
    // 改班后单日总工时不能超过上限
    const existingMinutes = busyRanges.reduce(
      (sum, range) => sum + Math.max(0, range.endMin - range.startMin),
      0
    );
    const proposedMinutes = Math.max(0, taskEndMin - taskStartMin);
    if (existingMinutes + proposedMinutes > maxDailyWorkHours * 60) {
      return fail(`改班后目标人员当日总工时超过 ${maxDailyWorkHours} 小时上限`, 409);
    }
    // 与相邻任务的最小休息间隔
    for (const range of busyRanges) {
      const gap = range.endMin <= taskStartMin
        ? taskStartMin - range.endMin
        : taskEndMin <= range.startMin
          ? range.startMin - taskEndMin
          : 0;
      if (gap > 0 && gap < minRestIntervalMinutes) {
        return fail(`改班后目标人员与相邻任务休息间隔不足 ${minRestIntervalMinutes} 分钟`, 409);
      }
    }
  }

  const oldName = schedules[0].staffName || oldStaffId || "";
  for (const s of schedules) {
    await db.collection(COLLECTIONS.SCHEDULES).doc(s._id).update({
      data: {
        staffId: safeNewStaffId,
        staffName: newStaff.name || "",
        staffEmployeeNo: newStaff.employeeNo || "",
        groupId: newStaff.groupId || "",
        updatedAt: new Date(),
        source: "REALTIME_REASSIGN",
        reassignReason: reason || "",
        reassignedAt: new Date(),
        needsReassignment: false,
        leaveRequestId: "",
        reassignmentReason: "",
      },
    });
  }

  const detail = `${date} ${safeFlightNo} ${taskType === "SERVICE" ? "勤务" : "放行"} 由 ${oldName} 改班至 ${newStaff.name}（${newStaff.employeeNo}）`;
  const logDetail = reason ? `${detail}，原因：${reason}` : detail;
  await logOperation("REALTIME_REASSIGN", logDetail, {
    flightNo: safeFlightNo, taskType, scheduleDate: date,
    oldStaff: safeOldStaffId, oldStaffName: oldName,
    newStaff: safeNewStaffId, newStaffName: newStaff.name,
    reason,
  });
  cache.invalidate("SCHEDULE_TABLE");

  return ok({
    updated: schedules.length,
    oldStaff: { staffId: safeOldStaffId, name: oldName },
    newStaff: { staffId: safeNewStaffId, name: newStaff.name, employeeNo: newStaff.employeeNo },
    message: `已改班至 ${newStaff.name}`,
  });
};

// ──────────────────────────────────────────────
// 延误传播 - 自动调整该航班相关人员后续任务
// ──────────────────────────────────────────────
const propagateScheduleDelay = async (event) => {
  //  P0 修复: 批量偏移他人排班时间属于破坏性操作，必须 admin 鉴权
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { flightNo, scheduleDate, delayMinutes, reason } = event.data || {};
  if (
    typeof flightNo !== "string" ||
    !/^[A-Za-z0-9_-]{1,20}$/.test(flightNo.trim())
  ) return fail("航班号格式错误", 400);
  if (scheduleDate !== undefined && (
    typeof scheduleDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(scheduleDate)
  )) return fail("排班日期格式错误", 400);
  if (reason !== undefined && typeof reason !== "string") return fail("延误原因格式错误", 400);
  const safeDelayMinutes = Number(delayMinutes);
  const safeReason = (typeof reason === "string") ? reason.slice(0, 200) : "";
  if (
    !Number.isInteger(safeDelayMinutes) ||
    safeDelayMinutes < 1 ||
    safeDelayMinutes > 720
  ) {
    return fail("延误时长需在 1 ~ 720 分钟之间", 400);
  }

  const date = scheduleDate || formatDate(new Date());

  // 找到该航班的所有排班
  const schedRes = await db.collection(COLLECTIONS.SCHEDULES)
    .where({ flightNo, scheduleDate: date })
    .limit(50)
    .get();
  const schedules = schedRes.data || [];
  if (!schedules.length) return fail(`未找到航班 ${flightNo} 的排班记录`, 404);

  // 标记该航班为延误
  for (const s of schedules) {
    await db.collection(COLLECTIONS.SCHEDULES).doc(s._id).update({
      data: {
        realtimeStatus: "DELAYED",
        realtimeRemark: safeReason || `延误约 ${delayMinutes} 分钟`,
        delayMinutes: safeDelayMinutes,
        updatedAt: new Date(),
      },
    });
  }

  // 获取该航班涉及的人员
  const affectedStaffIds = [...new Set(schedules.map(s => s.staffId).filter(Boolean))];

  // 调整这些人员后续任务的时间（如果有 _taskStart/_taskEnd）
  const allDaySchedRes = await db.collection(COLLECTIONS.SCHEDULES)
    .where({
      scheduleDate: date,
      staffId: _.in(affectedStaffIds),
    })
    .limit(200)
    .get();
  const allDaySchedules = allDaySchedRes.data || [];

  // 按人员分组，按时间排序
  const staffSchedules = {};
  for (const s of allDaySchedules) {
    const sid = s.staffId;
    if (!sid) continue;
    if (!staffSchedules[sid]) staffSchedules[sid] = [];
    const startMatch = String(s._taskStart || s.departureTime || "").match(/(\d{1,2}):(\d{2})/);
    const sortKey = startMatch ? Number(startMatch[1]) * 60 + Number(startMatch[2]) : 0;
    staffSchedules[sid].push({ ...s, sortKey });
  }

  // 对受影响航班之后的任务进行偏移
  let adjustedCount = 0;
  for (const [sid, scheds] of Object.entries(staffSchedules)) {
    scheds.sort((a, b) => a.sortKey - b.sortKey);
    // 找到受影响航班在时间轴上的位置（按 sortKey 找最近的一个，避免重复航班号记录被当成"后续"）
    const affectedIdx = scheds.findIndex((s) => s.flightNo === flightNo);
    if (affectedIdx < 0) continue;
    // 从受影响航班之后的第一个任务开始, 调整所有后续任务
    for (let i = affectedIdx + 1; i < scheds.length; i++) {
      const s = scheds[i];

      // 调整该任务的 _taskStart/_taskEnd
      const updates = {};
      let needsUpdate = false;
      if (s._taskStart) {
        const st = new Date(s._taskStart);
        if (!isNaN(st.getTime())) {
          st.setMinutes(st.getMinutes() + safeDelayMinutes);
          // 用 utils.formatDateTimeLocal 输出本地时区字符串, 避免 toISOString 偏移
          updates._taskStart = formatDateTimeLocal(st);
          needsUpdate = true;
        }
      }
      if (s._taskEnd) {
        const et = new Date(s._taskEnd);
        if (!isNaN(et.getTime())) {
          et.setMinutes(et.getMinutes() + safeDelayMinutes);
          updates._taskEnd = formatDateTimeLocal(et);
          needsUpdate = true;
        }
      }
      if (needsUpdate) {
        updates.updatedAt = new Date();
        await db.collection(COLLECTIONS.SCHEDULES).doc(s._id).update({ data: updates });
        adjustedCount++;
      }
    }
  }

  const detail = `航班 ${flightNo} 延误 ${safeDelayMinutes} 分钟${safeReason ? "（" + safeReason + "）" : ""}，自动调整 ${adjustedCount} 条后续任务`;
  await logOperation("PROPAGATE_DELAY", detail, {
    flightNo, scheduleDate: date, delayMinutes: safeDelayMinutes, reason: safeReason, adjustedCount,
  });
  cache.invalidate("SCHEDULE_TABLE");

  return ok({
    flightNo,
    delayMinutes: safeDelayMinutes,
    affectedStaffCount: affectedStaffIds.length,
    adjustedTaskCount: adjustedCount,
    message: `已处理延误，影响 ${adjustedCount} 条后续任务`,
  });
};

// ──────────────────────────────────────────────
// 路由表
// ──────────────────────────────────────────────
module.exports = {
  updateFlightRealtimeStatus,
  getFlightRealtimeStatuses,
  getAvailableStaff,
  reassignStaffTask,
  propagateScheduleDelay,
};
