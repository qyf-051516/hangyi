const { callBackend } = require("../../utils/api.js");
const { applyUiSettings, loadIsAdmin } = require("../../utils/ui");
const { readCache, writeCache } = require("../../utils/cache");

Page({
  data: {
    loading: true,
    dateLabel: "",
    scheduleDate: "",
    tabIndex: 0,
    tasks: [],
    staffChains: [],
    stats: {},
    theme: "light",
    themeClass: "theme-light",
    isAdmin: false,
    adminDenied: false,
    errorMessage: "",
    isOffline: false,
    isPreview: false,

    // 甘特图数据
    ganttData: null,

    // 任务详情弹窗
    showTaskDetail: false,
    detailTask: null,

    // 可用人员列表弹窗
    showStaffList: false,
    detailStaff: [],

    // 实时状态
    realtimeStatuses: [],
    showStatusMenu: false,
    statusTargetFlight: "",

    // 可用人员替换
    showAvailableStaff: false,
    availableStaff: [],
    reassignTarget: null, // { flightNo, taskType, oldStaffId }

    // 延误传播
    showDelayInput: false,
    delayTarget: null,
    delayMinutes: 30,
    delayMinusValue: 25,
    delayPlusValue: 35,
    delayReason: "",
  },

  async onShow() {
    applyUiSettings(this);
    if (!this.data.scheduleDate) this.updateDate();
    this.updateNetworkStatus();
    const isAdmin = await loadIsAdmin(true);
    if (!isAdmin) {
      this.setData({ isAdmin: false, adminDenied: true, loading: false });
      return;
    }
    this.setData({ isAdmin: true, adminDenied: false });
    await this.loadData();
  },

  onHide() {
    this._offNetworkCallback && wx.offNetworkStatusChange(this._offNetworkCallback);
    this._networkListenerRegistered = false;
  },

  updateNetworkStatus() {
    const app = getApp();
    const offline = !app.globalData.isConnected;
    this.setData({ isOffline: offline });

    if (!this._networkListenerRegistered) {
      this._offNetworkCallback = (res) => {
        const off = !res.isConnected;
        this.setData({ isOffline: off });
        if (!off) {
          // 网络恢复，自动刷新
          this.loadData();
          wx.showToast({ title: "网络已恢复", icon: "none", duration: 1500 });
        }
      };
      wx.onNetworkStatusChange(this._offNetworkCallback);
      this._networkListenerRegistered = true;
    }
  },

  onPullDownRefresh() {
    if (!this.data.isAdmin) {
      wx.stopPullDownRefresh();
      return;
    }
    this.loadData().then(() => wx.stopPullDownRefresh());
  },

  updateDate() {
    const d = new Date();
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, "0");
    const day = `${d.getDate()}`.padStart(2, "0");
    this.setData({
      dateLabel: `${y}-${m}-${day}`,
      scheduleDate: `${y}-${m}-${day}`,
    });
  },

  async onDateChange(e) {
    const scheduleDate = e.detail.value;
    if (scheduleDate === this.data.scheduleDate) return;
    if (this.data.isPreview) {
      const confirmed = await new Promise((resolve) => {
        wx.showModal({
          title: "放弃当前排班预览",
          content: "切换日期会丢弃尚未发布的自动排班结果，是否继续？",
          confirmText: "继续切换",
          confirmColor: "#b24b57",
          success: (result) => resolve(result.confirm),
          fail: () => resolve(false),
        });
      });
      if (!confirmed) return;
    }
    this.setData({
      scheduleDate,
      dateLabel: scheduleDate,
      tasks: [],
      staffChains: [],
      stats: {},
      ganttData: null,
      errorMessage: "",
      isPreview: false,
    });
    this.loadData();
  },

  async loadData() {
    this.setData({ loading: true, errorMessage: "" });
    const cacheKey = "serviceSchedule_" + this.data.scheduleDate;

    // 先尝试缓存
    const cached = readCache(cacheKey, this.data.isOffline ? 86400000 : 30000);
    if (cached) {
      const tasks = this.decorateTasks(cached.tasks || []);
      const staffChains = this.decorateChains(cached.staffChains || []);
      this.setData({
        tasks,
        total: tasks.length,
        staffChains,
        stats: cached.stats || {},
        ganttData: cached.ganttData || null,
        isPreview: false,
        loading: false,
      });
    }

    if (this.data.isOffline && cached) return; // 离线且有缓存，不再请求

    try {
      const [tableData] = await Promise.all([
        callBackend("getServiceScheduleTable", {
          scheduleDate: this.data.scheduleDate,
        }),
      ]);
      // 已发布排班有 staffChains 时直接生成甘特图
      let ganttData = this.data.ganttData;
      const tasks = this.decorateTasks(tableData.tasks || []);
      const staffChains = this.decorateChains(tableData.staffChains || []);
      if (staffChains.length) {
        ganttData = this.computeGanttData(staffChains);
      }
      this.setData({
        tasks,
        total: tasks.length,
        staffChains,
        stats: tableData.stats || {},
        ganttData,
        isPreview: false,
        loading: false,
      });
      // 写入缓存
      writeCache(cacheKey, {
        tasks,
        staffChains,
        stats: tableData.stats || {},
        ganttData,
      });
    } catch (error) {
      if (!cached) {
        this.setData({ errorMessage: error.message || "加载失败" });
      }
      this.setData({ loading: false });
    }
    // 加载实时状态
    this.loadRealtimeStatuses();
  },

  onRetry() {
    this.loadData();
  },

  onBackMine() {
    wx.switchTab({ url: "/pages/mine/index" });
  },

  /** 加载航班实时状态 */
  async loadRealtimeStatuses() {
    try {
      const data = await callBackend("getFlightRealtimeStatuses", {
        scheduleDate: this.data.scheduleDate,
      });
      const realtimeStatuses = (data.statuses || []).map((item) => ({
        ...item,
        isAlert: item.realtimeStatus === "DELAYED" || item.realtimeStatus === "CANCELLED",
        statusText: this.statusLabel(item.realtimeStatus),
      }));
      this.setData({ realtimeStatuses });
      // 重新计算甘特图色标
      if (this.data.staffChains && this.data.staffChains.length) {
        const ganttData = this.computeGanttData(this.data.staffChains);
        this.setData({ ganttData });
      }
    } catch (e) {
      // 静默失败
    }
  },

  /** 获取某个航班的状态 */
  getFlightStatus(flightNo) {
    const found = (this.data.realtimeStatuses || []).find(s => s.flightNo === flightNo);
    return found ? found.realtimeStatus : "ON_TIME";
  },

  /** 打开状态更新菜单 */
  onShowStatusMenu(e) {
    const flightNo = e.currentTarget.dataset.flightno || "";
    this.setData({
      showStatusMenu: true,
      statusTargetFlight: flightNo,
    });
  },

  /** 关闭状态菜单 */
  onCloseStatusMenu() {
    this.setData({ showStatusMenu: false, statusTargetFlight: "" });
  },

  /** 更新航班状态 */
  // (旧 modal 入口) 单条状态更新 - 兼容保留
  async onUpdateStatus(e) {
    const status = e.currentTarget.dataset.status;
    const flightNo = this.data.statusTargetFlight;
    if (!flightNo || !status) return;
    wx.showLoading({ title: "更新中..." });
    try {
      await callBackend("updateFlightRealtimeStatus", {
        flightNo,
        scheduleDate: this.data.scheduleDate,
        status,
        remark: status === "DELAYED" ? "实时反馈" : "",
      });
      wx.showToast({ title: "状态已更新", icon: "success" });
      this.setData({ showStatusMenu: false, statusTargetFlight: "" });
      this.loadRealtimeStatuses();
    } catch (error) {
      wx.showToast({ title: error.message || "更新失败", icon: "none" });
    } finally {
      wx.hideLoading();
    }
  },

  // 优化 1: inline 单步改状态 (3 步 → 1 步, 无 modal)
  async onSetStatusInline(e) {
    const status = e.currentTarget.dataset.status;
    if (!status) return;
    const flightNo = (this.data.detailTask || {}).flightNo;
    if (!flightNo) {
      wx.showToast({ title: "请先选中航班", icon: "none" });
      return;
    }
    wx.showLoading({ title: "更新中..." });
    try {
      await callBackend("updateFlightRealtimeStatus", {
        flightNo,
        scheduleDate: this.data.scheduleDate,
        status,
        remark: status === "DELAYED" ? "实时反馈" : "",
      });
      wx.showToast({ title: this.statusLabel(status), icon: "success" });
      // 立即更新本地高亮
      this.setData({
        "detailTask.realtimeStatus": status,
        "detailTask.realtimeStatusText": this.statusLabel(status),
      });
      this.loadRealtimeStatuses();
    } catch (error) {
      wx.showToast({ title: error.message || "更新失败", icon: "none" });
    } finally {
      wx.hideLoading();
    }
  },

  statusLabel(status) {
    return { ON_TIME: "正常", DELAYED: "延误", CANCELLED: "取消", ARRIVED: "已到达" }[status] || status;
  },

  // 优化 2: 延误传播快捷预设 (一键, 不再手输分钟)
  async onPropagateDelayPreset(e) {
    const minutes = Number(e.currentTarget.dataset.minutes);
    const flightNo = (this.data.detailTask || {}).flightNo;
    if (!flightNo || !minutes) {
      wx.showToast({ title: "请先选中航班", icon: "none" });
      return;
    }
    const res = await new Promise((resolve) => {
      wx.showModal({
        title: `延误 ${minutes} 分钟`,
        content: `航班 ${flightNo} 延误 ${minutes} 分, 自动调整后续任务. 确认?`,
        success: resolve,
      });
    });
    if (!res.confirm) return;
    wx.showLoading({ title: "传播中..." });
    try {
      const result = await callBackend("propagateScheduleDelay", {
        flightNo,
        scheduleDate: this.data.scheduleDate,
        delayMinutes: minutes,
      });
      const adj = Number((result && result.adjustedTaskCount) || 0);
      wx.showToast({ title: `已调整 ${adj} 条后续任务`, icon: "success" });
      this.loadData();
    } catch (error) {
      wx.showToast({ title: error.message || "传播失败", icon: "none" });
    } finally {
      wx.hideLoading();
    }
  },

  /** 打开延误传播弹窗 */
  onShowDelayInput(e) {
    const flightNo = e.currentTarget.dataset.flightno || "";
    this.setData({
      showDelayInput: true,
      delayTarget: flightNo,
      delayMinutes: 30,
      delayMinusValue: 25,
      delayPlusValue: 35,
      delayReason: "",
    });
  },

  /** 关闭延误传播弹窗 */
  onCloseDelayInput() {
    this.setData({ showDelayInput: false, delayTarget: null });
  },

  /** 延误传播输入（表单） */
  onDelayInput(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    if (field === "delayMinutes") {
      const minutes = Math.max(1, Math.min(999, Number(value) || 1));
      this.setData({
        delayMinutes: minutes,
        delayMinusValue: Math.max(5, minutes - 5),
        delayPlusValue: Math.min(999, minutes + 5),
      });
      return;
    }
    this.setData({ [field]: value });
  },

  /** 延误传播步进按钮 */
  onDelayStep(e) {
    const field = e.currentTarget.dataset.field;
    const value = Number(e.currentTarget.dataset.value);
    const nextValue = Math.max(1, Math.min(999, value));
    this.setData({
      [field]: nextValue,
      delayMinusValue: Math.max(5, nextValue - 5),
      delayPlusValue: Math.min(999, nextValue + 5),
    });
  },

  /** 执行延误传播 */
  async onPropagateDelay() {
    const flightNo = this.data.delayTarget;
    const delayMinutes = Number(this.data.delayMinutes) || 30;
    if (!flightNo || delayMinutes <= 0) {
      wx.showToast({ title: "请输入有效延误时长", icon: "none" });
      return;
    }

    wx.showLoading({ title: "传播中..." });
    try {
      const result = await callBackend("propagateScheduleDelay", {
        flightNo,
        scheduleDate: this.data.scheduleDate,
        delayMinutes,
        reason: this.data.delayReason || "",
      });
      wx.showToast({ title: result.message || "处理完成", icon: "success" });
      this.setData({ showDelayInput: false, delayTarget: null });
      this.loadRealtimeStatuses();
      // 刷新数据
      this.loadData();
    } catch (error) {
      wx.showToast({ title: error.message || "传播失败", icon: "none" });
    } finally {
      wx.hideLoading();
    }
  },

  /** 打开可用人员查询（找替班） */
  async onFindReplacement(e) {
    const flightNo = e.currentTarget.dataset.flightno || "";
    const taskType = e.currentTarget.dataset.tasktype || "";
    const oldStaffId = e.currentTarget.dataset.staffid || "";
    const startTime = e.currentTarget.dataset.start || "";
    const endTime = e.currentTarget.dataset.end || "";

    // 从 tasks 获取航班信息用于资质匹配
    const task = (this.data.tasks || []).find(t => t.flightNo === flightNo && t.taskType === taskType);
    const airline = task ? task.airline : "";
    const aircraftType = task ? task.aircraftType : "";

    wx.showLoading({ title: "查询可用人员…" });
    try {
      const result = await callBackend("getAvailableStaff", {
        scheduleDate: this.data.scheduleDate,
        startTime: startTime || "00:00",
        endTime: endTime || "24:00",
        airline,
        aircraftType,
        excludeStaffIds: oldStaffId ? [oldStaffId] : [],
      });
      const availableStaff = (result.available || []).map((item) => ({
        ...item,
        initial: String(item.name || "人").slice(0, 1),
        qualificationText: (item.authorizedAircraftTypes || []).join("/"),
      }));
      this.setData({
        showAvailableStaff: true,
        availableStaff,
        reassignTarget: {
          flightNo,
          taskType,
          oldStaffId: oldStaffId || "",
          startTime,
          endTime,
        },
      });
    } catch (error) {
      wx.showToast({ title: error.message || "查询失败", icon: "none" });
    } finally {
      wx.hideLoading();
    }
  },

  /** 关闭可用人员列表 */
  onCloseAvailableStaff() {
    this.setData({
      showAvailableStaff: false,
      availableStaff: [],
      reassignTarget: null,
    });
  },

  /** 执行改班 */
  async onReassign(e) {
    const newStaffId = e.currentTarget.dataset.staffid;
    const target = this.data.reassignTarget;
    if (!newStaffId || !target) return;

    wx.showLoading({ title: "改班中…" });
    try {
      const result = await callBackend("reassignStaffTask", {
        flightNo: target.flightNo,
        taskType: target.taskType,
        scheduleDate: this.data.scheduleDate,
        newStaffId,
        oldStaffId: target.oldStaffId,
        reason: "实时调班",
      });
      wx.showToast({ title: result.message || "改班成功", icon: "success" });
      this.setData({
        showAvailableStaff: false,
        availableStaff: [],
        reassignTarget: null,
        showTaskDetail: false,
        detailTask: null,
      });
      // 刷新数据
      this.loadData();
    } catch (error) {
      wx.showToast({ title: error.message || "改班失败", icon: "none" });
    } finally {
      wx.hideLoading();
    }
  },

  onSwitchTab(e) {
    const idx = Number(e.currentTarget.dataset.index || 0);
    this.setData({ tabIndex: idx });
  },

  // ═══════════════════════════════════════════
  // 甘特图数据处理
  // ═══════════════════════════════════════════

  /** 将时间字符串（如 "06:30" 或 "2026-05-12T06:30"）转为分钟数 */
  parseTimeToMinutes(val) {
    if (!val) return 0;
    const s = String(val).trim();
    const m = s.match(/(\d{1,2}):(\d{2})/);
    if (m) return Number(m[1]) * 60 + Number(m[2]);
    return 0;
  },

  /** 从 staffChains 计算甘特图渲染数据 */
  computeGanttData(chains) {
    if (!chains || !chains.length) return null;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    // 找到所有任务的最早和最晚时间
    let minMin = 1440, maxMin = 0;
    chains.forEach(c => {
      (c.tasks || []).forEach(t => {
        const s = this.parseTimeToMinutes(t.start);
        const rawEnd = this.parseTimeToMinutes(t.end);
        const e = rawEnd <= s ? rawEnd + 1440 : rawEnd;
        if (s < minMin) minMin = s;
        if (e > maxMin) maxMin = e;
      });
    });

    // 留出边距，对齐到整点
    const pad = 60;
    let startHour = Math.max(0, Math.floor((minMin - pad) / 60)) * 60;
    let endHour = Math.min(2880, Math.ceil((maxMin + pad) / 60)) * 60;
    if (endHour - startHour < 480) {
      // 确保至少 8 小时宽度
      const mid = (startHour + endHour) / 2;
      startHour = Math.max(0, mid - 240);
      endHour = Math.min(2880, mid + 240);
    }
    const totalMinutes = endHour - startHour;
    // 自适应像素密度：时间跨度小时用较密刻度，跨度大时保持合理宽度
    const pixelPerMinute = Math.max(2, Math.min(5, 2400 / totalMinutes));
    const timelineWidth = Math.ceil(totalMinutes * pixelPerMinute);

    // 时间轴标签（自适应步长，约 5 个标签）
    const labelStep = Math.max(30, Math.ceil(totalMinutes / 5 / 60) * 60);
    const labels = [];
    for (let h = startHour; h <= endHour; h += labelStep) {
      const dayOffset = Math.floor(h / 1440);
      const hh = String(Math.floor((h % 1440) / 60)).padStart(2, "0");
      const mm = String(h % 60).padStart(2, "0");
      labels.push({
        label: `${dayOffset ? `+${dayOffset} ` : ""}${hh}:${mm}`,
        left: Math.ceil((h - startHour) * pixelPerMinute),
      });
    }

    // 当前时间线
    const showCurrentTime = currentMinutes >= startHour && currentMinutes <= endHour;
    const currentTimeLeft = Math.ceil((currentMinutes - startHour) * pixelPerMinute);

    // 人员行（跨日任务矫正：start>end 视为隔日 +1440）
    const taskSortKey = (tasks) => {
      if (!tasks || !tasks.length) return 1440;
      const m = this.parseTimeToMinutes(tasks[0].start);
      const me = this.parseTimeToMinutes(tasks[0].end);
      return me <= m ? m + 1440 : m; // 跨日任务推迟排序
    };
    const staffRows = chains
      .filter(c => c.tasks && c.tasks.length > 0)
      .sort((a, b) => taskSortKey(a.tasks) - taskSortKey(b.tasks))
      .map(c => ({
        staffId: c.staffId,
        name: c.name || "",
        initial: String(c.name || "人").slice(0, 1),
        employeeNo: c.employeeNo || "",
        roleType: c.roleType || "",
        efficiency: c.efficiency || 0,
        dutyStartLabel: c.dutyStart ? String(c.dutyStart).slice(11, 16) : "",
        dutyEndLabel: c.dutyEnd ? String(c.dutyEnd).slice(11, 16) : "",
        tasks: (c.tasks || []).map((t, taskIndex) => {
          const s = this.parseTimeToMinutes(t.start);
          const rawEnd = this.parseTimeToMinutes(t.end);
          const e = rawEnd <= s ? rawEnd + 1440 : rawEnd;
          // 查找实时状态
          const rtStatus = this.getFlightStatus(t.flightNo);
          const statusLabel = { ON_TIME: "正常", DELAYED: "延误", CANCELLED: "取消", ARRIVED: "已到" }[rtStatus] || "";
          return {
            flightNo: t.flightNo || "",
            airline: t.airline || "",
            taskType: t.taskType || "SERVICE",
            key: t.taskId || `${t.flightNo || "task"}_${t.taskType || "SERVICE"}_${s}_${e}_${taskIndex}`,
            startMin: s,
            endMin: e,
            left: Math.ceil((s - startHour) * pixelPerMinute),
            width: Math.max(20, Math.ceil((e - s) * pixelPerMinute)),
            startLabel: this.formatTime(t.start),
            endLabel: this.formatTime(t.end),
            realtimeStatus: rtStatus,
            statusLabel,
          };
        }),
        gaps: (c.gaps || []).map(g => {
          const gs = this.parseTimeToMinutes(g.start);
          const rawGapEnd = this.parseTimeToMinutes(g.end);
          const ge = rawGapEnd <= gs ? rawGapEnd + 1440 : rawGapEnd;
          return {
            startMin: gs,
            endMin: ge,
            minutes: g.minutes || 0,
            left: Math.ceil((gs - startHour) * pixelPerMinute),
            width: Math.max(4, Math.ceil((ge - gs) * pixelPerMinute)),
          };
        }),
      }));

    return {
      startHour,
      endHour,
      totalMinutes,
      pixelPerMinute,
      timelineWidth,
      labels,
      showCurrentTime,
      currentTimeLeft,
      currentTimeLabel: `${String(Math.floor(currentMinutes / 60)).padStart(2, "0")}:${String(currentMinutes % 60).padStart(2, "0")}`,
      staffRows,
    };
  },

  /** 点击任务条 → 详情弹窗 */
  onTapTaskBar(e) {
    const ds = e.currentTarget.dataset;
    const flightNo = ds.flightno;
    const taskType = ds.tasktype;
    // 从 tasks 中查找匹配的任务
    const task = (this.data.tasks || []).find(t => t.flightNo === flightNo && t.taskType === taskType);
    if (task) {
      const realtimeStatus = this.getFlightStatus(task.flightNo);
      this.setData({
        showTaskDetail: true,
        detailTask: {
          ...task,
          realtimeStatus,
          realtimeStatusText: this.statusLabel(realtimeStatus),
        },
      });
    }
  },

  /** 关闭任务详情 */
  onCloseDetail() {
    this.setData({ showTaskDetail: false, detailTask: null });
  },

  /** 点击人员行 → 跳转到人务链视图 */
  onTapPersonRow(e) {
    const staffId = e.currentTarget.dataset.staffid;
    if (staffId) {
      // 切换到人务链 tab，滚动到对应人员
      this.setData({ tabIndex: 1, scrollIntoView: `chain-${staffId}` });
    }
  },

  /** 打开统计页面 */
  onOpenStats() {
    wx.navigateTo({ url: "/pages/scheduleStats/index" });
  },

  // ═══════════════════════════════════════════

  async onAutoSchedule() {
    wx.showLoading({ title: "自动排班中…" });
    try {
      const result = await callBackend("smartScheduleWithRoles", {
        scheduleDate: this.data.scheduleDate,
      });
      const s = result.stats || {};
      const tasks = this.decorateTasks(result.assignments || []);
      const chains = this.decorateChains(result.staffChains || []);
      const ganttData = this.computeGanttData(chains);
      this.setData({
        tasks,
        staffChains: chains,
        stats: s,
        ganttData: ganttData,
        tabIndex: 0,
        isPreview: true,
      });
      wx.showToast({
        title: s.unfilledTaskCount
          ? `有 ${s.unfilledTaskCount} 个任务人员不足`
          : `已生成 ${s.totalFlights || 0} 个航班预览`,
        icon: s.unfilledTaskCount ? "none" : "success",
      });
    } catch (error) {
      wx.showToast({ title: error.message || "自动排班失败", icon: "none" });
    } finally {
      wx.hideLoading();
    }
  },

  async onPublish() {
    if (!this.data.isPreview) {
      wx.showToast({ title: "请先生成新的排班预览", icon: "none" });
      return;
    }
    if (!this.data.tasks.length) {
      wx.showToast({ title: "请先生成或加载排班内容", icon: "none" });
      return;
    }
    if (Number(this.data.stats.unfilledTaskCount || 0) > 0) {
      wx.showToast({ title: "仍有任务人员不足，不能发布", icon: "none" });
      return;
    }
    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: "发布勤务与放行排班",
        content: `发布后将归档 ${this.data.scheduleDate} 的旧版本，并写入当前 ${this.data.tasks.length} 个任务。`,
        confirmText: "确认发布",
        success: (result) => resolve(result.confirm),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;

    wx.showLoading({ title: "发布中…" });
    try {
      await callBackend("publishServiceSchedule", {
        scheduleDate: this.data.scheduleDate,
        assignments: this.data.tasks,
      });
      wx.showToast({ title: "发布成功", icon: "success" });
      this.setData({ isPreview: false });
      wx.removeStorageSync("data_cache_serviceSchedule_" + this.data.scheduleDate);
      await this.loadData();
    } catch (error) {
      wx.showToast({ title: error.message || "发布失败", icon: "none" });
    } finally {
      wx.hideLoading();
    }
  },

  async onRefresh() {
    wx.showLoading({ title: "刷新中" });
    try {
      await this.loadData();
      wx.showToast({ title: "已刷新", icon: "success" });
    } catch (error) {
      wx.showToast({ title: error.message || "刷新失败", icon: "none" });
    } finally {
      wx.hideLoading();
    }
  },

  onViewChains() {
    this.setData({ tabIndex: 1 });
    if (!this.data.staffChains.length) {
      wx.showToast({ title: "请先执行自动排班", icon: "none" });
    }
  },

  roleTypeLabel(type) {
    const map = { SERVICE: "勤务", RELEASE: "放行", BOTH: "双资质" };
    return map[type] || type;
  },

  formatTime(value) {
    if (!value) return "";
    const str = String(value).trim();
    const match = str.match(/(\d{1,2}):(\d{2})/);
    if (match) return `${match[1]}:${match[2]}`;
    return str;
  },

  decorateTasks(tasks) {
    return (tasks || []).map((task, taskIndex) => {
      const taskWindow = task.taskWindow || {};
      const start = this.formatTime(taskWindow.start || task.taskStart);
      const end = this.formatTime(taskWindow.end || task.taskEnd);
      return {
        ...task,
        taskId: task.taskId || `${task.flightNo || "task"}-${task.taskType || "SERVICE"}-${taskIndex}`,
        taskWindow: {
          start: taskWindow.start || task.taskStart || "",
          end: taskWindow.end || task.taskEnd || "",
        },
        taskWindowText: start || end ? `${start || "-"} ~ ${end || "-"}` : "时间待确认",
        staff: (task.staff || []).map((staff) => ({
          ...staff,
          roleText: this.roleTypeLabel(staff.roleType),
        })),
      };
    });
  },

  decorateChains(chains) {
    return (chains || []).map((chain) => ({
      ...chain,
      initial: String(chain.name || "人").slice(0, 1),
      roleText: this.roleTypeLabel(chain.roleType),
      dutyStartLabel: this.formatTime(chain.dutyStart),
      dutyEndLabel: this.formatTime(chain.dutyEnd),
    }));
  },

  noop() {},
});
