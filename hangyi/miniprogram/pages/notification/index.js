const { callBackend } = require("../../utils/api.js");
const { applyUiSettings } = require("../../utils/ui");

const formatTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
};

const buildSummary = (item) => {
  if (item.category === "LEAVE") {
    return `${item.startDate || "待定"} 至 ${item.endDate || "待定"} / ${item.totalDays || 0} 天`;
  }
  if (item.flightNo) return `${item.flightNo} / ${item.startTime || "待定"} 至 ${item.endTime || "待定"}`;
  return `${item.startTime || "时间待定"} 至 ${item.endTime || "时间待定"}`;
};

Page({
  data: {
    allNotifications: [],
    notifications: [],
    loading: false,
    loaded: false,
    errorMessage: "",
    unreadCount: 0,
    activeFilter: "ALL",
    expandedKey: "",
    allCount: 0,
    swapCount: 0,
    leaveCount: 0,
    emptyTitle: "暂无通知",
    emptyCopy: "申请的处理进度会显示在这里",
    fontSize: 14,
    theme: "light",
    themeClass: "theme-light",
  },

  onShow() {
    applyUiSettings(this);
    this.loadNotifications();
  },

  async loadNotifications() {
    this.setData({ loading: true, errorMessage: "" });
    try {
      const res = await callBackend("listMyNotifications");
      const allNotifications = (res.notifications || []).map((item) => ({
        ...item,
        notificationKey: `${item.category}_${item._id}`,
        updatedAtText: formatTime(item.updatedAt || item.createdAt),
        summaryText: buildSummary(item),
      }));
      const unreadCount = Number(res.unreadCount || 0);
      this.setData({
        allNotifications,
        unreadCount,
        allCount: allNotifications.length,
        swapCount: allNotifications.filter((item) => item.category === "SWAP").length,
        leaveCount: allNotifications.filter((item) => item.category === "LEAVE").length,
        loaded: true,
        errorMessage: "",
      });
      this.applyFilter();
    } catch (error) {
      const errorMessage = error.message || "通知加载失败，请稍后重试";
      this.setData({ errorMessage });
      if (this.data.loaded) {
        wx.showToast({ title: errorMessage, icon: "none" });
      }
    } finally {
      this.setData({ loading: false });
    }
  },

  applyFilter() {
    const { activeFilter, allNotifications } = this.data;
    let notifications = allNotifications;
    if (activeFilter === "UNREAD") {
      notifications = allNotifications.filter((item) => item.unread);
    } else if (activeFilter === "SWAP") {
      notifications = allNotifications.filter((item) => item.category === "SWAP");
    } else if (activeFilter === "LEAVE") {
      notifications = allNotifications.filter((item) => item.category === "LEAVE");
    }

    const emptyState = {
      ALL: ["暂无通知", "调班和请假申请的处理进度会显示在这里"],
      UNREAD: ["没有未读通知", "新的审批结果会优先显示在这个筛选中"],
      SWAP: ["暂无调班通知", "发起调班或代班申请后，可在这里追踪结果"],
      LEAVE: ["暂无请假通知", "发起请假申请后，可在这里追踪结果"],
    }[activeFilter] || ["暂无通知", ""];

    this.setData({
      notifications,
      emptyTitle: emptyState[0],
      emptyCopy: emptyState[1],
    });
  },

  onSelectFilter(e) {
    const activeFilter = String(e.currentTarget.dataset.value || "ALL");
    if (!["ALL", "UNREAD", "SWAP", "LEAVE"].includes(activeFilter)) return;
    this.setData({ activeFilter, expandedKey: "" });
    this.applyFilter();
  },

  onToggleNotification(e) {
    const key = String(e.currentTarget.dataset.key || "");
    if (!key) return;
    this.setData({ expandedKey: this.data.expandedKey === key ? "" : key });
  },

  onGoRequest(e) {
    const category = String(e.currentTarget.dataset.category || "");
    wx.navigateTo({
      url: category === "LEAVE" ? "/pages/leave/index" : "/pages/swapRequest/index",
    });
  },

  async onMarkAllRead() {
    if (this.data.unreadCount === 0) {
      wx.showToast({ title: "没有未读通知", icon: "none" });
      return;
    }
    try {
      wx.showLoading({ title: "标记中" });
      await callBackend("markMyNotificationsRead");
      const allNotifications = this.data.allNotifications.map((item) => ({
        ...item,
        unread: false,
      }));
      this.setData({
        unreadCount: 0,
        allNotifications,
      });
      this.applyFilter();
      wx.removeStorageSync("data_cache_mine_profile");
      wx.showToast({ title: "已全部标为已读", icon: "success" });
    } catch (error) {
      wx.showToast({ title: error.message || "操作失败", icon: "none" });
    } finally {
      wx.hideLoading();
    }
  },

  onRetry() {
    this.loadNotifications();
  },

  async onPullDownRefresh() {
    try {
      await this.loadNotifications();
    } finally {
      wx.stopPullDownRefresh();
    }
  },
});
