// 班组映射：兼容中文名（"A组"）和下划线格式（"group_a"）
const GROUP_LABEL_MAP = {
  "A组": "A组", group_a: "A组",
  "B组": "B组", group_b: "B组",
  "C组": "C组", group_c: "C组",
  "D组": "D组", group_d: "D组",
  "E组": "E组", group_e: "E组",
  "F组": "F组", group_f: "F组",
  "G组": "G组", group_g: "G组",
  "H组": "H组", group_h: "H组",
};

const groupLabel = (raw) => GROUP_LABEL_MAP[raw] || raw || "-";

const THEME_STYLE_MAP = {
  light: {
    navigationBarBackgroundColor: "#f3f8fe",
    navigationBarTextStyle: "black",
    backgroundColor: "#eef5fd",
    tabBarColor: "#8b9bb0",
    tabBarSelectedColor: "#1178ee",
    tabBarBackgroundColor: "#ffffff",
    tabBarBorderStyle: "white",
  },
  dark: {
    navigationBarBackgroundColor: "#0a1b33",
    navigationBarTextStyle: "white",
    backgroundColor: "#071429",
    tabBarColor: "#84a6d8",
    tabBarSelectedColor: "#37e2ff",
    tabBarBackgroundColor: "#08162d",
    tabBarBorderStyle: "black",
  },
};

const normalizeTheme = (theme) => {
  if (theme === "dark") return "dark";
  // 默认浅色主题
  return "light";
};

const getUiSettings = () => {
  const theme = normalizeTheme(wx.getStorageSync("ui_theme"));
  return {
    theme,
    themeClass: theme === "light" ? "theme-light" : "theme-dark",
  };
};

const applySystemTheme = (theme) => {
  const nextTheme = normalizeTheme(theme);
  const style = THEME_STYLE_MAP[nextTheme];

  if (wx.setNavigationBarColor) {
    wx.setNavigationBarColor({
      frontColor: style.navigationBarTextStyle === "black" ? "#000000" : "#ffffff",
      backgroundColor: style.navigationBarBackgroundColor,
      animation: {
        duration: 180,
        timingFunc: "easeIn",
      },
      fail: (err) => {
        console.warn("[ui] setNavigationBarColor failed:", (err && (err.errMsg || err.message)) || err);
      },
    });
  }

  if (wx.setBackgroundColor) {
    wx.setBackgroundColor({
      backgroundColor: style.backgroundColor,
      backgroundColorTop: style.backgroundColor,
      backgroundColorBottom: style.backgroundColor,
      fail: (err) => {
        console.warn("[ui] setBackgroundColor failed:", (err && (err.errMsg || err.message)) || err);
      },
    });
  }

  if (wx.setTabBarStyle) {
    wx.setTabBarStyle({
      color: style.tabBarColor,
      selectedColor: style.tabBarSelectedColor,
      backgroundColor: style.tabBarBackgroundColor,
      borderStyle: style.tabBarBorderStyle,
      fail: (err) => {
        console.warn("[ui] setTabBarStyle failed:", (err && (err.errMsg || err.message)) || err);
      },
    });
  }
};

const applyUiSettings = (ctx) => {
  const ui = getUiSettings();
  if (ctx && typeof ctx.setData === "function") {
    ctx.setData(ui);
  }
  applySystemTheme(ui.theme);
  return ui;
};

// 读取当前主题版本号(由 setUiTheme 每次切换时 +1)。
// tabBar 页在 onShow 中检测版本变化, 主题在设置页切换后已打开页面也会重新应用。
const getThemeVersion = () => {
  try {
    const app = getApp();
    return (app && app.globalData && Number(app.globalData.themeVersion)) || 0;
  } catch {
    return 0;
  }
};

// tabBar 页 onShow 专用: 仅当主题版本发生变化时才重新应用 UI 配置,
// 避免已打开页面在设置页切换主题后仍然停留在旧主题。
const applyUiIfThemeChanged = (ctx) => {
  const version = getThemeVersion();
  if (ctx._themeVersionInitialized !== true || version !== ctx._lastThemeVersion) {
    ctx._themeVersionInitialized = true;
    ctx._lastThemeVersion = version;
    return applyUiSettings(ctx);
  }
  return getUiSettings();
};

