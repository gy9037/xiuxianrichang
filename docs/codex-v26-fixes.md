# Codex 执行指令：V2.6 修复与增强

- **版本**：V2.6 修复与增强
- **来源**：用户反馈 + V2.5 遗留问题
- **改动数量**：6 个（FIX-1 ~ FIX-6）
- **执行方式**：按编号顺序逐个执行，每个改动标注了精确的文件路径、行号范围、改前/改后代码

---

## FIX-1：版本号显示

> 目标：在首页退出登录旁边显示版本号 v1.2.6，方便用户确认是否更新成功。

### FIX-1a：package.json 版本号

**文件**：`package.json`
**行号**：第 3 行

改前：
```json
  "version": "1.0.0",
```

改后：
```json
  "version": "1.2.6",
```

### FIX-1b：后端返回 appVersion

**文件**：`server/routes/character.js`
**行号**：第 1-7 行（文件顶部 require 区域）

改前：
```javascript
const express = require('express');
const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { checkPromotion, getTotalAttrs, getRealmByName } = require('../services/realm');
const { calculateDecay, getDecayStatus } = require('../services/decay');
const { getCultivationStatus } = require('../services/cultivation');
```

改后：
```javascript
const express = require('express');
const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { checkPromotion, getTotalAttrs, getRealmByName } = require('../services/realm');
const { calculateDecay, getDecayStatus } = require('../services/decay');
const { getCultivationStatus } = require('../services/cultivation');
const pkg = require('../../package.json');
```

**行号**：第 132-150 行（GET / 路由的 res.json 块）

改前：
```javascript
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
      status: userStatus,
    },
    tags,
    trend,
    promotion,
    decayStatus,
    cultivationStatus,
  });
```

改后：
```javascript
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
      status: userStatus,
    },
    tags,
    trend,
    promotion,
    decayStatus,
    cultivationStatus,
    appVersion: pkg.version,
  });
```

### FIX-1c：前端显示版本号

**文件**：`public/js/pages/home.js`
**行号**：第 601-603 行

改前：
```html
      <div style="text-align:center;margin-top:20px">
        <span style="font-size:12px;color:var(--text-dim);cursor:pointer" onclick="HomePage.logout()">退出登录</span>
      </div>
```

改后：
```html
      <div style="display:flex;justify-content:center;align-items:center;gap:16px;margin-top:20px">
        <span style="font-size:12px;color:var(--text-dim);cursor:pointer" onclick="HomePage.logout()">退出登录</span>
        <span style="font-size:10px;color:var(--text-dim)">${this.data?.appVersion ? 'v' + API.escapeHtml(this.data.appVersion) : ''}</span>
      </div>
```

> 说明：`this.data` 在 `load()` 第 45 行赋值为 `characterData`（即 GET /character 的返回值），所以 `this.data.appVersion` 可直接读取。

---

## FIX-2：趋势图柱状条爆框 + 数值位置调整

> 目标：数值从柱子下方移到柱子上方，解决爆框问题，同时优化整体布局让图表更舒适。

**文件**：`public/js/pages/home.js`，`renderTrend()` 方法（第 304-407 行）

### FIX-2a：图表容器高度

**行号**：第 361 行

改前：
```javascript
    const chartHeight = 120;
```

改后：
```javascript
    const chartHeight = 100;
```

### FIX-2b：每根柱子的结构

**行号**：第 381-390 行

改前：
```javascript
      return `
        <div style="display:flex;flex-direction:column;align-items:center;width:28px;cursor:pointer"
          onclick="HomePage.toggleTrendDetail('${e(d.day)}')">
          <div style="width:100%;height:${barHeight}px;display:flex;flex-direction:column-reverse${isToday ? ';box-shadow:0 0 6px rgba(139,92,246,0.4)' : ''}">
            ${blocks}
          </div>
          <div style="font-size:11px;color:${isToday ? 'var(--primary)' : 'var(--text-dim)'};margin-top:4px;font-weight:${isToday ? '700' : '400'}">${weekday}</div>
          <div style="font-size:10px;color:var(--text-dim)">${d.total > 0 ? d.total.toFixed(1) : ''}</div>
        </div>
      `;
```

