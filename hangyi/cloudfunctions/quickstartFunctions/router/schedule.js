/**
 * schedule.js - 排班表、智能排班、发布、合规预检、历史、统计
 * 涵盖：getStaffScheduleTable、getMySchedules、getServiceScheduleTable、
 *       publishScheduleEdits、preflightComplianceCheck、smartSchedule、smartScheduleMultiDay、
 *       smartScheduleSingle、smartScheduleWithRoles、publishServiceSchedule、completeSchedule、
 *       getScheduleHistory、getScheduleStatusOverview、getScheduleStatistics、
 *       importScheduleFromTSV、optimizeStaffSchedule、exportSchedule
 */
const cloud = require("wx-server-sdk");
const xlsx = require("node-xlsx");
const {
  db, _, COLLECTIONS, SETTINGS_KEYS,
  ok, fail, logOperation, callHangyiServiceChecked,
  formatDate, formatDateTimeLocal, getShiftHours, getShiftCode,
  normalizeAirlineName, normalizeAircraftType,
  hasQualification, hashToRole,
  getOpenContext, getSettingValue, requireAdmin, requireActiveStaff,
  getApprovedLeaveEmployeeNos, filterStaffAvailableOnDate,
} = require("../utils");
const cache = require("../cache");
const COMPLETION_GRACE_DAYS = 3;

const scheduleVersionDocId = (scheduleDate) => `schedule_version_${scheduleDate}`;

// 云开发 doc(id).get() 在文档不存在时会抛错（空集合/未初始化），
// 统一捕获后按“无版本”处理，保证版本化发布在首次使用前不炸。
const safeGetVersionDoc = async (scheduleDate) => {
  try {
    const result = await db.collection(COLLECTIONS.SCHEDULE_VERSIONS)
      .doc(scheduleVersionDocId(scheduleDate))
      .get();
    return result;
  } catch (error) {
    return { data: null };
  }
};

const getSchedulePublicationState = async (scheduleDate, ensure = false) => {
  const result = await safeGetVersionDoc(scheduleDate);
  if (result.data) {
    return {
      version: Number(result.data.version) || 0,
      activeBatchId: typeof result.data.activeBatchId === "string" ? result.data.activeBatchId : "",
    };
  }
  if (ensure) {
    await db.collection(COLLECTIONS.SCHEDULE_VERSIONS)
      .doc(scheduleVersionDocId(scheduleDate))
      .set({
        data: {
          scheduleDate,
          version: 0,
          activeBatchId: "",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
  }
  return { version: 0, activeBatchId: "" };
};

// activeBatchId 是日期排班的唯一可见指针。先完整写入新批次，再用这一次 CAS
// 切换指针；进程在切换前中断时，新批次不可见，切换后读取端也不会混入旧批次。
// 首次版本化发布前 activeBatchId 为空，读取端兼容历史 active 记录。
const activateSchedulePublicationBatch = async (scheduleDate, expectedVersion, activeBatchId) => {
  const existing = await safeGetVersionDoc(scheduleDate);
  const currentState = existing.data
    ? {
      version: Number(existing.data.version) || 0,
      activeBatchId: typeof existing.data.activeBatchId === "string" ? existing.data.activeBatchId : "",
    }
    : { version: 0, activeBatchId: "" };
  if (!existing.data) {
    return { ok: false, currentVersion: 0, missingVersion: true };
  }
  const result = await db.collection(COLLECTIONS.SCHEDULE_VERSIONS)
    .where({ scheduleDate, version: expectedVersion })
    .update({
      data: {
        version: expectedVersion + 1,
        activeBatchId,
        updatedAt: new Date(),
      },
    });
  const updated = Number(result && result.stats && result.stats.updated || 0);
  return {
    ok: updated === 1,
    currentVersion: currentState.version,
    nextVersion: expectedVersion + 1,
  };
};

const isCurrentPublicationRecord = (schedule, publicationState) => {
  if (!schedule || schedule.recordStatus === "archived" || schedule.recordStatus === "staged") return false;
  // 勤务/放行任务使用独立的发布链路，不参与管理员班次表的版本快照。
  if (schedule._taskType && !schedule.publishBatchId) return true;
  if (!publicationState.activeBatchId) {
    return !schedule.publishBatchId;
  }
  return schedule.publishBatchId === publicationState.activeBatchId &&
    Number(schedule.publicationVersion) === publicationState.version;
};

// ═══════════════════════════════════════════════
// 排班表（标准 + 导出）
// ═══════════════════════════════════════════════
const getStaffScheduleTable = async (event) => {
  const guard = await requireActiveStaff();
  if (!guard.ok) return guard.response;
  const rawDate = (event.data || {}).scheduleDate;
  const targetDate = (typeof rawDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawDate))
    ? rawDate
    : formatDate(new Date());

  const staffRes = guard.staff.isAdmin === true
    ? await db
      .collection(COLLECTIONS.STAFF)
      .where({ isTestAdmin: _.neq(true) })
      .orderBy("employeeNo", "asc")
      .limit(100)
      .get()
    : await db
      .collection(COLLECTIONS.STAFF)
      .where({ _id: guard.staff._id })
      .limit(1)
      .get();
  const staffs = staffRes.data || [];

  const publicationState = await getSchedulePublicationState(targetDate, guard.staff.isAdmin === true);
  const publicationVersion = guard.staff.isAdmin === true ? publicationState.version : 0;
  if (!staffs.length) {
    return ok({ scheduleDate: targetDate, publicationVersion, rows: [] });
  }

  const staffIds = staffs.map((item) => item._id);
  const schedulesRes = await db
    .collection(COLLECTIONS.SCHEDULES)
    .where({
      staffId: _.in(staffIds),
      scheduleDate: targetDate,
    })
    .orderBy("createdAt", "desc")
    .limit(200)
    .get();

  const schedules = (schedulesRes.data || []).filter((item) =>
    isCurrentPublicationRecord(item, publicationState)
  );
  const approvedLeaveEmployeeNos = await getApprovedLeaveEmployeeNos(targetDate);
  const maxDailyWorkHours = Number(
    await getSettingValue(SETTINGS_KEYS.MAX_DAILY_WORK_HOURS, 12)
  );
  const scheduleMap = new Map();
  const workedHoursMap = new Map();
  schedules.forEach((item) => {
    if (!scheduleMap.has(item.staffId)) {
      scheduleMap.set(item.staffId, item);
    }
    workedHoursMap.set(item.staffId, (workedHoursMap.get(item.staffId) || 0) + getShiftHours(item.shiftCode));
  });

  const flightIds = Array.from(new Set(schedules.map((item) => item.flightId).filter(Boolean)));
  const flightMap = new Map();
  for (let i = 0; i < flightIds.length; i += 50) {
    const batchIds = flightIds.slice(i, i + 50);
    const flightRes = await db
      .collection(COLLECTIONS.FLIGHTS)
      .where({ _id: _.in(batchIds) })
      .limit(100)
      .get();
    (flightRes.data || []).forEach((flight) => {
      flightMap.set(flight._id, flight);
    });
  }

  const rows = staffs.map((staff, index) => {
    const schedule = scheduleMap.get(staff._id);
    const flight = schedule && schedule.flightId ? flightMap.get(schedule.flightId) : null;
    const onApprovedLeave = approvedLeaveEmployeeNos.has(staff.employeeNo);
    const onLeave = onApprovedLeave || staff.active === false;
    const scheduleConflict = Boolean(schedule && onApprovedLeave);
    const workedHours = workedHoursMap.get(staff._id) || 0;
    const airline = schedule ? schedule.airline || (flight && flight.airline) || "" : "";
    const aircraftType = schedule
      ? schedule.aircraftType || (flight && flight.aircraftType) || ""
      : "";
    const qualificationMismatch = Boolean(
      schedule &&
      airline &&
      airline !== "管理员发布" &&
      aircraftType &&
      !hasQualification(staff, airline, aircraftType)
    );
    const complianceIssues = [];
    if (scheduleConflict) complianceIssues.push("已批准请假与排班冲突");
    if (qualificationMismatch) complianceIssues.push("航司授权或机型资质不匹配");
    if (workedHours > maxDailyWorkHours) {
      complianceIssues.push(`当日工时超过 ${maxDailyWorkHours} 小时`);
    }
    const status = scheduleConflict
      ? "LEAVE_CONFLICT"
      : onLeave
      ? "ON_LEAVE"
      : schedule
      ? schedule.status
      : "UNASSIGNED";
    const stayHours = schedule
      ? schedule.stayHours !== undefined && schedule.stayHours !== null
        ? schedule.stayHours
        : flight && flight.stayHours !== undefined && flight.stayHours !== null
        ? flight.stayHours
        : ""
      : "";

    return {
      index: index + 1,
      staffId: staff._id,
      employeeNo: staff.employeeNo,
      name: staff.name,
      groupId: staff.groupId,
      roleType: staff.roleType || hashToRole(staff.employeeNo || staff._id),
      _taskType: schedule
        ? schedule._taskType || schedule.taskType || "SERVICE"
        : "SERVICE",
      scheduleDate: targetDate,
      aircraftQualifications: (staff.authorizedAircraftTypes || []).join("/") || "-",
      workedHours,
      workedHoursText: `${workedHours}小时`,
      onLeave,
      scheduleConflict,
      needsReassignment: Boolean(schedule && schedule.needsReassignment),
      leaveText: onLeave ? "是" : "否",
      shiftCode: schedule ? schedule.shiftCode : "",
      flightNo: schedule ? schedule.flightNo : "",
      inboundFlightNo: schedule
        ? schedule.inboundFlightNo || (flight && flight.inboundFlightNo) || ""
        : "",
      outboundFlightNo: schedule
        ? schedule.outboundFlightNo || (flight && flight.outboundFlightNo) || schedule.flightNo || ""
        : "",
      airline,
      aircraftRegistration: schedule
        ? schedule.aircraftRegistration || (flight && flight.aircraftRegistration) || ""
        : "",
      aircraftType,
      engineModel: schedule
        ? schedule.engineModel || (flight && flight.engineModel) || ""
        : "",
      scheduledArrivalTime: schedule
        ? schedule.scheduledArrivalTime || (flight && flight.scheduledArrivalTime) || ""
        : "",
      estimatedArrivalTime: schedule
        ? schedule.estimatedArrivalTime || (flight && flight.estimatedArrivalTime) || ""
        : "",
      arrivalTime: schedule
        ? schedule.estimatedArrivalTime ||
          (flight && flight.estimatedArrivalTime) ||
          schedule.arrivalTime ||
          (flight && flight.arrivalTime) ||
          ""
        : "",
      departureTime: schedule
        ? schedule.departureTime || (flight && flight.departureTime) || ""
        : "",
      stayHours,
      status,
      statusText: (() => {
        const map = {
          ASSIGNED: "已排班",
          SWAPPED: "已互换",
          COMPLETED: "已完成",
          UNASSIGNED: "未排班",
          ON_LEAVE: "休假",
          LEAVE_CONFLICT: "休假冲突",
        };
        return map[status] || status || "未知";
      })(),
      scheduleId: schedule ? schedule._id : "",
      flightId: schedule ? schedule.flightId || "" : "",
      realtimeStatus: schedule ? schedule.realtimeStatus || "" : "",
      qualificationMismatch,
      compliancePassed: complianceIssues.length === 0,
      complianceIssues,
      complianceText: complianceIssues.length ? complianceIssues.join("；") : "系统校验通过",
    };
  });

  return ok({
    scheduleDate: targetDate,
    total: rows.length,
    publicationVersion,
    complianceIssueCount: rows.filter((row) => !row.compliancePassed).length,
    rows,
  });
};

// 导出排班表（Excel）
const exportSchedule = async (event) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { scheduleDate, format = "xlsx", exportMode = "STANDARD" } = (event.data || {});
  if (scheduleDate !== undefined && (
    typeof scheduleDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(scheduleDate)
  )) return fail("排班日期格式错误", 400);
  if (format !== "xlsx") return fail("仅支持 xlsx 导出", 400);
  if (!["STANDARD", "PRINT"].includes(exportMode)) return fail("导出模式无效", 400);
  const targetDate = scheduleDate || formatDate(new Date());

  // 复用 getStaffScheduleTable 的数据逻辑
  const tableResult = await getStaffScheduleTable({ data: { scheduleDate: targetDate } });
  const rows = (tableResult.data || {}).rows || [];
  if (!rows.length) return fail("该日期没有排班数据", 404);

  // 构建 Excel 表头和数据
  const shiftLabelMap = { MORNING: "早班", AFTERNOON: "午班", NIGHT: "晚班", "": "未排班" };
  const roleLabelMap = { SERVICE: "勤务", RELEASE: "放行", BOTH: "双资质" };

  const headers = [
    "序号", "工号", "姓名", "班组", "角色", "资质",
    "班次", "进港航班", "出港航班", "航司", "机号", "机型", "发动机型号",
    "计划到达", "预计到达", "计划离港", "停留", "工时", "状态", "合规校验",
  ];

  const sheetData = rows.map(r => [
    r.index,
    r.employeeNo,
    r.name,
    r.groupId || "-",
    roleLabelMap[r.roleType] || r.roleType || "-",
    r.aircraftQualifications || "-",
    r.shiftText || shiftLabelMap[r.shiftCode] || "未排班",
    r.inboundFlightNo || r.flightNo || "-",
    r.outboundFlightNo || r.flightNo || "-",
    r.airline || "-",
    r.aircraftRegistration || "-",
    r.aircraftType || "-",
    r.engineModel || "-",
    r.scheduledArrivalTime || r.arrivalTime || "-",
    r.estimatedArrivalTime || "-",
    r.departureTimeText || r.departureTime || "-",
    r.stayHours || "-",
    r.workedHoursText || `${r.workedHours || 0}小时`,
    r.statusText || "-",
    r.complianceText || "-",
  ]);

  const title = `航翼排班总表 ${targetDate}`;
  const printData = exportMode === "PRINT"
    ? [
      [title],
      [`生成时间：${new Date().toLocaleString("zh-CN", { hour12: false })}`, "", "", `人员：${rows.length}`],
      headers,
      ...sheetData,
    ]
    : [headers, ...sheetData];
  const sheetOptions = {
    "!cols": [
      { wch: 6 }, { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 9 }, { wch: 24 },
      { wch: 9 }, { wch: 13 }, { wch: 13 }, { wch: 16 }, { wch: 12 }, { wch: 10 },
      { wch: 16 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 9 }, { wch: 9 },
      { wch: 12 }, { wch: 32 },
    ],
    "!autofilter": exportMode === "PRINT"
      ? { ref: `A3:T${Math.max(3, rows.length + 3)}` }
      : { ref: `A1:T${Math.max(1, rows.length + 1)}` },
  };
  if (exportMode === "PRINT") {
    sheetOptions["!merges"] = [
      { s: { c: 0, r: 0 }, e: { c: 19, r: 0 } },
    ];
  }
  const buffer = xlsx.build([
    { name: exportMode === "PRINT" ? "打印总表" : `排班表${targetDate}`, data: printData },
  ], {
    sheetOptions,
  });

  // 上传到云存储
  const filePrefix = exportMode === "PRINT" ? "schedule_print" : "schedule";
  const cloudPath = `exports/${filePrefix}_${targetDate}_${Date.now()}.xlsx`;
  const uploadResult = await cloud.uploadFile({
    cloudPath,
    fileContent: buffer,
  });

  await logOperation(
    "EXPORT_SCHEDULE",
    `${guard.staff.name}（${guard.staff.employeeNo}）导出 ${targetDate} ${exportMode === "PRINT" ? "打印排班总表" : "排班表"}`,
    {
      type: "scheduleExport",
      scheduleDate: targetDate,
      exportMode,
      rowCount: rows.length,
      cloudPath,
    }
  );

  return ok({
    fileID: uploadResult.fileID,
    fileName: `${exportMode === "PRINT" ? "排班总表_打印版" : "排班表"}_${targetDate}.xlsx`,
    rowCount: rows.length,
    exportMode,
    printReady: exportMode === "PRINT",
  });
};

// ═══════════════════════════════════════════════
// 我的排班（个人视角）
// ═══════════════════════════════════════════════
const getMySchedules = async () => {
  const { openid } = getOpenContext();
  const my = await db
    .collection(COLLECTIONS.STAFF)
    .where({ openid })
    .limit(1)
    .get();

  if (!my.data.length) return fail("当前微信号未绑定工号", 404);

  const staff = my.data[0];
  const today = formatDate(new Date());
  const completionStartDate = formatDate(new Date(Date.now() - COMPLETION_GRACE_DAYS * 24 * 60 * 60 * 1000));
  const result = await db
    .collection(COLLECTIONS.SCHEDULES)
    .where({
      staffId: staff._id,
      scheduleDate: _.gte(completionStartDate),
    })
    .orderBy("scheduleDate", "asc")
    .limit(20)
    .get();
  const publicationStates = new Map();
  const activeSchedules = [];
  for (const item of result.data || []) {
    if (!publicationStates.has(item.scheduleDate)) {
      publicationStates.set(item.scheduleDate, await getSchedulePublicationState(item.scheduleDate, false));
    }
    if (isCurrentPublicationRecord(item, publicationStates.get(item.scheduleDate))) {
      activeSchedules.push(item);
    }
  }

  return ok({
    staff: {
      staffId: staff._id,
      employeeNo: staff.employeeNo,
      name: staff.name,
      groupId: staff.groupId,
    },
    schedules: activeSchedules,
  });
};

// ═══════════════════════════════════════════════
// 管理员发布排班
// ═══════════════════════════════════════════════
const validateAdminPublishEdits = async (targetDate, edits) => {
  if (!edits.length) return { response: fail("没有可发布的编辑内容", 400) };
  if (edits.length > 200) return { response: fail("单次最多发布 200 条编辑", 400) };
  if (!edits.every((item) => item && typeof item.staffId === "string" && typeof item.shiftCode === "string")) {
    return { response: fail("编辑内容格式错误", 400) };
  }
  const staffIds = edits.map((item) => item.staffId.trim());
  if (staffIds.some((item) => !item) || new Set(staffIds).size !== staffIds.length) {
    return { response: fail("同一员工只能提交一条排班编辑", 400) };
  }
  const validShiftCodes = new Set(["", "MORNING", "AFTERNOON", "NIGHT"]);
  const normalized = edits.map((item) => ({
    staffId: item.staffId.trim(),
    shiftCode: item.shiftCode.trim().toUpperCase(),
    _taskType: typeof item._taskType === "string" ? item._taskType : "",
  }));
  if (normalized.some((item) => !validShiftCodes.has(item.shiftCode))) {
    return { response: fail("班次编码无效", 400) };
  }
  const staffRes = await db.collection(COLLECTIONS.STAFF)
    .where({ _id: _.in(staffIds) })
    .limit(200)
    .get();
  const staffMap = new Map((staffRes.data || []).map((item) => [item._id, item]));
  if (staffMap.size !== staffIds.length) return { response: fail("编辑人员不存在", 409) };
  const [availableStaff, maxDailyWorkHours] = await Promise.all([
    filterStaffAvailableOnDate(Array.from(staffMap.values()).filter((staff) => staff.active !== false), targetDate),
    getSettingValue(SETTINGS_KEYS.MAX_DAILY_WORK_HOURS, 12),
  ]);
  const availableIds = new Set(availableStaff.map((staff) => staff._id));
  const violations = [];
  normalized.forEach((item) => {
    if (!item.shiftCode) return;
    const staff = staffMap.get(item.staffId);
    if (!availableIds.has(item.staffId)) {
      violations.push({
        type: "UNAVAILABLE_STAFF",
        severity: "HIGH",
        staffId: item.staffId,
        staffName: staff.name || staff.employeeNo || "员工",
        description: `${staff.name || staff.employeeNo || "员工"} 已停用或处于批准请假区间`,
      });
      return;
    }
    const hours = getShiftHours(item.shiftCode);
    if (hours > Number(maxDailyWorkHours)) {
      violations.push({
        type: "EXCEED_WORK_HOURS",
        severity: "HIGH",
        staffId: item.staffId,
        staffName: staff.name || staff.employeeNo || "员工",
        description: `${staff.name || staff.employeeNo || "员工"} 当日班次工时超过 ${maxDailyWorkHours} 小时`,
      });
    }
  });
  return { staffMap, normalized, violations };
};

const publishScheduleEdits = async (event) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const payload = event.data || {};
  const rawDate = payload.scheduleDate;
  if (typeof rawDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    return fail("排班日期格式错误", 400);
  }
  const targetDate = rawDate;
  if (!Number.isInteger(payload.expectedVersion) || payload.expectedVersion < 0) {
    return fail("排班版本无效，请刷新排班表后重试", 409);
  }
  const validation = await validateAdminPublishEdits(targetDate, Array.isArray(payload.edits) ? payload.edits : []);
  if (validation.response) return validation.response;
  if (validation.violations.length) {
    return fail("存在高危合规冲突，不能发布", 409, { violations: validation.violations });
  }
  const { staffMap, normalized: edits } = validation;
  const timeMap = {
    MORNING: "08:00:00",
    AFTERNOON: "13:00:00",
    NIGHT: "20:00:00",
  };
  const versionDoc = await safeGetVersionDoc(targetDate);
  if (!versionDoc.data) {
    return fail("排班版本尚未初始化，请先刷新排班表", 409, { missingVersion: true });
  }
  const currentPublicationState = {
    version: Number(versionDoc.data.version) || 0,
    activeBatchId: typeof versionDoc.data.activeBatchId === "string" ? versionDoc.data.activeBatchId : "",
  };
  if (currentPublicationState.version !== payload.expectedVersion) {
    return fail("排班已被其他管理员更新，请刷新后重新编辑", 409, {
      currentVersion: currentPublicationState.version,
    });
  }
  const existingRes = await db.collection(COLLECTIONS.SCHEDULES)
    .where({ scheduleDate: targetDate })
    .orderBy("createdAt", "desc")
    .limit(500)
    .get();
  const existingByStaffId = new Map();
  (existingRes.data || []).forEach((schedule) => {
    if (
      schedule.staffId &&
      !schedule._taskType &&
      !existingByStaffId.has(schedule.staffId) &&
      isCurrentPublicationRecord(schedule, currentPublicationState)
    ) {
      existingByStaffId.set(schedule.staffId, schedule);
    }
  });
  const nextVersion = payload.expectedVersion + 1;
  const publishBatchId = `${targetDate}:${nextVersion}:${Date.now()}`;
  const editMap = new Map(edits.map((item) => [item.staffId, item]));
  const recordsToPublish = [];
  existingByStaffId.forEach((schedule, staffId) => {
    const edit = editMap.get(staffId);
    if (edit && !edit.shiftCode) return;
    if (edit) return;
    const { _id, recordStatus, archivedAt, publishBatchId: oldBatchId, publicationVersion: oldVersion, ...base } = schedule;
    recordsToPublish.push({
      ...base,
      recordStatus: "active",
      publishBatchId,
      publicationVersion: nextVersion,
    });
  });
  edits.forEach((item) => {
    if (!item.shiftCode) return;
    const staff = staffMap.get(item.staffId);
    recordsToPublish.push({
      flightId: `ADMIN_${targetDate}`,
      flightNo: `ADMIN-${targetDate.replace(/-/g, "")}`,
      airline: "管理员发布",
      aircraftType: "",
      departureTime: `${targetDate}T${timeMap[item.shiftCode]}`,
      scheduleDate: targetDate,
      shiftCode: item.shiftCode,
      staffId: item.staffId,
      _taskType: item._taskType === "RELEASE" ? "RELEASE" : "SERVICE",
      staffName: staff.name,
      staffEmployeeNo: staff.employeeNo,
      groupId: staff.groupId,
      openid: staff.openid || "",
      status: "ASSIGNED",
      source: "ADMIN",
      recordStatus: "active",
      publishBatchId,
      publicationVersion: nextVersion,
    });
  });
  const publishedCount = edits.length;
  const publishedSchedules = [];
  const batchScheduleIds = [];
  const now = new Date();
  try {
    // 所有新记录先写入一个尚未激活的批次。读取端只认 version 文档指向的
    // activeBatchId，因此写入过程或进程异常不会向员工暴露半份排班。
    for (const schedule of recordsToPublish) {
      const baseData = { ...schedule, updatedAt: now };
      const addResult = await db.collection(COLLECTIONS.SCHEDULES).add({
        data: { ...baseData, createdAt: now },
      });
      batchScheduleIds.push(addResult._id);
      publishedSchedules.push(baseData);
    }
  } catch (error) {
    await Promise.allSettled(batchScheduleIds.map((scheduleId) =>
      db.collection(COLLECTIONS.SCHEDULES).doc(scheduleId).remove()
    ));
    return fail("发布失败，未切换排班版本，请重试", 500);
  }

  const publishClaim = await activateSchedulePublicationBatch(
    targetDate,
    payload.expectedVersion,
    publishBatchId
  );
  if (!publishClaim.ok) {
    await Promise.allSettled(batchScheduleIds.map((scheduleId) =>
      db.collection(COLLECTIONS.SCHEDULES).doc(scheduleId).remove()
    ));
    return fail("排班已被其他管理员更新，请刷新后重新编辑", 409, {
      currentVersion: publishClaim.currentVersion,
      missingVersion: publishClaim.missingVersion === true,
    });
  }

  // 实时同步到 Hangyi
  const syncEnabled = String(await getSettingValue(SETTINGS_KEYS.HANGYI_SYNC_ENABLED, "false")) === "true";
  if (syncEnabled && publishedSchedules.length > 0) {
    callHangyiServiceChecked("/api/sync/schedules", publishedSchedules.map((item) => ({
      ...item,
      recordStatus: "active",
    })))
      .catch((error) => console.error("Hangyi同步失败:", error.message || "unknown"));
  }

  await logOperation("PUBLISH_SCHEDULE", `发布了 ${targetDate} 的排班，共 ${publishedCount} 人`, { type: "schedule", scheduleDate: targetDate, publishedCount });
  return ok({ scheduleDate: targetDate, publishedCount, publicationVersion: publishClaim.nextVersion }, "发布成功");
};

