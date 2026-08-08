const { callBackend } = require("../../utils/api.js");
const { applyUiSettings, loadIsAdmin } = require("../../utils/ui");
const { removeCache } = require("../../utils/cache");
const {
  chooseReasonImages,
  uploadReasonImages,
  previewReasonImages,
} = require("../../utils/media");

const TYPE_OPTIONS = [
  { value: "SICK", label: "病假" },
  { value: "PERSONAL", label: "事假" },
  { value: "TRAINING", label: "培训" },
  { value: "ANNUAL", label: "年假" },
  { value: "OTHER", label: "其他" },
];

const STATUS_TEXT = {
  PENDING: "待审批",
  APPROVED: "已批准",
  REJECTED: "已驳回",
  CANCELLED: "已撤回",
};

const APPROVAL_STATUS_OPTIONS = [
  { value: "PENDING", label: "待审批" },
  { value: "APPROVED", label: "已批准" },
  { value: "REJECTED", label: "已驳回" },
  { value: "CANCELLED", label: "已撤回" },
];

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const dayDiff = (start, end) => {
  if (!start || !end || start > end) return 0;
  const a = new Date(start + "T00:00:00Z").getTime();
  const b = new Date(end + "T00:00:00Z").getTime();
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
};

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

const formatLeaveItem = (item) => ({
  ...item,
  typeText: item.typeText || item.type || "请假",
  statusText: STATUS_TEXT[item.status] || item.status || "未知状态",
  createdAtText: formatTime(item.createdAt),
  reasonImages: (item.reasonImages || []).map((fileID) => ({
    fileID,
    displayUrl: fileID,
  })),
  validationText: item.validationSnapshot
    ? item.validationSnapshot.requiresReassignment
      ? `系统识别 ${item.validationSnapshot.affectedScheduleCount || 0} 条排班，批准后需改派`
      : "系统未发现请假区间内的排班冲突"
    : "历史申请未记录自动校验结果",
  auditTrail: (item.auditTrail || []).map((entry) => ({
    ...entry,
    atText: formatTime(entry.at),
  })),
});