改后：
```javascript
      return `
        <div style="display:flex;flex-direction:column;align-items:center;width:32px;cursor:pointer"
          onclick="HomePage.toggleTrendDetail('${e(d.day)}')">
          <div style="font-size:10px;color:var(--text-dim);height:16px;line-height:16px">${d.total > 0 ? d.total.toFixed(1) : ''}</div>
          <div style="width:100%;height:${barHeight}px;display:flex;flex-direction:column-reverse;margin-top:2px${isToday ? ';box-shadow:0 0 6px rgba(139,92,246,0.4)' : ''}">
            ${blocks}
          </div>
          <div style="font-size:11px;color:${isToday ? 'var(--primary)' : 'var(--text-dim)'};margin-top:4px;font-weight:${isToday ? '700' : '400'}">${weekday}</div>
        </div>
      `;
```

> 变化说明：
> - 数值标签移到柱体上方，固定高度 16px（即使无数值也占位，保持对齐）
> - 柱子宽度从 28px → 32px
> - 删除底部的数值 div

### FIX-2c：图表外层容器

**行号**：第 401 行

改前：
```html
        <div style="display:flex;align-items:flex-end;justify-content:center;gap:8px;height:${chartHeight}px;padding:8px 0">
```

改后：
```html
        <div style="display:flex;align-items:flex-end;justify-content:center;gap:6px;padding:8px 0">
```

> 变化说明：
> - 去掉固定 `height`，改为自适应
> - `gap` 从 8px → 6px（7 根柱子 × 32px + 6 × 6px = 260px，在内容区内放得下）

---

## FIX-3：修炼状态增加说明

> 目标：在修炼状态区域加一个"?"图标，点击弹出说明弹窗，解释四个等级的含义和效果。

**文件**：`public/js/pages/home.js`

### FIX-3a：修炼状态等级名称旁追加帮助图标

**行号**：第 534-536 行

改前：
```javascript
            <span style="font-size:15px;font-weight:700;color:${cvColor}">
              ${cultivationStatus.level === '精进' ? '🔥 ' : ''}${e(cultivationStatus.level)}
            </span>
```

改后：
```javascript
            <span style="font-size:15px;font-weight:700;color:${cvColor}">
              ${cultivationStatus.level === '精进' ? '🔥 ' : ''}${e(cultivationStatus.level)}
            </span>
            <span style="font-size:12px;color:var(--text-dim);cursor:pointer;margin-left:4px" onclick="event.stopPropagation();HomePage.showCultivationHelp()">?</span>
```

### FIX-3b：新增 showCultivationHelp 方法

**行号**：第 713 行（`logout()` 方法之前）

改前：
```javascript
  logout() {
```

