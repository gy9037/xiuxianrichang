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

// GET /api/family/feed — get recent family activity (V2-F06 fix 批量查询 reactions)
router.get('/feed', (req, res) => {
  const feed = db.prepare(
    `SELECT b.id, b.category, b.sub_type, b.quality, b.completed_at, u.name as user_name,
     i.name as item_name
     FROM behaviors b
     JOIN users u ON b.user_id = u.id
     LEFT JOIN items i ON b.item_id = i.id
     WHERE u.family_id = ?
     ORDER BY b.completed_at DESC LIMIT 30`
  ).all(req.user.family_id); // V2-F06 fix

  if (feed.length === 0) return res.json([]); // V2-F06 fix

  const behaviorIds = feed.map(f => f.id); // V2-F06 fix
  const placeholders = behaviorIds.map(() => '?').join(','); // V2-F06 fix

  const reactionRows = db.prepare(
    `SELECT behavior_id, emoji, COUNT(*) as count
     FROM behavior_reactions
     WHERE behavior_id IN (${placeholders})
     GROUP BY behavior_id, emoji`
  ).all(...behaviorIds); // V2-F06 fix

  const myReactionRows = db.prepare(
    `SELECT behavior_id, emoji
     FROM behavior_reactions
     WHERE behavior_id IN (${placeholders}) AND user_id = ?`
  ).all(...behaviorIds, req.user.id); // V2-F06 fix

  const reactionsMap = {}; // V2-F06 fix
  for (const r of reactionRows) { // V2-F06 fix
    if (!reactionsMap[r.behavior_id]) reactionsMap[r.behavior_id] = []; // V2-F06 fix
    reactionsMap[r.behavior_id].push({ emoji: r.emoji, count: r.count }); // V2-F06 fix
  }

  const myReactionsSet = new Set( // V2-F06 fix
    myReactionRows.map(r => `${r.behavior_id}:${r.emoji}`) // V2-F06 fix
  );

  const enriched = feed.map(f => ({ // V2-F06 fix
    ...f,
    reactions: reactionsMap[f.id] || [], // V2-F06 fix
    myReactions: ['👍', '💪', '📖', '✨'].filter( // V2-F06 fix
      e => myReactionsSet.has(`${f.id}:${e}`) // V2-F06 fix
    ),
  }));

  res.json(enriched); // V2-F06 fix
});

// V2-F06 FB-06 — 表情互动（toggle：已存在则删除，不存在则插入）
router.post('/react', (req, res) => {
  const { behavior_id, emoji } = req.body; // V2-F06 fix
  const ALLOWED = ['👍', '💪', '📖', '✨']; // V2-F06 fix

  if (!behavior_id || !ALLOWED.includes(emoji)) { // V2-F06 fix
    return res.status(400).json({ error: '参数无效' });
  }

  const behaviorExists = db.prepare( // V2-F06 fix
    'SELECT id FROM behaviors WHERE id = ? AND user_id IN (SELECT id FROM users WHERE family_id = ?)'
  ).get(behavior_id, req.user.family_id); // V2-F06 fix
  if (!behaviorExists) {
    return res.status(404).json({ error: '行为记录不存在' }); // V2-F06 fix
  }

  const existing = db.prepare( // V2-F06 fix
    'SELECT id FROM behavior_reactions WHERE behavior_id = ? AND user_id = ? AND emoji = ?'
  ).get(behavior_id, req.user.id, emoji); // V2-F06 fix

  if (existing) {
    db.prepare('DELETE FROM behavior_reactions WHERE id = ?').run(existing.id); // V2-F06 fix
    return res.json({ action: 'removed', behavior_id, emoji }); // V2-F06 fix
  }

  db.prepare( // V2-F06 fix
    'INSERT INTO behavior_reactions (behavior_id, user_id, emoji) VALUES (?, ?, ?)'
  ).run(behavior_id, req.user.id, emoji); // V2-F06 fix
  return res.json({ action: 'added', behavior_id, emoji }); // V2-F06 fix
});

module.exports = router;
