# Codex 指令：V2.5 行为页交互优化

> 关联策划案：docs/iteration-v2.5.md
> 涉及文件：public/js/pages/behavior.js, public/css/style.css
> 溯源：V25-006~V25-010, V25-038~V25-047, V25-081~V25-083, FB-U13

---

## 修改总览表

| 序号 | 策划编号 | 优先级 | 简述 | 涉及文件 | 状态 |
|------|---------|--------|------|---------|------|
| 1 | V25-006 | P0 | submit 防重复点击 | behavior.js | 待实现 |
| 2 | V25-007 | P0 | submit 成功后双 render 闪烁 | behavior.js | 待实现 |
| 3 | V25-008 | P0 | repeatLast 预填充 DOM 时序问题 | behavior.js | 待实现 |
| 4 | V25-009 | P0 | selectShortcut/repeatLast 找不到行为时半选中状态 | behavior.js | 待实现 |
| 5 | V25-010 | P0 | submitCustom 防重复点击 | behavior.js | 待实现 |
| 6 | V25-038 | P1 | Tab bar 渲染逻辑重复 | behavior.js | 待实现 |
| 7 | V25-039 | P1 | 提交按钮触控区域不足 44px | style.css | 待实现 |
| 8 | V25-040 | P1 | 快捷按钮触控区域偏小 | style.css | 待实现 |
| 9 | V25-041 | P1 | 移动端键盘遮挡提交按钮 | behavior.js | 待实现 |
| 10 | V25-042 | P1 | 行为选择后无自动滚动引导（合并至 V25-041） | behavior.js | 待实现 |
| 11 | V25-043 | P1 | 月历切换时空白闪烁 | behavior.js | 待实现 |
| 12 | V25-044 | P1 | 日历格子点击区域过小 | behavior.js | 待实现 |
| 13 | V25-045 | P1 | 快捷行为区域无滚动引导 | behavior.js, style.css | 待实现 |
| 14 | V25-046 | P1 | 缺少快捷一键打卡按钮 | behavior.js | 待实现 |
| 15 | V25-047 | P1 | 身体健康类别子分类未默认展开 | behavior.js | 待实现 |
| 16 | V25-081 | P2 | 加载失败时页面空白无引导 | behavior.js | 待实现 |
| 17 | V25-082 | P2 | 备注输入框 placeholder 缺乏引导 | behavior.js | 待实现 |
| 18 | V25-083 | P2 | 最近记录加载失败静默吞错 | behavior.js | 待实现 |
| 19 | FB-U13 | Bug | 重复上次行为点击无反应（随 V25-008 修复） | behavior.js | 待实现 |

> **注意**：V25-038/043/044 相关的「历史 tab 月历视图改为周报形式」需要单独策划设计，本次指令不包含周报改造，仅做 tab bar 抽取、月历切换优化和日历格子触控优化。周报改造将在策划设计完成后单独出指令。

---

## 详细修改指令


### 1. V25-006：submit 防重复点击

**优先级**：P0
**文件**：`public/js/pages/behavior.js`

**步骤 A — 添加状态标志位**

在对象顶部属性区（行 8 附近，`showCustomForm: false,` 之后）添加：

```js
  submitting: false, // V25-006 - submit 防重复点击
```

**步骤 B — 修改 renderInputForm() 中的提交按钮（行 274）**

修改前：
```js
        <button class="btn btn-primary" onclick="BehaviorPage.submit()">
          ${b.template === 'checkin' ? '打卡' : '提交'}
        </button>
```

修改后：
```js
        <button class="btn btn-primary" id="submit-btn" onclick="BehaviorPage.submit()">
          ${b.template === 'checkin' ? '打卡' : '提交'}
        </button>
```

**步骤 C — 修改 submit() 方法（行 593-638）**

修改前（行 593-595）：
```js
  async submit() {
    const b = this.selectedBehavior;
    if (!b || !this.selectedCategory) return;
```

修改后：
```js
  async submit() {
    if (this.submitting) return; // V25-006 - 防重复点击
    const b = this.selectedBehavior;
    if (!b || !this.selectedCategory) return;

    // V25-006 - 设置提交中状态
    this.submitting = true;
    const submitBtn = document.getElementById('submit-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = '提交中…';
    }
```

