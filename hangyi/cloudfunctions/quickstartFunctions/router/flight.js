/**
 * flight.js - 航班主数据、风险中心与业务分析
 * 涵盖：updateFlightOperationalData、getRiskCenterDashboard、getWarningAnalytics、
 *       getMaintenanceForecast、getFatigueScores、getQualificationStatus
 */
const {
  db, _, COLLECTIONS, SETTINGS_KEYS,
  ok, fail, logOperation,
  formatDate, getShiftHours,
  normalizeAirlineName, normalizeAircraftType, hasQualification,
  getSettingValue, requireAdmin, getOpenContext,
} = require("../utils");
const cache = require("../cache");

const DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

const isCurrentPublishedSchedule = (schedule, publicationStates) => {
  if (!schedule || schedule.recordStatus === "archived" || schedule.recordStatus === "staged") return false;
  if (schedule._taskType && !schedule.publishBatchId) return true;
  const state = publicationStates.get(schedule.scheduleDate) || { version: 0, activeBatchId: "" };
  if (!state.activeBatchId) return !schedule.publishBatchId;
  return schedule.publishBatchId === state.activeBatchId &&
    Number(schedule.publicationVersion) === state.version;
};

const getPublicationStates = async (dates) => {
  const uniqueDates = Array.from(new Set((dates || []).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))));
  const states = new Map();
  if (!uniqueDates.length) return states;
  const result = await db.collection(COLLECTIONS.SCHEDULE_VERSIONS)
    .where({ scheduleDate: _.in(uniqueDates.slice(0, 100)) })
    .limit(100)
    .get();
  (result.data || []).forEach((item) => {
    states.set(item.scheduleDate, {
      version: Number(item.version) || 0,
      activeBatchId: typeof item.activeBatchId === "string" ? item.activeBatchId : "",
    });
  });
  return states;
};

