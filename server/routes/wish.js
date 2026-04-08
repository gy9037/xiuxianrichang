const express = require('express');
const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { DIFFICULTY_MULTIPLIER } = require('../services/battle');
const { normalizeWishType, isTeamWish, mapWishRecord } = require('../services/wishType');

const router = express.Router();
router.use(authMiddleware);

// GET /api/wishes — list wishes for the family
router.get('/', (req, res) => {
  const rawWishes = db.prepare(
    `SELECT w.*, u.name as creator_name
     FROM wishes w JOIN users u ON w.creator_id = u.id
     WHERE w.family_id = ? ORDER BY w.created_at DESC`
  ).all(req.user.family_id);

  const winsRow = db.prepare(
    "SELECT COUNT(*) as count FROM battles WHERE user_id = ? AND result = 'win'"
  ).get(req.user.id);
  const historyWins = winsRow.count;
  const historyMultiplier = 1 + historyWins * 0.1;

  const wishes = rawWishes.map(wish => {
    const normalized = mapWishRecord(wish);
    const diffMultiplier = DIFFICULTY_MULTIPLIER[normalized.difficulty] || 1;
    const avgPower = 10 * diffMultiplier * historyMultiplier;
    normalized.bossEstimate = {
      min: Math.round(avgPower * 0.9 * 10) / 10,
      max: Math.round(avgPower * 1.1 * 10) / 10,
      avg: Math.round(avgPower * 10) / 10,
    };
    return normalized;
  });

  // For team wishes, get member progress
  for (const wish of wishes) {
    if (isTeamWish(wish.type)) {
      const members = db.prepare(
        `SELECT u.id, u.name,
         CASE
           WHEN EXISTS (
             SELECT 1
             FROM battles b
             JOIN bosses bo ON bo.id = b.boss_id
             WHERE bo.wish_id = ? AND b.user_id = u.id AND b.result = 'win'
           ) THEN '已通过'
           WHEN EXISTS (
             SELECT 1
             FROM battles b
             JOIN bosses bo ON bo.id = b.boss_id
             WHERE bo.wish_id = ? AND b.user_id = u.id AND b.result = 'lose'
           ) THEN '挑战失败'
           ELSE '未挑战'
         END as status
         FROM users u
         WHERE u.family_id = ?
         ORDER BY u.id`
      ).all(wish.id, wish.id, req.user.family_id);
      wish.teamProgress = members;
    }
  }

  res.json(wishes);
});

// POST /api/wishes — create a wish
router.post('/', (req, res) => {
  const { name, description, type, difficulty, reward_description, target_user_id } = req.body;
  const diffRaw = String(difficulty ?? '').trim();
  const diff = Number.parseInt(diffRaw, 10);
  const normalizedType = normalizeWishType(type);

  if (!name || !normalizedType || !difficulty || !reward_description) {
    return res.status(400).json({ error: '请填写必要信息' });
  }

  if (!/^\d+$/.test(diffRaw) || !Number.isInteger(diff) || diff < 1 || diff > 10) {
    return res.status(400).json({ error: '难度评分需在1-10之间' });
  }

  const result = db.prepare(
    `INSERT INTO wishes (family_id, creator_id, name, description, type, difficulty, reward_description, target_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    req.user.family_id, req.user.id, name, description || '', normalizedType,
    diff, reward_description, normalizedType === '单人' ? (target_user_id || req.user.id) : null
  );

  res.json({ id: result.lastInsertRowid, message: '愿望创建成功' });
});

module.exports = router;
