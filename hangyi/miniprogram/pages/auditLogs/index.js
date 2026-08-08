const { callBackend } = require("../../utils/api.js");
const { applyUiSettings, loadRole } = require("../../utils/ui");

const ACTION_LABELS = {
  PUBLISH_SCHEDULE: "发布排班",
  PUBLISH_SERVICE_SCHEDULE: "发布勤务排班",
  AUTO_SCHEDULE: "自动排班",
  REJECT_SWAP: "驳回调班",
  APPROVE_SWAP: "审批调班",
  APPROVE_SWAP_EXCHANGE: "审批互换",
  CREATE_SWAP: "提交互换申请",
  CREATE_SHIFT_APPLICATION: "提交调班申请",
  WITHDRAW_SWAP: "撤回调班申请",
  UPDATE_CONFIG: "修改配置",
  BOOTSTRAP_DATA: "初始化数据",
  LOGIN: "登录",
  LOGOUT: "登出",
  REGISTER: "注册",
  PROPAGATE_DELAY: "延误传播",
  UPDATE_FLIGHT_STATUS: "更新航班状态",
  UPDATE_FLIGHT_OPERATIONAL_DATA: "更新航班运行数据",
  REALTIME_REASSIGN: "实时改班",
  APPROVE_LEAVE: "批准请假",
  REJECT_LEAVE: "驳回请假",
  CREATE_LEAVE: "提交请假申请",
  WITHDRAW_LEAVE: "撤回请假申请",
  SMART_SCHEDULE: "智能排班",
  IMPORT_SCHEDULE: "导入排班",
  EXPORT_SCHEDULE: "导出排班",
  UPDATE_STAFF_ADMIN: "更新人员资料",
  SET_STAFF_ADMIN: "调整管理员权限",
  OPTIMIZE_SCHEDULE: "疲劳优化",
};

Page({
  data: {
    logs: [],
    total: 0,
    page: 1,
    loading: true,
    loadingMore: false,
    filterAction: "",
    actionOptions: Object.keys(ACTION_LABELS).map((value) => ({
      value,
      label: ACTION_LABELS[value],
    })),
    startDate: "",
    endDate: "",
    errorMessage: "",
    themeClass: "theme-light",
    isAdmin: false,
    isBoss: false,
    adminDenied: false,
  },

  async onShow() {
    applyUiSettings(this);
    const role = await loadRole(true);
    if (!role.isAdmin && !role.isBoss) {
      this.setData({ isAdmin: false, isBoss: false, adminDenied: true, loading: false });
      return;
    }
    this.setData({ isAdmin: role.isAdmin, isBoss: role.isBoss, adminDenied: false, page: 1, logs: [] });
    await this.loadData();
  },

  onPullDownRefresh() {
    if (!this.data.isAdmin && !this.data.isBoss) {
      wx.stopPullDownRefresh();
      return;
    }
    this.setData({ page: 1, logs: [] });
    this.loadData().then(() => wx.stopPullDownRefresh());
  },

  async loadData() {
    if (!this.data.isAdmin && !this.data.isBoss) return;
    if (this.data.page === 1) this.setData({ loading: true });
    else this.setData({ loadingMore: true });
    this.setData({ errorMessage: "" });
    try {
      const data = await callBackend("queryOperationLogs", {
        page: this.data.page,
        pageSize: 30,
        action: this.data.filterAction || undefined,
        startDate: this.data.startDate || undefined,
        endDate: this.data.endDate || undefined,
      });
      const nextLogs = (data.logs || []).map((item) => ({
        ...item,
        actionText: ACTION_LABELS[item.action] || item.action || "管理操作",
        createdAtText: this.formatTime(item.createdAt),
        operatorText: item.operator || "系统",
      }));
      this.setData({
        logs: this.data.page === 1 ? nextLogs : [...this.data.logs, ...nextLogs],
        total: data.total || 0,
        loading: false,
        loadingMore: false,
      });
    } catch (error) {
      this.setData({
        loading: false,
        loadingMore: false,
        errorMessage: error.message || "审计日志加载失败",
      });
    }
  },

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

  onFilterChange(e) {
    const action = e.currentTarget.dataset.action;
    this.setData({
      filterAction: this.data.filterAction === action ? "" : action,
      page: 1,
      logs: [],
    });
    this.loadData();
  },

  onDateChange(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    const startDate = field === "startDate" ? value : this.data.startDate;
    const endDate = field === "endDate" ? value : this.data.endDate;
    if (startDate && endDate && startDate > endDate) {
      wx.showToast({ title: "开始日期不能晚于结束日期", icon: "none" });
      return;
    }
    this.setData({ [field]: value, page: 1, logs: [] }, () => this.loadData());
  },

  onClearDates() {
    this.setData({ startDate: "", endDate: "", page: 1, logs: [] }, () => this.loadData());
  },

  onLoadMore() {
    if (this.data.loadingMore || this.data.logs.length >= this.data.total) return;
    this.setData({ page: this.data.page + 1 });
    this.loadData();
  },

  /** 导出审计日志 */
  async onExportLogs() {
    wx.showLoading({ title: "导出中…" });
    try {
      const result = await callBackend("exportOperationLogs", {
        action: this.data.filterAction || undefined,
        startDate: this.data.startDate || undefined,
        endDate: this.data.endDate || undefined,
        pageSize: 500,
      });
      wx.hideLoading();

      if (!result.fileID) {
        wx.showToast({ title: "导出失败", icon: "none" });
        return;
      }

      wx.showLoading({ title: "下载文件中…" });
      const downloadRes = await wx.cloud.downloadFile({
        fileID: result.fileID,
      });
      wx.hideLoading();

      if (!downloadRes.tempFilePath) {
        wx.showToast({ title: "下载失败", icon: "none" });
        return;
      }

      wx.openDocument({
        filePath: downloadRes.tempFilePath,
        fileType: "csv",
        showMenu: true,
        success: () => {
          wx.showToast({ title: `已导出 ${result.exported} 条`, icon: "success" });
        },
        fail: () => {
          wx.showToast({ title: "打开文件失败", icon: "none" });
        },
      });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: error.message || "导出失败", icon: "none" });
    }
  },

  onRetry() {
    this.setData({ page: 1, logs: [] }, () => this.loadData());
  },

  onBackMine() {
    wx.switchTab({ url: "/pages/mine/index" });
  },
});