修改前（行 636-638，submit 方法结尾）：
```js
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },
```

修改后：
```js
    } catch (e) {
      App.toast(e.message, 'error');
    } finally {
      // V25-006 - 恢复按钮状态
      this.submitting = false;
      const submitBtn = document.getElementById('submit-btn');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = this.selectedBehavior?.template === 'checkin' ? '打卡' : '提交';
      }
    }
  },
```

---

### 2. V25-007：submit 成功后双 render 闪烁

**优先级**：P0
**文件**：`public/js/pages/behavior.js`

**修改 submit() 方法中的成功处理逻辑（行 616-635）**

修改前：
```js
    try {
      const result = await API.post('/behavior', body);
      const item = result.item;
      const attrNameMap = {
        physique: '体魄', comprehension: '悟性', willpower: '心性', dexterity: '灵巧', perception: '神识',
      };
      App.toast(`获得 ${item.name}（${item.quality}）+${item.temp_value}临时${attrNameMap[item.attribute_type] || item.attribute_type}`, 'success');
      this.selectedBehavior = null;

      // V2-F01 FB-05 - 上报成功后刷新快捷入口数据
      Promise.all([
        API.get('/behavior/shortcuts'),
        API.get('/behavior/last'),
      ]).then(([shortcuts, lastBehavior]) => {
        this.shortcuts = shortcuts;
        this.lastBehavior = lastBehavior;
        this.render();
      }).catch(() => {});

      this.render();
```

修改后：
```js
    try {
      const result = await API.post('/behavior', body);
      const item = result.item;
      const attrNameMap = {
        physique: '体魄', comprehension: '悟性', willpower: '心性', dexterity: '灵巧', perception: '神识',
      };
      App.toast(`获得 ${item.name}（${item.quality}）+${item.temp_value}临时${attrNameMap[item.attribute_type] || item.attribute_type}`, 'success');
      this.selectedBehavior = null;

      // V25-007 - 先 await 刷新快捷入口数据，再统一 render 一次（消除双 render 闪烁）
      try {
        const [shortcuts, lastBehavior] = await Promise.all([
          API.get('/behavior/shortcuts'),
          API.get('/behavior/last'),
        ]);
        this.shortcuts = shortcuts;
        this.lastBehavior = lastBehavior;
      } catch (_) {
        // 快捷数据刷新失败不影响主流程
      }

      this.render();
```

关键变化：将 `Promise.all(...).then(...)` 改为 `await Promise.all(...)`，删除原行 635 的 `this.render()`，只在 await 完成后统一 render 一次。

---


### 3. V25-008：repeatLast 预填充 DOM 时序问题

**优先级**：P0
**文件**：`public/js/pages/behavior.js`
**附带修复**：FB-U13（重复上次行为点击无反应）根因相同，随本条一并修复。

**修改 repeatLast() 方法中的预填充逻辑（行 452-464）**

修改前：
```js
    // V2-F01 FB-05 - 预填充上次数值
    if (last.duration) {
      const el = document.getElementById('behavior-duration');
      if (el) el.value = last.duration;
    }
    if (last.quantity) {
      const el = document.getElementById('behavior-quantity');
      if (el) el.value = last.quantity;
    }
    if (last.description) {
      const el = document.getElementById('behavior-desc');
      if (el) el.value = last.description;
    }
```

修改后：
```js
    // V25-008 - 用 requestAnimationFrame 确保 DOM 更新完成后再预填充
    // 同时修复 FB-U13（重复上次行为点击无反应）
    requestAnimationFrame(() => {
      if (last.duration) {
        const el = document.getElementById('behavior-duration');
        if (el) el.value = last.duration;
      }
      if (last.quantity) {
        const el = document.getElementById('behavior-quantity');
        if (el) el.value = last.quantity;
      }
      if (last.description) {
        const el = document.getElementById('behavior-desc');
        if (el) el.value = last.description;
      }
    });
```

原因：`this.render()` 通过 `innerHTML` 赋值后，浏览器可能尚未完成 DOM 更新。`requestAnimationFrame` 确保回调在下一帧渲染前执行，此时 DOM 已就绪。

---

### 4. V25-009：selectShortcut/repeatLast 找不到行为时半选中状态

