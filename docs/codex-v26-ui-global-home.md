# Codex 指令：V2.6 UI 优化 — 全局 + 首页

> **版本**：V2.6 UI 优化
> **来源**：`docs/ux-review-v26-ui-audit.md` + `docs/ui-design-guide.md`
> **涉及文件**：`public/css/style.css`, `public/js/pages/home.js`
> **溯源**：P1 Hero 合并、P2 成就折叠、P4 间距层次、P14 header 统一、全局字号/圆角/间距规范

---

## 修改总览表

| 序号 | 问题编号 | 简述 | 涉及文件 | 类型 |
|------|---------|------|---------|------|
| 1 | 全局-01 | `--radius` 12px → 8px | style.css | 全局 |
| 2 | 全局-02 | `.card` margin-bottom 12px → 16px | style.css | 全局 |
| 3 | 全局-03 | 新增 `.card-tight` class | style.css | 全局 |
| 4 | 全局-04 | `.nav-item` font-size 11px → 12px | style.css | 全局 |
| 5 | 全局-05 | `.btn` font-size 14px → 15px | style.css | 全局 |
| 6 | 全局-06 | `.card-title` font-size 15px — 不变 | — | 确认 |
| 7 | 全局-07 | 新增 `.tab-bar` / `.tab-bar-item` 样式 | style.css | 全局 |
| 8 | P14 | `.page-header` 补充 flex 布局属性 | style.css | 全局 |
| 9 | P1 | Hero 合并：用户名+境界+修炼状态 → 单 card | home.js | 首页 |
| 10 | P2 | 成就折叠：默认收起，点击展开 | home.js | 首页 |
| 11 | P4 | 间距层次：属性雷达图 card-tight，趋势图去 inline margin | home.js | 首页 |

---

## 详细修改指令

### 1. 全局-01：`--radius` 12px → 8px

**文件**：`public/css/style.css`
**行号**：18

修改前：

```css
  --radius: 12px;
```

修改后：

```css
  --radius: 8px;
```

---

### 2. 全局-02：`.card` margin-bottom 12px → 16px

**文件**：`public/css/style.css`
**行号**：77-83

修改前：

```css
.card {
  background: var(--bg-card);
  border-radius: var(--radius);
  padding: 16px;
  margin-bottom: 12px;
  border: 1px solid var(--border);
}
```

修改后：

```css
.card {
  background: var(--bg-card);
  border-radius: var(--radius);
  padding: 16px;
  margin-bottom: 16px;
  border: 1px solid var(--border);
}
```

---

### 3. 全局-03：新增 `.card-tight` class

**文件**：`public/css/style.css`
**位置**：在 `.card` 规则（行 83）之后、`.card-title`（行 84）之前插入

插入内容：

```css
.card-tight { margin-bottom: 8px; }
```

---

### 4. 全局-04：`.nav-item` font-size 11px → 12px

**文件**：`public/css/style.css`
**行号**：46-54

修改前：

```css
.bottom-nav .nav-item {
  flex: 1;
  text-align: center;
  padding: 8px 4px;
  font-size: 11px;
  color: var(--text-dim);
  cursor: pointer;
  transition: color 0.2s;
}
```

修改后：

```css
.bottom-nav .nav-item {
  flex: 1;
  text-align: center;
  padding: 8px 4px;
  font-size: 12px;
  color: var(--text-dim);
  cursor: pointer;
  transition: color 0.2s;
}
```

---

### 5. 全局-05：`.btn` font-size 14px → 15px

**文件**：`public/css/style.css`
**行号**：92-104

修改前：

```css
.btn {
  display: inline-block;
  padding: 10px 20px;
  min-height: 44px; /* V25-039 - 确保触控区域 >= 44px */
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
  width: 100%;
}
```

修改后：

```css
.btn {
  display: inline-block;
  padding: 10px 20px;
  min-height: 44px; /* V25-039 - 确保触控区域 >= 44px */
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
  width: 100%;
}
```

