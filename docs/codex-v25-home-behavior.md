# Codex 任务指令：V2.5 首页 + 行为页交互体验优化

> 溯源：V2.5 策划案 iteration-v2.5.md
> 条目范围：首页 V25-001~004, 030~037, 077~080 + 补充改动 2 条；行为页 V25-006~010, 038~047, 081~083
> 所有新增/修改代码行尾注释 `// V25-xxx`

## 涉及文件

| 文件 | 改动类型 |
|------|----------|
| `public/js/pages/home.js` | P0/P1/P2 交互优化 |
| `public/js/pages/behavior.js` | P0/P1/P2 交互优化 |
| `public/css/style.css` | 骨架屏 + 滚动遮罩样式追加 |

## ⚠️ 合并注意事项

- V25-006/039/041 影响 behavior.js renderInputForm() 的同一个提交按钮，需一次性合并应用（加 id + min-height + sticky wrapper）
- V25-005 已移出 V2.5，不在本指令范围
- V25-029 已随 codex-v2-f06-fix.md 解决
- 历史 tab 月历→周报改造，待周报策划完成后单独出指令

---

# 第一部分：首页改动（home.js）

## P0 条目

# Codex 执行指令：首页 P0 改动

目标文件：`public/js/pages/home.js`
附加文件：`public/css/style.css`（仅骨架屏样式）

---

## 1. V25-001：首页加载期间无 loading 状态

### 改动文件：`public/js/pages/home.js`

#### 1a. 替换 `async load()` 方法

**旧代码：**
```js
  async load() {
    try {
      const [characterData, achievementsData] = await Promise.all([
        API.get('/character'),
        API.get('/character/achievements').catch(() => []), // V2-F10 - 成就接口失败时不阻塞首页
      ]);
      this.data = characterData;
      this.achievements = Array.isArray(achievementsData) ? achievementsData : [];
      this.toastNewAchievements(this.achievements); // V2-F10 - 首次解锁提示
      this.render();
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },
```

**新代码：**
```js
  async load() { // V25-001
    const container = document.getElementById('page-home'); // V25-001
    if (container) { // V25-001
      container.innerHTML = `
        <div class="skeleton-home"> <!-- V25-001 -->
          <div class="skeleton-line skeleton-line--header"></div>
          <div class="skeleton-card">
            <div class="skeleton-line skeleton-line--short"></div>
            <div class="skeleton-line skeleton-line--long"></div>
          </div>
          <div class="skeleton-card">
            <div class="skeleton-line skeleton-line--short"></div>
            <div class="skeleton-circle"></div>
            <div class="skeleton-line skeleton-line--long"></div>
          </div>
        </div>
      `; // V25-001
    } // V25-001
    try {
      const [characterData, achievementsData] = await Promise.all([
        API.get('/character'),
        API.get('/character/achievements').catch(() => []), // V2-F10
      ]);
      this.data = characterData;
      this.achievements = Array.isArray(achievementsData) ? achievementsData : [];
      this.toastNewAchievements(this.achievements); // V2-F10
      this.render();
    } catch (e) {
      App.toast(e.message, 'error');
      if (container) container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-dim)">加载失败，请下拉刷新</div>'; // V25-001
    }
  },
```

### 改动文件：`public/css/style.css`

#### 1b. 在文件末尾追加骨架屏样式

```css
/* === V25-001 骨架屏 === */
.skeleton-home {
  padding: 16px;
}
.skeleton-card {
  background: var(--bg-card);
  border-radius: var(--radius);
  padding: 16px;
  margin-bottom: 12px;
}
.skeleton-line {
  height: 14px;
  border-radius: 7px;
  background: linear-gradient(90deg, var(--bg-card-light) 25%, var(--border) 50%, var(--bg-card-light) 75%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.4s ease-in-out infinite;
  margin-bottom: 10px;
}
.skeleton-line--header {
  width: 40%;
  height: 20px;
  border-radius: 10px;
  margin-bottom: 16px;
}
.skeleton-line--short {
  width: 50%;
}
.skeleton-line--long {
  width: 90%;
}
.skeleton-circle {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  margin: 12px auto;
  background: linear-gradient(90deg, var(--bg-card-light) 25%, var(--border) 50%, var(--bg-card-light) 75%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.4s ease-in-out infinite;
}
@keyframes skeleton-shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
/* === /V25-001 === */
```

---

## 2. V25-002：晋级按钮无反馈且可重复点击

### 改动文件：`public/js/pages/home.js`

#### 2a. 替换 `async promote()` 方法

**旧代码：**
```js
  async promote() {
    try {
      const result = await API.post('/character/promote');
      App.toast(result.message, 'success');
      this.load();
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },
```

**新代码：**
```js
  async promote() { // V25-002
    const btn = document.querySelector('.realm-badge-action.promotable'); // V25-002
    if (!btn || btn.disabled) return; // V25-002 - 防重复点击
    const originalText = btn.textContent; // V25-002
    btn.disabled = true; // V25-002
    btn.textContent = '晋级中…'; // V25-002
    btn.classList.add('btn-loading'); // V25-002
    try {
      const result = await API.post('/character/promote');
      App.toast(result.message, 'success');
      this.load();
    } catch (e) {
      App.toast(e.message, 'error');
      btn.disabled = false; // V25-002
      btn.textContent = originalText; // V25-002
      btn.classList.remove('btn-loading'); // V25-002
    }
  },
```

---

## 3. V25-003：状态设置弹窗提交时无 loading，存在竞态

### 改动文件：`public/js/pages/home.js`

#### 3a. 替换 `async setStatus(status)` 方法

