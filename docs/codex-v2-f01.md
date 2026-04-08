# Codex 任务指令：V2-F01 行为上报简化

直接按以下指令执行，不需要了解背景。每处改动需在代码中加注释 `// V2-F01 FB-05`。

---

## 文件 1：server/db.js

在 `initDB()` 的 `db.exec(...)` SQL 字符串末尾，追加以下两段 DDL：

```sql
-- V2-F01 FB-05
ALTER TABLE behaviors ADD COLUMN sub_category TEXT DEFAULT NULL;

-- V2-F01 FB-05
CREATE TABLE IF NOT EXISTS user_behavior_shortcuts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  category TEXT NOT NULL,
  sub_category TEXT DEFAULT NULL,
  sub_type TEXT NOT NULL,
  use_count INTEGER DEFAULT 1,
  last_used_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, category, sub_type),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

注意：`ALTER TABLE` 在 SQLite 中对已存在的列会报错，需要用 try/catch 或先判断列是否存在。推荐做法：在 `db.exec(...)` 之后单独执行：

```js
// V2-F01 FB-05 - 补充 behaviors.sub_category 字段（兼容已存在情况）
try {
  db.exec(`ALTER TABLE behaviors ADD COLUMN sub_category TEXT DEFAULT NULL`);
} catch (e) {
  // 列已存在，忽略
}
```

`CREATE TABLE IF NOT EXISTS user_behavior_shortcuts` 可以直接放进 `db.exec(...)` 的 SQL 字符串里。

---

## 文件 2：server/routes/behavior.js

### 改动 A：POST /api/behavior — 写入 sub_category + upsert shortcuts

找到 INSERT behaviors 的 `db.prepare(...)` 语句，修改如下：

**原 SQL：**
```sql
INSERT INTO behaviors (user_id, category, sub_type, description, quality_template, duration, quantity, quality, completed_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
```

**改为：**
```sql
-- V2-F01 FB-05 - 新增 sub_category 字段写入
INSERT INTO behaviors (user_id, category, sub_category, sub_type, description, quality_template, duration, quantity, quality, completed_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
```

对应的 `.run(...)` 参数列表中，在 `category` 后面插入 `foundBehavior.subCategory || null`。

**在 `res.json(...)` 之前**，追加 shortcuts upsert 逻辑：

```js
// V2-F01 FB-05 - 更新常用行为快捷入口频次
db.prepare(`
  INSERT INTO user_behavior_shortcuts (user_id, category, sub_category, sub_type, use_count, last_used_at)
  VALUES (?, ?, ?, ?, 1, datetime('now'))
  ON CONFLICT(user_id, category, sub_type) DO UPDATE SET
    use_count = use_count + 1,
    sub_category = excluded.sub_category,
    last_used_at = datetime('now')
`).run(req.user.id, category, foundBehavior.subCategory || null, sub_type);
```

### 改动 B：新增 GET /api/behavior/shortcuts

在 `router.get('/list', ...)` 之前插入：

```js
// V2-F01 FB-05 - 获取用户 Top5 常用行为快捷入口
router.get('/shortcuts', (req, res) => {
  const shortcuts = db.prepare(`
    SELECT category, sub_category, sub_type, use_count, last_used_at
    FROM user_behavior_shortcuts
    WHERE user_id = ?
    ORDER BY use_count DESC, last_used_at DESC
    LIMIT 5
  `).all(req.user.id);
  res.json(shortcuts);
});
```

### 改动 C：新增 GET /api/behavior/last

紧接 shortcuts 路由之后插入：

```js
// V2-F01 FB-05 - 获取用户最近一次上报行为，用于一键重复
router.get('/last', (req, res) => {
  const last = db.prepare(`
    SELECT category, sub_category, sub_type, duration, quantity, description
    FROM behaviors
    WHERE user_id = ?
    ORDER BY completed_at DESC
    LIMIT 1
  `).get(req.user.id);
  res.json(last || null);
});
```

---

## 文件 3：public/js/pages/behavior.js

### 改动 A：BehaviorPage 对象新增状态字段

在对象顶部，`categories: null` 附近，追加：

```js
shortcuts: null,   // V2-F01 FB-05 - Top5 常用行为
lastBehavior: null, // V2-F01 FB-05 - 最近一次行为，用于一键重复
```

### 改动 B：load() 并行拉取 shortcuts 和 lastBehavior

原 `load()` 只请求 `/behavior/categories`，改为并行请求三个接口：

```js
async load() {
  try {
    // V2-F01 FB-05 - 并行加载 categories、shortcuts、lastBehavior
    const [categories, shortcuts, lastBehavior] = await Promise.all([
      this.categories ? Promise.resolve(this.categories) : API.get('/behavior/categories'),
      API.get('/behavior/shortcuts'),
      API.get('/behavior/last'),
    ]);
    this.categories = categories;
    this.shortcuts = shortcuts;
    this.lastBehavior = lastBehavior;
    this.render();
  } catch (e) {
    App.toast(e.message, 'error');
  }
},
```

### 改动 C：render() 插入常用行为卡片

在 `container.innerHTML = \`...\`` 的模板字符串中，`<div class="page-header">` 之后、第一个 `<div class="card">` 之前，插入：

```js
${this.renderShortcuts()}
```

### 改动 D：新增 renderShortcuts() 方法

```js
// V2-F01 FB-05 - 渲染常用行为快捷入口卡片
renderShortcuts() {
  const hasShortcuts = this.shortcuts && this.shortcuts.length > 0;
  const hasLast = !!this.lastBehavior;
  if (!hasShortcuts && !hasLast) return '';

  const e = API.escapeHtml.bind(API);
  return `
    <div class="card" style="margin-bottom:12px">
      <div class="card-title">常用行为</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px">
        ${hasShortcuts ? this.shortcuts.map((s, idx) => `
          <button class="btn btn-small btn-secondary"
            onclick="BehaviorPage.selectShortcut(${idx})">
            ${e(s.sub_type)}
          </button>
        `).join('') : ''}
      </div>
      ${hasLast ? `
        <button class="btn btn-small btn-secondary" onclick="BehaviorPage.repeatLast()">
          🔁 重复上次：${e(this.lastBehavior.sub_type)}
        </button>
      ` : ''}
    </div>
  `;
},
```

### 改动 E：新增 selectShortcut() 方法

```js
// V2-F01 FB-05 - 点击常用行为，直接跳到确认步骤
selectShortcut(index) {
  const s = this.shortcuts[index];
  if (!s) return;

  // 设置 category
  this.selectedCategory = s.category;
  this.showCustomForm = false;

  // 设置 sub_category（分组类行为）
  if (s.sub_category) {
    this.selectedSubCategory = s.sub_category;
  } else if (this.isGroupedCategory(s.category)) {
    // sub_category 为 null 但是分组类，降级选第一个子分类
    const subs = Object.keys(this.categories[s.category] || {});
    this.selectedSubCategory = subs[0] || null;
  } else {
    this.selectedSubCategory = null;
  }

  // 查找 behaviorDef
  const list = this.getBehaviorList(this.selectedCategory, this.selectedSubCategory);
  const behavior = list.find(b => b.name === s.sub_type);
  if (!behavior) {
    App.toast('该行为已不存在，请手动选择', 'error');
    this.selectedBehavior = null;
    this.render();
    return;
  }

  this.selectedBehavior = behavior;
  this.render();
},
```

### 改动 F：新增 repeatLast() 方法

```js
// V2-F01 FB-05 - 一键重复上次行为，预填充上次数值
repeatLast() {
  const last = this.lastBehavior;
  if (!last) return;

  this.selectedCategory = last.category;
  this.showCustomForm = false;

  if (last.sub_category) {
    this.selectedSubCategory = last.sub_category;
  } else if (this.isGroupedCategory(last.category)) {
    const subs = Object.keys(this.categories[last.category] || {});
    this.selectedSubCategory = subs[0] || null;
  } else {
    this.selectedSubCategory = null;
  }

  const list = this.getBehaviorList(this.selectedCategory, this.selectedSubCategory);
  const behavior = list.find(b => b.name === last.sub_type);
  if (!behavior) {
    App.toast('该行为已不存在，请手动选择', 'error');
    this.selectedBehavior = null;
    this.render();
    return;
  }

  this.selectedBehavior = behavior;
  this.render();

  // 预填充上次数值
  if (last.duration) {
    const el = document.getElementById('behavior-duration');
    if (el) el.value = last.duration;
  }
  if (last.quantity) {
    const el = document.getElementById('behavior-quantity');
    if (el) el.value = last.quantity;
  }
  if (last.description) {
    const el = document.getElementById('behavior-desc');
    if (el) el.value = last.description;
  }
},
```

### 改动 G：submit() 成功后刷新 shortcuts 和 lastBehavior

在 `submit()` 的成功回调中，`this.selectedBehavior = null` 之后，追加：

```js
// V2-F01 FB-05 - 上报成功后刷新快捷入口数据
Promise.all([
  API.get('/behavior/shortcuts'),
  API.get('/behavior/last'),
]).then(([shortcuts, lastBehavior]) => {
  this.shortcuts = shortcuts;
  this.lastBehavior = lastBehavior;
  this.render();
}).catch(() => {});
```

注意：这里不需要 await，异步刷新即可，不阻塞主流程。

---

## 验收标准

1. 有历史记录时，页面顶部显示常用行为卡片
2. 点击常用行为按钮，直接跳到输入/确认表单，不经过类别选择
3. 点击"重复上次"，跳到确认表单且预填充上次数值
4. 上报成功后，常用行为列表自动更新
5. 新用户（无历史）不显示常用行为卡片