const setUiTheme = (theme, ctx) => {
  const nextTheme = normalizeTheme(theme);
  wx.setStorageSync("ui_theme", nextTheme);
  // 主题版本号 +1, 已打开的 tabBar 页在 onShow 时据此检测并重新应用
  try {
    const app = getApp();
    if (app && app.globalData) {
      app.globalData.themeVersion = (Number(app.globalData.themeVersion) || 0) + 1;
    }
  } catch (e) {
    console.warn("[ui] setUiTheme bump themeVersion failed:", e && e.message);
  }
  const ui = {
    theme: nextTheme,
    themeClass: nextTheme === "light" ? "theme-light" : "theme-dark",
  };
  if (ctx && typeof ctx.setData === "function") {
    ctx.setData(ui);
  }
  applySystemTheme(nextTheme);
  return ui;
};

// ═══ 管理员身份缓存 (5 分钟) ═══
// 各页面 onShow 时调用, 普通员工相关 admin UI 自动隐藏
let _adminCache = { openid: null, isAdmin: false, ts: 0 };
const ADMIN_TTL_MS = 5 * 60 * 1000;

const { callBackend } = require("./api");

// 拉一次 (含缓存): 普通用户场景下, mine 加载过, 其他页面复用
const loadIsAdmin = async (forceRefresh = false) => {
  const { readCache, writeCache } = require("./cache");
  const cached = readCache("isAdmin", ADMIN_TTL_MS);
  if (!forceRefresh && cached !== null) return cached;
  try {
    const profile = await callBackend("getMyProfile", {
      forceRefresh: forceRefresh === true,
    });
    const isAdmin = !!(profile && profile.isAdmin);
    writeCache("isAdmin", isAdmin);
    return isAdmin;
  } catch {
    return false;
  }
};

// 拉一次角色 (含缓存): 返回 { isAdmin, isBoss }, 复用与 loadIsAdmin 相同的
// getMyProfile 缓存机制。admin 权限是 isAdmin 缓存真子集, 同步回写保持兼容。
const loadRole = async (forceRefresh = false) => {
  const { readCache, writeCache } = require("./cache");
  const cached = readCache("role", ADMIN_TTL_MS);
  if (!forceRefresh && cached !== null) return cached;
  try {
    const profile = await callBackend("getMyProfile", {
      forceRefresh: forceRefresh === true,
    });
    const role = {
      isAdmin: !!(profile && profile.isAdmin),
      isBoss: !!(profile && profile.isBoss),
    };
    writeCache("role", role);
    writeCache("isAdmin", role.isAdmin);
    return role;
  } catch {
    return { isAdmin: false, isBoss: false };
  }
};

// 同步版本: 读已加载的角色缓存 (未命中或异常时返回兜底, 调用方要 fallback 异步)
const getCachedRole = () => {
  const { readCache } = require("./cache");
  const role = readCache("role", ADMIN_TTL_MS);
  if (role && typeof role === "object" && typeof role.isAdmin === "boolean") {
    return { isAdmin: role.isAdmin, isBoss: role.isBoss === true };
  }
  const isAdmin = readCache("isAdmin", ADMIN_TTL_MS);
  if (isAdmin !== null) return { isAdmin: isAdmin === true, isBoss: false };
  return { isAdmin: false, isBoss: false };
};

// 同步版本: 读已加载的缓存 (可能返回 false, 调用方要 fallback 异步)
const readIsAdminCache = () => {
  const { readCache } = require("./cache");
  const v = readCache("isAdmin", ADMIN_TTL_MS);
  return v === true;
};

const clearIsAdminCache = () => {
  const { writeCache } = require("./cache");
  writeCache("isAdmin", false);
};

module.exports = {
  getUiSettings,
  applyUiSettings,
  applyUiIfThemeChanged,
  setUiTheme,
  groupLabel,
  loadIsAdmin,
  loadRole,
  getCachedRole,
  readIsAdminCache,
  clearIsAdminCache,
};
