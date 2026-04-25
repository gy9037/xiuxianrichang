const express = require('express');
const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { checkPromotion, getTotalAttrs, getRealmByName } = require('../services/realm');
const { calculateDecay, getDecayStatus } = require('../services/decay');
const { getCultivationStatus } = require('../services/cultivation');
const { getCheckinStatus } = require('../services/checkinService');
const behaviorConfig = require('../data/behaviors.json');
const { SQL_TZ } = require('../utils/time');
const { getUserGoalsWithProgress } = require('../services/behaviorGoalService');
const pkg = require('../../package.json');

const router = express.Router();
router.use(authMiddleware);
const VALID_USER_STATUSES = new Set(['居家', '生病', '出差']);
const ATTR_FIELDS = ['physique', 'comprehension', 'willpower', 'dexterity', 'perception'];
// V2-F10 — 成就定义（硬编码，无需数据库表）
const ACHIEVEMENTS = [
  { id: 'first_behavior', name: '初入修仙', desc: '完成第一次行为上报', icon: '🌱' },
  { id: 'first_boss_win', name: '斩妖除魔', desc: '第一次打赢Boss', icon: '⚔️' },
  { id: 'streak_7', name: '七日不辍', desc: '任意行为连续打卡7天', icon: '🔥' },
  { id: 'attr_10', name: '小有所成', desc: '任意属性达到10点', icon: '💫' },
  { id: 'realm_up', name: '境界突破', desc: '完成第一次境界突破', icon: '🌟' },
  { id: 'items_50', name: '道具收藏家', desc: '累计获得50个道具', icon: '🎒' },
];
const TAG_PRESETS = ['慢性病', '发育期', '熬夜习惯', '久坐', '学业压力'];
const SAFE_ATTR_FIELD_SET = new Set(ATTR_FIELDS);