**优先级**：P0
**文件**：`public/js/pages/behavior.js`

**步骤 A — 修改 selectShortcut() 中的 if (!behavior) 分支（行 412-416）**

修改前：
```js
    if (!behavior) {
      App.toast('该行为已不存在，请手动选择', 'error');
      this.selectedBehavior = null;
      this.render();
      return;
    }
```

修改后：
```js
    if (!behavior) {
      App.toast('该行为已不存在，请手动选择', 'error');
      // V25-009 - 完整重置选择状态，避免半选中
      this.selectedCategory = null;
      this.selectedSubCategory = null;
      this.selectedBehavior = null;
      this.render();
      return;
    }
```

**步骤 B — 修改 repeatLast() 中的 if (!behavior) 分支（行 442-446）**

修改前：
```js
    if (!behavior) {
      App.toast('该行为已不存在，请手动选择', 'error');
      this.selectedBehavior = null;
      this.render();
      return;
    }
```

修改后：
```js
    if (!behavior) {
      App.toast('该行为已不存在，请手动选择', 'error');
      // V25-009 - 完整重置选择状态，避免半选中
      this.selectedCategory = null;
      this.selectedSubCategory = null;
      this.selectedBehavior = null;
      this.render();
      return;
    }
```

---

### 5. V25-010：submitCustom 防重复点击

**优先级**：P0
**文件**：`public/js/pages/behavior.js`

**步骤 A — 添加状态标志位**

在对象顶部属性区（紧跟 V25-006 添加的 `submitting: false,` 之后）添加：

```js
  submittingCustom: false, // V25-010 - submitCustom 防重复点击
```

**步骤 B — 修改 renderCustomForm() 中的保存按钮（行 328）**

修改前：
```js
          <button class="btn btn-primary" onclick="BehaviorPage.submitCustom()">保存</button>
```

修改后：
```js
          <button class="btn btn-primary" id="submit-custom-btn" onclick="BehaviorPage.submitCustom()">保存</button>
```

**步骤 C — 修改 submitCustom() 方法（行 498-591）**

在方法开头（行 499，`if (!this.selectedCategory) return;` 之后）添加防重复检查：

修改前：
```js
  async submitCustom() {
    if (!this.selectedCategory) return;

    const name = (document.getElementById('custom-name')?.value || '').trim();
```

修改后：
```js
  async submitCustom() {
    if (!this.selectedCategory) return;
    if (this.submittingCustom) return; // V25-010 - 防重复点击

    // V25-010 - 设置提交中状态
    this.submittingCustom = true;
    const customBtn = document.getElementById('submit-custom-btn');
    if (customBtn) {
      customBtn.disabled = true;
      customBtn.textContent = '保存中…';
    }

    const name = (document.getElementById('custom-name')?.value || '').trim();
```

在方法最末尾（行 591 的 `},` 之前）添加 finally 块。需要将现有的两个 try-catch 包裹在一个外层 try-finally 中：

修改前（方法末尾结构）：
```js
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },
```

修改后：
```js
    } catch (e) {
      App.toast(e.message, 'error');
    } finally {
      // V25-010 - 恢复按钮状态
      this.submittingCustom = false;
      const customBtn = document.getElementById('submit-custom-btn');
      if (customBtn) {
        customBtn.disabled = false;
        customBtn.textContent = '保存';
      }
    }
  },
```

注意：submitCustom 内部有两段 try-catch（行 547-562 和行 564-590）。finally 块应加在第二段 try-catch 之后，即整个方法的最外层。建议将两段 try-catch 合并为一个外层 try 包裹，或在第二段 catch 之后直接加 finally。最简方案是在现有第二段 `catch (e)` 之后追加 `finally` 块。

---


### 6. V25-038：Tab bar 渲染逻辑重复

**优先级**：P1
**文件**：`public/js/pages/behavior.js`

三处硬编码了相同的 tab bar HTML：render() 行 51-60、loadHistory() 行 660-665、selectDate() 行 679-684。抽取为独立方法，统一调用。

**步骤 A — 新增 renderTabBar() 方法**

在 `render()` 方法之前（行 46 附近）添加：

