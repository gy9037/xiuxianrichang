const express = require('express');
const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { getAttrCap } = require('../services/realm');

const router = express.Router();
router.use(authMiddleware);

const ATTR_NAMES = {
  physique: '体魄', comprehension: '悟性', willpower: '心性',
  dexterity: '灵巧', perception: '神识',
};
const SAFE_ATTR_FIELD_SET = new Set(Object.keys(ATTR_NAMES));

// GET /api/items — get user's item inventory
router.get('/', (req, res) => {
  const items = db.prepare(
    "SELECT * FROM items WHERE user_id = ? AND status = 'unused' ORDER BY attribute_type, quality DESC"
  ).all(req.user.id);

  // Group by attribute type
  const grouped = {};
  for (const item of items) {
    if (!grouped[item.attribute_type]) {
      grouped[item.attribute_type] = { name: ATTR_NAMES[item.attribute_type], items: [], totalTempValue: 0 };
    }
    grouped[item.attribute_type].items.push(item);
    grouped[item.attribute_type].totalTempValue += item.temp_value;
  }

  res.json({ items, grouped });
});

// POST /api/items/synthesize — synthesize items into permanent attributes
router.post('/synthesize', (req, res) => {
  const { item_ids } = req.body;
  if (!Array.isArray(item_ids) || item_ids.length === 0) {
    return res.status(400).json({ error: '请选择要合成的道具' });
  }

  const normalizedIds = [...new Set(
    item_ids.map(id => Number(id)).filter(id => Number.isInteger(id) && id > 0)
  )];

  if (normalizedIds.length !== item_ids.length || normalizedIds.length === 0) {
    return res.status(400).json({ error: '道具ID格式不正确' });
  }

  // Fetch items
  const placeholders = normalizedIds.map(() => '?').join(',');
  const items = db.prepare(
    `SELECT * FROM items WHERE id IN (${placeholders}) AND user_id = ? AND status = 'unused'`
  ).all(...normalizedIds, req.user.id);

  if (items.length !== normalizedIds.length) {
    return res.status(400).json({ error: '存在不可用或不属于你的道具，请刷新后重试' });
  }

  // Check all items are same attribute type
  const attrTypes = [...new Set(items.map(i => i.attribute_type))];
  if (attrTypes.length > 1) {
    return res.status(400).json({ error: '只能合成同属性类型的道具' });
  }
  const attrType = attrTypes[0];
  if (!SAFE_ATTR_FIELD_SET.has(attrType)) {
    return res.status(400).json({ error: '无效属性类型' });
  }

  // Calculate total temp value
  const totalTempValue = items.reduce((s, i) => s + i.temp_value, 0);
  const permanentGain = Math.floor(totalTempValue / 10);

  if (permanentGain < 1) {
    return res.status(400).json({
      error: `临时属性值总和为${totalTempValue}，不足10点，无法合成。需要至少10点临时属性值才能合成1点永久属性`,
    });
  }

  // Check realm cap
  const character = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(req.user.id);
  if (!character) return res.status(404).json({ error: '角色不存在' });

  const cap = getAttrCap(character.realm_stage);
  const currentValue = character[attrType];

  if (currentValue >= cap) {
    return res.status(400).json({
      error: `${ATTR_NAMES[attrType]}已达${character.realm_stage}上限(${cap})，需突破境界后才能继续提升`,
    });
  }

  // Cap the gain so it doesn't exceed realm cap
  const actualGain = Math.min(permanentGain, cap - currentValue);

  const runSynthesize = db.transaction(() => {
    db.prepare(`UPDATE characters SET ${attrType} = ${attrType} + ? WHERE id = ?`).run(actualGain, character.id);
    db.prepare(
      `UPDATE items SET status = 'synthesized' WHERE user_id = ? AND status = 'unused' AND id IN (${placeholders})`
    ).run(req.user.id, ...normalizedIds);
  });

  try {
    runSynthesize();
  } catch (error) {
    console.error('synthesize transaction failed', error);
    return res.status(500).json({ error: '合成失败，请稍后重试' });
  }

  const waste = totalTempValue - permanentGain * 10;

  res.json({
    success: true,
    attribute: ATTR_NAMES[attrType],
    gain: actualGain,
    cappedByRealm: actualGain < permanentGain,
    totalTempValue,
    waste: Math.round(waste * 10) / 10,
    newValue: Math.round((currentValue + actualGain) * 10) / 10,
    cap,
  });
});

module.exports = router;
