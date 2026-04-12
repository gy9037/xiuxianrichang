# Codex 任务指令：V2-F04 BUFF状态系统（最小版本）

> 溯源：FB-03（属性衰退机制太隐性，出差/生病后回来发现属性掉了体验差）
> 所有新增/修改代码行尾注释 `// V2-F04 FB-03`

---

## 改动 1：`server/db.js` — users 表新增 status 字段

在 `initDB()` 函数中，找到已有的 `ALTER TABLE behaviors ADD COLUMN sub_category` 那段 try/catch **之后**，追加：

```js
  // V2-F04 FB-03 - 用户状态字段（正常/生病/出差/休假）
  try { // V2-F04 FB-03
    db.exec(`ALTER TABLE users ADD COLUMN status TEXT DEFAULT '正常'`); // V2-F04 FB-03
  } catch (e) { // V2-F04 FB-03
    // V2-F04 FB-03 - 列已存在，忽略
  } // V2-F04 FB-03
```

插入位置：在 `// Seed default family if none exists` 注释行之前。

---

## 改动 2：`server/routes/character.js` — 接口改动

### 2a. GET /api/character 返回 status 字段

在现有的 `router.get('/')` 处理函数中，找到查询语句：

```js
  const character = db.prepare(
    `SELECT c.*, u.tags
     FROM characters c JOIN users u ON c.user_id = u.id
     WHERE c.user_id = ?`
  ).get(req.user.id);
```

替换为：

```js
  const character = db.prepare( // V2-F04 FB-03
    `SELECT c.*, u.tags, u.status
     FROM characters c JOIN users u ON c.user_id = u.id
     WHERE c.user_id = ?`
  ).get(req.user.id); // V2-F04 FB-03
```

然后在 `res.json({...})` 的返回对象中，在 `decayStatus,` 行之后追加：

```js
    status: character.status || '正常', // V2-F04 FB-03
```

完整的 res.json 应变为：

```js
  res.json({
    character: {
      id: character.id,
      physique: character.physique,
      comprehension: character.comprehension,
      willpower: character.willpower,
      dexterity: character.dexterity,
      perception: character.perception,
      realm_stage: character.realm_stage,
      attr_cap: realm ? realm.attrCap : 3,
      total_attrs: getTotalAttrs(character),
    },
    tags,
    trend,
    promotion,
    decayStatus,
    status: character.status || '正常', // V2-F04 FB-03
  });
```

### 2b. 衰退计算传入 status

在同一个 `router.get('/')` 中，找到：

```js
  const { updates, hasDecay } = calculateDecay(character);
```

替换为：

```js
  const userStatus = character.status || '正常'; // V2-F04 FB-03
  const { updates, hasDecay } = calculateDecay(character, undefined, userStatus); // V2-F04 FB-03
```

同样，找到：

```js
  const decayStatus = getDecayStatus(character);
```

替换为：

```js
  const decayStatus = getDecayStatus(character, undefined, userStatus); // V2-F04 FB-03
```

### 2c. 新增 POST /api/character/status 接口

在 `router.post('/promote', ...)` 路由**之前**，插入以下完整路由：

```js
// V2-F04 FB-03 - 用户状态切换
const VALID_STATUSES = ['正常', '生病', '出差', '休假']; // V2-F04 FB-03

// V2-F04 FB-03
router.post('/status', (req, res) => { // V2-F04 FB-03
  const { status } = req.body; // V2-F04 FB-03
  if (!status || !VALID_STATUSES.includes(status)) { // V2-F04 FB-03
    return res.status(400).json({ error: `状态无效，可选值：${VALID_STATUSES.join('、')}` }); // V2-F04 FB-03
  } // V2-F04 FB-03
  db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, req.user.id); // V2-F04 FB-03
  res.json({ success: true, status }); // V2-F04 FB-03
}); // V2-F04 FB-03
```

---

## 改动 3：`server/services/decay.js` — 状态感知的缓冲期

### 3a. 修改 getDailyDecay 函数

将现有的：

```js
function getDailyDecay(inactiveDays) {
  // Never-active attributes should not decay.
  if (inactiveDays === 9999) return 0;
  if (inactiveDays <= 15) return 0;
  if (inactiveDays <= 22) return 0.1;
  if (inactiveDays <= 29) return 0.2;
  return 0.3;
}
```

替换为：

