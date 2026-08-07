/**
 * 统一云函数调用封装
 * 所有页面共用同一份 wx.cloud.callFunction 调用逻辑，
 * 消除 18 个页面中的重复样板代码。
 */

/**
 * 调用云函数
 * @param {string} type - 操作类型（对应云函数 exports.main 的 event.type）
 * @param {object} data - 请求参数
 * @param {object} [options] - 可选配置
 * @param {boolean} [options.showLoading=false] - 是否自动显示 loading
 * @param {string} [options.loadingText='加载中...'] - loading 文案
 * @param {boolean} [options.silent=false] - 静默模式（不弹错误提示）
 * @returns {Promise<object>} 云函数返回的 data 字段
 */
const callBackend = (type, data = {}, options = {}) => {
  const { showLoading = false, loadingText = '加载中...', silent = false } = options;

  if (showLoading) {
    wx.showLoading({ title: loadingText, mask: true });
  }

  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'quickstartFunctions',
      data: { type, data },
      success: (res) => {
        if (showLoading) wx.hideLoading();
        const result = res.result || {};
        if (result.code === 0) {
          resolve(result.data);
        } else {
          const msg = result.message || '请求失败';
          if (!silent) wx.showToast({ title: msg, icon: 'none' });
          // P3 修复: 把业务码也挂到 error 上, 让 catch 端能区分 (401 鉴权失败 vs 404 资源不存在 等)
          const err = new Error(msg);
          err.code = result.code;
          err.data = result.data;
          reject(err);
        }
      },
      fail: (err) => {
        if (showLoading) wx.hideLoading();
        const msg = err.errMsg || '网络异常';
        if (!silent) wx.showToast({ title: msg, icon: 'none' });
        reject(new Error(msg));
      },
    });
  });
};

module.exports = { callBackend };
