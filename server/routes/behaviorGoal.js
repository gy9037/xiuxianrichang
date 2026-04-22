const express = require('express');
const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

function getCurrentPeriodKey() {
  const now = new Date();
  const utc8 = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return `${utc8.getUTCFullYear()}-${String(utc8.getUTCMonth() + 1).padStart(2, '0')}`;
}

// GET /api/behavior-goal/current — 获取当月所有目标及进度
router.get('/current', (req, res) => {
  const periodKey = getCurrentPeriodKey();
  const goals = db.prepare(
    'SELECT * FROM behavior_goals WHERE user_id = ? AND period_key = ?'
  ).all(req.user.id, periodKey);

  const monthStart = `${periodKey}-01`;
  const counts = db.prepare(`
    SELECT sub_type, COUNT(*) AS count
    FROM behaviors
    WHERE user_id = ?
      AND date(completed_at, 'localtime') >= ?
      AND strftime('%Y-%m', completed_at, 'localtime') = ?
    GROUP BY sub_type
  `).all(req.user.id, monthStart, periodKey);

  const countMap = {};
  for (const row of counts) {
    countMap[row.sub_type] = row.count;
  }

  const result = goals.map(g => ({
    id: g.id,
    subType: g.sub_type,
    targetCount: g.target_count,
    currentCount: countMap[g.sub_type] || 0,
    periodKey: g.period_key,
    completed: (countMap[g.sub_type] || 0) >= g.target_count,
  }));

  res.json(result);
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
