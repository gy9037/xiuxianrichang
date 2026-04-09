# Codex 任务指令 — V2-F07 行为历史记录

> 溯源标注：`// V2-F07`
> 涉及文件：`server/routes/behavior.js`、`public/js/pages/behavior.js`

---

## 文件一：server/routes/behavior.js

### 改动 1：新增 GET /api/behavior/history

在现有路由末尾（`module.exports` 之前）添加：

```js
// V2-F07 - 按月查询行为历史，按日期分组
router.get('/history', requireAuth, async (req, res) => {
  const { year, month } = req.query;
  if (!year || !month) return res.status(400).json({ error: '缺少 year 或 month 参数' });

  const mm = month.padStart(2, '0');
  const rows = await db.all(
    `SELECT b.*, i.name as item_name
     FROM behaviors b
     LEFT JOIN items i ON i.id = b.item_id
     WHERE b.user_id = ?
       AND strftime('%Y', b.completed_at, 'localtime') = ?
       AND strftime('%m', b.completed_at, 'localtime') = ?
     ORDER BY b.completed_at DESC`,
    [req.user.id, String(year), mm]
  );

  // 按本地日期分组
  const grouped = {};
  for (const row of rows) {
    const dateKey = new Date(row.completed_at).toLocaleDateString('sv-SE'); // YYYY-MM-DD
    if (!grouped[dateKey]) grouped[dateKey] = [];
    grouped[dateKey].push({
      id: row.id,
      sub_type: row.sub_type,
      quality: row.quality,
      item_name: row.item_name,
      completed_at: row.completed_at,
    });
  }

  res.json(grouped);
});
```

### 改动 2：新增 GET /api/behavior/weekly-summary

紧接上方路由之后添加：

```js
// V2-F07 - 本周行为数和道具数汇总
router.get('/weekly-summary', requireAuth, async (req, res) => {
  const rows = await db.all(
    `SELECT b.id, b.item_id
     FROM behaviors b
     WHERE b.user_id = ?
       AND b.completed_at >= datetime('now', 'localtime', 'weekday 0', '-7 days')`,
    [req.user.id]
  );

  const behavior_count = rows.length;
  const item_count = rows.filter(r => r.item_id != null).length;

  res.json({ behavior_count, item_count });
});
```

> 注意：`weekday 0` 在 SQLite 中为周日。如项目以周一为起点，改为 `'weekday 1', '-7 days'`。

---

## 文件二：public/js/pages/behavior.js

### 改动 1：对象顶部新增状态字段

在 `BehaviorPage = {` 开头，现有字段之后插入：

```js
// V2-F07 - 历史 tab 状态
activeTab: 'report',      // 'report' | 'history'
historyData: null,        // { 'YYYY-MM-DD': [{...}] }
selectedDate: null,       // 当前选中日期字符串
weeklySummary: null,      // { behavior_count, item_count }
historyYear: null,        // 当前查看年份（null = 当前月）
historyMonth: null,       // 当前查看月份（null = 当前月）
```

### 改动 2：render() 顶部插入 tab 切换

在 `render()` 方法中，`container.innerHTML = \`` 的第一行（`<div class="page-header">行为上报</div>` 之前）替换为：

```js
render() {
  const container = document.getElementById('page-behavior');
  const e = API.escapeHtml.bind(API);

  // V2-F07 - tab 切换：上报 | 历史
  const tabBar = `
    <div style="display:flex;gap:0;margin-bottom:12px;border-bottom:1px solid var(--border)">
      <button class="btn btn-small ${this.activeTab === 'report' ? 'btn-primary' : 'btn-secondary'}"
        style="border-radius:6px 0 0 0"
        onclick="BehaviorPage.switchTab('report')">上报</button>
      <button class="btn btn-small ${this.activeTab === 'history' ? 'btn-primary' : 'btn-secondary'}"
        style="border-radius:0 6px 0 0"
        onclick="BehaviorPage.switchTab('history')">历史</button>
    </div>
  `;

  if (this.activeTab === 'history') {
    container.innerHTML = tabBar + this.renderHistory();
    this.loadHistory();   // V2-F07 - 加载历史数据（含 weekly-summary）
    return;
  }

  // 以下为原有 report tab 内容，保持不变
  const cats = Object.keys(this.categories || {});
  // ... 原有 render() 剩余逻辑不变，只需在 container.innerHTML 拼接时在最前面加 tabBar
```

> 具体操作：将原 `container.innerHTML = \`` 改为 `container.innerHTML = tabBar + \``，其余内容不动。

### 改动 3：新增 switchTab() 方法

在 `selectCategory()` 之前插入：

```js
// V2-F07 - 切换 tab
switchTab(tab) {
  this.activeTab = tab;
  this.render();
},
```

### 改动 4：新增 loadHistory() 方法（替换现有同名方法）

现有 `loadHistory()` 只加载最近记录列表（用于 report tab 底部），**保留原方法，改名为 `loadRecentHistory()`**，然后新增：

```js
// V2-F07 - 加载历史 tab 数据（月历 + 本周汇总）
async loadHistory() {
  const now = new Date();
  const year  = this.historyYear  ?? now.getFullYear();
  const month = this.historyMonth ?? (now.getMonth() + 1);

  try {
    const [grouped, summary] = await Promise.all([
      API.get(`/behavior/history?year=${year}&month=${String(month).padStart(2, '0')}`),
      this.weeklySummary ? Promise.resolve(this.weeklySummary) : API.get('/behavior/weekly-summary'),
    ]);
    this.historyData   = grouped;
    this.weeklySummary = summary;
    this.historyYear   = year;
    this.historyMonth  = month;

    const el = document.getElementById('page-behavior');
    if (el) el.innerHTML =
      `<div style="display:flex;gap:0;margin-bottom:12px;border-bottom:1px solid var(--border)">
        <button class="btn btn-small btn-secondary" style="border-radius:6px 0 0 0"
          onclick="BehaviorPage.switchTab('report')">上报</button>
        <button class="btn btn-small btn-primary" style="border-radius:0 6px 0 0"
          onclick="BehaviorPage.switchTab('history')">历史</button>
      </div>` + this.renderHistory();
  } catch (err) {
    App.toast(err.message, 'error');
  }
},
```

