# Codex 指令：V3.0 第三批 - 后端（快捷按钮置顶 + 行为备注 + 月度目标）

> **关联决策**：评审总结 §16（策划案-05 行为自定义增强）
> **执行顺序**：先执行本文件（后端），再执行前端指令

---

## 一、行为备注字段（修改 server/db.js）

behaviors 表已有 `description` 字段（TEXT DEFAULT ''），当前用于存储备注。无需新增字段。

但当前 `POST /behavior` 提交时 description 有 200 字的前端限制。**后端不做字数限制**，前端也取消限制（见前端指令）。

**后端无需改动。**

---

## 二、快捷按钮置顶（修改 server/routes/character.js + server/routes/behavior.js）

### 2.1 characters 表新增 pinned_behaviors 字段（修改 server/db.js）

在 `initDB()` 的迁移区域新增：

```js
// 快捷按钮置顶
try {
  db.exec(`ALTER TABLE characters ADD COLUMN pinned_behaviors TEXT DEFAULT '[]'`);
} catch (e) {
  // 列已存在，忽略
}
```

### 2.2 GET /character 返回 pinned_behaviors（修改 server/routes/character.js）

在 `GET /` 路由的返回对象中，增加 `pinnedBehaviors` 字段。

找到构建返回对象的位置，增加：

```js
let pinnedBehaviors = [];
try {
  pinnedBehaviors = JSON.parse(character.pinned_behaviors || '[]');
} catch (e) {
  pinnedBehaviors = [];
}
```

在 `res.json` 的返回对象中增加：

```js
pinnedBehaviors,
```

### 2.3 新增置顶接口（修改 server/routes/character.js）

在现有路由之后新增：

```js
// PATCH /api/character/pin-behavior — 更新置顶行为
router.patch('/pin-behavior', (req, res) => {
  const { pinnedBehaviors } = req.body;

  if (!Array.isArray(pinnedBehaviors)) {
    return res.status(400).json({ error: 'pinnedBehaviors 必须是数组' });
  }
  if (pinnedBehaviors.length > 2) {
    return res.status(400).json({ error: '最多置顶 2 个行为' });
  }
  // 验证每项格式：{ category, sub_type }
  for (const item of pinnedBehaviors) {
    if (!item.category || !item.sub_type) {
      return res.status(400).json({ error: '每项需包含 category 和 sub_type' });
    }
  }

  db.prepare('UPDATE characters SET pinned_behaviors = ? WHERE user_id = ?')
    .run(JSON.stringify(pinnedBehaviors), req.user.id);

  res.json({ pinnedBehaviors });
});
```

### 2.4 GET /behavior/shortcuts 返回时合并置顶（修改 server/routes/behavior.js）

修改 `GET /shortcuts` 路由，将置顶行为排在最前面：

```js
router.get('/shortcuts', (req, res) => {
  // 获取置顶行为
  const charRow = db.prepare('SELECT pinned_behaviors FROM characters WHERE user_id = ?').get(req.user.id);
  let pinned = [];
  try {
    pinned = JSON.parse(charRow?.pinned_behaviors || '[]');
  } catch (e) {
    pinned = [];
  }

  // 获取频次排序的快捷行为
  const frequentShortcuts = db.prepare(`
    SELECT category, sub_type, use_count, last_used_at
    FROM user_behavior_shortcuts
    WHERE user_id = ?
    ORDER BY use_count DESC, last_used_at DESC
    LIMIT 10
  `).all(req.user.id);

  // 合并：置顶在前，其余按频次排序（去重），总共最多 5 个
  const result = [];
  const seen = new Set();

  // 先加置顶
  for (const p of pinned) {
    const key = `${p.category}|${p.sub_type}`;
    if (!seen.has(key)) {
      seen.add(key);
      const freq = frequentShortcuts.find(s => s.category === p.category && s.sub_type === p.sub_type);
      result.push({
        category: p.category,
        sub_type: p.sub_type,
        use_count: freq ? freq.use_count : 0,
        last_used_at: freq ? freq.last_used_at : null,
        pinned: true,
      });
    }
  }

  // 再加频次排序的（去重）
  for (const s of frequentShortcuts) {
    const key = `${s.category}|${s.sub_type}`;
    if (!seen.has(key) && result.length < 5) {
      seen.add(key);
      result.push({
        category: s.category,
        sub_type: s.sub_type,
        use_count: s.use_count,
        last_used_at: s.last_used_at,
        pinned: false,
      });
    }
  }

  res.json(result);
});
```

---

## 三、月度目标（新建 server/routes/behaviorGoal.js）

### 3.1 新增 behavior_goals 表（修改 server/db.js）

在 `initDB()` 的 `CREATE TABLE` 区域新增：

```sql
CREATE TABLE IF NOT EXISTS behavior_goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  sub_type TEXT NOT NULL,
  target_count INTEGER NOT NULL,
  period_key TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, sub_type, period_key),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### 3.2 新建路由文件 server/routes/behaviorGoal.js

```js
const express = require('express');
const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