```js
  // V25-038 - 抽取 tab bar 渲染，消除三处重复
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

**步骤 B — 修改 render() 中的 tabBar 变量（行 51-60）**

修改前：
```js
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
```

修改后：
```js
    const tabBar = this.renderTabBar(); // V25-038
```

**步骤 C — 修改 loadHistory() 中的硬编码 tab bar（行 659-666）**

修改前：
```js
        el.innerHTML = `
          <div style="display:flex;gap:0;margin-bottom:12px;border-bottom:1px solid var(--border)">
            <button class="btn btn-small btn-secondary" style="border-radius:6px 0 0 0"
              onclick="BehaviorPage.switchTab('report')">上报</button>
            <button class="btn btn-small btn-primary" style="border-radius:0 6px 0 0"
              onclick="BehaviorPage.switchTab('history')">历史</button>
          </div>
        ` + this.renderHistory();
```

修改后：
```js
        el.innerHTML = this.renderTabBar() + this.renderHistory(); // V25-038
```

**步骤 D — 修改 selectDate() 中的硬编码 tab bar（行 678-685）**

修改前：
```js
      el.innerHTML = `
        <div style="display:flex;gap:0;margin-bottom:12px;border-bottom:1px solid var(--border)">
          <button class="btn btn-small btn-secondary" style="border-radius:6px 0 0 0"
            onclick="BehaviorPage.switchTab('report')">上报</button>
          <button class="btn btn-small btn-primary" style="border-radius:0 6px 0 0"
            onclick="BehaviorPage.switchTab('history')">历史</button>
        </div>
      ` + this.renderHistory();
```

修改后：
```js
      el.innerHTML = this.renderTabBar() + this.renderHistory(); // V25-038
```

---

### 7. V25-039：提交按钮触控区域不足 44px

**优先级**：P1
**文件**：`public/css/style.css`

**修改 .btn 样式（行 91-102）**

修改前：
```css
.btn {
  display: inline-block;
  padding: 10px 20px;
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
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
  width: 100%;
}
```

---

### 8. V25-040：快捷按钮触控区域偏小

**优先级**：P1
**文件**：`public/css/style.css`

**修改 .btn-small 样式（行 109）**

修改前：
```css
.btn-small { padding: 6px 12px; font-size: 12px; width: auto; }
```

修改后：
```css
.btn-small { padding: 8px 14px; min-height: 36px; font-size: 12px; width: auto; } /* V25-040 - 增大快捷按钮触控区域 */
```

---


### 9. V25-041 + V25-042：移动端键盘遮挡提交按钮 / 行为选择后无自动滚动引导

**优先级**：P1
**文件**：`public/js/pages/behavior.js`

V25-042 与 V25-041 合并处理，使用同一个 scrollIntoView 逻辑。

**步骤 A — 修改 renderInputForm() 给外层 card 加 id（行 267）**

修改前：
```js
    return `
      <div class="card">
        <div class="card-title">${e(b.name)} ${b.template === 'checkin' ? '（打卡）' : ''}</div>
```

修改后：
```js
    return `
      <div class="card" id="input-form-card">
        <div class="card-title">${e(b.name)} ${b.template === 'checkin' ? '（打卡）' : ''}</div>
```

**步骤 B — 修改 selectBehavior() 添加自动滚动（行 377-380）**

修改前：
```js
  selectBehavior(behavior) {
    this.selectedBehavior = behavior;
    this.render();
  },
