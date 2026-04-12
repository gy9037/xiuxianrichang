# Codex 指令：V2.5 首页交互优化

> 关联策划案：docs/iteration-v2.5.md
> 涉及文件：public/js/pages/home.js, public/css/style.css
> 溯源：V25-001~V25-005, V25-030~V25-037, V25-077~V25-080, 补充改动×1

---

## 修改总览表

| 序号 | 策划编号 | 优先级 | 简述 | 涉及文件 | 状态 |
|------|---------|--------|------|---------|------|
| 1 | V25-001 | P0 | 首页加载 loading | home.js | 待实现 |
| 2 | V25-002 | P0 | 晋级按钮防重复+反馈 | home.js | 待实现 |
| 3 | V25-003 | P0 | 状态弹窗提交 loading | home.js | 待实现 |
| 4 | V25-004 | P0 | 状态 badge 触控目标 | home.js, style.css | 待实现 |
| 5 | V25-005 | P0 | （已移出 V2.5，跳过） | — | 跳过 |
| 6 | V25-030 | P1 | 推荐卡片点击反馈 | home.js, style.css | 待实现 |
| 7 | V25-031 | P1 | 衰退预警严重程度区分 | home.js, style.css | 待实现 |
| 8 | V25-032 | P1 | 雷达图 SVG 自适应 | home.js | 待实现 |
| 9 | V25-033 | P1 | 成就 toast 批量合并 | home.js | 待实现 |
| 10 | V25-034 | P1 | 新用户引导卡 CTA 按钮 | home.js | 待实现 |
| 11 | V25-035 | P1 | goToBehavior 时序修复 | home.js | 待实现 |
| 12 | V25-036 | P1 | 退出登录确认步骤 | home.js | 待实现 |
| 13 | V25-037 | P1 | 推荐卡片类别名统一 | home.js | 待实现 |
| 14 | V25-077 | P2 | 属性进度条过渡动画 | style.css | 已实现，跳过 |
| 15 | V25-078 | P2 | 境界 badge 无障碍语义 | home.js | 待实现 |
| 16 | V25-079 | P2 | 成就列表空状态提示 | home.js | 待实现 |
| 17 | V25-080 | P2 | 状态弹窗遮罩层关闭 | home.js | 待实现 |
| 18 | 补充-1 | — | 雷达图标签显示数值+去掉进度条 | home.js | 待实现 |

---

## 详细修改指令

### 1. V25-001：首页加载 loading（P0）

**文件**：`public/js/pages/home.js`

**修改 load() 方法**（当前行 23-36）

修改前：

```js
async load() {
  try {
    const [characterData, achievementsData] = await Promise.all([
      API.get('/character'),
      API.get('/character/achievements').catch(() => []),
    ]);
    this.data = characterData;
    this.achievements = Array.isArray(achievementsData) ? achievementsData : [];
    this.toastNewAchievements(this.achievements);
    this.render();
  } catch (e) {
    App.toast(e.message, 'error');
  }
},
```

修改后：

```js
async load() {
  const container = document.getElementById('page-home');
  // V2.5 V25-001 - 加载期间显示 loading 骨架屏
  container.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 0">
      <div style="width:36px;height:36px;border:3px solid var(--border);border-top-color:var(--primary);border-radius:50%;animation:spin 0.8s linear infinite"></div>
      <div style="margin-top:12px;font-size:13px;color:var(--text-dim)">加载中…</div>
      <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
    </div>
  `;
  try {
    const [characterData, achievementsData] = await Promise.all([
      API.get('/character'),
      API.get('/character/achievements').catch(() => []),
    ]);
    this.data = characterData;
    this.achievements = Array.isArray(achievementsData) ? achievementsData : [];
    this.toastNewAchievements(this.achievements);
    this.render();
  } catch (e) {
    App.toast(e.message, 'error');
  }
},
```

---

### 2. V25-002：晋级按钮防重复+反馈（P0）

**文件**：`public/js/pages/home.js`

**修改 promote() 方法**（当前行 387-395）

修改前：

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

修改后：

```js
promoting: false, // V2.5 V25-002 - 晋级防重复标志位