**旧代码：**
```js
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

**新代码：**
```js
  // V2-F04 FB-03 - 提交状态切换
  async setStatus(status) { // V25-003
    const modal = document.getElementById('status-picker-modal'); // V25-003
    if (!modal) return; // V25-003
    // V25-003 - 禁用所有选项，防止竞态
    const options = modal.querySelectorAll('[onclick^="HomePage.setStatus"]'); // V25-003
    options.forEach(el => { // V25-003
      el.style.pointerEvents = 'none'; // V25-003
      el.style.opacity = '0.5'; // V25-003
    }); // V25-003
    // V25-003 - 显示加载指示器
    const cancelBtn = modal.querySelector('.btn-secondary'); // V25-003
    if (cancelBtn) { // V25-003
      cancelBtn.disabled = true; // V25-003
      cancelBtn.textContent = '提交中…'; // V25-003
    } // V25-003
    try {
      await API.post('/character/status', { status });
      modal.remove(); // V25-003
      App.toast(`状态已切换为：${status}`, 'success');
      this.load();
    } catch (e) {
      App.toast(e.message, 'error');
      // V25-003 - 失败时恢复可点击
      options.forEach(el => { // V25-003
        el.style.pointerEvents = ''; // V25-003
        el.style.opacity = ''; // V25-003
      }); // V25-003
      if (cancelBtn) { // V25-003
        cancelBtn.disabled = false; // V25-003
        cancelBtn.textContent = '取消'; // V25-003
      } // V25-003
    }
  },
```

---

## 4. V25-004：状态 badge 触控目标过小

### 改动文件：`public/js/pages/home.js`

#### 4a. 在 `render()` 方法中替换状态 badge 的 inline style

**旧代码：**
```js
        <span class="status-badge status-${e(character.status || '正常')}"
          onclick="HomePage.showStatusPicker()"
          style="cursor:pointer;font-size:12px;padding:4px 10px;border-radius:12px;background:var(--bg-card-light)">
          ${e(character.status || '正常')} ▾
        </span>
```

**新代码：**
```js
        <span class="status-badge status-${e(character.status || '正常')}"
          onclick="HomePage.showStatusPicker()"
          style="cursor:pointer;font-size:12px;padding:4px 10px;border-radius:12px;background:var(--bg-card-light);min-height:44px;min-width:44px;display:inline-flex;align-items:center;justify-content:center">
          ${e(character.status || '正常')} ▾
        </span>
```
> 行尾注释不加在 HTML 模板字符串内，此改动通过 inline style 扩展触控区域。 <!-- V25-004 -->

---

## 5. 补充改动 1：雷达图标签旁显示数值 + 删除属性进度条

### 改动文件：`public/js/pages/home.js`

#### 5a. 在 `renderRadar(character)` 中替换标签渲染部分

**旧代码：**
```js
    // V2-F08 FB-08 - 顶点标签
    const labels = DIMS.map((d, i) => {
      const lp = pt(LABEL_R, i); // V2-F08 FB-08
      const cos = Math.cos(angle(i));
      const anchor = cos < -0.1 ? 'end' : cos > 0.1 ? 'start' : 'middle'; // V2-F08 FB-08
      return `<text x="${lp.x.toFixed(2)}" y="${lp.y.toFixed(2)}" text-anchor="${anchor}" dominant-baseline="middle" font-size="11" fill="var(--text-dim)">${d.label}</text>`; // V2-F08 FB-08
    }).join('\n      '); // V2-F08 FB-08
```

**新代码：**
```js
    // V2-F08 FB-08 - 顶点标签（含数值）
    const labels = DIMS.map((d, i) => { // V25-补1
      const lp = pt(LABEL_R, i); // V2-F08 FB-08
      const cos = Math.cos(angle(i));
      const anchor = cos < -0.1 ? 'end' : cos > 0.1 ? 'start' : 'middle'; // V2-F08 FB-08
      const val = Number(character[d.key] || 0).toFixed(1); // V25-补1 - 当前数值
      return `<text x="${lp.x.toFixed(2)}" y="${lp.y.toFixed(2)}" text-anchor="${anchor}" dominant-baseline="middle" font-size="11" fill="var(--text-dim)">${d.label} ${val}</text>`; // V25-补1
    }).join('\n      '); // V2-F08 FB-08
