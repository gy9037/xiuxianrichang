const express = require('express');
const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { determineQuality, generateItem, CATEGORY_TO_ATTR } = require('../services/itemGen');
const behaviorData = require('../data/behaviors.json');

const router = express.Router();
router.use(authMiddleware);
const ATTR_FIELDS = ['physique', 'comprehension', 'willpower', 'dexterity', 'perception'];
const SAFE_ATTR_FIELD_SET = new Set(ATTR_FIELDS);
const ACTIVITY_FIELD_BY_ATTR = {
  physique: 'last_physique_activity',
  comprehension: 'last_comprehension_activity',
  willpower: 'last_willpower_activity',
  dexterity: 'last_dexterity_activity',
  perception: 'last_perception_activity',
};
const TEMPLATE_MAP = {
  duration: 'duration',
  quantity: 'quantity',
  checkin: 'checkin',
  时长型: 'duration',
  数量型: 'quantity',
  打卡型: 'checkin',
};
const VALID_TEMPLATES = new Set(['duration', 'quantity', 'checkin']);

function formatLocalDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function cloneBaseBehaviorData() {
  return JSON.parse(JSON.stringify(behaviorData));
}

function pushUniqueBehavior(list, item) {
  if (!Array.isArray(list)) return;
  if (list.some(b => b.name === item.name)) return;
  list.push(item);
}

function getMergedBehaviorData(familyId) {
  const merged = cloneBaseBehaviorData();
  const customs = db.prepare(
    `SELECT category, name, template, base_quantity
     FROM custom_behaviors
     WHERE family_id = ?
     ORDER BY created_at ASC`
  ).all(familyId);

  for (const custom of customs) {
    const target = merged[custom.category];
    if (!target) continue;

    const behavior = { name: custom.name, template: custom.template };
    if (custom.base_quantity !== null && custom.base_quantity !== undefined) {
      behavior.baseQuantity = custom.base_quantity;
    }

    if (Array.isArray(target)) {
      pushUniqueBehavior(target, behavior);
      continue;
    }

    if (!target['自定义']) target['自定义'] = [];
    pushUniqueBehavior(target['自定义'], behavior);
  }

  return merged;
}

function findBehaviorDef(mergedData, category, subType, subCategory) {
  const target = mergedData[category];
  if (!target) return null;

  if (Array.isArray(target)) {
    const found = target.find(b => b.name === subType);
    return found ? { behaviorDef: found, subCategory: null } : null;
  }

  if (subCategory && Array.isArray(target[subCategory])) {
    const found = target[subCategory].find(b => b.name === subType);
    if (found) return { behaviorDef: found, subCategory };
  }

  for (const [groupName, list] of Object.entries(target)) {
    const found = Array.isArray(list) ? list.find(b => b.name === subType) : null;
    if (found) return { behaviorDef: found, subCategory: groupName };
  }

  return null;
}

// GET /api/behavior/categories — get all behavior categories and types
router.get('/categories', (req, res) => {
  const mergedData = getMergedBehaviorData(req.user.family_id);
  res.json(mergedData);
});