// ──────────────────────────────────────────────
// 管理员维护航班运行数据
// ──────────────────────────────────────────────
const updateFlightOperationalData = async (event) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const payload = event.data || {};
  const stringFields = [
    "flightId", "flightNo", "scheduleDate", "engineModel", "aircraftType",
    "aircraftRegistration", "estimatedArrivalTime",
  ];
  for (const field of stringFields) {
    if (payload[field] !== undefined && typeof payload[field] !== "string") {
      return fail(`${field} 参数类型错误`, 400);
    }
  }

  const flightId = String(payload.flightId || "").trim();
  const flightNo = String(payload.flightNo || "").trim().toUpperCase();
  const scheduleDate = String(payload.scheduleDate || "").trim();
  const engineModel = String(payload.engineModel || "").trim().slice(0, 60);
  const rawAircraftType = String(payload.aircraftType || "").trim();
  const aircraftType = payload.aircraftType === undefined || !rawAircraftType
    ? ""
    : normalizeAircraftType(rawAircraftType);
  const aircraftRegistration = String(payload.aircraftRegistration || "")
    .trim().toUpperCase().slice(0, 30);
  const estimatedArrivalTime = String(payload.estimatedArrivalTime || "").trim();

  if (!flightId && (!flightNo || !scheduleDate)) {
    return fail("请提供航班ID，或航班号与日期", 400);
  }
  if (flightNo && !/^[A-Z0-9_-]{1,20}$/.test(flightNo)) {
    return fail("航班号格式错误", 400);
  }
  if (scheduleDate && !/^\d{4}-\d{2}-\d{2}$/.test(scheduleDate)) {
    return fail("航班日期格式错误", 400);
  }
  if (estimatedArrivalTime && !DATE_TIME_RE.test(estimatedArrivalTime)) {
    return fail("预计到达时间格式错误", 400);
  }
  const hasEditableField = [
    "engineModel",
    "aircraftType",
    "aircraftRegistration",
    "estimatedArrivalTime",
  ].some((field) => Object.prototype.hasOwnProperty.call(payload, field));
  if (!hasEditableField) {
    return fail("没有需要更新的航班字段", 400);
  }

  let flight = null;
  if (flightId) {
    const flightRes = await db.collection(COLLECTIONS.FLIGHTS).doc(flightId).get();
    flight = flightRes.data || null;
  }
  if (!flight && flightNo && scheduleDate) {
    const flightRes = await db.collection(COLLECTIONS.FLIGHTS)
      .where({ flightNo, scheduleDate })
      .limit(1)
      .get();
    flight = flightRes.data && flightRes.data[0] || null;
  }
  if (!flight && flightNo && scheduleDate) {
    const scheduleSeedRes = await db.collection(COLLECTIONS.SCHEDULES)
      .where({ flightNo, scheduleDate })
      .limit(1)
      .get();
    const seed = scheduleSeedRes.data && scheduleSeedRes.data[0];
    if (seed) {
      const addRes = await db.collection(COLLECTIONS.FLIGHTS).add({
        data: {
          key: `${flightNo}_${scheduleDate}`,
          flightNo,
          inboundFlightNo: seed.inboundFlightNo || flightNo,
          outboundFlightNo: seed.outboundFlightNo || flightNo,
          airline: seed.airline || "",
          aircraftRegistration: seed.aircraftRegistration || "",
          aircraftType: seed.aircraftType || "",
          engineModel: seed.engineModel || "",
          scheduledArrivalTime: seed.scheduledArrivalTime || seed.arrivalTime || "",
          estimatedArrivalTime: seed.estimatedArrivalTime || "",
          arrivalTime: seed.estimatedArrivalTime || seed.arrivalTime || "",
          scheduledDepartureTime: seed.scheduledDepartureTime || seed.departureTime || "",
          departureTime: seed.departureTime || "",
          scheduleDate,
          stayHours: Number(seed.stayHours || 0),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      flight = { ...seed, _id: addRes._id, flightNo, scheduleDate };
    }
  }
  if (!flight) return fail("未找到航班记录", 404);
  if (
    estimatedArrivalTime &&
    flight.scheduleDate &&
    !estimatedArrivalTime.startsWith(`${flight.scheduleDate}T`)
  ) {
    return fail("预计到达时间必须与航班日期一致", 400);
  }

  const now = new Date();
  const updateData = { updatedAt: now };
  if (payload.engineModel !== undefined) updateData.engineModel = engineModel;
  if (payload.aircraftType !== undefined) updateData.aircraftType = aircraftType;
  if (payload.aircraftRegistration !== undefined) {
    updateData.aircraftRegistration = aircraftRegistration;
  }
  if (payload.estimatedArrivalTime !== undefined) {
    updateData.estimatedArrivalTime = estimatedArrivalTime;
    updateData.arrivalTime = estimatedArrivalTime || flight.scheduledArrivalTime || flight.arrivalTime || "";
    updateData.estimatedArrivalSource = estimatedArrivalTime ? "MANUAL" : "";
    updateData.estimatedArrivalUpdatedAt = now;
    updateData.estimatedArrivalUpdatedBy = guard.staff.employeeNo;
  }

  await db.collection(COLLECTIONS.FLIGHTS).doc(flight._id).update({ data: updateData });

  // P1 修复: 分页处理该航班全部关联排班，避免超过 200 条时主数据与排班不一致
  let syncedScheduleCount = 0;
  let scheduleSkip = 0;
  const SCHEDULE_PAGE_SIZE = 200;
  for (;;) {
    const scheduleRes = await db.collection(COLLECTIONS.SCHEDULES)
      .where({
        flightNo: flight.flightNo,
        scheduleDate: flight.scheduleDate,
      })
      .skip(scheduleSkip)
      .limit(SCHEDULE_PAGE_SIZE)
      .get();
    const pageSchedules = scheduleRes.data || [];
    if (!pageSchedules.length) break;
    for (const schedule of pageSchedules) {
      const scheduleUpdate = { updatedAt: now };
      if (updateData.engineModel !== undefined) scheduleUpdate.engineModel = updateData.engineModel;
      if (updateData.aircraftType !== undefined) scheduleUpdate.aircraftType = updateData.aircraftType;
      if (updateData.aircraftRegistration !== undefined) {
        scheduleUpdate.aircraftRegistration = updateData.aircraftRegistration;
      }
      if (updateData.estimatedArrivalTime !== undefined) {
        scheduleUpdate.estimatedArrivalTime = updateData.estimatedArrivalTime;
        scheduleUpdate.arrivalTime = updateData.arrivalTime;
        scheduleUpdate.estimatedArrivalSource = updateData.estimatedArrivalSource;
      }
      await db.collection(COLLECTIONS.SCHEDULES).doc(schedule._id).update({
        data: scheduleUpdate,
      });
      syncedScheduleCount += 1;
    }
    scheduleSkip += pageSchedules.length;
  }
  cache.invalidate("SCHEDULE_TABLE");

  await logOperation(
    "UPDATE_FLIGHT_OPERATIONAL_DATA",
    `${guard.staff.name}（${guard.staff.employeeNo}）更新 ${flight.flightNo} 航班运行数据`,
    {
      type: "flight",
      flightId: flight._id,
      flightNo: flight.flightNo,
      scheduleDate: flight.scheduleDate,
      before: {
        aircraftType: flight.aircraftType || "",
        engineModel: flight.engineModel || "",
        aircraftRegistration: flight.aircraftRegistration || "",
        estimatedArrivalTime: flight.estimatedArrivalTime || "",
      },
      after: updateData,
      affectedScheduleCount: syncedScheduleCount,
    }
  );

  return ok({
    flightId: flight._id,
    flightNo: flight.flightNo,
    scheduleDate: flight.scheduleDate,
    affectedScheduleCount: syncedScheduleCount,
    updated: updateData,
  }, "航班运行数据已更新");
};

// ──────────────────────────────────────────────
// 风险中心仪表盘
// ──────────────────────────────────────────────
const getRiskCenterDashboard = async (event) => {
  const days = Math.min(Math.max(Number((event.data || {}).days || 7), 3), 30);
  const endDateObj = new Date();
  const startDateObj = new Date(endDateObj.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  const startDate = formatDate(startDateObj);
  const endDate = formatDate(endDateObj);
  const maxDailyWorkHours = Number(
    await getSettingValue(SETTINGS_KEYS.MAX_DAILY_WORK_HOURS, 12)
  );

  const [flightsRes, staffsRes, todaySchedulesRes] = await Promise.all([
    db
      .collection(COLLECTIONS.FLIGHTS)
      .where({ scheduleDate: _.gte(startDate) })
      .orderBy("scheduleDate", "asc")
      .limit(3000)
      .get(),
    db.collection(COLLECTIONS.STAFF).orderBy("employeeNo", "asc").limit(500).get(),
    db
      .collection(COLLECTIONS.SCHEDULES)
      .where({ scheduleDate: endDate })
      .orderBy("createdAt", "desc")
      .limit(2000)
      .get(),
  ]);

  const flights = (flightsRes.data || []).filter(
    (item) => item.scheduleDate && item.scheduleDate >= startDate && item.scheduleDate <= endDate
  );
  const publicationStates = await getPublicationStates([endDate]);
  const activeSchedules = (todaySchedulesRes.data || []).filter((item) =>
    item.status !== "CANCELLED" &&
    item.needsReassignment !== true &&
    isCurrentPublishedSchedule(item, publicationStates)
  );
  const workedHoursMap = new Map();
  activeSchedules.forEach((item) => {
    if (!item.staffId) return;
    workedHoursMap.set(
      item.staffId,
      Number(workedHoursMap.get(item.staffId) || 0) + Number(getShiftHours(item.shiftCode) || 0)
    );
  });

  const staffs = staffsRes.data || [];
  const staffMap = new Map(staffs.map((staff) => [staff._id, staff]));
  const qualificationIssueCount = activeSchedules.filter((schedule) => {
    const staff = staffMap.get(schedule.staffId);
    if (!staff || !schedule.airline || schedule.airline === "管理员发布" || !schedule.aircraftType) {
      return false;
    }
    return !hasQualification(staff, schedule.airline, schedule.aircraftType);
  }).length;
  // 待改派记录不参与工时/资质统计, 但仍要单独报告数量, 从全量中统计。
  const reassignmentCount = (todaySchedulesRes.data || []).filter(
    (item) => item.status !== "CANCELLED" && item.needsReassignment === true
  ).length;
  const overworkStaffCount = Array.from(workedHoursMap.values())
    .filter((hours) => hours > maxDailyWorkHours).length;
  const availableStaffRows = staffs.filter((staff) => {
    if (staff.active === false || staff.onLeave === true) return false;
    const workedHours = Number(workedHoursMap.get(staff._id) || 0);
    return workedHours <= maxDailyWorkHours;
  });

  const buildRatioRows = (items, getter) => {
    const map = new Map();
    items.forEach((item) => {
      const key = getter(item) || "未知";
      map.set(key, Number(map.get(key) || 0) + 1);
    });
    const total = items.length || 0;
    const rows = Array.from(map.entries())
      .map(([name, count]) => {
        const ratio = total > 0 ? count / total : 0;
        return {
          name,
          count,
          ratio,
          ratioText: `${(ratio * 100).toFixed(1)}%`,
        };
      })
      .sort((a, b) => b.count - a.count || String(a.name).localeCompare(String(b.name)));
    return { total, rows };
  };

  const aircraftStats = buildRatioRows(flights, (item) => item.aircraftType);
  const airlineStats = buildRatioRows(flights, (item) => normalizeAirlineName(item.airline));

  const cloudWords = [
    {
      text: `待改派${reassignmentCount}`,
      value: Math.max(reassignmentCount, 1),
      type: "metric",
    },
    {
      text: `可用${availableStaffRows.length}`,
      value: Math.max(availableStaffRows.length, 1),
      type: "metric",
    },
    {
      text: `资质异常${qualificationIssueCount}`,
      value: Math.max(qualificationIssueCount, 1),
      type: "metric",
    },
    {
      text: `工时超限${overworkStaffCount}`,
      value: Math.max(overworkStaffCount, 1),
      type: "metric",
    },
    ...aircraftStats.rows.map((item) => ({
      text: `${item.name} ${item.ratioText}`,
      value: Math.max(item.count, 1),
      type: "aircraft",
    })),
    ...airlineStats.rows.map((item) => ({
      text: `${item.name} ${item.ratioText}`,
      value: Math.max(item.count, 1),
      type: "airline",
    })),
  ];

  return ok({
    days,
    startDate,
    endDate,
    availableStaffCount: availableStaffRows.length,
    availableStaffTotal: staffs.length,
    reassignmentCount,
    qualificationIssueCount,
    overworkStaffCount,
    maxDailyWorkHours,
    aircraftTypeStats: aircraftStats,
    airlineStats,
    cloudWords,
  });
};

// ──────────────────────────────────────────────
// 预警分析（人员工时排行）
// ──────────────────────────────────────────────
const getWarningAnalytics = async (event) => {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const payload = event.data || {};
  const days = Math.min(Math.max(Number(payload.days || 7), 3), 30);
  const endDateObj = new Date();
  const startDateObj = new Date(endDateObj.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  const startDate = formatDate(startDateObj);
  const endDate = formatDate(endDateObj);

  const [staffsRes, schedulesRes] = await Promise.all([
    db.collection(COLLECTIONS.STAFF).orderBy("employeeNo", "asc").limit(200).get(),
    db
      .collection(COLLECTIONS.SCHEDULES)
      .where({ scheduleDate: _.gte(startDate) })
      .orderBy("scheduleDate", "desc")
      .limit(2000)
      .get(),
  ]);

  const publicationStates = await getPublicationStates(
    (schedulesRes.data || []).map((schedule) => schedule.scheduleDate)
  );
  const activeSchedules = (schedulesRes.data || []).filter((item) =>
    item.scheduleDate <= endDate &&
    item.status !== "CANCELLED" &&
    item.needsReassignment !== true &&
    isCurrentPublishedSchedule(item, publicationStates)
  );
  const workedHoursMap = new Map();
  const workedShiftCountMap = new Map();
  activeSchedules.forEach((item) => {
    const staffId = item.staffId;
    if (!staffId) return;
    const shiftHours = getShiftHours(item.shiftCode);
    workedHoursMap.set(staffId, Number(workedHoursMap.get(staffId) || 0) + shiftHours);
    workedShiftCountMap.set(staffId, Number(workedShiftCountMap.get(staffId) || 0) + 1);
  });

  const ranking = (staffsRes.data || [])
    .map((staff) => {
      const totalWorkedHours = Number(workedHoursMap.get(staff._id) || 0);
      const workedShiftCount = Number(workedShiftCountMap.get(staff._id) || 0);
      return {
        staffId: staff._id,
        employeeNo: staff.employeeNo,
        name: staff.name,
        groupId: staff.groupId || "-",
        totalWorkedHours,
        totalWorkedHoursText: `${totalWorkedHours}小时`,
        workedShiftCount,
      };
    })
    .sort((a, b) => {
      if (b.totalWorkedHours !== a.totalWorkedHours) return b.totalWorkedHours - a.totalWorkedHours;
      if (b.workedShiftCount !== a.workedShiftCount) return b.workedShiftCount - a.workedShiftCount;
      return String(a.employeeNo || "").localeCompare(String(b.employeeNo || ""));
    })
    .slice(0, 30)
    .map((item, index) => ({
      rank: index + 1,
      ...item,
    }));

  const result = {
    days,
    startDate,
    endDate,
    staffWorkloadRanking: ranking,
  };
  return ok(result);
};

// ──────────────────────────────────────────────
// 维修量预测
// ──────────────────────────────────────────────
const getMaintenanceForecast = async (event) => {
  const { flights } = event.data || {};
  if (!Array.isArray(flights) || !flights.length) return fail("缺少航班数据", 400);

  // 按日期分组，汇总每日工作量
  const dayMap = {};
  flights.forEach((f) => {
    const d = f.scheduleDate || "";
    if (!d) return;
    if (!dayMap[d]) dayMap[d] = { date: d, estimatedWorkload: 0, flightCount: 0, totalStayHours: 0 };
    dayMap[d].estimatedWorkload += Number(f.stayHours || 0) * 2; // 每架航班约需 2 人·时/停留小时
    dayMap[d].flightCount += 1;
    dayMap[d].totalStayHours += Number(f.stayHours || 0);
  });

  const dailyForecast = Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date));
  dailyForecast.forEach((item) => {
    item.estimatedWorkload = Math.round(item.estimatedWorkload * 10) / 10;
    item.staffNeeded = Math.max(1, Math.ceil(item.estimatedWorkload / 8)); // 8小时/人·天
  });

  const totalEstimatedWorkload = Math.round(dailyForecast.reduce((s, d) => s + d.estimatedWorkload, 0) * 10) / 10;
  const averageDailyWorkload = dailyForecast.length
    ? Math.round((totalEstimatedWorkload / dailyForecast.length) * 10) / 10
    : 0;

  return ok({ totalEstimatedWorkload, averageDailyWorkload, dailyForecast });
};

// ──────────────────────────────────────────────
// 员工疲劳度评分
// ──────────────────────────────────────────────
const getFatigueScores = async (event) => {
  const { staffs } = event.data || {};
  if (!Array.isArray(staffs) || !staffs.length) return fail("缺少人员数据", 400);

  const results = staffs.map((s) => {
    const hours = Number(s.totalWorkedHours || 0);
    let score, riskLevel;
    if (hours >= 80) { score = 80 + Math.min((hours - 80) / 2, 15); riskLevel = "high"; }
    else if (hours >= 40) { score = 40 + (hours - 40) * 1; riskLevel = "medium"; }
    else { score = Math.max(5, hours * 0.8); riskLevel = "low"; }
    return {
      staffId: s.staffId || "",
      employeeNo: s.employeeNo || "",
      name: s.name || "",
      totalWorkedHours: hours,
      score: Math.round(Math.min(100, score)),
      riskLevel,
    };
  });

  return ok({ results });
};

// ──────────────────────────────────────────────
// 资质到期预警
// ──────────────────────────────────────────────
const getQualificationStatus = async () => {
  const { openid } = getOpenContext();
  if (!openid) return fail("当前未登录", 401);
  const currentResult = await db.collection(COLLECTIONS.STAFF)
    .where({ openid })
    .limit(1)
    .get();
  const currentStaff = (currentResult.data || [])[0];
  if (!currentStaff || currentStaff.active === false) return fail("当前员工未绑定或已停用", 401);

  const total = { expired: 0, expiring30: 0, expiring60: 0, valid: 0 };
  const allStaff = [];
  let staffQuery = db.collection(COLLECTIONS.STAFF)
    .field({ employeeNo: 1, name: 1, groupId: 1, qualifications: 1, authorizedAircraftTypes: 1 })
    .limit(200);
  if (currentStaff.isAdmin !== true) {
    staffQuery = db.collection(COLLECTIONS.STAFF)
      .where({ _id: currentStaff._id })
      .field({ employeeNo: 1, name: 1, groupId: 1, qualifications: 1, authorizedAircraftTypes: 1 })
      .limit(1);
  }
  const res = await staffQuery.get();
  for (const staff of (res.data || [])) {
    const qs = staff.qualifications || [];
    // 兼容旧数据：没有 qualifications 字段则从 authorizedAircraftTypes 自动生成
    const quals = qs.length > 0 ? qs : (staff.authorizedAircraftTypes || []).map(type => ({
      aircraftType: type,
      validUntil: "未知",
      status: "VALID",
      certNo: "-",
    }));
    const items = quals.map(q => {
      let daysLeft = 999;
      let status = q.status || "VALID";
      if (q.validUntil && q.validUntil !== "未知") {
        const expiry = new Date(q.validUntil);
        const now = new Date();
        const diff = (expiry - now) / (1000 * 60 * 60 * 24);
        daysLeft = Number.isFinite(diff) ? Math.floor(diff) : 999;
        if (daysLeft < 0) status = "EXPIRED";
        else if (daysLeft <= 30) status = "EXPIRING_30";
        else if (daysLeft <= 60) status = "EXPIRING_60";
        else status = "VALID";
      }
      if (status === "EXPIRED") total.expired++;
      else if (status === "EXPIRING_30") total.expiring30++;
      else if (status === "EXPIRING_60") total.expiring60++;
      else total.valid++;
      return { aircraftType: q.aircraftType, certNo: q.certNo || "-", validUntil: q.validUntil || "未知", daysLeft, status };
    });
    items.sort((a, b) => a.daysLeft - b.daysLeft);
    allStaff.push({
      employeeNo: staff.employeeNo,
      name: staff.name,
      groupId: staff.groupId,
      qualifications: items,
      minDaysLeft: items.length > 0 ? items[0].daysLeft : 999,
    });
  }
  allStaff.sort((a, b) => a.minDaysLeft - b.minDaysLeft);
  return ok({
    list: allStaff,
    summary: total,
    scope: currentStaff.isAdmin === true ? "ALL" : "SELF",
  });
};

// ──────────────────────────────────────────────
// 路由表
// ──────────────────────────────────────────────
module.exports = {
  updateFlightOperationalData,
  getRiskCenterDashboard,
  getWarningAnalytics,
  getMaintenanceForecast,
  getFatigueScores,
  getQualificationStatus,
};
