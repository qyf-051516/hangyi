const { callBackend } = require("../../utils/api.js");
const { applyUiIfThemeChanged, groupLabel, loadIsAdmin } = require("../../utils/ui");
const { readCache, writeCache } = require("../../utils/cache");

const CACHE_KEY = "warnings_workload";
const CACHE_TTL = 30000;

Page({

  data: {
    pendingSwaps: [],
    loading: false,
    loaded: false,
    errorMessage: "",
    theme: "light",
    themeClass: "theme-light",
    rankingRows: [],
    fatigueResults: [],
    isAdmin: false,
    accessDenied: false,
    // 是否存在可批量处理的排班互换(SWAP)申请
    hasSwapRequests: false,
    // 批量审批
    selectedSwapIds: [],
    // 驳回 modal
    showRejectModal: false,
    rejectTargetIds: [],
    rejectComment: "",
    rejecting: false,
    // 替班人员选择
    showCandidateModal: false,
    candidateLoading: false,
    candidateSubmitting: false,
    candidateRequestId: "",
    candidateQuery: "",
    candidateList: [],
    filteredCandidateList: [],
    selectedCandidateId: "",
    candidateError: "",
  },

  decorateSwaps(requests, selectedIds = this.data.selectedSwapIds) {
    const selectedSet = new Set(selectedIds || []);
    return (requests || []).map((request) => ({
      ...request,
      selected: selectedSet.has(request._id),
      reasonImages: Array.isArray(request.reasonImages) ? request.reasonImages : [],
      validationText: request.validationSnapshot
        ? request.validationSnapshot.passed === false
          ? "系统校验发现待处理项，审批时将重新复核"
          : "资质与工时校验通过，审批时将重新复核"
        : "历史申请，审批时将执行完整合规校验",
    }));
  },

  onPreviewSwapImage(e) {
    const request = this.data.pendingSwaps.find((item) => item._id === e.currentTarget.dataset.id);
    const urls = request && request.reasonImages || [];
    if (!urls.length) return;
    const index = Math.max(0, Math.min(Number(e.currentTarget.dataset.index) || 0, urls.length - 1));
    wx.previewImage({ current: urls[index], urls });
  },

  async onShow() {
    applyUiIfThemeChanged(this);
    const isAdmin = await loadIsAdmin(true);
    if (!isAdmin) {
      // 非管理员且非审批场景: 显示引导文案, 不隐藏整页
      this.setData({
        isAdmin: false,
        accessDenied: true,
        loading: false,
        loaded: false,
        pendingSwaps: [],
        rankingRows: [],
        fatigueResults: [],
        errorMessage: "",
      });
      return;
    }
    this.setData({ isAdmin: true, accessDenied: false });
    this.loadData();
  },

  async loadData(forceRefresh = false) {
    if (!this.data.isAdmin) return;
    this.setData({ errorMessage: "", loading: true });
    if (!forceRefresh) {
      const cached = readCache(CACHE_KEY, CACHE_TTL);
      if (cached) {
        // P1 修复: 审批队列刷新失败时不再静默/抛异常，保留缓存数据并给出可见提示
        let pendingSwaps = Array.isArray(cached.pendingSwaps) ? cached.pendingSwaps : [];
        let swapNotice = "";
        try {
          const swapRes = await callBackend("listSwapRequests", { status: "PENDING" });
          pendingSwaps = this.decorateSwaps(swapRes.requests || []);
        } catch (error) {
          console.error("刷新调班审批队列失败，使用缓存数据", error);
          swapNotice = "审批队列刷新失败，当前为缓存数据";
        }
        this.setData({
          ...cached,
          pendingSwaps,
          swapNotice,
          hasSwapRequests: pendingSwaps.some((item) => (item.requestType || "SWAP") === "SWAP"),
          loading: false,
          loaded: true,
        });
        this.loadFatigueScores(cached.rankingRows || []);
        return;
      }
    }

    try {
      const [swapRes, analyticsRes] = await Promise.all([
        callBackend("listSwapRequests", { status: "PENDING" }),
        callBackend("getWarningAnalytics", { days: 7, includeFlowTrend: false }),
      ]);

      const rankingRows = (analyticsRes.staffWorkloadRanking || []).map((item) => ({
        ...item,
        groupId: groupLabel(item.groupId),
      }));

      const workloadData = { rankingRows };

      writeCache(CACHE_KEY, workloadData);
      const pendingSwaps = this.decorateSwaps(swapRes.requests || []);
      this.setData({
        ...workloadData,
        pendingSwaps,
        hasSwapRequests: pendingSwaps.some((item) => (item.requestType || "SWAP") === "SWAP"),
        loaded: true,
        errorMessage: "",
      });

      this.loadFatigueScores(rankingRows);
    } catch (error) {
      const errorMessage = error.message || "审批与人员负荷数据加载失败，请稍后重试";
      this.setData({ errorMessage });
      if (this.data.loaded) {
        wx.showToast({ title: errorMessage, icon: "none" });
      }
    } finally {
      this.setData({ loading: false });
    }
  },

  async loadFatigueScores(rankingRows) {
    if (!rankingRows || !rankingRows.length) return;
    try {
      const staffs = rankingRows.map((r) => ({
        employeeNo: r.employeeNo || "",
        staffId: r.staffId || "",
        name: r.name || "",
        groupId: r.groupId || "",
        totalWorkedHours: Number(r.totalWorkedHours || 0),
      }));
      const result = await callBackend("getFatigueScores", { staffs });
      const fatigueResults = {};
      ((result && result.results) || []).forEach((r) => {
        const key = r.staffId || r.employeeNo || "";
        if (key) fatigueResults[key] = r;
      });
      this.setData({ fatigueResults });
    } catch (error) {
      console.warn("疲劳度评分加载失败:", error);
    }
  },

  onToggleSwapSelect(e) {
    const id = e.currentTarget.dataset.id;
    const request = this.data.pendingSwaps.find((item) => item._id === id);
    if (!request) return;
    if ((request.requestType || "SWAP") !== "SWAP") {
      wx.showToast({ title: "单人调班需逐条选择替班人员审批", icon: "none" });
      return;
    }
    const selected = this.data.selectedSwapIds.slice();
    const idx = selected.indexOf(id);
    if (idx >= 0) selected.splice(idx, 1);
    else selected.push(id);
    this.setData({
      selectedSwapIds: selected,
      pendingSwaps: this.decorateSwaps(this.data.pendingSwaps, selected),
    });
  },

  onClearSelection() {
    this.setData({
      selectedSwapIds: [],
      pendingSwaps: this.decorateSwaps(this.data.pendingSwaps, []),
    });
  },

  onGoQualificationWarnings() {
    wx.navigateTo({ url: "/pages/qualificationWarnings/index" });
  },

  // 所选申请中是否混入单人调班(SHIFT_APPLY), 批量审批仅支持排班互换(SWAP)
  hasNonSwapSelected(ids) {
    return (ids || []).some((id) => {
      const request = this.data.pendingSwaps.find((item) => item._id === id);
      return !request || (request.requestType || "SWAP") !== "SWAP";
    });
  },

  async onBatchApproveSwap() {
    const ids = this.data.selectedSwapIds;
    if (!ids.length) return;
    if (this.hasNonSwapSelected(ids)) {
      wx.showToast({ title: "单人调班需逐条选择替班人员审批", icon: "none" });
      return;
    }
    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: "确认批量通过",
        content: `将通过已选择的 ${ids.length} 条互换申请，提交后会立即调整排班。`,
        confirmText: "确认通过",
        success: (res) => resolve(res.confirm),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;
    wx.showLoading({ title: `通过 ${ids.length} 条中...` });
    let ok = 0, fail = 0;
    for (const id of ids) {
      try {
        await callBackend("approveSwapRequest", { requestId: id, decision: "APPROVE" });
        ok++;
      } catch (e) { fail++; }
    }
    wx.hideLoading();
    wx.showToast({ title: `通过 ${ok} 条${fail ? `, 失败 ${fail}` : ""}`, icon: fail ? "none" : "success" });
    this.setData({ selectedSwapIds: [] });
    wx.removeStorageSync("data_cache_" + CACHE_KEY);
    await this.loadData(true);
  },

  onShowReject(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({
      showRejectModal: true,
      rejectTargetIds: [id],
      rejectComment: "",
    });
  },

  onShowBatchReject() {
    const ids = this.data.selectedSwapIds;
    if (!ids.length) return;
    if (this.hasNonSwapSelected(ids)) {
      wx.showToast({ title: "单人调班需逐条选择替班人员审批", icon: "none" });
      return;
    }
    this.setData({
      showRejectModal: true,
      rejectTargetIds: ids,
      rejectComment: "",
    });
  },

  onCloseRejectModal() {
    this.setData({ showRejectModal: false, rejectTargetIds: [], rejectComment: "" });
  },

  onModalContentTap() {},

  onPickRejectReason(e) {
    this.setData({ rejectComment: e.currentTarget.dataset.reason });
  },

  onInputRejectComment(e) {
    this.setData({ rejectComment: e.detail.value });
  },

  async onConfirmReject() {
    if (this.data.rejecting) return;
    const ids = this.data.rejectTargetIds;
    const comment = String(this.data.rejectComment || "").trim() || "未说明";
    this.setData({ rejecting: true });
    wx.showLoading({ title: `驳回 ${ids.length} 条中...` });
    let ok = 0, fail = 0;
    for (const id of ids) {
      try {
        await callBackend("approveSwapRequest", { requestId: id, decision: "REJECT", comment });
        ok++;
      } catch (e) { fail++; }
    }
    wx.hideLoading();
    this.setData({ rejecting: false, showRejectModal: false, selectedSwapIds: [], rejectComment: "" });
    wx.showToast({ title: `驳回 ${ok} 条${fail ? `, 失败 ${fail}` : ""}`, icon: "none" });
    wx.removeStorageSync("data_cache_" + CACHE_KEY);
    await this.loadData(true);
  },

  async onApproveSwap(e) {
    const requestId = e.currentTarget.dataset.id;
    const request = this.data.pendingSwaps.find((item) => item._id === requestId);
    if (!request) return;

    if ((request.requestType || "SWAP") === "SHIFT_APPLY") {
      await this.openCandidatePicker(request);
      return;
    }

    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: "确认通过互换",
        content: `将通过 ${request.name || request.employeeNo || "该员工"} 的申请并立即调整双方排班。`,
        confirmText: "确认通过",
        success: (res) => resolve(res.confirm),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;

    try {
      await callBackend("approveSwapRequest", {
        requestId,
        decision: "APPROVE",
      });
      wx.showToast({ title: "审批通过", icon: "success" });
      wx.removeStorageSync("data_cache_" + CACHE_KEY);
      await this.loadData(true);
    } catch (error) {
      wx.showToast({ title: error.message || "操作失败", icon: "none" });
    }
  },

  async openCandidatePicker(request) {
    this.setData({
      showCandidateModal: true,
      candidateLoading: true,
      candidateSubmitting: false,
      candidateRequestId: request._id,
      candidateQuery: "",
      candidateList: [],
      filteredCandidateList: [],
      selectedCandidateId: "",
      candidateError: "",
    });
    try {
      const result = await callBackend("getAvailableStaff", {
        scheduleDate: request.scheduleDate,
        startTime: request.startTime,
        endTime: request.endTime,
        airline: request.airline,
        aircraftType: request.aircraftType,
        excludeStaffIds: [request.sourceStaffId],
      });
      const candidateList = (result.available || []).map((item) => ({
        ...item,
        nameInitial: String(item.name || "人").slice(0, 1),
        groupText: groupLabel(item.groupId),
        qualificationText: (item.authorizedAircraftTypes || []).join("/") || "未登记",
        airlineText: (item.authorizedAirlines || []).join("/") || "未登记",
        searchText: [
          item.name,
          item.employeeNo,
          groupLabel(item.groupId),
          (item.authorizedAircraftTypes || []).join(" "),
          (item.authorizedAirlines || []).join(" "),
        ].filter(Boolean).join(" ").toLowerCase(),
      }));
      this.setData({
        candidateList,
        filteredCandidateList: candidateList,
        candidateError: candidateList.length ? "" : "当前时段没有同时满足空闲和资质要求的人员",
      });
    } catch (error) {
      this.setData({
        candidateError: error.message || "可用人员加载失败，请稍后重试",
      });
    } finally {
      this.setData({ candidateLoading: false });
    }
  },

  onInputCandidateQuery(e) {
    this.setData({ candidateQuery: String(e.detail.value || "").slice(0, 50) });
    this.applyCandidateFilter();
  },

  applyCandidateFilter() {
    const query = String(this.data.candidateQuery || "").trim().toLowerCase();
    const filteredCandidateList = query
      ? this.data.candidateList.filter((item) => item.searchText.includes(query))
      : this.data.candidateList;
    this.setData({ filteredCandidateList });
  },

  onSelectCandidate(e) {
    const staffId = String(e.currentTarget.dataset.id || "");
    if (!staffId) return;
    this.setData({
      selectedCandidateId: this.data.selectedCandidateId === staffId ? "" : staffId,
    });
  },

  onCloseCandidateModal() {
    if (this.data.candidateSubmitting) return;
    this.setData({
      showCandidateModal: false,
      candidateRequestId: "",
      candidateQuery: "",
      candidateList: [],
      filteredCandidateList: [],
      selectedCandidateId: "",
      candidateError: "",
    });
  },

  async onRetryCandidates() {
    const request = this.data.pendingSwaps.find(
      (item) => item._id === this.data.candidateRequestId
    );
    if (request) await this.openCandidatePicker(request);
  },

  async onConfirmCandidate() {
    if (this.data.candidateSubmitting) return;
    const replacement = this.data.candidateList.find(
      (item) => item.staffId === this.data.selectedCandidateId
    );
    const request = this.data.pendingSwaps.find(
      (item) => item._id === this.data.candidateRequestId
    );
    if (!replacement || !request) {
      wx.showToast({ title: "请先选择替班人员", icon: "none" });
      return;
    }

    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: "确认替班人员",
        content: `将 ${request.flightNo || "该排班"} 转交给 ${replacement.name}（${replacement.employeeNo}）？`,
        confirmText: "确认通过",
        success: (res) => resolve(res.confirm),
        fail: () => resolve(false),
      });
    });
    if (!confirmed) return;

    this.setData({ candidateSubmitting: true });
    try {
      await callBackend("approveSwapRequest", {
        requestId: request._id,
        decision: "APPROVE",
        replacementStaffId: replacement.staffId,
      });
      this.setData({
        showCandidateModal: false,
        candidateRequestId: "",
        candidateQuery: "",
        candidateList: [],
        filteredCandidateList: [],
        selectedCandidateId: "",
        candidateError: "",
      });
      wx.showToast({ title: "已完成替班", icon: "success" });
      wx.removeStorageSync("data_cache_" + CACHE_KEY);
      await this.loadData(true);
    } catch (error) {
      wx.showToast({ title: error.message || "操作失败", icon: "none" });
    } finally {
      this.setData({ candidateSubmitting: false });
    }
  },

  onRetry() {
    this.loadData(true);
  },

  async onPullDownRefresh() {
    try {
      await this.loadData(true);
    } finally {
      wx.stopPullDownRefresh();
    }
  },
});
