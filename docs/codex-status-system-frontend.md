# Codex: 环境状态 + 修炼状态体系 — 前端改动

## 修改总览

| # | 文件 | 改动摘要 |
|---|------|----------|
| 1 | `home.js` render() | 状态 badge 默认值 `'正常'` → `'居家'` |
| 2 | `home.js` showStatusPicker() | 弹窗选项改为 `居家/生病/出差`，移除 `正常/休假` |
| 3 | `home.js` setStatus() | 状态切换成功后清空 `BehaviorPage.categories` 缓存 |
| 4 | `home.js` render() | 状态 badge 按环境状态着色（居家绿/生病红/出差蓝） |
| 5 | `home.js` load() | 保存 `this.cultivationStatus` |
| 6 | `home.js` render() | 衰退预警之后、雷达图之前插入修炼状态卡片 |
| 7 | `behavior.js` submit() | 提交成功 toast 追加修炼状态信息 |
| 8 | `style.css` | 无新增（修炼状态卡片全部内联样式） |

---

## 改动 1：状态 badge 默认值

**文件** `public/js/pages/home.js` — `render()` 方法

**定位** 第 320–324 行，状态 badge 区域。

**修改前**
```js
        <span class="status-badge status-${e(character.status || '正常')}"
          onclick="HomePage.showStatusPicker()"
          style="cursor:pointer;font-size:12px;padding:4px 10px;border-radius:12px;background:var(--bg-card-light);min-height:44px;min-width:44px;display:inline-flex;align-items:center;justify-content:center">
          ${e(character.status || '正常')} ▾
        </span>
```

**修改后**
```js
        <span class="status-badge status-${e(character.status || '居家')}"
          onclick="HomePage.showStatusPicker()"
          style="cursor:pointer;font-size:12px;padding:4px 10px;border-radius:12px;${(() => {
            const s = character.status || '居家';
            const statusColors = { '居家': 'var(--green)', '生病': 'var(--red)', '出差': 'var(--blue)' };
            const bg = statusColors[s] || 'var(--bg-card-light)';
            return `background:${bg};color:#fff`;
          })()};min-height:44px;min-width:44px;display:inline-flex;align-items:center;justify-content:center">
          ${e(character.status || '居家')} ▾
        </span>
```

> 说明：改动 1 和改动 4（badge 着色）合并在同一处完成。默认值从 `'正常'` 改为 `'居家'`，同时根据状态值动态设置背景色。

---

## 改动 2：showStatusPicker 弹窗选项

**文件** `public/js/pages/home.js` — `showStatusPicker()` 方法

**定位** 第 366–371 行，`STATUS_CONFIG` 对象。

**修改前**
```js
    const STATUS_CONFIG = {
      正常: { icon: '✨', desc: '日常修炼，正常计算衰退' },
      生病: { icon: '🤒', desc: '身体欠佳，衰退缓冲延长至30天' },
      出差: { icon: '✈️', desc: '外出奔波，衰退缓冲延长至30天' },
      休假: { icon: '🏖️', desc: '休养生息，衰退缓冲延长至30天' },
    };
```

**修改后**
```js
    const STATUS_CONFIG = {
      居家: { icon: '🏠', desc: '日常修炼，正常计算衰退' },
      生病: { icon: '🤒', desc: '身体欠佳，衰退缓冲延长至30天' },
      出差: { icon: '✈️', desc: '外出奔波，衰退缓冲延长至30天' },
    };