// POST /api/behavior/custom — create a custom behavior for family
router.post('/custom', (req, res) => {
  const category = String(req.body.category || '').trim();
  const name = String(req.body.name || '').trim();
  const templateRaw = String(req.body.template || '').trim();
  const template = TEMPLATE_MAP[templateRaw];
  const baseQuantityRaw = req.body.base_quantity;
  const baseQuantity = Number.isInteger(baseQuantityRaw)
    ? baseQuantityRaw
    : Number.parseInt(baseQuantityRaw, 10);

  if (!category || !name || !template) {
    return res.status(400).json({ error: '请完整填写行为分类、名称和模板' });
  }
  if (!(category in behaviorData)) {
    return res.status(400).json({ error: '无效的行为分类' });
  }
  if (name.length < 1 || name.length > 30) {
    return res.status(400).json({ error: '行为名称长度需在1-30字符之间' });
  }
  if (!VALID_TEMPLATES.has(template)) {
    return res.status(400).json({ error: '无效的品质模板' });
  }
  if (template === 'quantity' && (!Number.isInteger(baseQuantity) || baseQuantity <= 0)) {
    return res.status(400).json({ error: '数量型行为需填写大于0的基础量' });
  }

  const duplicate = db.prepare(
    `SELECT id FROM custom_behaviors
     WHERE family_id = ? AND category = ? AND lower(name) = lower(?)
     LIMIT 1`
  ).get(req.user.family_id, category, name);
  if (duplicate) {
    return res.status(400).json({ error: '该行为已存在，无需重复添加' });
  }

  const mergedForCheck = getMergedBehaviorData(req.user.family_id);
  const existed = findBehaviorDef(mergedForCheck, category, name);
  if (existed) {
    return res.status(400).json({ error: '该行为已存在，无需重复添加' });
  }

  const result = db.prepare(
    `INSERT INTO custom_behaviors (family_id, category, name, template, base_quantity, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    req.user.family_id,
    category,
    name,
    template,
    template === 'quantity' ? baseQuantity : null,
    req.user.id
  );

  res.json({
    id: result.lastInsertRowid,
    category,
    name,
    template,
    base_quantity: template === 'quantity' ? baseQuantity : null,
    message: '自定义行为添加成功',
  });
});

// POST /api/behavior — report a behavior
router.post('/', (req, res) => {
  const { category, sub_type, sub_category, description, duration, quantity } = req.body;

  if (!category || !sub_type) {
    return res.status(400).json({ error: '请选择行为类型' });
  }

  // Find behavior definition
  const mergedData = getMergedBehaviorData(req.user.family_id);
  if (!mergedData[category]) {
    return res.status(400).json({ error: '无效的行为分类' });
  }
  const foundBehavior = findBehaviorDef(mergedData, category, sub_type, sub_category);
  if (!foundBehavior) {
    return res.status(400).json({ error: '无效的行为类型' });
  }
  const { behaviorDef } = foundBehavior;

  const template = behaviorDef.template;

  // Calculate streak for checkin-type behaviors
  let streakCount = 1;
  if (template === 'checkin') {
    const today = formatLocalDate();
    const streak = db.prepare(
      'SELECT * FROM streaks WHERE user_id = ? AND category = ? AND sub_type = ?'
    ).get(req.user.id, category, sub_type);

    if (streak) {
      const lastDate = streak.last_date;
      const yesterdayDate = new Date();
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      const yesterday = formatLocalDate(yesterdayDate);

      // BUG-01 FB-用户反馈：打卡型行为每日限一次不合理
      // 去掉每日一次的硬性限制，连击只在当天第一次打卡时更新
      if (lastDate !== today) {
        if (lastDate === yesterday) {
          streakCount = streak.current_streak + 1;
          db.prepare('UPDATE streaks SET current_streak = ?, last_date = ? WHERE id = ?')
            .run(streakCount, today, streak.id);
        } else {
          streakCount = 1;
          db.prepare('UPDATE streaks SET current_streak = 1, last_date = ? WHERE id = ?')
            .run(today, streak.id);
        }
      } else {
        // BUG-01 FB-用户反馈：打卡型行为每日限一次不合理
        // 今天已打卡过，连击数保持不变，streakCount 取当前值
        streakCount = streak.current_streak;
      }
    } else {
      db.prepare('INSERT INTO streaks (user_id, category, sub_type, current_streak, last_date) VALUES (?, ?, ?, 1, ?)')
        .run(req.user.id, category, sub_type, today);
    }
  }

  // Calculate quantity multiplier for quantity-type
  let quantityMultiplier = quantity;
  if (template === 'quantity' && behaviorDef.baseQuantity) {
    quantityMultiplier = (quantity || 0) / behaviorDef.baseQuantity;
  }

  // Determine quality
  const quality = determineQuality(template, {
    duration: duration || 0,
    quantity: quantityMultiplier,
    streakCount,
  });

  // Generate item
  const item = generateItem(category, quality);
  if (!item) return res.status(500).json({ error: '道具生成失败' });

  // Insert behavior record
  // V2-F01 FB-05 - 新增 sub_category 字段写入
  const behaviorResult = db.prepare(
    `INSERT INTO behaviors (user_id, category, sub_category, sub_type, description, quality_template, duration, quantity, quality, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  ).run(req.user.id, category, foundBehavior.subCategory || null, sub_type, description || '', template, duration || null, quantity || null, quality);

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

  // V2-F01 FB-05 - 更新常用行为快捷入口频次
  db.prepare(`
    INSERT INTO user_behavior_shortcuts (user_id, category, sub_category, sub_type, use_count, last_used_at)
    VALUES (?, ?, ?, ?, 1, datetime('now'))
    ON CONFLICT(user_id, category, sub_type) DO UPDATE SET
      use_count = use_count + 1,
      sub_category = excluded.sub_category,
      last_used_at = datetime('now')
  `).run(req.user.id, category, foundBehavior.subCategory || null, sub_type);

  res.json({
    behavior: {
      id: behaviorId,
      category,
      sub_type,
      sub_category: foundBehavior.subCategory,
      quality,
      streak: streakCount,
    },
    item: { id: itemId, name: item.name, quality: item.quality, attribute_type: item.attribute_type, temp_value: item.temp_value },
  });
});

// V2-F01 FB-05 - 获取用户 Top5 常用行为快捷入口
router.get('/shortcuts', (req, res) => {
  const shortcuts = db.prepare(`
    SELECT category, sub_category, sub_type, use_count, last_used_at
    FROM user_behavior_shortcuts
    WHERE user_id = ?
    ORDER BY use_count DESC, last_used_at DESC
    LIMIT 5
  `).all(req.user.id);
  res.json(shortcuts);
});

// V2-F01 FB-05 - 获取用户最近一次上报行为，用于一键重复
router.get('/last', (req, res) => {
  const last = db.prepare(`
    SELECT category, sub_category, sub_type, duration, quantity, description
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

// V2-F07 - 本周行为数和道具数汇总
router.get('/weekly-summary', (req, res) => {
  const rows = db.prepare(
    `SELECT b.id, b.item_id
     FROM behaviors b
     WHERE b.user_id = ?
       AND b.completed_at >= datetime('now', 'localtime', 'weekday 0', '-7 days')`
  ).all(req.user.id);

  const behavior_count = rows.length;
  const item_count = rows.filter(r => r.item_id !== null).length;

  res.json({ behavior_count, item_count });
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
