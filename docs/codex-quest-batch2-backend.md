# Codex 指令：任务系统 Batch2 - 后端（路由层 + 定时任务 + 挂载）

> **关联技术方案**：`docs/tech-quest-system.md` §四（路由层设计）、§五（定时任务设计）
> **前置依赖**：Batch1 已完成（db.js 新增 4 张表 + 索引 + seed data、questService.js 已实现）
> **执行顺序**：先执行本文件，再执行前端指令

---

## 一、路由文件（新建 server/routes/quest.js）

新建文件 `server/routes/quest.js`，实现 7 个 API 端点。

路由模式参考 `server/routes/behavior.js`：全局 authMiddleware、参数校验在路由层、业务逻辑调用 service 层、统一 try/catch 错误处理。

注意：`/daily` 路由必须放在 `/:id` 之前，否则 `'daily'` 会被当作 id 参数匹配。

```js
const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const questService = require('../services/questService');

const router = express.Router();
router.use(authMiddleware);

/**
 * GET /api/quests — 任务列表
 * query: status, type, page(默认1), limit(默认20,最大50)
 * 只返回当前用户所在家庭的任务
 */
router.get('/', (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const filters = {
      status: req.query.status || null,
      type: req.query.type || null,
      page,
      limit,
    };

    const result = questService.getQuestList(req.user.family_id, req.user.id, filters);
    res.json({
      quests: result.quests,
      total: result.total,
      page,
      limit,
    });
  } catch (e) {
    console.error('GET /api/quests failed:', e);
    res.status(500).json({ error: '获取任务列表失败' });
  }
});

/**
 * GET /api/quests/daily — 今日系统悬赏
 * 不存在则自动生成
 * 注意：此路由必须在 /:id 之前注册
 */
router.get('/daily', (req, res) => {
  try {
    const quest = questService.getDailySystemQuest(req.user.family_id);
    res.json(quest);
  } catch (e) {
    console.error('GET /api/quests/daily failed:', e);
    res.status(500).json({ error: '获取今日悬赏失败' });
  }
});

/**
 * GET /api/quests/:id — 任务详情
 * 校验任务必须属于当前用户所在家庭
 */
router.get('/:id', (req, res) => {
  try {
    const questId = parseInt(req.params.id);
    if (!questId || questId < 1) {
      return res.status(400).json({ error: '无效的任务ID' });
    }

    const detail = questService.getQuestDetail(questId, req.user.id);
    if (!detail) {
      return res.status(404).json({ error: '任务不存在' });
    }
    if (detail.family_id !== req.user.family_id) {
      return res.status(403).json({ error: '无权查看此任务' });
    }

    res.json(detail);
  } catch (e) {
    console.error('GET /api/quests/:id failed:', e);
    res.status(500).json({ error: '获取任务详情失败' });
  }
});

/**
 * POST /api/quests — 创建任务
 * body: type, title, description, category, goal_type, goal_config, mode, reward_stones, deadline
 */
router.post('/', (req, res) => {
  try {
    const { type, title, description, category, goal_type, goal_config, mode, reward_stones, deadline } = req.body;

    // --- 参数校验 ---
    const validTypes = ['self', 'bounty', 'challenge'];
    if (!type || !validTypes.includes(type)) {
      return res.status(400).json({ error: '任务类型无效，可选：self/bounty/challenge' });
    }

    if (!title || typeof title !== 'string' || title.trim().length < 1 || title.trim().length > 50) {
      return res.status(400).json({ error: '任务标题长度需在1-50字符之间' });
    }

    if (!deadline) {
      return res.status(400).json({ error: '请设置截止时间' });
    }
    if (new Date(deadline) <= new Date()) {
      return res.status(400).json({ error: '截止时间必须在未来' });
    }

    // goal_type 非 manual 时 goal_config 必填
    const goalType = goal_type || 'manual';
    if (goalType !== 'manual' && (!goal_config || Object.keys(goal_config).length === 0)) {
      return res.status(400).json({ error: '自动结算任务需要填写目标配置' });
    }

    // bounty 类型：reward_stones 必须 >= 1
    if (type === 'bounty') {
      const stones = parseInt(reward_stones);
      if (!stones || stones < 1) {
        return res.status(400).json({ error: '悬赏灵石数量必须大于0' });
      }
    }

    const data = {
      type,
      title: title.trim(),
      description: description || '',
      category: category || null,
      goalType,
      goalConfig: goal_config || {},
      mode: mode || 'cooperative',
      rewardStones: type === 'bounty' ? parseInt(reward_stones) : 0,
      deadline,
    };

    const result = questService.createQuest(req.user.id, data);
    res.json(result);
  } catch (e) {
    console.error('POST /api/quests failed:', e);
    // 业务错误返回 400
    if (e.message === '灵石余额不足') {
      return res.status(400).json({ error: e.message });
    }
    if (e.message === '系统任务不可手动创建') {
      return res.status(400).json({ error: e.message });
    }
    res.status(500).json({ error: '创建任务失败' });
  }
});

/**
 * POST /api/quests/:id/vote — 投票
 * body: approve(boolean), joinAsChallenger(boolean)
 */
router.post('/:id/vote', (req, res) => {
  try {
    const questId = parseInt(req.params.id);
    if (!questId || questId < 1) {
      return res.status(400).json({ error: '无效的任务ID' });
    }

    const { approve, joinAsChallenger } = req.body;
    if (typeof approve !== 'boolean') {
      return res.status(400).json({ error: 'approve 必须是布尔值' });
    }

    const result = questService.vote(req.user.id, questId, approve, !!joinAsChallenger);
    res.json(result);
  } catch (e) {
    console.error('POST /api/quests/:id/vote failed:', e);
    if (e.message === '你已经投过票了') {
      return res.status(400).json({ error: e.message });
    }
    if (e.message === '该任务不在投票阶段') {
      return res.status(400).json({ error: e.message });
    }
    if (e.message === '无权操作此任务') {
      return res.status(403).json({ error: e.message });
    }
    res.status(500).json({ error: '投票失败' });
  }
});

/**
 * POST /api/quests/:id/submit — 提交完成信息
 * body: text(1-500字符), photoUrls(数组,最多3个,可选)
 */
router.post('/:id/submit', (req, res) => {
  try {
    const questId = parseInt(req.params.id);
    if (!questId || questId < 1) {
      return res.status(400).json({ error: '无效的任务ID' });
    }

    const { text, photoUrls } = req.body;

    // 校验 text
    if (!text || typeof text !== 'string' || text.trim().length < 1 || text.trim().length > 500) {
      return res.status(400).json({ error: '请填写完成说明（1-500字符）' });
    }

    // 校验 photoUrls
    if (photoUrls !== undefined) {
      if (!Array.isArray(photoUrls)) {
        return res.status(400).json({ error: '照片链接必须是数组' });
      }
      if (photoUrls.length > 3) {
        return res.status(400).json({ error: '最多上传3张照片' });
      }
    }

    const submission = {
      text: text.trim(),
      photoUrls: photoUrls || [],
    };

    const result = questService.submitQuest(req.user.id, questId, submission);
    res.json(result);
  } catch (e) {
    console.error('POST /api/quests/:id/submit failed:', e);
    if (e.message === '你不是该任务的挑战者') {
      return res.status(403).json({ error: e.message });
    }
    if (e.message === '该任务不在进行中' || e.message === '你已经提交过了') {
      return res.status(400).json({ error: e.message });
    }
    res.status(500).json({ error: '提交失败' });
  }
});

/**
 * POST /api/quests/:id/judge — 判定参与者完成情况
 * body: targetUserId(number), verdict('pass'|'fail')
 */
router.post('/:id/judge', (req, res) => {
  try {
    const questId = parseInt(req.params.id);
    if (!questId || questId < 1) {
      return res.status(400).json({ error: '无效的任务ID' });
    }

    const { targetUserId, verdict } = req.body;

    if (!targetUserId || typeof targetUserId !== 'number') {
      return res.status(400).json({ error: '请指定判定目标用户' });
    }

    const validVerdicts = ['pass', 'fail'];
    if (!verdict || !validVerdicts.includes(verdict)) {
      return res.status(400).json({ error: '判定结果无效，可选：pass/fail' });
    }

    const result = questService.judgeParticipant(req.user.id, questId, targetUserId, verdict);
    res.json(result);
  } catch (e) {
    console.error('POST /api/quests/:id/judge failed:', e);
    if (e.message === '不能判定自己') {
      return res.status(400).json({ error: e.message });
    }
    if (e.message === '你已经判定过该成员了') {
      return res.status(400).json({ error: e.message });
    }
    if (e.message === '该任务不在判定阶段') {
      return res.status(400).json({ error: e.message });
    }
    res.status(500).json({ error: '判定失败' });
  }
});

module.exports = router;
```

