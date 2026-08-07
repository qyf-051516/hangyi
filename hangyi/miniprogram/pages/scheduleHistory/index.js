const { callBackend } = require("../../utils/api.js");
const { applyUiSettings, loadIsAdmin } = require("../../utils/ui");

Page({
  data: {
    loading: true,
    scheduleDate: "",
    active: [],
    archived: [],
    activeCount: 0,
    archivedCount: 0,
    publishHistory: [],
    showArchived: false,
    themeClass: "theme-light",
    isAdmin: false,
    adminDenied: false,
    errorMessage: "",
  },

  async onShow() {
    applyUiSettings(this);
    const isAdmin = await loadIsAdmin(true);
    if (!isAdmin) {
      this.setData({ isAdmin: false, adminDenied: true, loading: false });
      return;
    }
    if (!this.data.scheduleDate) {
      const d = new Date();
      const y = d.getFullYear();
      const m = `${d.getMonth() + 1}`.padStart(2, "0");
      const day = `${d.getDate()}`.padStart(2, "0");
      this.setData({ scheduleDate: `${y}-${m}-${day}` });
    }
    this.setData({ isAdmin: true, adminDenied: false });
    await this.loadData();
  },

  onPullDownRefresh() {
    if (!this.data.isAdmin) {
      wx.stopPullDownRefresh();
      return;
    }
    this.loadData().then(() => wx.stopPullDownRefresh());
  },

  async loadData() {
    if (!this.data.isAdmin) return;
    this.setData({ loading: true, errorMessage: "" });
    try {
      const data = await callBackend("getScheduleHistory", {
        scheduleDate: this.data.scheduleDate,
      });
      const decorateSchedule = (item) => ({
        ...item,
        shiftText: this.getShiftText(item.shiftCode),
        statusText: this.getStatusText(item.status),
        archivedAtText: this.formatTime(item.archivedAt),
      });
      this.setData({
        active: (data.active || []).map(decorateSchedule),
        archived: (data.archived || []).map(decorateSchedule),
        activeCount: data.activeCount || 0,
        archivedCount: data.archivedCount || 0,
        publishHistory: (data.publishHistory || []).map((item) => ({
          ...item,
          actionText: item.action === "PUBLISH_SCHEDULE" ? "发布人员排班" : "发布勤务排班",
          createdAtText: this.formatTime(item.createdAt),
          operatorText: item.operator || "系统",
        })),
        loading: false,
      });
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage: error.message || "排班历史加载失败",
      });
    }
  },

  onDateChange(e) {
    this.setData({ scheduleDate: e.detail.value });
    this.loadData();
  },

  toggleArchived() {
    this.setData({ showArchived: !this.data.showArchived });
  },

  /** 格式化时间 */
  formatTime(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, "0");
    const day = `${d.getDate()}`.padStart(2, "0");
    const hh = `${d.getHours()}`.padStart(2, "0");
    const mm = `${d.getMinutes()}`.padStart(2, "0");
    return `${y}-${m}-${day} ${hh}:${mm}`;
  },

  getStatusText(status) {
    return status === "ASSIGNED" ? "已排班" : status === "SWAPPED" ? "已互换" : status === "COMPLETED" ? "已完成" : status || "未知";
  },

  getShiftText(code) {
    return { MORNING: "早班", AFTERNOON: "午班", NIGHT: "晚班" }[code] || code || "未排班";
  },

  onRetry() {
    this.loadData();
  },

  onBackMine() {
    wx.switchTab({ url: "/pages/mine/index" });
  },
});
