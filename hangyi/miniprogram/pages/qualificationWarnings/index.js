const { callBackend } = require("../../utils/api.js");
const { applyUiSettings, groupLabel } = require("../../utils/ui");

Page({
  data: {
    list: [],
    summary: { expired: 0, expiring30: 0, expiring60: 0, valid: 0 },
    loading: true,
    expandStaffId: null,
    themeClass: "theme-light",
    scope: "SELF",
    errorMessage: "",
  },

  onShow() {
    applyUiSettings(this);
    this.loadData();
  },

  onPullDownRefresh() {
    this.loadData().finally(() => wx.stopPullDownRefresh());
  },

  async loadData() {
    this.setData({ loading: true, errorMessage: "" });
    try {
      const data = await callBackend("getQualificationStatus");
      this.setData({
        list: (data.list || []).map((staff) => ({
          ...staff,
          groupText: groupLabel(staff.groupId),
          qualifications: (staff.qualifications || []).map((qualification) => ({
            ...qualification,
            daysText: qualification.daysLeft < 0
              ? `已过期 ${Math.abs(qualification.daysLeft)} 天`
              : qualification.daysLeft >= 999
                ? "长期有效"
                : `剩余 ${qualification.daysLeft} 天`,
          })),
        })),
        summary: data.summary || { expired: 0, expiring30: 0, expiring60: 0, valid: 0 },
        scope: data.scope || "SELF",
        loading: false,
      });
    } catch (error) {
      this.setData({
        loading: false,
        errorMessage: error.message || "资质数据加载失败",
      });
    }
  },

  onToggleExpand(e) {
    const staffId = e.currentTarget.dataset.staffId;
    this.setData({
      expandStaffId: this.data.expandStaffId === staffId ? null : staffId,
    });
  },

  getBadgeClass(daysLeft) {
    if (daysLeft < 0) return "badge-expired";
    if (daysLeft <= 30) return "badge-expiring30";
    if (daysLeft <= 60) return "badge-expiring60";
    return "badge-valid";
  },

  getBadgeText(status, daysLeft) {
    if (daysLeft < 0) return `已过期 ${Math.abs(daysLeft)}天`;
    if (daysLeft <= 30) return `即将到期 ${daysLeft}天`;
    if (daysLeft <= 60) return `${daysLeft}天到期`;
    return `${daysLeft}天`;
  },

  onRetry() {
    this.loadData();
  },
});
