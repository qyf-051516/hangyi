const { callBackend } = require("../../utils/api.js");
const { applyUiSettings, groupLabel, loadIsAdmin } = require("../../utils/ui");
const { readCache, writeCache } = require("../../utils/cache");

Page({
  data: {
    loading: false,
    publishing: false,
    isOffline: false,
    showToolMenu: false,
    showSmartForm: false,
    showRecommendation: false,
    analyzing: false,
    committing: false,
    batchAssigning: false,
    reassignSubmitting: false,
    statusUpdating: false,
    smartForm: {
      flightNo: "",
      airline: "",
      aircraftType: "",
      engineModel: "",
      aircraftRegistration: "",
      estimatedArrivalTime: "",
      departureTime: "",
      stayHours: "",
      requiredCount: "1",
    },
    recFlightNo: "",
    recAirline: "",
    recAircraftType: "",
    recShiftCode: "",
    recommendation: [],
    recFlightId: "",
    recScrollIntoView: "",
    pendingCommitPayload: null,
    scheduleDate: "",
    publicationVersion: 0,
    rows: [],
    shiftOptions: ["未排班", "早班", "午班", "晚班"],
    editedMap: {},
    editedCount: 0,
    searchKeyword: "",
    statusFilter: "ALL",
    statusFilters: [
      { value: "ALL", label: "全部" },
      { value: "UNASSIGNED", label: "未排班" },
      { value: "ASSIGNED", label: "已排班" },
      { value: "LEAVE", label: "休假冲突" },
      { value: "EDITED", label: "已修改" },
    ],
    displayRows: [],
    statsSummary: { total: 0, assigned: 0, unassigned: 0, onLeave: 0, conflict: 0 },
    shiftTimeMap: { MORNING: "06-14", AFTERNOON: "14-18", NIGHT: "18-06" },
    theme: "light",
    themeClass: "theme-light",
    isAdmin: false,
    adminDenied: false,
    showComplianceModal: false,
    complianceResult: { passed: true, violations: [], summary: { totalViolations: 0, highCount: 0, mediumCount: 0 } },

    showExportMenu: false,
    showFlightEditModal: false,
    flightEditTarget: null,
    flightEditForm: {
      aircraftType: "",
      engineModel: "",
      aircraftRegistration: "",
      estimatedArrivalClock: "",
    },
    flightEditSaving: false,

    // 一键改班
    showReassignModal: false,
    reassignTarget: null, // { row, staffId, name, employeeNo }
    reassignCandidates: [],
    reassignLoading: false,

    // TSV 导入
    showTSVImportModal: false,
    selectedFileName: "",
    selectedFileContent: "",
    selectedFileSize: "",
    tsvParsing: false,
    imageImporting: false,
    tsvFlights: [],
    tsvErrors: [],
  },

  async onShow() {
    applyUiSettings(this);
    this.updateNetworkStatus();
    const isAdmin = await loadIsAdmin(true);
    if (!isAdmin) {
      this.setData({ isAdmin: false, adminDenied: true, loading: false });
      return;
    }
    this.setData({ isAdmin: true, adminDenied: false, loading: true });
    try {
      await this.loadTable();
    } catch (error) {
      wx.showToast({ title: error.message || "加载失败", icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },

  onPullDownRefresh() {
    this.loadTable()
      .catch((error) => wx.showToast({ title: error.message || "刷新失败", icon: "none" }))
      .finally(() => wx.stopPullDownRefresh());
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
          this.loadTable().catch((error) => {
            wx.showToast({ title: error.message || "刷新失败", icon: "none" });
          });
          wx.showToast({ title: "网络已恢复", icon: "none", duration: 1500 });
        }
      };
      wx.onNetworkStatusChange(this._offNetworkCallback);
      this._networkListenerRegistered = true;
    }
  },

  formatDate(date) {
    const y = date.getFullYear();
    const m = `${date.getMonth() + 1}`.padStart(2, "0");
    const d = `${date.getDate()}`.padStart(2, "0");
    return `${y}-${m}-${d}`;
  },

  async loadTable() {
    // 请求序号：切换日期或放弃修改时递增，过期响应直接丢弃
    this._loadSeq = (this._loadSeq || 0) + 1;
    const seq = this._loadSeq;
    const scheduleDate = this.data.scheduleDate || this.formatDate(new Date());
    const cacheKey = "adminSchedule_" + scheduleDate;

    // 先尝试缓存
    const cached = readCache(cacheKey, this.data.isOffline ? 86400000 : 30000);
    if (cached && cached.rows) {
      if (seq !== this._loadSeq) return;
      const rows = cached.rows.map((item) => {
        const codeToLabel = { MORNING: "早班", AFTERNOON: "午班", NIGHT: "晚班" };
        const label = codeToLabel[item.shiftCode] || item.shiftCode || "未排班";
        const idx = this.data.shiftOptions.indexOf(label);
        const roleMap = { SERVICE: "勤务", RELEASE: "放行", BOTH: "双资质" };
        return { ...item, groupText: groupLabel(item.groupId), roleText: roleMap[item.roleType] || item.roleType || "-", shiftIndex: idx >= 0 ? idx : 0 };
      });
      this.setData({ scheduleDate, rows, editedMap: {}, publicationVersion: Number(cached.publicationVersion || 0) });
      this.computeDisplay();
    }

    if (this.data.isOffline && cached) return;

    const data = await callBackend("getStaffScheduleTable", { scheduleDate });
    if (seq !== this._loadSeq) return; // 过期响应，丢弃
    const rows = (data.rows || []).map((item) => {
      const codeToLabel = { MORNING: "早班", AFTERNOON: "午班", NIGHT: "晚班" };
      const label = codeToLabel[item.shiftCode] || item.shiftCode || "未排班";
      const idx = this.data.shiftOptions.indexOf(label);
      const roleMap = { SERVICE: "勤务", RELEASE: "放行", BOTH: "双资质" };
      return {
        ...item,
        groupText: groupLabel(item.groupId),
        roleText: roleMap[item.roleType] || item.roleType || "-",
        shiftIndex: idx >= 0 ? idx : 0,
      };
    });
    this.setData({
      scheduleDate: data.scheduleDate || scheduleDate,
      publicationVersion: Number(data.publicationVersion || 0),
      rows,
      editedMap: {},
    });
    this.computeDisplay();
    // 写入缓存
    writeCache(cacheKey, {
      rows: data.rows || [],
      scheduleDate: data.scheduleDate || scheduleDate,
      publicationVersion: Number(data.publicationVersion || 0),
    });
  },

  computeDisplay() {
    const { rows, editedMap, searchKeyword, statusFilter } = this.data;
    const kw = searchKeyword.trim().toLowerCase();
    let displayRows = rows.map((r, idx) => ({
      ...r,
      index: idx + 1,
      rowIndex: idx,
      initial: String(r.name || "人").slice(0, 1),
      edited: editedMap.hasOwnProperty(r.staffId),
    }));
    if (kw) {
      displayRows = displayRows.filter(r =>
        String(r.name || "").toLowerCase().includes(kw) ||
        String(r.employeeNo || "").toLowerCase().includes(kw)
      );
    }
    if (statusFilter === "UNASSIGNED") {
      displayRows = displayRows.filter((r) =>
        !r.shiftCode && !["ON_LEAVE", "LEAVE_CONFLICT"].includes(r.status)
      );
    } else if (statusFilter === "ASSIGNED") {
      displayRows = displayRows.filter((r) => !!r.shiftCode);
    } else if (statusFilter === "LEAVE") {
      displayRows = displayRows.filter((r) =>
        r.status === "ON_LEAVE" ||
        r.status === "LEAVE_CONFLICT" ||
        r.needsReassignment === true
      );
    } else if (statusFilter === "EDITED") {
      displayRows = displayRows.filter((r) => r.edited);
    }
    const statsSummary = {
      total: rows.length,
      assigned: rows.filter(r => r.shiftCode).length,
      unassigned: rows.filter(r =>
        !r.shiftCode && !["ON_LEAVE", "LEAVE_CONFLICT"].includes(r.status)
      ).length,
      onLeave: rows.filter(r => ["ON_LEAVE", "LEAVE_CONFLICT"].includes(r.status)).length,
      conflict: rows.filter(r =>
        r.status === "LEAVE_CONFLICT" || r.needsReassignment === true
      ).length,
    };
    const editedCount = Object.keys(editedMap).length;
    this.setData({ displayRows, statsSummary, editedCount });
  },

  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value });
    this.computeDisplay();
  },

  onClearSearch() {
    this.setData({ searchKeyword: "" });
    this.computeDisplay();
  },

  onFilterStatus(e) {
    this.setData({ statusFilter: e.currentTarget.dataset.value || "ALL" });
    this.computeDisplay();
  },

  onDateChange(e) {
    if (this.data.editedCount > 0) {
      wx.showToast({ title: "请先发布或放弃当前修改", icon: "none" });
      return;
    }
    this.setData({
      scheduleDate: e.detail.value,
      rows: [],
      editedMap: {},
      statusFilter: "ALL",
    });
    this.loadTable().catch((error) => {
      wx.showToast({ title: error.message || "日期切换失败", icon: "none" });
    });
  },

  onPickShift(e) {
    const staffId = e.currentTarget.dataset.staffid;
    const rowIndex = this.data.rows.findIndex((item) => item.staffId === staffId);
    const shiftIndex = Number(e.detail.value || 0);
    const row = this.data.rows[rowIndex];
    if (!row) return;

    const shiftMap = { "早班": "MORNING", "午班": "AFTERNOON", "晚班": "NIGHT" };
    const selectedLabel = this.data.shiftOptions[shiftIndex] || "未排班";
    const shiftCode = selectedLabel === "未排班" ? "" : (shiftMap[selectedLabel] || "");
    const rows = this.data.rows.slice();
    rows[rowIndex] = {
      ...row,
      shiftIndex,
      shiftCode,
      status: shiftCode ? "ASSIGNED" : "UNASSIGNED",
      statusText: shiftCode ? "已排班" : "未排班",
    };

    const editedMap = {
      ...this.data.editedMap,
      [row.staffId]: shiftCode,
    };

    this.setData({ rows, editedMap });
    this.computeDisplay();
  },

  async onBatchAssign() {
    // 操作锁，防止重复触发
    if (this.data.batchAssigning) return;
    const candidates = this.data.displayRows.filter((row) =>
      !["ON_LEAVE", "LEAVE_CONFLICT"].includes(row.status) &&
      row.needsReassignment !== true
    );
    if (!candidates.length) {
      wx.showToast({ title: "当前筛选没有可调整人员", icon: "none" });
      return;
    }
    this.setData({ batchAssigning: true });
    try {
      const sheetResult = await new Promise((resolve) => {
        wx.showActionSheet({
          itemList: ["设为早班", "设为午班", "设为晚班", "清空班次"],
          success: (result) => resolve(result.tapIndex),
          fail: () => resolve(-1),
        });
      });
      if (sheetResult < 0) return;
      const codes = ["MORNING", "AFTERNOON", "NIGHT", ""];
      const labels = ["早班", "午班", "晚班", "未排班"];
      const shiftCode = codes[sheetResult];
      const confirmed = await new Promise((resolve) => {
        wx.showModal({
          title: "批量调整班次",
          content: `将当前筛选中的 ${candidates.length} 人统一设为${labels[sheetResult]}？`,
          confirmText: "确认调整",
          success: (result) => resolve(result.confirm),
          fail: () => resolve(false),
        });
      });
      if (!confirmed) return;

      const candidateIds = new Set(candidates.map((row) => row.staffId));
      const shiftIndex = codes.indexOf(shiftCode) + 1;
      const normalizedShiftIndex = shiftCode ? shiftIndex : 0;
      const editedMap = { ...this.data.editedMap };
      const rows = this.data.rows.map((row) => {
        if (!candidateIds.has(row.staffId)) return row;
        editedMap[row.staffId] = shiftCode;
        return {
          ...row,
          shiftCode,
          shiftIndex: normalizedShiftIndex,
          status: shiftCode ? "ASSIGNED" : "UNASSIGNED",
          statusText: shiftCode ? "已排班" : "未排班",
        };
      });
      this.setData({ rows, editedMap });
      this.computeDisplay();
    } finally {
      this.setData({ batchAssigning: false });
    }
  },

  async onDiscardEdits() {
    if (!this.data.editedCount) return;
    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: "放弃未发布修改",
        content: `确认放弃当前 ${this.data.editedCount} 项修改？`,
        confirmText: "放弃修改",
        confirmColor: "#b24b57",
        success: (result) => resolve(result.confirm),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;
    wx.removeStorageSync("data_cache_adminSchedule_" + this.data.scheduleDate);
    await this.loadTable();
  },

  async onPublish() {
    // 入口立即置锁，防止合规预检期间重复点击
    if (this.data.publishing) return;
    this.setData({ publishing: true });

    const editedItems = Object.keys(this.data.editedMap).map((staffId) => {
      const row = this.data.rows.find(r => r.staffId === staffId) || {};
      return {
        staffId,
        employeeNo: row.employeeNo || "",
        flightNo: row.flightNo || "",
        shiftCode: this.data.editedMap[staffId],
        _taskType: row._taskType || "SERVICE",
      };
    });

    if (!editedItems.length) {
      this.setData({ publishing: false });
      wx.showToast({ title: "暂无编辑内容", icon: "none" });
      return;
    }

    // 排班合规预检
    wx.showLoading({ title: "合规检查中" });
    try {
      const checkResult = await callBackend("preflightComplianceCheck", {
        scheduleDate: this.data.scheduleDate,
        edits: editedItems,
      });
      wx.hideLoading();

      if (!checkResult.passed && checkResult.violations && checkResult.violations.length > 0) {
        this.setData({
          complianceResult: checkResult,
          showComplianceModal: true,
        });
        return; // 等待用户确认或取消
      }
    } catch (error) {
      this.setData({ publishing: false });
      wx.hideLoading();
      wx.showToast({ title: error.message || "合规检查失败，请重试", icon: "none" });
      return;
    }

    // 无违规或已忽略 - 执行发布
    await this.doPublish(editedItems);
  },

  async doPublish(edits) {
    this.setData({ publishing: true });
    wx.showLoading({ title: "发布中" });

    try {
      await callBackend("publishScheduleEdits", {
        scheduleDate: this.data.scheduleDate,
        edits,
        expectedVersion: this.data.publicationVersion,
      });
      wx.showToast({ title: "发布成功", icon: "success" });
      this.setData({ editedMap: {}, showComplianceModal: false });
      wx.removeStorageSync("data_cache_adminSchedule_" + this.data.scheduleDate);
      await this.loadTable();
    } catch (error) {
      wx.showToast({ title: error.message || "发布失败", icon: "none" });
    } finally {
      this.setData({ publishing: false });
      wx.hideLoading();
    }
  },

  onCloseComplianceModal() {
    // 关闭合规弹窗后解锁发布，允许修改后重新发布
    this.setData({ showComplianceModal: false, publishing: false });
  },

  async onIgnoreAndPublish() {
    const highCount = Number(
      ((this.data.complianceResult || {}).summary || {}).highCount || 0
    );
    if (highCount > 0) {
      wx.showToast({ title: "存在高危违规，必须修正后才能发布", icon: "none" });
      return;
    }
    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: "确认带风险发布",
        content: "当前仍有中低风险提示。确认已人工复核并继续发布？",
        confirmText: "确认发布",
        confirmColor: "#b26a20",
        success: (result) => resolve(result.confirm),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;
    const edits = Object.keys(this.data.editedMap).map((staffId) => {
      const row = this.data.rows.find(r => r.staffId === staffId) || {};
      return { staffId, employeeNo: row.employeeNo || "", flightNo: row.flightNo || "", shiftCode: this.data.editedMap[staffId] };
    });
    this.setData({ showComplianceModal: false });
    this.doPublish(edits);
  },

  getComplianceClass(severity) {
    return severity === "HIGH" ? "v-high" : severity === "MEDIUM" ? "v-medium" : "v-low";
  },

  getSeverityLabel(severity) {
    return severity === "HIGH" ? "高危" : severity === "MEDIUM" ? "中危" : "提示";
  },

  // ---------- 智能排班 ----------
  onSmartSchedule() {
    const now = new Date();
    const defaultDeparture = `${this.formatDate(now)}T14:00`;
    this.setData({
      showSmartForm: true,
      smartForm: {
        flightNo: "",
        airline: "中国东方航空",
        aircraftType: "A320",
        engineModel: "CFM56-5B",
        aircraftRegistration: "",
        estimatedArrivalTime: `${this.formatDate(now)}T12:00`,
        departureTime: defaultDeparture,
        stayHours: "2",
        requiredCount: "1",
      },
    });
  },

  // ---------- 智能排班优化 ----------
  async onAiOptimizeSchedule() {
    if (this.data.analyzing) return;
    const staffs = this.data.rows
      .filter((r) => r.shiftCode)
      .map((r) => ({
          staffId: r.staffId || "",
          employeeNo: r.employeeNo || "",
          name: r.name || "",
          groupId: r.groupId || "",
          shiftCode: r.shiftCode || "",
          airline: r.airline || "",
          aircraftType: r.aircraftType || "",
          flightNo: r.flightNo || "",
      }));

    if (!staffs.length) {
      wx.showToast({ title: "当前没有已排班的人员", icon: "none" });
      return;
    }
    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: "执行疲劳优化",
        content: "系统会立即把连续工作超限的人员改派给符合资质且空闲的员工，并写入操作日志。",
        confirmText: "开始优化",
        success: (result) => resolve(result.confirm),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;

    this.setData({ analyzing: true });
    wx.showLoading({ title: "智能优化中" });
    try {
      const result = await callBackend("optimizeStaffSchedule", {
        scheduleDate: this.data.scheduleDate,
        staffs,
      });

      const optimized = result && result.optimized ? result.optimized : [];
      const restedCount = result.restedCount || 0;
      const warnCount = result.warnCount || 0;

      wx.removeStorageSync("data_cache_adminSchedule_" + this.data.scheduleDate);
      await this.loadTable();

      const lines = [
        `已完成改派：${restedCount} 人`,
        `暂无合适替班：${warnCount} 人`,
        `无需调整：${result.unchangedCount || 0} 人`,
      ];
      const detailLines = optimized
        .filter((o) => o.action !== "KEEP")
        .map((o) => {
          const tag = o.action === "RESTED" ? "已替班" : "无替班";
          const extra = o.replacedBy ? `，改为 ${o.replacedBy.name}(${o.replacedBy.employeeNo})` : "";
          return `${o.name}(${o.employeeNo})：${tag}${extra}`;
        });

      wx.showModal({
        title: "智能优化结果",
        content: [...lines, "", ...detailLines].join("\n"),
        showCancel: false,
        confirmText: "知道了",
      });
    } catch (error) {
      wx.showToast({ title: error.message || "智能优化失败", icon: "none" });
    } finally {
      this.setData({ analyzing: false });
      wx.hideLoading();
    }
  },

  onCloseSmartForm() {
    this.setData({ showSmartForm: false });
  },

  onSmartFormInput(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    this.setData({
      smartForm: { ...this.data.smartForm, [field]: value },
    });
  },

  async onAnalyzeSchedule() {
    const { smartForm } = this.data;

    if (!smartForm.flightNo || !smartForm.flightNo.trim()) {
      wx.showToast({ title: "请填写真实航班号", icon: "none" });
      return;
    }
    if (!smartForm.airline || !smartForm.aircraftType || !smartForm.departureTime) {
      wx.showToast({ title: "请填写航司、机型、起飞时间", icon: "none" });
      return;
    }

    // 输入校验：人数 1-20 整数，停留 0-48 小时
    const requiredCount = Number(smartForm.requiredCount);
    const stayHours = Number(smartForm.stayHours);
    if (!Number.isInteger(requiredCount) || requiredCount < 1 || requiredCount > 20) {
      wx.showToast({ title: "人数需为 1-20 的整数", icon: "none" });
      return;
    }
    if (!Number.isFinite(stayHours) || stayHours < 0 || stayHours > 48) {
      wx.showToast({ title: "停留时间需为 0-48 小时", icon: "none" });
      return;
    }

    this.setData({ analyzing: true });
    wx.showLoading({ title: "分析中..." });
    try {
      const result = await callBackend("smartSchedule", {
        scheduleDate: this.data.scheduleDate,
        flightNo: smartForm.flightNo || "",
        airline: smartForm.airline,
        aircraftType: smartForm.aircraftType,
        engineModel: smartForm.engineModel || "",
        aircraftRegistration: smartForm.aircraftRegistration || "",
        estimatedArrivalTime: smartForm.estimatedArrivalTime || "",
        departureTime: smartForm.departureTime,
        requiredCount,
        stayHours,
        commit: false,
      });

      const flightName = (result.flight || {}).flightNo || smartForm.flightNo;

      this.setData({
        showSmartForm: false,
        showRecommendation: true,
        recScrollIntoView: "",
        recFlightNo: flightName,
        recAirline: smartForm.airline,
        recAircraftType: smartForm.aircraftType,
        recShiftCode: (result.flight || {}).shiftCode || "",
        recommendation: result.recommendation || [],
        recFlightId: (result.flight || {}).flightId || "",
        pendingCommitPayload: {
          scheduleDate: this.data.scheduleDate,
          flightNo: smartForm.flightNo || "",
          airline: smartForm.airline,
          aircraftType: smartForm.aircraftType,
          engineModel: smartForm.engineModel || "",
          aircraftRegistration: smartForm.aircraftRegistration || "",
          estimatedArrivalTime: smartForm.estimatedArrivalTime || "",
          departureTime: smartForm.departureTime,
          requiredCount,
          stayHours,
        },
      });

      this.scrollToRecommendation();
    } catch (error) {
      wx.showToast({ title: error.message || "分析失败", icon: "none" });
    } finally {
      this.setData({ analyzing: false });
      wx.hideLoading();
    }
  },

  onCloseRecommendation() {
    this.setData({ showRecommendation: false });
  },

  async onCommitSmartSchedule() {
    if (this.data.committing) return;
    const payload = this.data.pendingCommitPayload;
    if (!payload) {
      wx.showToast({ title: "参数丢失，请重新分析", icon: "none" });
      return;
    }

    // 二次确认
    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: "确认排班",
        content: `确认按推荐方案为航班 ${this.data.recFlightNo || payload.flightNo} 排班？`,
        confirmText: "确认排班",
        cancelText: "取消",
        success: (result) => resolve(result.confirm),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;

    // 提交锁：在合规预检期间同样生效，防止重复点击
    this.setData({ committing: true });

    // 应用前合规预检：将推荐结果转换为排班结构
    const recommendation = this.data.recommendation || [];
    const recFlightNo = this.data.recFlightNo || payload.flightNo || "";
    const recShiftCode = this.data.recShiftCode || "";
    const scheduleDate =
      String(payload.departureTime || "").slice(0, 10) || this.data.scheduleDate;
    const edits = recommendation
      .filter((person) => person && person.staffId && person.employeeNo)
      .map((person) => ({
        staffId: person.staffId,
        employeeNo: person.employeeNo,
        flightNo: recFlightNo,
        shiftCode: recShiftCode,
      }));

    try {
      if (edits.length > 0) {
        wx.showLoading({ title: "合规检查中" });
        let checkResult;
        try {
          checkResult = await callBackend("preflightComplianceCheck", {
            scheduleDate,
            edits,
          });
        } catch (error) {
          wx.hideLoading();
          wx.showToast({ title: error.message || "合规检查失败，已取消排班", icon: "none" });
          this.setData({ committing: false });
          return;
        }
        wx.hideLoading();

        const violations = (checkResult && checkResult.violations) || [];
        if (checkResult && !checkResult.passed && violations.length > 0) {
          const proceed = await this.confirmComplianceRisk(checkResult, payload);
          if (!proceed) {
            this.setData({ committing: false });
            return;
          }
        }
      }

      wx.showLoading({ title: "排班确认中..." });
      await callBackend("smartSchedule", {
        ...payload,
        commit: true,
      });

      wx.showToast({ title: "智能排班完成", icon: "success" });
      this.setData({
        showRecommendation: false,
        pendingCommitPayload: null,
      });
      await this.loadTable();
    } catch (error) {
      wx.showToast({ title: error.message || "确认失败", icon: "none" });
    } finally {
      this.setData({ committing: false });
      wx.hideLoading();
    }
  },

  // 合规预检发现违规时的风险确认（用户确认后仍继续，与发布时一致）
  confirmComplianceRisk(checkResult, payload) {
    const violations = checkResult.violations || [];
    const summary = checkResult.summary || {};
    const typeTextMap = {
      CONCURRENT_SCHEDULE: "重复排班",
      EXCEED_CONTINUOUS: "连续工作超限",
      EXCEED_WORK_HOURS: "当日工时超限",
      SAME_GROUP_CONCENTRATION: "同班组集中",
    };
    const severityMap = { HIGH: "高危", MEDIUM: "中危", LOW: "提示" };
    const counts = {};
    for (const v of violations) {
      const label = `${typeTextMap[v.type] || v.type}（${severityMap[v.severity] || v.severity}）`;
      counts[label] = (counts[label] || 0) + 1;
    }
    const lines = Object.keys(counts).map((key) => `· ${key} ${counts[key]} 项`);
    const content = [
      `发现 ${summary.totalViolations || violations.length} 项潜在违规`,
      ...lines,
      `确认已人工复核并按推荐方案继续为航班 ${this.data.recFlightNo || payload.flightNo} 排班？`,
    ].join("\n");
    return new Promise((resolve) => {
      wx.showModal({
        title: "合规检查提示",
        content,
        confirmText: "继续排班",
        cancelText: "返回修改",
        confirmColor: "#b26a20",
        success: (result) => resolve(result.confirm),
        fail: () => resolve(false),
      });
    });
  },

  scrollToRecommendation() {
    setTimeout(() => {
      if (this.data.recommendation.length > 0) {
        this.setData({ recScrollIntoView: "rec-item-target" });
      }
    }, 100);
  },

  // ═══════════════════════════════════════════════════════════
  // TSV 导入排班
  // ═══════════════════════════════════════════════════════════

  // 显示 TSV 导入弹窗
  onShowTSVImport() {
    this.setData({
      showTSVImportModal: true,
      selectedFileName: "",
      selectedFileContent: "",
      selectedFileSize: "",
      tsvFlights: [],
      tsvErrors: [],
    });
  },

  // 关闭 TSV 导入弹窗
  onCloseTSVImport() {
    this.setData({
      showTSVImportModal: false,
      selectedFileName: "",
      selectedFileContent: "",
      tsvFlights: [],
      tsvErrors: [],
    });
    this._tsvFilePath = "";
  },

  // 选择 TSV 文件
  onChooseTSVFile() {
    wx.chooseMessageFile({
      count: 1,
      type: "file",
      extension: ["tsv", "txt"],
      success: (res) => {
        if (res.tempFiles && res.tempFiles.length > 0) {
          const tempFile = res.tempFiles[0];
          if (tempFile.size > 5 * 1024 * 1024) {
            wx.showModal({
              title: "文件过大",
              content: "文件超过 5MB，请拆分后重试",
              showCancel: false,
            });
            return;
          }
          this.setData({
            selectedFileName: tempFile.name || "未命名文件",
            selectedFileContent: "",
            selectedFileSize: tempFile.size ? `${(tempFile.size / 1024).toFixed(1)} KB` : "",
            tsvFlights: [],
            tsvErrors: [],
          });
          this._tsvFilePath = tempFile.path;
        }
      },
      fail: (err) => {
        if (err.errMsg && err.errMsg.indexOf("cancel") === -1) {
          wx.showToast({ title: "选择文件失败", icon: "none" });
        }
      },
    });
  },

  // 重新选择 TSV 文件
  onRechooseTSVFile() {
    this.setData({
      selectedFileName: "",
      selectedFileContent: "",
      selectedFileSize: "",
      tsvFlights: [],
      tsvErrors: [],
    });
    this._tsvFilePath = "";
    this.onChooseTSVFile();
  },

  // ========== 航司代码 → 中文名称全映射 ==========
  AIRLINE_CODE_MAP: {
    "CA": "中国国际航空",
    "MU": "中国东方航空",
    "CZ": "中国南方航空",
    "HU": "海南航空",
    "ZH": "深圳航空",
    "FM": "上海航空",
    "SC": "山东航空",
    "MF": "厦门航空",
    "BK": "奥凯航空",
    "HO": "吉祥航空",
    "9C": "春秋航空",
    "FU": "福州航空",
    "QW": "青岛航空",
    "NX": "澳门航空",
    "3U": "四川航空",
    "GS": "天津航空",
    "GJ": "长龙航空",
    "TV": "西藏航空",
    "PN": "西部航空",
    "EU": "成都航空",
    "DR": "瑞丽航空",
    "KY": "昆明航空",
    "8L": "祥鹏航空",
    "NS": "河北航空",
    "DZ": "东海航空",
  },

  // ========== 机型简码 → 标准代码 ==========
  AIRCRAFT_TYPE_NORMALIZE: {
    "320": "A320",
    "321": "A321",
    "319": "A319",
    "330": "A330",
    "350": "A350",
    "380": "A380",
    "737": "B737",
    "738": "B738",
    "739": "B739",
    "747": "B747",
    "757": "B757",
    "767": "B767",
    "777": "B777",
    "787": "B787",
    "38m": "B38M",
    "38M": "B38M",
    "a320": "A320",
    "a321": "A321",
    "a319": "A319",
    "a330": "A330",
    "b737": "B737",
    "b738": "B738",
    "b38m": "B38M",
    "arj21": "ARJ21",
    "ARJ21": "ARJ21",
    "arj": "ARJ21",
    "c919": "C919",
    "C919": "C919",
  },

  /**
   * 从航班号前缀推导航司名称
   * @param {string} flightNo - 如 "CA1931"
   * @returns {string} 航司中文名
   */
  airlineFromFlightNo(flightNo) {
    if (!flightNo) return "未知航司";
    const trimmed = String(flightNo).trim();
    // 缩写或航班号样式（如 "CA"、"MU5688"、"9C8501"）才按前两字查表
    if (/^[A-Za-z0-9]{2,}$/.test(trimmed)) {
      const code = trimmed.slice(0, 2).toUpperCase();
      return this.AIRLINE_CODE_MAP[code] || ("航空公司(" + code + ")");
    }
    // 已是完整航司名称（如 "中国东方航空"、"东方航空"），跳过查表
    return trimmed;
  },

  /**
   * 归一化机型代码
   * @param {string} type - 如 "321", "738", "38M"
   * @returns {string} 标准机型代码
   */
  normalizeAircraftType(type) {
    if (!type) return "A320";
    const key = String(type).trim();
    return this.AIRCRAFT_TYPE_NORMALIZE[key] || key.toUpperCase();
  },

  /**
   * 解析 TSV 内容为航班数组
   * TSV 格式: 日期\t进港航班\t出港航班\t机号\t机型\t计落\t计起
   */
  parseTSVContent(content, defaultScheduleDate) {
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length < 2) {
      return { flights: [], errors: ["文件内容为空或行数不足"] };
    }

    // 第一行是表头;自动检测分隔符:优先制表符(TSV),否则按逗号(CSV)
    const delimiter = lines[0].includes("\t") ? "\t" : ",";
    const header = lines[0].split(delimiter).map((h) => h.trim());

    // 列名模糊匹配（支持常见排班表列名）
    const colMap = {};
    header.forEach((col, idx) => {
      const lower = col.toLowerCase();
      // 日期
      if (/日期|date|schedule/i.test(lower) && !/起落/i.test(lower)) colMap.scheduleDate = idx;
      // 进港航班
      else if (/进港|inbound|到达航班/i.test(lower)) colMap.inboundFlight = idx;
      // 出港航班
      else if (/出港|outbound|出发航班/i.test(lower)) colMap.outboundFlight = idx;
      // 航班号（通用）
      else if (/航班号|flight[^\s]*no/i.test(lower)) colMap.flightNo = idx;
      // 航司
      else if (/航司|航空|airline/i.test(lower)) colMap.airline = idx;
      // 发动机型号
      else if (/发动机|engine/i.test(lower)) colMap.engineModel = idx;
      // 机型
      else if (/机型|飞机|aircraft[^\s]*type/i.test(lower)) colMap.aircraftType = idx;
      // 机号
      else if (/机号|注册|编号|reg/i.test(lower) && idx !== colMap.aircraftReg) colMap.aircraftReg = idx;
      // 计起 / 起飞时间 / 出发时间
      else if (/计起|起飞|出发|depart|推出/i.test(lower)) colMap.departureTime = idx;
      // 预计到达时间
      else if (/预计到达|预计落地|eta/i.test(lower)) colMap.estimatedArrivalTime = idx;
      // 计落 / 降落时间 / 到达时间
      else if (/计落|降落|到达|arrive|arrival/i.test(lower)) colMap.landingTime = idx;
      // 停留
      else if (/停留|stay/i.test(lower)) colMap.stayHours = idx;
    });

    // 兜底：按经典列顺序映射 (日期 | 进港 | 出港 | 机号 | 机型 | 计落 | 计起)
    if (colMap.scheduleDate === undefined && header.length >= 1) colMap.scheduleDate = 0;
    if (colMap.inboundFlight === undefined && header.length >= 2) colMap.inboundFlight = 1;
    if (colMap.outboundFlight === undefined && header.length >= 3) colMap.outboundFlight = 2;
    if (colMap.aircraftReg === undefined && header.length >= 4) colMap.aircraftReg = 3;
    if (colMap.aircraftType === undefined && header.length >= 5) colMap.aircraftType = 4;
    if (colMap.landingTime === undefined && header.length >= 6) colMap.landingTime = 5;
    if (colMap.departureTime === undefined && header.length >= 7) colMap.departureTime = 6;

    const getCol = (row, key) => {
      const idx = colMap[key];
      if (idx === undefined || idx >= row.length) return "";
      return String(row[idx]).trim();
    };

    // 时间解析：支持 HH:MM 和 HH:MM:SS，结合日期
    const parseTime = (timeStr, dateStr) => {
      if (!timeStr) return "";
      const parts = String(timeStr).trim().match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
      if (!parts) return "";
      const hh = parts[1].padStart(2, "0");
      const mm = parts[2];
      const ss = parts[3] || "00";
      return `${dateStr}T${hh}:${mm}:${ss}`;
    };

    // 解析日期：支持 YYYYMMDD, YYYY-MM-DD 等格式
    const parseDate = (raw) => {
      if (!raw) return "";
      const s = String(raw).trim();
      // YYYYMMDD
      if (/^\d{8}$/.test(s)) {
        return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
      }
      // YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      // YYYY/MM/DD
      if (/^\d{4}\/\d{2}\/\d{2}$/.test(s)) return s.replace(/\//g, "-");
      return s;
    };

    const flights = [];
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(delimiter);

      // 跳过空行
      if (row.length === 0 || (row.length === 1 && String(row[0]).trim() === "")) continue;

      // 使用该行的日期，如果没有则用默认日期
      const rawDate = getCol(row, "scheduleDate");
      const scheduleDate = rawDate ? parseDate(rawDate) : defaultScheduleDate;

      if (!scheduleDate || scheduleDate.length < 8) {
        errors.push(`第${i + 1}行：日期无效`);
        continue;
      }

      const inboundFlight = getCol(row, "inboundFlight");
      const outboundFlight = getCol(row, "outboundFlight");
      const flightNoRaw = getCol(row, "flightNo");

      // 优先用出港航班作为主航班号，否则用进港航班
      const flightNo = (outboundFlight || inboundFlight || flightNoRaw).toUpperCase();
      if (!flightNo) {
        errors.push(`第${i + 1}行：缺少航班号`);
        continue;
      }

      // 航司：优先从航司列读取，否则从航班号前缀推导
      const airlineRaw = getCol(row, "airline");
      const airline = airlineRaw
        ? (this.airlineFromFlightNo(airlineRaw) || airlineRaw)
        : this.airlineFromFlightNo(flightNo);

      // 机型归一化
      const aircraftTypeRaw = getCol(row, "aircraftType");
      const aircraftType = this.normalizeAircraftType(aircraftTypeRaw);

      const aircraftReg = getCol(row, "aircraftReg");
      const engineModel = getCol(row, "engineModel");
      const departureTimeRaw = getCol(row, "departureTime");
      const landingTimeRaw = getCol(row, "landingTime");
      const estimatedArrivalTimeRaw = getCol(row, "estimatedArrivalTime");
      const stayHoursRaw = getCol(row, "stayHours");

      const departureTime = parseTime(departureTimeRaw, scheduleDate);
      const landingTime = parseTime(landingTimeRaw, scheduleDate);
      const estimatedArrivalTime = parseTime(estimatedArrivalTimeRaw, scheduleDate);
      let stayHours = parseFloat(stayHoursRaw) || 0;

      // 若未提供停留时长但起降时间都有，自动计算
      if (!stayHours && departureTime && landingTime) {
        const depMs = new Date(departureTime).getTime();
        const arrMs = new Date(landingTime).getTime();
        if (!Number.isNaN(depMs) && !Number.isNaN(arrMs) && depMs > arrMs) {
          stayHours = Math.round(((depMs - arrMs) / (60 * 60 * 1000)) * 10) / 10;
        }
      }

      // 起飞时间缺失：标记为解析问题，不再静默默认 08:00
      if (!departureTime) {
        errors.push(`第${i + 1}行：缺少起飞时间（计起）`);
        continue;
      }
      // 机型缺失：标记为解析问题，不再静默默认 A320
      if (!aircraftTypeRaw) {
        errors.push(`第${i + 1}行：缺少机型`);
        continue;
      }

      flights.push({
        flightNo: String(flightNo).trim().toUpperCase(),
        // 附加信息供展示
        inboundFlight: inboundFlight.toUpperCase(),
        outboundFlight: outboundFlight.toUpperCase(),
        airline: airline || "未知航司",
        aircraftType: aircraftType,
        aircraftReg: aircraftReg,
        aircraftRegistration: aircraftReg,
        engineModel,
        departureTime: departureTime,
        landingTime: landingTime,
        estimatedArrivalTime,
        stayHours: stayHours,
        scheduleDate: scheduleDate,
        requiredCount: 1,
        source: "TSV_IMPORT",
      });
    }

    return { flights, errors };
  },

  // 解析 TSV 文件
  async onParseTSVFile() {
    if (!this._tsvFilePath) {
      wx.showToast({ title: "请先选择文件", icon: "none" });
      return;
    }

    this.setData({ tsvParsing: true });
    wx.showLoading({ title: "解析文件中..." });

    try {
      const fs = wx.getFileSystemManager();
      // 读取前先检查文件大小，避免同步读取超大文件
      const stat = fs.statSync(this._tsvFilePath);
      if (stat && stat.size > 5 * 1024 * 1024) {
        wx.showToast({ title: "文件超过 5MB，请拆分后重试", icon: "none" });
        return;
      }
      const content = fs.readFileSync(this._tsvFilePath, "utf-8");

      if (!content || content.trim().length === 0) {
        wx.showToast({ title: "文件内容为空", icon: "none" });
        return;
      }

      const result = this.parseTSVContent(content, this.data.scheduleDate);

      if (result.flights.length === 0) {
        wx.showToast({ title: "未能解析出航班信息", icon: "none" });
        this.setData({ tsvErrors: result.errors, tsvFlights: [] });
        return;
      }

      // 行数过多时二次确认，防止误导入超大文件
      if (result.flights.length > 500) {
        const confirmed = await new Promise((resolve) => {
          wx.showModal({
            title: "航班数量较多",
            content: `共解析到 ${result.flights.length} 条航班，超过 500 条。是否继续？`,
            confirmText: "继续",
            cancelText: "取消",
            success: (confirmRes) => resolve(confirmRes.confirm),
            fail: () => resolve(false),
          });
        });
        if (!confirmed) {
          this.setData({ tsvErrors: result.errors, tsvFlights: [] });
          return;
        }
      }

      // 预览前10条
      const previewFlights = result.flights.map((f, idx) => ({
        index: idx + 1,
        ...f,
        // 格式化显示时间
        departureDisplay: f.departureTime ? f.departureTime.replace("T", " ") : "",
        landingDisplay: f.landingTime ? f.landingTime.replace("T", " ") : "",
        estimatedArrivalDisplay: f.estimatedArrivalTime
          ? f.estimatedArrivalTime.replace("T", " ")
          : "",
      }));
      this.setData({ tsvFlights: previewFlights, tsvErrors: result.errors });
      wx.showToast({ title: `解析到 ${result.flights.length} 条航班信息`, icon: "success" });
    } catch (error) {
      console.error("TSV 解析失败:", error);
      wx.showToast({ title: "文件读取失败: " + (error.message || "未知错误"), icon: "none" });
    } finally {
      this.setData({ tsvParsing: false });
      wx.hideLoading();
    }
  },

  // 确认 TSV 导入并排班
  async onConfirmTSVImport() {
    if (!this.data.tsvFlights.length) {
      wx.showToast({ title: "没有可排班的航班", icon: "none" });
      return;
    }

    this.setData({ imageImporting: true });
    wx.showLoading({ title: "智能排班中..." });

    try {
      // 转换回存储格式传给后端
      const flightsPayload = this.data.tsvFlights.map((f) => ({
        flightNo: f.flightNo,
        airline: f.airline,
        aircraftType: f.aircraftType,
        engineModel: f.engineModel || "",
        departureTime: f.departureTime,
        landingTime: f.landingTime || "",
        estimatedArrivalTime: f.estimatedArrivalTime || "",
        stayHours: f.stayHours || 0,
        aircraftReg: f.aircraftReg || "",
        aircraftRegistration: f.aircraftRegistration || f.aircraftReg || "",
        scheduleDate: f.scheduleDate || this.data.scheduleDate,
        inboundFlight: f.inboundFlight || "",
        outboundFlight: f.outboundFlight || f.flightNo,
        requiredCount: 1,
        source: "TSV_IMPORT",
      }));

      const result = await callBackend("importScheduleFromTSV", {
        scheduleDate: this.data.scheduleDate,
        flights: flightsPayload,
      });

      const count = (result && result.importedCount) || 0;
      const errors = (result && result.errors) || [];

      if (errors.length > 0) {
        // 有失败行：全量展示失败明细，不关闭导入弹窗、不弹成功提示
        wx.hideLoading();
        wx.showModal({
          title: `导入完成，${errors.length} 条失败`,
          content: errors.join("\n") || "存在失败记录",
          showCancel: false,
          confirmText: "知道了",
        });
        return;
      }

      wx.showToast({
        title: `完成 ${count} 条排班`,
        icon: "success",
        duration: 2000,
      });

      const importedDate = flightsPayload[0] && flightsPayload[0].scheduleDate;
      this.setData({
        showTSVImportModal: false,
        selectedFileName: "",
        selectedFileContent: "",
        tsvFlights: [],
        tsvErrors: [],
        scheduleDate: importedDate || this.data.scheduleDate,
      });
      this._tsvFilePath = "";
      await this.loadTable();
    } catch (error) {
      wx.showToast({ title: error.message || "排班失败", icon: "none" });
    } finally {
      this.setData({ imageImporting: false });
      wx.hideLoading();
    }
  },

  onOpenCompletionStats() {
    wx.navigateTo({ url: "/pages/completionStatus/index" });
  },

  onOpenServiceSchedule() {
    wx.navigateTo({ url: "/pages/serviceSchedule/index" });
  },

  // ═══════════════════════════════════════
  // 更多操作菜单
  // ═══════════════════════════════════════

  onShowToolMenu() {
    this.setData({ showToolMenu: true });
  },

  onCloseToolMenu() {
    this.setData({ showToolMenu: false });
  },

  onToolMenuAction(e) {
    const action = e.currentTarget.dataset.action;
    this.setData({ showToolMenu: false });
    if (this.data.isOffline && ["aiOptimize", "batch", "tsv"].includes(action)) {
      wx.showToast({ title: "网络已断开，该操作不可用", icon: "none" });
      return;
    }
    if (action === "aiOptimize") this.onAiOptimizeSchedule();
    else if (action === "batch") this.onBatchAssign();
    else if (action === "tsv") this.onShowTSVImport();
    else if (action === "export") this.onExportMenu();
    else if (action === "stats") this.onOpenCompletionStats();
    else if (action === "service") this.onOpenServiceSchedule();
  },

  // ═══════════════════════════════════════
  // 导出功能
  // ═══════════════════════════════════════

  onExportMenu() {
    this.setData({ showExportMenu: true });
  },

  onCloseExportMenu() {
    this.setData({ showExportMenu: false });
  },

  /** 导出 Excel：调用云函数生成 xlsx 并打开 */
  async onExportExcel() {
    wx.showLoading({ title: "生成 Excel…" });
    try {
      const result = await callBackend("exportSchedule", {
        scheduleDate: this.data.scheduleDate,
        format: "xlsx",
        exportMode: "STANDARD",
      });
      await this.openExportDocument(result);
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: error.message || "导出失败", icon: "none" });
    }
  },

  async onExportCsv() {
    wx.showLoading({ title: "生成 CSV…" });
    try {
      const result = await callBackend("exportSchedule", {
        scheduleDate: this.data.scheduleDate,
        format: "csv",
        exportMode: "STANDARD",
      });
      if (!result || !result.fileID) throw new Error("未获取到导出文件");
      wx.hideLoading();
      wx.showLoading({ title: "下载文件中" });
      const downloadRes = await wx.cloud.downloadFile({ fileID: result.fileID });
      wx.hideLoading();
      if (!downloadRes.tempFilePath) throw new Error("下载文件失败");
      // 微信不支持直接预览 csv,通过「转发文件」发给文件传输助手/好友,电脑端打开
      await new Promise((resolve, reject) => {
        wx.shareFileMessage({
          filePath: downloadRes.tempFilePath,
          fileName: result.fileName || `排班表_${this.data.scheduleDate}.csv`,
          success: resolve,
          fail: () => reject(new Error("转发文件失败，可改用 Excel 导出")),
        });
      });
      this.setData({ showExportMenu: false });
      wx.showToast({ title: "CSV 已生成，请选择发送对象", icon: "none" });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: error.message || "导出失败", icon: "none" });
    }
  },

  async onPrintSchedule() {
    wx.showLoading({ title: "生成打印总表" });
    try {
      const result = await callBackend("exportSchedule", {
        scheduleDate: this.data.scheduleDate,
        format: "xlsx",
        exportMode: "PRINT",
      });
      await this.openExportDocument(result);
      wx.showToast({ title: "打印总表已生成", icon: "success" });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: error.message || "打印总表生成失败", icon: "none" });
    }
  },

  async openExportDocument(result) {
    if (!result || !result.fileID) throw new Error("未获取到导出文件");
    wx.hideLoading();
    wx.showLoading({ title: "下载文件中" });
    const downloadRes = await wx.cloud.downloadFile({ fileID: result.fileID });
    wx.hideLoading();
    if (!downloadRes.tempFilePath) throw new Error("下载文件失败");
    await new Promise((resolve, reject) => {
      wx.openDocument({
        filePath: downloadRes.tempFilePath,
        fileType: "xlsx",
        showMenu: true,
        success: resolve,
        fail: () => reject(new Error("打开文件失败")),
      });
    });
    this.setData({ showExportMenu: false });
  },

  /** 导出图片：将排班表渲染为图片并保存到相册 */
  async onExportImage() {
    wx.showLoading({ title: "生成图片…" });
    try {
      const rows = this.data.rows;
      if (!rows.length) {
        wx.hideLoading();
        wx.showToast({ title: "暂无数据可导出", icon: "none" });
        return;
      }

      const query = wx.createSelectorQuery();
      query.select("#exportCanvas").fields({ node: true, size: true }).exec((res) => {
        if (!res || !res[0] || !res[0].node) {
          wx.hideLoading();
          wx.showToast({ title: "Canvas 初始化失败", icon: "none" });
          return;
        }

        const canvas = res[0].node;
        const ctx = canvas.getContext("2d");

        // 配置
        const ppi = 2;
        const colWidths = [50, 100, 100, 80, 70, 80, 80, 120, 100, 80, 100, 100, 80, 80, 80];
        const headers = ["#", "工号", "姓名", "班组", "角色", "班次", "航班号", "航司", "机型", "到港", "离港", "停留", "工时", "状态", "资质"];
        const rowHeight = 36 * ppi;
        const headerHeight = 42 * ppi;
        const labelHeight = 50 * ppi;
        const padding = 20 * ppi;
        const totalWidth = colWidths.reduce((s, w) => s + w * ppi, 0) + padding * 2;
        const totalHeight = labelHeight + headerHeight + rows.length * rowHeight + padding * 2;

        // 缩放设置
        const dpr = wx.getSystemInfoSync().pixelRatio || 2;
        canvas.width = totalWidth * dpr;
        canvas.height = totalHeight * dpr;
        ctx.scale(dpr, dpr);

        // 背景
        const isDark = this.data.theme === "dark";
        ctx.fillStyle = isDark ? "#0a1a2e" : "#eaf4ff";
        ctx.fillRect(0, 0, totalWidth, totalHeight);

        // 标题
        ctx.fillStyle = isDark ? "#d8ebff" : "#1a4f8a";
        ctx.font = `bold ${22 * ppi}px sans-serif`;
        ctx.fillText(`排班表 ${this.data.scheduleDate}`, padding, 36 * ppi);

        // 表头
        ctx.fillStyle = isDark ? "#10294d" : "#d6ebff";
        ctx.fillRect(padding, labelHeight, totalWidth - padding * 2, headerHeight);
        ctx.fillStyle = isDark ? "#7fe9ff" : "#1a4f8a";
        ctx.font = `bold ${14 * ppi}px sans-serif`;
        let x = padding;
        headers.forEach((h, i) => {
          ctx.fillText(h, x + 6 * ppi, labelHeight + 28 * ppi);
          x += colWidths[i] * ppi;
        });

        // 分隔线
        ctx.strokeStyle = isDark ? "rgba(84,170,255,0.2)" : "rgba(124,156,198,0.3)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padding, labelHeight + headerHeight);
        ctx.lineTo(totalWidth - padding, labelHeight + headerHeight);
        ctx.stroke();

        // 数据行
        const shiftMap = { MORNING: "早班", AFTERNOON: "午班", NIGHT: "晚班", "": "未排班" };
        rows.forEach((r, ri) => {
          const y = labelHeight + headerHeight + ri * rowHeight;
          // 行背景交替
          if (ri % 2 === 0) {
            ctx.fillStyle = isDark ? "rgba(14,35,66,0.4)" : "rgba(234,245,255,0.4)";
            ctx.fillRect(padding, y, totalWidth - padding * 2, rowHeight);
          }

          ctx.fillStyle = isDark ? "#d0e6ff" : "#1a3b6e";
          ctx.font = `${13 * ppi}px sans-serif`;
          x = padding;

          const vals = [
            String(r.index || ""),
            r.employeeNo || "",
            r.name || "",
            r.groupText || "",
            r.roleText || "-",
            r.shiftText || shiftMap[r.shiftCode] || "未排班",
            r.flightNo || "-",
            r.airline || "-",
            r.aircraftType || "-",
            r.arrivalTimeText || r.arrivalTime || "-",
            r.departureTimeText || r.departureTime || "-",
            r.stayHours || "-",
            r.workedHoursText || `${r.workedHours || 0}h`,
            r.statusText || "-",
            r.aircraftQualifications || "-",
          ];

          vals.forEach((v, ci) => {
            const maxW = colWidths[ci] * ppi - 12 * ppi;
            let displayText = v;
            ctx.save();
            ctx.beginPath();
            ctx.rect(x + 6 * ppi, y + 6 * ppi, maxW, rowHeight - 12 * ppi);
            ctx.clip();
            ctx.fillText(displayText, x + 6 * ppi, y + 26 * ppi);
            ctx.restore();
            x += colWidths[ci] * ppi;
          });
        });

        // 底部信息
        ctx.fillStyle = isDark ? "#6e9fc9" : "#6e88ad";
        ctx.font = `${11 * ppi}px sans-serif`;
        const dateStr = new Date().toLocaleString("zh-CN");
        ctx.fillText(`生成时间: ${dateStr}  ·  共 ${rows.length} 人`, padding, totalHeight - 10 * ppi);

        // 导出为图片
        wx.canvasToTempFilePath({
          canvas,
          success: (res) => {
            wx.hideLoading();
            if (res.tempFilePath) {
              wx.saveImageToPhotosAlbum({
                filePath: res.tempFilePath,
                success: () => {
                  wx.showToast({ title: "已保存到相册", icon: "success" });
                  this.setData({ showExportMenu: false });
                },
                fail: (err) => {
                  if (err.errMsg && err.errMsg.indexOf("auth") !== -1) {
                    wx.showModal({
                      title: "需要权限",
                      content: "请在设置中开启「保存到相册」权限",
                      confirmText: "去设置",
                      success: (modalRes) => {
                        if (modalRes.confirm) wx.openSetting();
                      },
                    });
                  } else {
                    wx.showToast({ title: "保存失败", icon: "none" });
                  }
                },
              });
            }
          },
          fail: () => {
            wx.hideLoading();
            wx.showToast({ title: "图片生成失败", icon: "none" });
          },
        }, this);
      });
    } catch (error) {
      wx.hideLoading();
      wx.showToast({ title: error.message || "导出失败", icon: "none" });
    }
  },

  // ═══════════════════════════════════════
  // 一键改班
  // ═══════════════════════════════════════

  /** 打开改班弹窗 */
  async onReassignStaff(e) {
    const staffId = e.currentTarget.dataset.staffid;
    const rowIndex = this.data.rows.findIndex((item) => item.staffId === staffId);
    const row = this.data.rows[rowIndex];
    if (!row) return;

    this.setData({
      showReassignModal: true,
      reassignTarget: { row, rowIndex },
      reassignCandidates: [],
      reassignLoading: true,
    });

    // 查询可用人员
    try {
      const result = await callBackend("getAvailableStaff", {
        scheduleDate: this.data.scheduleDate,
        startTime: "00:00",
        endTime: "24:00",
        airline: row.airline || undefined,
        aircraftType: row.aircraftType || undefined,
        excludeStaffIds: [row.staffId],
      });
      const reassignCandidates = (result.available || []).map((item) => ({
        ...item,
        initial: String(item.name || "人").slice(0, 1),
        qualificationText: (item.authorizedAircraftTypes || []).join("/"),
      }));
      this.setData({ reassignCandidates });
    } catch (error) {
      wx.showToast({ title: error.message || "查询可用人员失败", icon: "none" });
    } finally {
      this.setData({ reassignLoading: false });
    }
  },

  /** 关闭改班弹窗 */
  onCloseReassign() {
    this.setData({
      showReassignModal: false,
      reassignTarget: null,
      reassignCandidates: [],
    });
  },

  /** 执行改班 */
  async onConfirmReassign(e) {
    const newStaffId = e.currentTarget.dataset.staffid;
    const target = this.data.reassignTarget;
    if (!newStaffId || !target) return;
    if (this.data.reassignSubmitting) return;

    // 二次确认
    const candidate = (this.data.reassignCandidates || []).find((c) => c.staffId === newStaffId);
    const candidateName = (candidate && candidate.name) || newStaffId;
    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: "确认改班",
        content: `确认将 ${target.row.name}（${target.row.employeeNo || ""}）的班次改派给 ${candidateName}？`,
        confirmText: "确认改派",
        cancelText: "取消",
        success: (result) => resolve(result.confirm),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;

    this.setData({ reassignSubmitting: true });
    wx.showLoading({ title: "改班中…" });
    try {
      await callBackend("reassignStaffTask", {
        flightNo: target.row.flightNo || "",
        taskType: target.row._taskType || (target.row.roleType === "RELEASE" ? "RELEASE" : "SERVICE"),
        scheduleDate: this.data.scheduleDate,
        newStaffId,
        oldStaffId: target.row.staffId,
        reason: "管理员手动改班",
      });
      wx.showToast({ title: "改班成功", icon: "success" });
      this.onCloseReassign();
      await this.loadTable();
    } catch (error) {
      wx.showToast({ title: error.message || "改班失败", icon: "none" });
    } finally {
      this.setData({ reassignSubmitting: false });
      wx.hideLoading();
    }
  },

  // ═══════════════════════════════════════
  // 实时状态
  // ═══════════════════════════════════════

  onOpenFlightEdit(e) {
    const staffId = e.currentTarget.dataset.staffid;
    const row = this.data.rows.find((item) => item.staffId === staffId);
    if (!row || !row.flightNo) {
      wx.showToast({ title: "该人员无关联航班", icon: "none" });
      return;
    }
    const estimated = String(row.estimatedArrivalTime || row.arrivalTime || "");
    const clockMatch = estimated.match(/(?:T|\s)(\d{2}:\d{2})/);
    this.setData({
      showFlightEditModal: true,
      flightEditTarget: row,
      flightEditForm: {
        aircraftType: row.aircraftType || "",
        engineModel: row.engineModel || "",
        aircraftRegistration: row.aircraftRegistration || "",
        estimatedArrivalClock: clockMatch ? clockMatch[1] : "",
      },
    });
  },

  onCloseFlightEdit() {
    if (this.data.flightEditSaving) return;
    this.setData({ showFlightEditModal: false, flightEditTarget: null });
  },

  onFlightEditInput(e) {
    const field = e.currentTarget.dataset.field;
    if (!["aircraftType", "engineModel", "aircraftRegistration"].includes(field)) return;
    this.setData({ [`flightEditForm.${field}`]: e.detail.value });
  },

  onEstimatedArrivalTimeChange(e) {
    this.setData({ "flightEditForm.estimatedArrivalClock": e.detail.value });
  },

  onClearEstimatedArrival() {
    this.setData({ "flightEditForm.estimatedArrivalClock": "" });
  },

  async onSaveFlightEdit() {
    if (this.data.flightEditSaving || !this.data.flightEditTarget) return;
    const target = this.data.flightEditTarget;
    const form = this.data.flightEditForm;

    // 必填与长度校验
    const aircraftType = String(form.aircraftType || "").trim();
    const engineModel = String(form.engineModel || "").trim();
    const aircraftRegistration = String(form.aircraftRegistration || "").trim();
    if (!aircraftType) {
      wx.showToast({ title: "机型必填", icon: "none" });
      return;
    }
    if (aircraftType.length > 20) {
      wx.showToast({ title: "机型不能超过20个字符", icon: "none" });
      return;
    }
    if (engineModel.length > 50) {
      wx.showToast({ title: "发动机型号不能超过50个字符", icon: "none" });
      return;
    }
    if (aircraftRegistration.length > 20) {
      wx.showToast({ title: "机号不能超过20个字符", icon: "none" });
      return;
    }

    const estimatedArrivalTime = form.estimatedArrivalClock
      ? `${this.data.scheduleDate}T${form.estimatedArrivalClock}`
      : "";
    this.setData({ flightEditSaving: true });
    try {
      await callBackend("updateFlightOperationalData", {
        flightId: target.flightId || "",
        flightNo: target.flightNo,
        scheduleDate: this.data.scheduleDate,
        aircraftType,
        engineModel,
        aircraftRegistration,
        estimatedArrivalTime,
      });
      wx.removeStorageSync("data_cache_adminSchedule_" + this.data.scheduleDate);
      this.setData({ showFlightEditModal: false, flightEditTarget: null });
      await this.loadTable();
      wx.showToast({ title: "航班资料已更新", icon: "success" });
    } catch (error) {
      wx.showToast({ title: error.message || "更新失败", icon: "none" });
    } finally {
      this.setData({ flightEditSaving: false });
    }
  },

  /** 打开航班状态更新弹窗 */
  onShowStatusMenu(e) {
    const staffId = e.currentTarget.dataset.staffid;
    const rowIndex = this.data.rows.findIndex((item) => item.staffId === staffId);
    const row = this.data.rows[rowIndex];
    if (!row || !row.flightNo) {
      wx.showToast({ title: "该人员无关联航班", icon: "none" });
      return;
    }
    wx.showActionSheet({
      itemList: [" 正常", " 延误", " 取消", " 已到达"],
      success: async (res) => {
        const statusMap = ["ON_TIME", "DELAYED", "CANCELLED", "ARRIVED"];
        const status = statusMap[res.tapIndex];
        if (!status) return;
        if (this.data.statusUpdating) return;
        this.setData({ statusUpdating: true });
        wx.showLoading({ title: "更新中…" });
        try {
          await callBackend("updateFlightRealtimeStatus", {
            flightNo: row.flightNo,
            scheduleDate: this.data.scheduleDate,
            status,
            remark: "",
          });
          wx.showToast({ title: "状态已更新", icon: "success" });
        } catch (error) {
          wx.showToast({ title: error.message || "更新失败", icon: "none" });
        } finally {
          this.setData({ statusUpdating: false });
          wx.hideLoading();
        }
      },
    });
  },

  noop() {},
});