```

修改后：
```js
  selectBehavior(behavior) {
    this.selectedBehavior = behavior;
    this.render();
    // V25-041/042 - 选中行为后自动滚动到输入表单，解决键盘遮挡和滚动引导
    requestAnimationFrame(() => {
      document.getElementById('input-form-card')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  },
```

---

### 10. V25-043：月历切换时空白闪烁

**优先级**：P1
**文件**：`public/js/pages/behavior.js`

**修改 navMonth() 方法（行 690-696）**

修改前：
```js
  navMonth(year, month) {
    this.historyYear = year;
    this.historyMonth = month;
    this.historyData = null;
    this.selectedDate = null;
    this.render();
  },
```

修改后：
```js
  // V25-043 - 月历切换时保留旧数据，避免空白闪烁
  navMonth(year, month) {
    this.historyYear = year;
    this.historyMonth = month;
    // V25-043 - 不再置空 historyData，保留旧数据显示
    // this.historyData = null;
    this.selectedDate = null;
    this.render();
    // loadHistory() 完成后会自然替换数据并重新渲染
  },
```

说明：删除 `this.historyData = null` 这一行。切换月份时保留上个月的数据显示，loadHistory() 在 render() 中被调用（行 64），加载完成后会用新数据重新渲染，实现无缝切换。

---

### 11. V25-044：日历格子点击区域过小

**优先级**：P1
**文件**：`public/js/pages/behavior.js`

**修改 renderHistory() 中日历格子的样式（行 168-175）**

修改前：
```js
      cells += `
        <div onclick="BehaviorPage.selectDate('${dateStr}')"
          style="text-align:center;padding:6px 2px;border-radius:6px;cursor:pointer;font-size:13px;
                 background:${isSelected ? 'var(--primary)' : hasBehavior ? 'var(--primary-dim, #e8f4ff)' : 'transparent'};
                 color:${isSelected ? '#fff' : 'inherit'};
                 font-weight:${hasBehavior ? '600' : '400'}">
          ${d}
        </div>`;
```

修改后：
```js
      // V25-044 - 增大日历格子点击区域
      cells += `
        <div onclick="BehaviorPage.selectDate('${dateStr}')"
          style="min-width:36px;min-height:36px;display:flex;align-items:center;justify-content:center;
                 border-radius:6px;cursor:pointer;font-size:13px;
                 background:${isSelected ? 'var(--primary)' : hasBehavior ? 'var(--primary-dim, #e8f4ff)' : 'transparent'};
                 color:${isSelected ? '#fff' : 'inherit'};
                 font-weight:${hasBehavior ? '600' : '400'}">
          ${d}
        </div>`;
```

关键变化：`padding:6px 2px` 和 `text-align:center` 替换为 `min-width:36px;min-height:36px;display:flex;align-items:center;justify-content:center`，确保每个格子至少 36x36px 的点击区域。

---


### 12. V25-045：快捷行为区域无滚动引导

**优先级**：P1
**文件**：`public/js/pages/behavior.js`, `public/css/style.css`

当快捷行为超过 4 个时，改为横向滚动并添加右侧渐变遮罩提示。

**步骤 A — 修改 renderShortcuts() 中的快捷按钮容器（行 228）**

修改前：
```js
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px">
          ${hasShortcuts ? this.shortcuts.map((s, idx) => `
          <button class="btn btn-small btn-secondary"
            onclick="BehaviorPage.selectShortcut(${idx})">
            ${e(s.sub_type)}
          </button>
        `).join('') : ''}
        </div>
```

修改后：
```js
        <div class="shortcuts-scroll-container" style="display:flex;gap:8px;margin-bottom:8px;${hasShortcuts && this.shortcuts.length > 4 ? 'overflow-x:auto;flex-wrap:nowrap;padding-bottom:4px' : 'flex-wrap:wrap'}">
          ${hasShortcuts ? this.shortcuts.map((s, idx) => `
          <button class="btn btn-small btn-secondary" style="${hasShortcuts && this.shortcuts.length > 4 ? 'flex-shrink:0' : ''}"
            onclick="BehaviorPage.selectShortcut(${idx})">
            ${e(s.sub_type)}
          </button>
        `).join('') : ''}
        </div>
```

**步骤 B — 在 style.css 中添加渐变遮罩样式**

在 `.btn-small` 样式之后（行 109 之后）添加：

```css
/* V25-045 - 快捷行为横向滚动渐变遮罩 */
.shortcuts-scroll-container {
  position: relative;
}
.shortcuts-scroll-container::-webkit-scrollbar {
  height: 3px;
}
.shortcuts-scroll-container::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}
```

同时在 renderShortcuts() 的外层 card 中，当快捷行为 > 4 个时，给容器加一个父级 wrapper 实现右侧渐变：

在 `<div class="card" style="margin-bottom:12px">` 之后、快捷按钮容器之前，包裹一层：

修改前（行 226-235 整体结构）：
```js
    return `
      <div class="card" style="margin-bottom:12px">
        <div class="card-title">常用行为</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px">
```

修改后：
```js
    return `
      <div class="card" style="margin-bottom:12px">
        <div class="card-title">常用行为</div>
        <div style="position:relative">
          <div class="shortcuts-scroll-container" style="display:flex;gap:8px;margin-bottom:8px;${hasShortcuts && this.shortcuts.length > 4 ? 'overflow-x:auto;flex-wrap:nowrap;padding-bottom:4px' : 'flex-wrap:wrap'}">
            ${hasShortcuts ? this.shortcuts.map((s, idx) => `
            <button class="btn btn-small btn-secondary" style="${hasShortcuts && this.shortcuts.length > 4 ? 'flex-shrink:0' : ''}"
              onclick="BehaviorPage.selectShortcut(${idx})">
              ${e(s.sub_type)}
            </button>
          `).join('') : ''}
          </div>
          ${hasShortcuts && this.shortcuts.length > 4 ? '<div style="position:absolute;right:0;top:0;bottom:4px;width:24px;background:linear-gradient(to right,transparent,var(--bg-card));pointer-events:none"></div>' : ''}
        </div>
```

同时修改闭合标签，确保 `</div>` 数量匹配。完整的 renderShortcuts() 修改后：

```js
  renderShortcuts() {
    const hasShortcuts = this.shortcuts && this.shortcuts.length > 0;
    const hasLast = !!this.lastBehavior;
    if (!hasShortcuts && !hasLast) return '';

    const e = API.escapeHtml.bind(API);
    const scrollable = hasShortcuts && this.shortcuts.length > 4;
    return `
      <div class="card" style="margin-bottom:12px">
        <div class="card-title">常用行为</div>
        <div style="position:relative">
          <div class="shortcuts-scroll-container" style="display:flex;gap:8px;margin-bottom:8px;${scrollable ? 'overflow-x:auto;flex-wrap:nowrap;padding-bottom:4px' : 'flex-wrap:wrap'}">
            ${hasShortcuts ? this.shortcuts.map((s, idx) => `
              <button class="btn btn-small btn-secondary" style="${scrollable ? 'flex-shrink:0' : ''}"
                onclick="BehaviorPage.selectShortcut(${idx})">
                ${e(s.sub_type)}
              </button>
            `).join('') : ''}
          </div>
          ${scrollable ? '<div style="position:absolute;right:0;top:0;bottom:4px;width:24px;background:linear-gradient(to right,transparent,var(--bg-card));pointer-events:none"></div>' : ''}
        </div>
        ${hasLast ? `
          <button class="btn btn-small btn-secondary" onclick="BehaviorPage.repeatLast()">
            🔁 重复上次：${e(this.lastBehavior.sub_type)}
          </button>
        ` : ''}
      </div>
    `;
  },
```

---

### 13. V25-046：缺少快捷一键打卡按钮

**优先级**：P1
**文件**：`public/js/pages/behavior.js`

对 template === 'checkin' 的快捷行为，按钮改为直接提交，不跳转选择流程。

**步骤 A — 修改 renderShortcuts() 中的快捷按钮渲染**

在上一步（V25-045）修改后的 renderShortcuts() 中，将 shortcuts.map 部分改为根据 template 区分：

修改前（V25-045 修改后的 map 部分）：
```js
            ${hasShortcuts ? this.shortcuts.map((s, idx) => `
              <button class="btn btn-small btn-secondary" style="${scrollable ? 'flex-shrink:0' : ''}"
                onclick="BehaviorPage.selectShortcut(${idx})">
                ${e(s.sub_type)}
              </button>
            `).join('') : ''}
```

修改后：
```js
            ${hasShortcuts ? this.shortcuts.map((s, idx) => {
              // V25-046 - checkin 类型直接显示一键打卡按钮
              const isCheckin = s.template === 'checkin';
              return `
                <button class="btn btn-small ${isCheckin ? 'btn-success' : 'btn-secondary'}" style="${scrollable ? 'flex-shrink:0' : ''}"
                  onclick="BehaviorPage.${isCheckin ? 'quickSubmit' : 'selectShortcut'}(${idx})">
                  ${isCheckin ? '✓ ' : ''}${e(s.sub_type)}
                </button>
              `;
            }).join('') : ''}
```

**步骤 B — 新增 quickSubmit() 方法**

在 selectShortcut() 方法之后（行 421 附近）添加：

```js
  // V25-046 - 快捷一键打卡（checkin 类型直接提交，不跳转选择流程）
  async quickSubmit(index) {
    const s = this.shortcuts[index];
    if (!s) return;
    if (this.submitting) return; // 复用 V25-006 防重复标志

    this.submitting = true;
    try {
      const body = {
        category: s.category,
        sub_type: s.sub_type,
        description: '',
      };
      if (s.sub_category) {
        body.sub_category = s.sub_category;
      }

      const result = await API.post('/behavior', body);
      const item = result.item;
      const attrNameMap = {
        physique: '体魄', comprehension: '悟性', willpower: '心性', dexterity: '灵巧', perception: '神识',
      };
      App.toast(`打卡成功：${item.name}（${item.quality}）+${item.temp_value}临时${attrNameMap[item.attribute_type] || item.attribute_type}`, 'success');

      // 刷新快捷入口数据
      try {
        const [shortcuts, lastBehavior] = await Promise.all([
          API.get('/behavior/shortcuts'),
          API.get('/behavior/last'),
        ]);
        this.shortcuts = shortcuts;
        this.lastBehavior = lastBehavior;
      } catch (_) {}

      this.render();
    } catch (e) {
      App.toast(e.message, 'error');
    } finally {
      this.submitting = false;
    }
  },
```

注意：quickSubmit 需要 shortcuts 数据中包含 `template` 字段。如果后端 `/behavior/shortcuts` 接口未返回 template，需要同步修改后端在 shortcuts 查询中 JOIN behavior 定义表获取 template。如果后端暂不改，可以退而求其次：在 quickSubmit 中通过 categories 数据查找对应行为的 template 来判断。

---

### 14. V25-047：身体健康类别子分类未默认展开

**优先级**：P1
**文件**：`public/js/pages/behavior.js`

**修改 load() 方法（行 16-31）**

修改前：
```js
  async load() {
    try {
      const [categories, shortcuts, lastBehavior] = await Promise.all([
        this.categories ? Promise.resolve(this.categories) : API.get('/behavior/categories'),
        API.get('/behavior/shortcuts'),
        API.get('/behavior/last'),
      ]);
      this.categories = categories;
      this.shortcuts = shortcuts;
      this.lastBehavior = lastBehavior;
      this.render();
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },
```

修改后：
```js
  async load() {
    try {
      const [categories, shortcuts, lastBehavior] = await Promise.all([
        this.categories ? Promise.resolve(this.categories) : API.get('/behavior/categories'),
        API.get('/behavior/shortcuts'),
        API.get('/behavior/last'),
      ]);
      this.categories = categories;
      this.shortcuts = shortcuts;
      this.lastBehavior = lastBehavior;

      // V25-047 - 从 localStorage 恢复上次选择的 category/subCategory
      if (this.selectedCategory === null) {
        const savedCat = localStorage.getItem('behavior_last_category');
        const savedSub = localStorage.getItem('behavior_last_subcategory');
        if (savedCat && this.categories[savedCat]) {
          this.selectedCategory = savedCat;
          if (this.isGroupedCategory(savedCat)) {
            const subs = Object.keys(this.categories[savedCat]);
            this.selectedSubCategory = (savedSub && subs.includes(savedSub)) ? savedSub : subs[0] || null;
          }
        }
      }

      this.render();
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },
```

同时在 selectCategory() 和 selectSubCategory() 中保存选择到 localStorage：

**修改 selectCategory()（行 340-353）**

在 `this.render();` 之前添加：

```js
    // V25-047 - 记住选择
    localStorage.setItem('behavior_last_category', category);
    if (this.selectedSubCategory) {
      localStorage.setItem('behavior_last_subcategory', this.selectedSubCategory);
    }
```

**修改 selectSubCategory()（行 362-367）**

在 `this.render();` 之前添加：

```js
    // V25-047 - 记住选择
    localStorage.setItem('behavior_last_subcategory', subCategory);
```

---


### 15. V25-081：加载失败时页面空白无引导

**优先级**：P2
**文件**：`public/js/pages/behavior.js`

**修改 load() 方法的 catch 块（行 28-30）**

修改前：
```js
    } catch (e) {
      App.toast(e.message, 'error');
    }
```

修改后：
```js
    } catch (e) {
      App.toast(e.message, 'error');
      // V25-081 - 加载失败时渲染错误提示卡片 + 重试按钮
      const container = document.getElementById('page-behavior');
      if (container) {
        container.innerHTML = `
          <div class="card" style="text-align:center;padding:32px 16px">
            <div style="font-size:16px;margin-bottom:12px;color:var(--text-dim)">加载失败</div>
            <div style="font-size:13px;color:var(--text-dim);margin-bottom:16px">${API.escapeHtml(e.message)}</div>
            <button class="btn btn-primary" style="width:auto;padding:10px 32px" onclick="BehaviorPage.load()">重试</button>
          </div>
        `;
      }
    }
```

---

### 16. V25-082：备注输入框 placeholder 缺乏引导

**优先级**：P2
**文件**：`public/js/pages/behavior.js`

**修改 renderInputForm() 中的备注输入框（行 272）**

修改前：
```js
          <input type="text" id="behavior-desc" placeholder="简单描述一下">
```

修改后：
```js
          <input type="text" id="behavior-desc" placeholder="例如：晚饭后散步30分钟">
```

---

### 17. V25-083：最近记录加载失败静默吞错

**优先级**：P2
**文件**：`public/js/pages/behavior.js`

**修改 loadRecentHistory() 的 catch 块（行 733-735）**

修改前：
```js
    } catch {
      // silently fail
    }
