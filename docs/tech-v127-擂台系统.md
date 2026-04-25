# 技术方案：V1.2.7 擂台系统

> 需求来源：策划案-09-修炼擂台
> 优先级：P2
> 影响范围：新增擂台服务、擂台路由、擂台页面、数据库 arenas/arena_participants 表、users 表新增 chips 字段
> 新增文件：`server/services/arenaService.js`、`server/routes/arena.js`、`miniprogram/pages/arena/`
> 修改文件：`server/db.js`、`server/index.js`、`miniprogram/app.json`、`miniprogram/pages/family/family.wxml`、`miniprogram/pages/family/family.js`

---

## 一、概述

### 1.1 功能目标

擂台系统是即时竞技系统，与任务系统互补。支持三种类型：出题挑战（quiz）、对局记录（match）、体能比拼（fitness）。参与者在家庭内发起擂台、提交成绩或答案，由系统或发起者判定结果后结算奖励。

### 1.2 设计约束

- 擂台仅在家庭内可见，family_id 隔离
- 灵石操作直接更新 users.spirit_stones，与签到系统一致
- 筹码（chips）为麻将等对局场景专用货币，与灵石完全独立，不可兑换，参与者之间零和流转
- 筹码存储在 users 表新增的 chips 字段中，用 ALTER TABLE 迁移
- 所有数据库写操作用 db.transaction() 包裹
- 证据图片复用 /api/upload/image 接口
- 时区用 datetime('now') 存储（UTC），前端展示时转换

### 1.3 待讨论事项的技术建议

| 事项 | 建议 | 理由 |
|------|------|------|
| 筹码初始分配 | 1000 | 麻将场景下足够流转，数值不会太快归零 |
| 灵石奖池来源 | 系统产出 | 创建擂台时由系统发放奖池，不从参与者扣除，简化实现，避免退出退款等边界情况 |
| 体能比拼成绩 | 统一为整数 | 单位由创建者在 title/description 中说明（如"俯卧撑/个"、"平板撑/秒"） |
| 历史战绩统计 | V1 不做 | 通过擂台列表的 completed 状态筛选即可，后续版本按需扩展 |

---

## 二、数据设计

### 2.1 新增表：arenas

在 `server/db.js` 的 `initDB()` 中添加：

```sql
CREATE TABLE IF NOT EXISTS arenas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL,
  creator_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  config TEXT,
  currency TEXT DEFAULT 'stones',
  reward_pool INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  started_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT,
  FOREIGN KEY (family_id) REFERENCES families(id),
  FOREIGN KEY (creator_id) REFERENCES users(id)
);
```

字段说明：

- `type`：'quiz' | 'match' | 'fitness'
- `config`：JSON 字符串，类型特定配置（见 2.3）
- `currency`：'stones' | 'chips'，仅 match 类型可选 chips
- `reward_pool`：灵石奖池数量（仅 currency='stones' 时有效）
- `status`：'active' | 'completed' | 'cancelled'

### 2.2 新增表：arena_participants

```sql
CREATE TABLE IF NOT EXISTS arena_participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  arena_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  submission TEXT,
  result TEXT,
  currency_change INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(arena_id, user_id),
  FOREIGN KEY (arena_id) REFERENCES arenas(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

字段说明：

- `submission`：JSON 字符串，提交内容（见 2.4）
- `result`：'win' | 'lose' | 'draw' | null（未判定）
- `currency_change`：结算后的货币变动量（正数为获得，负数为扣除）

### 2.3 config 字段 JSON 结构

quiz 类型：
```json
{
  "question": "今天背了几首诗？",
  "answer_type": "text",
  "correct_answer": "3"
}
```
- `question`：题目内容
- `answer_type`：'text'（文字答案）
- `correct_answer`：参考答案（出题者判定时参考，不做自动比对）

match 类型：
```json
{
  "game": "mahjong",
  "ended_at": null
}
```
- `game`：游戏名称（自由填写，如 mahjong、boardgame）
- `ended_at`：对局结束时间，结算时写入

fitness 类型：
```json
{
  "metric": "pushups",
  "unit": "个",
  "deadline": "2026-04-25T23:59:59"
}
```
- `metric`：比拼项目名称
- `unit`：单位说明（仅展示用）
- `deadline`：截止时间（可选，不设则手动结算）

### 2.4 submission 字段 JSON 结构

quiz：
```json
{
  "text": "3",
  "photo_urls": []
}
```

match：
```json
{
  "score": null,
  "note": "自摸清一色"
}
```

fitness：
```json
{
  "score": 50,
  "photo_urls": ["https://r2.example.com/images/xxx.jpg"]
}
```

### 2.5 users 表新增 chips 字段

增量迁移，在 initDB() 中用 try/catch 包裹：

```sql
ALTER TABLE users ADD COLUMN chips INTEGER DEFAULT 0;
```

---

## 三、后端实现

### 3.1 server/services/arenaService.js

```js
const { db } = require('../db');