```js
function getDailyDecay(inactiveDays, bufferDays = 15) { // V2-F04 FB-03
  // Never-active attributes should not decay.
  if (inactiveDays === 9999) return 0; // V2-F04 FB-03
  if (inactiveDays <= bufferDays) return 0; // V2-F04 FB-03
  if (inactiveDays <= bufferDays + 7) return 0.1; // V2-F04 FB-03
  if (inactiveDays <= bufferDays + 14) return 0.2; // V2-F04 FB-03
  return 0.3; // V2-F04 FB-03
}
```

### 3b. 修改 calculateDecay 函数

将现有的：

```js
function calculateDecay(character, now = new Date()) {
```

替换为：

```js
function calculateDecay(character, now = new Date(), userStatus = '正常') { // V2-F04 FB-03
```

在函数内部，找到：

```js
    const decay = getDailyDecay(days);
```

替换为：

```js
    const bufferDays = userStatus !== '正常' ? 30 : 15; // V2-F04 FB-03
    const decay = getDailyDecay(days, bufferDays); // V2-F04 FB-03
```

### 3c. 修改 getDecayStatus 函数

将现有的：

```js
function getDecayStatus(character, now = new Date()) {
```

替换为：

```js
function getDecayStatus(character, now = new Date(), userStatus = '正常') { // V2-F04 FB-03
```

在函数内部，找到：

```js
    let daysUntilDecay = 15 - days;
```

替换为：

```js
    const bufferDays = userStatus !== '正常' ? 30 : 15; // V2-F04 FB-03
    let daysUntilDecay = bufferDays - days; // V2-F04 FB-03
```

找到状态判断逻辑：

```js
    if (days > 29) status = '虚弱III';
    else if (days > 22) status = '虚弱II';
    else if (days > 15) status = '虚弱I';
    else if (days > 12) status = '即将衰退';
```

替换为：

```js
    if (days > bufferDays + 14) status = '虚弱III'; // V2-F04 FB-03
    else if (days > bufferDays + 7) status = '虚弱II'; // V2-F04 FB-03
    else if (days > bufferDays) status = '虚弱I'; // V2-F04 FB-03
    else if (days > bufferDays - 3) status = '即将衰退'; // V2-F04 FB-03
```

---

## 改动 4：`public/js/pages/home.js` — 首页状态展示与切换

### 4a. 文件顶部新增状态常量

在现有的 `ATTR_ICONS` 常量之后，追加：

```js
// V2-F04 FB-03 - 状态配置
const STATUS_CONFIG = { // V2-F04 FB-03
  '正常': { icon: '✅', label: '正常', tip: '' }, // V2-F04 FB-03
  '生病': { icon: '🤒', label: '生病', tip: '生病期间衰退缓冲延长至30天，好好休息' }, // V2-F04 FB-03
  '出差': { icon: '✈️', label: '出差', tip: '出差期间衰退缓冲延长至30天，安心工作' }, // V2-F04 FB-03
  '休假': { icon: '🏖️', label: '休假', tip: '休假期间衰退缓冲延长至30天，尽情放松' }, // V2-F04 FB-03
}; // V2-F04 FB-03
```

### 4b. HomePage 对象新增 changeStatus 方法

在 `HomePage` 对象的 `logout()` 方法**之前**，插入：

```js
  // V2-F04 FB-03 - 状态切换弹窗
  async changeStatus() { // V2-F04 FB-03
    const current = this.data.status || '正常'; // V2-F04 FB-03
    const statuses = Object.keys(STATUS_CONFIG); // V2-F04 FB-03
    const options = statuses.map(s => { // V2-F04 FB-03
      const cfg = STATUS_CONFIG[s]; // V2-F04 FB-03
      const selected = s === current ? ' ✓' : ''; // V2-F04 FB-03
      return `${cfg.icon} ${cfg.label}${selected}`; // V2-F04 FB-03
    }); // V2-F04 FB-03

    // V2-F04 FB-03 - 使用简单 prompt 选择（后续可升级为自定义弹窗）
    const input = prompt( // V2-F04 FB-03
      `当前状态：${STATUS_CONFIG[current].icon} ${current}\n\n` + // V2-F04 FB-03
      `输入数字切换状态：\n` + // V2-F04 FB-03
      options.map((o, i) => `${i + 1}. ${o}`).join('\n') // V2-F04 FB-03
    ); // V2-F04 FB-03
    if (!input) return; // V2-F04 FB-03

    const idx = parseInt(input, 10) - 1; // V2-F04 FB-03
    if (idx < 0 || idx >= statuses.length) { // V2-F04 FB-03
      App.toast('无效选择', 'error'); // V2-F04 FB-03
      return; // V2-F04 FB-03
    } // V2-F04 FB-03

    const newStatus = statuses[idx]; // V2-F04 FB-03
    if (newStatus === current) return; // V2-F04 FB-03

    try { // V2-F04 FB-03
      await API.post('/character/status', { status: newStatus }); // V2-F04 FB-03
      App.toast(`状态已切换为：${STATUS_CONFIG[newStatus].icon} ${newStatus}`, 'success'); // V2-F04 FB-03
      this.load(); // V2-F04 FB-03
    } catch (e) { // V2-F04 FB-03
      App.toast(e.message, 'error'); // V2-F04 FB-03
    } // V2-F04 FB-03
  }, // V2-F04 FB-03
```

