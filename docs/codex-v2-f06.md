# Codex 任务指令：V2-F06 家庭页互动（表情点赞）

> 溯源：V2-F06 FB-06
> 所有新增/修改代码行尾注释 `// V2-F06 FB-06`

---

## 背景

家庭页面「最近动态」feed 目前只能看，缺乏互动。本次为每条行为记录增加修仙风格表情点赞功能。

可用表情（硬编码，前后端共用）：

| emoji 值 | 显示 | 含义 |
|-----------|------|------|
| `lingqi`  | 👍   | 灵气充沛 |
| `tipo`    | 💪   | 体魄精进 |
| `wuxing`  | 📖   | 悟性大增 |
| `daoxin`  | ✨   | 道心坚定 |

---

## 改动 1：`server/db.js` — 新增 behavior_reactions 表

在 `initDB()` 函数的 `db.exec(...)` 模板字符串末尾（`user_behavior_shortcuts` 建表语句之后），追加：

```sql
    -- V2-F06 FB-06 表情点赞
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
```

位置：紧跟在 `user_behavior_shortcuts` 建表语句的 `);\n` 之后、`db.exec` 的闭合反引号 `` ` `` 之前。

---

## 改动 2：`server/routes/family.js` — 后端接口

### 2a. 在文件顶部（router.use 之后）添加合法 emoji 白名单常量

```js
// V2-F06 FB-06 合法表情白名单
const VALID_EMOJIS = ['lingqi', 'tipo', 'wuxing', 'daoxin']; // V2-F06 FB-06
```

### 2b. 修改 GET /api/family/feed

将现有 `/feed` 路由替换为以下实现。核心变化：
1. feed 查询增加 `b.id as behavior_id`
2. 查询当前用户对这些 behavior 的已有 reactions
3. 查询每条 behavior 的 reactions 汇总
4. 合并后返回

```js
// GET /api/family/feed — get recent family activity (V2-F06 FB-06 增加 reactions)
router.get('/feed', (req, res) => {
  // V2-F06 FB-06 feed 查询增加 b.id
  const feed = db.prepare(
    `SELECT b.id as behavior_id, b.category, b.sub_type, b.quality, b.completed_at,
     u.name as user_name, i.name as item_name
     FROM behaviors b
     JOIN users u ON b.user_id = u.id
     LEFT JOIN items i ON b.item_id = i.id
     WHERE u.family_id = ?
     ORDER BY b.completed_at DESC LIMIT 30`
  ).all(req.user.family_id);

  if (feed.length === 0) return res.json([]); // V2-F06 FB-06

  // V2-F06 FB-06 批量查询 reactions 汇总
  const behaviorIds = feed.map(f => f.behavior_id);
  const placeholders = behaviorIds.map(() => '?').join(',');

  const reactionRows = db.prepare(
    `SELECT behavior_id, emoji, COUNT(*) as count
     FROM behavior_reactions
     WHERE behavior_id IN (${placeholders})
     GROUP BY behavior_id, emoji`
  ).all(...behaviorIds);

  // V2-F06 FB-06 查询当前用户已点赞的记录
  const myReactions = db.prepare(
    `SELECT behavior_id, emoji
     FROM behavior_reactions
     WHERE behavior_id IN (${placeholders}) AND user_id = ?`
  ).all(...behaviorIds, req.user.id);

  // V2-F06 FB-06 组装 reactions map
  const reactionsMap = {};
  for (const r of reactionRows) {
    if (!reactionsMap[r.behavior_id]) reactionsMap[r.behavior_id] = {};
    reactionsMap[r.behavior_id][r.emoji] = r.count;
  }

  // V2-F06 FB-06 组装 myReactions set
  const myReactionsSet = new Set(myReactions.map(r => `${r.behavior_id}:${r.emoji}`));

  // V2-F06 FB-06 合并到 feed
  const result = feed.map(f => ({
    ...f,
    reactions: reactionsMap[f.behavior_id] || {},           // V2-F06 FB-06
    myReactions: VALID_EMOJIS.filter(                       // V2-F06 FB-06
      e => myReactionsSet.has(`${f.behavior_id}:${e}`)
    ),
  }));

  res.json(result); // V2-F06 FB-06
});
```

### 2c. 新增 POST /api/family/react

在 `module.exports` 之前添加：

```js
// V2-F06 FB-06 表情点赞（toggle）
router.post('/react', (req, res) => {
  const { behavior_id, emoji } = req.body; // V2-F06 FB-06

  // V2-F06 FB-06 参数校验
  if (!behavior_id || !emoji) {
    return res.status(400).json({ error: '缺少 behavior_id 或 emoji' });
  }
  if (!VALID_EMOJIS.includes(emoji)) {
    return res.status(400).json({ error: '不支持的表情类型' }); // V2-F06 FB-06
  }

  // V2-F06 FB-06 校验 behavior 存在且属于同一家庭
  const behavior = db.prepare(
    `SELECT b.id FROM behaviors b
     JOIN users u ON b.user_id = u.id
     WHERE b.id = ? AND u.family_id = ?`
  ).get(behavior_id, req.user.family_id);

  if (!behavior) {
    return res.status(404).json({ error: '行为记录不存在或不在同一家庭' }); // V2-F06 FB-06
  }

  // V2-F06 FB-06 toggle：已存在则删除，不存在则插入
  const existing = db.prepare(
    `SELECT id FROM behavior_reactions WHERE behavior_id = ? AND user_id = ? AND emoji = ?`
  ).get(behavior_id, req.user.id, emoji);

  if (existing) {
    db.prepare('DELETE FROM behavior_reactions WHERE id = ?').run(existing.id); // V2-F06 FB-06
    return res.json({ action: 'removed', behavior_id, emoji }); // V2-F06 FB-06
  } else {
    db.prepare(
      'INSERT INTO behavior_reactions (behavior_id, user_id, emoji) VALUES (?, ?, ?)'
    ).run(behavior_id, req.user.id, emoji); // V2-F06 FB-06
    return res.json({ action: 'added', behavior_id, emoji }); // V2-F06 FB-06
  }
});
```

---

## 改动 3：`public/js/pages/family.js` — 前端渲染与交互

### 3a. 在 FamilyPage 对象顶部添加表情映射常量

```js
const FamilyPage = {
  // V2-F06 FB-06 表情映射
  EMOJI_MAP: {
    lingqi: { icon: '👍', label: '灵气充沛' },
    tipo:   { icon: '💪', label: '体魄精进' },
    wuxing: { icon: '📖', label: '悟性大增' },
    daoxin: { icon: '✨', label: '道心坚定' },
  }, // V2-F06 FB-06
```

### 3b. 修改 render() 中「最近动态」部分

将 feed.map 中每条 feed-item 的 HTML 替换为以下（增加表情按钮行）：

```js
        ${feed.map(f => `
          <div class="feed-item" data-behavior-id="${f.behavior_id}">
            <div class="feed-avatar">${e((f.user_name || '?').slice(0, 1))}</div>
            <div class="feed-content">
              <div class="feed-name">${e(f.user_name)}</div>
              <div class="feed-text">
                完成了 ${e(f.sub_type)}
                ${(() => {
                  const q = ['凡品', '良品', '上品', '极品'].includes(f.quality) ? f.quality : '凡品';
                  return `<span class="quality-${q}">（${e(f.quality)}）</span>`;
                })()}
                ${f.item_name ? `→ 获得 ${e(f.item_name)}` : ''}
              </div>
              <div class="feed-time">${new Date(f.completed_at).toLocaleString()}</div>
              <div class="feed-reactions">
                ${Object.entries(FamilyPage.EMOJI_MAP).map(([key, val]) => {
                  const count = (f.reactions && f.reactions[key]) || 0;
                  const active = (f.myReactions || []).includes(key) ? 'active' : '';
                  return `<button class="reaction-btn ${active}" data-emoji="${key}" data-behavior-id="${f.behavior_id}" title="${val.label}">
                    ${val.icon}${count > 0 ? `<span class="reaction-count">${count}</span>` : ''}
                  </button>`;
                }).join('')}
              </div>
            </div>
          </div>
        `).join('')}
```

### 3c. 在 render() 末尾（`container.innerHTML = ...` 赋值之后）绑定点击事件

```js
    // V2-F06 FB-06 绑定表情点赞事件
    container.querySelectorAll('.reaction-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const behaviorId = btn.dataset.behaviorId; // V2-F06 FB-06
        const emoji = btn.dataset.emoji;           // V2-F06 FB-06
        try {
          const result = await API.post('/family/react', {
            behavior_id: Number(behaviorId),
            emoji,
          }); // V2-F06 FB-06
          // V2-F06 FB-06 刷新整个 feed 以保持数据一致
          await FamilyPage.load();
        } catch (e) {
          App.toast(e.message, 'error'); // V2-F06 FB-06
        }
      });
    }); // V2-F06 FB-06