// ═══════════════════════════════════════════════
// 排班合规预检
// ═══════════════════════════════════════════════
const preflightComplianceCheck = async (event) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { scheduleDate, edits } = event.data || {};
  if (
    typeof scheduleDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(scheduleDate)
  ) return fail("排班日期格式错误", 400);
  if (!edits || !Array.isArray(edits)) return fail("参数不足");
  if (edits.length > 200) return fail("单次最多检查 200 条编辑", 400);
  const violations = [];
  // 1. 读取配置
  const fatigueMaxDays = Number(await getSettingValue(SETTINGS_KEYS.FATIGUE_MAX_CONTINUOUS_DAYS, 3));
  const maxHours = Number(await getSettingValue(SETTINGS_KEYS.MAX_DAILY_WORK_HOURS, 12));
  // 2. 读取基础数据
  const [staffRes, schedRes] = await Promise.all([
    db.collection(COLLECTIONS.STAFF).limit(200).get(),
    db.collection(COLLECTIONS.SCHEDULES).where({ scheduleDate }).limit(500).get(),
  ]);
  const staffMap = {};   // key = employeeNo
  const staffIdMap = {}; // key = _id
  (staffRes.data || []).forEach(s => { staffMap[s.employeeNo] = s; staffIdMap[s._id] = s; });
  const existingSchedules = schedRes.data || [];
  // 3. 合并编辑和现有排班
  const finalSchedules = [];
  const editedEmpNos = new Set();
  for (const edit of edits) {
    editedEmpNos.add(edit.employeeNo);
    finalSchedules.push({
      staffId: edit.staffId,
      employeeNo: edit.employeeNo,
      flightNo: edit.flightNo || "",
      shiftCode: edit.shiftCode,
      _taskType: edit._taskType === "RELEASE" ? "RELEASE" : "SERVICE",
    });
  }
  for (const s of existingSchedules) {
    if (!editedEmpNos.has(s.staffEmployeeNo || s.employeeNo)) {
      finalSchedules.push(s);
    }
  }
  // 4. 检查：同一人同班次多排班
  const shiftTimeMap = { MORNING: "08:00-12:00", AFTERNOON: "13:00-18:00", NIGHT: "19:00-23:00" };
  const staffShiftMap = {};
  for (const s of finalSchedules) {
    if (!s.shiftCode) continue;
    const empNo = s.staffEmployeeNo || s.employeeNo;
    const key = empNo + "_" + s.shiftCode;
    if (staffShiftMap[key]) {
      const staff = staffMap[empNo];
      violations.push({
        type: "CONCURRENT_SCHEDULE", severity: "HIGH",
        staffId: s.staffId, staffName: staff ? staff.name : empNo,
        description: `${staff ? staff.name : empNo} 在 ${s.shiftCode} (${shiftTimeMap[s.shiftCode] || ""}) 被多次排班`,
        suggestion: "移除重复排班",
      });
    }
    staffShiftMap[key] = true;
  }
  // 5. 读取近7天排班用于连续/疲劳检查
  const today = new Date(scheduleDate);
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const dateStr = formatDate(sevenDaysAgo);
  const recentSchedRes = await db.collection(COLLECTIONS.SCHEDULES)
    .where({ scheduleDate: _.gte(dateStr).lte(scheduleDate) })
    .limit(2000).get();
  const recentScheds = recentSchedRes.data || [];
  // 按员工分组
  const empScheds = {};
  for (const s of recentScheds) {
    const empNo = s.staffEmployeeNo || s.employeeNo;
    if (!empNo) continue;
    if (!empScheds[empNo]) empScheds[empNo] = [];
    empScheds[empNo].push(s);
  }
  // 检查连续工作
  for (const [empNo, scheds] of Object.entries(empScheds)) {
    const dates = [...new Set(scheds.map(s => s.scheduleDate))].sort();
    let consecutive = 0;
    for (let i = dates.length - 1; i >= 0; i--) {
      const expected = new Date(today);
      expected.setDate(expected.getDate() - (dates.length - 1 - i));
      if (dates[i] === formatDate(expected)) consecutive++;
      else break;
    }
    if (consecutive > fatigueMaxDays) {
      const staff = staffMap[empNo];
      violations.push({
        type: "EXCEED_CONTINUOUS", severity: "MEDIUM",
        staffId: staff ? staff._id : empNo, staffName: staff ? staff.name : empNo,
        description: `${staff ? staff.name : empNo} 连续工作 ${consecutive} 天，超过阈值 ${fatigueMaxDays} 天`,
        suggestion: "安排休息一天",
      });
    }
  }
  // 检查工时（当天排班数量简单估算）
  for (const s of finalSchedules) {
    if (!s.flightNo) continue;
    const empNo = s.staffEmployeeNo || s.employeeNo;
    const staff = staffMap[empNo];
    const count = finalSchedules.filter(x => (x.staffEmployeeNo || x.employeeNo) === empNo).length;
    // P1 修复: 估算工时按 8h/班次 (getShiftHours), 原 4h 是错误值
    if (count * 8 > maxHours) {
      violations.push({
        type: "EXCEED_WORK_HOURS", severity: "MEDIUM",
        staffId: s.staffId, staffName: staff ? staff.name : empNo,
        description: `${staff ? staff.name : empNo} 当日排班 ${count} 个班次，估算工时 ${count * 8}h，超过上限 ${maxHours}h`,
        suggestion: "减少该人员排班任务",
      });
    }
  }
  // 检查同航班同组
  const flightGroupMap = {};
  for (const s of finalSchedules) {
    if (!s.flightNo) continue;
    const empNo = s.staffEmployeeNo || s.employeeNo;
    const staff = staffMap[empNo];
    if (!staff) continue;
    const key = s.flightNo + "_" + staff.groupId;
    if (!flightGroupMap[key]) flightGroupMap[key] = [];
    flightGroupMap[key].push(staff);
  }
  for (const [key, staffList] of Object.entries(flightGroupMap)) {
    if (staffList.length >= 2) {
      const [flightNo, groupId] = key.split("_");
      violations.push({
        type: "SAME_GROUP_CONCENTRATION", severity: "LOW",
        staffId: "", staffName: staffList.map(s => s.name).join(", "),
        description: `${flightNo} 有 ${staffList.length} 名 ${groupId} 人员同时排班`,
        suggestion: "适当分散班组",
      });
    }
  }
  const highCount = violations.filter(v => v.severity === "HIGH").length;
  const mediumCount = violations.filter(v => v.severity === "MEDIUM").length;
  return ok({
    passed: violations.length === 0,
    violations,
    summary: { totalViolations: violations.length, highCount, mediumCount },
  });
};