/**
 * 获取当前月份 key，格式 YYYY-MM
 */
function getCurrentPeriodKey() {
  const now = new Date();
  const utc8 = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return `${utc8.getUTCFullYear()}-${String(utc8.getUTCMonth() + 1).padStart(2, '0')}`;
}

// GET /api/behavior-goal/current — 获取当月所有目标及进度
router.get('/current', (req, res) => {
  const periodKey = getCurrentPeriodKey();

  const goals = db.prepare(
    'SELECT * FROM behavior_goals WHERE user_id = ? AND period_key = ?'
  ).all(req.user.id, periodKey);

  // 查询当月各 sub_type 的完成次数
  const monthStart = periodKey + '-01';
  const counts = db.prepare(`
    SELECT sub_type, COUNT(*) as count
    FROM behaviors
    WHERE user_id = ?
      AND date(completed_at, 'localtime') >= ?
      AND strftime('%Y-%m', completed_at, 'localtime') = ?
    GROUP BY sub_type
  `).all(req.user.id, monthStart, periodKey);

  const countMap = {};
  for (const row of counts) {
    countMap[row.sub_type] = row.count;
  }

  const result = goals.map(g => ({
    id: g.id,
    subType: g.sub_type,
    targetCount: g.target_count,
    currentCount: countMap[g.sub_type] || 0,
    periodKey: g.period_key,
    completed: (countMap[g.sub_type] || 0) >= g.target_count,
  }));

  res.json(result);
});

// POST /api/behavior-goal — 创建或更新月度目标
router.post('/', (req, res) => {
  const { sub_type, target_count } = req.body;

  if (!sub_type || !target_count) {
    return res.status(400).json({ error: '请填写行为类型和目标次数' });
  }
  const count = parseInt(target_count);
  if (isNaN(count) || count < 1 || count > 999) {
    return res.status(400).json({ error: '目标次数需在 1-999 之间' });
  }

  const periodKey = getCurrentPeriodKey();

  db.prepare(`
    INSERT INTO behavior_goals (user_id, sub_type, target_count, period_key)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, sub_type, period_key) DO UPDATE SET
      target_count = excluded.target_count
  `).run(req.user.id, sub_type, count, periodKey);

  res.json({ success: true, sub_type, target_count: count, period_key: periodKey });
});

// DELETE /api/behavior-goal/:id — 删除目标
router.delete('/:id', (req, res) => {
  const goal = db.prepare('SELECT * FROM behavior_goals WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);

  if (!goal) {
    return res.status(404).json({ error: '目标不存在' });
  }

  db.prepare('DELETE FROM behavior_goals WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
```

### 3.3 注册路由（修改 server/index.js）

在路由注册区域新增：

```js
app.use('/api/behavior-goal', require('./routes/behaviorGoal'));
```

### 3.4 GET /character 返回当月目标（修改 server/routes/character.js）

在 `GET /` 路由中，查询当月目标并加入返回值：

```js
// 获取当月目标
const periodKey = (() => {
  const now = new Date();
  const utc8 = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return `${utc8.getUTCFullYear()}-${String(utc8.getUTCMonth() + 1).padStart(2, '0')}`;
})();

const goals = db.prepare(
  'SELECT * FROM behavior_goals WHERE user_id = ? AND period_key = ?'
).all(req.user.id, periodKey);

const monthStart = periodKey + '-01';
const goalCounts = db.prepare(`
  SELECT sub_type, COUNT(*) as count
  FROM behaviors
  WHERE user_id = ?
    AND date(completed_at, 'localtime') >= ?
    AND strftime('%Y-%m', completed_at, 'localtime') = ?
  GROUP BY sub_type
`).all(req.user.id, monthStart, periodKey);

const goalCountMap = {};
for (const row of goalCounts) {
  goalCountMap[row.sub_type] = row.count;
}

const behaviorGoals = goals.map(g => ({
  id: g.id,
  subType: g.sub_type,
  targetCount: g.target_count,
  currentCount: goalCountMap[g.sub_type] || 0,
  completed: (goalCountMap[g.sub_type] || 0) >= g.target_count,
}));
```

在 `res.json` 返回对象中增加：

```js
behaviorGoals,
```

---

## 四、验证清单

1. `GET /api/character` 返回 `pinnedBehaviors` 数组和 `behaviorGoals` 数组
2. `PATCH /api/character/pin-behavior` 可设置置顶行为（最多2个），返回更新后的数组
3. `GET /api/behavior/shortcuts` 返回的列表中，置顶行为排在最前面，带 `pinned: true` 标记
4. `POST /api/behavior-goal` 可创建/更新月度目标
5. `GET /api/behavior-goal/current` 返回当月所有目标及完成进度
6. `DELETE /api/behavior-goal/:id` 可删除目标
7. 数据库 `characters` 表有 `pinned_behaviors` 字段
8. 数据库 `behavior_goals` 表正常创建