---

### 6. 全局-06：`.card-title` font-size 15px — 确认不变

**文件**：`public/css/style.css`
**行号**：84-89

当前代码：

```css
.card-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-bright);
  margin-bottom: 8px;
}
```

已符合 ui-design-guide.md 规范，无需修改。

---

### 7. 全局-07：新增 `.tab-bar` / `.tab-bar-item` 样式

**文件**：`public/css/style.css`
**位置**：在 `.page.active { display: block; }`（行 60）之后、`/* Header */`（行 62）之前插入

插入内容：

```css
/* V2.6 - Tab bar 组件（行为页 P10 等） */
.tab-bar { display: flex; background: var(--bg-card-light); border-radius: 8px; padding: 2px; margin-bottom: 16px; }
.tab-bar-item { flex: 1; text-align: center; padding: 8px 0; font-size: 14px; font-weight: 400; color: var(--text-dim); border-radius: 6px; border: none; background: transparent; cursor: pointer; min-height: 36px; }
.tab-bar-item.active { background: var(--primary); color: #fff; font-weight: 600; }
```

---

### 8. P14：`.page-header` 补充 flex 布局属性

**文件**：`public/css/style.css`
**行号**：63-69

修改前：

```css
.page-header {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-bright);
  margin-bottom: 16px;
  padding-top: 8px;
}
```

修改后：

```css
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 20px;
  font-weight: 700;
  color: var(--text-bright);
  margin-bottom: 16px;
  padding-top: 8px;
}
```

---

### 9. P1：Hero 合并 — 用户名 + 境界 + 修炼状态 → 单 card

**文件**：`public/js/pages/home.js`

#### 9a. 删除 cultivationCard 独立变量

**行号**：530-552

删除以下整段代码：

```js
    const cultivationCard = cultivationStatus ? `
      <div class="card" style="margin-bottom:12px;border-left:4px solid ${cvColor}">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <span style="font-size:15px;font-weight:700;color:${cvColor}">
              ${cultivationStatus.level === '精进' ? '🔥 ' : ''}${e(cultivationStatus.level)}
            </span>
            <span style="font-size:13px;color:var(--text-dim);margin-left:8px">
              本周活跃 ${cultivationStatus.activeDays}/7 天 · ${cultivationStatus.activeCategories} 类
            </span>
          </div>
          ${cultivationStatus.dropBonus > 0 ? `
            <span style="font-size:12px;color:var(--gold)">良品+${Math.round(cultivationStatus.dropBonus * 100)}%</span>
          ` : ''}
          ${cultivationStatus.bufferAdjust < 0 ? `
            <span style="font-size:12px;color:var(--red)">缓冲${cultivationStatus.bufferAdjust}天</span>
          ` : ''}
        </div>
        ${cultivationStatus.nextLevelHint ? `
          <div style="font-size:12px;color:var(--text-dim);margin-top:6px">${e(cultivationStatus.nextLevelHint)}</div>
        ` : ''}
      </div>
    ` : '';
```

#### 9b. 替换 container.innerHTML 模板中的 page-header + 境界 card + cultivationCard

**行号**：554-604

修改前（完整的 `container.innerHTML = ...` 赋值）：