```

---

## 改动 3：状态切换后清空行为页缓存

**文件** `public/js/pages/home.js` — `setStatus()` 方法

**定位** 第 418–422 行，`try` 块内 `await API.post` 成功之后。

**修改前**
```js
    try {
      await API.post('/character/status', { status });
      modal?.remove();
      App.toast(`状态已切换为：${status}`, 'success');
      this.load();
```

**修改后**
```js
    try {
      await API.post('/character/status', { status });
      modal?.remove();
      App.toast(`状态已切换为：${status}`, 'success');
      // 清空行为页缓存，下次进入时重新加载（环境状态影响可用行为集合）
      if (typeof BehaviorPage !== 'undefined') {
        BehaviorPage.categories = null;
      }
      this.load();
```

---

## 改动 4：状态 badge 着色

已合并到改动 1 中实现。颜色映射：

| 状态 | 背景色 |
|------|--------|
| 居家 | `var(--green)` (#10b981) |
| 生病 | `var(--red)` (#ef4444) |
| 出差 | `var(--blue)` (#3b82f6) |

---

## 改动 5：load() 中保存修炼状态

**文件** `public/js/pages/home.js` — `load()` 方法

**定位** 第 40–41 行，`this.data = characterData;` 之后。

**修改前**
```js
      this.data = characterData;
      this.achievements = Array.isArray(achievementsData) ? achievementsData : [];
```

**修改后**
```js
      this.data = characterData;
      this.cultivationStatus = characterData.cultivationStatus || null;
      this.achievements = Array.isArray(achievementsData) ? achievementsData : [];
```

---

## 改动 6：render() 中插入修炼状态卡片

**文件** `public/js/pages/home.js` — `render()` 方法

**定位** 第 345–358 行。修炼状态卡片插入到衰退预警 (`decayHtml`) 之后、属性总览（雷达图）卡片之前。

当前 render() 中 `container.innerHTML` 的结构顺序是：
1. 页面头部（用户名 + 状态 badge）
2. 境界卡片
3. 属性总览（雷达图）
4. 推荐
5. 成就
6. 衰退预警
7. 退出登录

改动后顺序：
1. 页面头部（用户名 + 状态 badge）
2. 境界卡片
3. **衰退预警**（上移）
4. **修炼状态卡片**（新增）
5. 属性总览（雷达图）
6. 推荐
7. 成就
8. 退出登录

**修改前** — `container.innerHTML` 模板（第 317–358 行）
```js
    container.innerHTML = `
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between">
        ...badge...
      </div>

      <div class="card">
        ...境界...
      </div>

      <div class="card">
        <div class="card-title">属性总览</div>
        ${this.renderRadar(character)}
      </div>

      ${this.renderRecommendations(character)}
      ${this.renderAchievements()}

      ${decayHtml ? `<div class="card"><div class="card-title">衰退预警</div>${decayHtml}</div>` : ''}

      <div style="text-align:center;margin-top:20px">
        <span style="font-size:12px;color:var(--text-dim);cursor:pointer" onclick="HomePage.logout()">退出登录</span>
      </div>
    `;
```

**修改后** — 在 `render()` 方法中，`container.innerHTML` 赋值之前，先构建修炼状态卡片 HTML：

在 `render()` 方法内、`container.innerHTML = ...` 之前（`realmReason` 之后），新增以下代码块：

```js
    // --- 修炼状态卡片 ---
    const cultivationStatus = this.cultivationStatus;
    const cultivationColors = {
      '精进': 'var(--gold)',
      '稳修': 'var(--primary)',
      '懈怠': 'var(--text-dim)',
      '停滞': 'var(--red)',
    };
    const cvColor = cultivationColors[cultivationStatus?.level] || 'var(--text-dim)';
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

然后修改 `container.innerHTML` 模板，调整顺序并插入 `cultivationCard`：

```js
    container.innerHTML = `
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between">
        <span>${e(API.user.name)}</span>
        <span class="status-badge status-${e(character.status || '居家')}"
          onclick="HomePage.showStatusPicker()"
          style="cursor:pointer;font-size:12px;padding:4px 10px;border-radius:12px;${(() => {
            const s = character.status || '居家';
            const statusColors = { '居家': 'var(--green)', '生病': 'var(--red)', '出差': 'var(--blue)' };
            const bg = statusColors[s] || 'var(--bg-card-light)';
            return `background:${bg};color:#fff`;
          })()};min-height:44px;min-width:44px;display:inline-flex;align-items:center;justify-content:center">
          ${e(character.status || '居家')} ▾
        </span>
      </div>

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

      ${this.renderRecommendations(character)}
      ${this.renderAchievements()}

      <div style="text-align:center;margin-top:20px">
        <span style="font-size:12px;color:var(--text-dim);cursor:pointer" onclick="HomePage.logout()">退出登录</span>
      </div>
    `;
```

