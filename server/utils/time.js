/**
 * 统一时区工具 — 所有 UTC+8 时间逻辑的唯一入口
 *
 * JS 层：用 getTime() + 8h 偏移量，配合 getUTC* 方法取年月日
 * SQL 层：统一用 datetime/date/strftime 的 '+8 hours' 修饰符
 *         （不用 'localtime'，避免依赖服务器时区设置）
 *
 * 来源：session-2026-04-22 问题7
 */

const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * 获取当前 UTC+8 的 Date 对象（内部用 UTC 方法读取年月日）
 */
function nowUTC8() {
  return new Date(Date.now() + UTC8_OFFSET_MS);
}

/**
 * 格式化为 YYYY-MM-DD
 * @param {Date} d — 已偏移到 UTC+8 的 Date（用 getUTC* 读取）
 */
function formatDate(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 获取当前 UTC+8 日期字符串 YYYY-MM-DD
 */
function getTodayUTC8() {
  return formatDate(nowUTC8());
}

/**
 * 获取当前 UTC+8 月份键 YYYY-MM
 */
function getCurrentPeriodKey() {
  const d = nowUTC8();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * SQL 时区修饰符常量
 * 用法：在 SQL 中用 date(col, SQL_TZ) 或 strftime('%Y-%m', col, SQL_TZ)
 * 替代之前散落各处的 'localtime'
 */
const SQL_TZ = '+8 hours';

module.exports = {
  UTC8_OFFSET_MS,
  nowUTC8,
  formatDate,
  getTodayUTC8,
  getCurrentPeriodKey,
  SQL_TZ,
};