改后：
```javascript
  showCultivationHelp() {
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:200;display:flex;align-items:center;justify-content:center;padding:16px';
    modal.onclick = function(event) { if (event.target === this) this.remove(); };
    modal.innerHTML = `
      <div style="background:var(--bg-card);border-radius:var(--radius);padding:20px;max-width:340px;width:100%;border:1px solid var(--border)">
        <div style="font-size:16px;font-weight:700;color:var(--text-bright);margin-bottom:12px">修炼状态说明</div>
        <div style="font-size:13px;color:var(--text);line-height:1.6">
          <p style="margin:0 0 8px">修炼状态根据你最近 7 天的活跃情况自动计算，影响道具掉率和属性衰退缓冲。</p>
          <div style="margin-bottom:6px"><span style="color:var(--gold);font-weight:600">🔥 精进</span>：活跃≥6天 + 覆盖≥3个类别。良品掉率+10%。</div>
          <div style="margin-bottom:6px"><span style="color:var(--primary);font-weight:600">稳修</span>：活跃≥4天。无额外加成，无惩罚。</div>
          <div style="margin-bottom:6px"><span style="color:var(--text-dim);font-weight:600">懈怠</span>：活跃≥1天。衰退缓冲-5天。</div>
          <div style="margin-bottom:6px"><span style="color:var(--red);font-weight:600">停滞</span>：0天活跃。衰退缓冲-10天。</div>
          <p style="margin:8px 0 0;color:var(--text-dim);font-size:12px">衰退缓冲：属性停止增长后，经过缓冲期才开始衰退。默认15天，非居家状态延长至30天。</p>
        </div>
        <button class="btn btn-secondary" style="margin-top:16px;width:100%" onclick="this.closest('div[style*=fixed]').remove()">知道了</button>
      </div>
    `;
    document.body.appendChild(modal);
  },

  logout() {
```

---

## FIX-4：iPhone 15 Plus 合成栏被底部导航遮挡

> 目标：合成栏的 bottom 值需要考虑 safe-area-inset-bottom。

**文件**：`public/css/style.css`

### FIX-4a：body padding-bottom

**行号**：第 28 行

改前：
```css
  padding-bottom: 70px;
```

改后：
```css
  padding-bottom: calc(70px + env(safe-area-inset-bottom));
```

### FIX-4b：.synth-summary bottom

**行号**：第 535 行

改前：
```css
  bottom: 70px;
```

改后：
```css
  bottom: calc(70px + env(safe-area-inset-bottom));
```

> 其余属性不变。

---

## FIX-5：早睡删除 + 早起时间校验

> 目标：从行为列表中删除"早睡"。"早起"在 5:30-8:30 之间提交时自动记录时间，其他时间提交需要用户提供起床时间。

### FIX-5a：删除早睡

**文件**：`server/data/behaviors.json`
**行号**：第 16-21 行

改前：
```json
    "生活习惯": {
      "attribute": "willpower",
      "居家": ["早起", "早睡", "冥想", "喝够水"],
      "生病": ["早起", "早睡", "冥想", "喝够水", "按时吃药"],
      "出差": ["早起", "早睡", "冥想", "喝够水"]
    },
```

改后：
```json
    "生活习惯": {
      "attribute": "willpower",
      "居家": ["早起", "冥想", "喝够水"],
      "生病": ["早起", "冥想", "喝够水", "按时吃药"],
      "出差": ["早起", "冥想", "喝够水"]
    },
```

### FIX-5b：前端 — 早起时间选择器

**文件**：`public/js/pages/behavior.js`
**行号**：第 322-346 行（`renderInlineInputForm()` 方法）

改前：
```javascript
  renderInlineInputForm() {
    const e = API.escapeHtml.bind(API);
    const isExercise = this.selectedCategory === '身体健康';
    return `
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)" id="input-form-card">
        <div style="font-size:14px;font-weight:600;margin-bottom:8px">${e(this.selectedBehavior)}</div>
        ${isExercise ? `
          <div class="form-group" style="margin-bottom:10px">
            <label>运动强度</label>
            <select id="behavior-intensity">
              <option value="低强度">低强度</option>
              <option value="热身">热身</option>
              <option value="高强度">高强度</option>
              <option value="拉伸">拉伸</option>
            </select>
          </div>
        ` : ''}
        <div class="form-group" style="margin-bottom:10px">
          <label>备注（可选）</label>
          <input type="text" id="behavior-desc" placeholder="例如：晚饭后散步30分钟">
        </div>
        <button class="btn btn-primary" id="submit-btn" onclick="BehaviorPage.submit()">提交</button>
      </div>
    `;
  },
```

