const express = require('express');
const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { checkPromotion, getTotalAttrs, getRealmByName } = require('../services/realm');
const { calculateDecay, getDecayStatus } = require('../services/decay');

const router = express.Router();
router.use(authMiddleware);
const ATTR_FIELDS = ['physique', 'comprehension', 'willpower', 'dexterity', 'perception'];
const TAG_PRESETS = ['慢性病', '发育期', '熬夜习惯', '久坐', '学业压力'];
const SAFE_ATTR_FIELD_SET = new Set(ATTR_FIELDS);

function parseTags(rawTags) {
  try {
    const parsed = JSON.parse(rawTags || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getRecentTrend(userId) {
  const formatDate = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const now = new Date();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(formatDate(d));
  }

  const byAttribute = {};
  for (const attr of ATTR_FIELDS) {
    byAttribute[attr] = {
      counts: new Array(7).fill(0),
      tempValues: new Array(7).fill(0),
    };
  }

  const rows = db.prepare(
    `SELECT date(b.completed_at, 'localtime') AS day,
     i.attribute_type AS attribute_type,
     COUNT(*) AS count,
     COALESCE(SUM(i.temp_value), 0) AS temp_value
     FROM behaviors b
     JOIN items i ON i.id = b.item_id
     WHERE b.user_id = ? AND b.completed_at >= datetime('now', '-6 days')
     GROUP BY day, i.attribute_type`
  ).all(userId);

  for (const row of rows) {
    const idx = days.indexOf(row.day);
    if (idx < 0 || !byAttribute[row.attribute_type]) continue;
    byAttribute[row.attribute_type].counts[idx] = row.count;
    byAttribute[row.attribute_type].tempValues[idx] = Math.round(row.temp_value * 10) / 10;
  }

  return { days, byAttribute };
}

// GET /api/character — get current user's character
router.get('/', (req, res) => {
  const character = db.prepare(
    `SELECT c.*, u.tags
     FROM characters c JOIN users u ON c.user_id = u.id
     WHERE c.user_id = ?`
  ).get(req.user.id);
  if (!character) return res.status(404).json({ error: '角色不存在' });

  // V2-F04 FB-03 - 获取用户状态传入衰退计算
  const userRow = db.prepare('SELECT status FROM users WHERE id = ?').get(req.user.id);
  // V2-F04 FB-03
  const userStatus = userRow?.status || '正常';

  // Apply decay
  const { updates, hasDecay } = calculateDecay(character, new Date(), userStatus); // V2-F04 FB-03
  if (hasDecay) {
    const safeEntries = Object.entries(updates).filter(([k]) => SAFE_ATTR_FIELD_SET.has(k));
    if (safeEntries.length > 0) {
      const sets = safeEntries.map(([k]) => `${k} = ?`).join(', ');
      const values = safeEntries.map(([, v]) => v);
      db.prepare(`UPDATE characters SET ${sets} WHERE id = ?`).run(...values, character.id);
      Object.assign(character, Object.fromEntries(safeEntries));
    }
  }

  const realm = getRealmByName(character.realm_stage);
  const promotion = checkPromotion(character);
  const decayStatus = getDecayStatus(character, new Date(), userStatus); // V2-F04 FB-03
  const tags = parseTags(character.tags);
  const trend = getRecentTrend(req.user.id);

  res.json({
    character: {
      id: character.id,
      physique: character.physique,
      comprehension: character.comprehension,
      willpower: character.willpower,
      dexterity: character.dexterity,
      perception: character.perception,
      realm_stage: character.realm_stage,
      attr_cap: realm ? realm.attrCap : 3,
      total_attrs: getTotalAttrs(character),
      status: userStatus, // V2-F04 FB-03 - 返回用户状态
    },
    tags,
    trend,
    promotion,
    decayStatus,
  });
});

// GET /api/character/tags — get user tags
router.get('/tags', (req, res) => {
  const row = db.prepare('SELECT tags FROM users WHERE id = ?').get(req.user.id);
  if (!row) return res.status(404).json({ error: '用户不存在' });

  res.json({
    tags: parseTags(row.tags),
    presets: TAG_PRESETS,
  });
});

// PUT /api/character/tags — update user tags
router.put('/tags', (req, res) => {
  const { tags } = req.body;
  if (!Array.isArray(tags)) {
    return res.status(400).json({ error: 'tags 必须是数组' });
  }

  const normalized = [...new Set(
    tags
      .map(tag => String(tag || '').trim())
      .filter(Boolean)
  )].slice(0, 10);

  db.prepare('UPDATE users SET tags = ? WHERE id = ?').run(JSON.stringify(normalized), req.user.id);
  res.json({ success: true, tags: normalized, presets: TAG_PRESETS });
});

// GET /api/character/trend — get recent 7-day trend
router.get('/trend', (req, res) => {
  res.json(getRecentTrend(req.user.id));
});

// V2-F04 FB-03 - 切换用户状态
router.post('/status', (req, res) => {
  const { status } = req.body;
  const VALID_STATUSES = ['正常', '生病', '出差', '休假'];
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: '无效的状态，可选：正常/生病/出差/休假' });
  }
  db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, req.user.id);
  res.json({ success: true, status });
});

// POST /api/character/promote — attempt realm promotion
router.post('/promote', (req, res) => {
  const character = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.user.id);
  if (!character) return res.status(404).json({ error: '角色不存在' });

  const result = checkPromotion(character);
  if (!result.canPromote) {
    return res.status(400).json({ error: result.reason });
  }

  db.prepare('UPDATE characters SET realm_stage = ? WHERE id = ?').run(result.nextRealm, character.id);
  res.json({ success: true, newRealm: result.nextRealm, message: `恭喜突破至${result.nextRealm}！` });
});

module.exports = router;
