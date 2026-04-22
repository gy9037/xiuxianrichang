const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { doCheckin, getCheckinStatus } = require('../services/checkinService');

const router = express.Router();

// GET /api/checkin/status — 获取签到状态（不触发签到）
router.get('/status', authMiddleware, (req, res) => {
  try {
    const status = getCheckinStatus(req.user.id);
    res.json(status);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/checkin — 执行签到
router.post('/', authMiddleware, (req, res) => {
  try {
    const result = doCheckin(req.user.id);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
