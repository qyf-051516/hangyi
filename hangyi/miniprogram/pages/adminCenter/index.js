const { callBackend } = require("../../utils/api.js");
const { applyUiSettings, loadIsAdmin } = require("../../utils/ui");
const { readCache, writeCache } = require("../../utils/cache");

const ACTION_LABELS = {
  PUBLISH_SCHEDULE: "发布人员排班",
  PUBLISH_SERVICE_SCHEDULE: "发布勤务排班",
  AUTO_SCHEDULE: "执行智能排班",
  APPROVE_SWAP: "批准调班",
  APPROVE_SWAP_EXCHANGE: "批准互换",
  REJECT_SWAP: "驳回调班",
  APPROVE_LEAVE: "批准请假",
  REJECT_LEAVE: "驳回请假",
  UPDATE_STAFF_ADMIN: "更新人员资料",
  SET_STAFF_ADMIN: "调整管理员权限",
  UPDATE_CONFIG: "更新排班参数",
  UPDATE_FLIGHT_STATUS: "更新航班状态",
  REALTIME_REASSIGN: "执行实时改班",
  PROPAGATE_DELAY: "传播航班延误",
};

const emptyDashboard = () => ({
  operator: { name: "", employeeNo: "" },
  staff: { total: 0, active: 0, inactive: 0, admins: 0 },
  schedule: { total: 0, assignedPeople: 0, completed: 0, unassigned: 0, leaveConflicts: 0 },
  approvals: { swap: 0, leave: 0, total: 0 },
  qualifications: { riskCount: 0 },
  issueCount: 0,
  health: "HEALTHY",
  recentOperations: [],
});

const formatTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${month}/${day} ${hour}:${minute}`;
};

const todayISO = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

Page({
  data: {
    theme: "light",
    themeClass: "theme-light",
    scheduleDate: "",
    loading: true,
    loaded: false,
    refreshing: false,
    adminDenied: false,
    errorMessage: "",
    dashboard: emptyDashboard(),
    pendingSwapCount: 0,
    pendingLeaveCount: 0,
    pendingTotal: 0,
    healthTitle: "运行正常",
    healthCopy: "当前没有需要立即处理的事项",
    healthClass: "healthy",
    healthIcon: "/images/menu/check-circle.svg",
  },

  _loadSeq: 0,

  onLoad() {
    this.setData({ scheduleDate: todayISO() });
  },

  async onShow() {
    applyUiSettings(this);
    const isAdmin = await loadIsAdmin(true);
    if (!isAdmin) {
      this.setData({
        loading: false,
        loaded: false,
        refreshing: false,
        adminDenied: true,
        errorMessage: "",
        dashboard: emptyDashboard(),
      });
      return;
    }
    this.loadDashboard();
    this.loadPendingApprovals();
  },

  // 统一收件箱：并行拉取调班与请假待审批数，供管理模块入口卡 badge 展示。
  // 失败静默降级（不影响其他模块加载），仅 console.warn 留痕。
  async loadPendingApprovals() {
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
        pendingTotal: pendingSwapCount + pendingLeaveCount,
      });
    } catch (error) {
      console.warn("[adminCenter] 待审批数拉取失败", error && error.message);
    }
  },

  onPullDownRefresh() {
    this.loadDashboard(true).finally(() => wx.stopPullDownRefresh());
  },

  async loadDashboard(forceRefresh = false) {
    if (!this.data.scheduleDate) return;
    const seq = ++this._loadSeq;
    const cacheKey = `admin_dashboard_${this.data.scheduleDate}`;
    this.setData({
      loading: !this.data.loaded,
      refreshing: this.data.loaded,
      errorMessage: "",
    });

    if (!forceRefresh) {
      const cached = readCache(cacheKey, 15000);
      if (cached) {
        this.applyDashboard(cached);
        this.setData({ loading: false, loaded: true, refreshing: false });
      }
    }

    try {
      const result = await callBackend(
        "getAdminDashboard",
        { scheduleDate: this.data.scheduleDate },
        { silent: true }
      );
      if (seq !== this._loadSeq) return;
      writeCache(cacheKey, result);
      this.applyDashboard(result);
      this.setData({
        loading: false,
        loaded: true,
        refreshing: false,
        adminDenied: false,
        errorMessage: "",
      });
    } catch (error) {
      if (seq !== this._loadSeq) return;
      const denied = Number(error.code) === 403 || String(error.message || "").includes("管理员");
      if (denied) {
        this.setData({
          loading: false,
          refreshing: false,
          adminDenied: true,
          errorMessage: "",
        });
        return;
      }
      const isNetwork = error && typeof error.code === "undefined";
      wx.showToast({
        title: isNetwork ? "网络异常，请稍后重试" : (error.message || "管理工作台加载失败"),
        icon: "none",
      });
      this.setData({
        loading: false,
        refreshing: false,
        adminDenied: false,
        errorMessage: error.message || "管理工作台加载失败",
      });
    }
  },

  applyDashboard(raw) {
    const dashboard = {
      ...emptyDashboard(),
      ...(raw || {}),
      operator: { ...emptyDashboard().operator, ...((raw || {}).operator || {}) },
      staff: { ...emptyDashboard().staff, ...((raw || {}).staff || {}) },
      schedule: { ...emptyDashboard().schedule, ...((raw || {}).schedule || {}) },
      approvals: { ...emptyDashboard().approvals, ...((raw || {}).approvals || {}) },
      qualifications: { ...emptyDashboard().qualifications, ...((raw || {}).qualifications || {}) },
      recentOperations: ((raw || {}).recentOperations || []).map((item) => ({
        ...item,
        actionText: ACTION_LABELS[item.action] || item.action || "管理操作",
        createdAtText: formatTime(item.createdAt),
      })),
    };

    let healthTitle = "运行正常";
    let healthCopy = "当前没有需要立即处理的事项";
    let healthClass = "healthy";
    let healthIcon = "/images/menu/check-circle.svg";
    if (dashboard.health === "CRITICAL") {
      healthTitle = "存在排班冲突";
      healthCopy = `${dashboard.schedule.leaveConflicts} 条休假冲突需要优先改派`;
      healthClass = "critical";
      healthIcon = "/images/menu/alert.svg";
    } else if (dashboard.health === "ATTENTION") {
      healthTitle = "有待处理事项";
      healthCopy = `共 ${dashboard.issueCount} 项，请按优先级处理`;
      healthClass = "attention";
      healthIcon = "/images/menu/bell.svg";
    }

    this.setData({ dashboard, healthTitle, healthCopy, healthClass, healthIcon });
  },

  onDateChange(e) {
    this.setData({ scheduleDate: e.detail.value, loaded: false }, () => {
      this.loadDashboard(true);
    });
  },

  onRefresh() {
    if (this.data.refreshing || this.data.loading) return;
    this.loadDashboard(true);
  },

  onRetry() {
    this.loadDashboard(true);
  },

  onNavigate(e) {
    const url = e.currentTarget.dataset.url;
    const mode = e.currentTarget.dataset.mode;
    if (!url) return;
    if (mode === "tab") {
      wx.switchTab({
        url,
        fail: () => wx.showToast({ title: "页面跳转失败，请重试", icon: "none" }),
      });
      return;
    }
    wx.navigateTo({
      url,
      fail: () => wx.showToast({ title: "页面跳转失败，请重试", icon: "none" }),
    });
  },

  onBackMine() {
    wx.switchTab({ url: "/pages/mine/index" });
  },
});
