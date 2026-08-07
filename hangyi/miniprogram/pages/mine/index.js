const { callBackend } = require("../../utils/api.js");
const { applyUiSettings, groupLabel } = require("../../utils/ui");
const { readCache, writeCache, clearAllCache } = require("../../utils/cache");

const decorateProfile = (profile) => ({
  ...profile,
  groupId: groupLabel(profile.groupId),
  roleText: {
    SERVICE: "勤务",
    RELEASE: "放行",
    BOTH: "双资质",
  }[profile.roleType] || "勤务",
  authorizedAircraftTypesText: (profile.authorizedAircraftTypes || []).join("/") || "-",
});

Page({
  data: {
    profile: null,
    profileQrDataUrl: "",
    isAdmin: false,
    unreadNotificationCount: 0,
    hasUnreadNotification: false,
    expiredQualCount: 0,
    theme: "light",
    themeClass: "theme-light",
    loggingOut: false,
    isOffline: false,
    qrModalVisible: false,
  },

  onShow() {
    this.loadUiSettings();
    this.updateNetworkStatus();
    this.loadData();
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
          this.loadData();
          wx.showToast({ title: "网络已恢复", icon: "none", duration: 1500 });
        }
      };
      wx.onNetworkStatusChange(this._offNetworkCallback);
      this._networkListenerRegistered = true;
    }
  },

  loadUiSettings() {
    applyUiSettings(this);
  },

  async loadData() {
    const cacheKey = "mine_profile";
    const cached = readCache(cacheKey, this.data.isOffline ? 86400000 : 30000);
    if (cached && cached.profile) {
      this.setData({ ...cached, profile: decorateProfile(cached.profile) });
    }

    if (this.data.isOffline && cached) return;

    try {
      const [profile, notificationRes, qualRes] = await Promise.all([
        callBackend("getMyProfile", { forceRefresh: true }),
        callBackend("listMyNotifications"),
        callBackend("getQualificationStatus").catch(() => null),
      ]);
      const unreadNotificationCount = Number(notificationRes.unreadCount || 0);
      // 计算即将到期的资质数量
      let expiredQualCount = 0;
      if (qualRes && qualRes.list) {
        const me = qualRes.list.find(s => s.employeeNo === profile.employeeNo);
        if (me) {
          // 红点只提示已过期或 30 天内到期，与资质页的紧急预警口径一致。
          expiredQualCount = me.qualifications.filter(q => Number(q.daysLeft) <= 30).length;
        }
      }
      let profileQrDataUrl = "";
      try {
        const qrRes = await callBackend("generateMyProfileQrCode");
        profileQrDataUrl = qrRes.qrDataUrl || "";
      } catch (error) {}

      const displayProfile = decorateProfile(profile);
      this.setData({
        profile: displayProfile,
        profileQrDataUrl,
        isAdmin: !!profile.isAdmin,
        unreadNotificationCount,
        hasUnreadNotification: unreadNotificationCount > 0,
        expiredQualCount,
      });
      // 写入缓存
      writeCache(cacheKey, {
        profile: displayProfile,
        profileQrDataUrl,
        isAdmin: !!profile.isAdmin,
        unreadNotificationCount,
        hasUnreadNotification: unreadNotificationCount > 0,
        expiredQualCount,
      });
    } catch (error) {
      this.setData({
        profile: null,
        profileQrDataUrl: "",
        isAdmin: false,
        unreadNotificationCount: 0,
        hasUnreadNotification: false,
      });
    }
  },

  onShowQr() {
    this.setData({ qrModalVisible: true });
  },

  onCloseQrModal() {
    this.setData({ qrModalVisible: false });
  },

  onModalContentTap() {},

  async onChooseAvatar() {
    if (!this.data.profile) {
      wx.showToast({ title: "请先登录", icon: "none" });
      return;
    }

    let loadingShown = false;
    try {
      const chooseRes = await new Promise((resolve, reject) => {
        wx.chooseMedia({
          count: 1,
          mediaType: ["image"],
          sourceType: ["album", "camera"],
          success: resolve,
          fail: reject,
        });
      });

      const tempFilePath = (chooseRes.tempFiles && chooseRes.tempFiles[0] && chooseRes.tempFiles[0].tempFilePath) || "";
      if (!tempFilePath) return;

      const extMatch = tempFilePath.match(/\.[^./\\]+$/);
      const ext = extMatch ? extMatch[0] : ".jpg";
      const employeeNo = (this.data.profile && this.data.profile.employeeNo) || "staff";
      const cloudPath = `avatars/${employeeNo}_${Date.now()}${ext}`;

      wx.showLoading({ title: "上传中" });
      loadingShown = true;

      const uploadRes = await wx.cloud.uploadFile({
        cloudPath,
        filePath: tempFilePath,
      });

      const avatarRes = await callBackend("updateMyAvatar", {
        avatarFileID: uploadRes.fileID,
      });

      this.setData({
        profile: {
          ...(this.data.profile || {}),
          avatarFileID: avatarRes.avatarFileID || uploadRes.fileID,
        },
      });

      wx.showToast({ title: "头像已更新", icon: "success" });
    } catch (error) {
      if (!error || !String(error.errMsg || error.message || "").includes("cancel")) {
        wx.showToast({ title: "上传失败，请重试", icon: "none" });
      }
    } finally {
      if (loadingShown) wx.hideLoading();
    }
  },

  onGoLogin() {
    // 跳快速登录：优先手机号一键 / 微信资料，失败时页内兜底跳老表单
    wx.navigateTo({
      url: "/pages/quickLogin/index",
    });
  },

  onGoAdminCenter() {
    if (!this.data.isAdmin) {
      wx.showToast({ title: "仅管理员可进入", icon: "none" });
      return;
    }
    wx.navigateTo({ url: "/pages/adminCenter/index" });
  },

  onGoQualificationWarnings() {
    if (!this.data.profile) {
      wx.showToast({ title: "请先登录", icon: "none" });
      return;
    }
    wx.navigateTo({
      url: "/pages/qualificationWarnings/index",
    });
  },

  onGoSwapRequest() {
    wx.navigateTo({
      url: "/pages/swapRequest/index",
    });
  },

  onGoNotification() {
    if (!this.data.profile) {
      wx.showToast({ title: "请先登录", icon: "none" });
      return;
    }
    wx.navigateTo({
      url: "/pages/notification/index",
    });
  },

  onGoMySchedules() {
    wx.navigateTo({
      url: "/pages/mySchedules/index",
    });
  },

  async onLogout() {
    if (this.data.loggingOut) return;

    const res = await new Promise((resolve) => {
      wx.showModal({
        title: "确认退出",
        content: "退出登录后将清除当前账号绑定",
        confirmColor: "#ff4d5a",
        success: resolve,
      });
    });

    if (!res.confirm) return;

    this.setData({ loggingOut: true });
    wx.showLoading({ title: "退出中" });

    try {
      await callBackend("logoutStaff", {}, { silent: true });
      clearAllCache();
      wx.reLaunch({
        url: "/pages/quickLogin/index",
        success: () => wx.showToast({ title: "已退出登录", icon: "success" }),
        fail: () => wx.showToast({ title: "已退出，请重新进入", icon: "none" }),
      });
    } catch (error) {
      wx.showToast({ title: error.message || "退出失败", icon: "none" });
    } finally {
      this.setData({ loggingOut: false });
      wx.hideLoading();
    }
  },


  onGoLeave() {
    if (!this.data.profile) {
      wx.showToast({ title: "请先登录", icon: "none" });
      return;
    }
    wx.navigateTo({ url: "/pages/leave/index" });
  },

  onGoAssistant() {
    if (!this.data.profile) {
      wx.showToast({ title: "请先登录", icon: "none" });
      return;
    }
    wx.navigateTo({ url: "/pages/assistant/index" });
  },

  onGoBootstrapAdmin() {
    wx.navigateTo({ url: "/pages/bootstrapAdmin/index" });
  },

  onGoSettings() {
    if (!this.data.profile) {
      wx.showToast({ title: "请先登录", icon: "none" });
      return;
    }
    wx.navigateTo({
      url: "/pages/settings/index",
    });
  },
});