async promote() {
  if (this.promoting) return; // V2.5 V25-002
  this.promoting = true;
  const btn = document.querySelector('.realm-badge-action.promotable');
  if (btn) {
    btn.disabled = true;
    btn.dataset.originalText = btn.textContent;
    btn.textContent = '晋级中…';
  }
  try {
    const result = await API.post('/character/promote');
    App.toast(result.message, 'success');
    this.load();
  } catch (e) {
    App.toast(e.message, 'error');
    // 失败时恢复按钮
    if (btn) {
      btn.disabled = false;
      btn.textContent = btn.dataset.originalText || '';
    }
  } finally {
    this.promoting = false;
  }
},
```

注意：`promoting: false` 需要加在 `HomePage` 对象的属性区域（行 20-21 附近），与 `data: null` 同级。

---

### 3. V25-003：状态弹窗提交 loading（P0）

**文件**：`public/js/pages/home.js`

**修改 setStatus() 方法**（当前行 376-385）

修改前：

```js
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

修改后：

```js
settingStatus: false, // V2.5 V25-003 - 状态提交防重复标志位

async setStatus(status) {
  if (this.settingStatus) return; // V2.5 V25-003
  this.settingStatus = true;
  // V2.5 V25-003 - 禁用所有选项并显示加载指示器
  const modal = document.getElementById('status-picker-modal');
  if (modal) {
    const options = modal.querySelectorAll('[onclick^="HomePage.setStatus"]');
    options.forEach(el => {
      el.style.pointerEvents = 'none';
      el.style.opacity = '0.5';
    });
    // 在被点击的选项上显示加载状态
    options.forEach(el => {
      if (el.getAttribute('onclick')?.includes(`'${status}'`)) {
        el.insertAdjacentHTML('beforeend',
          '<span class="status-loading" style="margin-left:8px;font-size:12px;color:var(--text-dim)">提交中…</span>');
      }
    });
  }
  try {
    await API.post('/character/status', { status });
    modal?.remove();
    App.toast(`状态已切换为：${status}`, 'success');
    this.load();
  } catch (e) {
    App.toast(e.message, 'error');
    // 失败时恢复选项
    if (modal) {
      const options = modal.querySelectorAll('[onclick^="HomePage.setStatus"]');
      options.forEach(el => {
        el.style.pointerEvents = '';
        el.style.opacity = '';
      });
      modal.querySelectorAll('.status-loading').forEach(el => el.remove());
    }
  } finally {
    this.settingStatus = false;
  }
},
```

注意：`settingStatus: false` 需要加在 `HomePage` 对象的属性区域。

---

### 4. V25-004：状态 badge 触控目标增大（P0）

**文件**：`public/js/pages/home.js` render() 行 288-292

修改前：

```html
<span class="status-badge status-${e(character.status || '正常')}"
  onclick="HomePage.showStatusPicker()"
  style="cursor:pointer;font-size:12px;padding:4px 10px;border-radius:12px;background:var(--bg-card-light)">
  ${e(character.status || '正常')} ▾
</span>
```

修改后：

```html
<span class="status-badge status-${e(character.status || '正常')}"
  onclick="HomePage.showStatusPicker()"
  style="cursor:pointer;font-size:12px;padding:4px 10px;border-radius:12px;background:var(--bg-card-light);min-height:44px;min-width:44px;display:inline-flex;align-items:center;justify-content:center">
  ${e(character.status || '正常')} ▾
</span>
```

---

### 5. V25-005：跳过

> 已移出 V2.5 范围，不做任何修改。

---

### 6. V25-030：推荐卡片点击反馈（P1）

**文件**：`public/css/style.css`（行 443-466 附近）

在现有 `.recommend-item` 样式后追加：

```css
/* V2.5 V25-030 - 推荐卡片点击反馈 */
.recommend-item:active {
  opacity: 0.7;
  transition: opacity 0.1s ease;
}
.recommend-item:active .recommend-arrow {
  color: var(--primary);
}
```

---

### 7. V25-031：衰退预警严重程度区分（P1）

**文件 1**：`public/js/pages/home.js` render() 行 267-275

修改前：

```js
let decayHtml = '';
const warnings = decayStatus.filter(d => d.status !== '正常');
if (warnings.length > 0) {
  decayHtml = warnings.map(d => `
    <div class="decay-warning">
      ${e(d.name)}：${e(d.status)}${d.dailyDecay > 0 ? `（每日-${d.dailyDecay}）` : '（即将衰退）'}
      ${d.inactiveDays ? `，已${d.inactiveDays}天未活跃` : ''}
    </div>
  `).join('');
}
```

