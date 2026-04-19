# Codex 指令：V2.6 UI 优化 — 行为页 + 愿望页

> **版本**：V2.6 UI 优化
> **来源**：`docs/ux-review-v26-ui-audit.md` + `docs/ui-design-guide.md`
> **涉及文件**：
> - `public/js/pages/behavior.js`
> - `public/js/pages/wish.js`
> - `public/css/style.css`

---

## 前置：CSS 新增样式（style.css）

**文件**：`public/css/style.css`
**位置**：文件末尾（第 573 行之后追加）

**改后代码**（追加）：

```css
/* V2.6 - Tab Bar 统一样式 */
.tab-bar {
  display: flex;
  gap: 0;
  margin-bottom: 12px;
}

.tab-bar-item {
  flex: 1;
  text-align: center;
  padding: 10px 14px;
  min-height: 44px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid var(--border);
  background: var(--bg-card-light);
  color: var(--text-dim);
  border-radius: 6px;
  transition: all 0.2s;
}

.tab-bar-item:first-child {
  border-radius: 6px 0 0 6px;
}

.tab-bar-item:last-child {
  border-radius: 0 6px 6px 0;
}

.tab-bar-item.active {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}

/* V2.6 - page-header 补充 flex 布局 */
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* V2.6 P11 - 筛选折叠行 */
.filter-collapsed-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  padding: 12px 16px;
}

.filter-collapsed-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-bright);
}

.filter-collapsed-summary {
  font-size: 12px;
  color: var(--text-dim);
  flex: 1;
  text-align: right;
  margin: 0 8px;
}

.filter-collapsed-indicator {
  font-size: 12px;
  color: var(--text-dim);
}

/* V2.6 P12 - 团队进度网格 */
.team-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 8px;
}

.team-grid-cell {
  padding: 6px 8px;
  background: var(--bg-card-light);
  border-radius: 6px;
}

.team-grid-name {
  font-size: 13px;
  font-weight: 500;
}

.team-grid-status {
  font-size: 12px;
}
```

---

## P10：行为页 Tab 样式统一

**问题编号**：P10
**文件**：`public/js/pages/behavior.js`
**行号**：62–72（`renderTabBar()` 方法）

**改前代码**（第 62–72 行）：

```js
  renderTabBar() {
    return `
      <div style="display:flex;gap:0;margin-bottom:12px;border-bottom:1px solid var(--border)">
        <button class="btn btn-small ${this.activeTab === 'report' ? 'btn-primary' : 'btn-secondary'}"
          style="border-radius:6px 0 0 0"
          onclick="BehaviorPage.switchTab('report')">上报</button>
        <button class="btn btn-small ${this.activeTab === 'history' ? 'btn-primary' : 'btn-secondary'}"
          style="border-radius:0 6px 0 0"
          onclick="BehaviorPage.switchTab('history')">历史</button>
      </div>
    `;
  },
```

**改后代码**：

```js
  renderTabBar() {
    return `
      <div class="tab-bar">
        <button class="tab-bar-item ${this.activeTab === 'report' ? 'active' : ''}"
          onclick="BehaviorPage.switchTab('report')">上报</button>
        <button class="tab-bar-item ${this.activeTab === 'history' ? 'active' : ''}"
          onclick="BehaviorPage.switchTab('history')">历史</button>
      </div>
    `;
  },
```

---

## P14：行为页 Header

**问题编号**：P14
**文件**：`public/js/pages/behavior.js`
**行号**：91（`render()` 方法中 `tabBar` 之后的 HTML 拼接）

**改前代码**（第 91 行）：

```js
    container.innerHTML = tabBar + `
      <div class="card">
```

**改后代码**：

```js
    container.innerHTML = tabBar + `
      <div class="page-header">行为</div>
      <div class="card">
```

---

## P9：行为页首屏充实（新用户自动展开第一个分类）

**问题编号**：P9
**文件**：`public/js/pages/behavior.js`
**行号**：75–89（`render()` 方法开头，上报 tab 分支）

**改前代码**（第 82–89 行）：

```js
    if (this.activeTab === 'history') {
      container.innerHTML = tabBar + this.renderHistory();
      this.loadHistory();
      return;
    }

    const cats = Object.keys(this.categories || {});
    const list = this.selectedCategory ? (this.categories[this.selectedCategory] || []) : [];
```

**改后代码**：

```js
    if (this.activeTab === 'history') {
      container.innerHTML = tabBar + this.renderHistory();
      this.loadHistory();
      return;
    }

    const cats = Object.keys(this.categories || {});

    // V2.6 P9 - 新用户首屏充实：无快捷入口时自动展开第一个分类
    const hasShortcuts = (this.shortcuts && this.shortcuts.length > 0) || !!this.lastBehavior;
    if (this.selectedCategory === null && !hasShortcuts && cats.length > 0) {
      this.selectedCategory = cats[0];
    }

    const list = this.selectedCategory ? (this.categories[this.selectedCategory] || []) : [];
```

---

## P11：愿望页筛选折叠