```

修改后：
```js
    } catch {
      // V25-083 - 加载失败时在容器中显示提示
      const el = document.getElementById('behavior-history');
      if (el) {
        el.innerHTML = '<div class="empty-state" style="color:var(--text-dim)">加载失败，请刷新重试</div>';
      }
    }
```

---

### 18. FB-U13：重复上次行为点击无反应

**优先级**：Bug
**文件**：`public/js/pages/behavior.js`

此 bug 根因与 V25-008 相同：`repeatLast()` 中 `this.render()` 后同步读取 DOM，因 innerHTML 赋值后浏览器尚未完成 DOM 更新，导致预填充静默失败，用户感知为"点击无反应"。

**修复方案**：已包含在第 3 条（V25-008）的修复中，用 `requestAnimationFrame` 包裹预填充逻辑。无需额外改动。

---

## 执行顺序建议

建议按以下顺序实施，减少冲突：

1. **先做 P0**（V25-006 → V25-007 → V25-008/FB-U13 → V25-009 → V25-010），这 5 条互相独立，可并行
2. **再做 P1 中的 JS 修改**（V25-038 → V25-041/042 → V25-043 → V25-044 → V25-046 → V25-047），注意 V25-038 的 renderTabBar 抽取会影响行号
3. **V25-045 单独做**，因为它同时改 JS 和 CSS，且对 renderShortcuts() 改动较大
4. **CSS 修改**（V25-039、V25-040）随时可做，与 JS 无冲突
5. **最后做 P2**（V25-081 → V25-082 → V25-083），改动小且独立

## 验收检查清单

- [ ] submit() 连续快速点击只提交一次
- [ ] submit() 成功后页面不闪烁，只渲染一次
- [ ] 点击"重复上次"后输入框正确预填充数值
- [ ] 快捷行为/重复上次找不到行为时，页面回到初始选择状态
- [ ] submitCustom() 连续快速点击只提交一次
- [ ] tab bar 三处渲染一致，无硬编码重复
- [ ] .btn 高度 >= 44px，.btn-small 高度 >= 36px
- [ ] 选中行为后页面自动滚动到输入表单
- [ ] 月历切换时不出现空白闪烁
- [ ] 日历格子点击区域 >= 36x36px
- [ ] 快捷行为 > 4 个时可横向滚动，右侧有渐变提示
- [ ] checkin 类型快捷行为显示一键打卡按钮，点击直接提交
- [ ] 重新进入行为页时恢复上次选择的 category/subCategory
- [ ] load() 失败时显示错误卡片和重试按钮
- [ ] 备注 placeholder 显示"例如：晚饭后散步30分钟"
- [ ] 最近记录加载失败时显示"加载失败，请刷新重试"