```

#### 5b. 在 `render()` 中删除 attr-list 区域

**旧代码：**
```js
      <div class="card">
        <div class="card-title">属性总览</div>
        ${this.renderRadar(character)} <!-- V2-F08 FB-08 -->
        <div class="attr-list">
          ${attrs.map(a => {
            const val = character[a];
            const pct = character.attr_cap > 0 ? Math.min(100, (val / character.attr_cap) * 100) : 0;
            return `
              <div class="attr-line">
                <div class="attr-line-head">
                  <span class="attr-line-name">${ATTR_ICONS[a]} ${ATTR_NAMES[a]}</span>
                  <span class="attr-line-value">${val.toFixed(1)} / ${character.attr_cap}</span>
                </div>
                <div class="attr-bar"><div class="attr-bar-fill" style="width:${pct}%"></div></div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
```

**新代码：**
```js
      <div class="card"> <!-- V25-补1 -->
        <div class="card-title">属性总览</div>
        ${this.renderRadar(character)} <!-- V2-F08 FB-08 -->
      </div>
```

> 属性进度条已删除，数值信息已合并到雷达图标签中。 <!-- V25-补1 -->

---

## 6. V25-037（补充改动 2）：推荐卡片类别名统一

### 改动文件：`public/js/pages/home.js`

#### 6a. 替换 `ATTR_CATEGORY_MAP`

**旧代码：**
```js
    const ATTR_CATEGORY_MAP = {
      physique: { label: '体魄', category: '运动健身' }, // V2-F03 FB-01
      comprehension: { label: '悟性', category: '学习成长' }, // V2-F03 FB-01
      willpower: { label: '心性', category: '冥想休息' }, // V2-F03 FB-01
      dexterity: { label: '灵巧', category: '生活技能' }, // V2-F03 FB-01
      perception: { label: '神识', category: '感知记录' }, // V2-F03 FB-01
    };
```

**新代码：**
```js
    const ATTR_CATEGORY_MAP = { // V25-037
      physique: { label: '体魄', category: '身体健康' }, // V25-037
      comprehension: { label: '悟性', category: '学习' }, // V25-037
      willpower: { label: '心性', category: '生活习惯' }, // V25-037
      dexterity: { label: '灵巧', category: '家务' }, // V25-037
      perception: { label: '神识', category: '社交互助' }, // V25-037
    }; // V25-037
```

#### 6b. 替换 `goToBehavior(category)` 方法，删除二次映射

**旧代码：**
```js
  // V2-F03 FB-01
  goToBehavior(category) {
    App.navigate('behavior'); // V2-F03 FB-01
    if (category) {
      // V2-F03 FB-01 - 推荐类别映射到实际行为分类
      const categoryMap = {
        运动健身: '身体健康', // V2-F03 FB-01
        学习成长: '学习', // V2-F03 FB-01
        冥想休息: '生活习惯', // V2-F03 FB-01
        生活技能: '家务', // V2-F03 FB-01
        感知记录: '社交互助', // V2-F03 FB-01
      };
      // V2-F03 FB-01
      const targetCategory = categoryMap[category] || category;
      // V2-F03 FB-01 - 等 BehaviorPage 渲染完成后预选类别
      setTimeout(() => {
        if (typeof BehaviorPage !== 'undefined' && BehaviorPage.selectCategory) BehaviorPage.selectCategory(targetCategory); // V2-F03 FB-01
      }, 50);
    }
  },
```

**新代码：**
```js
  // V2-F03 FB-01
  goToBehavior(category) { // V25-037
    App.navigate('behavior'); // V2-F03 FB-01
    if (category) { // V25-037
      // V25-037 - category 已与行为页分类名一致，无需二次映射
      setTimeout(() => { // V2-F03 FB-01
        if (typeof BehaviorPage !== 'undefined' && BehaviorPage.selectCategory) BehaviorPage.selectCategory(category); // V25-037
      }, 50);
    }
  },
```

---

## 验收标准

| 条目 | 验收方式 |
|------|----------|
| V25-001 | 打开首页，在 DevTools Network 中设置 Slow 3G，刷新页面 → 应立即看到骨架屏动画，数据返回后骨架屏被替换为正常内容。断网时应显示"加载失败"提示。 |
| V25-002 | 点击晋级按钮 → 按钮立即变为"晋级中…"且不可再次点击。成功后页面刷新。失败时按钮恢复原文字和可点击状态。 |
| V25-003 | 打开状态弹窗，点击任一选项 → 所有选项立即变灰不可点击，取消按钮显示"提交中…"。成功后弹窗关闭。失败时选项恢复可点击。 |
| V25-004 | 移动端点击状态 badge → 触控区域不小于 44×44px（Chrome DevTools 检查元素尺寸确认）。 |
| 补充改动 1 | 首页雷达图每个顶点标签显示「属性名 数值」（如「体魄 12.5」）。下方不再有 5 条属性进度条。 |
| V25-037 | 首页推荐卡片显示的类别名与行为页实际分类一致（身体健康/学习/生活习惯/家务/社交互助）。点击推荐卡片跳转行为页后自动选中对应分类。 |

---

## P1 + P2 条目

# Codex 执行指令：首页 P1 + P2 改动

目标文件：`public/js/pages/home.js`

---

## V25-030：推荐卡片无点击反馈

**文件**：`public/js/pages/home.js` — `renderRecommendations()`

**旧代码**（推荐卡片 recommend-item div，两处）：

```js
      <div class="recommend-item" onclick="HomePage.goToBehavior('${e(r.category)}')"> <!-- V2-F03 FB-01 -->
```

```js
          <div class="recommend-item">
```

**新代码**：

```js
      <div class="recommend-item" onclick="HomePage.goToBehavior('${e(r.category)}')" style="cursor:pointer;transition:opacity .1s;-webkit-tap-highlight-color:transparent" onpointerdown="this.style.opacity='0.6'" onpointerup="this.style.opacity='1'" onpointerleave="this.style.opacity='1'"> <!-- V2-F03 FB-01 V25-030 -->
```

```js
          <div class="recommend-item" style="cursor:pointer;transition:opacity .1s;-webkit-tap-highlight-color:transparent" onpointerdown="this.style.opacity='0.6'" onpointerup="this.style.opacity='1'" onpointerleave="this.style.opacity='1'"> <!-- V25-030 -->
```

---

## V25-031：衰退预警无严重程度区分

**文件**：`public/js/pages/home.js` — `render()` 中 `decayHtml` 构建部分

**旧代码**：

```js
      decayHtml = warnings.map(d => `
        <div class="decay-warning">
          ${e(d.name)}：${e(d.status)}${d.dailyDecay > 0 ? `（每日-${d.dailyDecay}）` : '（即将衰退）'}
          ${d.inactiveDays ? `，已${d.inactiveDays}天未活跃` : ''}
        </div>
      `).join('');
```

**新代码**：

```js
      decayHtml = warnings.map(d => { // V25-031
        const borderColor = d.dailyDecay > 0 ? 'var(--red)' : 'var(--gold)'; // V25-031
        return `
          <div class="decay-warning" style="border-left:4px solid ${borderColor};padding-left:8px;margin-bottom:8px"> <!-- V25-031 -->
            ${e(d.name)}：${e(d.status)}${d.dailyDecay > 0 ? `（每日-${d.dailyDecay}）` : '（即将衰退）'}
            ${d.inactiveDays ? `，已${d.inactiveDays}天未活跃` : ''}
          </div>
        `;
      }).join(''); // V25-031
```

---

## V25-032：雷达图 SVG 不自适应

**文件**：`public/js/pages/home.js` — `renderRadar()` 末尾 SVG 拼装

**旧代码**：

```js
    return `
      <svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"
        style="display:block;margin:0 auto 12px;overflow:visible">
```

**新代码**：

```js
    return `
      <svg viewBox="0 0 ${SIZE} ${SIZE}" width="100%" height="auto"
        style="display:block;margin:0 auto 12px;overflow:visible"> <!-- V25-032 -->
```

---

## V25-033：成就 toast 批量堆叠遮挡

**文件**：`public/js/pages/home.js` — `toastNewAchievements()`

**旧代码**：

```js
    const newlyUnlocked = achievements.filter(a => a.unlocked && !toasted.includes(a.id));
    newlyUnlocked.forEach((a) => {
      App.toast(`成就解锁：${a.icon} ${a.name}`, 'success');
      toasted.push(a.id);
    });
    sessionStorage.setItem(toastedKey, JSON.stringify(toasted));
```

**新代码**：

```js
    const newlyUnlocked = achievements.filter(a => a.unlocked && !toasted.includes(a.id)); // V25-033
    if (newlyUnlocked.length > 2) { // V25-033
      App.toast(`🎉 解锁了 ${newlyUnlocked.length} 个成就`, 'success'); // V25-033
      newlyUnlocked.forEach(a => toasted.push(a.id)); // V25-033
    } else { // V25-033
      newlyUnlocked.forEach((a, i) => { // V25-033
        setTimeout(() => App.toast(`成就解锁：${a.icon} ${a.name}`, 'success'), i * 800); // V25-033
        toasted.push(a.id); // V25-033
      }); // V25-033
    } // V25-033
    sessionStorage.setItem(toastedKey, JSON.stringify(toasted)); // V25-033
```

---

## V25-034：新用户引导卡缺乏 CTA 按钮

**文件**：`public/js/pages/home.js` — `renderRecommendations()` 中 `recs === null` 分支

**旧代码**：

```js
    if (recs === null) {
      return `
        <div class="card recommend-card" onclick="HomePage.goToBehavior(null)"> <!-- V2-F03 FB-01 -->
          <div class="card-title">✨ 今日推荐</div>
          <div class="recommend-item">
            <span class="recommend-text">先去上报一次行为，获得你的第一个道具</span>
            <span class="recommend-arrow">›</span>
          </div>
        </div>
      `;
    }
```

**新代码**：

```js
    if (recs === null) { // V25-034
      return `
        <div class="card recommend-card"> <!-- V25-034 -->
          <div class="card-title">✨ 今日推荐</div>
          <div class="recommend-item">
            <span class="recommend-text">先去上报一次行为，获得你的第一个道具</span>
          </div>
          <button class="btn btn-primary" style="width:100%;margin-top:12px" onclick="HomePage.goToBehavior(null)">去上报 →</button> <!-- V25-034 -->
        </div>
      `;
    }
```

---

## V25-035：goToBehavior 时序脆弱

**文件**：`public/js/pages/home.js` — `goToBehavior()`

**旧代码**：

```js
      // V2-F03 FB-01 - 等 BehaviorPage 渲染完成后预选类别
      setTimeout(() => {
        if (typeof BehaviorPage !== 'undefined' && BehaviorPage.selectCategory) BehaviorPage.selectCategory(targetCategory); // V2-F03 FB-01
      }, 50);
```

**新代码**：

```js
      // V25-035 - 等 BehaviorPage 渲染完成后预选类别
      requestAnimationFrame(() => { // V25-035
        requestAnimationFrame(() => { // V25-035 - 双 rAF 确保 DOM 已渲染
          if (typeof BehaviorPage !== 'undefined' && BehaviorPage.selectCategory) BehaviorPage.selectCategory(targetCategory); // V25-035
        }); // V25-035
      }); // V25-035
```

---

## V25-036：退出登录无确认步骤

**文件**：`public/js/pages/home.js` — `logout()`

**旧代码**：

```js
  logout() {
    API.clearAuth();
    App.showLogin();
  },
```

**新代码**：

```js
  logout() { // V25-036
    if (!confirm('确认退出登录？')) return; // V25-036
    API.clearAuth(); // V25-036
    App.showLogin(); // V25-036
  },
```

---

## V25-037：已在 P0 draft 中处理，跳过

---

## V25-077：属性进度条无过渡动画

**状态**：随补充改动 1 一并解决（进度条已删除，此条自动关闭）。

---

## V25-078：境界 badge 无障碍语义缺失

**文件**：`public/js/pages/home.js` — `render()` 中 realm-badge 元素

**旧代码**（不可突破时）：

```js
            <span class="realm-badge">${realmStageText}</span>
```

**新代码**：

```js
            <span class="realm-badge" role="status" aria-label="当前境界：${e(character.realm_stage)}">${realmStageText}</span> <!-- V25-078 -->
```

**旧代码**（可突破时）：

```js
            <button class="realm-badge realm-badge-action promotable" onclick="HomePage.promote()">
              ${realmStageText}
            </button>
```

**新代码**：

```js
            <button class="realm-badge realm-badge-action promotable" role="status" aria-label="当前境界：${e(character.realm_stage)}" onclick="HomePage.promote()"> <!-- V25-078 -->
              ${realmStageText}
            </button>
```

---

## V25-079：成就列表无空状态提示

**文件**：`public/js/pages/home.js` — `renderAchievements()`

**旧代码**：

```js
    if (!Array.isArray(this.achievements) || this.achievements.length === 0) {
      return '';
    }
```

**新代码**：

```js
    if (!Array.isArray(this.achievements) || this.achievements.length === 0) { // V25-079
      return `
        <div class="card"> <!-- V25-079 -->
          <div class="card-title">成就</div>
          <div style="text-align:center;padding:24px 0;color:var(--text-dim);font-size:14px">继续修炼，解锁你的第一个成就</div> <!-- V25-079 -->
        </div>
      `; // V25-079
    }
```

---

## V25-080：状态弹窗遮罩层无法点击关闭

**文件**：`public/js/pages/home.js` — `showStatusPicker()`

**旧代码**：

```js
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:200;display:flex;align-items:center;justify-content:center;padding:24px';
    modal.innerHTML = `
      <div style="background:var(--bg-card);border-radius:var(--radius);padding:24px;max-width:320px;width:100%">
```

**新代码**：

```js
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:200;display:flex;align-items:center;justify-content:center;padding:24px'; // V25-080
    modal.onclick = () => modal.remove(); // V25-080 - 点击遮罩关闭
    modal.innerHTML = `
      <div style="background:var(--bg-card);border-radius:var(--radius);padding:24px;max-width:320px;width:100%" onclick="event.stopPropagation()"> <!-- V25-080 -->
```

---

## 验收标准

| 条目 | 验收方式 |
|------|----------|
| V25-030 | 手指按住推荐卡片时可见压暗效果（opacity 降低），松开恢复 |
| V25-031 | 衰退预警区域：「衰退中」条目左侧红色色条，「即将衰退」条目左侧金色色条 |
| V25-032 | 缩放浏览器窗口或在不同屏幕宽度下，雷达图 SVG 自适应容器宽度，不溢出 |
| V25-033 | 同时解锁 3+ 成就时只弹一条合并 toast；解锁 1-2 条时依次间隔 800ms 弹出 |
| V25-034 | 新用户首页引导区域显示明确的「去上报 →」按钮，点击跳转行为页 |
| V25-035 | 点击推荐卡片跳转行为页后，类别能被正确预选（无时序竞态） |
| V25-036 | 点击「退出登录」弹出浏览器 confirm 对话框，取消则不退出 |
| V25-077 | 随补充改动 1 一并解决，无需额外验证 |
| V25-078 | 使用屏幕阅读器或检查 DOM，realm-badge 具有 `role="status"` 和正确的 `aria-label` |
| V25-079 | 无成就时显示占位卡片「继续修炼，解锁你的第一个成就」 |
| V25-080 | 点击状态弹窗遮罩（黑色半透明区域）可关闭弹窗；点击弹窗内容区域不会误关 |

---

# 第二部分：行为页改动（behavior.js）

## P0 条目（第一批：V25-006/007/008）

# Codex 指令：behavior.js P0 修复（V25-006 / V25-007 / V25-008）

目标文件：`public/js/pages/behavior.js`

---

## 条目 1：V25-006 submit() 防重复点击

### 1a. renderInputForm() — 按钮加 id

**旧代码：**
```js
<button class="btn btn-primary" onclick="BehaviorPage.submit()">
  ${b.template === 'checkin' ? '打卡' : '提交'}
</button>
```

**新代码：**
```js
<button id="behavior-submit-btn" class="btn btn-primary" onclick="BehaviorPage.submit()">
  ${b.template === 'checkin' ? '打卡' : '提交'}
</button>
```

### 1b. submit() — 开头禁用按钮 + finally 恢复

**旧代码：**
```js
  async submit() {
    const b = this.selectedBehavior;
    if (!b || !this.selectedCategory) return;
```

**新代码：**
```js
  async submit() {
    const b = this.selectedBehavior;
    if (!b || !this.selectedCategory) return;
    const submitBtn = document.getElementById('behavior-submit-btn'); // V25-006
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '提交中…'; } // V25-006
```

**旧代码：**
```js
    } catch (e) {
      App.toast(e.message, 'error');
    }
```

**新代码：**
```js
    } catch (e) {
      App.toast(e.message, 'error');
    } finally { // V25-006
      const btn = document.getElementById('behavior-submit-btn'); // V25-006
      if (btn) { btn.disabled = false; btn.textContent = b && b.template === 'checkin' ? '打卡' : '提交'; } // V25-006
    } // V25-006
```

---

## 条目 2：V25-007 submit() 双 render 闪烁

在 try 块内，删掉 Promise.all 之后、catch 之前的那行 `this.render();`。

**旧代码：**
```js
      this.selectedBehavior = null;
      Promise.all([...]).then(([shortcuts, lastBehavior]) => {
        this.shortcuts = shortcuts;
        this.lastBehavior = lastBehavior;
        this.render();
      }).catch(() => {});
      this.render();
    } catch (e) {
```

**新代码：**
```js
      this.selectedBehavior = null;
      Promise.all([...]).then(([shortcuts, lastBehavior]) => {
        this.shortcuts = shortcuts;
        this.lastBehavior = lastBehavior;
        this.render();
      }).catch(() => {}); // V25-007: 移除此处多余 this.render()，仅保留 Promise.all 回调内的
    } catch (e) {
```

> 注意：`this.selectedBehavior = null;` 保持在 Promise.all 之前，位置不变。

---

## 条目 3：V25-008 repeatLast() DOM 时序

将 `this.render()` 之后的 DOM 赋值操作用 `requestAnimationFrame` 包裹，确保 render 产生的 DOM 已挂载。

**旧代码：**
```js
    if (last.duration) {
      const el = document.getElementById('behavior-duration');
      if (el) el.value = last.duration;
    }
    if (last.quantity) {
      const el = document.getElementById('behavior-quantity');
      if (el) el.value = last.quantity;
    }
    if (last.description) {
      const el = document.getElementById('behavior-description');
      if (el) el.value = last.description;
    }
```

**新代码：**
```js
    requestAnimationFrame(() => { // V25-008: 等待 render DOM 挂载
      if (last.duration) {
        const el = document.getElementById('behavior-duration');
        if (el) el.value = last.duration; // V25-008
      }
      if (last.quantity) {
        const el = document.getElementById('behavior-quantity');
        if (el) el.value = last.quantity; // V25-008
      }
      if (last.description) {
        const el = document.getElementById('behavior-description');
        if (el) el.value = last.description; // V25-008
      }
    }); // V25-008
```

---

## 验收标准

| 编号 | 验收条件 |
|------|----------|
| V25-006 | 快速连点提交按钮，只产生一条记录；按钮在请求期间显示"提交中…"且 disabled；请求完成（成功或失败）后按钮恢复可点击状态和原始文字 |
| V25-007 | 提交后页面只刷新一次，无可感知闪烁；Promise.all 回调内的 render 正常执行 |
| V25-008 | 点击"重复上次"后，duration / quantity / description 输入框正确回填上次值，不出现空白或赋值丢失 |

---

## P0 条目（第二批：V25-009/010）

# Codex 指令：behavior.js P0 修复（第二批）

目标文件：`public/js/pages/behavior.js`

---

## 条目 1：V25-009 selectShortcut()/repeatLast() 找不到行为时半选中状态

### 1a. selectShortcut() — 找不到行为时清除全部选中状态

旧代码：
```js
    const behavior = list.find(b => b.name === s.sub_type);
    if (!behavior) {
      App.toast('该行为已不存在，请手动选择', 'error');
      this.selectedBehavior = null;
      this.render();
      return;
    }
```

新代码：
```js
    const behavior = list.find(b => b.name === s.sub_type);
    if (!behavior) {
      App.toast('该行为已不存在，请手动选择', 'error');
      this.selectedCategory = null;    // V25-009
      this.selectedSubCategory = null; // V25-009
      this.selectedBehavior = null;
      this.render();
      return;
    }
```

### 1b. repeatLast() — 同理清除全部选中状态

旧代码：
```js
    const behavior = list.find(b => b.name === last.sub_type);
    if (!behavior) {
      App.toast('该行为已不存在，请手动选择', 'error');
      this.selectedBehavior = null;
      this.render();
      return;
    }
```

新代码：
```js
    const behavior = list.find(b => b.name === last.sub_type);
    if (!behavior) {
      App.toast('该行为已不存在，请手动选择', 'error');
      this.selectedCategory = null;    // V25-009
      this.selectedSubCategory = null; // V25-009
      this.selectedBehavior = null;
      this.render();
      return;
    }
```

---

## 条目 2：V25-010 submitCustom() 防重复点击

### 2a. renderCustomForm() 保存按钮加 id

旧代码：
```js
<button class="btn btn-primary" onclick="BehaviorPage.submitCustom()">保存</button>
```

新代码：
```js
<button id="custom-submit-btn" class="btn btn-primary" onclick="BehaviorPage.submitCustom()">保存</button>
```

### 2b. submitCustom() 加防重复点击保护

旧代码：
```js
  async submitCustom() {
    if (!this.selectedCategory) return;
    const name = (document.getElementById('custom-name')?.value || '').trim();
    // ... 校验 ...
    let created = false;
    try {
      await API.post('/behavior/custom', { ... });
      created = true;
    } catch (e) {
      // ...
    }
    try {
      this.categories = await API.get('/behavior/categories');
      // ... 后续逻辑 ...
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },
```

新代码：
```js
  async submitCustom() {
    if (!this.selectedCategory) return;
    const submitBtn = document.getElementById('custom-submit-btn'); // V25-010
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '保存中…'; } // V25-010
    const name = (document.getElementById('custom-name')?.value || '').trim();
    // ... 校验 ...
    let created = false;
    try {
      await API.post('/behavior/custom', { ... });
      created = true;
    } catch (e) {
      // ...
    }
    try {
      this.categories = await API.get('/behavior/categories');
      // ... 后续逻辑 ...
    } catch (e) {
      App.toast(e.message, 'error');
    }
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '保存'; } // V25-010
  },
```

> **注意**：实际替换时，`// ... 校验 ...` 和 `// ... 后续逻辑 ...` 处保留原有代码不变。Codex 只需在方法开头插入按钮禁用逻辑，在方法最末尾（最后一个 `}` 之前）插入恢复逻辑。如果校验提前 return，需要在每个提前 return 之前也恢复按钮状态，或者用外层 try/finally 包裹整个方法体：
>
> ```js
> async submitCustom() {
>     if (!this.selectedCategory) return;
>     const submitBtn = document.getElementById('custom-submit-btn'); // V25-010
>     if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '保存中…'; } // V25-010
>     try {                                                           // V25-010
>       const name = (document.getElementById('custom-name')?.value || '').trim();
>       // ... 原有全部逻辑 ...
>     } finally {                                                     // V25-010
>       if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '保存'; } // V25-010
>     }
>   },
> ```
>
> 推荐使用 try/finally 方案，确保任何路径（包括校验 return、异常）都能恢复按钮。

---

## 验收标准

### V25-009
1. 在快捷方式中保存一个行为，然后在后台删除该行为（或改名使其不匹配）
2. 点击该快捷方式，应弹出 toast "该行为已不存在，请手动选择"
3. 页面应回到初始状态：分类、子分类、行为三栏均无选中高亮
4. 对 repeatLast() 同理：上次记录的行为已不存在时，点击"重复上次"后三栏均清空

### V25-010
1. 打开自定义行为表单，填写有效内容，快速连点"保存"按钮
2. 按钮在第一次点击后应立即变为禁用状态，文字显示"保存中…"
3. 请求完成后按钮恢复为"保存"且可再次点击
4. 只应产生一条自定义行为记录（无重复）
5. 如果保存失败（网络错误等），按钮也应恢复可用状态

---

## P1 条目（第一批：V25-038~043）

> ⚠️ V25-038 renderTabBar() 中变量名修正：`this.tab` → `this.activeTab`

# Codex 指令：behavior.js 第一批修复（V25-038 ~ V25-043）

目标文件：`public/js/pages/behavior.js`

---

## V25-038：Tab bar 渲染逻辑重复

### 新增方法

在 BehaviorPage 对象中新增 `renderTabBar()` 方法：

```js
// === 新增 ===
renderTabBar() { // V25-038
    const reportActive = this.activeTab === 'report' ? 'btn-primary' : 'btn-secondary';
    const historyActive = this.activeTab === 'history' ? 'btn-primary' : 'btn-secondary';
    return `
        <div style="display:flex;gap:0;margin-bottom:12px;border-bottom:1px solid var(--border)">
          <button class="btn btn-small ${reportActive}" onclick="BehaviorPage.switchTab('report')">上报</button>
          <button class="btn btn-small ${historyActive}" onclick="BehaviorPage.switchTab('history')">历史</button>
        </div>
    `; // V25-038
},
```

### render() 中替换

旧代码（render 方法内的 tab bar HTML 块）：
```js
<div style="display:flex;gap:0;margin-bottom:12px;border-bottom:1px solid var(--border)">
  <button class="btn btn-small ${...report...}">上报</button>
  <button class="btn btn-small ${...history...}">历史</button>
</div>
```

新代码：
```js
${this.renderTabBar()} // V25-038
```

### loadHistory() 中替换

同上，找到 loadHistory() 内硬编码的同样 tab bar HTML，替换为：
```js
${this.renderTabBar()} // V25-038
```

### selectDate() 中替换

同上，找到 selectDate() 内硬编码的同样 tab bar HTML，替换为：
```js
${this.renderTabBar()} // V25-038
```

---

## V25-039：提交按钮触控区域不足 44px

### renderInputForm() 中替换

旧代码：
```js
<button class="btn btn-primary" onclick="BehaviorPage.submit()">
  ${b.template === 'checkin' ? '打卡' : '提交'}
</button>
```

新代码：
```js
<button class="btn btn-primary" style="min-height:44px" onclick="BehaviorPage.submit()"> // V25-039
  ${b.template === 'checkin' ? '打卡' : '提交'}
</button>
```

---

## V25-040：快捷按钮触控区域偏小

### renderShortcuts() 中替换

旧代码：
```js
<button class="btn btn-small btn-secondary" onclick="BehaviorPage.selectShortcut(${idx})">
```

新代码：
```js
<button class="btn btn-secondary" style="min-height:44px;padding:8px 16px" onclick="BehaviorPage.selectShortcut(${idx})"> // V25-040
```

---

## V25-041：移动端键盘遮挡提交按钮

### renderInputForm() 中替换

在 renderInputForm() 返回的 HTML 中，将提交按钮用 sticky 容器包裹。

旧代码（提交按钮部分）：
```js
<button class="btn btn-primary" style="min-height:44px" onclick="BehaviorPage.submit()">
  ${b.template === 'checkin' ? '打卡' : '提交'}
</button>
```

新代码：
```js
<div style="position:sticky;bottom:0;padding:12px 0;background:var(--bg)"> // V25-041
  <button class="btn btn-primary" style="min-height:44px" onclick="BehaviorPage.submit()"> // V25-039
    ${b.template === 'checkin' ? '打卡' : '提交'}
  </button>
</div> // V25-041
```

> 注意：V25-039 和 V25-041 作用于同一个按钮，合并应用。最终形态如上。

---

## V25-042：行为选择后无自动滚动

### selectBehavior() 替换

旧代码：
```js
selectBehavior(behavior) {
    this.selectedBehavior = behavior;
    this.render();
},
```

新代码：
```js
selectBehavior(behavior) {
    this.selectedBehavior = behavior;
    this.render();
    setTimeout(() => { // V25-042
        const submitBtn = document.querySelector('.btn-primary[onclick*="submit"]');
        if (submitBtn) submitBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100); // V25-042
},
```

---

## V25-043：月历切换时空白闪烁

### navMonth() 替换

旧代码：
```js
navMonth(year, month) {
    this.historyYear = year;
    this.historyMonth = month;
    this.historyData = null;
    this.selectedDate = null;
    this.render();
},
```

新代码：
```js
navMonth(year, month) { // V25-043
    this.historyYear = year;
    this.historyMonth = month;
    // 不置空 historyData，保留旧数据避免闪烁 // V25-043
    this.selectedDate = null;
    this.historyLoading = true; // V25-043
    this.render(); // V25-043 — 用旧数据 + loading 标记渲染
    this.loadHistory(); // V25-043 — 异步加载新数据
},
```

### loadHistory() 回调中补充

在 loadHistory() 成功获取数据后（赋值 historyData 之后），加一行：
```js
this.historyLoading = false; // V25-043
```

### renderHistory() 月历区域补充

在 renderHistory() 渲染月历网格的位置，加入 loading 判断：

```js
${this.historyLoading ? '<div style="text-align:center;padding:24px;color:var(--text-secondary)">加载中…</div>' : /* 原有月历网格 HTML */} // V25-043
```

---

## 验收标准

| 条目 | 验收方式 |
|------|----------|
| V25-038 | 全局搜索 tab bar HTML（`display:flex;gap:0;margin-bottom:12px`），仅出现在 `renderTabBar()` 方法定义中，render()、loadHistory()、selectDate() 三处均调用 `this.renderTabBar()` |
| V25-039 | 提交按钮（打卡/提交）的 computed style `min-height ≥ 44px` |
| V25-040 | 快捷按钮不含 `btn-small` class，computed style `min-height ≥ 44px`，`padding` 为 `8px 16px` |
| V25-041 | 移动端弹出键盘后，提交按钮仍可见（sticky 定位在视口底部）；桌面端按钮正常显示在表单底部 |
| V25-042 | 点击行为卡片后，页面自动平滑滚动至提交按钮可见区域 |
| V25-043 | 切换月份时，月历区域显示"加载中…"而非空白；新数据到达后正常渲染，无闪烁 |

---

## P1 + P2 条目（第二批：V25-044~047, 081~083）

# Codex 指令：behavior.js 批量改动（P1b）

目标文件：`public/js/pages/behavior.js`
附加文件：`public/css/style.css`（V25-045 需要）

---

## V25-044：日历格子点击区域过小

**位置**：`renderHistory()` 中日历格子的 `<div>`

**旧代码**：
```js
<div onclick="BehaviorPage.selectDate('${dateStr}')"
  style="text-align:center;padding:6px 2px;border-radius:6px;cursor:pointer;font-size:13px;
         background:${...};color:${...};font-weight:${...}">
  ${d}
</div>
```

**新代码**：
```js
<div onclick="BehaviorPage.selectDate('${dateStr}')"
  style="text-align:center;padding:6px 2px;border-radius:6px;cursor:pointer;font-size:13px;min-width:36px;min-height:36px;display:flex;align-items:center;justify-content:center;
         background:${...};color:${...};font-weight:${...}"> // V25-044
  ${d}
</div>
```

**要点**：在 style 中追加 `min-width:36px;min-height:36px;display:flex;align-items:center;justify-content:center`，确保每个日历格子有足够的点击热区。

---

## V25-045：快捷行为区域无滚动引导

**位置**：`renderShortcuts()` 中快捷行为容器

### 改动 1：behavior.js

**旧代码**：
```js
<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px">
```

**新代码**：
```js
<div class="shortcut-scroll"> // V25-045 wrapper
<div style="display:flex;flex-wrap:nowrap;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:4px;gap:8px;margin-bottom:8px"> // V25-045
```

同时在该容器的闭合 `</div>` 后面补上 wrapper 的闭合 `</div>`：
```js
</div>
</div> <!-- /shortcut-scroll V25-045 -->
```

### 改动 2：style.css（新增）

在 `public/css/style.css` 末尾追加：
```css
/* V25-045: 快捷行为横向滚动渐变遮罩 */
.shortcut-scroll {
  position: relative;
}
.shortcut-scroll::after {
  content: '';
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 24px;
  background: linear-gradient(to right, transparent, var(--bg-card));
  pointer-events: none;
}
```

---

## V25-046：缺少快捷一键打卡按钮

**位置**：`renderShortcuts()` 中每个快捷按钮 + 新增 `quickCheckin` 方法

### 改动 1：新增 quickCheckin 方法

在 BehaviorPage 对象中（与 `selectShortcut` 同级）新增：

```js
// V25-046: 快捷一键打卡
async quickCheckin(index) {
  const s = this.shortcuts[index];
  if (!s) return;
  try {
    const result = await API.post('/behavior', {
      category: s.category,
      sub_type: s.sub_type,
      sub_category: s.sub_category || undefined,
      description: '',
    });
    const item = result.item;
    App.toast(`打卡成功：${item.name}（${item.quality}）`, 'success');
    this.load();
  } catch (e) {
    App.toast(e.message, 'error');
  }
}, // V25-046
```

### 改动 2：renderShortcuts 中按钮渲染

**旧代码**：
```js
<button class="btn btn-small btn-secondary" onclick="BehaviorPage.selectShortcut(${idx})">
  ${e(s.sub_type)}
</button>
```

**新代码**：
```js
<button class="btn btn-small btn-secondary" onclick="BehaviorPage.selectShortcut(${idx})">
  ${e(s.sub_type)}
</button>
${s.template === 'checkin' ? `<button class="btn btn-small btn-primary" onclick="BehaviorPage.quickCheckin(${idx})" style="padding:4px 8px">⚡</button>` : ''} // V25-046
```

---

## V25-047：身体健康类别子分类未默认展开

**状态**：✅ 已实现，无需改动。

`selectCategory()` 中已有逻辑：
```js
if (this.isGroupedCategory(category)) {
  const subs = Object.keys(this.categories[category] || {});
  this.selectedSubCategory = subs[0] || null;
}
```
该代码已默认选中第一个子分类，符合预期。

---

## V25-081：加载失败时页面空白

**位置**：`load()` 方法的 catch 块

**旧代码**：
```js
catch (e) {
  App.toast(e.message, 'error');
}
```

**新代码**：
```js
catch (e) {
  App.toast(e.message, 'error');
  const container = document.getElementById('page-behavior'); // V25-081
  if (container) container.innerHTML = `<div class="card" style="text-align:center;padding:40px"><div style="margin-bottom:12px;color:var(--text-dim)">加载失败</div><button class="btn btn-primary" onclick="BehaviorPage.load()">重试</button></div>`; // V25-081
}
```

---

## V25-082：备注 placeholder 缺乏引导

**位置**：`renderInputForm()` 中备注输入框

**旧代码**：
```js
<input type="text" id="behavior-desc" placeholder="简单描述一下">
```

**新代码**：
```js
<input type="text" id="behavior-desc" placeholder="例如：晚饭后跑步30分钟"> // V25-082
```

---

## V25-083：最近记录加载失败静默吞错

**位置**：`loadRecentHistory()` 末尾的 catch 块

**旧代码**：
```js
} catch {
  // silently fail
}
```

**新代码**：
```js
} catch {
  const el = document.getElementById('behavior-history'); // V25-083
  if (el) el.innerHTML = '<div class="empty-state" style="color:var(--text-dim)">加载失败，请刷新重试</div>'; // V25-083
}
```

---

## 验收标准

| 条目 | 验收方式 |
|------|----------|
| V25-044 | 在移动端点击日历格子，热区不小于 36×36px，手指不易误触相邻日期 |
| V25-045 | 快捷行为超出一行时可横向滑动，右侧有渐变遮罩提示可滚动 |
| V25-046 | checkin 类型的快捷行为旁显示 ⚡ 按钮，点击后直接提交并 toast 提示"打卡成功" |
| V25-047 | 无需验证（已实现） |
| V25-081 | 断网或 API 500 时，页面显示"加载失败"卡片和"重试"按钮，不再空白 |
| V25-082 | 备注输入框 placeholder 显示"例如：晚饭后跑步30分钟" |
| V25-083 | 最近记录加载失败时，历史区域显示"加载失败，请刷新重试"，不再静默 |

---

> **注意**：V25-038/043/044 相关的历史 tab 月历→周报改造，待周报策划完成后单独出指令。当前改动仅优化现有月历的交互体验。

---

# 备注

- 所有新增/修改代码行尾注释 `// V25-xxx`（对应条目编号）
- V25-005 已移出 V2.5（行为×状态联动，独立议题）
- V25-029 已随 codex-v2-f06-fix.md 解决
- V25-047 已实现，无需改动
- V25-077 随补充改动 1（删除进度条）一并解决
- 历史 tab 月历→周报改造，待周报策划完成后单独出指令
- V25-006/039/041 影响 renderInputForm() 同一个提交按钮，执行时需一次性合并应用
- V25-038 renderTabBar() 中 `this.tab` 应为 `this.activeTab`，请注意修正