// 创建擂台
function createArena({ familyId, creatorId, type, title, description, config, currency, rewardPool }) {
  // 校验 type
  if (!['quiz', 'match', 'fitness'].includes(type)) {
    throw new Error('无效的擂台类型');
  }

  // 仅 match 类型可选 chips
  if (currency === 'chips' && type !== 'match') {
    throw new Error('仅对局记录可使用筹码');
  }
  if (!currency) currency = 'stones';
  if (!rewardPool) rewardPool = 0;

  const configStr = config ? JSON.stringify(config) : null;

  const txn = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO arenas (family_id, creator_id, type, title, description, config, currency, reward_pool)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(familyId, creatorId, type, title, description || null, configStr, currency, rewardPool);

    // 创建者自动加入
    db.prepare(`
      INSERT INTO arena_participants (arena_id, user_id) VALUES (?, ?)
    `).run(result.lastInsertRowid, creatorId);

    return { id: result.lastInsertRowid };
  });

  return txn();
}

// 擂台列表
function listArenas(familyId, status) {
  let sql = `
    SELECT a.*, u.nickname AS creator_name,
      (SELECT COUNT(*) FROM arena_participants WHERE arena_id = a.id) AS participant_count
    FROM arenas a
    JOIN users u ON u.id = a.creator_id
    WHERE a.family_id = ?
  `;
  const params = [familyId];

  if (status) {
    sql += ' AND a.status = ?';
    params.push(status);
  }

  sql += ' ORDER BY a.started_at DESC';
  return db.prepare(sql).all(...params);
}

// 擂台详情
function getArena(arenaId) {
  const arena = db.prepare(`
    SELECT a.*, u.nickname AS creator_name
    FROM arenas a
    JOIN users u ON u.id = a.creator_id
    WHERE a.id = ?
  `).get(arenaId);

  if (!arena) return null;

  arena.config = arena.config ? JSON.parse(arena.config) : null;

  const participants = db.prepare(`
    SELECT ap.*, u.nickname, u.avatar
    FROM arena_participants ap
    JOIN users u ON u.id = ap.user_id
    WHERE ap.arena_id = ?
    ORDER BY ap.created_at ASC
  `).all(arenaId);

  // 解析 submission JSON
  for (const p of participants) {
    p.submission = p.submission ? JSON.parse(p.submission) : null;
  }

  return { ...arena, participants };
}

// 加入擂台
function joinArena(arenaId, userId) {
  const arena = db.prepare('SELECT * FROM arenas WHERE id = ?').get(arenaId);
  if (!arena) throw new Error('擂台不存在');
  if (arena.status !== 'active') throw new Error('擂台已结束');

  // 检查是否已加入
  const existing = db.prepare(
    'SELECT id FROM arena_participants WHERE arena_id = ? AND user_id = ?'
  ).get(arenaId, userId);
  if (existing) throw new Error('已加入该擂台');

  db.prepare(
    'INSERT INTO arena_participants (arena_id, user_id) VALUES (?, ?)'
  ).run(arenaId, userId);

  return { success: true };
}

// 提交成绩/答案
function submitResult(arenaId, userId, submission) {
  const arena = db.prepare('SELECT * FROM arenas WHERE id = ?').get(arenaId);
  if (!arena) throw new Error('擂台不存在');
  if (arena.status !== 'active') throw new Error('擂台已结束');

  const participant = db.prepare(
    'SELECT id FROM arena_participants WHERE arena_id = ? AND user_id = ?'
  ).get(arenaId, userId);
  if (!participant) throw new Error('未加入该擂台');

  db.prepare(`
    UPDATE arena_participants SET submission = ? WHERE arena_id = ? AND user_id = ?
  `).run(JSON.stringify(submission), arenaId, userId);

  return { success: true };
}