### 4c. render() 方法中展示状态 badge 和提示文案

在 `render()` 方法中，找到：

```js
    const { character, promotion, decayStatus } = this.data;
```

替换为：

```js
    const { character, promotion, decayStatus, status } = this.data; // V2-F04 FB-03
    const currentStatus = status || '正常'; // V2-F04 FB-03
    const statusCfg = STATUS_CONFIG[currentStatus] || STATUS_CONFIG['正常']; // V2-F04 FB-03
```

然后在 `container.innerHTML` 模板中，找到：

```js
      <div class="page-header">${e(API.user.name)}</div>
```

替换为：

```js
      <div class="page-header">
        ${e(API.user.name)}
        <span class="status-badge" onclick="HomePage.changeStatus()" title="点击切换状态">
          ${statusCfg.icon} ${e(statusCfg.label)}
        </span>
      </div>
      ${statusCfg.tip ? `<div class="status-tip">${e(statusCfg.tip)}</div>` : ''}
```

注意：以上模板中每行末尾在实际代码中加 `<!-- V2-F04 FB-03 -->` 注释。

### 4d. CSS 样式（追加到 `public/css/style.css` 末尾）

```css
/* V2-F04 FB-03 - 状态 badge */
.status-badge { /* V2-F04 FB-03 */
  display: inline-block; /* V2-F04 FB-03 */
  font-size: 13px; /* V2-F04 FB-03 */
  padding: 2px 10px; /* V2-F04 FB-03 */
  border-radius: 12px; /* V2-F04 FB-03 */
  background: var(--bg-card, #f5f5f5); /* V2-F04 FB-03 */
  cursor: pointer; /* V2-F04 FB-03 */
  vertical-align: middle; /* V2-F04 FB-03 */
  margin-left: 8px; /* V2-F04 FB-03 */
}

.status-badge:active { /* V2-F04 FB-03 */
  opacity: 0.7; /* V2-F04 FB-03 */
}

.status-tip { /* V2-F04 FB-03 */
  font-size: 12px; /* V2-F04 FB-03 */
  color: var(--text-dim, #999); /* V2-F04 FB-03 */
  text-align: center; /* V2-F04 FB-03 */
  padding: 4px 16px 8px; /* V2-F04 FB-03 */
}
```

---

## 验收标准

### AC-1：数据库迁移
- [ ] 服务启动后，`users` 表包含 `status` 字段，默认值为 `'正常'`
- [ ] 已有用户数据不受影响，status 为 NULL 时前后端均 fallback 为 `'正常'`

### AC-2：状态切换接口
- [ ] `POST /api/character/status` body `{ "status": "生病" }` → 返回 `{ success: true, status: "生病" }`
- [ ] 传入非法值（如 `"死亡"`）→ 返回 400 错误
- [ ] 无需管理员权限，普通用户即可切换自己的状态

### AC-3：GET /api/character 返回 status
- [ ] 响应 JSON 顶层包含 `status` 字段，值为当前用户状态

### AC-4：衰退缓冲期联动
- [ ] 用户状态为「正常」时，缓冲期 = 15天（行为不变）
- [ ] 用户状态为「生病/出差/休假」时，缓冲期 = 30天
- [ ] 衰退阶梯（虚弱I/II/III）相对缓冲期偏移，间隔仍为 7天
- [ ] `getDecayStatus` 返回的 `daysUntilDecay` 和状态标签与新缓冲期一致

### AC-5：首页展示
- [ ] 首页用户名旁显示状态 badge（图标+文字），可点击
- [ ] 点击 badge 弹出选择，可切换为 4 种状态之一
- [ ] 非「正常」状态下，badge 下方显示对应提示文案
- [ ] 切换后页面自动刷新，badge 和提示文案更新

### AC-6：溯源注释
- [ ] 所有新增/修改的代码行包含 `// V2-F04 FB-03` 注释

---

## 不做的事（明确排除）

- 不做状态专属行为规则联动（留待后续版本）
- 不做状态自动切换（如定时恢复正常）
- 不做状态切换历史记录
- 不做管理员批量设置状态
