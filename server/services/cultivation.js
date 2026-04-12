const { db } = require('../db');

// 修炼状态定义（从高到低匹配）
const CULTIVATION_LEVELS = [
  { name: '精进', minDays: 6, minCategories: 3, dropBonus: 0.10, bufferAdjust: 0 },
  { name: '稳修', minDays: 4, minCategories: 0, dropBonus: 0, bufferAdjust: 0 },
  { name: '懈怠', minDays: 1, minCategories: 0, dropBonus: 0, bufferAdjust: -5 },
  { name: '停滞', minDays: 0, minCategories: 0, dropBonus: 0, bufferAdjust: -10 },
];

function getCultivationStatus(userId) {
  const rows = db.prepare(`
    SELECT DISTINCT date(completed_at, 'localtime') AS d, category
    FROM behaviors
    WHERE user_id = ?
      AND completed_at >= datetime('now', '-7 days')
  `).all(userId);

  const activeDays = new Set(rows.map(row => row.d)).size;
  const activeCategories = new Set(rows.map(row => row.category)).size;

  for (const level of CULTIVATION_LEVELS) {
    if (activeDays >= level.minDays && activeCategories >= level.minCategories) {
      return {
        level: level.name,
        activeDays,
        activeCategories,
        dropBonus: level.dropBonus,
        bufferAdjust: level.bufferAdjust,
      };
    }
  }

  return {
    level: '停滞',
    activeDays: 0,
    activeCategories: 0,
    dropBonus: 0,
    bufferAdjust: -10,
  };
}

module.exports = { getCultivationStatus, CULTIVATION_LEVELS };