改后：
```javascript
  renderInlineInputForm() {
    const e = API.escapeHtml.bind(API);
    const isExercise = this.selectedCategory === '身体健康';

    // 早起时间处理
    const isEarlyRise = this.selectedCategory === '生活习惯' && this.selectedBehavior === '早起';
    let earlyRiseHtml = '';
    if (isEarlyRise) {
      const now = new Date();
      const hour = now.getHours();
      const minute = now.getMinutes();
      const currentMinutes = hour * 60 + minute;
      const isInWindow = currentMinutes >= 330 && currentMinutes <= 510; // 5:30-8:30
      if (isInWindow) {
        const timeStr = `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
        earlyRiseHtml = `
          <div style="font-size:13px;color:var(--green);margin-bottom:8px">
            当前时间 ${timeStr}，在早起时间窗口内（5:30-8:30），将自动记录起床时间
          </div>
          <input type="hidden" id="wakeup-time" value="${timeStr}">
        `;
      } else {
        earlyRiseHtml = `
          <div style="margin-bottom:8px">
            <label style="font-size:13px;color:var(--text-dim);display:block;margin-bottom:4px">起床时间（不在 5:30-8:30 窗口内，请手动输入）</label>
            <input type="time" id="wakeup-time" value="" min="04:00" max="12:00"
              style="background:var(--bg-card-light);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:8px 12px;font-size:14px;width:100%">
          </div>
        `;
      }
    }

    return `
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)" id="input-form-card">
        <div style="font-size:14px;font-weight:600;margin-bottom:8px">${e(this.selectedBehavior)}</div>
        ${isExercise ? `
          <div class="form-group" style="margin-bottom:10px">
            <label>运动强度</label>
            <select id="behavior-intensity">
              <option value="低强度">低强度</option>
              <option value="热身">热身</option>
              <option value="高强度">高强度</option>
              <option value="拉伸">拉伸</option>
            </select>
          </div>
        ` : ''}
        ${earlyRiseHtml}
        <div class="form-group" style="margin-bottom:10px">
          <label>备注（可选）</label>
          <input type="text" id="behavior-desc" placeholder="例如：晚饭后散步30分钟">
        </div>
        <button class="btn btn-primary" id="submit-btn" onclick="BehaviorPage.submit()">提交</button>
      </div>
    `;
  },
```

### FIX-5c：前端 — 提交时附带起床时间

**文件**：`public/js/pages/behavior.js`
**行号**：第 576-586 行（`submit()` 方法中，构造 body 之后、`const result = await API.post(...)` 之前）

改前：
```javascript
      const body = {
        category: this.selectedCategory,
        sub_type: this.selectedBehavior,
        description: document.getElementById('behavior-desc')?.value || '',
      };

      if (this.selectedCategory === '身体健康') {
        body.intensity = document.getElementById('behavior-intensity')?.value || '低强度';
      }

      const result = await API.post('/behavior', body);
```

改后：
```javascript
      const body = {
        category: this.selectedCategory,
        sub_type: this.selectedBehavior,
        description: document.getElementById('behavior-desc')?.value || '',
      };

      if (this.selectedCategory === '身体健康') {
        body.intensity = document.getElementById('behavior-intensity')?.value || '低强度';
      }

      // 早起时间处理
      if (this.selectedCategory === '生活习惯' && this.selectedBehavior === '早起') {
        const wakeupTime = document.getElementById('wakeup-time')?.value;
        if (!wakeupTime) {
          App.toast('请输入起床时间', 'error');
          this.submitting = false;
          const resetBtn = document.getElementById('submit-btn');
          if (resetBtn) { resetBtn.disabled = false; resetBtn.textContent = '提交'; }
          return;
        }
        body.wakeup_time = wakeupTime;
        // 将起床时间写入 description
        body.description = `起床时间：${wakeupTime}${body.description ? '，' + body.description : ''}`;
      }

      const result = await API.post('/behavior', body);
