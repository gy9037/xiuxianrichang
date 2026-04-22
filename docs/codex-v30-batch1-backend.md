# Codex 指令：V1.2.7 第一批 - 后端（货币系统 + 签到系统）

> **关联决策**：评审总结 §11（签到+货币）、§12（工作流程约定）
> **执行顺序**：先执行本文件（后端），再执行前端指令

---

## 一、数据库改动（server/db.js）

### 1.1 users 表新增 spirit_stones 字段

在 `initDB()` 函数的迁移区域（`ALTER TABLE` 部分，约 231 行之后）新增：

```js
// 灵石货币字段
try {
  db.exec(`ALTER TABLE users ADD COLUMN spirit_stones INTEGER DEFAULT 0`);
} catch (e) {
  // 列已存在，忽略
}
```

### 1.2 新增签到记录表

在 `initDB()` 的 `CREATE TABLE` 区域（`behavior_reactions` 表之后）新增：

```sql
CREATE TABLE IF NOT EXISTS checkins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  checkin_date TEXT NOT NULL,
  streak INTEGER NOT NULL DEFAULT 1,
  reward INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, checkin_date),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

字段说明：
- `checkin_date`：签到日期，格式 `YYYY-MM-DD`（UTC+8 自然日）
- `streak`：当次签到时的连续天数
- `reward`：当次发放的灵石数量

---

## 二、签到服务（新建 server/services/checkinService.js）

新建文件 `server/services/checkinService.js`，实现签到核心逻辑：

```js
const { db } = require('../db');

/**
 * 计算用户当前连续签到天数
 * 从昨天往前逐日检查 checkins 表是否有记录，遇到断点停止
 * @param {number} userId
 * @param {string} today - 格式 YYYY-MM-DD
 * @returns {number} 连续天数（不含今天）
 */
function getStreak(userId, today) {
  let streak = 0;
  let checkDate = new Date(today + 'T00:00:00+08:00');

  while (true) {
    checkDate.setDate(checkDate.getDate() - 1);
    const dateStr = formatDate(checkDate);
    const row = db.prepare('SELECT id FROM checkins WHERE user_id = ? AND checkin_date = ?').get(userId, dateStr);
    if (row) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

/**
 * 根据连续天数计算灵石奖励
 * 1-5天：1灵石，6-10天：2灵石，11-20天：3灵石，21天+：5灵石
 * @param {number} streak - 含今天的连续天数
 * @returns {number}
 */
function calcReward(streak) {
  if (streak >= 21) return 5;
  if (streak >= 11) return 3;
  if (streak >= 6) return 2;
  return 1;
}

/**
 * 执行签到（幂等：同一天重复调用不会重复发放）
 * @param {number} userId
 * @returns {{ alreadyCheckedIn: boolean, streak: number, reward: number, totalStones: number }}
 */
function doCheckin(userId) {
  const today = getTodayUTC8();

  // 检查今天是否已签到
  const existing = db.prepare('SELECT id, streak, reward FROM checkins WHERE user_id = ? AND checkin_date = ?').get(userId, today);
  if (existing) {
    const user = db.prepare('SELECT spirit_stones FROM users WHERE id = ?').get(userId);
    return {
      alreadyCheckedIn: true,
      streak: existing.streak,
      reward: existing.reward,
      totalStones: user.spirit_stones,
    };
  }

  // 计算连续天数（昨天往前的连续天数 + 今天 = 总连续天数）
  const prevStreak = getStreak(userId, today);
  const streak = prevStreak + 1;
  const reward = calcReward(streak);

  // 事务：插入签到记录 + 增加灵石
  const transaction = db.transaction(() => {
    db.prepare('INSERT INTO checkins (user_id, checkin_date, streak, reward) VALUES (?, ?, ?, ?)').run(userId, today, streak, reward);
    db.prepare('UPDATE users SET spirit_stones = spirit_stones + ? WHERE id = ?').run(reward, userId);
  });
  transaction();

  const user = db.prepare('SELECT spirit_stones FROM users WHERE id = ?').get(userId);

  return {
    alreadyCheckedIn: false,
    streak,
    reward,
    totalStones: user.spirit_stones,
  };
}

/**
 * 获取用户签到状态（不执行签到）
 */
function getCheckinStatus(userId) {
  const today = getTodayUTC8();
  const existing = db.prepare('SELECT streak, reward FROM checkins WHERE user_id = ? AND checkin_date = ?').get(userId, today);
  const user = db.prepare('SELECT spirit_stones FROM users WHERE id = ?').get(userId);

  if (existing) {
    return {
      checkedInToday: true,
      streak: existing.streak,
      reward: existing.reward,
      totalStones: user.spirit_stones,
    };
  }

  // 未签到，预计算如果签到会是什么结果
  const prevStreak = getStreak(userId, today);
  const nextStreak = prevStreak + 1;
  const nextReward = calcReward(nextStreak);

  return {
    checkedInToday: false,
    streak: prevStreak,
    nextStreak,
    nextReward,
    totalStones: user.spirit_stones,
  };
}

/**
 * 获取当前 UTC+8 日期字符串
 */
function getTodayUTC8() {
  const now = new Date();
  const utc8 = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return formatDate(utc8);
}

function formatDate(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

module.exports = { doCheckin, getCheckinStatus, getTodayUTC8 };
```

---

## 三、签到路由（新建 server/routes/checkin.js）

新建文件 `server/routes/checkin.js`：

```js
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
```

---

## 四、注册路由（修改 server/index.js）

在现有路由注册区域（约第 22 行 `app.use('/api/upload', ...)` 之后）新增：

```js
app.use('/api/checkin', require('./routes/checkin'));
```

---

## 五、character 接口增加灵石和签到信息（修改 server/routes/character.js）

在 `GET /character` 的返回值中增加 `spiritStones` 和 `checkinStatus` 字段。

找到 `GET /character` 路由处理函数中构建返回对象的位置，增加：

```js
const { getCheckinStatus } = require('../services/checkinService');

// 在返回 res.json 之前获取签到状态
const checkinStatus = getCheckinStatus(req.user.id);
```

在返回的 JSON 对象中增加两个字段：

```js
spiritStones: user.spirit_stones,
checkinStatus: checkinStatus,
```

---

## 六、行为提交时自动触发签到（修改 server/routes/behavior.js）

在 `POST /behavior` 路由的成功返回之前，调用签到服务：

```js
const { doCheckin } = require('../services/checkinService');

// 在行为记录插入成功后、返回响应之前
const checkinResult = doCheckin(req.user.id);
```

在返回的 JSON 对象中增加 `checkinResult` 字段：

```js
checkinResult: checkinResult,
```

前端根据 `checkinResult.alreadyCheckedIn` 判断是否需要展示签到特效：
- `false`：今天首次签到，展示特效
- `true`：今天已签到过，不展示

---

## 七、验证清单

完成后请验证：

1. `GET /api/checkin/status`（需 Bearer token）返回签到状态
2. `POST /api/checkin`（需 Bearer token）执行签到，返回 streak + reward + totalStones
3. 重复调用 `POST /api/checkin` 不会重复发放灵石（幂等）
4. `POST /api/behavior` 提交行为后，返回值包含 `checkinResult`
5. `GET /api/character` 返回值包含 `spiritStones` 和 `checkinStatus`
6. 数据库 users 表有 `spirit_stones` 字段，checkins 表正常创建
