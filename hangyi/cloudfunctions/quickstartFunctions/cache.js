/**
 * 内存缓存模块 - 利用云函数实例复用，加速频繁查询
 * 可平滑升级为 Redis（替换 store 实现即可）
 */

// 缓存存储 (实例级别，云函数热启动期间持续有效)
const store = new Map();

// 默认 TTL 配置（毫秒）
const DEFAULT_TTL = {
  STAFF_ALL: 30_000,           // 全员列表 30s
  STAFF_BY_ID: 60_000,         // 单人信息 60s
  SCHEDULE_TABLE: 15_000,      // 排班表 15s
  SETTINGS: 60_000,            // 配置 60s
  FLIGHT_LIST: 20_000,         // 航班列表 20s
  SWAP_REQUESTS: 15_000,       // 互换申请 15s
  STATS: 30_000,               // 统计数据 30s
  PROFILE: 60_000,             // 个人资料 60s
};

/**
 * 生成缓存 key
 */
const buildKey = (category, params = {}) => {
  const suffix = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return suffix ? `${category}:${suffix}` : category;
};

/**
 * 读取缓存
 * @returns {any|null} 缓存数据或 null（过期/不存在）
 */
const get = (category, params = {}) => {
  const key = buildKey(category, params);
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.data;
};

/**
 * 写入缓存
 * @param {number} [ttl] 自定义过期时间 (ms)，不传则用默认值
 */
const set = (category, params = {}, data, ttl) => {
  const key = buildKey(category, params);
  const ttlMs = ttl || DEFAULT_TTL[category] || 30_000;
  store.set(key, {
    data,
    expiresAt: Date.now() + ttlMs,
  });
};

/**
 * 删除指定分类缓存（数据变更后主动失效）
 */
const invalidate = (category, params = {}) => {
  if (params && Object.keys(params).length > 0) {
    // 精确删除
    store.delete(buildKey(category, params));
    return;
  }
  // 模糊删除该分类下所有缓存
  const prefix = `${category}:`;
  for (const key of store.keys()) {
    if (key === category || key.startsWith(prefix)) {
      store.delete(key);
    }
  }
};

/**
 * 获取缓存统计（调试用）
 */
const stats = () => {
  const entries = [];
  for (const [key, entry] of store.entries()) {
    entries.push({
      key,
      expiresAt: new Date(entry.expiresAt).toISOString(),
      ttl: Math.max(0, entry.expiresAt - Date.now()),
      size: JSON.stringify(entry.data).length,
    });
  }
  return {
    total: entries.length,
    entries,
  };
};

/**
 * 清空所有缓存
 */
const clear = () => {
  store.clear();
};

module.exports = {
  get,
  set,
  invalidate,
  stats,
  clear,
};