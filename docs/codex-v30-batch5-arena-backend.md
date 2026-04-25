# Codex 指令：V1.2.7 第五批 - 后端（擂台系统）

> **需求来源**：策划案-09-修炼擂台
> **技术方案**：tech-v127-擂台系统.md
> **执行顺序**：先执行本文件（后端），再执行前端指令

---

## 一、新增擂台相关表及筹码字段（修改 server/db.js）

在 `initDB()` 末尾（`Seed default family` 之前）新增：

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

## 二、新建 server/services/arenaService.js

完整文件内容：

```js
const { db } = require('../db');

// 创建擂台
function createArena({ familyId, creatorId, type, title, description, config, currency, rewardPool }) {
  if (!['quiz', 'match', 'fitness'].includes(type)) {
    throw new Error('无效的擂台类型');
  }

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

    db.prepare(`
      INSERT INTO arena_participants (arena_id, user_id) VALUES (?, ?)
    `).run(result.lastInsertRowid, creatorId);

    return { id: result.lastInsertRowid };
  });

  return txn();
}

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

  for (const p of participants) {
    p.submission = p.submission ? JSON.parse(p.submission) : null;
  }

  return { ...arena, participants };
}

function joinArena(arenaId, userId) {
  const arena = db.prepare('SELECT * FROM arenas WHERE id = ?').get(arenaId);
  if (!arena) throw new Error('擂台不存在');
  if (arena.status !== 'active') throw new Error('擂台已结束');

  const existing = db.prepare(
    'SELECT id FROM arena_participants WHERE arena_id = ? AND user_id = ?'
  ).get(arenaId, userId);
  if (existing) throw new Error('已加入该擂台');

  db.prepare(
    'INSERT INTO arena_participants (arena_id, user_id) VALUES (?, ?)'
  ).run(arenaId, userId);

  return { success: true };
}

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

function judgeQuiz(arenaId, creatorId, judgments) {
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

function settleArena(arenaId, creatorId, settlements) {
  const arena = db.prepare('SELECT * FROM arenas WHERE id = ?').get(arenaId);
  if (!arena) throw new Error('擂台不存在');
  if (arena.creator_id !== creatorId) throw new Error('仅创建者可结算');
  if (arena.status !== 'active') throw new Error('擂台已结束');

  const txn = db.transaction(() => {
    const updateParticipant = db.prepare(
      'UPDATE arena_participants SET result = ?, currency_change = ? WHERE arena_id = ? AND user_id = ?'
    );

    if (arena.currency === 'chips') {
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

    db.prepare(
      "UPDATE arenas SET status = 'completed', completed_at = datetime('now') WHERE id = ?"
    ).run(arenaId);
  });

  txn();
  return { success: true };
}

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

---

## 三、新建 server/routes/arena.js

完整文件内容：

```js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const arenaService = require('../services/arenaService');

router.use(authMiddleware);

// GET /api/arenas
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

// POST /api/arenas
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

// GET /api/arenas/:id
router.get('/:id', (req, res) => {
  try {
    const arena = arenaService.getArena(parseInt(req.params.id));
    if (!arena) return res.status(404).json({ error: '擂台不存在' });
    res.json(arena);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/arenas/:id/join
router.post('/:id/join', (req, res) => {
  try {
    const result = arenaService.joinArena(parseInt(req.params.id), req.user.id);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// POST /api/arenas/:id/submit
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

// POST /api/arenas/:id/judge
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

// POST /api/arenas/:id/settle
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

// POST /api/arenas/:id/cancel
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

## 四、注册路由（修改 server/index.js）

在现有路由注册区域（`app.use('/api/behavior-goal', ...)` 之后）新增一行：

```js
app.use('/api/arenas', require('./routes/arena'));
```

---

## 五、验证清单

1. 服务器启动无报错，arenas 和 arena_participants 表自动创建，users 表新增 chips 字段
2. `POST /api/arenas` 创建擂台成功，创建者自动加入参与者列表
3. `GET /api/arenas` 返回当前家庭的擂台列表，支持 `?status=active` 过滤
4. `GET /api/arenas/:id` 返回擂台详情，包含 participants 数组及解析后的 config/submission
5. `POST /api/arenas/:id/join` 加入擂台，重复加入返回错误
6. `POST /api/arenas/:id/submit` 提交结果，未加入者返回错误
7. `POST /api/arenas/:id/judge` 仅 quiz 类型、仅出题者可判定
8. `POST /api/arenas/:id/settle` 结算擂台：stones 模式按奖池均分给赢家，chips 模式零和校验后更新 users.chips
9. `POST /api/arenas/:id/cancel` 仅创建者可取消，状态变为 cancelled
10. 擂台类型限制：仅 quiz/match/fitness 三种，chips 货币仅 match 类型可用
