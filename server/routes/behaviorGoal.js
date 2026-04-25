const express = require('express');
const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const behaviorConfig = require('../data/behaviors.json');
const { getCurrentPeriodKey } = require('../utils/time');
const { getUserGoalsWithProgress } = require('../services/behaviorGoalService');

const router = express.Router();
router.use(authMiddleware);

const VALID_USER_STATUSES = new Set(['居家', '生病', '出差']);

function normalizeUserStatus(status) {
  return VALID_USER_STATUSES.has(status) ? status : '居家';
}

/**
 * 获取用户可用的所有行为子类型集合（含自定义行为）
 */
function getAllValidSubTypes(familyId, userStatus) {
  const validStatus = behaviorConfig.statuses.includes(userStatus) ? userStatus : '居家';
  const subTypes = new Set();

  for (const [, catConfig] of Object.entries(behaviorConfig.categories)) {
    const behaviors = catConfig[validStatus] || catConfig['居家'] || [];
    for (const b of behaviors) subTypes.add(b);
  }

  const customs = db.prepare(
    'SELECT name FROM custom_behaviors WHERE family_id = ?'
  ).all(familyId);
  for (const c of customs) subTypes.add(c.name);

  return subTypes;
}

// GET /api/behavior-goal/current — 获取当月所有目标及进度
router.get('/current', (req, res) => {
  res.json(getUserGoalsWithProgress(req.user.id));
});

// POST /api/behavior-goal — 创建或更新月度目标
router.post('/', (req, res) => {
  const { sub_type, target_count } = req.body;
  if (!sub_type || target_count === undefined || target_count === null) {
    return res.status(400).json({ error: '请填写行为类型和目标次数' });
  }

  const count = parseInt(target_count, 10);
  if (Number.isNaN(count) || count < 1 || count > 999) {
    return res.status(400).json({ error: '目标次数需在 1-999 之间' });
  }

  // 验证 sub_type 是否存在于用户可用的行为列表中
  const userRow = db.prepare('SELECT status FROM users WHERE id = ?').get(req.user.id);
  const userStatus = normalizeUserStatus(userRow?.status);
  const validSubTypes = getAllValidSubTypes(req.user.family_id, userStatus);
  if (!validSubTypes.has(sub_type)) {
    return res.status(400).json({ error: '无效的行为类型，请从行为列表中选择' });
  }

  const periodKey = getCurrentPeriodKey();
  db.prepare(`
    INSERT INTO behavior_goals (user_id, sub_type, target_count, period_key)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, sub_type, period_key) DO UPDATE SET
      target_count = excluded.target_count
  `).run(req.user.id, sub_type, count, periodKey);

  res.json({ success: true, sub_type, target_count: count, period_key: periodKey });
});

// DELETE /api/behavior-goal/:id — 删除目标
router.delete('/:id', (req, res) => {
  const goal = db.prepare('SELECT * FROM behavior_goals WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!goal) {
    return res.status(404).json({ error: '目标不存在' });
  }

  db.prepare('DELETE FROM behavior_goals WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
