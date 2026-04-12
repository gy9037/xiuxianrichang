# Codex 任务指令：V2-F07 行为历史记录

## 背景
玩家看不到自己的成长轨迹，削弱养成感。需要在行为页新增"历史"tab，展示日历视图和本周总结。

## 技术栈
Node.js + Express + SQLite + 原生 HTML/JS。所有新增/修改代码加注释 `// V2-F07`。

---

## 改动 1：后端 — `server/routes/behavior.js`

在 `module.exports = router;` 之前，新增两个路由。

### 1.1 GET /api/behavior/history

```js
// V2-F07 - 按月查询行为历史（按日期分组）
router.get('/history', (req, res) => {
  const year = parseInt(req.query.year, 10);
  const month = parseInt(req.query.month, 10);
  if (!year || !month || month < 1 || month > 12) {
    return res.status(400).json({ error: '请提供有效的 year 和 month 参数' });
  }

  // V2-F07 - 构造月份起止时间
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endMonth = month === 12 ? 1 : month + 1;
  const endYear = month === 12 ? year + 1 : year;
  const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;

  // V2-F07 - 查询该月所有行为记录（含道具信息）
  const rows = db.prepare(`
    SELECT b.id, b.category, b.sub_type, b.quality, b.completed_at,
           i.name AS item_name, i.quality AS item_quality, i.temp_value AS item_temp_value
    FROM behaviors b
    LEFT JOIN items i ON b.item_id = i.id
    WHERE b.user_id = ? AND b.completed_at >= ? AND b.completed_at < ?
    ORDER BY b.completed_at ASC
  `).all(req.user.id, startDate, endDate);

  // V2-F07 - 按日期分组，key 为 "YYYY-MM-DD"
  const grouped = {};
  for (const row of rows) {
    const day = row.completed_at.slice(0, 10); // "YYYY-MM-DD"
    if (!grouped[day]) grouped[day] = [];
    grouped[day].push(row);
  }

  res.json({ year, month, days: grouped });
});
```

### 1.2 GET /api/behavior/weekly-summary

```js
// V2-F07 - 本周总结（行为数 + 道具数）
router.get('/weekly-summary', (req, res) => {
  // V2-F07 - 计算本周一 00:00:00
  const now = new Date();
  const dayOfWeek = now.getDay() || 7; // 周日=7
  const monday = new Date(now);
  monday.setDate(now.getDate() - dayOfWeek + 1);
  monday.setHours(0, 0, 0, 0);
  const weekStart = formatLocalDate(monday);

  // V2-F07 - 统计本周行为数
  const behaviorCount = db.prepare(`
    SELECT COUNT(*) AS cnt FROM behaviors
    WHERE user_id = ? AND completed_at >= ?
  `).get(req.user.id, weekStart).cnt;

  // V2-F07 - 统计本周获得道具数
  const itemCount = db.prepare(`
    SELECT COUNT(*) AS cnt FROM items
    WHERE user_id = ? AND id IN (
      SELECT item_id FROM behaviors
      WHERE user_id = ? AND completed_at >= ? AND item_id IS NOT NULL
    )
  `).get(req.user.id, req.user.id, weekStart).cnt;

  res.json({ weekStart, behaviorCount, itemCount });
});
```

注意：`formatLocalDate` 已在文件顶部定义，可直接复用。

---

## 改动 2：前端 — `public/js/pages/behavior.js`

### 2.1 新增状态字段

在 `BehaviorPage` 对象顶部（`showCustomForm: false,` 之后）新增：

```js
  // V2-F07 - 历史 tab 状态
  activeTab: 'report',        // V2-F07 - 'report' | 'history'
  historyYear: new Date().getFullYear(),   // V2-F07
  historyMonth: new Date().getMonth() + 1, // V2-F07
  historyData: null,           // V2-F07 - { year, month, days: { "YYYY-MM-DD": [...] } }
  weeklySummary: null,         // V2-F07 - { weekStart, behaviorCount, itemCount }
  selectedDate: null,          // V2-F07 - 当前选中的日期 "YYYY-MM-DD"
```

### 2.2 修改 render() 方法

在 `render()` 方法的 `container.innerHTML` 赋值中，将原来的 `<div class="page-header">行为上报</div>` 替换为带 tab 切换的头部：

