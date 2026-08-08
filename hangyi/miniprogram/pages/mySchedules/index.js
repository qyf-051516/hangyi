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

  // ═══════════════════════════════════════
  // 导出日历(ICS)
  // ═══════════════════════════════════════

  onExportICS() {
    const schedules = this.data.schedules || [];
    const withDate = schedules.filter((item) => item && item.scheduleDate);
    if (!withDate.length) {
      wx.showToast({ title: "暂无可导出的排班", icon: "none" });
      return;
    }
    const ics = this.buildICS(withDate);
    wx.setClipboardData({
      data: ics,
      success: () => {
        wx.showToast({ title: "ICS 已复制，可粘贴保存为 .ics 导入日历", icon: "none" });
      },
    });
  },

  buildICS(schedules) {
    const pad = (n) => String(n).padStart(2, "0");
    const shiftTimes = {
      MORNING: ["08:00", "12:00"],
      AFTERNOON: ["13:00", "18:00"],
      NIGHT: ["19:00", "23:00"],
    };
    const toMinutes = (clock) => {
      const m = String(clock || "").match(/(\d{1,2}):(\d{2})/);
      return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
    };
    const parseDatetime = (value) => {
      const m = String(value || "").match(/(\d{4}-\d{2}-\d{2})[T ](\d{1,2}):(\d{2})/);
      if (!m) return null;
      return { date: m[1], clock: `${pad(m[2])}:${m[3]}` };
    };
    const asDate = (date, clock) => {
      const minutes = toMinutes(clock);
      const d = new Date(date + "T00:00:00");
      d.setMinutes(minutes >= 0 ? minutes : 0);
      return d;
    };
    const icsDateTime = (d) =>
      `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

    const now = new Date();
    const stamp = icsDateTime(now) + "Z";
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Hangyi//MySchedule//CN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
    ];

    schedules.forEach((item, index) => {
      const date = String(item.scheduleDate || "").slice(0, 10);
      const parsed = parseDatetime(item.departureTime);
      const startClock = parsed ? parsed.clock : (shiftTimes[item.shiftCode] || ["09:00", "13:00"])[0];
      const shiftEnd = shiftTimes[item.shiftCode] ? toMinutes(shiftTimes[item.shiftCode][1]) : -1;
      const startMinutes = toMinutes(startClock);
      const startDateObj = asDate(date, startClock);
      // 结束时间：优先班次结束；晚于班次结束或班次未知时按 8 小时顺延，自动跨天进位
      const endDateObj =
        shiftEnd > startMinutes
          ? asDate(date, `${pad(Math.floor(shiftEnd / 60))}:${pad(shiftEnd % 60)}`)
          : new Date(startDateObj.getTime() + 8 * 60 * 60 * 1000);
      const dtStart = icsDateTime(startDateObj);
      const dtEnd = icsDateTime(endDateObj);
      const shiftLabel = item.shiftLabelText || "";
      const summary = `${item.flightNo || "待定"}${shiftLabel ? " " + shiftLabel : ""} 勤务`.trim();
      const description = `航司 ${item.airline || "-"}，机型 ${item.aircraftType || "-"}`;
      const uid = `mysched-${item._id || `${date}-${index}`}@hangyi`;
      lines.push(
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${dtStart}`,
        `DTEND:${dtEnd}`,
        `SUMMARY:${summary}`,
        `DESCRIPTION:${description}`,
        "END:VEVENT"
      );
    });

    lines.push("END:VCALENDAR");
    return lines.join("\r\n");
  },

});
