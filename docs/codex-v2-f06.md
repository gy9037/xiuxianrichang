# Codex 任务指令 — V2-F06 家庭页互动

> 溯源：`// V2-F06 FB-06`
> 项目：/Users/openclaw/AI开发项目/Xiuxianrichang

---

## 任务概述

为家庭页「最近动态」每条记录添加表情互动功能。用户可对家庭成员的行为点击表情回应，同一用户对同一行为同一表情只能点一次。

---

## 文件 1：server/db.js

**位置**：找到 `initDB()` 函数中 `db.exec(...)` 调用结束后，紧接着追加以下代码：

```js
// V2-F06 FB-06 — 行为表情互动表
db.exec(`
  CREATE TABLE IF NOT EXISTS behavior_reactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    behavior_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    emoji TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(behavior_id, user_id, emoji),
    FOREIGN KEY (behavior_id) REFERENCES behaviors(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);
```

---

## 文件 2：server/routes/family.js

### 2a. 修改 GET /api/family/feed

**位置**：找到构建 feed 列表的查询，在返回每条记录前附加 reactions 数据。

在组装每条 feed 记录时，追加两个字段：

```js
// V2-F06 FB-06 — 附加 reactions 汇总与当前用户已点表情
const reactions = db.prepare(
  `SELECT emoji, COUNT(*) as count FROM behavior_reactions WHERE behavior_id = ? GROUP BY emoji`
).all(f.id);

const myReactions = db.prepare(
  `SELECT emoji FROM behavior_reactions WHERE behavior_id = ? AND user_id = ?`
).all(f.id, req.user.id).map(r => r.emoji);

f.reactions = reactions;       // [{emoji, count}, ...]
f.myReactions = myReactions;   // ['👍', ...]
```

> 如果 feed 是批量查询后 map 处理的，在 map 内对每条记录执行上述两条查询后再 push 到结果数组。

### 2b. 新增 POST /api/family/react

在 family 路由文件末尾（`module.exports` 之前）添加：

```js
// V2-F06 FB-06 — 表情互动
router.post('/react', requireAuth, (req, res) => {
  const { behavior_id, emoji } = req.body;
  const ALLOWED = ['👍', '💪', '📖', '✨'];

  if (!behavior_id || !ALLOWED.includes(emoji)) {
    return res.status(400).json({ error: '参数无效' });
  }

  db.prepare(
    `INSERT OR IGNORE INTO behavior_reactions (behavior_id, user_id, emoji)
     VALUES (?, ?, ?)`
  ).run(behavior_id, req.user.id, emoji);

  res.json({ ok: true });
});
```

---

## 文件 3：public/js/pages/family.js

### 3a. 在 feed 模板中追加表情按钮组

**位置**：找到 `feed.map(f => ...)` 模板，在 `<div class="feed-time">` 之后、`</div>` 闭合 `feed-content` 之前，插入：

```js
// V2-F06 FB-06 — 表情按钮组
`<div class="feed-reactions" style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
  ${[
    { emoji: '👍', label: '灵气充沛' },
    { emoji: '💪', label: '体魄精进' },
    { emoji: '📖', label: '悟性大增' },
    { emoji: '✨', label: '道心坚定' },
  ].map(({ emoji, label }) => {
    const reacted = (f.myReactions || []).includes(emoji);
    const count = ((f.reactions || []).find(r => r.emoji === emoji) || {}).count || 0;
    const highlight = reacted ? 'border:1px solid var(--primary);' : 'border:1px solid var(--border);';
    return `<button
      onclick="FamilyPage.react(${f.id}, '${emoji}')"
      style="background:none;border-radius:20px;padding:2px 10px;cursor:pointer;font-size:13px;${highlight}"
      title="${e(label)}"
    >${emoji}${count > 0 ? ` ${count}` : ''}</button>`;
  }).join('')}
</div>`
```

### 3b. 在 FamilyPage 对象中新增 react 方法

**位置**：在 `FamilyPage` 对象的 `render` 方法之后添加：

```js
// V2-F06 FB-06 — 发送表情互动
async react(behaviorId, emoji) {
  try {
    await API.post('/family/react', { behavior_id: behaviorId, emoji });
    await this.load();
  } catch (e) {
    App.toast(e.message, 'error');
  }
},
```

---

## 验收标准

1. 家庭页每条动态下方显示 4 个表情按钮，已点击的按钮有主题色边框高亮。
2. 同一用户对同一条动态同一表情只能点一次（重复点击无变化，不报错）。
3. 点击表情后 feed 自动刷新，计数实时更新。