```js
    container.innerHTML = `
      <div class="page-header">
        <!-- V2-F07 - Tab 切换 -->
        <div style="display:flex;gap:12px;align-items:center">
          <button class="btn btn-small ${this.activeTab === 'report' ? 'btn-primary' : 'btn-secondary'}"
            onclick="BehaviorPage.switchTab('report')">上报</button>
          <button class="btn btn-small ${this.activeTab === 'history' ? 'btn-primary' : 'btn-secondary'}"
            onclick="BehaviorPage.switchTab('history')">历史</button>
        </div>
      </div>

      ${this.activeTab === 'report' ? this.renderReportTab() : this.renderHistoryTab()}
    `;

    if (this.activeTab === 'report') {
      this.loadHistory();
    }
```

### 2.3 抽取 renderReportTab()

将原 `render()` 中 tab 头部以下的所有上报相关 HTML（从 `${this.renderShortcuts()}` 到最后的 `最近记录` card）提取为新方法 `renderReportTab()`，原样返回该 HTML 字符串。

```js
  // V2-F07 - 上报 tab 内容（从原 render 中提取）
  renderReportTab() {
    const cats = Object.keys(this.categories || {});
    const e = API.escapeHtml.bind(API);
    const grouped = this.isGroupedCategory(this.selectedCategory);
    const subCategories = grouped ? Object.keys(this.categories[this.selectedCategory] || {}) : [];
    const list = this.getBehaviorList(this.selectedCategory, this.selectedSubCategory);

    return `
      ${this.renderShortcuts()}
      <!-- ... 原有的选择行为类型 card、自定义表单、输入表单、最近记录 card 全部保留 ... -->
      <div class="card">
        <div class="card-title">选择行为类型</div>
        <!-- 原有内容不变 -->
        ...
      </div>
      ${this.showCustomForm ? this.renderCustomForm() : ''}
      ${this.selectedBehavior ? this.renderInputForm() : ''}
      <div class="card" style="margin-top:16px">
        <div class="card-title">最近记录</div>
        <div id="behavior-history"></div>
      </div>
    `;
  },
```

### 2.4 新增 renderHistoryTab()

```js
  // V2-F07 - 历史 tab 内容
  renderHistoryTab() {
    const e = API.escapeHtml.bind(API);
    const ws = this.weeklySummary;
    const data = this.historyData;
    const days = data?.days || {};

    // V2-F07 - 生成日历网格
    const firstDay = new Date(this.historyYear, this.historyMonth - 1, 1);
    const lastDay = new Date(this.historyYear, this.historyMonth, 0);
    const startWeekday = firstDay.getDay() || 7; // 周一=1
    const totalDays = lastDay.getDate();

    let calendarCells = '';
    // 填充月初空白（周一开始）
    for (let i = 1; i < startWeekday; i++) {
      calendarCells += '<div class="calendar-cell empty"></div>';
    }
    // 填充每一天
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${this.historyYear}-${String(this.historyMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const hasData = !!days[dateStr];
      const isSelected = this.selectedDate === dateStr;
      calendarCells += `
        <div class="calendar-cell ${hasData ? 'has-data' : ''} ${isSelected ? 'selected' : ''}"
          onclick="BehaviorPage.selectHistoryDate('${dateStr}')">${d}</div>
      `;
    }

    // V2-F07 - 选中日期的行为列表
    let dayDetail = '';
    if (this.selectedDate && days[this.selectedDate]) {
      dayDetail = days[this.selectedDate].map(b => `
        <div class="item-row">
          <div class="item-info">
            <div class="item-name">${e(b.sub_type)}</div>
            <div class="item-meta">${e(b.category)} · <span class="quality-${['凡品','良品','上品','极品'].includes(b.quality) ? b.quality : '凡品'}">${e(b.quality)}</span></div>
          </div>
          <div style="text-align:right">
            <div class="item-name quality-${['凡品','良品','上品','极品'].includes(b.item_quality) ? b.item_quality : '凡品'}">${e(b.item_name || '')}</div>
          </div>
        </div>
      `).join('');
    } else if (this.selectedDate) {
      dayDetail = '<div class="empty-state">当天没有行为记录</div>';
    }

    return `
      <!-- V2-F07 - 本周总结 -->
      <div class="card">
        <div class="card-title">本周总结</div>
        <div style="display:flex;gap:24px">
          <div>完成行为 <strong>${ws ? ws.behaviorCount : '-'}</strong> 次</div>
          <div>获得道具 <strong>${ws ? ws.itemCount : '-'}</strong> 个</div>
        </div>
      </div>

      <!-- V2-F07 - 月历导航 -->
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <button class="btn btn-small btn-secondary" onclick="BehaviorPage.changeMonth(-1)">◀</button>
          <div class="card-title" style="margin:0">${this.historyYear}年${this.historyMonth}月</div>
          <button class="btn btn-small btn-secondary" onclick="BehaviorPage.changeMonth(1)">▶</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;text-align:center">
          <div style="font-size:12px;color:var(--text-dim)">一</div>
          <div style="font-size:12px;color:var(--text-dim)">二</div>
          <div style="font-size:12px;color:var(--text-dim)">三</div>
          <div style="font-size:12px;color:var(--text-dim)">四</div>
          <div style="font-size:12px;color:var(--text-dim)">五</div>
          <div style="font-size:12px;color:var(--text-dim)">六</div>
          <div style="font-size:12px;color:var(--text-dim)">日</div>
          ${calendarCells}
        </div>
      </div>

      <!-- V2-F07 - 选中日期详情 -->
      ${this.selectedDate ? `
        <div class="card">
          <div class="card-title">${e(this.selectedDate)} 行为记录</div>
          ${dayDetail}
        </div>
      ` : ''}
    `;
  },
```

