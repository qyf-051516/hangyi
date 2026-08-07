// app.js
App({
  onLaunch: function () {
    this.globalData = {
      // env 参数说明：
      // env 参数决定接下来小程序发起的云开发调用（wx.cloud.xxx）会请求到哪个云环境的资源
      // 此处请填入环境 ID, 环境 ID 可在微信开发者工具右上顶部工具栏点击云开发按钮打开获取
      env: "cloud1-9gayi6o47d35ea3b",
      isConnected: true,
      networkType: "unknown",
    };
    if (!wx.cloud) {
      console.error("请使用 2.2.3 或以上的基础库以使用云能力");
    } else {
      wx.cloud.init({
        env: this.globalData.env,
        traceUser: true,
      });
    }
    this.startNetworkMonitor();
  },

  startNetworkMonitor() {
    wx.getNetworkType({
      success: (res) => {
        this.globalData.isConnected = res.networkType !== "none";
        this.globalData.networkType = res.networkType;
      },
    });
    wx.onNetworkStatusChange((res) => {
      this.globalData.isConnected = res.isConnected;
      this.globalData.networkType = res.networkType;
    });
  },

  onError(error) {
    console.error("全局异常捕获:", error);
  },

  onUnhandledRejection(res) {
    console.error("未处理的 Promise 拒绝:", res.reason);
  },

  onPageNotFound(res) {
    wx.redirectTo({
      url: "/pages/index/index",
      fail() {
        wx.switchTab({ url: "/pages/index/index" });
      },
    });
  },
});