```

### FIX-5d：后端 — 早起时间校验

**文件**：`server/routes/behavior.js`
**行号**：第 134-136 行（POST / 路由中，`behaviorExists` 校验之后、`getCultivationStatus` 之前）

改前：
```javascript
  if (!behaviorExists(mergedData, category, sub_type)) {
    return res.status(400).json({ error: '无效的行为类型' });
  }

  const cultivation = getCultivationStatus(req.user.id);
```

改后：
```javascript
  if (!behaviorExists(mergedData, category, sub_type)) {
    return res.status(400).json({ error: '无效的行为类型' });
  }

  // 早起时间校验
  if (category === '生活习惯' && sub_type === '早起') {
    const wakeupTime = req.body.wakeup_time;
    if (wakeupTime) {
      const [h, m] = wakeupTime.split(':').map(Number);
      const totalMin = h * 60 + m;
      if (isNaN(totalMin) || totalMin < 270 || totalMin > 720) { // 4:30-12:00 宽松范围
        return res.status(400).json({ error: '起床时间不合理，请输入 4:30-12:00 之间的时间' });
      }
    }
    // 如果在 5:30-8:30 窗口内提交但没传 wakeup_time，也允许（前端自动记录）
  }

  const cultivation = getCultivationStatus(req.user.id);
```

---

## FIX-6：推荐合成不准确（临时修复）

> 目标：推荐合成前检查用户是否有任意属性的道具临时值累计 ≥ 10。不够则不推荐合成，改为推荐继续上报行为。

### FIX-6a：home.js load() 增加背包数据加载

**文件**：`public/js/pages/home.js`
**行号**：第 39-47 行

改前：
```javascript
      const [characterData, achievementsData] = await Promise.all([
        API.get('/character'),
        API.get('/character/achievements').catch(() => []), // V2-F10 - 成就接口失败时不阻塞首页
      ]);
      this.trendDetailDate = null;
      this.trendDetailData = null;
      this.data = characterData;
      this.cultivationStatus = characterData.cultivationStatus || null;
      this.achievements = Array.isArray(achievementsData) ? achievementsData : [];
```

改后：
```javascript
      const [characterData, achievementsData, itemsData] = await Promise.all([
        API.get('/character'),
        API.get('/character/achievements').catch(() => []), // V2-F10 - 成就接口失败时不阻塞首页
        API.get('/items').catch(() => ({ items: [], grouped: {} })),
      ]);
      this.trendDetailDate = null;
      this.trendDetailData = null;
      this.data = characterData;
      this.cultivationStatus = characterData.cultivationStatus || null;
      this.achievements = Array.isArray(achievementsData) ? achievementsData : [];
      this.itemsGrouped = itemsData.grouped || {};
```

### FIX-6b：home.js getRecommendations() 修改合成推荐条件

**文件**：`public/js/pages/home.js`
**行号**：第 79-86 行

改前：
```javascript
    const allZero = attrs.every(a => Number(character[a] || 0) === 0);
    if (allZero) {
      // 最近 7 天有行为但属性仍为 0：更可能是还没合成，优先推荐去背包
      const hasRecentBehavior = trend && trend.days && Object.values(trend.byAttribute || {}).some(
        byAttr => byAttr.counts && byAttr.counts.some(c => c > 0)
      );
      if (hasRecentBehavior) return 'suggest_synthesize';
      return null;
    }
```

改后：
```javascript
    const allZero = attrs.every(a => Number(character[a] || 0) === 0);
    if (allZero) {
      // 最近 7 天有行为但属性仍为 0：更可能是还没合成，优先推荐去背包
      const hasRecentBehavior = trend && trend.days && Object.values(trend.byAttribute || {}).some(
        byAttr => byAttr.counts && byAttr.counts.some(c => c > 0)
      );
      if (hasRecentBehavior) {
        // 检查是否有任意属性的道具临时值累计 >= 10（合成门槛）
        const grouped = HomePage.itemsGrouped || {};
        const canSynthesize = Object.values(grouped).some(g => g.totalTempValue >= 10);
        if (canSynthesize) return 'suggest_synthesize';
        // 有道具但不够合成，推荐继续上报
        return 'suggest_more_behaviors';
      }
      return null;
    }