修改后：

```js
let decayHtml = '';
const warnings = decayStatus.filter(d => d.status !== '正常');
if (warnings.length > 0) {
  decayHtml = warnings.map(d => {
    // V2.5 V25-031 - 按严重程度区分样式
    const isDecaying = d.dailyDecay > 0; // 正在衰退
    const severityClass = isDecaying ? 'decay-warning-severe' : 'decay-warning-mild';
    return `
      <div class="decay-warning ${severityClass}">
        ${e(d.name)}：${e(d.status)}${isDecaying ? `（每日-${d.dailyDecay}）` : '（即将衰退）'}
        ${d.inactiveDays ? `，已${d.inactiveDays}天未活跃` : ''}
      </div>
    `;
  }).join('');
}
```

**文件 2**：`public/css/style.css`（行 377-386 附近）

修改前：

```css
.decay-warning {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid var(--red);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--red);
  margin-top: 6px;
}
```

修改后：

```css
/* V2.5 V25-031 - 衰退预警基础样式 */
.decay-warning {
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 12px;
  margin-top: 6px;
  border-left: 4px solid;
}

/* V2.5 V25-031 - 即将衰退：黄色警告 */
.decay-warning-mild {
  background: rgba(245, 158, 11, 0.1);
  border-color: var(--gold);
  color: var(--gold);
}

/* V2.5 V25-031 - 正在衰退：红色严重 */
.decay-warning-severe {
  background: rgba(239, 68, 68, 0.1);
  border-color: var(--red);
  color: var(--red);
}
```

---

### 8. V25-032：雷达图 SVG 自适应（P1）

**文件**：`public/js/pages/home.js` renderRadar() 行 190, 239-241

修改前（行 190）：

```js
const SIZE = 200;
```

修改前（行 239-241）：

```js
return `
  <svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"
    style="display:block;margin:0 auto 12px;overflow:visible">
```

修改后（行 190 不变，仅修改 SVG 输出部分）：

```js
return `
  <svg viewBox="0 0 ${SIZE} ${SIZE}"
    width="100%" style="max-width:200px;display:block;margin:0 auto 12px;overflow:visible">
```

即：移除 `width="${SIZE}" height="${SIZE}"` 硬编码，改为 `width="100%"` + `max-width:200px`。

---

### 9. V25-033：成就 toast 批量合并（P1）

**文件**：`public/js/pages/home.js` toastNewAchievements() 行 134-152

修改前：

```js
toastNewAchievements(achievements) {
  if (!Array.isArray(achievements) || achievements.length === 0) return;
  const toastedKey = 'v2f10_toasted';
  let toasted = [];
  try {
    const parsed = JSON.parse(sessionStorage.getItem(toastedKey) || '[]');
    toasted = Array.isArray(parsed) ? parsed : [];
  } catch {
    toasted = [];
  }

  const newlyUnlocked = achievements.filter(a => a.unlocked && !toasted.includes(a.id));
  newlyUnlocked.forEach((a) => {
    App.toast(`成就解锁：${a.icon} ${a.name}`, 'success');
    toasted.push(a.id);
  });
  sessionStorage.setItem(toastedKey, JSON.stringify(toasted));
},
```

修改后：

```js
toastNewAchievements(achievements) {
  if (!Array.isArray(achievements) || achievements.length === 0) return;
  const toastedKey = 'v2f10_toasted';
  let toasted = [];
  try {
    const parsed = JSON.parse(sessionStorage.getItem(toastedKey) || '[]');
    toasted = Array.isArray(parsed) ? parsed : [];
  } catch {
    toasted = [];
  }

  const newlyUnlocked = achievements.filter(a => a.unlocked && !toasted.includes(a.id));
  if (newlyUnlocked.length === 0) return;

  // V2.5 V25-033 - 多条成就合并为一条 toast
  if (newlyUnlocked.length === 1) {
    App.toast(`成就解锁：${newlyUnlocked[0].icon} ${newlyUnlocked[0].name}`, 'success');
  } else {
    const names = newlyUnlocked.map(a => `${a.icon}${a.name}`).join('、');
    App.toast(`解锁了 ${newlyUnlocked.length} 个成就：${names}`, 'success');
  }

  newlyUnlocked.forEach(a => toasted.push(a.id));
  sessionStorage.setItem(toastedKey, JSON.stringify(toasted));
},
```

