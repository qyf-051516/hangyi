const { callBackend } = require("../../utils/api.js");
const { applyUiSettings } = require("../../utils/ui");
const { removeCache } = require("../../utils/cache");
const {
  chooseReasonImages,
  uploadReasonImages,
  previewReasonImages,
} = require("../../utils/media");

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

const formatScheduleClock = (value) => {
  const raw = String(value || "");
  const matched = raw.match(/(?:T|\s)?(\d{1,2}):(\d{2})/);
  return matched ? `${matched[1].padStart(2, "0")}:${matched[2]}` : "";
};

// 当天日期字符串 YYYY-MM-DD, 可直接与排班日期字符串比较
const todayStr = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

const decorateSchedule = (item) => {
  const startTime = formatScheduleClock(item._taskStart || item.arrivalTime);
  const endTime = formatScheduleClock(item._taskEnd || item.departureTime);
  const timeText = startTime || endTime
    ? `${startTime || "待定"} 至 ${endTime || "待定"}`
    : "时段待定";
  return {
    ...item,
    startTime,
    endTime,
    pickerText: `${item.scheduleDate || "日期待定"} ${item.flightNo || "无航班号"} ${timeText}`,
  };
};

const AUDIT_STEP_NAMES = ["提交", "审批", "结果"];

// 审计条目归入步骤：0=提交, 1=审批, 2=结果
const auditStepOf = (entry) => {
  const s = String(entry.status || entry.action || "");
  if (s === "CANCELLED" || s === "WITHDRAWN") return 2;
  if (s === "APPROVED" || s === "REJECTED") return 1;
  return 0;
};

// 根据申请状态构建三步进度：done=已完成, current=进行中, todo=未开始, fail=失败
const buildProgressSteps = (status, auditTrail) => {
  const stateMap = {
    PENDING: ["done", "current", "todo"],
    PENDING_TARGET_CONFIRMATION: ["done", "current", "todo"],
    APPROVED: ["done", "done", "done"],
    REJECTED: ["done", "done", "fail"],
    CANCELLED: ["done", "todo", "fail"],
  };
  const stateArr = stateMap[status] || ["done", "current", "todo"];
  const resultTextMap = { APPROVED: "已批准", REJECTED: "已驳回", CANCELLED: "已撤回" };
  return AUDIT_STEP_NAMES.map((label, i) => ({
    key: label,
    label,
    state: stateArr[i] || "todo",
    resultText: i === 2 ? (resultTextMap[status] || "") : "",
    entries: auditTrail.filter((entry) => auditStepOf(entry) === i),
  }));
};

const decorateRequest = (item) => {
  const auditTrail = (item.auditTrail || [])
    .slice()
    .sort((a, b) => new Date(a.at) - new Date(b.at))
    .map((entry) => ({
      ...entry,
      atText: formatTime(entry.at),
    }));
  return {
    ...item,
    createdAtText: formatTime(item.createdAt),
    reasonImages: (item.reasonImages || []).map((fileID) => ({
      fileID,
      displayUrl: fileID,
    })),
    validationText: item.validationSnapshot
      ? item.validationSnapshot.passed === false
        ? "系统校验发现待处理项"
        : "资质与工时校验通过"
      : "历史申请未记录自动校验结果",
    auditTrail,
    steps: buildProgressSteps(item.status, auditTrail),
  };
};

