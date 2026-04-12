# Codex 任务指令：V2-F06 修复 — 表情点赞 toggle + N+1 查询

> 溯源：V2-F06 FB-06（修复）
> 所有新增/修改代码行尾注释 `// V2-F06 fix`

---

## 背景

V2-F06 表情点赞功能已上线，但有两个问题需要修复：

1. **toggle 缺失**：`POST /react` 只能点赞（`INSERT OR IGNORE`），无法取消。用户误点后没有撤回途径。
2. **N+1 查询**：`GET /feed` 对每条 feed 逐条查 reactions（30 条 feed = 60 次额外 SQL），应改为批量查询。

---

## 改动 1：`server/routes/family.js` — 修复 react 接口为 toggle 语义

将现有 `POST /react` 路由（约第 50-73 行）整体替换为：

```js
// V2-F06 FB-06 — 表情互动（toggle：已存在则删除，不存在则插入）
router.post('/react', (req, res) => {
  const { behavior_id, emoji } = req.body; // V2-F06 fix
  const ALLOWED = ['👍', '💪', '📖', '✨']; // V2-F06 fix

  if (!behavior_id || !ALLOWED.includes(emoji)) { // V2-F06 fix
    return res.status(400).json({ error: '参数无效' });
  }

  // V2-F06 fix - 校验 behavior 存在且属于同一家庭
  const behaviorExists = db.prepare(
    'SELECT id FROM behaviors WHERE id = ? AND user_id IN (SELECT id FROM users WHERE family_id = ?)'
  ).get(behavior_id, req.user.family_id);
  if (!behaviorExists) {
    return res.status(404).json({ error: '行为记录不存在' }); // V2-F06 fix
  }

  // V2-F06 fix - toggle：已存在则删除，不存在则插入
  const existing = db.prepare(
    'SELECT id FROM behavior_reactions WHERE behavior_id = ? AND user_id = ? AND emoji = ?'
  ).get(behavior_id, req.user.id, emoji); // V2-F06 fix

  if (existing) {
    db.prepare('DELETE FROM behavior_reactions WHERE id = ?').run(existing.id); // V2-F06 fix
    return res.json({ action: 'removed', behavior_id, emoji }); // V2-F06 fix
  } else {
    db.prepare(
      'INSERT INTO behavior_reactions (behavior_id, user_id, emoji) VALUES (?, ?, ?)'
    ).run(behavior_id, req.user.id, emoji); // V2-F06 fix
    return res.json({ action: 'added', behavior_id, emoji }); // V2-F06 fix
  }
});
```

---

## 改动 2：`server/routes/family.js` — feed 接口改为批量查询

将现有 `GET /feed` 路由（约第 20-47 行）整体替换为：

```js
// GET /api/family/feed — get recent family activity (V2-F06 fix 批量查询 reactions)
router.get('/feed', (req, res) => {
  const feed = db.prepare(
    `SELECT b.id, b.category, b.sub_type, b.quality, b.completed_at, u.name as user_name,
     i.name as item_name
     FROM behaviors b
     JOIN users u ON b.user_id = u.id
     LEFT JOIN items i ON b.item_id = i.id
     WHERE u.family_id = ?
     ORDER BY b.completed_at DESC LIMIT 30`
  ).all(req.user.family_id); // V2-F06 fix

  if (feed.length === 0) return res.json([]); // V2-F06 fix

  // V2-F06 fix - 批量查询 reactions 汇总
  const behaviorIds = feed.map(f => f.id); // V2-F06 fix
  const placeholders = behaviorIds.map(() => '?').join(','); // V2-F06 fix

  const reactionRows = db.prepare(
    `SELECT behavior_id, emoji, COUNT(*) as count
     FROM behavior_reactions
     WHERE behavior_id IN (${placeholders})
     GROUP BY behavior_id, emoji`
  ).all(...behaviorIds); // V2-F06 fix

  // V2-F06 fix - 批量查询当前用户已点赞的记录
  const myReactionRows = db.prepare(
    `SELECT behavior_id, emoji
     FROM behavior_reactions
     WHERE behavior_id IN (${placeholders}) AND user_id = ?`
  ).all(...behaviorIds, req.user.id); // V2-F06 fix

  // V2-F06 fix - 组装 reactions map: { behaviorId: [{ emoji, count }] }
  const reactionsMap = {};
  for (const r of reactionRows) {
    if (!reactionsMap[r.behavior_id]) reactionsMap[r.behavior_id] = [];
    reactionsMap[r.behavior_id].push({ emoji: r.emoji, count: r.count });
  }

  // V2-F06 fix - 组装 myReactions set
  const myReactionsSet = new Set(
    myReactionRows.map(r => `${r.behavior_id}:${r.emoji}`)
  );

  // V2-F06 fix - 合并到 feed
  const enriched = feed.map(f => ({
    ...f,
    reactions: reactionsMap[f.id] || [],
    myReactions: ['👍', '💪', '📖', '✨'].filter(
      e => myReactionsSet.has(`${f.id}:${e}`)
    ),
  }));

  res.json(enriched); // V2-F06 fix
});
```

> 说明：`reactions` 保持 `[{ emoji, count }]` 数组格式不变，前端已用 `.find()` 适配，无需改前端。

---

## 不改动的部分

以下确认不需要修改：

- `server/db.js`：建表语句正确，UNIQUE 约束已有
- `public/js/pages/family.js`：前端渲染和事件绑定逻辑正确，`.find()` 适配数组格式能正常工作，`react()` 方法点击后调用 `this.load()` 刷新整个 feed，toggle 后状态会自动更新
- `public/css/style.css`：无需改动

---

## 验收标准

1. **toggle 生效**：点击已点赞的表情按钮，再次点击后取消（高亮消失、计数减 1）；再点一次恢复点赞
2. **接口返回**：`POST /react` 返回 `{ action: "added"|"removed", behavior_id, emoji }`
3. **批量查询**：`GET /feed` 只执行 3 条 SQL（feed 主查询 + reactions 汇总 + 当前用户 reactions），不再逐条查询
4. **无回归**：家庭成员列表、团队愿望进度、feed 渲染、表情显示和计数均不受影响
5. **溯源**：所有修改行包含 `// V2-F06 fix` 注释
