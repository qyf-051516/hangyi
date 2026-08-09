const { callBackend } = require("../../utils/api.js");
const { applyUiSettings, groupLabel, loadIsAdmin } = require("../../utils/ui");

const GROUP_OPTIONS = [
  { value: "", label: "全部班组" },
  { value: "A组", label: "A组" },
  { value: "B组", label: "B组" },
  { value: "C组", label: "C组" },
  { value: "D组", label: "D组" },
  { value: "E组", label: "E组" },
  { value: "F组", label: "F组" },
  { value: "G组", label: "G组" },
  { value: "H组", label: "H组" },
];

const ROLE_OPTIONS = [
  { value: "", label: "全部角色" },
  { value: "SERVICE", label: "勤务" },
  { value: "RELEASE", label: "放行" },
  { value: "BOTH", label: "双资质" },
];

const STATUS_OPTIONS = [
  { value: "ALL", label: "全部状态" },
  { value: "ACTIVE", label: "在职" },
  { value: "INACTIVE", label: "已停用" },
  { value: "ADMIN", label: "管理员" },
];

const roleLabel = (roleType) => ({
  SERVICE: "勤务",
  RELEASE: "放行",
  BOTH: "双资质",
})[roleType] || "勤务";

Page({
  data: {
    theme: "light",
    themeClass: "theme-light",
    loading: true,
    loadingMore: false,
    saving: false,
    adminDenied: false,
    errorMessage: "",
    list: [],
    total: 0,
    page: 1,
    pageSize: 30,
    hasMore: false,
    summary: { total: 0, active: 0, inactive: 0, admins: 0, bound: 0 },
    query: "",
    groupOptions: GROUP_OPTIONS,
    roleOptions: ROLE_OPTIONS,
    statusOptions: STATUS_OPTIONS,
    groupIndex: 0,
    roleIndex: 0,
    statusIndex: 0,
    showEditor: false,
    selectedStaff: null,
    editForm: {
      staffId: "",
      groupId: "A组",
      groupIndex: 1,
      roleType: "SERVICE",
      roleIndex: 1,
      active: true,
      isAdmin: false,
      qualificationText: "",
      airlineText: "",
    },
    skeletonRows: [1, 2, 3, 4],
    dirty: false,
  },

  _loadSeq: 0,

  async onShow() {
    applyUiSettings(this);
    const isAdmin = await loadIsAdmin(true);
    if (!isAdmin) {
      this.setData({
        loading: false,
        loadingMore: false,
        adminDenied: true,
        errorMessage: "",
        list: [],
        total: 0,
        hasMore: false,
      });
      return;
    }
    this.setData({ adminDenied: false });
    this.loadList(true);
  },

  onPullDownRefresh() {
    this.loadList(true).finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loadingMore) {
      this.loadList(false);
    }
  },

  onUnload() {
    clearTimeout(this._searchTimer);
  },

  formatStaff(item) {
    return {
      ...item,
      initial: String(item.name || "人").slice(0, 1),
      groupText: groupLabel(item.groupId),
      roleText: roleLabel(item.roleType),
      qualificationText: (item.authorizedAircraftTypes || []).join(" / ") || "暂无资质",
      airlineText: (item.authorizedAirlines || []).join(" / ") || "暂无航司授权",
      bindText: item.openidBound ? "已绑定微信" : "未绑定微信",
    };
  },

  async loadList(reset = true) {
    if (this.data.adminDenied) return;
    const seq = ++this._loadSeq;
    const page = reset ? 1 : this.data.page + 1;
    this.setData(reset ? {
      loading: true,
      errorMessage: "",
      page: 1,
    } : {
      loadingMore: true,
    });
    try {
      const result = await callBackend("listStaffForAdmin", {
        query: this.data.query.trim(),
        groupId: GROUP_OPTIONS[this.data.groupIndex].value,
        roleType: ROLE_OPTIONS[this.data.roleIndex].value,
        status: STATUS_OPTIONS[this.data.statusIndex].value,
        page,
        pageSize: this.data.pageSize,
      });
      if (seq !== this._loadSeq) return;
      const nextList = (result.list || []).map((item) => this.formatStaff(item));
      const list = reset ? nextList : [...this.data.list, ...nextList];
      this.setData({
        list,
        total: Number(result.total || 0),
        page,
        hasMore: list.length < Number(result.total || 0),
        summary: result.summary || this.data.summary,
        loading: false,
        loadingMore: false,
        adminDenied: false,
        errorMessage: "",
      });
    } catch (error) {
      if (seq !== this._loadSeq) return;
      const denied = Number(error.code) === 403 || String(error.message || "").includes("管理员");
      this.setData({
        loading: false,
        loadingMore: false,
        adminDenied: denied,
        errorMessage: denied ? "" : (error.message || "人员列表加载失败"),
      });
    }
  },

  onQueryInput(e) {
    const value = String(e.detail.value || "").trim().slice(0, 50);
    this.setData({ query: value });
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => this.loadList(true), 350);
  },

  onClearQuery() {
    this.setData({ query: "" }, () => this.loadList(true));
  },

  onGroupFilter(e) {
    this.setData({ groupIndex: Number(e.detail.value || 0) }, () => this.loadList(true));
  },

  onRoleFilter(e) {
    this.setData({ roleIndex: Number(e.detail.value || 0) }, () => this.loadList(true));
  },

  onStatusFilter(e) {
    this.setData({ statusIndex: Number(e.detail.value || 0) }, () => this.loadList(true));
  },

  onOpenEditor(e) {
    const staffId = e.currentTarget.dataset.id;
    const selectedStaff = this.data.list.find((item) => item.staffId === staffId);
    if (!selectedStaff) return;
    const groupIndexRaw = GROUP_OPTIONS.findIndex((item) => item.value === selectedStaff.groupId);
    const groupIndex = groupIndexRaw >= 1 ? groupIndexRaw : 0; // 0=“全部班组”占位,未知班组保存时保留原值
    const roleIndex = Math.max(1, ROLE_OPTIONS.findIndex((item) => item.value === selectedStaff.roleType));
    this.setData({
      showEditor: true,
      selectedStaff,
      dirty: false,
      editForm: {
        staffId,
        groupId: groupIndexRaw >= 1 ? GROUP_OPTIONS[groupIndexRaw].value : selectedStaff.groupId,
        groupIndex,
        roleType: ROLE_OPTIONS[roleIndex].value,
        roleIndex,
        active: selectedStaff.active !== false,
        isAdmin: selectedStaff.isAdmin === true,
        qualificationText: (selectedStaff.authorizedAircraftTypes || []).join(", "),
        airlineText: (selectedStaff.authorizedAirlines || []).join(", "),
      },
    });
  },

  onCloseEditor() {
    if (this.data.saving) return;
    if (this.data.dirty) {
      wx.showModal({
        title: "放弃修改",
        content: "当前编辑内容未保存，确定放弃？",
        confirmText: "放弃",
        cancelText: "继续编辑",
        success: (res) => {
          if (res.confirm) {
            this.setData({ showEditor: false, selectedStaff: null, dirty: false });
          }
        },
      });
      return;
    }
    this.setData({ showEditor: false, selectedStaff: null, dirty: false });
  },

  onEditGroup(e) {
    const groupIndex = Number(e.detail.value || 0);
    if (groupIndex === 0) {
      // “全部班组”仅用于列表筛选,编辑弹窗忽略该选项,保留原班组
      return;
    }
    this.setData({
      "editForm.groupIndex": groupIndex,
      "editForm.groupId": GROUP_OPTIONS[groupIndex].value,
      dirty: true,
    });
  },

  onEditRole(e) {
    const roleIndex = Number(e.detail.value || 1);
    this.setData({
      "editForm.roleIndex": roleIndex,
      "editForm.roleType": ROLE_OPTIONS[roleIndex].value,
      dirty: true,
    });
  },

  onEditSwitch(e) {
    const field = e.currentTarget.dataset.field;
    if (!["active", "isAdmin"].includes(field)) return;
    this.setData({ [`editForm.${field}`]: !!e.detail.value, dirty: true });
  },

  onEditQualifications(e) {
    this.setData({ "editForm.qualificationText": e.detail.value, dirty: true });
  },

  onEditAirlines(e) {
    this.setData({ "editForm.airlineText": e.detail.value, dirty: true });
  },

  async onSaveStaff() {
    if (this.data.saving || !this.data.selectedStaff) return;
    const form = this.data.editForm;
    const qualifications = String(form.qualificationText || "")
      .split(/[,，、/]+/) // 分隔符不含空白,保留 B737 MAX 这类含空格的机型名
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean);
    const airlines = String(form.airlineText || "")
      .split(/[,，、/\n]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (qualifications.length > 20) {
      wx.showToast({ title: "维修资质最多填写 20 项", icon: "none" });
      return;
    }
    if (airlines.length > 20) {
      wx.showToast({ title: "航司授权最多填写 20 项", icon: "none" });
      return;
    }

    const selected = this.data.selectedStaff;
    const originalQualifications = (selected.authorizedAircraftTypes || [])
      .map((item) => String(item).toUpperCase())
      .sort()
      .join(",");
    const nextQualifications = [...qualifications].sort().join(",");
    const originalAirlines = (selected.authorizedAirlines || []).slice().sort().join(",");
    const nextAirlines = [...airlines].sort().join(",");
    const changeLabels = [];
    if (selected.groupId !== form.groupId) changeLabels.push("班组");
    if (selected.roleType !== form.roleType) changeLabels.push("岗位角色");
    if (selected.active !== form.active) changeLabels.push("在职状态");
    if (selected.isAdmin !== form.isAdmin) changeLabels.push("管理员权限");
    if (originalQualifications !== nextQualifications) changeLabels.push("维修资质");
    if (originalAirlines !== nextAirlines) changeLabels.push("航司授权");
    if (!changeLabels.length) {
      wx.showToast({ title: "人员资料没有变化", icon: "none" });
      return;
    }
    {
      const confirmResult = await new Promise((resolve) => {
        wx.showModal({
          title: "确认人员资料变更",
          content: `将修改：${changeLabels.join("、")}。如影响现有排班，系统会自动标记待改派。`,
          confirmText: "确认保存",
          success: (result) => resolve(result.confirm),
          fail: () => resolve(false),
        });
      });
      if (!confirmResult) return;
    }

    this.setData({ saving: true });
    try {
      const result = await callBackend("updateStaffForAdmin", {
        staffId: form.staffId,
        groupId: form.groupId,
        roleType: form.roleType,
        active: form.active,
        isAdmin: form.isAdmin,
        authorizedAircraftTypes: qualifications,
        authorizedAirlines: airlines,
      });
      const impacted = Number(result.impactedScheduleCount || 0);
      wx.showToast({
        title: impacted > 0 ? `已标记 ${impacted} 条排班待改派` : "人员资料已更新",
        icon: impacted > 0 ? "none" : "success",
      });
      this.setData({ showEditor: false, selectedStaff: null, dirty: false });
      await this.loadList(true);
    } catch (error) {
      const denied = Number(error.code) === 403 || String(error.message || "").includes("管理员");
      if (denied) {
        this.setData({ adminDenied: true, showEditor: false, selectedStaff: null, dirty: false });
        return;
      }
      wx.showToast({ title: error.message || "保存失败", icon: "none" });
    } finally {
      this.setData({ saving: false });
    }
  },

  onRetry() {
    if (this.data.dirty) {
      wx.showModal({
        title: "存在未保存的修改",
        content: "当前编辑内容尚未保存，重新加载会丢弃这些修改。",
        confirmText: "丢弃并重新加载",
        success: (result) => {
          if (!result.confirm) return;
          this.setData({ dirty: false, showEditor: false, selectedStaff: null });
          this.loadList(true);
        },
      });
      return;
    }
    this.loadList(true);
  },

  onBackMine() {
    wx.switchTab({ url: "/pages/mine/index" });
  },

  noop() {},
});
