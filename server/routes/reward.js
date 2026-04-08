const express = require('express');
const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { isSingleWish, mapWishRecord } = require('../services/wishType');

const router = express.Router();
router.use(authMiddleware);

// GET /api/rewards — get rewards list
router.get('/', (req, res) => {
  const rewards = db.prepare(
    `SELECT w.id, w.name, w.reward_description, w.status, w.type, w.difficulty,
     w.created_at, u.name as creator_name
     FROM wishes w JOIN users u ON w.creator_id = u.id
     WHERE w.family_id = ? AND w.status IN ('completed', 'redeemed')
     ORDER BY w.created_at DESC`
  ).all(req.user.family_id).map(mapWishRecord);
  res.json(rewards);
});

// POST /api/rewards/:id/redeem — mark reward as redeemed
router.post('/:id/redeem', (req, res) => {
  const wish = db.prepare(
    "SELECT * FROM wishes WHERE id = ? AND family_id = ? AND status = 'completed'"
  ).get(req.params.id, req.user.family_id);

  if (!wish) return res.status(404).json({ error: '奖励不存在或已兑现' });
  if (isSingleWish(wish.type) && wish.target_user_id !== req.user.id) {
    return res.status(403).json({ error: '无权兑现他人的单人奖励' });
  }

  db.prepare("UPDATE wishes SET status = 'redeemed' WHERE id = ?").run(wish.id);
  res.json({ success: true, message: '奖励已兑现' });
});

module.exports = router;