function getMergedBehaviorData(familyId, userStatus = '居家') {
  const validStatus = behaviorConfig.statuses.includes(userStatus) ? userStatus : '居家';
  const result = {};
  for (const [category, catConfig] of Object.entries(behaviorConfig.categories)) {
    result[category] = [...(catConfig[validStatus] || catConfig['居家'] || [])];
  }
  const customs = db.prepare(
    'SELECT category, name FROM custom_behaviors WHERE family_id = ? ORDER BY created_at ASC'
  ).all(familyId);
  for (const custom of customs) {
    if (!result[custom.category]) result[custom.category] = [];
    if (!result[custom.category].includes(custom.name)) {
      result[custom.category].push(custom.name);
    }
  }
  for (const [category, list] of Object.entries(result)) {
    if (list.length === 0) delete result[category];
  }
  return result;
}

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
    `SELECT date(b.completed_at, '${SQL_TZ}') AS day,
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

function withNextLevelHint(status) {
  let nextLevelHint = null;
  if (status.level === '停滞') {
    nextLevelHint = '上报 1 次行为即可脱离停滞';
  } else if (status.level === '懈怠') {
    const needDays = Math.max(0, 4 - status.activeDays);
    nextLevelHint = needDays > 0 ? `再活跃 ${needDays} 天即可达到稳修` : null;
  } else if (status.level === '稳修') {
    const needDays = Math.max(0, 6 - status.activeDays);
    const needCats = Math.max(0, 3 - status.activeCategories);
    const hints = [];
    if (needDays > 0) hints.push(`再活跃 ${needDays} 天`);
    if (needCats > 0) hints.push(`再覆盖 ${needCats} 个类别`);
    nextLevelHint = hints.length > 0 ? `${hints.join('，')}即可达到精进` : null;
  }
  return { ...status, nextLevelHint };
}

function normalizeUserStatus(status) {
  return VALID_USER_STATUSES.has(status) ? status : '居家';
}

// GET /api/character — get current user's character
router.get('/', (req, res) => {
  const character = db.prepare(
    `SELECT c.*, u.tags, u.avatar, u.spirit_stones
     FROM characters c JOIN users u ON c.user_id = u.id
     WHERE c.user_id = ?`
  ).get(req.user.id);
  if (!character) return res.status(404).json({ error: '角色不存在' });

  // V2-F04 FB-03 - 获取用户状态传入衰退计算
  const userRow = db.prepare('SELECT status FROM users WHERE id = ?').get(req.user.id);
  const userStatus = normalizeUserStatus(userRow?.status);
  const cultivationStatus = withNextLevelHint(getCultivationStatus(req.user.id));

  // Apply decay
  const { updates, hasDecay } = calculateDecay(character, new Date(), userStatus, cultivationStatus.bufferAdjust);
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
  const decayStatus = getDecayStatus(character, new Date(), userStatus, cultivationStatus.bufferAdjust);
  const tags = parseTags(character.tags);
  const trend = getRecentTrend(req.user.id);
  const checkinStatus = getCheckinStatus(req.user.id);
  const spiritStones = Number(character.spirit_stones || 0);
  let pinnedBehaviors = [];
  try {
    pinnedBehaviors = JSON.parse(character.pinned_behaviors || '[]');
  } catch (e) {
    pinnedBehaviors = [];
  }

  const behaviorGoals = getUserGoalsWithProgress(req.user.id);

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
      status: userStatus,
      avatar: character.avatar || '',
    },
    tags,
    trend,
    promotion,
    decayStatus,
    cultivationStatus,
    spiritStones,
    checkinStatus,
    pinnedBehaviors,
    behaviorGoals,
    appVersion: pkg.version,
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
  const VALID_STATUSES = ['居家', '生病', '出差'];
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: '无效的状态，可选：居家/生病/出差' });
  }
  db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, req.user.id);
  res.json({ success: true, status });
});

// PATCH /api/character/pin-behavior — 更新置顶行为
router.patch('/pin-behavior', (req, res) => {
  const { pinnedBehaviors } = req.body;

  if (!Array.isArray(pinnedBehaviors)) {
    return res.status(400).json({ error: 'pinnedBehaviors 必须是数组' });
  }
  if (pinnedBehaviors.length > 2) {
    return res.status(400).json({ error: '最多置顶 2 个行为' });
  }

  // 验证每项行为是否真实存在
  const userRow = db.prepare('SELECT status FROM users WHERE id = ?').get(req.user.id);
  const userStatus = normalizeUserStatus(userRow?.status);
  const mergedData = getMergedBehaviorData(req.user.family_id, userStatus);

  for (const item of pinnedBehaviors) {
    if (!item.category || !item.sub_type) {
      return res.status(400).json({ error: '每项需包含 category 和 sub_type' });
    }
    const list = mergedData[item.category];
    if (!Array.isArray(list) || !list.includes(item.sub_type)) {
      return res.status(400).json({ error: `行为「${item.category} - ${item.sub_type}」不存在` });
    }
  }

  db.prepare('UPDATE characters SET pinned_behaviors = ? WHERE user_id = ?')
    .run(JSON.stringify(pinnedBehaviors), req.user.id);

  res.json({ pinnedBehaviors });
});

router.get('/cultivation-status', (req, res) => {
  const status = withNextLevelHint(getCultivationStatus(req.user.id));
  res.json(status);
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

// V2-F10 — GET /api/character/achievements
router.get('/achievements', (req, res) => {
  const userId = req.user.id;

  const behaviorCount = db.prepare(
    'SELECT COUNT(*) AS cnt FROM behaviors WHERE user_id = ?'
  ).get(userId).cnt;

  const bossWinCount = db.prepare(
    "SELECT COUNT(*) AS cnt FROM battles WHERE user_id = ? AND result = 'win'"
  ).get(userId).cnt;

  const maxStreak = db.prepare(
    'SELECT MAX(current_streak) AS ms FROM streaks WHERE user_id = ?'
  ).get(userId).ms || 0;

  const character = db.prepare(
    'SELECT physique, comprehension, willpower, dexterity, perception, realm_stage FROM characters WHERE user_id = ?'
  ).get(userId);

  const itemCount = db.prepare(
    'SELECT COUNT(*) AS cnt FROM items WHERE user_id = ?'
  ).get(userId).cnt;

  const unlockMap = {
    first_behavior: behaviorCount > 0,
    first_boss_win: bossWinCount > 0,
    streak_7: maxStreak >= 7,
    attr_10: character ? ATTR_FIELDS.some(f => (character[f] || 0) >= 10) : false,
    realm_up: character ? character.realm_stage !== '练气一阶' : false,
    items_50: itemCount >= 50,
  };

  const result = ACHIEVEMENTS.map(a => ({
    ...a,
    unlocked: unlockMap[a.id] ?? false,
    unlockedAt: null, // V2-F10 - 无时间戳表，暂返回 null
  }));

  res.json(result);
});

module.exports = router;