---

## 二、定时任务（新建 server/jobs/questJobs.js）

新建目录 `server/jobs/`，新建文件 `server/jobs/questJobs.js`。

三个子任务各自独立 try/catch，互不影响。每个任务内部对每条 quest 独立 transaction，单条失败不影响其他。

```js
const { db } = require('../db');
const questService = require('../services/questService');
const { getTodayUTC8 } = require('../utils/time');

/**
 * 处理投票超时的任务
 * 查询 status='voting' 且 vote_deadline 已过期的任务
 * 赞成过半（基于活跃家庭成员数）→ active，否则 → cancelled
 * bounty 类型取消时退还 bounty_stones 给发起者
 */
function handleVoteTimeout() {
  const expiredQuests = db.prepare(
    `SELECT * FROM quests WHERE status = 'voting' AND vote_deadline < datetime('now')`
  ).all();

  for (const quest of expiredQuests) {
    try {
      const settle = db.transaction(() => {
        // 统计活跃家庭成员数
        const memberCount = db.prepare(
          `SELECT COUNT(*) as cnt FROM users WHERE family_id = ? AND is_active = 1`
        ).get(quest.family_id).cnt;

        // 统计赞成票数
        const approveCount = db.prepare(
          `SELECT COUNT(*) as cnt FROM quest_participants WHERE quest_id = ? AND vote = 'approve'`
        ).get(quest.id).cnt;

        // 统计反对票数
        const rejectCount = db.prepare(
          `SELECT COUNT(*) as cnt FROM quest_participants WHERE quest_id = ? AND vote = 'reject'`
        ).get(quest.id).cnt;

        // 判定：2人家庭需全票，其他超过51%
        let passed = false;
        if (memberCount === 2) {
          passed = approveCount >= 2;
        } else {
          passed = approveCount > memberCount * 0.51;
        }

        if (passed) {
          db.prepare(`UPDATE quests SET status = 'active' WHERE id = ?`).run(quest.id);
          console.log(`[questJobs] 任务 ${quest.id} 投票通过，已激活`);
        } else {
          db.prepare(`UPDATE quests SET status = 'cancelled' WHERE id = ?`).run(quest.id);

          // bounty 类型退还灵石
          if (quest.bounty_stones > 0) {
            db.prepare(
              `UPDATE users SET spirit_stones = spirit_stones + ? WHERE id = ?`
            ).run(quest.bounty_stones, quest.creator_id);
            console.log(`[questJobs] 任务 ${quest.id} 投票未通过，退还 ${quest.bounty_stones} 灵石给用户 ${quest.creator_id}`);
          } else {
            console.log(`[questJobs] 任务 ${quest.id} 投票未通过，已取消`);
          }
        }
      });
      settle();
    } catch (e) {
      console.error(`[questJobs] handleVoteTimeout 处理任务 ${quest.id} 失败:`, e);
    }
  }
}

/**
 * 处理已过期的进行中任务
 * 查询 status='active' 且 deadline 已过期的任务
 * - 自动结算类型：调用 questService.settleQuest 计算最终结果
 * - manual 类型：未提交者 result='failed'，已提交者进入 judging，无人提交则直接 failed
 */
function handleQuestTimeout() {
  const expiredQuests = db.prepare(
    `SELECT * FROM quests WHERE status = 'active' AND deadline < datetime('now')`
  ).all();

  for (const quest of expiredQuests) {
    try {
      if (quest.goal_type !== 'manual') {
        // 自动结算类型：调用 settleQuest 全量重算并发放奖励
        questService.settleQuest(quest.id);
        console.log(`[questJobs] 任务 ${quest.id}（自动结算）已结算`);
      } else {
        // manual 类型：按提交情况处理
        const handleManual = db.transaction(() => {
          // 获取所有挑战者
          const challengers = db.prepare(
            `SELECT * FROM quest_participants WHERE quest_id = ? AND role IN ('challenger', 'bounty_taker')`
          ).all(quest.id);

          // 未提交者标记为 failed
          const unsubmitted = challengers.filter(p => !p.submission);
          for (const p of unsubmitted) {
            db.prepare(
              `UPDATE quest_participants SET result = 'failed' WHERE id = ?`
            ).run(p.id);
          }

          // 已提交者
          const submitted = challengers.filter(p => p.submission);

          if (submitted.length === 0) {
            // 无人提交，任务直接失败
            db.prepare(`UPDATE quests SET status = 'failed', completed_at = datetime('now') WHERE id = ?`).run(quest.id);

            // bounty 类型退还灵石
            if (quest.bounty_stones > 0) {
              db.prepare(
                `UPDATE users SET spirit_stones = spirit_stones + ? WHERE id = ?`
              ).run(quest.bounty_stones, quest.creator_id);
            }
            console.log(`[questJobs] 任务 ${quest.id}（手动）无人提交，已标记失败`);
          } else {
            // 有人提交，进入判定阶段
            db.prepare(`UPDATE quests SET status = 'judging' WHERE id = ?`).run(quest.id);
            console.log(`[questJobs] 任务 ${quest.id}（手动）已进入判定阶段，${submitted.length} 人已提交`);
          }
        });
        handleManual();
      }
    } catch (e) {
      console.error(`[questJobs] handleQuestTimeout 处理任务 ${quest.id} 失败:`, e);
    }
  }
}

/**
 * 为所有活跃家庭生成今日系统悬赏
 * 查询所有有活跃成员的家庭，对每个家庭调用 getDailySystemQuest
 * 已有今日任务的会被 getDailySystemQuest 内部跳过
 */
function generateDailyQuests() {
  const families = db.prepare(
    `SELECT DISTINCT family_id FROM users WHERE is_active = 1`
  ).all();

  for (const row of families) {
    try {
      questService.getDailySystemQuest(row.family_id);
    } catch (e) {
      console.error(`[questJobs] generateDailyQuests 家庭 ${row.family_id} 失败:`, e);
    }
  }

  console.log(`[questJobs] generateDailyQuests 完成，处理 ${families.length} 个家庭`);
}

/**
 * 定时任务入口，依次执行三个子任务
 * 各自独立 try/catch，单个失败不影响其他
 */
function runAll() {
  console.log(`[questJobs] 开始执行定时任务 ${new Date().toISOString()}`);
  try { handleVoteTimeout(); } catch (e) { console.error('[questJobs] handleVoteTimeout failed:', e); }
  try { handleQuestTimeout(); } catch (e) { console.error('[questJobs] handleQuestTimeout failed:', e); }
  try { generateDailyQuests(); } catch (e) { console.error('[questJobs] generateDailyQuests failed:', e); }
}

module.exports = { runAll };
```