Page({
  data: {
    theme: "light",
    themeClass: "theme-light",
    form: {
      employeeNo: "",
      name: "",
      type: "SICK",
      startDate: "",
      endDate: "",
      totalDays: 0,
      reason: "",
      reasonImages: [],
    },
    typeOptions: TYPE_OPTIONS,
    typeIndex: 0,
    todayDate: todayISO(),
    myList: [],
    approvalList: [],
    approvalStatusOptions: APPROVAL_STATUS_OPTIONS,
    approvalStatusIndex: 0,
    isApprovalMode: false,
    statusText: STATUS_TEXT,
    loading: false,
    submitting: false,
    actioningId: "",
    adminDenied: false,
    errorMessage: "",
  },

  onLoad(options = {}) {
    const isApprovalMode = options.mode === "approval";
    const updates = { isApprovalMode };
    if (!isApprovalMode) {
      // 从资质预警页进入：预选请假类别并预填培训原因
      const requestedType = String(options.type || "").trim();
      if (requestedType) {
        const typeIndex = TYPE_OPTIONS.findIndex((o) => o.value === requestedType);
        if (typeIndex >= 0) {
          updates.typeIndex = typeIndex;
          updates["form.type"] = requestedType;
        }
      }
      const qualAircraft = String(options.qualAircraft || "").trim();
      const expireDate = String(options.expireDate || "").trim();
      if (qualAircraft) {
        const base = `因${qualAircraft}资质到期需培训`;
        updates["form.reason"] = expireDate ? `${base}（到期日 ${expireDate}）` : base;
      }
    }
    this.setData(updates);
    wx.setNavigationBarTitle({
      title: isApprovalMode ? "请假审批" : "请假申请",
    });
  },

  async onShow() {
    applyUiSettings(this);
    if (this.data.isApprovalMode) {
      const isAdmin = await loadIsAdmin(true);
      if (!isAdmin) {
        this.setData({ adminDenied: true, loading: false });
        return;
      }
      this.setData({ adminDenied: false });
      await this.loadApprovalLeaves();
    } else {
      this.loadProfile();
      this.loadMyLeaves();
    }
  },

  async loadProfile() {
    try {
      const profile = await callBackend("getMyProfile", { forceRefresh: true });
      this.setData({
        "form.employeeNo": profile.employeeNo || "",
        "form.name": profile.name || "",
      });
    } catch (_) { /* 未登录静默 */ }
  },

  async loadMyLeaves() {
    this.setData({ loading: true });
    try {
      const res = await callBackend("listMyLeaveRequests");
      this.setData({
        myList: (res.list || []).map(formatLeaveItem),
        loading: false,
      });
    } catch (e) {
      this.setData({ loading: false });
    }
  },

  async loadApprovalLeaves() {
    this.setData({ loading: true, errorMessage: "" });
    const selected = APPROVAL_STATUS_OPTIONS[this.data.approvalStatusIndex] || APPROVAL_STATUS_OPTIONS[0];
    try {
      const res = await callBackend("listPendingLeaveRequests", {
        status: selected.value,
      });
      this.setData({
        approvalList: (res.list || []).map(formatLeaveItem),
        loading: false,
      });
    } catch (e) {
      this.setData({
        approvalList: [],
        loading: false,
        errorMessage: e.message || "请假审批记录加载失败",
      });
    }
  },

  onInputField(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: e.detail.value });
    if (field === "startDate" || field === "endDate") {
      this.setData({ "form.totalDays": dayDiff(this.data.form.startDate, this.data.form.endDate) });
    }
  },

  onDateChange(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: e.detail.value });
    this.setData({ "form.totalDays": dayDiff(this.data.form.startDate, this.data.form.endDate) });
  },

  onTypeChange(e) {
    const index = Number(e.detail.value);
    this.setData({ typeIndex: index, "form.type": TYPE_OPTIONS[index].value });
  },

  async onChooseReasonImages() {
    try {
      const reasonImages = await chooseReasonImages(this.data.form.reasonImages, 6);
      this.setData({
        "form.reasonImages": reasonImages.map((item) => ({
          ...item,
          displayUrl: item.fileID || item.path,
        })),
      });
    } catch (error) {
      if (String(error.errMsg || "").includes("cancel")) return;
      wx.showToast({ title: error.message || "选择图片失败", icon: "none" });
    }
  },

  onRemoveReasonImage(e) {
    const index = Number(e.currentTarget.dataset.index);
    this.setData({
      "form.reasonImages": this.data.form.reasonImages.filter(
        (_, itemIndex) => itemIndex !== index
      ),
    });
  },

  onPreviewReasonImage(e) {
    previewReasonImages(this.data.form.reasonImages, Number(e.currentTarget.dataset.index));
  },

  onPreviewListImage(e) {
    const id = e.currentTarget.dataset.id;
    const source = this.data.isApprovalMode ? this.data.approvalList : this.data.myList;
    const request = source.find((item) => item._id === id);
    if (request) previewReasonImages(request.reasonImages, Number(e.currentTarget.dataset.index));
  },

  async onSubmit() {
    if (this.data.submitting) return;
    const f = this.data.form;
    if (!f.employeeNo) return wx.showToast({ title: "请先登录", icon: "none" });
    if (!f.startDate || !f.endDate) return wx.showToast({ title: "请选择日期", icon: "none" });
    if (f.totalDays <= 0) return wx.showToast({ title: "日期无效", icon: "none" });
    const reasonText = String(f.reason || "").trim();
    if (!reasonText && !f.reasonImages.length) {
      return wx.showToast({ title: "请填写原因或上传图片", icon: "none" });
    }
    this.setData({ submitting: true });
    try {
      const uploadedImages = await uploadReasonImages(f.reasonImages, "leave");
      this.setData({
        "form.reasonImages": uploadedImages.map((item) => ({
          ...item,
          displayUrl: item.fileID || item.path,
        })),
      });
      const result = await callBackend("createLeaveRequest", {
        type: f.type,
        startDate: f.startDate,
        endDate: f.endDate,
        reasonText,
        reasonImages: uploadedImages.map((item) => item.fileID),
      });
      wx.showToast({ title: "提交成功", icon: "success" });
      removeCache("mine_profile");
      this.setData({
        "form.startDate": "",
        "form.endDate": "",
        "form.totalDays": 0,
        "form.reason": "",
        "form.reasonImages": [],
      });
      await this.loadMyLeaves();
      if (
        result.validationSnapshot &&
        result.validationSnapshot.requiresReassignment
      ) {
        wx.showModal({
          title: "已完成排班冲突检查",
          content: `请假区间内有 ${result.validationSnapshot.affectedScheduleCount} 条排班，批准后会自动标记为待改派。`,
          showCancel: false,
        });
      }
    } catch (e) {
      wx.showToast({ title: e.message || "提交失败", icon: "none" });
    } finally {
      this.setData({ submitting: false });
    }
  },

  async onWithdraw(e) {
    const id = e.currentTarget.dataset.id;
    const res = await new Promise((resolve) => {
      wx.showModal({
        title: "撤回申请",
        content: "确定撤回该请假申请？撤回后无法恢复。",
        success: (r) => resolve(r.confirm),
      });
    });
    if (!res) return;
    try {
      await callBackend("withdrawLeaveRequest", { requestId: id });
      wx.showToast({ title: "已撤回", icon: "success" });
      removeCache("mine_profile");
      await this.loadMyLeaves();
    } catch (e) {
      wx.showToast({ title: e.message || "撤回失败", icon: "none" });
    }
  },

  onApprovalStatusChange(e) {
    const approvalStatusIndex = Number(e.detail.value || 0);
    this.setData({ approvalStatusIndex }, () => this.loadApprovalLeaves());
  },

  async approveLeave(requestId, decision, comment = "") {
    if (!requestId || this.data.actioningId) return;
    this.setData({ actioningId: requestId });
    try {
      await callBackend("approveLeaveRequest", {
        requestId,
        decision,
        comment,
      });
      wx.showToast({
        title: decision === "APPROVED" ? "已批准" : "已驳回",
        icon: "success",
      });
      removeCache("mine_profile");
      await this.loadApprovalLeaves();
    } catch (e) {
      wx.showToast({ title: e.message || "审批失败", icon: "none" });
    } finally {
      this.setData({ actioningId: "" });
    }
  },

  async onApprove(e) {
    const requestId = e.currentTarget.dataset.id;
    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: "批准请假",
        content: "确认批准这条请假申请？",
        confirmText: "批准",
        success: (res) => resolve(res.confirm),
        fail: () => resolve(false),
      });
    });
    if (confirmed) await this.approveLeave(requestId, "APPROVED");
  },

  onRetryApproval() {
    this.loadApprovalLeaves();
  },

  onBackMine() {
    wx.switchTab({ url: "/pages/mine/index" });
  },

  async onReject(e) {
    const requestId = e.currentTarget.dataset.id;
    const modalResult = await new Promise((resolve) => {
      wx.showModal({
        title: "驳回请假",
        content: "",
        editable: true,
        placeholderText: "请输入驳回原因",
        confirmText: "驳回",
        confirmColor: "#c94b56",
        success: resolve,
        fail: () => resolve({ confirm: false }),
      });
    });
    if (!modalResult.confirm) return;
    const comment = String(modalResult.content || "").trim();
    if (!comment) {
      wx.showToast({ title: "请填写驳回原因", icon: "none" });
      return;
    }
    await this.approveLeave(requestId, "REJECTED", comment);
  },

  async onPullDownRefresh() {
    try {
      if (this.data.isApprovalMode) {
        if (this.data.adminDenied) return;
        await this.loadApprovalLeaves();
      } else {
        await Promise.all([this.loadProfile(), this.loadMyLeaves()]);
      }
    } finally {
      wx.stopPullDownRefresh();
    }
  },
});
