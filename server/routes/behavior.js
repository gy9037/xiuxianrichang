const express = require('express');
const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { determineQuality, generateItem } = require('../services/itemGen');
const { getCultivationStatus } = require('../services/cultivation');
const { doCheckin } = require('../services/checkinService');
const behaviorConfig = require('../data/behaviors.json');

const router = express.Router();
router.use(authMiddleware);
const VALID_USER_STATUSES = new Set(['居家', '生病', '出差']);
const ATTR_FIELDS = ['physique', 'comprehension', 'willpower', 'dexterity', 'perception'];
const SAFE_ATTR_FIELD_SET = new Set(ATTR_FIELDS);
const CATEGORY_TO_ATTR = {};
for (const [category, conf] of Object.entries(behaviorConfig.categories)) {
  CATEGORY_TO_ATTR[category] = conf.attribute;
}
const ACTIVITY_FIELD_BY_ATTR = {
  physique: 'last_physique_activity',
  comprehension: 'last_comprehension_activity',
  willpower: 'last_willpower_activity',
  dexterity: 'last_dexterity_activity',
  perception: 'last_perception_activity',
};

function cloneBaseBehaviorData() {
  return JSON.parse(JSON.stringify(behaviorConfig));
}

function getMergedBehaviorData(familyId, userStatus = '居家') {
  const config = cloneBaseBehaviorData();
  const validStatus = config.statuses.includes(userStatus) ? userStatus : '居家';

  const result = {};
  for (const [category, catConfig] of Object.entries(config.categories)) {
    const behaviors = [...(catConfig[validStatus] || catConfig['居家'] || [])];
    result[category] = behaviors;
  }

  const customs = db.prepare(
    `SELECT category, name FROM custom_behaviors WHERE family_id = ? ORDER BY created_at ASC`
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

function behaviorExists(mergedData, category, subType) {
  const list = mergedData[category];
  if (!Array.isArray(list)) return false;
  return list.includes(subType);
}

function normalizeUserStatus(status) {
  return VALID_USER_STATUSES.has(status) ? status : '居家';
}

// GET /api/behavior/categories — get all behavior categories and types
router.get('/categories', (req, res) => {
  const userRow = db.prepare('SELECT status FROM users WHERE id = ?').get(req.user.id);
  const userStatus = normalizeUserStatus(userRow?.status);
  const mergedData = getMergedBehaviorData(req.user.family_id, userStatus);
  res.json(mergedData);
});

// POST /api/behavior/custom — create a custom behavior for family
router.post('/custom', (req, res) => {
  const category = String(req.body.category || '').trim();
  const name = String(req.body.name || '').trim();

  if (!category || !name) {
    return res.status(400).json({ error: '请填写行为分类和名称' });
  }
  if (!behaviorConfig.categories[category]) {
    return res.status(400).json({ error: '无效的行为分类' });
  }
  if (name.length < 1 || name.length > 30) {
    return res.status(400).json({ error: '行为名称长度需在1-30字符之间' });
  }

  const duplicate = db.prepare(
    `SELECT id FROM custom_behaviors
     WHERE family_id = ? AND category = ? AND lower(name) = lower(?)
     LIMIT 1`
  ).get(req.user.family_id, category, name);
  if (duplicate) {
    return res.status(400).json({ error: '该行为已存在，无需重复添加' });
  }

  const userRow = db.prepare('SELECT status FROM users WHERE id = ?').get(req.user.id);
  const userStatus = normalizeUserStatus(userRow?.status);
  const mergedForCheck = getMergedBehaviorData(req.user.family_id, userStatus);
  if (behaviorExists(mergedForCheck, category, name)) {
    return res.status(400).json({ error: '该行为已存在，无需重复添加' });
  }

  const result = db.prepare(
    `INSERT INTO custom_behaviors (family_id, category, name, template, base_quantity, created_by)
     VALUES (?, ?, ?, 'checkin', NULL, ?)`
  ).run(req.user.family_id, category, name, req.user.id);

  res.json({
    id: result.lastInsertRowid,
    category,
    name,
    message: '自定义行为添加成功',
  });
});

// POST /api/behavior — report a behavior
router.post('/', (req, res) => {
  const { category, sub_type, description, intensity } = req.body;

  if (!category || !sub_type) {
    return res.status(400).json({ error: '请选择行为类型' });
  }

  const userRow = db.prepare('SELECT status FROM users WHERE id = ?').get(req.user.id);
  const userStatus = normalizeUserStatus(userRow?.status);
  const mergedData = getMergedBehaviorData(req.user.family_id, userStatus);
  if (!mergedData[category]) {
    return res.status(400).json({ error: '无效的行为分类' });
  }
  if (!behaviorExists(mergedData, category, sub_type)) {
    return res.status(400).json({ error: '无效的行为类型' });
  }

  // 早起时间校验
  if (category === '生活习惯' && sub_type === '早起') {
    const wakeupTime = req.body.wakeup_time;
    if (wakeupTime) {
      const [h, m] = wakeupTime.split(':').map(Number);
      const totalMin = h * 60 + m;
      if (isNaN(totalMin) || totalMin < 270 || totalMin > 720) { // 4:30-12:00 宽松范围
        return res.status(400).json({ error: '起床时间不合理，请输入 4:30-12:00 之间的时间' });
      }
    }
    // 如果在 5:30-8:30 窗口内提交但没传 wakeup_time，也允许（前端自动记录）
  }

  const cultivation = getCultivationStatus(req.user.id);

  // Determine quality by probability
  const quality = determineQuality(category, intensity || null, cultivation.dropBonus);

  // Generate item
  const item = generateItem(category, quality);
  if (!item) return res.status(500).json({ error: '道具生成失败' });

  // Insert behavior record
  const behaviorResult = db.prepare(
    `INSERT INTO behaviors (user_id, category, sub_type, description, intensity, quality, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
  ).run(req.user.id, category, sub_type, description || '', intensity || null, quality);

  const behaviorId = behaviorResult.lastInsertRowid;

  // Insert item
  const itemResult = db.prepare(
    `INSERT INTO items (user_id, name, quality, attribute_type, temp_value, status, source_behavior_id)
     VALUES (?, ?, ?, ?, ?, 'unused', ?)`
  ).run(req.user.id, item.name, item.quality, item.attribute_type, item.temp_value, behaviorId);

  const itemId = itemResult.lastInsertRowid;

  // Update behavior with item_id
  db.prepare('UPDATE behaviors SET item_id = ? WHERE id = ?').run(itemId, behaviorId);

  // Update last activity date for corresponding attribute
  const attrField = CATEGORY_TO_ATTR[category];
  if (!SAFE_ATTR_FIELD_SET.has(attrField)) {
    return res.status(500).json({ error: '属性映射异常' });
  }
  const activityField = ACTIVITY_FIELD_BY_ATTR[attrField];
  db.prepare(`UPDATE characters SET ${activityField} = datetime('now') WHERE user_id = ?`).run(req.user.id);

  // 更新常用行为快捷入口频次
  db.prepare(`
    INSERT INTO user_behavior_shortcuts (user_id, category, sub_type, use_count, last_used_at)
    VALUES (?, ?, ?, 1, datetime('now'))
    ON CONFLICT(user_id, category, sub_type) DO UPDATE SET
      use_count = use_count + 1,
      last_used_at = datetime('now')
  `).run(req.user.id, category, sub_type);

  const checkinResult = doCheckin(req.user.id);
  const attrTempRow = db.prepare(
    `SELECT COALESCE(SUM(temp_value), 0) AS total
     FROM items
     WHERE user_id = ? AND attribute_type = ? AND status = 'unused'`
  ).get(req.user.id, attrField);
  const attrTempTotal = Math.round((attrTempRow?.total || 0) * 10) / 10;

  res.json({
    behavior: {
      id: behaviorId,
      category,
      sub_type,
      quality,
    },
    item: {
      id: itemId,
      name: item.name,
      quality: item.quality,
      attribute_type: item.attribute_type,
      temp_value: item.temp_value,
      description: item.description,
    },
    cultivationStatus: cultivation,
    checkinResult,
    attrTempTotal,
  });
});

// V2-F01 FB-05 - 获取用户 Top5 常用行为快捷入口
router.get('/shortcuts', (req, res) => {
  const charRow = db.prepare('SELECT pinned_behaviors FROM characters WHERE user_id = ?').get(req.user.id);
  let pinned = [];
  try {
    pinned = JSON.parse(charRow?.pinned_behaviors || '[]');
  } catch (e) {
    pinned = [];
  }

  const frequentShortcuts = db.prepare(`
    SELECT category, sub_type, use_count, last_used_at
    FROM user_behavior_shortcuts
    WHERE user_id = ?
    ORDER BY use_count DESC, last_used_at DESC
    LIMIT 10
  `).all(req.user.id);

  const result = [];
  const seen = new Set();

  for (const p of pinned) {
    const key = `${p.category}|${p.sub_type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const freq = frequentShortcuts.find(s => s.category === p.category && s.sub_type === p.sub_type);
    result.push({
      category: p.category,
      sub_type: p.sub_type,
      use_count: freq ? freq.use_count : 0,
      last_used_at: freq ? freq.last_used_at : null,
      pinned: true,
    });
  }

  for (const s of frequentShortcuts) {
    const key = `${s.category}|${s.sub_type}`;
    if (seen.has(key) || result.length >= 5) continue;
    seen.add(key);
    result.push({
      category: s.category,
      sub_type: s.sub_type,
      use_count: s.use_count,
      last_used_at: s.last_used_at,
      pinned: false,
    });
  }

  res.json(result);
});

// V2-F01 FB-05 - 获取用户最近一次上报行为，用于一键重复
router.get('/last', (req, res) => {
  const last = db.prepare(`
    SELECT category, sub_type, intensity, description
    FROM behaviors
    WHERE user_id = ?
    ORDER BY completed_at DESC
    LIMIT 1
  `).get(req.user.id);
  res.json(last || null);
});

// GET /api/behavior/list — get behavior history
router.get('/list', (req, res) => {
  const behaviors = db.prepare(
    `SELECT b.*, i.name as item_name, i.quality as item_quality, i.temp_value as item_temp_value
     FROM behaviors b LEFT JOIN items i ON b.item_id = i.id
     WHERE b.user_id = ? ORDER BY b.completed_at DESC LIMIT 50`
  ).all(req.user.id);
  res.json(behaviors);
});

// V2-F07 - 按月查询行为历史，按日期分组
router.get('/history', (req, res) => {
  const { year, month } = req.query;
  if (!year || !month) return res.status(400).json({ error: '缺少 year 或 month 参数' });

  const mm = String(month).padStart(2, '0');
  const rows = db.prepare(
    `SELECT b.*, i.name as item_name, date(b.completed_at, 'localtime') as local_date
     FROM behaviors b
     LEFT JOIN items i ON i.id = b.item_id
     WHERE b.user_id = ?
       AND strftime('%Y', b.completed_at, 'localtime') = ?
       AND strftime('%m', b.completed_at, 'localtime') = ?
     ORDER BY b.completed_at DESC`
  ).all(req.user.id, String(year), mm);

  const grouped = {};
  for (const row of rows) {
    const dateKey = row.local_date;
    if (!grouped[dateKey]) grouped[dateKey] = [];
    grouped[dateKey].push({
      id: row.id,
      sub_type: row.sub_type,
      quality: row.quality,
      item_name: row.item_name,
      completed_at: row.completed_at,
    });
  }

  res.json(grouped);
});

// V2.5 - 周报数据（替换原 V2-F07 本周汇总）
router.get('/weekly-summary', (req, res) => {
  const userId = req.user.id;

  // 计算本周范围：周日到周六
  // strftime('%w') 返回 0=周日, 1=周一, ..., 6=周六
  // 如果今天是周日(0)，week_start = 今天；否则 week_start = 上一个周日
  const weekRange = db.prepare(`
    SELECT
      date('now', 'localtime', '-' || strftime('%w', 'now', 'localtime') || ' days') AS week_start,
      date('now', 'localtime', '-' || strftime('%w', 'now', 'localtime') || ' days', '+6 days') AS week_end
  `).get();

  const { week_start, week_end } = weekRange;

  // 1. behavior_count + item_count（向后兼容）
  const counts = db.prepare(`
    SELECT
      COUNT(*) AS behavior_count,
      COUNT(item_id) AS item_count
    FROM behaviors
    WHERE user_id = ?
      AND date(completed_at, 'localtime') BETWEEN ? AND ?
  `).get(userId, week_start, week_end);

  // 2. active_days：本周有记录的不同日期数
  const activeDaysRow = db.prepare(`
    SELECT COUNT(DISTINCT date(completed_at, 'localtime')) AS active_days
    FROM behaviors
    WHERE user_id = ?
      AND date(completed_at, 'localtime') BETWEEN ? AND ?
  `).get(userId, week_start, week_end);

  // 3. category_distribution：按 category 分组计数，降序，最多 5 条
  const category_distribution = db.prepare(`
    SELECT category, COUNT(*) AS count
    FROM behaviors
    WHERE user_id = ?
      AND date(completed_at, 'localtime') BETWEEN ? AND ?
    GROUP BY category
    ORDER BY count DESC
    LIMIT 5
  `).all(userId, week_start, week_end);

  // 4. quality_distribution：按 quality 分组计数
  const qualityRows = db.prepare(`
    SELECT quality, COUNT(*) AS count
    FROM behaviors
    WHERE user_id = ?
      AND date(completed_at, 'localtime') BETWEEN ? AND ?
    GROUP BY quality
  `).all(userId, week_start, week_end);

  const quality_distribution = {};
  qualityRows.forEach((r) => { quality_distribution[r.quality] = r.count; });

  // 5. streak：从今天往前数连续有记录的天数
  // 先检查今天是否有记录
  const todayStr = db.prepare(`SELECT date('now', 'localtime') AS today`).get().today;
  const hasTodayRow = db.prepare(`
    SELECT COUNT(*) AS cnt
    FROM behaviors
    WHERE user_id = ?
      AND date(completed_at, 'localtime') = ?
  `).get(userId, todayStr);
  const hasToday = hasTodayRow.cnt > 0;

  // 获取所有有记录的日期（降序），从起始日开始往前数连续天数
  const startDate = hasToday ? todayStr : db.prepare(`SELECT date('now', 'localtime', '-1 day') AS d`).get().d;
  const activeDates = db.prepare(`
    SELECT DISTINCT date(completed_at, 'localtime') AS d
    FROM behaviors
    WHERE user_id = ?
      AND date(completed_at, 'localtime') <= ?
    ORDER BY d DESC
    LIMIT 365
  `).all(userId, startDate);

  let streak = 0;
  let expectedDate = startDate;
  for (const row of activeDates) {
    if (row.d === expectedDate) {
      streak++;
      // 计算前一天
      expectedDate = db.prepare(`SELECT date(?, '-1 day') AS d`).get(expectedDate).d;
    } else {
      break;
    }
  }

  const streak_note = (!hasToday && streak > 0) ? '截至昨日' : null;

  res.json({
    week_start,
    week_end,
    behavior_count: counts.behavior_count,
    item_count: counts.item_count,
    active_days: activeDaysRow.active_days,
    category_distribution,
    quality_distribution,
    streak,
    streak_note,
  });
});

// GET /api/behavior/family — get family behavior feed
router.get('/family', (req, res) => {
  const feed = db.prepare(
    `SELECT b.id, b.category, b.sub_type, b.quality, b.completed_at, u.name as user_name
     FROM behaviors b JOIN users u ON b.user_id = u.id
     WHERE u.family_id = ? ORDER BY b.completed_at DESC LIMIT 50`
  ).all(req.user.family_id);
  res.json(feed);
});

module.exports = router;