```js
    container.innerHTML = `
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between">
        <span>${e(API.user.name)}</span>
        <span class="status-badge status-${e(character.status || '居家')}"
          onclick="HomePage.showStatusPicker()"
          style="cursor:pointer;font-size:12px;padding:4px 10px;border-radius:12px;${(() => {
            const status = character.status || '居家';
            const statusColors = { 居家: 'var(--green)', 生病: 'var(--red)', 出差: 'var(--blue)' };
            const bg = statusColors[status] || 'var(--bg-card-light)';
            return `background:${bg};color:#fff`;
          })()};min-height:44px;min-width:44px;display:inline-flex;align-items:center;justify-content:center">
          ${e(character.status || '居家')} ▾
        </span>
      </div> <!-- V2-F04 FB-03 - 顶部展示用户名 + 状态badge -->

      <div class="card">
        <div class="realm-progress-line">
          ${promotion.canPromote ? `
            <button class="realm-badge realm-badge-action promotable" onclick="HomePage.promote()"
              role="status" aria-label="当前境界：${e(character.realm_stage)}，可晋级">
              ${realmStageText}
            </button>
          ` : `
            <span class="realm-badge"
              role="status" aria-label="当前境界：${e(character.realm_stage)}">
              ${realmStageText}
            </span>
          `}
          <span class="realm-progress-text">${realmProgressText}</span>
        </div>
        ${realmReason}
      </div>

      ${decayHtml ? `<div class="card"><div class="card-title">衰退预警</div>${decayHtml}</div>` : ''}

      ${cultivationCard}

      <div class="card">
        <div class="card-title">属性总览</div>
        ${this.renderRadar(character)}
      </div>

      ${this.renderTrend(trend)}

      ${this.renderRecommendations(character, trend)} <!-- V2-F03 FB-01 -->
      ${this.renderAchievements()} <!-- V2-F10 -->

      <div style="text-align:center;margin-top:20px">
        <span style="font-size:12px;color:var(--text-dim);cursor:pointer" onclick="HomePage.logout()">退出登录</span>
      </div>
    `;
```

修改后：

```js
    container.innerHTML = `
      <!-- V2.6 P1 - Hero card：合并用户名 + 境界 + 修炼状态 -->
      <div class="card">
        <!-- 第一行：用户名（左）+ 环境状态 badge（右） -->
        <div style="display:flex;align-items:center;justify-content:space-between">
          <span style="font-size:20px;font-weight:700;color:var(--text-bright)">${e(API.user.name)}</span>
          <span class="status-badge status-${e(character.status || '居家')}"
            onclick="HomePage.showStatusPicker()"
            style="cursor:pointer;font-size:12px;padding:4px 10px;border-radius:12px;${(() => {
              const status = character.status || '居家';
              const statusColors = { 居家: 'var(--green)', 生病: 'var(--red)', 出差: 'var(--blue)' };
              const bg = statusColors[status] || 'var(--bg-card-light)';
              return `background:${bg};color:#fff`;
            })()};min-height:44px;min-width:44px;display:inline-flex;align-items:center;justify-content:center">
            ${e(character.status || '居家')} ▾
          </span>
        </div>
        <!-- 第二行：境界 badge + 修炼状态 + 加成/缓冲标签 -->
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;align-items:center">
          ${promotion.canPromote ? `
            <button class="realm-badge realm-badge-action promotable" onclick="HomePage.promote()"
              role="status" aria-label="当前境界：${e(character.realm_stage)}，可晋级">
              ${realmStageText}
            </button>
          ` : `
            <span class="realm-badge"
              role="status" aria-label="当前境界：${e(character.realm_stage)}">
              ${realmStageText}
            </span>
          `}
          ${cultivationStatus ? `
            <span style="font-size:13px;font-weight:600;color:${cvColor}">
              ${cultivationStatus.level === '精进' ? '🔥 ' : ''}${e(cultivationStatus.level)} · ${cultivationStatus.activeDays}/7天 · ${cultivationStatus.activeCategories}类
            </span>
          ` : ''}
          ${cultivationStatus && cultivationStatus.dropBonus > 0 ? `
            <span style="font-size:12px;color:var(--gold)">良品+${Math.round(cultivationStatus.dropBonus * 100)}%</span>
          ` : ''}
          ${cultivationStatus && cultivationStatus.bufferAdjust < 0 ? `
            <span style="font-size:12px;color:var(--red)">缓冲${cultivationStatus.bufferAdjust}天</span>
          ` : ''}
        </div>
        <!-- 第三行（条件）：nextLevelHint -->
        ${cultivationStatus && cultivationStatus.nextLevelHint ? `
          <div style="font-size:12px;color:var(--text-dim);margin-top:6px">${e(cultivationStatus.nextLevelHint)}</div>
        ` : ''}
        <!-- 第四行：境界进度 + 原因 -->
        <div style="margin-top:8px">
          <span class="realm-progress-text">${realmProgressText}</span>
          ${realmReason}
        </div>
      </div>

      ${decayHtml ? `<div class="card"><div class="card-title">衰退预警</div>${decayHtml}</div>` : ''}

      <div class="card card-tight">
        <div class="card-title">属性总览</div>
        ${this.renderRadar(character)}
      </div>

      ${this.renderTrend(trend)}

      ${this.renderRecommendations(character, trend)}
      ${this.renderAchievements()}

      <div style="text-align:center;margin-top:20px">
        <span style="font-size:12px;color:var(--text-dim);cursor:pointer" onclick="HomePage.logout()">退出登录</span>
      </div>
    `;
```