```

### 3d. 在 `public/css/style.css`（或项目使用的主样式文件）末尾追加样式

```css
/* V2-F06 FB-06 表情点赞样式 */
.feed-reactions {
  display: flex;
  gap: 6px;
  margin-top: 6px;
  flex-wrap: wrap;
}
.reaction-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: transparent;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;
}
.reaction-btn:hover {
  background: rgba(var(--primary-rgb, 100, 100, 255), 0.1);
}
.reaction-btn.active {
  border-color: var(--primary, #7c5cfc);
  background: rgba(var(--primary-rgb, 100, 100, 255), 0.15);
}
.reaction-count {
  font-size: 12px;
  color: var(--text-secondary, #888);
}
```

---

## 验收标准

1. **建表**：启动服务后 `behavior_reactions` 表自动创建，包含 `id, behavior_id, user_id, emoji, created_at` 字段，`(behavior_id, user_id, emoji)` 有唯一约束
2. **Feed 接口**：`GET /api/family/feed` 每条记录包含 `behavior_id`、`reactions`（对象，key 为 emoji 值，value 为计数）、`myReactions`（当前用户已点赞的 emoji 数组）
3. **点赞接口**：`POST /api/family/react` 接受 `{ behavior_id, emoji }`，toggle 语义（点赞/取消），返回 `{ action: "added"|"removed", behavior_id, emoji }`
4. **参数校验**：emoji 不在白名单返回 400；behavior 不存在或不在同一家庭返回 404
5. **前端渲染**：每条动态下方显示 4 个表情按钮，已点赞的高亮（`.active` 类），有计数时显示数字
6. **交互**：点击表情按钮调用 react 接口后刷新 feed，状态即时更新
7. **溯源**：所有新增/修改代码行包含 `// V2-F06 FB-06` 注释
8. **无破坏**：现有家庭成员列表、团队愿望进度等功能不受影响