---

## 改动 7：行为提交后 toast 追加修炼状态

**文件** `public/js/pages/behavior.js` — `submit()` 方法

**定位** 第 587–592 行，`const result = await API.post(...)` 之后的 toast 部分。

**修改前**
```js
      const result = await API.post('/behavior', body);
      const item = result.item;
      const attrNameMap = {
        physique: '体魄', comprehension: '悟性', willpower: '心性', dexterity: '灵巧', perception: '神识',
      };
      App.toast(`获得 ${item.name}（${item.quality}）+${item.temp_value}临时${attrNameMap[item.attribute_type] || item.attribute_type}`, 'success');
```

**修改后**
```js
      const result = await API.post('/behavior', body);
      const item = result.item;
      const attrNameMap = {
        physique: '体魄', comprehension: '悟性', willpower: '心性', dexterity: '灵巧', perception: '神识',
      };
      // 修炼状态反馈
      const cv = result.cultivationStatus;
      let toastMsg = `获得 ${item.name}（${item.quality}）+${item.temp_value}临时${attrNameMap[item.attribute_type] || item.attribute_type}`;
      if (cv) {
        toastMsg += ` · ${cv.level}（${cv.activeDays}/7天）`;
      }
      App.toast(toastMsg, 'success');
```

---

## 改动 8：style.css

检查结论：修炼状态卡片全部使用内联样式，复用已有的 `.card` 基础样式。**无需新增 CSS。**

---

## 验收检查清单

### 环境状态

- [ ] 首页状态 badge 默认显示"居家"（而非"正常"）
- [ ] badge 颜色：居家=绿、生病=红、出差=蓝，文字白色
- [ ] 点击 badge 弹出状态选择弹窗，选项为：🏠居家 / 🤒生病 / ✈️出差（无"正常"和"休假"）
- [ ] 切换状态成功后，toast 显示"状态已切换为：居家/生病/出差"
- [ ] 切换状态后，再进入行为页，行为类别列表重新从后端加载（非缓存）
- [ ] 后端返回 `status` 为 `null` 或空时，badge 显示"居家"

### 修炼状态

- [ ] 首页加载后，修炼状态卡片出现在衰退预警和雷达图之间
- [ ] 卡片左边框颜色与修炼等级对应：精进=金、稳修=紫、懈怠=灰、停滞=红
- [ ] 精进等级前显示 🔥 图标
- [ ] 卡片显示"本周活跃 X/7 天 · Y 类"
- [ ] `dropBonus > 0` 时右侧显示"良品+XX%"（金色）
- [ ] `bufferAdjust < 0` 时右侧显示"缓冲-N天"（红色）
- [ ] `nextLevelHint` 非空时底部显示提示文案
- [ ] 后端未返回 `cultivationStatus` 时，卡片不渲染（无空白区域）
- [ ] 行为提交成功后，toast 末尾追加修炼状态信息（如"· 稳修（5/7天）"）
- [ ] 后端未返回 `cultivationStatus` 时，toast 仅显示原有道具信息

### 回归

- [ ] 境界卡片、晋级按钮功能正常
- [ ] 推荐卡片、成就卡片正常渲染
- [ ] 行为页上报流程不受影响（选类别→选行为→提交）
- [ ] 行为页快捷打卡、一键重复功能正常
- [ ] 行为页历史 tab、周报卡片正常