---

## 三、挂载路由和定时任务（修改 server/index.js）

### 3.1 挂载路由

在现有路由注册区域（第 26 行 `app.use('/api/report', require('./routes/report'));` 之后），新增：

```js
app.use('/api/quests', require('./routes/quest'));
```

即在以下代码之后插入：

```js
// 找到这一行（当前第 26 行）
app.use('/api/report', require('./routes/report'));

// 在其后追加
app.use('/api/quests', require('./routes/quest'));
```

### 3.2 挂载定时任务

在 `app.listen()` 回调函数的末尾（第 49 行 `console.log('');` 之后、回调函数闭合括号之前），新增定时任务启动：

```js
// 找到这一行（当前第 49 行）
  console.log('');

// 在其后、app.listen 回调闭合括号之前追加
  // 任务系统定时任务：每10分钟检查投票超时、任务超时、生成每日悬赏
  const questJobs = require('./jobs/questJobs');
  setInterval(questJobs.runAll, 10 * 60 * 1000);
  console.log('任务系统定时任务已启动（间隔10分钟）');
```

修改后 `app.listen` 部分完整代码：

```js
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n修仙日常 服务已启动\n`);
  console.log(`本机访问: http://localhost:${PORT}`);

  // Show LAN IP for other devices
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log(`局域网访问: http://${iface.address}:${PORT}`);
      }
    }
  }
  console.log('');

  // 任务系统定时任务：每10分钟检查投票超时、任务超时、生成每日悬赏
  const questJobs = require('./jobs/questJobs');
  setInterval(questJobs.runAll, 10 * 60 * 1000);
  console.log('任务系统定时任务已启动（间隔10分钟）');
});
```

---

## 四、验证清单

完成后请验证：

1. `GET /api/quests`（需 Bearer token）返回当前家庭的任务列表，支持 status/type/page/limit 筛选
2. `GET /api/quests/daily` 返回今日系统悬赏，首次调用自动生成
3. `GET /api/quests/:id` 返回任务详情，非本家庭任务返回 403
4. `POST /api/quests` 创建任务，bounty 类型灵石不足返回 400
5. `POST /api/quests/:id/vote` 投票，重复投票返回 400，非家庭成员返回 403
6. `POST /api/quests/:id/submit` 提交完成信息，非挑战者返回 403，非 active 返回 400
7. `POST /api/quests/:id/judge` 判定，不能判自己返回 400，非 judging 返回 400
8. 定时任务每 10 分钟执行，控制台输出执行日志
9. 投票超时的任务自动激活或取消（bounty 退还灵石）
10. 过期 active 任务自动结算或进入 judging
11. `/daily` 路由不会被 `/:id` 拦截（路由注册顺序正确）