// ═══════════════════════════════════════════════
// 智能排班 - 疲劳优化（替换超标员工）
// ═══════════════════════════════════════════════
const optimizeStaffSchedule = async (event) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { scheduleDate, staffs } = event.data || {};
  if (
    typeof scheduleDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(scheduleDate)
  ) return fail("排班日期格式错误", 400);
  if (!Array.isArray(staffs) || !staffs.length) return fail("缺少人员数据", 400);
  if (staffs.length > 200) return fail("单次最多优化 200 人", 400);

  const fatigueMaxContinuousDays = Number(
    await getSettingValue(SETTINGS_KEYS.FATIGUE_MAX_CONTINUOUS_DAYS, 3)
  );

  // 1. 获取全部在职人员
  const allStaffRes = await db
    .collection(COLLECTIONS.STAFF)
    .where({ active: true })
    .limit(200)
    .get();
  const allStaff = await filterStaffAvailableOnDate(allStaffRes.data || [], scheduleDate);

  // 2. 查询近30天全部排班（计算疲劳度 + 当日已排班情况）
  const allStaffIds = allStaff.map(s => s._id);
  const thirtyDaysAgo = new Date(new Date(scheduleDate).getTime() - 30 * 24 * 60 * 60 * 1000);
  const recentSchedules = await db
    .collection(COLLECTIONS.SCHEDULES)
    .where({
      staffId: _.in(allStaffIds),
      scheduleDate: _.gte(formatDate(thirtyDaysAgo)),
    })
    .get();

  // 构建疲劳度映射
  const dayMap = {};      // staffId → Set of dates worked
  const todayWorked = {}; // staffId → count of today's assignments
  recentSchedules.data.forEach((item) => {
    if (!dayMap[item.staffId]) dayMap[item.staffId] = new Set();
    dayMap[item.staffId].add(item.scheduleDate);
    if (item.scheduleDate === scheduleDate) {
      todayWorked[item.staffId] = (todayWorked[item.staffId] || 0) + 1;
    }
  });

  const date = new Date(scheduleDate);

  const getContinuous = (staffId) => {
    const dates = dayMap[staffId] || new Set();
    let count = 0;
    for (let i = 1; i <= 10; i++) {
      const checkDate = new Date(date.getTime() - i * 24 * 60 * 60 * 1000);
      if (dates.has(formatDate(checkDate))) count++;
      else break;
    }
    return count;
  };

  // 3. 遍历当前排班表，检测疲劳并找替班
  const results = [];
  const replacements = []; // 新排班记录（替班人员分配到原航班）

  for (const staff of staffs) {
    const shiftCode = staff.shiftCode || "";
    const continuous = getContinuous(staff.staffId);

    // 未排班或未超标，保持原样
    if (!shiftCode || continuous < fatigueMaxContinuousDays) {
      results.push({
        staffId: staff.staffId,
        employeeNo: staff.employeeNo || "",
        name: staff.name || "",
        action: "KEEP",
        shiftCode,
        replacedBy: null,
        reason: shiftCode ? "排班合理，无需调整" : "未排班",
        continuousDays: continuous,
      });
      continue;
    }

    // 4. 超标：寻找替班人选
    const targetAirline = staff.airline || "";
    const targetAircraftType = staff.aircraftType || staff.aircraftTypeRaw || "";

    const replacementCandidates = allStaff
      .filter(candidate => {
        if (candidate._id === staff.staffId) return false;                    // 不能是自己
        if ((todayWorked[candidate._id] || 0) >= 1) return false;            // 当日已有排班
        if (getContinuous(candidate._id) >= fatigueMaxContinuousDays) return false; // 替班也不超标
        if (!targetAirline || !targetAircraftType) return false;             // 需要知道航班资质要求
        return hasQualification(candidate, targetAirline, targetAircraftType);
      })
      .sort((a, b) => {
        // 优先选疲劳度最低的
        const aCont = getContinuous(a._id);
        const bCont = getContinuous(b._id);
        if (aCont !== bCont) return aCont - bCont;
        return (todayWorked[a._id] || 0) - (todayWorked[b._id] || 0);
      });

    const replacement = replacementCandidates[0];

    if (replacement) {
      // 找到替班：更新数据库中的排班记录
      try {
        const existingSchedule = await db
          .collection(COLLECTIONS.SCHEDULES)
          .where({ staffId: staff.staffId, scheduleDate })
          .limit(1)
          .get();
        if (existingSchedule.data.length) {
          await db.collection(COLLECTIONS.SCHEDULES).doc(existingSchedule.data[0]._id).update({
            data: {
              staffId: replacement._id,
              staffName: replacement.name,
              staffEmployeeNo: replacement.employeeNo,
              groupId: replacement.groupId,
              openid: replacement.openid || "",
              status: "SWAPPED",
              source: "SMART_OPTIMIZED",
              updatedAt: new Date(),
            },
          });
        }

        todayWorked[replacement._id] = (todayWorked[replacement._id] || 0) + 1;
        if (!dayMap[replacement._id]) dayMap[replacement._id] = new Set();
        dayMap[replacement._id].add(scheduleDate);

        replacements.push({
          flightNo: staff.flightNo || "",
          staffName: replacement.name,
          employeeNo: replacement.employeeNo,
        });

        results.push({
          staffId: staff.staffId,
          employeeNo: staff.employeeNo || "",
          name: staff.name || "",
          action: "RESTED",
          shiftCode: "",
          replacedBy: {
            staffId: replacement._id,
            name: replacement.name,
            employeeNo: replacement.employeeNo,
          },
          reason: `连续工作 ${continuous} 天（阈值 ${fatigueMaxContinuousDays} 天），已安排 ${replacement.name}(${replacement.employeeNo}) 替班`,
          continuousDays: continuous,
        });
      } catch (err) {
        results.push({
          staffId: staff.staffId,
          employeeNo: staff.employeeNo || "",
          name: staff.name || "",
          action: "WARN",
          shiftCode,
          replacedBy: null,
          reason: `连续工作 ${continuous} 天，替班写库失败: ${err.message}`,
          continuousDays: continuous,
        });
      }
    } else {
      // 找不到替班：保留原排班但标记风险
      results.push({
        staffId: staff.staffId,
        employeeNo: staff.employeeNo || "",
        name: staff.name || "",
        action: "WARN",
        shiftCode,
        replacedBy: null,
        reason: `连续工作 ${continuous} 天（阈值 ${fatigueMaxContinuousDays} 天），但无符合资质且空闲的替班人选，暂保留`,
        continuousDays: continuous,
      });
    }
  }

  const restedCount = results.filter(r => r.action === "RESTED").length;
  const warnCount = results.filter(r => r.action === "WARN").length;
  cache.invalidate("SCHEDULE_TABLE");
  await logOperation(
    "OPTIMIZE_SCHEDULE",
    `对 ${scheduleDate} 执行疲劳优化，完成 ${restedCount} 人改派，${warnCount} 人待人工处理`,
    { type: "schedule", scheduleDate, restedCount, warnCount }
  );

  return ok({
    scheduleDate,
    optimized: results,
    replacements,
    fatigueMaxContinuousDays,
    restedCount,
    warnCount,
    unchangedCount: results.length - restedCount - warnCount,
  }, `优化完成：${restedCount} 人强制休息已安排替班，${warnCount} 人无法替班已标记`);
};

// ═══════════════════════════════════════════════
// 智能排班（多航班）
// ═══════════════════════════════════════════════
const smartSchedule = async (event) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const data = event.data || {};

  // 单航班模式（来自管理端智能排班表单）
  const isSingleMode = data.flightNo || data.airline;
  if (isSingleMode) {
    return await smartScheduleSingle(event);
  }

  const { scheduleDate, flightIds } = data;

  if (!scheduleDate || !Array.isArray(flightIds) || !flightIds.length) {
    return fail("请提供排班日期和航班ID列表", 400);
  }

  const fatigueMaxContinuousDays = Number(
    await getSettingValue(SETTINGS_KEYS.FATIGUE_MAX_CONTINUOUS_DAYS, 3)
  );

  // 1. 获取所有航班
  let flights = [];
  for (let i = 0; i < flightIds.length; i += 50) {
    const batch = flightIds.slice(i, i + 50);
    const res = await db
      .collection(COLLECTIONS.FLIGHTS)
      .where({ _id: _.in(batch) })
      .limit(100)
      .get();
    flights = flights.concat(res.data || []);
  }

  if (!flights.length) return fail("未找到对应航班", 404);

  // 2. 获取所有在职且未请假的人员
  const staffRes = await db
    .collection(COLLECTIONS.STAFF)
    .where({ active: true })
    .limit(200)
    .get();

  const allStaff = await filterStaffAvailableOnDate(staffRes.data || [], scheduleDate);
  if (!allStaff.length) return fail("没有可用的维修人员", 404);

  // 查询本月排班，计算每位员工的月度累计工时
  const monthStart = scheduleDate.slice(0, 7) + "-01";
  const monthEnd = new Date(new Date(scheduleDate).getTime() + 1 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const monthSchedRes = await db
    .collection(COLLECTIONS.SCHEDULES)
    .where({
      staffId: _.in(allStaff.map(s => s._id)),
      scheduleDate: _.gte(monthStart).and(_.lte(monthEnd)),
    })
    .get();
  const staffMonthlyHours = {};
  for (const s of (monthSchedRes.data || [])) {
    const sid = s.staffId;
    if (!sid) continue;
    staffMonthlyHours[sid] = (staffMonthlyHours[sid] || 0) + 8; // 每班次8小时
  }

  // 3. 查询该日期近30天排班，计算疲劳度
  const staffIds = allStaff.map((s) => s._id);
  const thirtyDaysAgo = new Date(new Date(scheduleDate).getTime() - 30 * 24 * 60 * 60 * 1000);
  const recentSchedules = await db
    .collection(COLLECTIONS.SCHEDULES)
    .where({
      staffId: _.in(staffIds),
      scheduleDate: _.gte(formatDate(thirtyDaysAgo)),
    })
    .get();

  const continuousMap = {};
  const todayWorkedMap = {};
  const dateObj = new Date(scheduleDate);
  recentSchedules.data.forEach((item) => {
    if (item.scheduleDate === scheduleDate && item.staffId) {
      todayWorkedMap[item.staffId] = (todayWorkedMap[item.staffId] || 0) + 1;
    }
    if (!continuousMap[item.staffId]) continuousMap[item.staffId] = new Set();
    continuousMap[item.staffId].add(item.scheduleDate);
  });

  const getContinuous = (staffId) => {
    const dates = continuousMap[staffId] || new Set();
    let count = 0;
    for (let i = 1; i <= 10; i++) {
      const checkDate = new Date(dateObj.getTime() - i * 24 * 60 * 60 * 1000);
      if (dates.has(formatDate(checkDate))) count++;
      else break;
    }
    return count;
  };

  // 4. 为每个航班匹配最佳人员
  const shifts = ["MORNING", "AFTERNOON", "NIGHT"];
  const timeMap = {
    MORNING: "08:00:00",
    AFTERNOON: "13:00:00",
    NIGHT: "20:00:00",
  };

  const assignments = [];
  const insertedSchedules = [];
  const usedStaff = new Set();

  for (let fi = 0; fi < flights.length; fi++) {
    const flight = flights[fi];
    const shiftCode = shifts[fi % shifts.length];
    const airline = normalizeAirlineName(flight.airline);
    const aircraftType = normalizeAircraftType(flight.aircraftType);

    // 筛选有资质的人员
    const candidates = allStaff
      .filter((staff) => {
        if (usedStaff.has(staff._id)) return false;
        if ((todayWorkedMap[staff._id] || 0) >= 1) return false;
        if (getContinuous(staff._id) >= fatigueMaxContinuousDays) return false;
        // 检查月度工时上限
        const maxHours = staff.preferences && staff.preferences.maxMonthlyWorkHours;
        if (maxHours && (staffMonthlyHours[staff._id] || 0) >= maxHours) return false;
        return hasQualification(staff, airline, aircraftType);
      })
      .sort((a, b) => {
        // 优先选择工作负担轻的
        const aWorked = todayWorkedMap[a._id] || 0;
        const bWorked = todayWorkedMap[b._id] || 0;
        if (aWorked !== bWorked) return aWorked - bWorked;
        const contDiff = getContinuous(a._id) - getContinuous(b._id);
        if (contDiff !== 0) return contDiff;
        // 月度工时越少优先级越高
        const aHours = staffMonthlyHours[a._id] || 0;
        const bHours = staffMonthlyHours[b._id] || 0;
        return aHours - bHours;
      });

    // 约束不足时必须明确产出缺口，不能为了得到"完整"结果静默突破
    // 当日工时、连续工作或月度工时上限。
    const chosen = candidates[0];

    if (!chosen) {
      assignments.push({
        flightId: flight._id,
        flightNo: flight.flightNo,
        airline,
        aircraftType,
        shiftCode,
        staffId: null,
        staffName: "",
        warning: ` 无人可用：${airline} ${aircraftType}`,
      });
      continue;
    }

    usedStaff.add(chosen._id);
    todayWorkedMap[chosen._id] = (todayWorkedMap[chosen._id] || 0) + 1;
    if (!continuousMap[chosen._id]) continuousMap[chosen._id] = new Set();
    continuousMap[chosen._id].add(scheduleDate);

    // 写库
    const existing = await db
      .collection(COLLECTIONS.SCHEDULES)
      .where({
        staffId: chosen._id,
        scheduleDate,
        flightId: flight._id,
      })
      .limit(1)
      .get();

    const scheduleData = {
      flightId: flight._id,
      flightNo: flight.flightNo,
      inboundFlightNo: flight.inboundFlightNo || flight.flightNo,
      outboundFlightNo: flight.outboundFlightNo || flight.flightNo,
      airline,
      aircraftRegistration: flight.aircraftRegistration || "",
      aircraftType,
      engineModel: flight.engineModel || "",
      scheduledArrivalTime: flight.scheduledArrivalTime || flight.arrivalTime || "",
      estimatedArrivalTime: flight.estimatedArrivalTime || "",
      arrivalTime: flight.estimatedArrivalTime || flight.arrivalTime || "",
      scheduledDepartureTime: flight.scheduledDepartureTime || flight.departureTime || "",
      departureTime: flight.departureTime || `${scheduleDate}T${timeMap[shiftCode]}`,
      scheduleDate,
      shiftCode,
      staffId: chosen._id,
      staffName: chosen.name,
      staffEmployeeNo: chosen.employeeNo,
      groupId: chosen.groupId,
      openid: chosen.openid || "",
      status: "ASSIGNED",
      source: "SMART",
      stayHours: flight.stayHours,
      updatedAt: new Date(),
    };

    if (existing.data.length) {
      await db.collection(COLLECTIONS.SCHEDULES).doc(existing.data[0]._id).update({
        data: scheduleData,
      });
    } else {
      await db.collection(COLLECTIONS.SCHEDULES).add({
        data: {
          ...scheduleData,
          createdAt: new Date(),
        },
      });
    }
    insertedSchedules.push(scheduleData);

    assignments.push({
      flightId: flight._id,
      flightNo: flight.flightNo,
      airline,
      aircraftType,
      shiftCode,
      staffId: chosen._id,
      staffName: chosen.name,
      staffEmployeeNo: chosen.employeeNo,
      continuousDays: getContinuous(chosen._id),
      monthAssignedCount: (continuousMap[chosen._id] || new Set()).size,
    });
  }

  // 实时同步到 Hangyi
  const syncEnabled = String(await getSettingValue(SETTINGS_KEYS.HANGYI_SYNC_ENABLED, "false")) === "true";
  if (syncEnabled && insertedSchedules.length > 0) {
    callHangyiServiceChecked("/api/sync/schedules", insertedSchedules)
      .catch((error) => console.error("Hangyi同步失败:", error.message || "unknown"));
  }

  return ok({
    scheduleDate,
    assignments,
    totalFlights: flights.length,
    assignedCount: assignments.filter(a => a.staffId).length,
  }, `智能排班完成，${assignments.filter(a => a.staffId).length}/${flights.length} 个航班已分配`);
};