```

### FIX-6c：home.js renderRecommendations() 增加新分支

**文件**：`public/js/pages/home.js`
**行号**：第 130-142 行（`suggest_synthesize` 分支之后）

改前：
```javascript
    if (recs === 'suggest_synthesize') {
      return `
        <div class="card recommend-card" onclick="App.navigate('inventory')">
          <div class="card-title">✨ 今日推荐</div>
          <div class="recommend-item">
            <div>
              <span class="recommend-text">你已经获得了道具，去背包合成提升属性吧</span>
              <button class="btn btn-small btn-primary" style="margin-top:8px">去合成 →</button>
            </div>
          </div>
        </div>
      `;
    }
```

改后：
```javascript
    if (recs === 'suggest_synthesize') {
      return `
        <div class="card recommend-card" onclick="App.navigate('inventory')">
          <div class="card-title">✨ 今日推荐</div>
          <div class="recommend-item">
            <div>
              <span class="recommend-text">你已经获得了道具，去背包合成提升属性吧</span>
              <button class="btn btn-small btn-primary" style="margin-top:8px">去合成 →</button>
            </div>
          </div>
        </div>
      `;
    }

    if (recs === 'suggest_more_behaviors') {
      return `
        <div class="card recommend-card" onclick="App.navigate('behavior')">
          <div class="card-title">✨ 今日推荐</div>
          <div class="recommend-item">
            <div>
              <span class="recommend-text">道具还不够合成（需要同属性累计10点），继续上报行为积攒道具吧</span>
              <button class="btn btn-small btn-primary" style="margin-top:8px">去上报 →</button>
            </div>
          </div>
        </div>
      `;
    }
```

---

## FIX-7：许愿 BOSS 评分滑块展示不更新

> 目标：修复创建愿望时，难度评分滑块拖动后数字不变化的 BUG。
> 根因：内联 `oninput` 中使用了可选链 `?.`，在部分移动端浏览器的内联事件上下文中静默失败。

### FIX-7a：删除内联 oninput，改用 JS 绑定

**文件**：`public/js/pages/wish.js`
**行号**：第 316-317 行

改前：
```html
<input type="range" id="wish-difficulty" min="1" max="10" value="3"
  oninput="document.getElementById('diff-display')?.textContent=this.value"
  style="width:100%;accent-color:var(--primary)">
```

改后：
```html
<input type="range" id="wish-difficulty" min="1" max="10" value="3"
  style="width:100%;accent-color:var(--primary)">
```

### FIX-7b：在 renderCreate 末尾追加 JS 事件绑定

**文件**：`public/js/pages/wish.js`
**行号**：第 345-346 行之间（`innerHTML` 赋值结束后，`// V2.5 V25-063` 注释之前）

追加代码：
```javascript
// FIX-7 - 难度滑块展示修复
const diffInput = document.getElementById('wish-difficulty');
if (diffInput) diffInput.oninput = function () {
  const display = document.getElementById('diff-display');
  if (display) display.textContent = this.value;
};
```

---

## 改动文件清单

| 文件 | 改动点 |
|------|--------|
| `package.json` | FIX-1a |
| `server/routes/character.js` | FIX-1b |
| `public/js/pages/home.js` | FIX-1c, FIX-2a/2b/2c, FIX-3a/3b, FIX-6a/6b/6c |
| `public/css/style.css` | FIX-4a/4b |
| `server/data/behaviors.json` | FIX-5a |
| `public/js/pages/behavior.js` | FIX-5b/5c |
| `server/routes/behavior.js` | FIX-5d |
| `public/js/pages/wish.js` | FIX-7a/7b |
