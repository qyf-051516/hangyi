/**
 * 统一日期格式化工具
 * 消除各页面中 4 种不同风格的日期格式化重复代码。
 */

/**
 * 日期格式化为 YYYY-MM-DD
 * @param {Date|string|number} date
 * @returns {string}
 */
const formatDate = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/**
 * 获取今天的 YYYY-MM-DD
 * @returns {string}
 */
const todayStr = () => formatDate(new Date());

/**
 * 日期时间格式化为 YYYY-MM-DD HH:mm
 * @param {Date|string|number} date
 * @returns {string}
 */
const formatDateTime = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  const hh = `${d.getHours()}`.padStart(2, '0');
  const mm = `${d.getMinutes()}`.padStart(2, '0');
  return `${formatDate(d)} ${hh}:${mm}`;
};

/**
 * 仅格式化时间部分 HH:mm
 * @param {string|Date} dateStr - ISO 字符串或 Date 对象
 * @returns {string}
 */
const formatTimeOnly = (dateStr) => {
  if (!dateStr) return '';
  const d = dateStr instanceof Date ? dateStr : new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const hh = `${d.getHours()}`.padStart(2, '0');
  const mm = `${d.getMinutes()}`.padStart(2, '0');
  return `${hh}:${mm}`;
};

/**
 * 可读的相对时间（如 "3分钟前", "2小时前"）
 * @param {Date|string|number} date
 * @returns {string}
 */
const timeAgo = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return '刚刚';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}天前`;
  return formatDate(d);
};

/**
 * 填充数字到两位
 */
const pad2 = (n) => `${n}`.padStart(2, '0');

module.exports = {
  formatDate,
  todayStr,
  formatDateTime,
  formatTimeOnly,
  timeAgo,
  pad2,
};
