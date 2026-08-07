const { callBackend } = require("../../utils/api.js");
const { applyUiSettings, loadIsAdmin } = require("../../utils/ui");

const GROUP_OPTIONS = [
  { value: "", label: "全部班组" },
  { value: "A组", label: "A组" },
  { value: "B组", label: "B组" },
  { value: "C组", label: "C组" },
  { value: "D组", label: "D组" },
  { value: "E组", label: "E组" },
  { value: "F组", label: "F组" },
  { value: "G组", label: "G组" },
  { value: "H组", label: "H组" },
];

Page({
  data: {
    loading: true,
    autoRefreshActive: false,
    dateStart: "",
    dateEnd: "",
    groupOptions: GROUP_OPTIONS,
    groupIndex: 0,
    total: 0,
    completed: 0,
    pending: 0,
    completedRate: "0.0",
    pendingRate: "0.0",
    dailyBreakdown: [],
    theme: "light",
    themeClass: "theme-light",
    isAdmin: false,
    adminDenied: false,
    errorMessage: "",
    autoRefreshError: "",
    _autoTimer: null,
  },

  async onShow() {
    applyUiSettings(this);
    const isAdmin = await loadIsAdmin(true);
    if (!isAdmin) {
      this.stopAutoRefresh();
      this.setData({ isAdmin: false, adminDenied: true, loading: false });
      return;
    }
    this.setData({ isAdmin: true, adminDenied: false });
    await this.loadData();
    this.startAutoRefresh();
  },

  onHide() {
    this.stopAutoRefresh();
  },

  onUnload() {
    this.stopAutoRefresh();
  },

  onPullDownRefresh() {
    if (!this.data.isAdmin) {
      wx.stopPullDownRefresh();
      return;
    }
    this.loadData(true).then(() => wx.stopPullDownRefresh());
  },

  startAutoRefresh() {
    this.stopAutoRefresh();
    this.setData({ autoRefreshActive: true });
    const timer = setInterval(() => {
      this.loadData(false, true);
    }, 30000);
    this.data._autoTimer = timer;
  },

  stopAutoRefresh() {
    this.setData({ autoRefreshActive: false });
    if (this.data._autoTimer) {
      clearInterval(this.data._autoTimer);
      this.data._autoTimer = null;
    }
  },

  async loadData(silent = false, isAutoRefresh = false) {
    if (!this.data.isAdmin) return false;
    if (this._inflight) return false; // 已有请求进行中，跳过本次刷新
    this._inflight = true;
    if (!silent) this.setData({ loading: true });
    if (!isAutoRefresh) this.setData({ errorMessage: "" });
    try {
      const { dateStart, dateEnd, groupIndex } = this.data;
      const params = {};
      const selectedGroup = GROUP_OPTIONS[groupIndex] || GROUP_OPTIONS[0];
      if (selectedGroup.value) params.groupId = selectedGroup.value;
      if (dateStart) params.startDate = dateStart;
      if (dateEnd) params.endDate = dateEnd;

      const data = await callBackend("getScheduleStatusOverview", params);

      this.setData({
        dateStart: (data.dateRange || {}).start || this.data.dateStart,
        dateEnd: (data.dateRange || {}).end || this.data.dateEnd,
        total: data.total || 0,
        completed: data.completed || 0,
        pending: data.pending || 0,
        completedRate: data.completedRate || "0.0",
        pendingRate: data.pendingRate || "0.0",
        dailyBreakdown: (data.dailyBreakdown || []).map((d) => ({
          ...d,
          completedRate: d.total > 0 ? ((d.completed / d.total) * 100).toFixed(0) : "0",
          isRateHigh: d.total > 0 && d.completed / d.total >= 0.5,
        })),
        errorMessage: "",
        autoRefreshError: "",
      });
      return true;
    } catch (error) {
      if (!isAutoRefresh) {
        this.setData({ errorMessage: error.message || "完成统计加载失败" });
      } else {
        this.setData({ autoRefreshError: "自动刷新失败，当前统计可能不是最新数据" });
      }
      return false;
    } finally {
      this._inflight = false;
      this.setData({ loading: false });
    }
  },

  async onManualRefresh() {
    if (this._refreshing) return;
    this._refreshing = true;
    wx.showLoading({ title: "刷新中" });
    try {
      const success = await this.loadData(true);
      wx.showToast({ title: success ? "已刷新" : "刷新失败", icon: success ? "success" : "none" });
    } finally {
      this._refreshing = false;
      wx.hideLoading();
    }
  },

  onPickGroup(e) {
    const idx = Number(e.detail.value || 0);
    this.setData({ groupIndex: idx });
    this.loadData();
  },

  onPickStartDate(e) {
    const dateStart = e.detail.value;
    if (this.data.dateEnd && dateStart > this.data.dateEnd) {
      wx.showToast({ title: "起始日期不能晚于结束日期", icon: "none" });
      return;
    }
    this.setData({ dateStart });
    this.loadData();
  },

  onPickEndDate(e) {
    const dateEnd = e.detail.value;
    if (this.data.dateStart && dateEnd < this.data.dateStart) {
      wx.showToast({ title: "结束日期不能早于起始日期", icon: "none" });
      return;
    }
    this.setData({ dateEnd });
    this.loadData();
  },

  onRetry() {
    this.loadData();
  },

  onBackMine() {
    wx.switchTab({ url: "/pages/mine/index" });
  },
});
