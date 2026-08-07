const { callBackend } = require("../../utils/api.js");
const { applyUiIfThemeChanged, groupLabel } = require("../../utils/ui");
const { readCache, writeCache } = require("../../utils/cache");

const SHIFT_TEXT = {
  MORNING: "早班",
  AFTERNOON: "午班",
  NIGHT: "晚班",
};

const STATUS_TONE = {
  ASSIGNED: "status-assigned",
  SWAPPED: "status-swapped",
  COMPLETED: "status-completed",
  UNASSIGNED: "status-unassigned",
  ON_LEAVE: "status-leave",
  LEAVE_CONFLICT: "status-conflict",
};

Page({
  // 加载序号: 防止 init / 切换日期 / 下拉刷新等并发请求的旧响应覆盖新数据
  _loadSeq: 0,

  data: {
    loading: false,
    loaded: false,
    errorMessage: "",
    scheduleDate: "",
    todayDate: "",
    rows: [],
    filteredRows: [],
    query: "",
    expandedStaffId: "",
    groupOptions: ["全部班组"],
    shiftOptions: ["全部班次", "早班", "午班", "晚班", "未排班"],
    statusOptions: ["全部状态", "已排班", "已互换", "已完成", "未排班", "休假", "休假冲突"],
    selectedGroup: "全部班组",
    selectedShift: "全部班次",
    selectedStatus: "全部状态",
    hasActiveFilters: false,
    emptyText: "暂无排班数据",
    assignedCount: 0,
    unassignedCount: 0,
    leaveCount: 0,
    conflictCount: 0,
    fontSize: 14,
    theme: "light",
    themeClass: "theme-light",
  },

  onShow() {
    applyUiIfThemeChanged(this);
    this.init();
  },

  async init() {
    const seq = ++this._loadSeq;
    const todayDate = this.formatDate(new Date());
    const scheduleDate = this.data.scheduleDate || todayDate;
    this.setData({ loading: true, errorMessage: "", todayDate, scheduleDate });
    try {
      await this.loadTable(false, scheduleDate, seq);
    } catch (error) {
      if (seq !== this._loadSeq) return;
      this.setData({ errorMessage: error.message || "排班加载失败，请稍后重试" });
    } finally {
      if (seq !== this._loadSeq) return;
      this.setData({ loading: false });
    }
  },

  async loadTable(forceRefresh = false, requestedDate = "", seq = 0) {
    const targetDate = requestedDate || this.data.scheduleDate || this.formatDate(new Date());
    const cacheKey = `schedule_mobile_v2_${targetDate}`;

    if (!forceRefresh) {
      const cached = readCache(cacheKey, 30000);
      if (cached) {
        if (seq && seq !== this._loadSeq) return;
        this.setData({ ...cached, loading: false, loaded: true, errorMessage: "" });
        this.applyFilters();
        return;
      }
    }

    const data = await callBackend("getStaffScheduleTable", { scheduleDate: targetDate });
    if (seq && seq !== this._loadSeq) return;
    const rows = (data.rows || []).map((item) => ({
      ...item,
      shiftText: SHIFT_TEXT[item.shiftCode] || item.shiftCode || "未排班",
      groupText: groupLabel(item.groupId),
      arrivalTimeText: this.formatTimeOnly(item.arrivalTime),
      departureTimeText: this.formatTimeOnly(item.departureTime),
      stayHoursText: this.formatStayHoursText(item.stayHours),
      realtimeStatusText: {
        ON_TIME: "正常",
        DELAYED: "延误",
        CANCELLED: "取消",
        ARRIVED: "已到",
      }[item.realtimeStatus] || "",
      statusTone: STATUS_TONE[item.status] || "status-default",
      realtimeTone: item.realtimeStatus
        ? `realtime-${String(item.realtimeStatus).toLowerCase()}`
        : "",
      searchText: [
        item.employeeNo,
        item.name,
        groupLabel(item.groupId),
        item.flightNo,
        item.airline,
        item.aircraftType,
        item.engineModel,
        item.aircraftRegistration,
        item.aircraftQualifications,
      ].filter(Boolean).join(" ").toLowerCase(),
    }));
    const groupSet = new Set(rows.map((item) => item.groupText).filter(Boolean));
    const assignedCount = rows.filter(
      (item) => ["ASSIGNED", "SWAPPED", "COMPLETED"].includes(item.status)
    ).length;
    const unassignedCount = rows.filter((item) => item.status === "UNASSIGNED").length;
    const leaveCount = rows.filter((item) => item.status === "ON_LEAVE").length;
    const conflictCount = rows.filter((item) => item.compliancePassed === false).length;

    const result = {
      scheduleDate: data.scheduleDate || targetDate,
      rows,
      groupOptions: ["全部班组", ...Array.from(groupSet)],
      assignedCount,
      unassignedCount,
      leaveCount,
      conflictCount,
      selectedGroup:
        this.data.selectedGroup !== "全部班组" && !groupSet.has(this.data.selectedGroup)
          ? "全部班组"
          : this.data.selectedGroup,
    };

    writeCache(cacheKey, result);
    this.setData({ ...result, loaded: true, errorMessage: "" });
    this.applyFilters();
  },

  formatTimeOnly(value) {
    if (!value) return "-";
    const str = String(value).trim();
    if (!str) return "-";
    const idx = str.indexOf("T");
    return idx >= 0 ? str.slice(idx + 1, idx + 6) : str.slice(0, 5);
  },

  formatStayHoursText(value) {
    if (value === undefined || value === null || value === "") return "-";
    const num = Number(value);
    if (Number.isNaN(num)) return "-";
    return `${num}小时`;
  },

  formatDate(date) {
    const y = date.getFullYear();
    const m = `${date.getMonth() + 1}`.padStart(2, "0");
    const d = `${date.getDate()}`.padStart(2, "0");
    return `${y}-${m}-${d}`;
  },

  applyFilters() {
    const { rows, selectedGroup, selectedShift, selectedStatus } = this.data;
    const query = String(this.data.query || "").trim().toLowerCase();
    const filteredRows = rows.filter((item) => {
      const shiftLabel = item.shiftCode ? SHIFT_TEXT[item.shiftCode] || item.shiftCode : "未排班";
      const statusLabel = item.statusText || "未知";

      if (query && !String(item.searchText || "").includes(query)) return false;
      if (selectedGroup !== "全部班组" && item.groupText !== selectedGroup) return false;
      if (selectedShift !== "全部班次" && shiftLabel !== selectedShift) return false;
      if (selectedStatus !== "全部状态" && statusLabel !== selectedStatus) return false;
      return true;
    });
    const hasActiveFilters = Boolean(
      query ||
      selectedGroup !== "全部班组" ||
      selectedShift !== "全部班次" ||
      selectedStatus !== "全部状态"
    );
    this.setData({
      filteredRows,
      hasActiveFilters,
      emptyText: hasActiveFilters ? "没有符合条件的人员" : "该日期暂无排班人员",
    });
  },

  onInputQuery(e) {
    this.setData({ query: String(e.detail.value || "").slice(0, 50) });
    this.applyFilters();
  },

  onSubmitSearch() {
    this.applyFilters();
  },

  onPickGroup(e) {
    const idx = Number(e.detail.value || 0);
    this.setData({ selectedGroup: this.data.groupOptions[idx] || "全部班组" });
    this.applyFilters();
  },

  onPickShift(e) {
    const idx = Number(e.detail.value || 0);
    this.setData({ selectedShift: this.data.shiftOptions[idx] || "全部班次" });
    this.applyFilters();
  },

  onPickStatus(e) {
    const idx = Number(e.detail.value || 0);
    this.setData({ selectedStatus: this.data.statusOptions[idx] || "全部状态" });
    this.applyFilters();
  },

  onClearFilters() {
    this.setData({
      query: "",
      selectedGroup: "全部班组",
      selectedShift: "全部班次",
      selectedStatus: "全部状态",
      expandedStaffId: "",
    });
    this.applyFilters();
  },

  onToggleDetail(e) {
    const staffId = String(e.currentTarget.dataset.id || "");
    if (!staffId) return;
    this.setData({
      expandedStaffId: this.data.expandedStaffId === staffId ? "" : staffId,
    });
  },

  async onPickDate(e) {
    const scheduleDate = String(e.detail.value || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduleDate) || scheduleDate === this.data.scheduleDate) return;
    const seq = ++this._loadSeq;
    this.setData({
      scheduleDate,
      loading: true,
      loaded: false,
      errorMessage: "",
      expandedStaffId: "",
      rows: [],
      filteredRows: [],
      assignedCount: 0,
      unassignedCount: 0,
      leaveCount: 0,
      conflictCount: 0,
    });
    try {
      await this.loadTable(false, scheduleDate, seq);
    } catch (error) {
      if (seq !== this._loadSeq) return;
      this.setData({ errorMessage: error.message || "排班加载失败，请稍后重试" });
    } finally {
      if (seq !== this._loadSeq) return;
      this.setData({ loading: false });
    }
  },

  onGoToday() {
    if (this.data.scheduleDate === this.data.todayDate) return;
    this.onPickDate({ detail: { value: this.data.todayDate } });
  },

  async onRefresh() {
    if (this.data.loading) return;
    const seq = ++this._loadSeq;
    this.setData({ loading: true, errorMessage: "" });
    try {
      const targetDate = this.data.scheduleDate || this.formatDate(new Date());
      wx.removeStorageSync("data_cache_schedule_mobile_v2_" + targetDate);
      await this.loadTable(true, targetDate, seq);
      if (seq !== this._loadSeq) return;
      wx.showToast({ title: "已刷新", icon: "success" });
    } catch (error) {
      if (seq !== this._loadSeq) return;
      const errorMessage = error.message || "刷新失败，请稍后重试";
      this.setData({ errorMessage });
      wx.showToast({ title: errorMessage, icon: "none" });
    } finally {
      if (seq !== this._loadSeq) return;
      this.setData({ loading: false });
    }
  },

  onRetry() {
    this.init();
  },

  async onPullDownRefresh() {
    try {
      await this.onRefresh();
    } finally {
      wx.stopPullDownRefresh();
    }
  },
});
