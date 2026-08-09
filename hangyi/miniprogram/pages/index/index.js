const { callBackend } = require("../../utils/api.js");
const { applyUiSettings, loadIsAdmin } = require("../../utils/ui");
const { readCache, writeCache } = require("../../utils/cache");

const SHIFT_TEXT = { MORNING: "早班", AFTERNOON: "午班", NIGHT: "晚班" };

Page({
  data: {
    loading: false,
    loaded: false,
    errorMessage: "",
    scheduleDate: "",
    scheduleWeekday: "",
    todayDate: "",
    isToday: true,
    updatedAtText: "",
    total: 0,
    assigned: 0,
    unassigned: 0,
    leave: 0,
    warningCount: 0,
    highRiskCount: 0,
    nightShiftOnDuty: 0,
    pendingCount: 0,
    pendingSwapCount: 0,
    pendingLeaveCount: 0,
    assignedPct: 0,
    unassignedPct: 0,
    leavePct: 0,
    isAdmin: false,
    demoToolsEnabled: false,
    fontSize: 14,
    theme: "light",
    themeClass: "theme-light",
    upcomingDays: [],
    upcomingLoaded: false,
  },

  _lastLoadKey: "",
  _pendingTimer: null,

  onShow() {
    applyUiSettings(this);
    this.loadOverview();
    this.loadUpcoming();
    this.startPendingPolling();
  },

  onHide() {
    this.stopPendingPolling();
  },

  onUnload() {
    this.stopPendingPolling();
  },

  // admin 视角 30 秒轮询待审批数（复用管理入口 badge 字段），失败静默不影响首页。
  startPendingPolling() {
    this.stopPendingPolling();
    this._pendingTimer = setInterval(() => this.pollPendingCounts(), 30000);
  },

  stopPendingPolling() {
    if (this._pendingTimer) {
      clearInterval(this._pendingTimer);
      this._pendingTimer = null;
    }
  },

  async pollPendingCounts() {
    if (!this.data.isAdmin) return;
    try {
      const [swapRes, leaveRes] = await Promise.all([
        callBackend("listSwapRequests", { status: "PENDING" }, { silent: true }),
        callBackend("listPendingLeaveRequests", { status: "PENDING" }, { silent: true }),
      ]);
      const pendingSwapCount = (swapRes.requests || swapRes.list || []).length;
      const pendingLeaveCount = (leaveRes.list || []).length;
      this.setData({
        pendingSwapCount,
        pendingLeaveCount,
        pendingCount: pendingSwapCount + pendingLeaveCount,
      });
    } catch (_) { /* 轮询失败静默 */ }
  },

  formatDate(date) {
    const y = date.getFullYear();
    const m = `${date.getMonth() + 1}`.padStart(2, "0");
    const d = `${date.getDate()}`.padStart(2, "0");
    return `${y}-${m}-${d}`;
  },

  formatUpdatedTime(date = new Date()) {
    const hour = `${date.getHours()}`.padStart(2, "0");
    const minute = `${date.getMinutes()}`.padStart(2, "0");
    return `${hour}:${minute}`;
  },

  formatWeekday(date) {
    return `星期${["日", "一", "二", "三", "四", "五", "六"][date.getDay()]}`;
  },

  parseDate(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return new Date();
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  },

  async loadOverview(forceRefresh = false) {
    const todayDate = this.formatDate(new Date());
    const scheduleDate = this.data.scheduleDate || todayDate;
    const cacheKey = `overview_${scheduleDate}`;
    const loadKey = `${scheduleDate}_${Date.now()}`;
    this._lastLoadKey = loadKey;
    this.setData({
      loading: true,
      errorMessage: "",
      scheduleDate,
      scheduleWeekday: this.formatWeekday(this.parseDate(scheduleDate)),
      todayDate,
      isToday: scheduleDate === todayDate,
    });
    // 首页每次展示都强制拉个人资料会绕过 30 秒缓存并放大云函数开销；
    // 手动刷新才实时复核管理员身份，登录/退出已清理该账号缓存。
    const isAdmin = await loadIsAdmin(forceRefresh);

    if (!forceRefresh) {
      const cached = readCache(cacheKey, 30000);
      if (cached) {
        const adminContext = await this.loadAdminContext(isAdmin);
        this.setData({
          ...cached,
          ...adminContext,
          loading: false,
          loaded: true,
          scheduleDate,
          scheduleWeekday: this.formatWeekday(this.parseDate(scheduleDate)),
          todayDate,
          isToday: scheduleDate === todayDate,
          updatedAtText: cached.updatedAtText || "刚刚",
          isAdmin,
        });
        return;
      }
    }

    try {
      const [tableRes, adminContext] = await Promise.all([
        callBackend("getStaffScheduleTable", { scheduleDate }),
        this.loadAdminContext(isAdmin),
      ]);

      // 防止过期响应覆盖最新请求
      if (this._lastLoadKey !== loadKey) return;

      const rows = tableRes.rows || [];
      const complianceRows = rows.filter((item) => item.compliancePassed === false);
      const assigned = rows.filter((item) => ["ASSIGNED", "SWAPPED", "COMPLETED"].includes(item.status)).length;
      const unassigned = rows.filter((item) => item.status === "UNASSIGNED").length;
      const leave = rows.filter((item) => ["ON_LEAVE", "LEAVE_CONFLICT"].includes(item.status)).length;
      const highRiskCount = complianceRows.filter(
        (item) => item.qualificationMismatch || item.scheduleConflict
      ).length;
      const nightShiftOnDuty = rows.filter(
        (item) => item.shiftCode === "NIGHT" && ["ASSIGNED", "SWAPPED"].includes(item.status)
      ).length;

      const total = rows.length;
      const assignedPct = total ? Math.round((assigned / total) * 100) : 0;
      const unassignedPct = total ? Math.round((unassigned / total) * 100) : 0;
      const leavePct = total ? Math.round((leave / total) * 100) : 0;

      const data = {
        scheduleDate, total, assigned, unassigned, leave,
        scheduleWeekday: this.formatWeekday(this.parseDate(scheduleDate)),
        assignedPct, unassignedPct, leavePct,
        warningCount: complianceRows.length, highRiskCount, nightShiftOnDuty,
        updatedAtText: this.formatUpdatedTime(),
      };

      writeCache(cacheKey, data);
      this.setData({
        ...data,
        ...adminContext,
        isAdmin,
        loading: false,
        loaded: true,
        errorMessage: "",
      });
    } catch (error) {
      if (this._lastLoadKey !== loadKey) return;
      const errorMessage = error.message || "概览加载失败，请稍后重试";
      this.setData({ loading: false, errorMessage });
      if (this.data.loaded) {
        wx.showToast({ title: errorMessage, icon: "none" });
      }
    }
  },

  async loadAdminContext(isAdmin) {
    if (!isAdmin) {
      return {
        pendingCount: 0,
        pendingSwapCount: 0,
        pendingLeaveCount: 0,
        demoToolsEnabled: false,
      };
    }
    try {
      const [swapRes, leaveRes, config] = await Promise.all([
        callBackend("listSwapRequests", { status: "PENDING" }),
        callBackend("listPendingLeaveRequests", { status: "PENDING" }),
        callBackend("getSchedulingConfig"),
      ]);
      const pendingSwapCount = (swapRes.requests || []).length;
      const pendingLeaveCount = (leaveRes.list || []).length;
      return {
        pendingSwapCount,
        pendingLeaveCount,
        pendingCount: pendingSwapCount + pendingLeaveCount,
        demoToolsEnabled: config.demoToolsEnabled === true,
      };
    } catch (error) {
      return {
        pendingCount: 0,
        pendingSwapCount: 0,
        pendingLeaveCount: 0,
        demoToolsEnabled: false,
      };
    }
  },

  // 员工视角：未来 3 天班次预览。逐日调 getStaffScheduleTable（员工返回本人一行），
  // 任一失败静默降级（只跳过该天），整体失败时区块不展示，不阻塞页面加载。
  async loadUpcoming() {
    const isAdmin = await loadIsAdmin();
    if (isAdmin) return;
    const days = [];
    for (let offset = 1; offset <= 3; offset += 1) {
      const date = new Date();
      date.setDate(date.getDate() + offset);
      const scheduleDate = this.formatDate(date);
      try {
        const res = await callBackend("getStaffScheduleTable", { scheduleDate }, { silent: true });
        days.push(this.buildUpcomingDay(scheduleDate, res));
      } catch (error) {
        console.warn("[index] 未来班次预览加载失败", error && error.message);
      }
    }
    this.setData({ upcomingDays: days, upcomingLoaded: true });
  },

  buildUpcomingDay(scheduleDate, res) {
    const row = (res.rows || [])[0];
    const parsed = this.parseDate(scheduleDate);
    const dateText = `${parsed.getMonth() + 1}/${parsed.getDate()}`;
    let shiftText = "未排班";
    let shiftMeta = "";
    if (row) {
      if (row.status === "ON_LEAVE") {
        shiftText = "休假";
      } else if (row.status === "LEAVE_CONFLICT") {
        shiftText = "休假冲突";
      } else if (row.status === "UNASSIGNED") {
        shiftText = "未排班";
      } else {
        shiftText = SHIFT_TEXT[row.shiftCode] || row.shiftCode || row.statusText || "已排班";
        const timeText = [row.departureTime, row.arrivalTime].filter(Boolean).join(" / ");
        shiftMeta = [row.flightNo, timeText].filter(Boolean).join(" · ");
      }
    }
    return {
      scheduleDate,
      dateText,
      weekday: this.formatWeekday(parsed),
      shiftText,
      shiftMeta,
    };
  },

  onForceRefresh() {
    if (this.data.loading) return;
    wx.removeStorageSync("data_cache_overview_" + this.data.scheduleDate);
    this.loadOverview(true);
  },

  onRetryOverview() {
    this.loadOverview(true);
  },

  onGoLogin() {
    wx.reLaunch({ url: "/pages/quickLogin/index" });
  },

  onGoSchedule() {
    wx.switchTab({ url: "/pages/staffSchedule/index" });
  },

  onGoWarnings() {
    wx.switchTab({ url: "/pages/warnings/index" });
  },

  onGoMine() {
    wx.switchTab({ url: "/pages/mine/index" });
  },

  onGoLeaveApproval() {
    wx.navigateTo({ url: "/pages/leave/index?mode=approval" });
  },

  onGoMySchedules() {
    wx.navigateTo({ url: "/pages/mySchedules/index" });
  },

  onGoSwapRequest() {
    wx.navigateTo({ url: "/pages/swapRequest/index" });
  },

  onGoLeave() {
    wx.navigateTo({ url: "/pages/leave/index" });
  },

  onGoNotification() {
    wx.navigateTo({ url: "/pages/notification/index" });
  },

  onGoAdminSchedule() {
    wx.navigateTo({ url: "/pages/adminSchedule/index" });
  },

  onGoAdminCenter() {
    wx.navigateTo({ url: "/pages/adminCenter/index" });
  },

  onPrevDay() {
    if (this.data.loading) return;
    const d = this.parseDate(this.data.scheduleDate);
    d.setDate(d.getDate() - 1);
    this.setData({ scheduleDate: this.formatDate(d) });
    this.loadOverview(true);
  },

  onNextDay() {
    if (this.data.loading) return;
    const d = this.parseDate(this.data.scheduleDate);
    d.setDate(d.getDate() + 1);
    this.setData({ scheduleDate: this.formatDate(d) });
    this.loadOverview(true);
  },

  onGoToday() {
    if (this.data.isToday || this.data.loading) return;
    this.setData({ scheduleDate: this.data.todayDate });
    this.loadOverview(false);
  },

  async onPullDownRefresh() {
    try {
      await this.loadOverview(true);
    } finally {
      wx.stopPullDownRefresh();
    }
  },

  async onResetDemoData() {
    if (!this.data.isAdmin || !this.data.demoToolsEnabled) {
      wx.showToast({ title: "演示数据工具未启用", icon: "none" });
      return;
    }
    const res = await wx.showModal({
      title: "确认重建",
      content: "将清空并重建演示排班、航班、调班和请假数据，管理员与系统配置会保留。是否继续？",
      confirmText: "重建",
      confirmColor: "#ff8c8c",
    });
    if (!res.confirm) return;
    try {
      wx.showLoading({ title: "重建中" });
      const data = await callBackend("resetDemoData", { confirmText: "RESET_DEMO_DATA" });

      wx.showToast({
        title: `已重建 ${data.staffTotal} 人演示数据`,
        icon: "success",
      });
      wx.removeStorageSync("data_cache_overview_" + this.data.scheduleDate);
      await this.loadOverview(true);
    } catch (error) {
      wx.showToast({ title: error.message || "重建失败", icon: "none" });
    } finally {
      wx.hideLoading();
    }
  },
});
