const { callBackend } = require("../../utils/api.js");
const { applyUiSettings, loadIsAdmin } = require("../../utils/ui");

Page({
  data: {
    loading: true,
    dateLabel: "",
    groupStats: [],
    staffUtilization: [],
    qualificationStats: [],
    nightDistribution: [],
    theme: "light",
    themeClass: "theme-light",
    isAdmin: false,
    adminDenied: false,
    errorMessage: "",
  },

  async onShow() {
    applyUiSettings(this);
    if (!this.data.dateLabel) this.updateDate();
    const isAdmin = await loadIsAdmin(true);
    if (!isAdmin) {
      this.setData({ isAdmin: false, adminDenied: true, loading: false });
      return;
    }
    this.setData({ isAdmin: true, adminDenied: false });
    await this.loadData();
  },

  onPullDownRefresh() {
    if (!this.data.isAdmin) {
      wx.stopPullDownRefresh();
      return;
    }
    this.loadData().finally(() => wx.stopPullDownRefresh());
  },

  updateDate() {
    const d = new Date();
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, "0");
    const day = `${d.getDate()}`.padStart(2, "0");
    this.setData({ dateLabel: `${y}-${m}-${day}` });
  },

  async loadData() {
    if (!this.data.isAdmin) return false;
    this.setData({ loading: true, errorMessage: "" });
    try {
      const data = await callBackend("getScheduleStatistics", {
        scheduleDate: this.data.dateLabel,
      });
      this.setData({
        groupStats: (data.groupStats || []).map((item) => ({
          ...item,
          utilization: Math.max(0, Math.min(100, Number(item.utilization || 0))),
        })),
        staffUtilization: (data.staffUtilization || []).map((item) => ({
          ...item,
          utilizationWidth: Math.max(0, Math.min(100, Number(item.effectiveMinutes || 0) / 4.8)),
          utilizationClass: Number(item.effectiveMinutes || 0) >= 240
            ? "util-high"
            : Number(item.effectiveMinutes || 0) >= 120 ? "util-mid" : "util-low",
          fatigueRiskText: this.fatigueRiskLabel(item.fatigueRisk),
          fatigueRiskClass: this.fatigueRiskClass(item.fatigueRisk),
        })),
        qualificationStats: data.qualificationStats || [],
        nightDistribution: (data.nightDistribution || []).map((item) => {
          const total = Math.max(0, Number(item.total || 0));
          return {
            ...item,
            dateText: String(item.date || "").slice(5),
            stackHeight: Math.max(20, Math.min(200, total * 8)),
            afternoonRate: total > 0 && Number(item.afternoon || 0) > 0
              ? Math.max(8, (Number(item.afternoon) / total) * 100)
              : 0,
            morningRate: total > 0 && Number(item.morning || 0) > 0
              ? Math.max(8, (Number(item.morning) / total) * 100)
              : 0,
          };
        }),
        loading: false,
      });
      return true;
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage: error.message || "排班分析加载失败",
      });
      return false;
    }
  },

  onRefresh() {
    wx.showLoading({ title: "刷新中" });
    this.loadData().then(() => {
      wx.hideLoading();
      if (!this.data.errorMessage) wx.showToast({ title: "已刷新", icon: "success" });
    }).catch(() => wx.hideLoading());
  },

  onDateChange(e) {
    this.setData({ dateLabel: e.detail.value }, () => this.loadData());
  },

  roleTypeLabel(type) {
    const map = { SERVICE: "勤务", RELEASE: "放行", BOTH: "双资质" };
    return map[type] || type;
  },

  fatigueRiskLabel(risk) {
    const map = { high: "高危", medium: "关注", low: "正常" };
    return map[risk] || risk;
  },

  fatigueRiskClass(risk) {
    if (risk === "high") return "risk-high";
    if (risk === "medium") return "risk-mid";
    return "risk-low";
  },

  onRetry() {
    this.loadData();
  },

  onBackMine() {
    wx.switchTab({ url: "/pages/mine/index" });
  },
});
