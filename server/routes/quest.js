const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const questService = require('../services/questService');

const router = express.Router();
router.use(authMiddleware);

router.get('/', (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const result = questService.getQuestList(req.user.family_id, req.user.id, {
      status: req.query.status || null,
      type: req.query.type || null,
      page,
      limit,
    });
    res.json({ quests: result.quests, total: result.total, page, limit });
  } catch (e) {
    console.error('GET /api/quests failed:', e);
    res.status(500).json({ error: '获取任务列表失败' });
  }
});

router.get('/daily', (req, res) => {
  try {
    const quest = questService.getDailySystemQuest(req.user.family_id, req.user.id);
    res.json(quest);
  } catch (e) {
    console.error('GET /api/quests/daily failed:', e);
    res.status(500).json({ error: '获取今日悬赏失败' });
  }
});

router.get('/:id', (req, res) => {
  try {
    const questId = parseInt(req.params.id, 10);
    if (!questId || questId < 1) return res.status(400).json({ error: '无效的任务ID' });

    const detail = questService.getQuestDetail(questId, req.user.id);
    if (!detail) return res.status(404).json({ error: '任务不存在' });
    if (detail.family_id !== req.user.family_id) return res.status(403).json({ error: '无权查看此任务' });

    return res.json(detail);
  } catch (e) {
    console.error('GET /api/quests/:id failed:', e);
    return res.status(500).json({ error: '获取任务详情失败' });
  }
});

router.post('/', (req, res) => {
  try {
    const { type, title, description, category, goal_type, goal_config, mode, reward_stones, deadline } = req.body;
    if (!['self', 'bounty', 'challenge'].includes(type)) {
      return res.status(400).json({ error: '任务类型无效，可选：self/bounty/challenge' });
    }
    if (!title || typeof title !== 'string' || title.trim().length < 1 || title.trim().length > 50) {
      return res.status(400).json({ error: '任务标题长度需在1-50字符之间' });
    }
    if (!deadline) return res.status(400).json({ error: '请设置截止时间' });
    if (new Date(deadline) <= new Date()) return res.status(400).json({ error: '截止时间必须在未来' });

    const goalType = goal_type || 'manual';
    if (goalType !== 'manual' && (!goal_config || Object.keys(goal_config).length === 0)) {
      return res.status(400).json({ error: '自动结算任务需要填写目标配置' });
    }
    if (type === 'bounty') {
      const stones = parseInt(reward_stones, 10);
      if (!stones || stones < 1) return res.status(400).json({ error: '悬赏灵石数量必须大于0' });
    }

    const result = questService.createQuest(req.user.id, {
      type,
      title: title.trim(),
      description: description || '',
      category: category || null,
      goalType,
      goalConfig: goal_config || {},
      mode: mode || 'cooperative',
      rewardStones: type === 'bounty' ? parseInt(reward_stones, 10) : 0,
      deadline,
    });
    return res.json(result.quest ? { id: result.quest.id, quest: result.quest } : result);
  } catch (e) {
    console.error('POST /api/quests failed:', e);
    if (['灵石余额不足', '系统任务不可手动创建'].includes(e.message)) {
      return res.status(400).json({ error: e.message });
    }
    return res.status(500).json({ error: '创建任务失败' });
  }
});

router.post('/:id/vote', (req, res) => {
  try {
    const questId = parseInt(req.params.id, 10);
    if (!questId || questId < 1) return res.status(400).json({ error: '无效的任务ID' });
    const { approve, joinAsChallenger } = req.body;
    if (typeof approve !== 'boolean') return res.status(400).json({ error: 'approve 必须是布尔值' });

    const result = questService.vote(req.user.id, questId, approve, !!joinAsChallenger);
    return res.json(result);
  } catch (e) {
    console.error('POST /api/quests/:id/vote failed:', e);
    if (['你已经投过票了', '该任务不在投票阶段'].includes(e.message)) {
      return res.status(400).json({ error: e.message });
    }
    if (e.message === '无权操作此任务') return res.status(403).json({ error: e.message });
    return res.status(500).json({ error: '投票失败' });
  }
});

router.post('/:id/submit', (req, res) => {
  try {
    const questId = parseInt(req.params.id, 10);
    if (!questId || questId < 1) return res.status(400).json({ error: '无效的任务ID' });
    const { text, photoUrls } = req.body;
    if (!text || typeof text !== 'string' || text.trim().length < 1 || text.trim().length > 500) {
      return res.status(400).json({ error: '请填写完成说明（1-500字符）' });
    }
    if (photoUrls !== undefined && (!Array.isArray(photoUrls) || photoUrls.length > 3)) {
      return res.status(400).json({ error: '照片链接必须是最多3张的数组' });
    }

    const result = questService.submitQuest(req.user.id, questId, {
      text: text.trim(),
      photoUrls: photoUrls || [],
    });
    return res.json(result);
  } catch (e) {
    console.error('POST /api/quests/:id/submit failed:', e);
    if (e.message === '你不是该任务的挑战者') return res.status(403).json({ error: e.message });
    if (['该任务不在进行中', '你已经提交过了'].includes(e.message)) return res.status(400).json({ error: e.message });
    return res.status(500).json({ error: '提交失败' });
  }
});

router.post('/:id/judge', (req, res) => {
  try {
    const questId = parseInt(req.params.id, 10);
    if (!questId || questId < 1) return res.status(400).json({ error: '无效的任务ID' });
    const { targetUserId, verdict } = req.body;
    if (!targetUserId || typeof targetUserId !== 'number') return res.status(400).json({ error: '请指定判定目标用户' });
    if (!['pass', 'fail'].includes(verdict)) return res.status(400).json({ error: '判定结果无效，可选：pass/fail' });

    const result = questService.judgeParticipant(req.user.id, questId, targetUserId, verdict);
    return res.json(result);
  } catch (e) {
    console.error('POST /api/quests/:id/judge failed:', e);
    if (['不能判定自己', '你已经判定过该成员了', '该任务不在判定阶段'].includes(e.message)) {
      return res.status(400).json({ error: e.message });
    }
    return res.status(500).json({ error: '判定失败' });
  }
});

module.exports = router;
