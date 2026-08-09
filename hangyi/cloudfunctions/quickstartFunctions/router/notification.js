/**
 * notification.js - 申请通知
 * 涵盖：listMyNotifications、markMyNotificationsRead
 */
const {
  db, COLLECTIONS,
  ok,
  getOpenContext, ensureCollection,
} = require("../utils");

const STATUS_TEXT = {
  PENDING: "待审批",
  APPROVED: "审批通过",
  REJECTED: "审批驳回",
  CANCELLED: "已撤回",
};

const toTimeMs = (value) => {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
};

const getUnreadState = (item) => {
  const updateMs = toTimeMs(item.updatedAt || item.createdAt);
  const readMs = toTimeMs(item.requesterReadAt);
  return !readMs || readMs < updateMs;
};

// ──────────────────────────────────────────────
// 列出我的申请通知
// ──────────────────────────────────────────────
const listMyNotifications = async () => {
  const { openid } = getOpenContext();
  await ensureCollection(COLLECTIONS.LEAVE_REQUESTS);

  const [swapResult, leaveResult] = await Promise.all([
    db
      .collection(COLLECTIONS.SWAP_REQUESTS)
      .where({ requesterOpenid: openid })
      .orderBy("updatedAt", "desc")
      .limit(100)
      .get(),
    db
      .collection(COLLECTIONS.LEAVE_REQUESTS)
      .where({ openid })
      .orderBy("updatedAt", "desc")
      .limit(100)
      .get(),
  ]);

  const swapNotifications = (swapResult.data || []).map((item) => {
    const statusText = STATUS_TEXT[item.status] || item.status || "未知状态";
    return {
      _id: item._id,
      category: "SWAP",
      categoryText: item.requestType === "SHIFT_APPLY" ? "调班" : "代班",
      requestType: item.requestType || "SWAP",
      employeeNo: item.employeeNo || "",
      name: item.name || "",
      flightNo: item.flightNo || "",
      startTime: item.startTime || "",
      endTime: item.endTime || "",
      reason: item.reason || "",
      reasonText: item.reasonText || item.reason || "",
      reasonImages: Array.isArray(item.reasonImages) ? item.reasonImages : [],
      reasonMode: item.reasonMode || (item.reason ? "TEXT" : ""),
      status: item.status || "PENDING",
      statusText,
      comment: item.comment || "",
      unread: getUnreadState(item),
      createdAt: item.createdAt || null,
      updatedAt: item.updatedAt || null,
      message: `${item.requestType === "SHIFT_APPLY" ? "调班申请" : "代班申请"} ${statusText}`,
    };
  });

  const leaveNotifications = (leaveResult.data || []).map((item) => {
    const statusText = STATUS_TEXT[item.status] || item.status || "未知状态";
    return {
      _id: item._id,
      category: "LEAVE",
      categoryText: "请假",
      requestType: "LEAVE",
      employeeNo: item.employeeNo || "",
      name: item.name || "",
      leaveTypeText: item.typeText || item.type || "请假",
      startDate: item.startDate || "",
      endDate: item.endDate || "",
      totalDays: Number(item.totalDays || 0),
      reason: item.reason || "",
      reasonText: item.reasonText || item.reason || "",
      reasonImages: Array.isArray(item.reasonImages) ? item.reasonImages : [],
      reasonMode: item.reasonMode || (item.reason ? "TEXT" : ""),
      status: item.status || "PENDING",
      statusText,
      comment: item.comment || "",
      unread: getUnreadState(item),
      createdAt: item.createdAt || null,
      updatedAt: item.updatedAt || null,
      message: `${item.typeText || "请假"}申请 ${statusText}`,
    };
  });

  const notifications = swapNotifications
    .concat(leaveNotifications)
    .sort((a, b) => toTimeMs(b.updatedAt || b.createdAt) - toTimeMs(a.updatedAt || a.createdAt));
  const unreadCount = notifications.filter((item) => item.unread).length;
  return ok({
    notifications: notifications.slice(0, 100),
    unreadCount,
    total: notifications.length,
  });
};

// ──────────────────────────────────────────────
// 标记通知为已读
// ──────────────────────────────────────────────
const markCollectionRead = async (collectionName, condition, now) => {
  await ensureCollection(collectionName);
  // 单次条件更新：wx-server-sdk 支持 where(...).update(...)，返回 stats.updated，
  // 不再需要分页 + 逐条 doc().update。
  const result = await db
    .collection(collectionName)
    .where(condition)
    .update({ data: { requesterReadAt: now } });
  return (result && result.stats && result.stats.updated) || 0;
};

const markMyNotificationsRead = async () => {
  const { openid } = getOpenContext();
  await ensureCollection(COLLECTIONS.LEAVE_REQUESTS);
  const now = new Date();
  const [swapUpdated, leaveUpdated] = await Promise.all([
    markCollectionRead(COLLECTIONS.SWAP_REQUESTS, { requesterOpenid: openid }, now),
    markCollectionRead(COLLECTIONS.LEAVE_REQUESTS, { openid }, now),
  ]);

  return ok({
    updatedCount: swapUpdated + leaveUpdated,
    swapUpdated,
    leaveUpdated,
  }, "已设为已读");
};

// ──────────────────────────────────────────────
// 路由表
// ──────────────────────────────────────────────
module.exports = {
  listMyNotifications,
  markMyNotificationsRead,
};