// ═══════════════════════════════════════════════
// 多天滚动排班
// ═══════════════════════════════════════════════
const smartScheduleMultiDay = async (event) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const data = event.data || {};
  const { dateRange, ...rest } = data;
  const { startDate, endDate } = dateRange || {};

  if (!startDate || !endDate) {
    return fail("请提供 dateRange.startDate 和 dateRange.endDate", 400);
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return fail("日期格式错误", 400);
  }

  // 跨天状态跟踪
  const staffState = new Map(); // employeeNo -> { continuousDays, totalHours, assignedDates }

  // P1 修复: 多天预览同样受连续工作天数硬约束（与单天 smartSchedule 一致），
  // 避免预览把同一员工连续多天排满、发布时才发现合规缺口。
  const fatigueMaxContinuousDays = Number(
    await getSettingValue(SETTINGS_KEYS.FATIGUE_MAX_CONTINUOUS_DAYS, 3)
  );

  const results = [];
  const current = new Date(start);

  while (current <= end) {
    const dateStr = formatDate(current);

    // 获取该天的所有航班
    const flightRes = await db
      .collection(COLLECTIONS.FLIGHTS)
      .where({ scheduleDate: dateStr })
      .limit(100)
      .get();
    const dayFlights = flightRes.data || [];

    if (dayFlights.length > 0) {
      // 获取所有在职人员
      const staffRes = await db
        .collection(COLLECTIONS.STAFF)
        .where({ active: true })
        .limit(200)
        .get();
      const allStaff = await filterStaffAvailableOnDate(staffRes.data || [], dateStr);

      // P1 修复: 加载本月已存在的排班, 计算每人的真实月工时（不止本次任务内累计）
      const monthStart = dateStr.slice(0, 7) + "-01";
      const existingMonthRes = await db
        .collection(COLLECTIONS.SCHEDULES)
        .where({ scheduleDate: _.and(_.gte(monthStart), _.lt(dateStr)) })
        .limit(2000)
        .get();
      const existingMonth = existingMonthRes.data || [];
      const realMonthlyHours = {}; // staffId -> hours
      for (const sch of existingMonth) {
        if (!sch.staffId) continue;
        const hrs = getShiftHours(sch.shiftCode);
        realMonthlyHours[sch.staffId] = (realMonthlyHours[sch.staffId] || 0) + hrs;
      }

      // 注入跨天状态到每个人
      const staffWithState = allStaff.map((s) => {
        const state = staffState.get(s.employeeNo) || { continuousDays: 0, totalHours: 0, monthCount: 0 };
        // 真实月工时 = DB 已有月排班 + 本次任务内累计
        const monthlyHours = (realMonthlyHours[s._id] || 0) + state.totalHours;
        return {
          ...s,
          _multiDayContinuous: state.continuousDays,
          _multiDayHours: state.totalHours,
          _monthlyHours: monthlyHours,
          _multiDayMonthCount: state.monthCount,
        };
      });

      // 在这里我们简单排班：给航班逐个选人
      const dayAssignments = [];
      const usedToday = new Set();

      for (const flight of dayFlights) {
        const airline = normalizeAirlineName(flight.airline);
        const aircraftType = normalizeAircraftType(flight.aircraftType);

        const qualified = staffWithState.filter((s) => {
          if (usedToday.has(s._id)) return false;
          const maxHours = s.preferences && s.preferences.maxMonthlyWorkHours;
          // P1 修复: 用真实月工时(_monthlyHours)而非本次任务内累计(_multiDayHours)
          if (maxHours && s._monthlyHours >= maxHours) return false;
          // P1 修复: 连续工作天数达到阈值必须休息，预览阶段即硬性排除
          if ((s._multiDayContinuous || 0) >= fatigueMaxContinuousDays) return false;
          return hasQualification(s, airline, aircraftType);
        }).sort((a, b) => {
          // 连续工作少者优先
          const aCont = a._multiDayContinuous || 0;
          const bCont = b._multiDayContinuous || 0;
          if (aCont !== bCont) return aCont - bCont;
          // 疲劳低者优先（简化版规则：工时+连续天数）
          const aFat = (a._multiDayHours || 0) * 0.8 + (a._multiDayContinuous || 0) * 10;
          const bFat = (b._multiDayHours || 0) * 0.8 + (b._multiDayContinuous || 0) * 10;
          return aFat - bFat;
        });

        const chosen = qualified[0];
        if (chosen) {
          usedToday.add(chosen._id);
          dayAssignments.push({
            flightId: flight._id,
            flightNo: flight.flightNo,
            airline,
            aircraftType,
            staffId: chosen._id,
            staffName: chosen.name,
            staffEmployeeNo: chosen.employeeNo,
            groupId: chosen.groupId,
          });
        } else {
          dayAssignments.push({
            flightId: flight._id,
            flightNo: flight.flightNo,
            airline,
            aircraftType,
            staffId: null,
            staffName: "",
            warning: ` 无人可用：${airline} ${aircraftType}`,
          });
        }
      }

      // 更新跨天状态
      for (const s of allStaff) {
        const state = staffState.get(s.employeeNo) || { continuousDays: 0, totalHours: 0, monthCount: 0 };
        if (usedToday.has(s._id)) {
          state.continuousDays += 1;
          state.totalHours += 8;
          state.monthCount += 1;
        } else {
          state.continuousDays = 0;
        }
        staffState.set(s.employeeNo, state);
      }

      results.push({
        date: dateStr,
        flightCount: dayFlights.length,
        assignedCount: dayAssignments.filter((a) => a.staffId).length,
        assignments: dayAssignments,
        staffStateSummary: Object.fromEntries(staffState),
      });
    } else {
      results.push({
        date: dateStr,
        flightCount: 0,
        assignedCount: 0,
        assignments: [],
        note: "该日无航班",
      });
    }

    current.setDate(current.getDate() + 1);
  }

  return ok({
    dateRange: { startDate, endDate },
    totalDays: results.length,
    results,
  }, `多天滚动排班完成，共 ${results.length} 天`);
};

