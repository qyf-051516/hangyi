const { callBackend } = require("../../utils/api.js");
const { applyUiSettings, groupLabel } = require("../../utils/ui");

Page({
  data: {
    loading: true,
    errorText: "",
    completingId: "",
    staff: null,
    schedules: [],
    theme: "light",
    themeClass: "theme-light",
  },

  onShow() {
    applyUiSettings(this);
    this.loadData();
  },

  async loadData() {
    this.setData({ loading: true, errorText: "" });
    try {
      const data = await callBackend("getMySchedules");
      const shiftMap = { MORNING: "早班", AFTERNOON: "午班", NIGHT: "晚班" };
      const statusTextMap = { ASSIGNED: "已排班", SWAPPED: "已互换", COMPLETED: "已完成" };
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const completableStatuses = ["ASSIGNED", "SWAPPED", "IN_PROGRESS"];
      const schedules = (data.schedules || []).map((item) => ({
        ...item,
        departureTimeText: this.formatTimeText(item.departureTime),
        arrivalTimeText: this.formatTimeText(item.estimatedArrivalTime || item.arrivalTime),
        scheduledArrivalTimeText: this.formatTimeText(item.scheduledArrivalTime),
        shiftLabelText: shiftMap[item.shiftCode] || item.shiftCode || "-",
        statusText: statusTextMap[item.status] || item.status || "-",
        canComplete:
          item.scheduleDate <= today &&
          completableStatuses.includes(item.status) &&
          item.recordStatus !== "archived" &&
          item.needsReassignment !== true &&
          item.realtimeStatus !== "CANCELLED" &&
          (!item.realtimeStatus || item.realtimeStatus === "ARRIVED"),
        completionHint:
          item.needsReassignment === true
            ? "请假冲突，等待管理员改派"
            : item.scheduleDate > today
            ? "执行日期未到"
            : !completableStatuses.includes(item.status)
            ? "当前状态不可确认完成"
            : item.realtimeStatus === "CANCELLED"
            ? "航班已取消，无需确认完成"
            : item.realtimeStatus && item.realtimeStatus !== "ARRIVED"
            ? "航班尚未到达，暂不能确认完成"
            : "",
      }));
      const staff = data.staff
        ? { ...data.staff, groupId: groupLabel(data.staff.groupId) }
        : null;
      this.setData({
        staff,
        schedules,
      });
    } catch (error) {
      this.setData({
        staff: null,
        schedules: [],
        errorText: error.message || "排班加载失败，请下拉重试",
      });
    } finally {
      this.setData({ loading: false });
    }
  },

  async onCompleteSchedule(e) {
    const scheduleId = e.currentTarget.dataset.scheduleId;
    const item = this.data.schedules.find((schedule) => schedule._id === scheduleId);
    if (!scheduleId || !item || !item.canComplete || this.data.completingId) return;

    // 确认完成前复核航班实时状态: 取消或尚未到达时不允许确认完成
    if (item.realtimeStatus === "CANCELLED") {
      wx.showToast({ title: "航班已取消，无需确认完成", icon: "none" });
      return;
    }
    if (item.realtimeStatus && item.realtimeStatus !== "ARRIVED") {
      wx.showToast({ title: "航班尚未到达，暂不能确认完成", icon: "none" });
      return;
    }

    const confirm = await new Promise((resolve) => {
      wx.showModal({
        title: "确认完成",
        content: `确认将排班「${item.flightNo || "待定"}」标记为已完成？`,
        success: (res) => resolve(res.confirm),
      });
    });
    if (!confirm) return;

    this.setData({ completingId: scheduleId });
    wx.showLoading({ title: "提交中" });
    try {
      await callBackend("completeSchedule", { scheduleId });
      wx.showToast({ title: "已标记完成", icon: "success" });
      await this.loadData();
    } catch (error) {
      wx.showToast({ title: error.message || "操作失败", icon: "none" });
    } finally {
      this.setData({ completingId: "" });
      wx.hideLoading();
    }
  },

  formatTimeText(value) {
    if (!value) return "-";
    const raw = String(value).trim();
    if (!raw) return "-";
    // 统一输出 HH:mm, 与排班总表口径一致
    const matched = raw.match(/(?:T|\s)?(\d{1,2}):(\d{2})/);
    return matched ? `${matched[1].padStart(2, "0")}:${matched[2]}` : "-";
  },

  async onPullDownRefresh() {
    try {
      await this.loadData();
    } finally {
      wx.stopPullDownRefresh();
    }
  },

});