**改动要点**：
- page-header 和境界独立 card 和 cultivationCard 三块合并为一个 Hero card
- 第一行 flex：用户名（20px, 700, --text-bright）左 + 环境状态 badge 右（保持现有 onclick 和样式）
- 第二行 flex wrap gap:8px：境界 .realm-badge + 修炼状态 span（cvColor, 13px, 600, 格式"🔥 精进 · 7/7天 · 3类"）+ dropBonus/bufferAdjust 小标签（12px）
- 第三行（条件）：nextLevelHint（12px, --text-dim, margin-top:6px）
- 第四行：realmProgressText + realmReason（13px, margin-top:8px）
- 属性雷达图 card 加 `card-tight` class（8px 间距）

---

### 10. P2：成就折叠 — 默认收起，点击展开

**文件**：`public/js/pages/home.js`

#### 10a. 新增 achievementsExpanded 属性

**行号**：19-26（HomePage 对象属性区域）

在 `trendDetailData: null,`（行 26）之后插入：

```js
  achievementsExpanded: false, // V2.6 P2 - 成就默认收起
```

#### 10b. load() 中重置 achievementsExpanded

**行号**：43-44（load() 方法内，`this.trendDetailDate = null;` 附近）

在 `this.trendDetailData = null;`（行 44）之后插入：

```js
      this.achievementsExpanded = false; // V2.6 P2 - 每次加载重置折叠状态
```

#### 10c. 替换 renderAchievements() 方法

**行号**：198-229

修改前：