---

### 10. V25-034：新用户引导卡 CTA 按钮（P1）

**文件**：`public/js/pages/home.js` renderRecommendations() 行 84-94

修改前：

```js
if (recs === null) {
  return `
    <div class="card recommend-card" onclick="HomePage.goToBehavior(null)">
      <div class="card-title">✨ 今日推荐</div>
      <div class="recommend-item">
        <span class="recommend-text">先去上报一次行为，获得你的第一个道具</span>
        <span class="recommend-arrow">›</span>
      </div>
    </div>
  `;
}
```

修改后：

```js
if (recs === null) {
  return `
    <div class="card recommend-card" onclick="HomePage.goToBehavior(null)">
      <div class="card-title">✨ 今日推荐</div>
      <div class="recommend-item">
        <div>
          <span class="recommend-text">先去上报一次行为，获得你的第一个道具</span>
          <button class="btn btn-small btn-primary" style="margin-top:8px">去上报 →</button>
        </div>
      </div>
    </div>
  `;
}
```

---

### 11. V25-035：goToBehavior 时序修复（P1）

**文件**：`public/js/pages/home.js` goToBehavior() 行 114-132

修改前：

```js
goToBehavior(category) {
  App.navigate('behavior');
  if (category) {
    const categoryMap = {
      运动健身: '身体健康',
      学习成长: '学习',
      冥想休息: '生活习惯',
      生活技能: '家务',
      感知记录: '社交互助',
    };
    const targetCategory = categoryMap[category] || category;
    setTimeout(() => {
      if (typeof BehaviorPage !== 'undefined' && BehaviorPage.selectCategory) BehaviorPage.selectCategory(targetCategory);
    }, 50);
  }
},
```

修改后：

```js
goToBehavior(category) {
  // V2.5 V25-035 - 通过 pendingCategory 机制替代 setTimeout
  if (category && typeof BehaviorPage !== 'undefined') {
    BehaviorPage.pendingCategory = category;
  }
  App.navigate('behavior');
},
```

**同时需要修改 `public/js/pages/behavior.js`**：在 `BehaviorPage.load()` 方法末尾（render 完成之后）追加：

```js
// V2.5 V25-035 - 消费 pendingCategory
if (this.pendingCategory) {
  this.selectCategory(this.pendingCategory);
  this.pendingCategory = null;
}
```

并在 `BehaviorPage` 对象顶部属性区域添加：

```js
pendingCategory: null, // V2.5 V25-035
```

注意：由于 V25-037 会统一类别名，此处 goToBehavior 不再需要 categoryMap 转换层。pendingCategory 直接使用行为页的实际分类名（由 V25-037 保证 ATTR_CATEGORY_MAP 中的 category 值已统一）。

---

### 12. V25-036：退出登录确认步骤（P1）

**文件**：`public/js/pages/home.js` logout() 行 397-400

修改前：

```js
logout() {
  API.clearAuth();
  App.showLogin();
},
```

修改后：

```js
logout() {
  // V2.5 V25-036 - 退出前确认
  if (!confirm('确认退出登录？')) return;
  API.clearAuth();
  App.showLogin();
},
```

---

### 13. V25-037：推荐卡片类别名统一（P1，含补充-2）

**文件**：`public/js/pages/home.js`

**修改 1：ATTR_CATEGORY_MAP**（行 41-47）

修改前：

```js
const ATTR_CATEGORY_MAP = {
  physique: { label: '体魄', category: '运动健身' },
  comprehension: { label: '悟性', category: '学习成长' },
  willpower: { label: '心性', category: '冥想休息' },
  dexterity: { label: '灵巧', category: '生活技能' },
  perception: { label: '神识', category: '感知记录' },
};
```

修改后：

```js
// V2.5 V25-037 - category 值直接使用行为页实际分类名
const ATTR_CATEGORY_MAP = {
  physique: { label: '体魄', category: '身体健康' },
  comprehension: { label: '悟性', category: '学习' },
  willpower: { label: '心性', category: '生活习惯' },
  dexterity: { label: '灵巧', category: '家务' },
  perception: { label: '神识', category: '社交互助' },
};
```

