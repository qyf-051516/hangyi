const { callBackend } = require("../../utils/api.js");
const { applyUiSettings } = require("../../utils/ui");
const { clearAllCache } = require("../../utils/cache");

Page({
  data: {
    theme: "light",
    themeClass: "theme-light",
    loading: false,
    status: {
      enabled: false,
      tokenConfigured: false,
      adminCount: 0,
      usableAdminCount: 0,
      staleAdminCount: 0,
      staffTotal: 0,
      currentUserBound: false,
      currentUserIsAdmin: false,
      currentEmployeeNo: "",
      currentName: "",
      currentPhone: "",
      consoleFunctionName: "bootstrapAdmin",
      consoleCall: {},
      steps: [],
    },
    consoleCallText: "",
  },

  onShow() {
    applyUiSettings(this);
    this.loadStatus();
  },

  async loadStatus() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      const res = await callBackend("getBootstrapStatus");
      this.setData({
        status: res,
        consoleCallText: JSON.stringify(res.consoleCall || {}, null, 2),
      });

      if (res.currentUserIsAdmin) {
        clearAllCache();
        await callBackend(
          "getMyProfile",
          { forceRefresh: true },
          { silent: true }
        ).catch(() => null);
      }
    } catch (e) {
      wx.showToast({ title: e.message || "加载失败", icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },

  onRefreshStatus() {
    this.loadStatus();
  },

  onCopyConsoleCall() {
    if (!this.data.consoleCallText) return;
    wx.setClipboardData({
      data: this.data.consoleCallText,
      success: () => wx.showToast({ title: "参数已复制", icon: "success" }),
    });
  },

  onGoLogin() {
    wx.reLaunch({ url: "/pages/quickLogin/index" });
  },

  onGoAdminHome() {
    clearAllCache();
    wx.switchTab({ url: "/pages/index/index" });
  },

});