```js
  // V2-F10 - 成就卡片渲染
  renderAchievements() {
    const e = API.escapeHtml.bind(API);
    if (!Array.isArray(this.achievements) || this.achievements.length === 0) {
      // V2.5 V25-079 - 空状态引导
      return `
        <div class="card">
          <div class="card-title">成就</div>
          <div class="empty-state" style="padding:24px 16px">
            <div class="empty-icon">🏆</div>
            <div style="font-size:13px;color:var(--text-dim)">继续修炼，解锁更多成就</div>
          </div>
        </div>
      `;
    }

    return `
      <div class="card"> <!-- V2-F10 -->
        <div class="card-title">成就</div>
        <div id="achievements-container">
          ${this.achievements.map(a => `
            <div class="achievement-item ${a.unlocked ? 'unlocked' : 'locked'}">
              <span class="achievement-icon">${e(a.icon)}</span>
              <div class="achievement-main">
                <div class="achievement-name">${e(a.name)}</div>
                <div class="achievement-desc">${e(a.desc)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  },
```

修改后：

```js
  // V2-F10 / V2.6 P2 - 成就卡片渲染（默认折叠）
  renderAchievements() {
    const e = API.escapeHtml.bind(API);
    if (!Array.isArray(this.achievements) || this.achievements.length === 0) {
      // V2.5 V25-079 - 空状态引导
      return `
        <div class="card">
          <div class="card-title">成就</div>
          <div class="empty-state" style="padding:24px 16px">
            <div class="empty-icon">🏆</div>
            <div style="font-size:13px;color:var(--text-dim)">继续修炼，解锁更多成就</div>
          </div>
        </div>
      `;
    }

    const unlockedCount = this.achievements.filter(a => a.unlocked).length;
    const totalCount = this.achievements.length;
    const lastUnlocked = this.achievements.filter(a => a.unlocked).slice(-1)[0];
    const indicator = this.achievementsExpanded ? '▴' : '▾';

    // V2.6 P2 - 摘要行：左侧"成就 X/6" + 右侧最近解锁 icon+name + 折叠指示器
    const summaryRow = `
      <div style="display:flex;align-items:center;justify-content:space-between;cursor:pointer"
        onclick="HomePage.achievementsExpanded=!HomePage.achievementsExpanded;HomePage.render()">
        <span style="font-size:15px;font-weight:600;color:var(--text-bright)">成就 ${unlockedCount}/${totalCount}</span>
        <div style="display:flex;align-items:center;gap:8px">
          ${lastUnlocked ? `<span style="font-size:13px;color:var(--text-dim)">${e(lastUnlocked.icon)} ${e(lastUnlocked.name)}</span>` : ''}
          <span style="font-size:14px;color:var(--text-dim)">${indicator}</span>
        </div>
      </div>
    `;

    if (!this.achievementsExpanded) {
      // V2.6 P2 - 收起态：只显示摘要行
      return `<div class="card">${summaryRow}</div>`;
    }

    // V2.6 P2 - 展开态：摘要行 + 完整成就列表
    return `
      <div class="card">
        ${summaryRow}
        <div id="achievements-container" style="margin-top:12px">
          ${this.achievements.map(a => `
            <div class="achievement-item ${a.unlocked ? 'unlocked' : 'locked'}">
              <span class="achievement-icon">${e(a.icon)}</span>
              <div class="achievement-main">
                <div class="achievement-name">${e(a.name)}</div>
                <div class="achievement-desc">${e(a.desc)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  },
```

---

### 11. P4：间距层次调整

**文件**：`public/js/pages/home.js`

#### 11a. 属性雷达图 card 加 card-tight

已在第 9 步（P1 Hero 合并）的 container.innerHTML 模板中完成：

```html
<div class="card card-tight">
  <div class="card-title">属性总览</div>
  ${this.renderRadar(character)}
</div>
```

#### 11b. 趋势图 card 去掉 inline style 的 margin-bottom:12px

**行号**：344（空状态趋势图）

修改前：

```js
        <div class="card" style="margin-bottom:12px">
```

修改后：

```js
        <div class="card">
```

**行号**：396（正常趋势图）

修改前：

```js
      <div class="card" style="margin-bottom:12px">
```

修改后：

```js
      <div class="card">
```

说明：删除 inline `margin-bottom:12px` 后，趋势图 card 使用全局 `.card` 的 `margin-bottom: 16px`（全局-02 已将其从 12px 改为 16px）。推荐 card 和成就 card 同理，使用默认 `.card` 的 16px 间距。

---

## 实施注意事项

1. 全局-01 到全局-07 和 P14 都是 style.css 的修改，可以一次性完成
2. P1 Hero 合并是最大的改动，涉及删除 cultivationCard 变量（行 530-552）和重写 container.innerHTML 模板（行 554-604），需要整体替换
3. P2 成就折叠需要新增属性 `achievementsExpanded`、在 load() 中重置、替换 renderAchievements() 方法
4. P4 间距调整分散在 renderTrend()（行 344、396）和 container.innerHTML 模板中
5. `.page-header` 加了 flex 属性后，其他页面如果 page-header 只有纯文字（如家庭页的"家庭"），flex 不影响单元素布局，无副作用
6. 全局-02 将 `.card` margin-bottom 从 12px 改为 16px，会影响所有页面的卡片间距。这是设计规范要求的跨区域间距标准
