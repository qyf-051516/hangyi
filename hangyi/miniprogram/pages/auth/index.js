const { callBackend } = require("../../utils/api.js");
const { applyUiSettings } = require("../../utils/ui");
const { clearAllCache } = require("../../utils/cache");

Page({
  data: {
    employeeNo: "",
    name: "",
    phone: "",
    submitting: false,
  },

  onShow() {
    applyUiSettings(this);
  },

  onInputEmployeeNo: function (e) {
    this.setData({ employeeNo: String(e.detail.value || "").trim() });
  },

  onInputName: function (e) {
    this.setData({ name: String(e.detail.value || "").trim() });
  },

  onInputPhone: function (e) {
    this.setData({ phone: String(e.detail.value || "").trim().replace(/\s/g, "") });
  },

  async onSubmit() {
    if (this.data.submitting) return;

    var employeeNo = String(this.data.employeeNo || "").trim().toUpperCase();
    var name = String(this.data.name || "").trim();
    var phone = String(this.data.phone || "").trim();

    if (!employeeNo) {
      wx.showToast({ title: "请输入工号", icon: "none" });
      return;
    }
    if (!name) {
      wx.showToast({ title: "请输入姓名", icon: "none" });
      return;
    }
    if (!phone) {
      wx.showToast({ title: "请输入电话号码", icon: "none" });
      return;
    }
    if (!/^1\d{10}$/.test(phone)) {
      wx.showToast({ title: "电话号码格式不正确", icon: "none" });
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: "提交中" });

    try {
      await callBackend("loginOrRegisterStaff", {
        employeeNo: employeeNo,
        name: name,
        phone: phone,
      });
      wx.showToast({ title: "登录成功", icon: "success" });
      clearAllCache();
      setTimeout(function () {
        wx.switchTab({ url: "/pages/mine/index" });
      }, 300);
    } catch (error) {
      wx.showToast({ title: error.message || "提交失败", icon: "none" });
    } finally {
      this.setData({ submitting: false });
      wx.hideLoading();
    }
  },
});
