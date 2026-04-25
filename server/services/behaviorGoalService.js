/**
 * 月度目标查询服务 — character.js 和 behaviorGoal.js 共用
 *
 * 来源：session-2026-04-22 问题9
 */

const { db } = require('../db');
const { getCurrentPeriodKey, SQL_TZ } = require('../utils/time');

/**
 * 获取用户当月所有目标及进度
 * @param {number} userId
 * @returns {{ id, subType, targetCount, currentCount, periodKey, completed }[]}
 */
function getUserGoalsWithProgress(userId) {
  const periodKey = getCurrentPeriodKey();
  const goals = db.prepare(
    'SELECT * FROM behavior_goals WHERE user_id = ? AND period_key = ?'
  ).all(userId, periodKey);

  const monthStart = `${periodKey}-01`;
  const counts = db.prepare(`
    SELECT sub_type, COUNT(*) AS count
    FROM behaviors
    WHERE user_id = ?
      AND date(completed_at, '${SQL_TZ}') >= ?
      AND strftime('%Y-%m', completed_at, '${SQL_TZ}') = ?
    GROUP BY sub_type
  `).all(userId, monthStart, periodKey);

  const countMap = {};
  for (const row of counts) {
    countMap[row.sub_type] = row.count;
  }

  return goals.map(g => ({
    id: g.id,
    subType: g.sub_type,
    targetCount: g.target_count,
    currentCount: countMap[g.sub_type] || 0,
    periodKey: g.period_key,
    completed: (countMap[g.sub_type] || 0) >= g.target_count,
  }));
}

module.exports = { getUserGoalsWithProgress };