// ═══════════════════════════════════════════════
// 单航班智能排班（预览/确认模式）
// ═══════════════════════════════════════════════
const smartScheduleSingle = async (event) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const {
    flightNo, airline, aircraftType, engineModel = "",
    aircraftRegistration = "", estimatedArrivalTime = "", departureTime,
    requiredCount = 1, stayHours = 0, commit = false,
  } = event.data || {};

  if (!flightNo || !String(flightNo).trim()) {
    return fail("请填写真实航班号", 400);
  }
  if (!airline || !aircraftType || !departureTime) {
    return fail("请提供航司、机型和起飞时间", 400);
  }
  if (
    [flightNo, airline, aircraftType, engineModel, aircraftRegistration, estimatedArrivalTime, departureTime]
      .some((value) => value !== undefined && typeof value !== "string")
  ) return fail("航班参数格式错误", 400);

  const fatigueMaxContinuousDays = Number(
    await getSettingValue(SETTINGS_KEYS.FATIGUE_MAX_CONTINUOUS_DAYS, 3)
  );

  const normalizedAirline = normalizeAirlineName(airline);
  const normalizedAircraftType = normalizeAircraftType(aircraftType);
  const safeEngineModel = String(engineModel || "").trim().slice(0, 60);
  const safeAircraftRegistration = String(aircraftRegistration || "")
    .trim().toUpperCase().slice(0, 30);
  const safeEstimatedArrivalTime = String(estimatedArrivalTime || "").trim();
  if (
    safeEstimatedArrivalTime &&
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(safeEstimatedArrivalTime)
  ) return fail("预计到达时间格式错误", 400);
  const departureDate = new Date(departureTime);
  if (Number.isNaN(departureDate.getTime())) return fail("起飞时间格式错误", 400);
  const scheduleDate = formatDate(departureDate);
  const shiftCode = getShiftCode(departureDate);

  // 获取所有在职且未请假的人员
  const staffRes = await db
    .collection(COLLECTIONS.STAFF)
    .where({ active: true })
    .limit(200)
    .get();
  const allStaff = await filterStaffAvailableOnDate(staffRes.data || [], scheduleDate);
  if (!allStaff.length) return fail("没有可用的维修人员", 404);

  // 查询近30天排班，计算疲劳度
  const staffIds = allStaff.map(s => s._id);
  const thirtyDaysAgo = new Date(departureDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  const recentSchedules = await db
    .collection(COLLECTIONS.SCHEDULES)
    .where({
      staffId: _.in(staffIds),
      scheduleDate: _.gte(formatDate(thirtyDaysAgo)),
    })
    .get();

  const continuousMap = {};
  const todayWorkedMap = {};
  recentSchedules.data.forEach(item => {
    if (item.scheduleDate === scheduleDate && item.staffId) {
      todayWorkedMap[item.staffId] = (todayWorkedMap[item.staffId] || 0) + 1;
    }
    if (!continuousMap[item.staffId]) continuousMap[item.staffId] = new Set();
    continuousMap[item.staffId].add(item.scheduleDate);
  });

  const getContinuous = (staffId) => {
    const dates = continuousMap[staffId] || new Set();
    let count = 0;
    for (let i = 1; i <= 10; i++) {
      const checkDate = new Date(departureDate.getTime() - i * 24 * 60 * 60 * 1000);
      if (dates.has(formatDate(checkDate))) count++;
      else break;
    }
    return count;
  };

  // 筛选候选人
  const candidates = allStaff
    .filter(staff => {
      if ((todayWorkedMap[staff._id] || 0) >= 1) return false;
      if (getContinuous(staff._id) >= fatigueMaxContinuousDays) return false;
      return hasQualification(staff, normalizedAirline, normalizedAircraftType);
    })
    .map(staff => ({
      staffId: staff._id,
      employeeNo: staff.employeeNo,
      name: staff.name,
      groupId: staff.groupId,
      authorizedAirlines: staff.authorizedAirlines || [],
      authorizedAircraftTypes: staff.authorizedAircraftTypes || [],
      continuousDays: getContinuous(staff._id),
      monthAssignedCount: (continuousMap[staff._id] || new Set()).size,
      todayWorked: todayWorkedMap[staff._id] || 0,
    }));

  // 规则评分：连续天数越少、本月排班越少、今日已工作越少 → 分数越低越好
  const ruleScore = (c) =>
    c.continuousDays * 100 + c.monthAssignedCount + c.todayWorked * 50;

  candidates.forEach(c => { c.score = ruleScore(c); });
  candidates.sort((a, b) => a.score - b.score);

  const recommendation = candidates.slice(0, Number(requiredCount));

  // 预览模式：仅返回推荐
  if (!commit) {
    return ok({
      flight: {
        flightNo: flightNo || "",
        flightId: "",
        airline: normalizedAirline,
        aircraftType: normalizedAircraftType,
        engineModel: safeEngineModel,
        aircraftRegistration: safeAircraftRegistration,
        estimatedArrivalTime: safeEstimatedArrivalTime,
        shiftCode,
        scheduleDate,
      },
      recommendation,
      source: "rule",
    });
  }

  // 确认模式：写库
  const selected = candidates.slice(0, Number(requiredCount));
  if (!selected.length) return fail("没有符合条件的人员", 404);

  const flightKey = `${flightNo || "SMART"}_${scheduleDate}`;
  let flightId = "";
  const existingFlight = await db
    .collection(COLLECTIONS.FLIGHTS)
    .where({ key: flightKey })
    .limit(1)
    .get();
  if (existingFlight.data.length) {
    flightId = existingFlight.data[0]._id;
    const flightUpdate = {
      airline: normalizedAirline,
      aircraftType: normalizedAircraftType,
      scheduledDepartureTime: departureTime,
      departureTime,
      scheduleDate,
      stayHours: Number(stayHours || 0),
      updatedAt: new Date(),
    };
    if (safeEngineModel) flightUpdate.engineModel = safeEngineModel;
    if (safeAircraftRegistration) {
      flightUpdate.aircraftRegistration = safeAircraftRegistration;
    }
    if (safeEstimatedArrivalTime) {
      flightUpdate.estimatedArrivalTime = safeEstimatedArrivalTime;
      flightUpdate.estimatedArrivalSource = "MANUAL";
      flightUpdate.arrivalTime = safeEstimatedArrivalTime;
    }
    await db.collection(COLLECTIONS.FLIGHTS).doc(flightId).update({
      data: flightUpdate,
    });
  } else {
    const addRes = await db.collection(COLLECTIONS.FLIGHTS).add({
      data: {
        key: flightKey,
        flightNo: flightNo || `SMART${Date.now().toString().slice(-4)}`,
        airline: normalizedAirline,
        aircraftType: normalizedAircraftType,
        engineModel: safeEngineModel,
        aircraftRegistration: safeAircraftRegistration,
        scheduledArrivalTime: "",
        estimatedArrivalTime: safeEstimatedArrivalTime,
        estimatedArrivalSource: safeEstimatedArrivalTime ? "MANUAL" : "",
        arrivalTime: safeEstimatedArrivalTime,
        scheduledDepartureTime: departureTime,
        departureTime: departureTime,
        scheduleDate,
        stayHours: Number(stayHours || 0),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    flightId = addRes._id;
  }

  const timeMap = { MORNING: "08:00:00", AFTERNOON: "13:00:00", NIGHT: "20:00:00" };
  const insertedSchedules = [];
  for (const item of selected) {
    const staff = allStaff.find(s => s._id === item.staffId);
    if (!staff) continue;
    const scheduleRecord = {
      flightId,
      flightNo: flightNo || `SMART${Date.now().toString().slice(-4)}`,
      airline: normalizedAirline,
      aircraftType: normalizedAircraftType,
      engineModel: safeEngineModel,
      aircraftRegistration: safeAircraftRegistration,
      scheduledArrivalTime: "",
      estimatedArrivalTime: safeEstimatedArrivalTime,
      estimatedArrivalSource: safeEstimatedArrivalTime ? "MANUAL" : "",
      arrivalTime: safeEstimatedArrivalTime,
      scheduledDepartureTime: departureTime,
      departureTime: departureTime || `${scheduleDate}T${timeMap[shiftCode]}`,
      scheduleDate,
      shiftCode,
      staffId: item.staffId,
      staffName: item.name,
      staffEmployeeNo: item.employeeNo,
      groupId: item.groupId,
      openid: staff.openid || "",
      status: "ASSIGNED",
      source: "SMART",
      stayHours: Number(stayHours || 0),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await db.collection(COLLECTIONS.SCHEDULES).add({ data: scheduleRecord });
    insertedSchedules.push(scheduleRecord);
  }

  await logOperation(
    "SMART_SCHEDULE",
    `${guard.staff.name}（${guard.staff.employeeNo}）完成航班 ${flightNo || "SMART"} 智能排班，共 ${insertedSchedules.length} 人`,
    {
      type: "schedule",
      flightId,
      flightNo: flightNo || "",
      scheduleDate,
      engineModel: safeEngineModel,
      aircraftRegistration: safeAircraftRegistration,
      estimatedArrivalTime: safeEstimatedArrivalTime,
      assignedStaffIds: selected.map((item) => item.staffId),
      before: null,
      after: { assignedCount: insertedSchedules.length },
    }
  );

  // 实时同步到 Hangyi
  const syncEnabled = String(await getSettingValue(SETTINGS_KEYS.HANGYI_SYNC_ENABLED, "false")) === "true";
  if (syncEnabled && insertedSchedules.length > 0) {
    callHangyiServiceChecked("/api/sync/schedules", insertedSchedules)
      .catch((error) => console.error("Hangyi同步失败:", error.message || "unknown"));
  }

  return ok({
    flight: {
      flightNo: flightNo || "",
      flightId,
      airline: normalizedAirline,
      aircraftType: normalizedAircraftType,
      engineModel: safeEngineModel,
      aircraftRegistration: safeAircraftRegistration,
      estimatedArrivalTime: safeEstimatedArrivalTime,
      shiftCode,
      scheduleDate,
    },
    assignedCount: selected.length,
    assignedStaff: selected.map(s => ({ name: s.name, employeeNo: s.employeeNo })),
  }, `智能排班完成，已分配 ${selected.length} 人`);
};

// ═══════════════════════════════════════════════
// TSV 文件导入排班
// ═══════════════════════════════════════════════
const importScheduleFromTSV = async (event) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { scheduleDate, flights } = event.data || {};
  if (
    typeof scheduleDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(scheduleDate)
  ) return fail("排班日期格式错误", 400);
  if (!Array.isArray(flights) || !flights.length) return fail("没有可排班的航班数据", 400);
  if (flights.length > 200) return fail("单次最多导入 200 条航班", 400);

  const fatigueMaxContinuousDays = Number(
    await getSettingValue(SETTINGS_KEYS.FATIGUE_MAX_CONTINUOUS_DAYS, 3)
  );
  const staffRes = await db
    .collection(COLLECTIONS.STAFF)
    .where({ active: true })
    .limit(200)
    .get();
  const allStaff = staffRes.data || [];
  if (!allStaff.length) return fail("没有可用的维修人员", 404);

  const importedFlights = [];
  const errors = [];
  // P1 修复: 记录本次导入写入的排班 _id，供部分失败时回滚，避免留下半份导入数据
  const writtenScheduleIds = [];

  for (let i = 0; i < flights.length; i++) {
    const flight = flights[i];
    try {
      if (!flight || typeof flight !== "object" || Array.isArray(flight)) {
        errors.push(`第${i + 1}条：航班数据格式错误`);
        continue;
      }
      const stringFields = [
        "flightNo", "airline", "aircraftType", "departureTime", "landingTime",
        "scheduleDate", "aircraftReg", "aircraftRegistration", "engineModel",
        "inboundFlight", "outboundFlight", "estimatedArrivalTime",
      ];
      const invalidField = stringFields.find(
        (field) => flight[field] !== undefined && typeof flight[field] !== "string"
      );
      if (invalidField) {
        errors.push(`第${i + 1}条：${invalidField} 字段格式错误`);
        continue;
      }
      const {
        flightNo = `TSV${Date.now().toString().slice(-4)}`,
        airline,
        aircraftType,
        departureTime,
        stayHours = 0,
        scheduleDate: flightDate,
      } = flight;

      if (!airline || !aircraftType || !departureTime) {
        errors.push(`第${i + 1}条：航司/机型/时间信息不完整`);
        continue;
      }

      const normalizedAirline = normalizeAirlineName(airline);
      const normalizedAircraftType = normalizeAircraftType(aircraftType);
      const inboundFlightNo = String(flight.inboundFlight || flightNo || "")
        .trim().toUpperCase().slice(0, 20);
      const outboundFlightNo = String(flight.outboundFlight || flightNo || "")
        .trim().toUpperCase().slice(0, 20);
      const aircraftRegistration = String(
        flight.aircraftRegistration || flight.aircraftReg || ""
      ).trim().toUpperCase().slice(0, 30);
      const engineModel = String(flight.engineModel || "").trim().slice(0, 60);
      const scheduledArrivalTime = String(flight.landingTime || "").trim();
      const estimatedArrivalTime = String(flight.estimatedArrivalTime || "").trim();
      const date = new Date(departureTime);
      if (Number.isNaN(date.getTime())) {
        errors.push(`第${i + 1}条：起飞时间格式错误`);
        continue;
      }

      const dateKey = flightDate || formatDate(date);
      const shiftCode = getShiftCode(date);
      const availableStaff = await filterStaffAvailableOnDate(allStaff, dateKey);
      if (!availableStaff.length) {
        errors.push(`${flightNo}：当天没有可用的维修人员`);
        continue;
      }

      // 查近30天排班算疲劳度（分页获取，避免数据截断）
      const staffIds = availableStaff.map(s => s._id);
      const thirtyDaysAgo = new Date(date.getTime() - 30 * 24 * 60 * 60 * 1000);
      const recentSchedules = await db
        .collection(COLLECTIONS.SCHEDULES)
        .where({
          staffId: _.in(staffIds),
          scheduleDate: _.gte(formatDate(thirtyDaysAgo)),
        })
        .limit(2000)
        .get();

      const continuousMap = {};
      const todayWorkedMap = {};
      recentSchedules.data.forEach(item => {
        if (item.scheduleDate === dateKey && item.staffId) {
          todayWorkedMap[item.staffId] = (todayWorkedMap[item.staffId] || 0) + 1;
        }
        if (!continuousMap[item.staffId]) continuousMap[item.staffId] = new Set();
        continuousMap[item.staffId].add(item.scheduleDate);
      });

      const getContinuous = (staffId) => {
        const dates = continuousMap[staffId] || new Set();
        let count = 0;
        for (let j = 1; j <= 10; j++) {
          const checkDate = new Date(date.getTime() - j * 24 * 60 * 60 * 1000);
          if (dates.has(formatDate(checkDate))) count++;
          else break;
        }
        return count;
      };

      const candidates = availableStaff
        .filter(staff => {
          if ((todayWorkedMap[staff._id] || 0) >= 1) return false;
          if (getContinuous(staff._id) >= fatigueMaxContinuousDays) return false;
          return hasQualification(staff, normalizedAirline, normalizedAircraftType);
        })
        .sort((a, b) => {
          const aWorked = todayWorkedMap[a._id] || 0;
          const bWorked = todayWorkedMap[b._id] || 0;
          if (aWorked !== bWorked) return aWorked - bWorked;
          return getContinuous(a._id) - getContinuous(b._id);
        });

      const chosen = candidates[0];
      if (!chosen) {
        errors.push(`${flightNo}：没有符合资质且空闲的人员`);
        continue;
      }

      // 写航班
      const flightKey = `${flightNo}_${dateKey}`;
      let flightId = "";
      const existingFlight = await db
        .collection(COLLECTIONS.FLIGHTS)
        .where({ key: flightKey })
        .limit(1)
        .get();
      if (existingFlight.data.length) {
        flightId = existingFlight.data[0]._id;
        await db.collection(COLLECTIONS.FLIGHTS).doc(flightId).update({
          data: {
            inboundFlightNo,
            outboundFlightNo,
            airline: normalizedAirline,
            aircraftRegistration,
            aircraftType: normalizedAircraftType,
            engineModel,
            scheduledArrivalTime,
            estimatedArrivalTime,
            arrivalTime: estimatedArrivalTime || scheduledArrivalTime,
            scheduledDepartureTime: departureTime,
            departureTime,
            scheduleDate: dateKey,
            stayHours: Number(stayHours || 0),
            updatedAt: new Date(),
          },
        });
      } else {
        const addRes = await db.collection(COLLECTIONS.FLIGHTS).add({
          data: {
            key: flightKey,
            flightNo,
            inboundFlightNo,
            outboundFlightNo,
            airline: normalizedAirline,
            aircraftRegistration,
            aircraftType: normalizedAircraftType,
            engineModel,
            scheduledArrivalTime,
            estimatedArrivalTime,
            arrivalTime: estimatedArrivalTime || scheduledArrivalTime,
            scheduledDepartureTime: departureTime,
            departureTime,
            scheduleDate: dateKey,
            stayHours: Number(stayHours || 0),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
        flightId = addRes._id;

      }
      // P1 修复: 同航班同日已有排班则拒绝重复导入（避免重复导入不断追加记录）
      const duplicateCheck = await db
        .collection(COLLECTIONS.SCHEDULES)
        .where({ flightNo, scheduleDate: dateKey })
        .limit(1)
        .get();
      if (duplicateCheck.data.length) {
        errors.push(`${flightNo}：${dateKey} 已存在排班，请勿重复导入`);
        continue;
      }

      // 写排班
      const timeMap = { MORNING: "08:00:00", AFTERNOON: "13:00:00", NIGHT: "20:00:00" };
      const scheduleRecord = {
        flightId,
        flightNo,
        inboundFlightNo,
        outboundFlightNo,
        airline: normalizedAirline,
        aircraftRegistration,
        aircraftType: normalizedAircraftType,
        engineModel,
        scheduledArrivalTime,
        estimatedArrivalTime,
        arrivalTime: estimatedArrivalTime || scheduledArrivalTime,
        scheduledDepartureTime: departureTime,
        departureTime: departureTime || `${dateKey}T${timeMap[shiftCode]}`,
        scheduleDate: dateKey,
        shiftCode,
        staffId: chosen._id,
        staffName: chosen.name,
        staffEmployeeNo: chosen.employeeNo,
        groupId: chosen.groupId,
        openid: chosen.openid || "",
        stayHours: Number(stayHours || 0),
        status: "ASSIGNED",
        source: "TSV_IMPORT",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const scheduleAddResult = await db.collection(COLLECTIONS.SCHEDULES).add({
        data: scheduleRecord,
      });
      writtenScheduleIds.push(scheduleAddResult._id);

      // 实时推送到 Web 端
      callHangyiServiceChecked("/api/sync/schedules", [scheduleRecord])
        .catch((error) => console.error("Hangyi同步失败:", error.message || "unknown"));

      importedFlights.push({
        flightNo,
        airline: normalizedAirline,
        aircraftType: normalizedAircraftType,
        engineModel,
        aircraftRegistration,
        inboundFlightNo,
        outboundFlightNo,
        scheduleDate: dateKey,
        shiftCode,
        assignedStaff: { name: chosen.name, employeeNo: chosen.employeeNo },
      });
    } catch (err) {
      errors.push(`${flight.flightNo || `航班${i + 1}`}：${err.message || "排班失败"}`);
    }
  }

  // P1 修复: 导入存在失败时，回滚本次已写入的排班，保持“整批成功或整批失败”
  if (errors.length && writtenScheduleIds.length) {
    await Promise.allSettled(writtenScheduleIds.map((scheduleId) =>
      db.collection(COLLECTIONS.SCHEDULES).doc(scheduleId).remove()
    ));
    importedFlights.length = 0;
  }

  await logOperation(
    "IMPORT_SCHEDULE",
    `${guard.staff.name}（${guard.staff.employeeNo}）导入航班排班，成功 ${importedFlights.length} 条，失败 ${errors.length} 条${errors.length && writtenScheduleIds.length ? "（已回滚本次写入）" : ""}`,
    {
      type: "scheduleImport",
      scheduleDate: scheduleDate || "",
      totalFlights: flights.length,
      importedCount: importedFlights.length,
      errorCount: errors.length,
      rolledBack: errors.length > 0 && writtenScheduleIds.length > 0,
      importedFlightNos: importedFlights.map((item) => item.flightNo).slice(0, 200),
    }
  );

  return ok({
    scheduleDate,
    importedCount: importedFlights.length,
    totalFlights: flights.length,
    importedFlights,
    errors,
  }, `成功排班 ${importedFlights.length} 条，失败 ${errors.length} 条`);
};

// ═══════════════════════════════════════════════
// 排班统计看板
// ═══════════════════════════════════════════════
const getScheduleStatistics = async (event) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const rawDate = (event.data || {}).scheduleDate;
  if (rawDate !== undefined && (
    typeof rawDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)
  )) return fail("排班日期格式错误", 400);
  const targetDate = rawDate || formatDate(new Date());

  // 并行加载
  const targetDateObject = new Date(`${targetDate}T00:00:00`);
  const sevenDaysAgo = new Date(targetDateObject);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  const date7dAgo = formatDate(sevenDaysAgo);

  const [staffRes, weekScheduleRes, todayScheduleRes] = await Promise.all([
    db.collection(COLLECTIONS.STAFF).limit(200).get(),
    db.collection(COLLECTIONS.SCHEDULES).where({ scheduleDate: _.gte(date7dAgo) }).limit(3000).get(),
    db.collection(COLLECTIONS.SCHEDULES).where({ scheduleDate: targetDate }).limit(500).get(),
  ]);

  const allStaff = (staffRes.data || []).filter((staff) => staff.active !== false);
  const weekSchedules = (weekScheduleRes.data || []).filter((schedule) =>
    schedule.scheduleDate <= targetDate &&
    schedule.recordStatus !== "archived" &&
    schedule.status !== "CANCELLED"
  );
  const todaySchedules = (todayScheduleRes.data || []).filter((schedule) =>
    schedule.recordStatus !== "archived" &&
    schedule.status !== "CANCELLED"
  );

  // ── 1. 班组负荷对比 ──
  const groups = {};
  allStaff.forEach(s => {
    const gid = s.groupId || '未分组';
    if (!groups[gid]) groups[gid] = {
      groupId: gid,
      staffCount: 0,
      staffIds: new Set(),
      assignedStaffIds: new Set(),
      tasks: 0,
      effectiveMin: 0,
    };
    groups[gid].staffCount++;
    groups[gid].staffIds.add(s._id);
  });
  todaySchedules.forEach(s => {
    const gid = s.groupId || '未分组';
    if (groups[gid]) {
      groups[gid].tasks++;
      if (s.staffId) groups[gid].assignedStaffIds.add(s.staffId);
      if (s._taskStart && s._taskEnd) {
        const start = new Date(s._taskStart);
        const end = new Date(s._taskEnd);
        groups[gid].effectiveMin += (end - start) / 60000;
      } else {
        groups[gid].effectiveMin += 30;
      }
    }
  });
  const groupStats = Object.values(groups).map(g => ({
    groupId: g.groupId,
    staffCount: g.staffCount,
    taskCount: g.tasks,
    avgTasksPerStaff: g.staffCount > 0 ? Math.round(g.tasks / g.staffCount * 10) / 10 : 0,
    utilization: g.assignedStaffIds.size > 0
      ? Math.min(100, Math.round((g.effectiveMin / (g.assignedStaffIds.size * 8 * 60)) * 100))
      : 0,
  })).sort((a, b) => b.utilization - a.utilization);

  // ── 2. 人员利用率排序 ──
  const todayStaffIds = [...new Set(todaySchedules.map(s => s.staffId).filter(Boolean))];
  const staffUtilization = allStaff
    .filter(s => todayStaffIds.includes(s._id))
    .map(s => {
      const mySchedules = todaySchedules.filter(sch => sch.staffId === s._id);
      const taskCount = mySchedules.length;
      let effectiveMin = 0;
      mySchedules.forEach(sch => {
        if (sch._taskStart && sch._taskEnd) {
          effectiveMin += (new Date(sch._taskEnd) - new Date(sch._taskStart)) / 60000;
        } else {
          effectiveMin += 30;
        }
      });
      const weekCount = weekSchedules.filter(sch => sch.staffId === s._id).length;
      const fatigueScore = Math.min(100, taskCount * 15 + Math.max(0, weekCount - 3) * 8);
      return {
        staffId: s._id,
        name: s.name,
        employeeNo: s.employeeNo,
        roleType: s.roleType,
        groupId: s.groupId,
        taskCount,
        effectiveMinutes: effectiveMin,
        fatigueScore,
        fatigueRisk: fatigueScore >= 70 ? 'high' : fatigueScore >= 40 ? 'medium' : 'low',
      };
    })
    .sort((a, b) => b.taskCount - a.taskCount || a.fatigueScore - b.fatigueScore);

  // ── 3. 资质覆盖 ──
  const typeMap = {};
  allStaff.forEach(s => {
    const types = new Set([
      ...(Array.isArray(s.authorizedAircraftTypes) ? s.authorizedAircraftTypes : []),
      ...(Array.isArray(s.qualifications)
        ? s.qualifications.map((qualification) => qualification.aircraftType)
        : []),
    ].filter(Boolean).map(normalizeAircraftType));
    types.forEach(type => {
      if (!typeMap[type]) {
        typeMap[type] = {
          aircraftType: type,
          staffCount: 0,
          totalStaff: allStaff.length,
        };
      }
      typeMap[type].staffCount++;
    });
  });
  const qualificationStats = Object.values(typeMap).map(t => ({
    aircraftType: t.aircraftType,
    qualifiedCount: t.staffCount,
    totalStaff: t.totalStaff,
    coverageRate: t.totalStaff > 0 ? Math.round((t.staffCount / t.totalStaff) * 100) : 0,
  })).sort((a, b) => b.coverageRate - a.coverageRate);

  // ── 4. 夜班分布（近7天） ──
  const nightDistribution = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(targetDateObject);
    d.setDate(d.getDate() - i);
    const dateStr = formatDate(d);
    const daySchedules = weekSchedules.filter(s => s.scheduleDate === dateStr);
    const total = daySchedules.length;
    const night = daySchedules.filter(s => s.shiftCode === 'NIGHT').length;
    const morning = daySchedules.filter(s => s.shiftCode === 'MORNING').length;
    const afternoon = total - night - morning;
    nightDistribution.push({
      date: dateStr,
      total,
      night,
      morning,
      afternoon,
      nightRate: total > 0 ? Math.round((night / total) * 100) : 0,
    });
  }

  return ok({
    groupStats,
    staffUtilization,
    qualificationStats,
    nightDistribution,
  });
};

// ═══════════════════════════════════════════════
// 勤务排班表 / 发布
// ═══════════════════════════════════════════════
const getServiceScheduleTable = async (event) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const rawDate = (event.data || {}).scheduleDate;
  if (rawDate !== undefined && (
    typeof rawDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)
  )) return fail("排班日期格式错误", 400);
  const targetDate = rawDate || formatDate(new Date());

  const schedulesRes = await db
    .collection(COLLECTIONS.SCHEDULES)
    .where({
      scheduleDate: targetDate,
      _taskType: _.exists(true),
      recordStatus: _.or([_.exists(false), _.eq("active")]),
    })
    .limit(300)
    .get();
  const schedules = schedulesRes.data || [];

  const staffIds = [...new Set(schedules.map(s => s.staffId).filter(Boolean))];
  const staffMap = new Map();
  if (staffIds.length) {
    const staffRes = await db
      .collection(COLLECTIONS.STAFF)
      .where({ _id: _.in(staffIds) })
      .limit(100)
      .get();
    (staffRes.data || []).forEach(s => staffMap.set(s._id, s));
  }

  // 按任务分组
  const taskGroups = {};
  schedules.forEach(s => {
    const key = `${s.flightNo}_${s._taskType}`;
    if (!taskGroups[key]) {
      taskGroups[key] = {
        taskId: key,
        flightNo: s.flightNo,
        airline: s.airline || "",
        aircraftType: s.aircraftType || "",
        taskType: s._taskType,
        taskStart: s._taskStart || "",
        taskEnd: s._taskEnd || "",
        taskWindow: {
          start: s._taskStart || "",
          end: s._taskEnd || "",
        },
        staff: [],
      };
    }
    const staff = staffMap.get(s.staffId);
    taskGroups[key].staff.push({
      staffId: s.staffId,
      name: s.staffName || (staff ? staff.name : ""),
      employeeNo: s.staffEmployeeNo || (staff ? staff.employeeNo : ""),
      roleType: staff ? staff.roleType : "",
      groupId: staff ? staff.groupId : s.groupId || "",
    });
  });

  const chainMap = new Map();
  schedules.forEach((schedule) => {
    if (!schedule.staffId) return;
    const staff = staffMap.get(schedule.staffId) || {};
    if (!chainMap.has(schedule.staffId)) {
      chainMap.set(schedule.staffId, {
        staffId: schedule.staffId,
        name: schedule.staffName || staff.name || "",
        employeeNo: schedule.staffEmployeeNo || staff.employeeNo || "",
        roleType: staff.roleType || "",
        groupId: staff.groupId || schedule.groupId || "",
        tasks: [],
        gaps: [],
      });
    }
    chainMap.get(schedule.staffId).tasks.push({
      taskId: schedule._id,
      flightNo: schedule.flightNo || "",
      airline: schedule.airline || "",
      aircraftType: schedule.aircraftType || "",
      taskType: schedule._taskType || "",
      start: schedule._taskStart || "",
      end: schedule._taskEnd || "",
    });
  });

  const staffChains = Array.from(chainMap.values()).map((chain) => {
    chain.tasks.sort((a, b) => String(a.start).localeCompare(String(b.start)));
    let effectiveMinutes = 0;
    chain.tasks.forEach((task) => {
      const start = new Date(task.start).getTime();
      const end = new Date(task.end).getTime();
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
        effectiveMinutes += Math.round((end - start) / 60000);
      }
    });
    for (let index = 1; index < chain.tasks.length; index += 1) {
      const previous = chain.tasks[index - 1];
      const current = chain.tasks[index];
      const previousEnd = new Date(previous.end).getTime();
      const currentStart = new Date(current.start).getTime();
      if (
        Number.isFinite(previousEnd) &&
        Number.isFinite(currentStart) &&
        currentStart > previousEnd
      ) {
        chain.gaps.push({
          start: previous.end,
          end: current.start,
          minutes: Math.round((currentStart - previousEnd) / 60000),
        });
      }
    }
    chain.dutyStart = chain.tasks.length ? chain.tasks[0].start : "";
    chain.dutyEnd = chain.tasks.length ? chain.tasks[chain.tasks.length - 1].end : "";
    const dutyStartMs = new Date(chain.dutyStart).getTime();
    const dutyEndMs = new Date(chain.dutyEnd).getTime();
    const dutyMinutes = (
      Number.isFinite(dutyStartMs) &&
      Number.isFinite(dutyEndMs) &&
      dutyEndMs > dutyStartMs
    ) ? Math.round((dutyEndMs - dutyStartMs) / 60000) : 0;
    chain.effectiveMinutes = effectiveMinutes;
    chain.totalDutyMinutes = dutyMinutes;
    chain.efficiency = dutyMinutes > 0
      ? Math.min(100, Math.round((effectiveMinutes / dutyMinutes) * 100))
      : 0;
    return chain;
  });

  const taskList = Object.values(taskGroups);
  const totalWastedMinutes = staffChains.reduce(
    (sum, chain) => sum + chain.gaps.reduce((gapSum, gap) => gapSum + gap.minutes, 0),
    0
  );

  return ok({
    scheduleDate: targetDate,
    tasks: taskList,
    total: taskList.length,
    staffChains,
    stats: {
      totalFlights: new Set(taskList.map((task) => task.flightNo).filter(Boolean)).size,
      totalServiceTasks: taskList.filter((task) => task.taskType === "SERVICE").length,
      totalReleaseTasks: taskList.filter((task) => task.taskType === "RELEASE").length,
      totalStaffUsed: staffChains.length,
      avgEfficiency: staffChains.length
        ? Math.round(staffChains.reduce((sum, chain) => sum + chain.efficiency, 0) / staffChains.length)
        : 0,
      wastedMinutes: totalWastedMinutes,
    },
  });
};

const publishServiceSchedule = async (event) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const payload = event.data || {};
  if (
    typeof payload.scheduleDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(payload.scheduleDate)
  ) return fail("排班日期格式错误", 400);
  const targetDate = payload.scheduleDate;
  const assignments = Array.isArray(payload.assignments) ? payload.assignments : [];
  if (!assignments.length) return fail("没有可发布的排班内容", 400);
  if (assignments.length > 300) return fail("单次最多发布 300 条任务", 400);
  if (!assignments.every((assignment) =>
    assignment &&
    typeof assignment.flightNo === "string" &&
    /^[A-Za-z0-9_-]{1,20}$/.test(assignment.flightNo.trim()) &&
    [
      "inboundFlightNo", "outboundFlightNo", "airline", "aircraftRegistration",
      "aircraftType", "engineModel", "scheduledArrivalTime",
      "estimatedArrivalTime", "scheduledDepartureTime",
    ].every((field) =>
      assignment[field] === undefined || typeof assignment[field] === "string"
    ) &&
    ["SERVICE", "RELEASE"].includes(assignment.taskType) &&
    Array.isArray(assignment.staff) &&
    assignment.staff.length > 0 &&
    assignment.staff.length <= 10 &&
    assignment.taskWindow &&
    typeof assignment.taskWindow.start === "string" &&
    typeof assignment.taskWindow.end === "string"
  )) return fail("勤务排班内容格式错误", 400);

  const [
    serviceRequiredCount,
    releaseRequiredCount,
    minRestInterval,
    maxDailyWorkHours,
  ] = await Promise.all([
    getSettingValue(SETTINGS_KEYS.SERVICE_REQUIRED_COUNT, 2),
    getSettingValue(SETTINGS_KEYS.RELEASE_REQUIRED_COUNT, 1),
    getSettingValue(SETTINGS_KEYS.MIN_REST_INTERVAL_MINUTES, 30),
    getSettingValue(SETTINGS_KEYS.MAX_DAILY_WORK_HOURS, 12),
  ]);
  const requiredCountMap = {
    SERVICE: Number(serviceRequiredCount),
    RELEASE: Number(releaseRequiredCount),
  };
  for (const assignment of assignments) {
    const uniqueIds = new Set(
      assignment.staff.map((staff) =>
        staff && typeof staff.staffId === "string" ? staff.staffId.trim() : ""
      )
    );
    if (uniqueIds.has("") || uniqueIds.size !== assignment.staff.length) {
      return fail(`航班 ${assignment.flightNo} 的人员数据无效或重复`, 400);
    }
    if (assignment.staff.length < requiredCountMap[assignment.taskType]) {
      return fail(
        `航班 ${assignment.flightNo} 的${assignment.taskType === "SERVICE" ? "勤务" : "放行"}人员不足`,
        409
      );
    }
  }

  const allStaffIds = Array.from(new Set(
    assignments.flatMap((assignment) =>
      assignment.staff.map((staff) => staff.staffId.trim())
    )
  ));
  let selectedStaff = [];
  for (let index = 0; index < allStaffIds.length; index += 50) {
    const batch = allStaffIds.slice(index, index + 50);
    const result = await db.collection(COLLECTIONS.STAFF)
      .where({ _id: _.in(batch) })
      .limit(50)
      .get();
    selectedStaff = selectedStaff.concat(result.data || []);
  }
  const availableStaff = await filterStaffAvailableOnDate(
    selectedStaff.filter((staff) => staff.active !== false),
    targetDate
  );
  const staffMap = new Map(availableStaff.map((staff) => [staff._id, staff]));
  if (staffMap.size !== allStaffIds.length) {
    return fail("发布人员中存在已停用、请假或不存在的人员，请重新生成预览", 409);
  }

  const staffIntervals = new Map();
  const validatedAssignments = [];
  for (const assignment of assignments) {
    const start = new Date(assignment.taskWindow.start);
    const end = new Date(assignment.taskWindow.end);
    if (
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      end <= start ||
      end.getTime() - start.getTime() > 24 * 60 * 60 * 1000
    ) return fail(`航班 ${assignment.flightNo} 的任务时间窗无效`, 400);

    const canonicalStaff = [];
    for (const inputStaff of assignment.staff) {
      const staff = staffMap.get(inputStaff.staffId.trim());
      const roleMatched = assignment.taskType === "SERVICE"
        ? staff.roleType === "SERVICE" || staff.roleType === "BOTH"
        : staff.roleType === "RELEASE" || staff.roleType === "BOTH";
      if (!roleMatched) {
        return fail(`${staff.name || staff.employeeNo} 的岗位不匹配`, 409);
      }
      if (!hasQualification(staff, assignment.airline || "", assignment.aircraftType || "")) {
        return fail(`${staff.name || staff.employeeNo} 缺少该航班所需资质`, 409);
      }
      const intervals = staffIntervals.get(staff._id) || [];
      intervals.push({ start, end, flightNo: assignment.flightNo });
      staffIntervals.set(staff._id, intervals);
      canonicalStaff.push(staff);
    }
    validatedAssignments.push({ ...assignment, start, end, canonicalStaff });
  }

  for (const [staffId, intervals] of staffIntervals.entries()) {
    intervals.sort((a, b) => a.start - b.start);
    // 并行/重叠任务不能被重复累计为工时；是否允许重叠由下面的休息间隔
    // 校验独立决定。这里计算时间区间并集，避免错误把 2 小时重叠计为 4 小时。
    let totalMinutes = 0;
    let coveredUntil = null;
    for (const interval of intervals) {
      const effectiveStart = coveredUntil && interval.start < coveredUntil
        ? coveredUntil
        : interval.start;
      if (interval.end > effectiveStart) {
        totalMinutes += (interval.end.getTime() - effectiveStart.getTime()) / 60000;
      }
      if (!coveredUntil || interval.end > coveredUntil) coveredUntil = interval.end;
    }
    if (totalMinutes > Number(maxDailyWorkHours) * 60) {
      const staff = staffMap.get(staffId);
      return fail(
        `${staff.name || staff.employeeNo} 当日任务工时超过 ${maxDailyWorkHours} 小时`,
        409
      );
    }
    for (let index = 1; index < intervals.length; index += 1) {
      const previous = intervals[index - 1];
      const current = intervals[index];
      const gapMinutes = (current.start.getTime() - previous.end.getTime()) / 60000;
      if (gapMinutes < Number(minRestInterval)) {
        const staff = staffMap.get(staffId);
        return fail(
          `${staff.name || staff.employeeNo} 在 ${previous.flightNo} 与 ${current.flightNo} 之间休息不足`,
          409
        );
      }
    }
  }

  // 存档该日期所有角色排班（保留历史快照）
  const existingRes = await db
    .collection(COLLECTIONS.SCHEDULES)
    .where({ scheduleDate: targetDate, _taskType: _.exists(true) })
    .limit(300)
    .get();
  for (const ex of existingRes.data) {
    await db.collection(COLLECTIONS.SCHEDULES).doc(ex._id).update({
      data: { recordStatus: "archived", archivedAt: new Date(), updatedAt: new Date() },
    });
  }

  // 写入新排班
  let writtenCount = 0;
  for (const a of validatedAssignments) {
    for (const staffMember of a.canonicalStaff) {
      const staffId = staffMember._id;
      const taskStart = a.taskWindow.start;
      const taskEnd = a.taskWindow.end;
      await db.collection(COLLECTIONS.SCHEDULES).add({
        data: {
          flightId: `PUBLISH_${targetDate}_${a.flightNo}_${a.taskType}`,
          flightNo: a.flightNo,
          inboundFlightNo: a.inboundFlightNo || a.flightNo,
          outboundFlightNo: a.outboundFlightNo || a.flightNo,
          airline: a.airline || "",
          aircraftRegistration: a.aircraftRegistration || "",
          aircraftType: a.aircraftType || "",
          engineModel: a.engineModel || "",
          scheduledArrivalTime: a.scheduledArrivalTime || "",
          estimatedArrivalTime: a.estimatedArrivalTime || "",
          arrivalTime: a.estimatedArrivalTime || a.scheduledArrivalTime || "",
          scheduledDepartureTime: a.scheduledDepartureTime || "",
          departureTime: a.scheduledDepartureTime || "",
          scheduleDate: targetDate,
          shiftCode: getShiftCode(a.start),
          staffId,
          staffName: staffMember.name || staffMember.realName || "",
          staffEmployeeNo: staffMember.employeeNo || "",
          groupId: staffMember.groupId || "",
          openid: "",
          status: "ASSIGNED",
          recordStatus: "active",
          source: "ADMIN_ROLES",
          _taskType: a.taskType,
          _prepTime: Number(a.prepTime || 0),
          _wrapTime: Number(a.wrapTime || 0),
          _taskStart: taskStart,
          _taskEnd: taskEnd,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      writtenCount++;
    }
  }

  await logOperation("PUBLISH_SERVICE_SCHEDULE", `发布了 ${targetDate} 的勤务放行排班，共 ${writtenCount} 条任务`, { type: "serviceSchedule", scheduleDate: targetDate, writtenCount });
  cache.invalidate("SCHEDULE_TABLE");
  return ok({ scheduleDate: targetDate, writtenCount }, `发布成功，写入 ${writtenCount} 条`);
};

// ═══════════════════════════════════════════════
// 智能排班（勤务+放行双角色）
// ═══════════════════════════════════════════════
const smartScheduleWithRoles = async (event) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const data = event.data || {};
  const { scheduleDate, flights: flightInputs } = data;
  if (typeof scheduleDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(scheduleDate)) {
    return fail("排班日期格式错误", 400);
  }
  if (flightInputs !== undefined && (
    !Array.isArray(flightInputs) ||
    flightInputs.length > 100 ||
    !flightInputs.every((flight) =>
      flight &&
      typeof flight === "object" &&
      !Array.isArray(flight) &&
      [
        "flightNo", "inboundFlightNo", "outboundFlightNo", "airline",
        "aircraftRegistration", "aircraftType", "engineModel",
        "scheduledArrivalTime", "estimatedArrivalTime", "arrivalTime",
        "scheduledDepartureTime", "departureTime",
      ].every((field) =>
        flight[field] === undefined || typeof flight[field] === "string"
      )
    )
  )) return fail("航班数据格式错误", 400);

  // 加载配置
  const servicePrepTime = Number(await getSettingValue(SETTINGS_KEYS.SERVICE_PREP_TIME_MINUTES, 30));
  const serviceWrapTime = Number(await getSettingValue(SETTINGS_KEYS.SERVICE_WRAP_TIME_MINUTES, 15));
  const releasePrepTime = Number(await getSettingValue(SETTINGS_KEYS.RELEASE_PREP_TIME_MINUTES, 20));
  const releaseWrapTime = Number(await getSettingValue(SETTINGS_KEYS.RELEASE_WRAP_TIME_MINUTES, 10));
  const serviceRequiredCount = Number(await getSettingValue(SETTINGS_KEYS.SERVICE_REQUIRED_COUNT, 2));
  const releaseRequiredCount = Number(await getSettingValue(SETTINGS_KEYS.RELEASE_REQUIRED_COUNT, 1));
  const minRestInterval = Number(await getSettingValue(SETTINGS_KEYS.MIN_REST_INTERVAL_MINUTES, 30));
  const maxConsecutiveNightShifts = Number(await getSettingValue(SETTINGS_KEYS.MAX_CONSECUTIVE_NIGHT_SHIFTS, 2));
  const maxDailyWorkHours = Number(await getSettingValue(SETTINGS_KEYS.MAX_DAILY_WORK_HOURS, 12));

  // 加载人员（按角色分类）
  const staffRes = await db
    .collection(COLLECTIONS.STAFF)
    .where({ active: true })
    .limit(200)
    .get();
  const allStaff = await filterStaffAvailableOnDate(staffRes.data || [], scheduleDate);
  if (!allStaff.length) return fail("没有可用的维修人员", 404);

  const servicePool = allStaff.filter(s => s.roleType === "SERVICE" || s.roleType === "BOTH");
  const releasePool = allStaff.filter(s => s.roleType === "RELEASE" || s.roleType === "BOTH");
  if (!servicePool.length) return fail("没有可用的勤务人员", 404);
  if (!releasePool.length) return fail("没有可用的放行人员", 404);

  const staffIds = allStaff.map(s => s._id);

  // 加载目标日期之前 7 天的排班，用于疲劳度和夜班统计。
  const targetDateObject = new Date(`${scheduleDate}T00:00:00`);
  const sevenDaysAgo = new Date(targetDateObject);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const date7dAgo = formatDate(sevenDaysAgo);
  const weekScheduleRes = await db
    .collection(COLLECTIONS.SCHEDULES)
    .where({ staffId: _.in(staffIds), scheduleDate: _.gte(date7dAgo) })
    .limit(2000)
    .get();
  const weekSchedules = (weekScheduleRes.data || []).filter((schedule) =>
    schedule.scheduleDate < scheduleDate &&
    schedule.recordStatus !== "archived" &&
    schedule.status !== "CANCELLED"
  );

  // 构建周排班索引
  const dayMap = {};   // staffId → Set<date>
  const shiftMap = {}; // staffId → [shiftCode]
  weekSchedules.forEach(s => {
    if (!dayMap[s.staffId]) dayMap[s.staffId] = new Set();
    dayMap[s.staffId].add(s.scheduleDate);
    if (!shiftMap[s.staffId]) shiftMap[s.staffId] = [];
    shiftMap[s.staffId].push(s.shiftCode);
  });

  // 构建 groupId → staff 反向索引（同机位班组多样性用）
  const staffById = {};
  allStaff.forEach(s => { staffById[s._id] = s; });

  // 构建航班号 → 已分配人员列表（多样性约束用）
  const flightAssignedStaff = {}; // flightNo → [{staffId, groupId}]

  // 构建本次预览已分配任务数。
  const todayTaskCount = {}; // staffId → count

  // 疲劳度计算（简化版：基于连续天数 + 今日负荷 + 夜班 + 工时）
  const computeFatigueScore = (staffId) => {
    if (staffById[staffId] && staffById[staffId].onLeave) return 0;

    // a) 连续工作天数 (0~100)
    const dates = dayMap[staffId] || new Set();
    let continuous = 0;
    for (let i = 1; i <= 7; i++) {
      const d = new Date(targetDateObject);
      d.setDate(d.getDate() - i);
      if (dates.has(formatDate(d))) continuous++;
      else break;
    }
    const cdScore = Math.min(100, (continuous - 1) * 25);

    // b) 今日任务负荷 (0~100)
    const todayCount = todayTaskCount[staffId] || 0;
    const flScore = Math.min(100, todayCount * 20);

    // c) 夜班比例 (0~100)
    const shifts = shiftMap[staffId] || [];
    const nightCount = shifts.filter(s => s === "NIGHT").length;
    const nightRatio = shifts.length > 0 ? nightCount / shifts.length : 0;
    const ntScore = Math.min(100, Math.round(nightRatio * 70 + (shifts.length > 5 ? 30 : shifts.length * 6)));

    // d) 工时 (0~100)
    const hours = dates.size * 8 + Math.min(maxDailyWorkHours, todayCount * 2);
    let whScore = 0;
    if (hours >= 60) whScore = 80 + Math.min((hours - 60) * 2, 20);
    else if (hours >= 30) whScore = 40 + (hours - 30) * 1.33;
    else whScore = Math.max(0, hours * 1.33);

    // 综合评分（加权）
    const total = Math.round(cdScore * 0.30 + flScore * 0.25 + ntScore * 0.20 + whScore * 0.25);
    return Math.min(100, Math.max(0, total));
  };

  // 夜班检查
  const isNightTask = (taskStart) => {
    const h = taskStart.getHours();
    return h >= 18 || h < 6;
  };

  // 检查近N天夜班数是否超出限制
  const hasExceededNightShifts = (staffId) => {
    const shifts = shiftMap[staffId] || [];
    const recentNights = shifts.slice(-maxConsecutiveNightShifts).filter(s => s === "NIGHT").length;
    return recentNights >= maxConsecutiveNightShifts;
  };

  // 构建航班列表
  let flights = [];
  const now = new Date();
  if (Array.isArray(flightInputs) && flightInputs.length) {
    flights = flightInputs;
  } else {
    // 从数据库读取当日航班
    const flightRes = await db
      .collection(COLLECTIONS.FLIGHTS)
      .where({ scheduleDate })
      .limit(100)
      .get();
    flights = flightRes.data || [];
  }

  if (!flights.length) return fail("没有可排班的航班", 404);

  // ── 构建任务列表 ──
  function parseTime(dateStr, timeStr) {
    // 将 "HH:mm" 或 "T14:00" 等转换为 Date
    let str = String(timeStr || "");
    if (!str) return null;
    // 如果包含 T，取 T 后面的时间
    if (str.includes("T")) str = str.split("T")[1];
    const parts = str.split(":");
    if (parts.length < 2) return null;
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return null;
    const d = new Date(scheduleDate);
    d.setHours(h, m, 0, 0);
    return d;
  }

  // 勤务任务列表 + 放行任务列表
  const serviceTasks = [];
  const releaseTasks = [];

  flights.forEach((f, idx) => {
    const flightNo = f.flightNo || `FLT${idx}`;
    // P2 修复: 原代码由于运算符优先级, parseTime 实际是死代码（f.arrivalTime 永真）
    // 修正: parseTime 成功时用 parseTime 结果; 失败才回退到 new Date(原始字符串)
    const arrivalValue = f.estimatedArrivalTime || f.arrivalTime || f.scheduledArrivalTime;
    const _arr = parseTime(scheduleDate, arrivalValue);
    const _dep = parseTime(scheduleDate, f.departureTime);
    const arrivalTime = _arr || (arrivalValue ? new Date(arrivalValue) : null);
    const departureTime = _dep || (f.departureTime ? new Date(f.departureTime) : null);

    if (arrivalTime) {
      // 勤务任务（围绕到港）
      const taskStart = new Date(arrivalTime.getTime() - servicePrepTime * 60000);
      const taskEnd = new Date(arrivalTime.getTime() + serviceWrapTime * 60000);
      serviceTasks.push({
        id: `SVC-${idx}`,
        flightIdx: idx,
        flightNo,
        inboundFlightNo: f.inboundFlightNo || f.inboundFlight || flightNo,
        outboundFlightNo: f.outboundFlightNo || f.outboundFlight || flightNo,
        airline: f.airline || "",
        aircraftRegistration: f.aircraftRegistration || f.aircraftReg || "",
        aircraftType: f.aircraftType || "",
        engineModel: f.engineModel || "",
        scheduledArrivalTime: f.scheduledArrivalTime || f.arrivalTime || "",
        estimatedArrivalTime: f.estimatedArrivalTime || "",
        scheduledDepartureTime: f.scheduledDepartureTime || f.departureTime || "",
        start: taskStart,
        end: taskEnd,
        arrivalTime,
        departureTime,
        taskType: "SERVICE",
        requiredCount: serviceRequiredCount,
        assigned: [],
      });
    }

    if (departureTime) {
      // 放行任务（围绕离港）
      const taskStart = new Date(departureTime.getTime() - releasePrepTime * 60000);
      const taskEnd = new Date(departureTime.getTime() + releaseWrapTime * 60000);
      releaseTasks.push({
        id: `REL-${idx}`,
        flightIdx: idx,
        flightNo,
        inboundFlightNo: f.inboundFlightNo || f.inboundFlight || flightNo,
        outboundFlightNo: f.outboundFlightNo || f.outboundFlight || flightNo,
        airline: f.airline || "",
        aircraftRegistration: f.aircraftRegistration || f.aircraftReg || "",
        aircraftType: f.aircraftType || "",
        engineModel: f.engineModel || "",
        scheduledArrivalTime: f.scheduledArrivalTime || f.arrivalTime || "",
        estimatedArrivalTime: f.estimatedArrivalTime || "",
        scheduledDepartureTime: f.scheduledDepartureTime || f.departureTime || "",
        start: taskStart,
        end: taskEnd,
        arrivalTime,
        departureTime,
        taskType: "RELEASE",
        requiredCount: releaseRequiredCount,
        assigned: [],
      });
    }
  });

  // 按开始时间排序
  serviceTasks.sort((a, b) => a.start - b.start);
  releaseTasks.sort((a, b) => a.start - b.start);

  // ── 贪心分配 ──
  // 每个人维护任务链
  const chains = {};

  function initChain(staff) {
    if (!chains[staff._id]) {
      chains[staff._id] = {
        staffId: staff._id,
        name: staff.name,
        employeeNo: staff.employeeNo,
        roleType: staff.roleType,
        groupId: staff.groupId,
        tasks: [],
        dutyStart: null,
        dutyEnd: null,
        gaps: [],
        effectiveMinutes: 0,
        totalDutyMinutes: 0,
      };
    }
    return chains[staff._id];
  }

  function assignTaskToStaff(task, staff) {
    const chain = initChain(staff);
    const taskStart = task.start;
    const taskEnd = task.end;

    chain.tasks.push({
      flightNo: task.flightNo,
      taskType: task.taskType,
      taskId: task.id,
      start: new Date(taskStart),
      end: new Date(taskEnd),
      prepTime: task.taskType === "SERVICE" ? servicePrepTime : releasePrepTime,
      wrapTime: task.taskType === "SERVICE" ? serviceWrapTime : releaseWrapTime,
    });
    chain.tasks.sort((a, b) => a.start - b.start);
    chain.dutyStart = new Date(chain.tasks[0].start);
    chain.dutyEnd = new Date(chain.tasks[chain.tasks.length - 1].end);
    chain.effectiveMinutes = chain.tasks.reduce(
      (sum, current) => sum + (current.end.getTime() - current.start.getTime()) / 60000,
      0
    );
    chain.gaps = [];
    for (let index = 1; index < chain.tasks.length; index += 1) {
      const previous = chain.tasks[index - 1];
      const current = chain.tasks[index];
      const gapMinutes = (current.start.getTime() - previous.end.getTime()) / 60000;
      if (gapMinutes > 0) {
        chain.gaps.push({
          start: new Date(previous.end),
          end: new Date(current.start),
          minutes: Math.round(gapMinutes),
        });
      }
    }
    todayTaskCount[staff._id] = (todayTaskCount[staff._id] || 0) + 1;

    // 更新分配记录
    task.assigned.push({
      staffId: staff._id,
      name: staff.name,
      employeeNo: staff.employeeNo,
      roleType: staff.roleType,
      groupId: staff.groupId || "",
      taskIndex: chain.tasks.length,
    });
  }

  function findBestStaff(task, pool, assignedSet) {
    const candidates = pool
      .filter(s =>
        !assignedSet.has(s._id) &&
        hasQualification(s, task.airline, task.aircraftType)
      )
      .map(s => {
        const chain = chains[s._id];
        let cost = 0;
        const existingTasks = chain ? chain.tasks || [] : [];
        let nearestGap = Number.POSITIVE_INFINITY;
        for (const existingTask of existingTasks) {
          if (existingTask.start < task.end && existingTask.end > task.start) {
            return null;
          }
          const gapMinutes = existingTask.end <= task.start
            ? (task.start.getTime() - existingTask.end.getTime()) / 60000
            : (existingTask.start.getTime() - task.end.getTime()) / 60000;
          nearestGap = Math.min(nearestGap, gapMinutes);
        }
        if (existingTasks.length && nearestGap < minRestInterval) return null;
        if (Number.isFinite(nearestGap)) {
          cost += nearestGap > minRestInterval
            ? nearestGap * 0.5
            : Math.max(0, minRestInterval - nearestGap) * 0.1;
        }

        if (isNightTask(task.start) && hasExceededNightShifts(s._id)) return null;

        const proposedStart = chain && chain.dutyStart && chain.dutyStart < task.start
          ? chain.dutyStart
          : task.start;
        const proposedEnd = chain && chain.dutyEnd && chain.dutyEnd > task.end
          ? chain.dutyEnd
          : task.end;
        const proposedDutyMinutes = (proposedEnd.getTime() - proposedStart.getTime()) / 60000;
        if (proposedDutyMinutes > maxDailyWorkHours * 60) {
          return null;
        }

        // 已有更多任务的人优先（连续利用率高）
        if (chain) cost -= chain.tasks.length * 2;
        if (task.taskType === "RELEASE" && s.roleType === "BOTH") cost += 8;
        if (task.taskType === "SERVICE" && s.roleType === "BOTH") cost += 4;

        // 疲劳度惩罚
        const fatigue = computeFatigueScore(s._id);
        cost += fatigue * 15;

        return { staff: s, cost };
      })
      .filter(Boolean)
      .sort((a, b) => a.cost - b.cost);

    if (!candidates.length) return null;
    return candidates[0].staff;
  }

  // 将勤务与放行任务按时间统一排序，避免分角色批量处理造成跨角色时间冲突。
  const allocationTasks = [...serviceTasks, ...releaseTasks]
    .sort((a, b) => a.start - b.start || a.taskType.localeCompare(b.taskType));
  allocationTasks.forEach(task => {
    const assignedForTask = new Set();
    for (let i = 0; i < task.requiredCount; i++) {
      const basePool = task.taskType === "SERVICE" ? servicePool : releasePool;
      const alreadyAssigned = flightAssignedStaff[task.flightNo] || [];
      const diversePool = i > 0
        ? basePool.filter((staff) => !alreadyAssigned.some((assigned) =>
          assigned.groupId && staff.groupId && assigned.groupId === staff.groupId
        ))
        : basePool;
      const best = findBestStaff(
        task,
        diversePool.length ? diversePool : basePool,
        assignedForTask
      );
      if (best) {
        assignTaskToStaff(task, best);
        assignedForTask.add(best._id);
        if (!flightAssignedStaff[task.flightNo]) flightAssignedStaff[task.flightNo] = [];
        flightAssignedStaff[task.flightNo].push({
          staffId: best._id,
          groupId: best.groupId || "",
        });
      }
    }
  });

  // ── 组装返回数据 ──
  const staffChains = Object.values(chains);
  staffChains.forEach(c => {
    c.totalDutyMinutes = c.dutyStart && c.dutyEnd
      ? Math.round((c.dutyEnd.getTime() - c.dutyStart.getTime()) / 60000)
      : 0;
    c.efficiency = c.totalDutyMinutes > 0
      ? Math.round((c.effectiveMinutes / c.totalDutyMinutes) * 100)
      : 0;
  });

  const allTasks = [...serviceTasks, ...releaseTasks];
  const unfilledTasks = allTasks.filter((task) => task.assigned.length < task.requiredCount);
  const assignments = allTasks.map(t => ({
    flightNo: t.flightNo,
    inboundFlightNo: t.inboundFlightNo,
    outboundFlightNo: t.outboundFlightNo,
    airline: t.airline,
    aircraftRegistration: t.aircraftRegistration,
    aircraftType: t.aircraftType,
    engineModel: t.engineModel,
    scheduledArrivalTime: t.scheduledArrivalTime,
    estimatedArrivalTime: t.estimatedArrivalTime,
    scheduledDepartureTime: t.scheduledDepartureTime,
    taskType: t.taskType,
    taskId: t.id,
    staff: t.assigned,
    prepTime: t.taskType === "SERVICE" ? servicePrepTime : releasePrepTime,
    wrapTime: t.taskType === "SERVICE" ? serviceWrapTime : releaseWrapTime,
    taskWindow: {
      start: formatDateTimeLocal(t.start),
      end: formatDateTimeLocal(t.end),
    },
  }));

  const totalWasted = staffChains.reduce((s, c) => {
    return s + c.gaps.reduce((sg, g) => sg + g.minutes, 0);
  }, 0);

  return ok({
    scheduleDate,
    assignments,
    staffChains: staffChains.map(c => ({
      ...c,
      dutyStart: c.dutyStart ? formatDateTimeLocal(c.dutyStart) : "",
      dutyEnd: c.dutyEnd ? formatDateTimeLocal(c.dutyEnd) : "",
      tasks: c.tasks.map(t => ({
        ...t,
        start: formatDateTimeLocal(t.start),
        end: formatDateTimeLocal(t.end),
      })),
      gaps: c.gaps.map(g => ({
        ...g,
        start: formatDateTimeLocal(g.start),
        end: formatDateTimeLocal(g.end),
      })),
    })),
    stats: {
      totalFlights: flights.length,
      totalServiceTasks: serviceTasks.length,
      totalReleaseTasks: releaseTasks.length,
      totalStaffUsed: staffChains.length,
      avgEfficiency: staffChains.length
        ? Math.round(staffChains.reduce((s, c) => s + c.efficiency, 0) / staffChains.length)
        : 0,
      wastedMinutes: totalWasted,
      unfilledTaskCount: unfilledTasks.length,
      missingStaffCount: unfilledTasks.reduce(
        (sum, task) => sum + Math.max(0, task.requiredCount - task.assigned.length),
        0
      ),
    },
  }, unfilledTasks.length
    ? `预览已生成，但有 ${unfilledTasks.length} 个任务人员不足`
    : `勤务与放行排班预览已生成，共 ${assignments.length} 个任务`);
};

// ═══════════════════════════════════════════════
// 排班完成确认 / 排班状态 / 历史
// ═══════════════════════════════════════════════
const completeSchedule = async (event) => {
  const payload = event.data || {};
  if (typeof payload.scheduleId !== "string") return fail("排班记录ID类型错误", 400);
  if (payload.completionRemark !== undefined && typeof payload.completionRemark !== "string") {
    return fail("完成备注类型错误", 400);
  }
  const scheduleId = payload.scheduleId.trim();
  const completionRemark = String(payload.completionRemark || "").trim().slice(0, 200);
  if (!scheduleId) return fail("缺少排班记录ID", 400);

  const { openid } = getOpenContext();
  const staffRes = await db
    .collection(COLLECTIONS.STAFF)
    .where({ openid })
    .limit(1)
    .get();
  if (!staffRes.data.length) return fail("当前未登录", 404);
  const staff = staffRes.data[0];

  const scheduleRes = await db
    .collection(COLLECTIONS.SCHEDULES)
    .doc(scheduleId)
    .get();
  if (!scheduleRes.data) return fail("排班记录不存在", 404);

  const schedule = scheduleRes.data;
  if (schedule.staffId !== staff._id) return fail("无权操作他人的排班", 403);
  if (schedule.status === "COMPLETED") return fail("该排班已完成，无需重复操作", 409);
  if (schedule.recordStatus !== undefined && schedule.recordStatus !== "active") {
    return fail("当前排班不是有效发布版本，不能确认完成", 409);
  }
  if (!["ASSIGNED", "SWAPPED", "IN_PROGRESS"].includes(schedule.status)) {
    return fail(`当前状态 ${schedule.status || "未知"} 不允许确认完成`, 409);
  }
  if (schedule.needsReassignment === true) {
    return fail("该排班存在请假冲突，需由管理员先完成改派", 409);
  }

  const today = formatDate(new Date());
  if (
    typeof schedule.scheduleDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(schedule.scheduleDate)
  ) {
    return fail("排班日期无效，请联系管理员修正", 409);
  }
  if (schedule.scheduleDate > today) {
    return fail("未到排班执行日期，不能提前确认完成", 409);
  }
  const completionStartDate = formatDate(new Date(Date.now() - COMPLETION_GRACE_DAYS * 24 * 60 * 60 * 1000));
  if (schedule.scheduleDate < completionStartDate) {
    return fail(`排班确认窗口已关闭，仅支持任务日期后 ${COMPLETION_GRACE_DAYS} 天内补确认`, 409);
  }
  const publicationManaged = !schedule._taskType || Boolean(schedule.publishBatchId);
  const publicationState = publicationManaged
    ? await getSchedulePublicationState(schedule.scheduleDate, false)
    : { version: 0, activeBatchId: "" };
  if (publicationManaged && publicationState.activeBatchId) {
    if (
      schedule.publishBatchId !== publicationState.activeBatchId ||
      Number(schedule.publicationVersion) !== publicationState.version
    ) {
      return fail("排班已被新的发布版本替换，不能确认完成", 409);
    }
  } else if (publicationManaged && schedule.publishBatchId) {
    return fail("当前排班不是有效发布版本，不能确认完成", 409);
  }
  const approvedLeaveEmployeeNos = await getApprovedLeaveEmployeeNos(schedule.scheduleDate);
  if (approvedLeaveEmployeeNos.has(staff.employeeNo)) {
    return fail("该日期处于已批准请假区间，不能确认完成", 409);
  }

  const completedAt = new Date();
  const completionWhere = {
    _id: scheduleId,
    staffId: staff._id,
    status: schedule.status,
    recordStatus: schedule.recordStatus === undefined ? _.exists(false) : "active",
  };
  if (publicationManaged && publicationState.activeBatchId) {
    completionWhere.publishBatchId = publicationState.activeBatchId;
    completionWhere.publicationVersion = publicationState.version;
  } else if (publicationManaged) {
    completionWhere.publishBatchId = _.exists(false);
  }
  const completionUpdate = await db.collection(COLLECTIONS.SCHEDULES).where(completionWhere).update({
    data: {
      status: "COMPLETED",
      completedAt,
      completedByOpenid: openid,
      completionRemark,
      updatedAt: completedAt,
    },
  });
  if (Number(completionUpdate && completionUpdate.stats && completionUpdate.stats.updated || 0) !== 1) {
    return fail("排班状态已更新，请刷新后重试", 409);
  }

  cache.invalidate("SCHEDULE_TABLE");
  await logOperation(
    "COMPLETE_SCHEDULE",
    `${staff.name}（${staff.employeeNo}）确认完成 ${schedule.scheduleDate} ${schedule.flightNo || "排班任务"}`,
    {
      type: "schedule",
      scheduleId,
      scheduleDate: schedule.scheduleDate,
      flightNo: schedule.flightNo || "",
      completionRemark,
    }
  );
  return ok({ scheduleId, status: "COMPLETED", completedAt }, "已标记为完成");
};

const getScheduleStatusOverview = async (event) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { groupId, startDate, endDate } = event.data || {};
  const groupAliasMap = {
    group_a: "A组", group_b: "B组", group_c: "C组", group_d: "D组",
    group_e: "E组", group_f: "F组", group_g: "G组", group_h: "H组",
  };
  const safeGroupId = typeof groupId === "string"
    ? groupAliasMap[groupId] || groupId
    : groupId;

  if (startDate !== undefined && (
    typeof startDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(startDate)
  )) return fail("起始日期格式错误", 400);
  if (endDate !== undefined && (
    typeof endDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(endDate)
  )) return fail("结束日期格式错误", 400);
  if (groupId !== undefined && (
    typeof groupId !== "string" ||
    !/^[A-H]组$/.test(safeGroupId)
  )) return fail("班组格式错误", 400);

  const end = endDate || formatDate(new Date());
  const start = startDate || formatDate(
    new Date(new Date(end).getTime() - 29 * 24 * 60 * 60 * 1000)
  );
  if (start > end) return fail("起始日期不能晚于结束日期", 400);
  const rangeDays = Math.round(
    (new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime()) / 86400000
  );
  if (rangeDays > 366) return fail("统计区间不能超过 366 天", 400);

  // 按班组筛选时收集对应员工ID
  let staffIdFilter = null;
  if (safeGroupId) {
    const staffRes = await db
      .collection(COLLECTIONS.STAFF)
      .where({ groupId: safeGroupId })
      .limit(200)
      .get();
    staffIdFilter = (staffRes.data || []).map(s => s._id);
    if (!staffIdFilter.length) {
      return ok({
        dateRange: { start, end }, groupId: safeGroupId,
        total: 0, completed: 0, pending: 0,
        completedRate: "0.0", pendingRate: "0.0",
        dailyBreakdown: [],
      });
    }
  }

  const query = { scheduleDate: _.gte(start) };
  if (staffIdFilter) query.staffId = _.in(staffIdFilter);

  const scheduleRes = await db
    .collection(COLLECTIONS.SCHEDULES)
    .where(query)
    .orderBy("scheduleDate", "asc")
    .limit(1000)
    .get();

  const allSchedules = (scheduleRes.data || []).filter(s =>
    s.scheduleDate <= end &&
    s.recordStatus !== "archived" &&
    s.status !== "CANCELLED"
  );

  const total = allSchedules.length;
  const completed = allSchedules.filter(s => s.status === "COMPLETED").length;
  const pending = total - completed;

  // 每日明细
  const dayMap = new Map();
  allSchedules.forEach(s => {
    if (!dayMap.has(s.scheduleDate)) {
      dayMap.set(s.scheduleDate, { date: s.scheduleDate, total: 0, completed: 0 });
    }
    const entry = dayMap.get(s.scheduleDate);
    entry.total += 1;
    if (s.status === "COMPLETED") entry.completed += 1;
  });
  const dailyBreakdown = Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  dailyBreakdown.forEach(d => { d.pending = d.total - d.completed; });

  return ok({
    dateRange: { start, end },
    groupId: safeGroupId || null,
    total,
    completed,
    pending,
    completedRate: total > 0 ? ((completed / total) * 100).toFixed(1) : "0.0",
    pendingRate: total > 0 ? ((pending / total) * 100).toFixed(1) : "0.0",
    dailyBreakdown,
  });
};

const getScheduleHistory = async (event) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const rawDate = (event.data || {}).scheduleDate;
  if (rawDate !== undefined && (
    typeof rawDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)
  )) return fail("排班日期格式错误", 400);
  const date = rawDate || formatDate(new Date());

  // 获取所有排班记录（包括存档和活跃）
  const schedRes = await db.collection(COLLECTIONS.SCHEDULES)
    .where({ scheduleDate: date })
    .limit(500)
    .get();
  const schedules = schedRes.data || [];

  // 按当前可见批次分组。首次版本化前仍兼容历史 active 记录；切换后旧批次
  // 即使物理记录保留，也不能再被当作当前排班。
  const publicationState = await getSchedulePublicationState(date, false);
  const active = schedules.filter((schedule) => isCurrentPublicationRecord(schedule, publicationState));
  const archived = schedules.filter((schedule) => !isCurrentPublicationRecord(schedule, publicationState));

  // 获取发布操作日志（集合不存在时降级）
  let publishLogs = [];
  try {
    await ensureCollection(COLLECTIONS.OPERATION_LOGS);
    const logRes = await db.collection(COLLECTIONS.OPERATION_LOGS)
      .where({
        action: _.in(["PUBLISH_SCHEDULE", "PUBLISH_SERVICE_SCHEDULE"]),
      })
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();
    publishLogs = (logRes.data || []).filter(l => {
      if (l.target && l.target.scheduleDate === date) return true;
      const detail = l.detail || "";
      return detail.indexOf(date) !== -1;
    });
  } catch (error) {
    publishLogs = [];
  }

  return ok({
    scheduleDate: date,
    activeCount: active.length,
    archivedCount: archived.length,
    active,
    archived,
    publishHistory: publishLogs.map(l => ({
      action: l.action,
      operator: l.operator,
      detail: l.detail,
      createdAt: l.createdAt,
    })),
  });
};

// ═════════─────────════════════════════════════
// 路由表
// ═══════════════════════════════════════════════
module.exports = {
  getStaffScheduleTable,
  getMySchedules,
  getServiceScheduleTable,
  publishScheduleEdits,
  preflightComplianceCheck,
  smartSchedule,
  smartScheduleMultiDay,
  smartScheduleSingle,
  smartScheduleWithRoles,
  publishServiceSchedule,
  completeSchedule,
  getScheduleHistory,
  getScheduleStatusOverview,
  getScheduleStatistics,
  importScheduleFromTSV,
  optimizeStaffSchedule,
  exportSchedule,
};
