# Codex Task: V2-F04 BUFF状态系统（最小版本）

## 溯源标注
所有新增/修改代码需注释 `// V2-F04 FB-03`

---

## 任务一：`server/db.js`

在 `initDB()` 的 `db.exec(...)` SQL 字符串中，`users` 表建表语句末尾加字段，或在 `db.exec(...)` 之后单独执行 ALTER：

```js
// V2-F04 FB-03 - 用户状态字段（正常/生病/出差/休假）
try {
  db.exec(`ALTER TABLE users ADD COLUMN status TEXT DEFAULT '正常'`);
} catch (e) { /* 列已存在，忽略 */ }
```

---

## 任务二：`server/routes/character.js`

### 改动 A：GET /api/character 返回 status 字段

找到 `router.get('/')` 中的 `res.json({...})` 调用，在 `character` 对象中加入 status：

```js
// V2-F04 FB-03 - 返回用户状态
character: {
  ...原有字段...,
  status: db.prepare('SELECT status FROM users WHERE id = ?').get(req.user.id)?.status || '正常',
},
```

### 改动 B：新增 POST /api/character/status 接口

在 `router.post('/promote', ...)` 之前插入：

```js
// V2-F04 FB-03 - 切换用户状态
router.post('/status', (req, res) => {
  const { status } = req.body;
  const VALID_STATUSES = ['正常', '生病', '出差', '休假'];
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: '无效的状态，可选：正常/生病/出差/休假' });
  }
  db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, req.user.id);
  res.json({ success: true, status });
});
```

---

## 任务三：`server/services/decay.js`

### 改动：getDailyDecay 接受 userStatus 参数，非正常状态缓冲期延长到30天

找到 `getDailyDecay(inactiveDays)` 函数，修改为：

```js
// V2-F04 FB-03 - 非正常状态缓冲期从15天延长到30天
function getDailyDecay(inactiveDays, userStatus = '正常') {
  if (inactiveDays === 9999) return 0;
  const buffer = (userStatus && userStatus !== '正常') ? 30 : 15; // V2-F04 FB-03
  if (inactiveDays <= buffer) return 0;
  if (inactiveDays <= buffer + 7) return 0.1;
  if (inactiveDays <= buffer + 14) return 0.2;
  return 0.3;
}
```

找到 `calculateDecay(character, now)` 函数，修改调用处传入 userStatus：

```js
// V2-F04 FB-03 - 传入用户状态
function calculateDecay(character, now = new Date(), userStatus = '正常') {
  ...
  const decay = getDailyDecay(days, userStatus); // V2-F04 FB-03
  ...
}
```

同样修改 `getDecayStatus(character, now)` 函数签名和内部调用：

```js
// V2-F04 FB-03
function getDecayStatus(character, now = new Date(), userStatus = '正常') {
  ...
  // getDailyDecay 调用处传入 userStatus
  // daysUntilDecay 计算也需要用 buffer 变量
  const buffer = (userStatus && userStatus !== '正常') ? 30 : 15; // V2-F04 FB-03
  let daysUntilDecay = buffer - days;
  ...
}
```

在 `character.js` 的 `router.get('/')` 中，获取 userStatus 并传入：

```js
// V2-F04 FB-03 - 获取用户状态传入衰退计算
const userRow = db.prepare('SELECT status FROM users WHERE id = ?').get(req.user.id);
const userStatus = userRow?.status || '正常';
const { updates, hasDecay } = calculateDecay(character, new Date(), userStatus);
...
const decayStatus = getDecayStatus(character, new Date(), userStatus);
```

---

## 任务四：`public/js/pages/home.js`

### 改动 A：render() 中展示状态badge并支持点击切换

在 `render()` 方法的 `container.innerHTML` 模板中，找到 `<div class="page-header">` 行，替换为：

```js
// V2-F04 FB-03 - 顶部展示用户名 + 状态badge
<div class="page-header" style="display:flex;align-items:center;justify-content:space-between">
  <span>${e(API.user.name)}</span>
  <span class="status-badge status-${e(character.status || '正常')}"
    onclick="HomePage.showStatusPicker()"
    style="cursor:pointer;font-size:12px;padding:4px 10px;border-radius:12px;background:var(--bg-card-light)">
    ${e(character.status || '正常')} ▾
  </span>
</div>
```

### 改动 B：新增 showStatusPicker() 方法

在 `HomePage` 对象末尾插入：

```js
// V2-F04 FB-03 - 状态切换弹窗
showStatusPicker() {
  const existing = document.getElementById('status-picker-modal');
  if (existing) existing.remove();

  const STATUS_CONFIG = {
    '正常': { icon: '✨', desc: '日常修炼，正常计算衰退' },
    '生病': { icon: '🤒', desc: '身体欠佳，衰退缓冲延长至30天' },
    '出差': { icon: '✈️', desc: '外出奔波，衰退缓冲延长至30天' },
    '休假': { icon: '🏖️', desc: '休养生息，衰退缓冲延长至30天' },
  };

  const modal = document.createElement('div');
  modal.id = 'status-picker-modal';
  modal.style.cssText = `position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:200;display:flex;align-items:center;justify-content:center;padding:24px`;
  modal.innerHTML = `
    <div style="background:var(--bg-card);border-radius:var(--radius);padding:24px;max-width:320px;width:100%">
      <div style="font-size:16px;font-weight:700;margin-bottom:16px">切换状态</div>
      ${Object.entries(STATUS_CONFIG).map(([s, cfg]) => `
        <div onclick="HomePage.setStatus('${s}')"
          style="padding:12px;border-radius:8px;margin-bottom:8px;cursor:pointer;background:var(--bg-card-light);display:flex;align-items:center;gap:12px">
          <span style="font-size:24px">${cfg.icon}</span>
          <div>
            <div style="font-weight:600">${s}</div>
            <div style="font-size:12px;color:var(--text-dim)">${cfg.desc}</div>
          </div>
        </div>
      `).join('')}
      <button class="btn btn-secondary" style="width:100%;margin-top:8px"
        onclick="document.getElementById('status-picker-modal').remove()">取消</button>
    </div>
  `;
  document.body.appendChild(modal);
},

// V2-F04 FB-03 - 提交状态切换
async setStatus(status) {
  try {
    await API.post('/character/status', { status });
    document.getElementById('status-picker-modal')?.remove();
    App.toast(`状态已切换为：${status}`, 'success');
    this.load();
  } catch (e) {
    App.toast(e.message, 'error');
  }
},
```

---

## 验收标准

1. GET /api/character 返回数据中包含 `status` 字段
2. POST /api/character/status 可切换状态，非法值返回400
3. 生病/出差/休假状态下，`getDailyDecay` 缓冲期为30天（正常状态为15天）
4. 首页顶部显示状态badge，点击弹出状态选择弹窗，切换后页面刷新