**问题编号**：P11
**文件**：`public/js/pages/wish.js`

### 步骤 1：新增状态字段

**行号**：22（在 `executing: false` 之后）

**改前代码**（第 22 行）：

```js
  executing: false, // V2.5 V25-018 - 挑战防重复标志位
```

**改后代码**：

```js
  executing: false, // V2.5 V25-018 - 挑战防重复标志位
  filterExpanded: false, // V2.6 P11 - 筛选面板折叠状态
```

### 步骤 2：load() 中重置 filterExpanded

**行号**：24–31（`load()` 方法）

**改前代码**（第 24–27 行）：

```js
  async load() {
    try {
      this.wishes = await API.get('/wishes');
      if (!this.showBattle) this.render();
```

**改后代码**：

```js
  async load() {
    try {
      this.wishes = await API.get('/wishes');
      this.filterExpanded = false; // V2.6 P11 - 每次加载重置筛选折叠
      if (!this.showBattle) this.render();
```

### 步骤 3：render() 中替换筛选区域

**行号**：113–135（render() 中的筛选 card）

**改前代码**（第 113–135 行）：

```js
      <div class="card">
        <div class="card-title" style="display:flex;justify-content:space-between;align-items:center">
          筛选
          ${(this.typeFilter !== '全部' || this.statusFilter !== '全部') ? `
            <button class="btn btn-small btn-secondary" style="font-size:11px"
              onclick="WishPage.setTypeFilter('全部');WishPage.setStatusFilter('全部')">清除筛选</button>
          ` : ''}
        </div>
        <div style="font-size:13px;color:var(--text-dim);margin-bottom:6px;font-weight:600">类型</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
          ${['全部', '单人', '团队'].map(t => `
            <button class="btn btn-small ${this.typeFilter === t ? 'btn-primary' : 'btn-secondary'}"
              onclick="WishPage.setTypeFilter('${t}')">${t}</button>
          `).join('')}
        </div>
        <div style="font-size:13px;color:var(--text-dim);margin-bottom:6px;font-weight:600">状态</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${['全部', '待挑战', '进行中', '已完成', '已兑现'].map(s => `
            <button class="btn btn-small ${this.statusFilter === s ? 'btn-primary' : 'btn-secondary'}"
              onclick="WishPage.setStatusFilter('${s}')">${s}</button>
          `).join('')}
        </div>
      </div>
```

**改后代码**：

```js
      ${this.wishes.length > 5 ? `
        ${this.filterExpanded ? `
          <div class="card">
            <div class="card-title" style="display:flex;justify-content:space-between;align-items:center">
              筛选
              <span>
                ${(this.typeFilter !== '全部' || this.statusFilter !== '全部') ? `
                  <button class="btn btn-small btn-secondary" style="font-size:11px;margin-right:4px"
                    onclick="WishPage.setTypeFilter('全部');WishPage.setStatusFilter('全部')">清除筛选</button>
                ` : ''}
                <a href="javascript:void(0)" style="font-size:12px;color:var(--text-dim)" onclick="WishPage.toggleFilter()">收起 ▴</a>
              </span>
            </div>
            <div style="font-size:13px;color:var(--text-dim);margin-bottom:6px;font-weight:600">类型</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
              ${['全部', '单人', '团队'].map(t => `
                <button class="btn btn-small ${this.typeFilter === t ? 'btn-primary' : 'btn-secondary'}"
                  onclick="WishPage.setTypeFilter('${t}')">${t}</button>
              `).join('')}
            </div>
            <div style="font-size:13px;color:var(--text-dim);margin-bottom:6px;font-weight:600">状态</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              ${['全部', '待挑战', '进行中', '已完成', '已兑现'].map(s => `
                <button class="btn btn-small ${this.statusFilter === s ? 'btn-primary' : 'btn-secondary'}"
                  onclick="WishPage.setStatusFilter('${s}')">${s}</button>
              `).join('')}
            </div>
          </div>
        ` : `
          <div class="card" style="padding:0" onclick="WishPage.toggleFilter()">
            <div class="filter-collapsed-row">
              <span class="filter-collapsed-title">筛选</span>
              <span class="filter-collapsed-summary" style="${(this.typeFilter !== '全部' || this.statusFilter !== '全部') ? 'color:var(--primary)' : ''}">类型:${this.typeFilter} · 状态:${this.statusFilter}</span>
              <span class="filter-collapsed-indicator">▾</span>
            </div>
          </div>
        `}
      ` : ''}
```

### 步骤 4：新增 toggleFilter() 方法

**行号**：在第 222 行 `setStatusFilter` 方法之后插入

**改前代码**（第 219–222 行）：

```js
  setStatusFilter(status) {
    this.statusFilter = status;
    this.render();
  },
```

**改后代码**：

```js
  setStatusFilter(status) {
    this.statusFilter = status;
    this.render();
  },

  // V2.6 P11 - 筛选面板折叠切换
  toggleFilter() {
    this.filterExpanded = !this.filterExpanded;
    this.render();
  },
```

---

## P12：团队进度网格