// 出题者判定（仅 quiz）
function judgeQuiz(arenaId, creatorId, judgments) {
  // judgments: [{ userId, result: 'win'|'lose' }]
  const arena = db.prepare('SELECT * FROM arenas WHERE id = ?').get(arenaId);
  if (!arena) throw new Error('擂台不存在');
  if (arena.type !== 'quiz') throw new Error('仅出题挑战支持判定');
  if (arena.creator_id !== creatorId) throw new Error('仅出题者可判定');
  if (arena.status !== 'active') throw new Error('擂台已结束');

  const updateStmt = db.prepare(
    'UPDATE arena_participants SET result = ? WHERE arena_id = ? AND user_id = ?'
  );

  const txn = db.transaction(() => {
    for (const j of judgments) {
      if (!['win', 'lose', 'draw'].includes(j.result)) {
        throw new Error(`无效的判定结果: ${j.result}`);
      }
      updateStmt.run(j.result, arenaId, j.userId);
    }
  });

  txn();
  return { success: true };
}

// 结算擂台
function settleArena(arenaId, creatorId, settlements) {
  // settlements: [{ userId, result: 'win'|'lose'|'draw', currencyChange: number }]
  // 对于 fitness 类型，settlements 由调用方根据排名计算好传入
  // 对于 match 类型，settlements 由创建者手动指定

  const arena = db.prepare('SELECT * FROM arenas WHERE id = ?').get(arenaId);
  if (!arena) throw new Error('擂台不存在');
  if (arena.creator_id !== creatorId) throw new Error('仅创建者可结算');
  if (arena.status !== 'active') throw new Error('擂台已结束');

  const config = arena.config ? JSON.parse(arena.config) : {};

  const txn = db.transaction(() => {
    const updateParticipant = db.prepare(
      'UPDATE arena_participants SET result = ?, currency_change = ? WHERE arena_id = ? AND user_id = ?'
    );

    if (arena.currency === 'chips') {
      // 筹码模式：零和流转，校验总和为 0
      const totalChange = settlements.reduce((sum, s) => sum + (s.currencyChange || 0), 0);
      if (totalChange !== 0) {
        throw new Error('筹码结算总和必须为零');
      }

      const updateChips = db.prepare(
        'UPDATE users SET chips = chips + ? WHERE id = ?'
      );

      for (const s of settlements) {
        updateParticipant.run(s.result, s.currencyChange || 0, arenaId, s.userId);
        if (s.currencyChange) {
          updateChips.run(s.currencyChange, s.userId);
        }
      }
    } else {
      // 灵石模式：系统奖池发放
      const winners = settlements.filter(s => s.result === 'win');
      let rewardPerWinner = 0;
      if (winners.length > 0 && arena.reward_pool > 0) {
        rewardPerWinner = Math.floor(arena.reward_pool / winners.length);
      }

      const updateStones = db.prepare(
        'UPDATE users SET spirit_stones = spirit_stones + ? WHERE id = ?'
      );

      for (const s of settlements) {
        const change = s.result === 'win' ? rewardPerWinner : 0;
        updateParticipant.run(s.result, change, arenaId, s.userId);
        if (change > 0) {
          updateStones.run(change, s.userId);
        }
      }
    }

    // 标记擂台完成
    db.prepare(
      "UPDATE arenas SET status = 'completed', completed_at = datetime('now') WHERE id = ?"
    ).run(arenaId);
  });

  txn();
  return { success: true };
}

// 取消擂台
function cancelArena(arenaId, creatorId) {
  const arena = db.prepare('SELECT * FROM arenas WHERE id = ?').get(arenaId);
  if (!arena) throw new Error('擂台不存在');
  if (arena.creator_id !== creatorId) throw new Error('仅创建者可取消');
  if (arena.status !== 'active') throw new Error('擂台已结束');

  db.prepare(
    "UPDATE arenas SET status = 'cancelled', completed_at = datetime('now') WHERE id = ?"
  ).run(arenaId);

  return { success: true };
}

module.exports = {
  createArena,
  listArenas,
  getArena,
  joinArena,
  submitResult,
  judgeQuiz,
  settleArena,
  cancelArena,
};
```

### 3.2 server/routes/arena.js

```js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const arenaService = require('../services/arenaService');

router.use(authMiddleware);