> 同时将 `render()` 末尾的 `this.loadHistory()` 调用改为 `this.loadRecentHistory()`。

### 改动 5：新增 renderHistory() 方法

在 `renderShortcuts()` 之前插入：

```js
// V2-F07 - 渲染历史 tab（本周汇总 + 月历 + 日期详情）
renderHistory() {
  const e = API.escapeHtml.bind(API);
  const now = new Date();
  const year  = this.historyYear  ?? now.getFullYear();
  const month = this.historyMonth ?? (now.getMonth() + 1);
  const data  = this.historyData  ?? {};
  const summary = this.weeklySummary;

  // 本周汇总卡片
  const summaryCard = summary ? `
    <div class="card" style="margin-bottom:12px">
      <div class="card-title">本周汇总</div>
      <div style="display:flex;gap:24px;font-size:14px">
        <span>行为 <strong>${summary.behavior_count}</strong> 次</span>
        <span>道具 <strong>${summary.item_count}</strong> 件</span>
      </div>
    </div>
  ` : '<div class="card" style="margin-bottom:12px"><div class="item-meta">加载中…</div></div>';

  // 月历头部（上月 / 年月 / 下月）
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear  = month === 1 ? year - 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear  = month === 12 ? year + 1 : year;

  const calHeader = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <button class="btn btn-small btn-secondary"
        onclick="BehaviorPage.navMonth(${prevYear},${prevMonth})">‹</button>
      <span style="font-weight:600">${year} 年 ${month} 月</span>
      <button class="btn btn-small btn-secondary"
        onclick="BehaviorPage.navMonth(${nextYear},${nextMonth})">›</button>
    </div>
  `;

  // 月历格子
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=周日
  const daysInMonth = new Date(year, month, 0).getDate();
  const weekLabels = ['日','一','二','三','四','五','六']
    .map(d => `<div style="text-align:center;font-size:11px;color:var(--text-dim)">${d}</div>`)
    .join('');

  let cells = '';
  for (let i = 0; i < firstDay; i++) cells += '<div></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const hasBehavior = !!data[dateStr];
    const isSelected  = this.selectedDate === dateStr;
    cells += `
      <div onclick="BehaviorPage.selectDate('${dateStr}')"
        style="text-align:center;padding:6px 2px;border-radius:6px;cursor:pointer;font-size:13px;
               background:${isSelected ? 'var(--primary)' : hasBehavior ? 'var(--primary-dim, #e8f4ff)' : 'transparent'};
               color:${isSelected ? '#fff' : 'inherit'};
               font-weight:${hasBehavior ? '600' : '400'}">
        ${d}
      </div>`;
  }

  const calGrid = `
    <div class="card" style="margin-bottom:12px">
      ${calHeader}
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px">
        ${weekLabels}
        ${cells}
      </div>
    </div>
  `;

  // 选中日期的行为列表
  let dateDetail = '';
  if (this.selectedDate && data[this.selectedDate]) {
    const rows = data[this.selectedDate];
    dateDetail = `
      <div class="card">
        <div class="card-title">${this.selectedDate} 的行为记录</div>
        ${rows.map(b => `
          <div class="item-row">
            <div class="item-info">
              <div class="item-name">${e(b.sub_type)}</div>
              <div class="item-meta">
                ${(() => {
                  const q = ['凡品','良品','上品','极品'].includes(b.quality) ? b.quality : '凡品';
                  return `<span class="quality-${q}">${e(b.quality)}</span>`;
                })()}
                ${b.item_name ? `· ${e(b.item_name)}` : ''}
              </div>
            </div>
            <div class="item-meta">${new Date(b.completed_at).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</div>
          </div>
        `).join('')}
      </div>
    `;
  } else if (this.selectedDate) {
    dateDetail = `<div class="card"><div class="empty-state">当天没有行为记录</div></div>`;
  }

  return summaryCard + calGrid + dateDetail;
},
```

### 改动 6：新增 selectDate() 和 navMonth() 方法

```js
// V2-F07 - 选中日期，展示当天行为列表
selectDate(dateStr) {
  this.selectedDate = this.selectedDate === dateStr ? null : dateStr;
  const el = document.getElementById('page-behavior');
  if (el) {
    // 只重绘历史区域，不重新请求数据
    const tabBar = el.querySelector('div:first-child');
    el.innerHTML = (tabBar ? tabBar.outerHTML : '') + this.renderHistory();
  }
},

// V2-F07 - 切换月份
navMonth(year, month) {
  this.historyYear  = year;
  this.historyMonth = month;
  this.historyData  = null;
  this.selectedDate = null;
  this.render();
},
```

---

## 验收标准

1. 点击「历史」tab，能看到本周行为数/道具数汇总卡片，以及当月月历（有行为的日期高亮）。
2. 点击月历中某个高亮日期，卡片下方展示当天行为列表（sub_type、quality、item_name、时间）。
3. 点击月历左右箭头可切换月份，数据重新加载，「上报」tab 功能不受影响。
