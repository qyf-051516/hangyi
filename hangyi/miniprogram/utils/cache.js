/**
 * 页面数据缓存 -- 本地存储 + TTL，即时展示 + 后台静默刷新
 */
const STORAGE_PREFIX = "data_cache_";

/**
 * 读缓存
 * @param {string} key
 * @param {number} maxAgeMs 最大有效期（毫秒），默认30秒
 * @returns {object|null} 缓存数据或 null
 */
const readCache = (key, maxAgeMs = 30000) => {
  try {
    const raw = wx.getStorageSync(STORAGE_PREFIX + key);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (Date.now() - (cached._ts || 0) > maxAgeMs) return null;
    return cached._data;
  } catch {
    return null;
  }
};

/**
 * 写缓存
 */
const writeCache = (key, data) => {
  try {
    wx.setStorageSync(STORAGE_PREFIX + key, JSON.stringify({ _data: data, _ts: Date.now() }));
  } catch {
    // 存储空间不足，忽略
  }
};

/**
 * 清除全部页面数据缓存。
 * 退出登录时必须调用，避免前一个账号的资料、管理员状态或助手记录继续显示。
 * 外观等非账号配置不使用此前缀，因此不会被误删。
 */
const clearAllCache = () => {
  let removed = 0;
  try {
    const storageInfo = wx.getStorageInfoSync();
    const keys = Array.isArray(storageInfo && storageInfo.keys) ? storageInfo.keys : [];
    keys.forEach((key) => {
      if (!String(key).startsWith(STORAGE_PREFIX)) return;
      try {
        wx.removeStorageSync(key);
        removed++;
      } catch {
        // 单项清理失败不阻塞其他缓存。
      }
    });
  } catch {
    // 无法读取本地存储时交给服务端会话状态兜底。
  }
  return removed;
};

module.exports = { readCache, writeCache, clearAllCache };