// GET /api/arenas - 擂台列表
router.get('/', (req, res) => {
  try {
    const user = req.user;
    if (!user.family_id) return res.status(400).json({ error: '未加入家庭' });

    const status = req.query.status || null;
    const arenas = arenaService.listArenas(user.family_id, status);
    res.json({ arenas });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/arenas - 创建擂台
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
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// GET /api/arenas/:id - 擂台详情
router.get('/:id', (req, res) => {
  try {
    const arena = arenaService.getArena(parseInt(req.params.id));
    if (!arena) return res.status(404).json({ error: '擂台不存在' });
    res.json(arena);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/arenas/:id/join - 加入擂台
router.post('/:id/join', (req, res) => {
  try {
    const result = arenaService.joinArena(parseInt(req.params.id), req.user.id);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// POST /api/arenas/:id/submit - 提交成绩/答案
router.post('/:id/submit', (req, res) => {
  try {
    const { submission } = req.body;
    if (!submission) return res.status(400).json({ error: '缺少提交内容' });

    const result = arenaService.submitResult(parseInt(req.params.id), req.user.id, submission);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// POST /api/arenas/:id/judge - 出题者判定（仅 quiz）
router.post('/:id/judge', (req, res) => {
  try {
    const { judgments } = req.body;
    if (!judgments || !Array.isArray(judgments)) {
      return res.status(400).json({ error: '缺少判定数据' });
    }

    const result = arenaService.judgeQuiz(parseInt(req.params.id), req.user.id, judgments);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// POST /api/arenas/:id/settle - 结算
router.post('/:id/settle', (req, res) => {
  try {
    const { settlements } = req.body;
    if (!settlements || !Array.isArray(settlements)) {
      return res.status(400).json({ error: '缺少结算数据' });
    }

    const result = arenaService.settleArena(parseInt(req.params.id), req.user.id, settlements);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// POST /api/arenas/:id/cancel - 取消擂台
router.post('/:id/cancel', (req, res) => {
  try {
    const result = arenaService.cancelArena(parseInt(req.params.id), req.user.id);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
```

---

## 四、前端实现

### 4.1 新增页面

`miniprogram/pages/arena/arena.js`、`arena.json`、`arena.wxml`、`arena.wxss`

在 `app.json` 的 pages 数组中添加：
```json
"pages/arena/arena"
```

### 4.2 页面结构

擂台页面分两个视图，通过页面参数切换：

1. 擂台列表视图（默认）：展示当前家庭的所有擂台，顶部 tab 切换 active/completed
2. 擂台详情视图（带 id 参数）：展示擂台信息、参与者列表、提交/判定/结算操作

### 4.3 入口

从家庭页进入。在家庭页添加"擂台"入口按钮，点击跳转到擂台列表页。

```js
// family.js 中新增
goToArena() {
  wx.navigateTo({ url: '/pages/arena/arena' });
}
```

### 4.4 关键交互流程

#### 4.4.1 创建擂台

```js
async createArena() {
  // 弹出表单：选择类型、填写标题、描述
  // 根据类型展示不同的 config 表单
  // quiz: 填写题目、参考答案
  // match: 选择货币类型（灵石/筹码）
  // fitness: 填写比拼项目、单位
  const data = { type, title, description, config, currency, rewardPool };
  const res = await api.post('/arenas', data);
  // 跳转到详情页
  wx.navigateTo({ url: `/pages/arena/arena?id=${res.id}` });
}
```

#### 4.4.2 提交成绩/答案

```js
async submitResult() {
  const submission = {};

  if (this.data.arena.type === 'quiz') {
    submission.text = this.data.answerText;
  } else if (this.data.arena.type === 'fitness') {
    submission.score = parseInt(this.data.scoreInput);
  }

  // 可选：上传证据图片
  // 前端调用 wx.uploadFile 上传到 /api/upload/image，获取返回的 url
  if (this.data.evidenceImage) {
    const uploadRes = await new Promise((resolve, reject) => {
      wx.uploadFile({
        url: api.BASE_URL + '/upload/image',
        filePath: this.data.evidenceImage,
        name: 'image',
        header: { Authorization: 'Bearer ' + api.token },
        success: (res) => resolve(JSON.parse(res.data)),
        fail: reject,
      });
    });
    submission.photo_urls = [uploadRes.url];
  }

  await api.post(`/arenas/${this.data.arena.id}/submit`, { submission });
  this.loadArenaDetail(); // 刷新
}
```

#### 4.4.3 出题者判定（quiz）

```js
async judgeSubmissions() {
  // 展示每个参与者的提交内容
  // 出题者逐个标记 win/lose
  const judgments = this.data.participants
    .filter(p => p.id !== this.data.arena.creator_id)
    .map(p => ({ userId: p.user_id, result: p.judgeResult }));

  await api.post(`/arenas/${this.data.arena.id}/judge`, { judgments });
  this.loadArenaDetail();
}
```

#### 4.4.4 结算

```js
async settleArena() {
  let settlements;

  if (this.data.arena.type === 'fitness') {
    // 按 score 排名，第一名 win，其余 lose
    const sorted = [...this.data.participants]
      .filter(p => p.submission)
      .sort((a, b) => b.submission.score - a.submission.score);
    settlements = sorted.map((p, i) => ({
      userId: p.user_id,
      result: i === 0 ? 'win' : 'lose',
      currencyChange: 0, // 灵石由 service 层按奖池均分
    }));
  } else if (this.data.arena.currency === 'chips') {
    // 筹码模式：创建者手动输入每人的变动量
    settlements = this.data.participants.map(p => ({
      userId: p.user_id,
      result: p.chipChange > 0 ? 'win' : (p.chipChange < 0 ? 'lose' : 'draw'),
      currencyChange: p.chipChange,
    }));
  } else {
    // 灵石模式：使用已判定的 result
    settlements = this.data.participants.map(p => ({
      userId: p.user_id,
      result: p.result || 'lose',
      currencyChange: 0,
    }));
  }

  await api.post(`/arenas/${this.data.arena.id}/settle`, { settlements });
  this.loadArenaDetail();
}
```

---

## 五、db.js 改动

在 `initDB()` 末尾添加：

```js
// 擂台系统
db.exec(`
  CREATE TABLE IF NOT EXISTS arenas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_id INTEGER NOT NULL,
    creator_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    config TEXT,
    currency TEXT DEFAULT 'stones',
    reward_pool INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    started_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT,
    FOREIGN KEY (family_id) REFERENCES families(id),
    FOREIGN KEY (creator_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS arena_participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    arena_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    submission TEXT,
    result TEXT,
    currency_change INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(arena_id, user_id),
    FOREIGN KEY (arena_id) REFERENCES arenas(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// 筹码字段迁移
try {
  db.exec('ALTER TABLE users ADD COLUMN chips INTEGER DEFAULT 0');
} catch (e) {
  // 字段已存在，忽略
}
```

---

## 六、index.js 改动

在路由注册区域添加：

```js
app.use('/api/arenas', require('./routes/arena'));
```

---

## 七、改动文件清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新增 | `server/services/arenaService.js` | 擂台业务逻辑（创建、加入、提交、判定、结算、取消） |
| 新增 | `server/routes/arena.js` | 8 个 API 端点（含取消） |
| 新增 | `miniprogram/pages/arena/arena.js` | 擂台页面逻辑 |
| 新增 | `miniprogram/pages/arena/arena.json` | 页面配置 |
| 新增 | `miniprogram/pages/arena/arena.wxml` | 页面模板 |
| 新增 | `miniprogram/pages/arena/arena.wxss` | 页面样式 |
| 修改 | `server/db.js` | initDB 中新增 arenas、arena_participants 表 + users.chips 迁移 |
| 修改 | `server/index.js` | 注册 /api/arenas 路由 |
| 修改 | `miniprogram/app.json` | pages 数组新增 arena 页面 |
| 修改 | `miniprogram/pages/family/family.wxml` | 新增擂台入口按钮 |
| 修改 | `miniprogram/pages/family/family.js` | 新增跳转擂台页逻辑 |

---

## 八、测试要点

1. 创建擂台：三种类型分别创建，验证 config 正确存储，创建者自动加入参与者列表
2. 加入擂台：验证重复加入拦截，已结束擂台不可加入
3. 提交成绩：quiz 提交文字答案，fitness 提交数字成绩，验证 submission JSON 正确存储
4. 证据图片：通过 /api/upload/image 上传后将 URL 写入 submission.photo_urls，验证图片可访问
5. quiz 判定：仅创建者可判定，非 quiz 类型调用 judge 接口返回错误
6. 灵石结算：创建奖池 100 灵石、2 人获胜，验证每人获得 50 灵石，users.spirit_stones 正确更新
7. 筹码结算：三人对局，A +500 B -200 C -300，验证总和为零，users.chips 正确更新；总和非零时拒绝结算
8. 取消擂台：验证状态变更为 cancelled，不触发任何货币变动
9. 事务完整性：结算过程中模拟部分失败（如某用户不存在），验证整个事务回滚
10. 家庭隔离：A 家庭的擂台在 B 家庭的列表中不可见
