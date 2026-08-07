/**
 * quickLogin - 一键登录入口
 * A: 手机号一键登录（open-type="getPhoneNumber"）
 * C: 微信资料登录（open-type="chooseAvatar" 拿头像，openid 拿身份）
 *
 * 兜底：仅验证已绑定当前微信的工号资料，不承担首次绑定。
 */
const { callBackend } = require("../../utils/api.js");
const { applyUiSettings } = require("../../utils/ui");
const { clearAllCache } = require("../../utils/cache");

// 是否开发者工具环境。模拟器不能完成部分微信授权时，只提供界面提示，
// 不注入手机号或员工身份。
function detectDevTool() {
  try {
    if (typeof wx === "undefined") return false;
    if (typeof wx.getDeviceInfo === "function") {
      return wx.getDeviceInfo().platform === "devtools";
    }
    if (typeof wx.getSystemInfoSync === "function") {
      return wx.getSystemInfoSync().platform === "devtools";
    }
    return false;
  } catch (e) {
    console.warn("[quickLogin] detectDevTool failed:", e && e.message);
    return false;
  }
}

Page({
  data: {
    phoneLoading: false,
    profileLoading: false,
  },

  onShow() {
    applyUiSettings(this);
  },

  // ──────────────────────────────────────────────
  // A: 手机号一键登录
  // 微信 open-type="getPhoneNumber" 的回调里：
  //   - detail.code: 微信生成的一次性动态码，必须由云端换取手机号
  // 开发者工具不能完成真实手机号授权，调试时使用工号登录。
  // ──────────────────────────────────────────────
  async onGetPhoneNumber(e) {
    const detail = e.detail || {};
    const errMsg = detail.errMsg || "";

    if (errMsg && errMsg !== "getPhoneNumber:ok") {
      wx.showModal({
        title: "需要手机号授权",
        content: detectDevTool()
          ? "开发者工具无法完成真实手机号授权。请使用已绑定账号辅助验证，或在真机完成手机号一键登录。"
          : "请授权本机手机号完成首次绑定；已绑定账号可使用辅助验证。",
        confirmText: "辅助验证",
        cancelText: "我知道了",
        success: (r) => {
          if (r.confirm) wx.navigateTo({ url: "/pages/auth/index" });
        },
      });
      return;
    }

    if (!detail.code) {
      wx.showModal({
        title: "授权凭证无效",
        content: "请升级微信后重试；已绑定账号可使用辅助验证。",
        confirmText: "辅助验证",
        cancelText: "我知道了",
        success: (r) => {
          if (r.confirm) wx.navigateTo({ url: "/pages/auth/index" });
        },
      });
      return;
    }

    return this._doPhoneLogin(detail.code);
  },

  _doPhoneLogin(phoneCode) {
    this.setData({ phoneLoading: true });
    wx.showLoading({ title: "登录中", mask: true });

    wx.cloud.callFunction({
      name: "quickstartFunctions",
      data: {
        type: "loginByPhone",
        data: { phoneCode },
      },
      success: (res) => {
        wx.hideLoading();
        const result = res.result || {};
        if (result.code === 0) {
          this._onLoginSuccess(result.data, "手机号");
        } else {
          const msg = result.message || "登录失败";
          if (result.data && result.data.code === "NOT_REGISTERED") {
            wx.showModal({
              title: "该手机号未登记",
              content: "请联系管理员同步员工档案后，使用本机手机号一键完成首次绑定。",
              confirmText: "辅助验证",
              cancelText: "取消",
              success: (r) => {
                if (r.confirm) wx.navigateTo({ url: "/pages/auth/index" });
              },
            });
          } else {
            wx.showToast({ title: msg, icon: "none" });
          }
        }
      },
      fail: (err) => {
        wx.hideLoading();
        wx.showToast({ title: err.errMsg || "网络异常", icon: "none" });
      },
      complete: () => {
        this.setData({ phoneLoading: false });
      },
    });
  },

  // ──────────────────────────────────────────────
  // C: 微信资料登录
  // 触发逻辑：用户点 chooseAvatar 按钮（新版必须用户主动触发拿头像）
  // 兜底策略：
  //   - 用户取消/没选头像 → 静默返回，不弹 toast
  //   - 头像拿不到 → 仍允许走 openid 登录，头像是次要的
  //   - macOS 模拟器/某些基础库 chooseAvatar 弹窗可能不出现 → 也不阻塞
  //   - 拿不到昵称 → 仍允许登录，只是不更新昵称字段
  // ──────────────────────────────────────────────
  async onChooseAvatar(e) {
    // 注意：macOS 开发者工具里 chooseAvatar 弹窗可能根本不出现，会直接触发 fail。
    // 我们的策略是：不管头像成不成功，都允许用 openid 走微信资料登录。
    const avatarUrl = (e.detail && e.detail.avatarUrl) || "";

    this.setData({ profileLoading: true });
    wx.showLoading({ title: "登录中", mask: true });

    // 拿昵称（getUserProfile 也得用户点确认）
    let nickName = "";
    // 开发者工具下 getUserProfile 也弹不出, 直接给个默认昵称联调
    if (detectDevTool()) {
      wx.showToast({ title: "开发者工具: 跳过头像/昵称", icon: "none", duration: 2000 });
      nickName = "开发联调";
    } else {
      try {
        const profileRes = await new Promise((resolve, reject) => {
          wx.getUserProfile({
            desc: "用于完善个人资料",
            success: resolve,
            fail: reject,
          });
        });
        nickName = (profileRes.userInfo && profileRes.userInfo.nickName) || "";
      } catch (_) {
        // 用户拒绝给昵称: 提示仅验证身份, 仍允许继续登录(不更新昵称)
        wx.showToast({
          title: "未获取到微信昵称/头像，仅验证身份，不更新个人资料",
          icon: "none",
          duration: 2000,
        });
        nickName = "";
      }
    }

    try {
      await callBackend("loginByWechatProfile", {
        nickName,
        avatarUrl,
      });
      wx.hideLoading();
      this.setData({ profileLoading: false });
      this._onLoginSuccess({ nickName }, "微信");
    } catch (err) {
      wx.hideLoading();
      this.setData({ profileLoading: false });
      if (err.data && err.data.code === "NOT_REGISTERED") {
        wx.showModal({
          title: "当前微信未绑定员工",
          content: "首次使用请通过本机手机号一键完成绑定；之后可一键微信登录。",
          confirmText: "辅助验证",
          cancelText: "取消",
          success: (r) => {
            if (r.confirm) wx.navigateTo({ url: "/pages/auth/index" });
          },
        });
      } else {
        wx.showToast({ title: err.message || "登录失败", icon: "none" });
      }
    }
  },

  // ──────────────────────────────────────────────
  // 兜底：仅验证已经绑定当前微信的账号
  // ──────────────────────────────────────────────
  onGoLegacyLogin() {
    wx.navigateTo({ url: "/pages/auth/index" });
  },

  // ──────────────────────────────────────────────
  // 登录成功：清理上一账号缓存并直接进入“我的”页
  // ──────────────────────────────────────────────
  _onLoginSuccess(_data, _via) {
    wx.showToast({ title: "登录成功", icon: "success" });
    clearAllCache();
    wx.switchTab({ url: "/pages/mine/index" });
  },
});