Page({
  data: {
    employeeNo: "",
    name: "",
    mySchedules: [],
    scheduleIndex: 0,
    selectedScheduleId: "",
    selectedSchedule: null,
    scheduleLoading: false,
    scheduleError: "",
    reason: "",
    reasonImages: [],
    myRequests: [],
    listLoading: false,
    submitting: false,
    withdrawingId: "",
    fontSize: 14,
    theme: "light",
    themeClass: "theme-light",
  },

  async onShow() {
    applyUiSettings(this);
    await Promise.all([
      this.loadProfileAndSchedules(),
      this.loadMyRequests(),
    ]);
  },

  async loadProfileAndSchedules() {
    this.setData({ scheduleLoading: true, scheduleError: "" });
    try {
      const [profile, scheduleResult] = await Promise.all([
        callBackend("getMyProfile"),
        callBackend("getMySchedules"),
      ]);
      // 仅展示未来排班: 后端已拒绝历史排班申请, 前端提前过滤, 避免可选到已过去的班次
      const mySchedules = (scheduleResult.schedules || [])
        .filter((item) => item && item.status !== "COMPLETED" && item.recordStatus !== "archived" && item.scheduleDate > todayStr())
        .map(decorateSchedule);
      const selectedIndex = Math.min(this.data.scheduleIndex, Math.max(mySchedules.length - 1, 0));
      const selectedSchedule = mySchedules[selectedIndex] || null;
      this.setData({
        employeeNo: profile.employeeNo || "",
        name: profile.name || "",
        mySchedules,
        scheduleIndex: selectedIndex,
        selectedSchedule,
        selectedScheduleId: selectedSchedule ? selectedSchedule._id : "",
      });
    } catch (error) {
      this.setData({
        mySchedules: [],
        selectedSchedule: null,
        selectedScheduleId: "",
        scheduleError: error.message || "排班加载失败",
      });
    } finally {
      this.setData({ scheduleLoading: false });
    }
  },

  async loadMyRequests() {
    this.setData({ listLoading: true });
    try {
      const res = await callBackend("listMySwapRequests");
      const myRequests = (res.list || []).map(decorateRequest);
      this.setData({ myRequests });
    } catch (error) {
      // 刷新失败: 保留旧列表, 仅提示, 不置空
      wx.showToast({ title: error.message || "申请列表加载失败，已保留旧数据", icon: "none" });
    } finally {
      this.setData({ listLoading: false });
    }
  },

  onInputReason(e) {
    this.setData({ reason: String(e.detail.value || "") });
  },

  async onChooseReasonImages() {
    try {
      const reasonImages = await chooseReasonImages(this.data.reasonImages, 6);
      this.setData({
        reasonImages: reasonImages.map((item) => ({
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
    const reasonImages = this.data.reasonImages.filter((_, itemIndex) => itemIndex !== index);
    this.setData({ reasonImages });
  },

  onPreviewReasonImage(e) {
    previewReasonImages(this.data.reasonImages, Number(e.currentTarget.dataset.index));
  },

  onPreviewRequestImage(e) {
    const request = this.data.myRequests.find((item) => item._id === e.currentTarget.dataset.id);
    if (request) previewReasonImages(request.reasonImages, Number(e.currentTarget.dataset.index));
  },

  onPickSchedule(e) {
    const scheduleIndex = Number(e.detail.value || 0);
    const selectedSchedule = this.data.mySchedules[scheduleIndex] || null;
    this.setData({
      scheduleIndex,
      selectedSchedule,
      selectedScheduleId: selectedSchedule ? selectedSchedule._id : "",
    });
  },

  async onSubmit() {
    if (this.data.submitting) return;

    const sourceScheduleId = this.data.selectedScheduleId;
    const reason = String(this.data.reason || "").trim();

    if (!sourceScheduleId) return wx.showToast({ title: "请选择本人排班", icon: "none" });
    if (!reason && !this.data.reasonImages.length) {
      return wx.showToast({ title: "请填写原因或上传图片", icon: "none" });
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: "提交中" });

    try {
      const uploadedImages = await uploadReasonImages(this.data.reasonImages, "swap");
      this.setData({
        reasonImages: uploadedImages.map((item) => ({
          ...item,
          displayUrl: item.fileID || item.path,
        })),
      });
      const result = await callBackend("createSwapApplication", {
        sourceScheduleId,
        reasonText: reason,
        reasonImages: uploadedImages.map((item) => item.fileID),
      });
      wx.showToast({ title: "申请已提交", icon: "success" });
      removeCache("mine_profile");
      this.setData({ reason: "", reasonImages: [] });
      await this.loadMyRequests();
      if (result.validationSnapshot && result.validationSnapshot.passed === false) {
        wx.showModal({
          title: "已记录合规提示",
          content: "原排班存在待处理合规项，管理员审批时会再次自动复核。",
          showCancel: false,
        });
      }
    } catch (error) {
      wx.showToast({ title: error.message || "提交失败", icon: "none" });
    } finally {
      this.setData({ submitting: false });
      wx.hideLoading();
    }
  },

  async onWithdraw(e) {
    const requestId = e.currentTarget.dataset.id;
    if (!requestId || this.data.withdrawingId) return;
    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: "撤回申请",
        content: "确认撤回这条调班申请？撤回后无法恢复。",
        confirmText: "撤回",
        confirmColor: "#c94b56",
        success: (res) => resolve(res.confirm),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;

    this.setData({ withdrawingId: requestId });
    try {
      await callBackend("withdrawSwapRequest", { requestId });
      wx.showToast({ title: "已撤回", icon: "success" });
      removeCache("mine_profile");
      await this.loadMyRequests();
    } catch (error) {
      wx.showToast({ title: error.message || "撤回失败", icon: "none" });
    } finally {
      this.setData({ withdrawingId: "" });
    }
  },

  async onPullDownRefresh() {
    try {
      await Promise.all([this.loadProfileAndSchedules(), this.loadMyRequests()]);
    } finally {
      wx.stopPullDownRefresh();
    }
  },
});