### 2.5 新增交互方法

```js
  // V2-F07 - 切换 tab
  switchTab(tab) {
    this.activeTab = tab;
    if (tab === 'history') {
      this.loadHistoryTab();
    } else {
      this.render();
    }
  },

  // V2-F07 - 加载历史 tab 数据
  async loadHistoryTab() {
    try {
      const [historyData, weeklySummary] = await Promise.all([
        API.get(`/behavior/history?year=${this.historyYear}&month=${this.historyMonth}`),
        API.get('/behavior/weekly-summary'),
      ]);
      this.historyData = historyData;
      this.weeklySummary = weeklySummary;
      this.render();
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  // V2-F07 - 切换月份
  changeMonth(delta) {
    this.historyMonth += delta;
    if (this.historyMonth > 12) { this.historyMonth = 1; this.historyYear++; }
    if (this.historyMonth < 1) { this.historyMonth = 12; this.historyYear--; }
    this.selectedDate = null;
    this.loadHistoryTab();
  },

  // V2-F07 - 选中某天
  selectHistoryDate(dateStr) {
    this.selectedDate = this.selectedDate === dateStr ? null : dateStr;
    this.render();
  },
```

### 2.6 新增 CSS（日历格子样式）

在 `public/css/style.css`（或项目现有样式文件）末尾追加：

```css
/* V2-F07 - 日历格子 */
.calendar-cell {
  padding: 8px 4px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.15s;
}
.calendar-cell.empty { cursor: default; }
.calendar-cell.has-data { background: var(--primary-light, #e8f5e9); font-weight: bold; }
.calendar-cell.selected { background: var(--primary, #4caf50); color: #fff; }
.calendar-cell:not(.empty):hover { background: var(--hover-bg, #f0f0f0); }
.calendar-cell.selected:hover { background: var(--primary, #4caf50); }
```

---

## 验收标准

1. 行为页顶部出现「上报 | 历史」两个 tab 按钮，默认选中"上报"
2. 点击"历史"tab 后：
   - 顶部显示"本周总结"卡片，包含本周行为数和道具数
   - 下方显示当月日历网格，有行为的日期高亮（绿色背景）
   - 可通过 ◀ ▶ 按钮切换月份
3. 点击日历中某一天：
   - 下方展开该天的行为列表，显示行为名称、品质、获得道具
   - 再次点击同一天可收起
4. 切回"上报"tab，原有上报功能不受影响
5. `GET /api/behavior/history?year=2026&month=4` 返回 `{ year, month, days: { "2026-04-01": [...], ... } }`
6. `GET /api/behavior/weekly-summary` 返回 `{ weekStart, behaviorCount, itemCount }`
7. 所有新增代码包含 `// V2-F07` 溯源注释
