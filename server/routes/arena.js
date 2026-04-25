const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const arenaService = require('../services/arenaService');

const router = express.Router();
router.use(authMiddleware);

router.get('/', (req, res) => {
  try {
    const user = req.user;
    if (!user.family_id) return res.status(400).json({ error: '未加入家庭' });

    const status = req.query.status || null;
    const arenas = arenaService.listArenas(user.family_id, status);
    return res.json({ arenas });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/', (req, res) => {
  try {
    const user = req.user;
    if (!user.family_id) return res.status(400).json({ error: '未加入家庭' });

    const { type, title, description, config, currency, rewardPool } = req.body;
    if (!type || !title) return res.status(400).json({ error: '缺少必填字段' });

    const result = arenaService.createArena({
      familyId: user.family_id,
      creatorId: user.id,
      type,
      title,
      description,
      config,
      currency,
      rewardPool,
    });
    return res.json(result);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const arena = arenaService.getArena(parseInt(req.params.id, 10));
    if (!arena) return res.status(404).json({ error: '擂台不存在' });
    return res.json(arena);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post('/:id/join', (req, res) => {
  try {
    const result = arenaService.joinArena(parseInt(req.params.id, 10), req.user.id);
    return res.json(result);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

router.post('/:id/submit', (req, res) => {
  try {
    const { submission } = req.body;
    if (!submission) return res.status(400).json({ error: '缺少提交内容' });

    const result = arenaService.submitResult(parseInt(req.params.id, 10), req.user.id, submission);
    return res.json(result);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

router.post('/:id/judge', (req, res) => {
  try {
    const { judgments } = req.body;
    if (!judgments || !Array.isArray(judgments)) {
      return res.status(400).json({ error: '缺少判定数据' });
    }

    const result = arenaService.judgeQuiz(parseInt(req.params.id, 10), req.user.id, judgments);
    return res.json(result);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

router.post('/:id/settle', (req, res) => {
  try {
    const { settlements } = req.body;
    if (!settlements || !Array.isArray(settlements)) {
      return res.status(400).json({ error: '缺少结算数据' });
    }

    const result = arenaService.settleArena(parseInt(req.params.id, 10), req.user.id, settlements);
    return res.json(result);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

router.post('/:id/cancel', (req, res) => {
  try {
    const result = arenaService.cancelArena(parseInt(req.params.id, 10), req.user.id);
    return res.json(result);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

module.exports = router;
