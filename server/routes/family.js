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
    `SELECT b.category, b.sub_type, b.quality, b.completed_at, u.name as user_name,
     i.name as item_name
     FROM behaviors b
     JOIN users u ON b.user_id = u.id
     LEFT JOIN items i ON b.item_id = i.id
     WHERE u.family_id = ?
     ORDER BY b.completed_at DESC LIMIT 30`
  ).all(req.user.family_id);
  res.json(feed);
});

module.exports = router;