**修改 2：goToBehavior 去掉 categoryMap**（行 114-132）

已在 V25-035 中一并处理。goToBehavior 不再包含 categoryMap 转换层，直接将 category 传递给 BehaviorPage.pendingCategory。

---

### 14. V25-077：属性进度条过渡动画（P2）— 跳过

> `public/css/style.css` 行 155-160 中 `.attr-bar-fill` 已有 `transition: width 0.5s ease`，无需修改。

---

### 15. V25-078：境界 badge 无障碍语义（P2）

**文件**：`public/js/pages/home.js` render() 行 297-303

修改前：

```js
${promotion.canPromote ? `
  <button class="realm-badge realm-badge-action promotable" onclick="HomePage.promote()">
    ${realmStageText}
  </button>
` : `
  <span class="realm-badge">${realmStageText}</span>
`}
```

修改后：

```js
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
```

---

### 16. V25-079：成就列表空状态提示（P2）

**文件**：`public/js/pages/home.js` renderAchievements() 行 157-159

修改前：

```js
if (!Array.isArray(this.achievements) || this.achievements.length === 0) {
  return '';
}
```

修改后：

```js
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
```

---

### 17. V25-080：状态弹窗遮罩层点击关闭（P2）

**文件**：`public/js/pages/home.js` showStatusPicker() 行 354

修改前：

```js
modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:200;display:flex;align-items:center;justify-content:center;padding:24px';
```

修改后：

```js
modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:200;display:flex;align-items:center;justify-content:center;padding:24px';
// V2.5 V25-080 - 点击遮罩区域关闭弹窗
modal.onclick = function(event) { if (event.target === this) this.remove(); };
```

即在 `modal.style.cssText = ...` 之后、`modal.innerHTML = ...` 之前，插入 onclick 绑定。

---

### 18. 补充-1：雷达图标签显示数值 + 去掉属性进度条

**文件**：`public/js/pages/home.js`

**修改 1：renderRadar() 标签显示数值**（行 231-236）

修改前：

```js
const labels = DIMS.map((d, i) => {
  const lp = pt(LABEL_R, i);
  const cos = Math.cos(angle(i));
  const anchor = cos < -0.1 ? 'end' : cos > 0.1 ? 'start' : 'middle';
  return `<text x="${lp.x.toFixed(2)}" y="${lp.y.toFixed(2)}" text-anchor="${anchor}" dominant-baseline="middle" font-size="11" fill="var(--text-dim)">${d.label}</text>`;
}).join('\n      ');
```

修改后：

```js
// 补充-1 - 标签旁显示数值："体魄 12.5"
const labels = DIMS.map((d, i) => {
  const lp = pt(LABEL_R, i);
  const cos = Math.cos(angle(i));
  const anchor = cos < -0.1 ? 'end' : cos > 0.1 ? 'start' : 'middle';
  const val = Number(character[d.key] || 0);
  const valText = Number.isInteger(val) ? String(val) : val.toFixed(1);
  return `<text x="${lp.x.toFixed(2)}" y="${lp.y.toFixed(2)}" text-anchor="${anchor}" dominant-baseline="middle" font-size="11" fill="var(--text-dim)">${d.label} ${valText}</text>`;
}).join('\n      ');
```

**修改 2：render() 去掉属性进度条**（行 312-326）

修改前：

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

修改后：

```js
<div class="card">
  <div class="card-title">属性总览</div>
  ${this.renderRadar(character)}
</div>
```

即：删除整个 `<div class="attr-list">...</div>` 块（行 312-326），雷达图标签已包含数值，进度条冗余。

---

## 实施注意事项

1. V25-035 需要同时修改 `behavior.js`，这是本文档唯一涉及 home.js / style.css 之外的文件
2. V25-037 和 V25-035 有依赖关系：先做 V25-037（统一类别名），再做 V25-035（去掉 categoryMap），否则 pendingCategory 传入的值与行为页不匹配
3. 补充-1 和 V25-032 可以合并实施，都在 renderRadar() 区域
4. 新增的属性（`promoting`、`settingStatus`、`pendingCategory`）都是布尔/null 标志位，加在各自对象的属性声明区域即可