**问题编号**：P12
**文件**：`public/js/pages/wish.js`
**行号**：160–174（render() 中团队愿望的 teamProgress 渲染）

**改前代码**（第 160–174 行）：

```js
          ${w.type === '团队' ? `
            <div style="font-size:12px;color:var(--text-dim);margin-bottom:8px">
              ${Array.isArray(w.teamProgress) && w.teamProgress.length > 0
                ? (() => {
                    const visible = w.teamProgress.slice(0, 5);
                    const hidden = w.teamProgress.slice(5);
                    let html = visible.map(m => `${e(m.name)}：${e(m.status)}`).join(' · ');
                    if (hidden.length > 0) {
                      html += `<span id="team-hidden-${w.id}" style="display:none"> · ${hidden.map(m => `${e(m.name)}：${e(m.status)}`).join(' · ')}</span>`;
                      html += ` <a href="javascript:void(0)" onclick="event.stopPropagation();document.getElementById('team-hidden-${w.id}').style.display='inline';this.remove()" style="color:var(--primary)">查看全部 (${w.teamProgress.length}人)</a>`;
                    }
                    return html;
                  })()
                : '团队进度加载中…'}
            </div>
          ` : ''}
```

**改后代码**：

```js
          ${w.type === '团队' ? `
            <div style="font-size:12px;color:var(--text-dim);margin-bottom:8px" id="team-progress-${w.id}">
              ${Array.isArray(w.teamProgress) && w.teamProgress.length > 0
                ? (() => {
                    const visible = w.teamProgress.slice(0, 5);
                    const hidden = w.teamProgress.slice(5);
                    let html = visible.map(m => {
                      const statusColor = m.status === '已通过' ? 'var(--green)' : 'var(--text-dim)';
                      return `<span>${e(m.name)}：<span style="color:${statusColor}">${e(m.status)}</span></span>`;
                    }).join(' · ');
                    if (hidden.length > 0) {
                      html += ` <a href="javascript:void(0)" onclick="event.stopPropagation();WishPage.expandTeam(${w.id})" style="color:var(--primary)">查看全部 (${w.teamProgress.length}人)</a>`;
                    }
                    return html;
                  })()
                : '团队进度加载中…'}
            </div>
          ` : ''}
```

### 新增 expandTeam / collapseTeam 方法

**行号**：在 `canChallenge` 方法（第 224 行）之前插入

**改前代码**（第 224 行）：

```js
  canChallenge(wish) {
```

**改后代码**：

```js
  // V2.6 P12 - 展开团队进度为网格
  expandTeam(wishId) {
    const wish = this.wishes.find(w => w.id === wishId);
    const container = document.getElementById(`team-progress-${wishId}`);
    if (!wish || !container || !Array.isArray(wish.teamProgress)) return;
    const e = API.escapeHtml.bind(API);
    container.innerHTML = `
      <div class="team-grid">
        ${wish.teamProgress.map(m => {
          const statusColor = m.status === '已通过' ? 'var(--green)' : 'var(--text-dim)';
          return `
            <div class="team-grid-cell">
              <div class="team-grid-name">${e(m.name)}</div>
              <div class="team-grid-status" style="color:${statusColor}">${e(m.status)}</div>
            </div>
          `;
        }).join('')}
      </div>
      <a href="javascript:void(0)" onclick="event.stopPropagation();WishPage.collapseTeam(${wishId})"
        style="color:var(--primary);font-size:12px;display:inline-block;margin-top:6px">收起</a>
    `;
  },

  // V2.6 P12 - 收起团队进度恢复默认
  collapseTeam(wishId) {
    // 重新渲染整个页面以恢复默认态
    this.render();
  },

  canChallenge(wish) {
```

---

## P14：愿望页 Header 去除 inline style

**问题编号**：P14
**文件**：`public/js/pages/wish.js`
**行号**：108（render() 中的 page-header）

**改前代码**（第 108 行）：

```js
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:center">
```

**改后代码**：

```js
      <div class="page-header">
```

> 说明：`display:flex; justify-content:space-between; align-items:center` 已由 CSS 中 `.page-header` 的新增规则统一控制（见前置 CSS 变更）。

---

## 变更清单

| 编号 | 页面 | 改动 | 文件 |
|------|------|------|------|
| P9 | 行为 | 新用户首屏自动展开第一个分类 | behavior.js:82–89 |
| P10 | 行为 | Tab 样式改用 `.tab-bar` + `.tab-bar-item` | behavior.js:62–72 |
| P14 | 行为 | 插入 `<div class="page-header">行为</div>` | behavior.js:91 |
| P11 | 愿望 | 筛选折叠（≤5 隐藏，>5 折叠/展开） | wish.js:22, 24–27, 113–135, 219–222 |
| P12 | 愿望 | 团队进度网格展开/收起 | wish.js:160–174, 224 |
| P14 | 愿望 | page-header 去除 inline style | wish.js:108 |
| — | CSS | 新增 `.tab-bar` `.tab-bar-item` `.page-header` flex `.filter-collapsed-*` `.team-grid*` | style.css:573+ |
