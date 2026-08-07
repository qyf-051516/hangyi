const { callBackend } = require("../../utils/api.js");
const { applyUiSettings } = require("../../utils/ui");

const NUMERIC_SPECS = {
  fatigueMaxContinuousDays: { min: 1, max: 14, label: "连续工作天数" },
  maxDailyWorkHours: { min: 1, max: 24, label: "单人日工时上限" },
  maxConsecutiveNightShifts: { min: 1, max: 7, label: "连续夜班上限" },
  minRestIntervalMinutes: { min: 0, max: 480, label: "最小休息间隔" },
  servicePrepTimeMinutes: { min: 0, max: 180, label: "勤务提前到位时间" },
  serviceWrapTimeMinutes: { min: 0, max: 180, label: "勤务收尾时间" },
  releasePrepTimeMinutes: { min: 0, max: 180, label: "放行提前到位时间" },
  releaseWrapTimeMinutes: { min: 0, max: 180, label: "放行收尾时间" },
  serviceRequiredCount: { min: 1, max: 10, label: "每航班勤务人数" },
  releaseRequiredCount: { min: 1, max: 10, label: "每航班放行人数" },
};

const defaultForm = () => ({
  fatigueMaxContinuousDays: "3",
  maxDailyWorkHours: "12",
  maxConsecutiveNightShifts: "2",
  minRestIntervalMinutes: "30",
  servicePrepTimeMinutes: "30",
  serviceWrapTimeMinutes: "15",
  releasePrepTimeMinutes: "20",
  releaseWrapTimeMinutes: "10",
  serviceRequiredCount: "2",
  releaseRequiredCount: "1",
  demoToolsEnabled: false,
});

Page({
  data: {
    theme: "light",
    themeClass: "theme-light",
    loading: true,
    saving: false,
    dirty: false,
    adminDenied: false,
    errorMessage: "",
    form: defaultForm(),
    loaded: false,
    skeletonRows: [1, 2, 3, 4],
  },

  onShow() {
    applyUiSettings(this);
    if (!this.data.loaded) this.loadConfig();
  },

  onPullDownRefresh() {
    if (this.data.dirty) {
      wx.stopPullDownRefresh();
      wx.showToast({ title: "请先保存或放弃当前修改", icon: "none" });
      return;
    }
    this.loadConfig().finally(() => wx.stopPullDownRefresh());
  },

  async loadConfig() {
    this.setData({ loading: true, errorMessage: "" });
    try {
      const [result] = await Promise.all([
        callBackend("getSchedulingConfig"),
        callBackend("getAdminDashboard"),
      ]);
      const form = defaultForm();
      Object.keys(NUMERIC_SPECS).forEach((field) => {
        if (result[field] !== undefined) form[field] = String(result[field]);
      });
      form.demoToolsEnabled = result.demoToolsEnabled === true;
      this._originalDemoToolsEnabled = form.demoToolsEnabled;
      this.setData({
        form,
        loading: false,
        loaded: true,
        dirty: false,
        adminDenied: false,
      });
    } catch (error) {
      const denied = Number(error.code) === 403 || String(error.message || "").includes("管理员");
      this.setData({
        loading: false,
        adminDenied: denied,
        errorMessage: denied ? "" : (error.message || "排班参数加载失败"),
      });
    }
  },

  onNumberInput(e) {
    const field = e.currentTarget.dataset.field;
    if (!NUMERIC_SPECS[field]) return;
    this.setData({
      [`form.${field}`]: e.detail.value,
      dirty: true,
    });
  },

  onDemoSwitch(e) {
    this.setData({
      "form.demoToolsEnabled": !!e.detail.value,
      dirty: true,
    });
  },

  buildPayload() {
    const payload = { demoToolsEnabled: this.data.form.demoToolsEnabled };
    for (const [field, spec] of Object.entries(NUMERIC_SPECS)) {
      const value = Number(this.data.form[field]);
      if (!Number.isFinite(value) || value < spec.min || value > spec.max) {
        return {
          error: `${spec.label}需在 ${spec.min} 到 ${spec.max} 之间`,
        };
      }
      payload[field] = value;
    }
    return { payload };
  },

  async onSave() {
    if (this.data.saving || !this.data.dirty) return;
    const built = this.buildPayload();
    if (built.error) {
      wx.showToast({ title: built.error, icon: "none" });
      return;
    }

    if (
      built.payload.demoToolsEnabled === true &&
      this._originalDemoToolsEnabled !== true
    ) {
      const confirmed = await new Promise((resolve) => {
        wx.showModal({
          title: "开启演示工具",
          content: "演示工具可重建演示数据，只应在测试环境短时开启。",
          confirmText: "确认开启",
          confirmColor: "#b5631b",
          success: (result) => resolve(result.confirm),
          fail: () => resolve(false),
        });
      });
      if (!confirmed) return;
    }

    this.setData({ saving: true });
    try {
      await callBackend("updateSchedulingConfig", built.payload);
      this._originalDemoToolsEnabled = built.payload.demoToolsEnabled;
      this.setData({ dirty: false });
      wx.showToast({ title: "排班参数已保存", icon: "success" });
    } catch (error) {
      wx.showToast({ title: error.message || "保存失败", icon: "none" });
    } finally {
      this.setData({ saving: false });
    }
  },

  onReset() {
    if (!this.data.dirty) return;
    wx.showModal({
      title: "放弃参数修改",
      content: "确认恢复为云端当前配置？",
      confirmText: "确认放弃",
      success: (result) => {
        if (result.confirm) this.loadConfig();
      },
    });
  },

  onRetry() {
    this.loadConfig();
  },

  onBackMine() {
    wx.switchTab({ url: "/pages/mine/index" });
  },
});
