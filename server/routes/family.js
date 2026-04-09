const express = require('express');
const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// GET /api/family/members — get family members with basic stats
router.get('/members', (req, res) => {
  const members = db.prepare(
    `SELECT u.id, u.name, c.realm_stage,
     c.physique, c.comprehension, c.willpower, c.dexterity, c.perception
     FROM users u JOIN characters c ON u.id = c.user_id
     WHERE u.family_id = ?`
  ).all(req.user.family_id);
  res.json(members);
});

// GET /api/family/feed — get recent family activity
router.get('/feed', (req, res) => {
  const feed = db.prepare(
    `SELECT b.id, b.category, b.sub_type, b.quality, b.completed_at, u.name as user_name,
     i.name as item_name
     FROM behaviors b
     JOIN users u ON b.user_id = u.id
     LEFT JOIN items i ON b.item_id = i.id
     WHERE u.family_id = ?
     ORDER BY b.completed_at DESC LIMIT 30`
  ).all(req.user.family_id);

  // V2-F06 FB-06 — 附加 reactions 汇总与当前用户已点表情
  const enriched = feed.map((f) => {
    const reactions = db.prepare(
      `SELECT emoji, COUNT(*) as count FROM behavior_reactions WHERE behavior_id = ? GROUP BY emoji`
    ).all(f.id);
    const myReactions = db.prepare(
      `SELECT emoji FROM behavior_reactions WHERE behavior_id = ? AND user_id = ?`
    ).all(f.id, req.user.id).map(r => r.emoji);
    return {
      ...f,
      reactions, // V2-F06 FB-06
      myReactions, // V2-F06 FB-06
    };
  });

  res.json(enriched);
});

// V2-F06 FB-06 — 表情互动
router.post('/react', (req, res) => {
  const { behavior_id, emoji } = req.body;
  const ALLOWED = ['👍', '💪', '📖', '✨'];

  if (!behavior_id || !ALLOWED.includes(emoji)) {
    return res.status(400).json({ error: '参数无效' });
  }

  // V2-F06 FB-06 - 外键约束保护，behavior_id 不存在时返回友好错误
  const behaviorExists = db.prepare('SELECT id FROM behaviors WHERE id = ? AND user_id IN (SELECT id FROM users WHERE family_id = ?)').get(behavior_id, req.user.family_id);
  if (!behaviorExists) {
    return res.status(404).json({ error: '行为记录不存在' });
  }

  db.prepare(
    `INSERT OR IGNORE INTO behavior_reactions (behavior_id, user_id, emoji)
     VALUES (?, ?, ?)`
  ).run(behavior_id, req.user.id, emoji);

  res.json({ ok: true });
});

module.exports = router;
