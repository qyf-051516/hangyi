const { callBackend } = require("../../utils/api.js");
const { applyUiSettings, getUiSettings, setUiTheme } = require("../../utils/ui");
const { clearAllCache } = require("../../utils/cache");

const REST_DAY_OPTIONS = [
  { value: "MON", label: "周一" },
  { value: "TUE", label: "周二" },
  { value: "WED", label: "周三" },
  { value: "THU", label: "周四" },
  { value: "FRI", label: "周五" },
  { value: "SAT", label: "周六" },
  { value: "SUN", label: "周日" },
];
const LEGACY_REST_DAY_MAP = Object.fromEntries(REST_DAY_OPTIONS.map((item) => [item.label, item.value]));
const normalizeRestDays = (days) => Array.from(new Set((Array.isArray(days) ? days : [])
  .map((day) => LEGACY_REST_DAY_MAP[day] || day)
  .filter((day) => REST_DAY_OPTIONS.some((item) => item.value === day))));

Page({
  data: {
    theme: "light",
    themeClass: "theme-light",
    themeOptions: ["浅色", "深色"],
    themeIndex: 1,
    selectedQualifications: [],
    qualificationText: "未登记",
    airlineText: "未登记",
    phone: "",
    groupId: "",
    saving: false,
    fontSize: 14,
    loggingOut: false,
    // 排班偏好
    preferredShifts: [],
    preferredShiftState: { MORNING: false, AFTERNOON: false, NIGHT: false },
    preferredRestDays: [],
    restDayOptions: REST_DAY_OPTIONS,
    restDayChoices: [],
    maxMonthlyWorkHours: 180,
  },

  onShow() {
    this.loadUiSettings();
    this.loadProfile();
  },

  loadUiSettings() {
    const ui = applyUiSettings(this) || getUiSettings();
    this.setData({
      themeIndex: ui.theme === "light" ? 0 : 1,
    });
  },

  async loadProfile() {
    try {
      const profile = await callBackend("getMyProfile", { forceRefresh: true });
      const selectedQualifications = (profile.authorizedAircraftTypes || []).slice();
      const prefs = profile.preferences || {};
      const preferredShifts = prefs.preferredShifts || [];
      const preferredRestDays = normalizeRestDays(prefs.preferredRestDays);
      this.setData({
        selectedQualifications,
        qualificationText: selectedQualifications.join(" / ") || "未登记",
        airlineText: (profile.authorizedAirlines || []).join(" / ") || "未登记",
        phone: profile.phone || "",
        groupId: profile.groupId || "未分组",
        preferredShifts,
        preferredShiftState: {
          MORNING: preferredShifts.includes("MORNING"),
          AFTERNOON: preferredShifts.includes("AFTERNOON"),
          NIGHT: preferredShifts.includes("NIGHT"),
        },
        preferredRestDays,
        restDayChoices: this.data.restDayOptions.map((day) => ({
          ...day,
          selected: preferredRestDays.includes(day.value),
        })),
        maxMonthlyWorkHours: prefs.maxMonthlyWorkHours || 180,
      });
    } catch (error) {
      wx.showToast({ title: error.message || "加载失败", icon: "none" });
    }
  },

  onPickTheme(e) {
    const idx = Number((e.detail || {}).value || 1);
    const theme = idx === 0 ? "light" : "dark";
    setUiTheme(theme, this);
    this.setData({ themeIndex: idx });
  },

  onInputPhone(e) {
    this.setData({ phone: String((e.detail || {}).value || "").replace(/\s+/g, "") });
  },

  // ── 偏好设置 ──
  onTogglePreferredShift(e) {
    const shift = e.currentTarget.dataset.shift;
    let shifts = this.data.preferredShifts.slice();
    const idx = shifts.indexOf(shift);
    if (idx >= 0) shifts.splice(idx, 1);
    else shifts.push(shift);
    this.setData({
      preferredShifts: shifts,
      preferredShiftState: {
        MORNING: shifts.includes("MORNING"),
        AFTERNOON: shifts.includes("AFTERNOON"),
        NIGHT: shifts.includes("NIGHT"),
      },
    });
  },

  onToggleRestDay(e) {
    const day = e.currentTarget.dataset.day;
    let days = this.data.preferredRestDays.slice();
    const idx = days.indexOf(day);
    if (idx >= 0) days.splice(idx, 1);
    else days.push(day);
    this.setData({
      preferredRestDays: days,
      restDayChoices: this.data.restDayOptions.map((item) => ({
        ...item,
        selected: days.includes(item.value),
      })),
    });
  },

  onInputMaxHours(e) {
    this.setData({ maxMonthlyWorkHours: Number(e.detail.value) || 180 });
  },

  async onSave() {
    if (this.data.saving) return;

    const phone = String(this.data.phone || "").trim();
    let loadingShown = false;

    if (phone && !/^1\d{10}$/.test(phone)) {
      wx.showToast({ title: "手机号格式不正确", icon: "none" });
      return;
    }
    this.setData({ saving: true });
    wx.showLoading({ title: "保存中" });
    loadingShown = true;

    try {
      const theme = this.data.themeIndex === 0 ? "light" : "dark";
      await callBackend("saveMySettings", {
        phone,
        preferredShifts: this.data.preferredShifts,
        preferredRestDays: this.data.preferredRestDays,
        maxMonthlyWorkHours: this.data.maxMonthlyWorkHours,
      });
      wx.setStorageSync("ui_theme", theme);
      wx.showToast({ title: "保存成功", icon: "success" });
    } catch (error) {
      wx.showToast({ title: error.message || "保存失败", icon: "none" });
    } finally {
      this.setData({ saving: false });
      if (loadingShown) wx.hideLoading();
    }
  },

  async onLogout() {
    if (this.data.loggingOut) return;

    const res = await new Promise((resolve) => {
      wx.showModal({
        title: "确认退出",
        content: "退出登录后将清除当前账号绑定",
        confirmColor: "#ff4d5a",
        success: resolve,
        fail: () => resolve({ confirm: false }),
      });
    });

    if (!res.confirm) return;

    this.setData({ loggingOut: true });
    wx.showLoading({ title: "退出中" });

    try {
      await callBackend("logoutStaff", {}, { silent: true });
      clearAllCache();
      wx.reLaunch({
        url: "/pages/quickLogin/index",
        success: () => wx.showToast({ title: "已退出登录", icon: "success" }),
        fail: () => wx.showToast({ title: "已退出，请重新进入", icon: "none" }),
      });
    } catch (error) {
      // 退出失败: 仅提示, 不清理缓存也不跳转, 避免二次调用把 alreadyLoggedOut 误当成功
      wx.showToast({ title: error.message || "退出失败，请稍后重试", icon: "none" });
    } finally {
      // 防重入: 失败后保持 loggingOut(按钮保持禁用), 防止重复点击触发二次 logoutStaff
      wx.hideLoading();
    }
  },
});
