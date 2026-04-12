# Codex 指令：V2.5 背包页交互优化

> 关联策划案：docs/iteration-v2.5.md
> 涉及文件：public/js/pages/inventory.js, public/css/style.css
> 溯源：V25-011~V25-014, V25-048~V25-055, V25-084~V25-087

---

## 修改总览表

| 序号 | 策划编号 | 优先级 | 简述 | 涉及函数/位置 | 状态 |
|------|---------|--------|------|--------------|------|
| 1 | V25-011 | P0 | 合成/兑现按钮无 loading 状态 | synthesize(), redeem() | 待实现 |
| 2 | V25-012 | P0 | 兑现奖励无二次确认 | redeem() | 待实现 |
| 3 | V25-013 | P0 | 合成道具无二次确认 | synthesize() | 待实现 |
| 4 | V25-014 | P0 | 背包加载失败时页面空白 | load() catch | 待实现 |
| 5 | V25-048 | P1 | 选中道具时全量重绘导致闪烁 | toggleItem/selectAll/selectNone | 待实现 |
| 6 | V25-049 | P1 | 合成摘要栏滚动后不可见 | .synth-summary 样式 | 待实现 |
| 7 | V25-050 | P1 | 分类 Tab 横向滚动无指示 | renderItems() tab 容器 | 待实现 |
| 8 | V25-051 | P1 | 道具行点击区域过小 | renderItems() item-row | 待实现 |
| 9 | V25-052 | P1 | 合成规则弹窗无法点击背景关闭 | showSynthesisRule() | 待实现 |
| 10 | V25-053 | P1 | 合成规则弹窗首次弹出时序混乱 | load() setTimeout 300ms | 待实现 |
| 11 | V25-054 | P1 | "浪费 X 点"损耗提示不可见 | renderItems() 损耗提示 | 待实现 |
| 12 | V25-055 | P1 | 切换 Tab/Section 清空行为不一致 | switchSection() | 待实现 |
| 13 | V25-084 | P2 | 奖励列表"发起人"字段含义不清 | renderRewards() | 待实现 |
| 14 | V25-085 | P2 | 已兑现奖励无时间戳 | renderRewards() 已兑现列表 | 待实现 |
| 15 | V25-086 | P2 | 背包为空时引导文案简短 | renderItems() 空状态 | 待实现 |
| 16 | V25-087 | P2 | 非法品质值未过滤 | renderItems()/renderRewards() | 待实现 |

---

## 详细修改指令


### 1. V25-011：合成/兑现按钮无 loading 状态

**优先级**：P0
**文件**：`public/js/pages/inventory.js`

**步骤 A — 添加状态标志位**

在对象顶部属性区（行 7，`activeSection: 'items',` 之后）添加：

```js
  synthesizing: false, // V25-011 - 合成防重复
  redeeming: false,    // V25-011 - 兑现防重复
```

**步骤 B — 修改 synthesize() 方法（行 216-227）**

修改前：
```js
  async synthesize() {
    const ids = [...this.selectedIds];
    if (ids.length === 0) return;

    try {
      const result = await API.post('/items/synthesize', { item_ids: ids });
      App.toast(`合成成功！${result.attribute} +${result.gain}，当前${result.newValue}/${result.cap}`, 'success');
      this.load();
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },
```

修改后：
```js
  async synthesize() {
    const ids = [...this.selectedIds];
    if (ids.length === 0) return;
    if (this.synthesizing) return; // V25-011 - 防重复

    // V25-011 - 设置合成中状态
    this.synthesizing = true;
    const synthBtn = document.querySelector('.synth-summary .btn-primary');
    if (synthBtn) {
      synthBtn.disabled = true;
      synthBtn.textContent = '合成中…';
    }

    try {
      const result = await API.post('/items/synthesize', { item_ids: ids });
      App.toast(`合成成功！${result.attribute} +${result.gain}，当前${result.newValue}/${result.cap}`, 'success');
      this.load();
    } catch (e) {
      App.toast(e.message, 'error');
    } finally {
      // V25-011 - 恢复按钮状态
      this.synthesizing = false;
      const synthBtn = document.querySelector('.synth-summary .btn-primary');
      if (synthBtn) {
        synthBtn.disabled = false;
        synthBtn.textContent = '合成';
      }
    }
  },
```

**步骤 C — 修改 redeem() 方法（行 229-237）**

修改前：
```js
  async redeem(id) {
    try {
      await API.post(`/rewards/${id}/redeem`);
      App.toast('奖励已标记为兑现', 'success');
      this.load();
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },
```

修改后：
```js
  async redeem(id) {
    if (this.redeeming) return; // V25-011 - 防重复

    // V25-011 - 设置兑现中状态
    this.redeeming = true;
    const redeemBtn = document.querySelector(`[onclick="InventoryPage.redeem(${id})"]`);
    if (redeemBtn) {
      redeemBtn.disabled = true;
      redeemBtn.textContent = '兑现中…';
    }

    try {
      await API.post(`/rewards/${id}/redeem`);
      App.toast('奖励已标记为兑现', 'success');
      this.load();
    } catch (e) {
      App.toast(e.message, 'error');
    } finally {
      // V25-011 - 恢复按钮状态
      this.redeeming = false;
      if (redeemBtn) {
        redeemBtn.disabled = false;
        redeemBtn.textContent = '兑现';
      }
    }
  },
```

---

### 2. V25-012：兑现奖励无二次确认

**优先级**：P0
**文件**：`public/js/pages/inventory.js`

**修改 redeem() 方法（在 V25-011 修改后的基础上，行首添加 confirm）**

在 `if (this.redeeming) return;` 之后、`this.redeeming = true;` 之前添加：

```js
    // V25-012 - 兑现前二次确认
    if (!confirm('确认将此奖励标记为已兑现？')) return;
```

完整的 redeem() 方法开头变为：
```js
  async redeem(id) {
    if (this.redeeming) return; // V25-011
    if (!confirm('确认将此奖励标记为已兑现？')) return; // V25-012

    this.redeeming = true;
    // ... 后续同 V25-011
```

---

### 3. V25-013：合成道具无二次确认

**优先级**：P0
**文件**：`public/js/pages/inventory.js`

**修改 synthesize() 方法（在 V25-011 修改后的基础上，添加 confirm）**

在 `if (this.synthesizing) return;` 之后、`this.synthesizing = true;` 之前添加：

```js
    // V25-013 - 合成前二次确认，展示消耗和收益
    const selectedTotal = this.getSelectedTempValue();
    const permanentGain = Math.floor(selectedTotal / 10);
    const waste = selectedTotal - permanentGain * 10;
    const confirmMsg = `将消耗 ${ids.length} 件道具（总值${selectedTotal.toFixed(1)}），获得 +${permanentGain} 永久属性${waste > 0 ? `，浪费${waste.toFixed(1)}点` : ''}，确认合成？`;
    if (!confirm(confirmMsg)) return;
```

完整的 synthesize() 方法开头变为：
```js
  async synthesize() {
    const ids = [...this.selectedIds];
    if (ids.length === 0) return;
    if (this.synthesizing) return; // V25-011

    // V25-013 - 合成前二次确认
    const selectedTotal = this.getSelectedTempValue();
    const permanentGain = Math.floor(selectedTotal / 10);
    const waste = selectedTotal - permanentGain * 10;
    const confirmMsg = `将消耗 ${ids.length} 件道具（总值${selectedTotal.toFixed(1)}），获得 +${permanentGain} 永久属性${waste > 0 ? `，浪费${waste.toFixed(1)}点` : ''}，确认合成？`;
    if (!confirm(confirmMsg)) return;

    this.synthesizing = true;
    // ... 后续同 V25-011
```

---

### 4. V25-014：背包加载失败时页面空白

**优先级**：P0
**文件**：`public/js/pages/inventory.js`

**修改 load() 方法的 catch 块（行 30-32）**

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
      // V25-014 - 加载失败时渲染错误占位页 + 重试按钮
      const container = document.getElementById('page-inventory');
      if (container) {
        container.innerHTML = `
          <div class="page-header">背包</div>
          <div class="card" style="text-align:center;padding:32px 16px">
            <div style="font-size:16px;margin-bottom:12px;color:var(--text-dim)">加载失败</div>
            <div style="font-size:13px;color:var(--text-dim);margin-bottom:16px">${API.escapeHtml(e.message)}</div>
            <button class="btn btn-primary" style="width:auto;padding:10px 32px" onclick="InventoryPage.load()">重试</button>
          </div>
        `;
      }
    }
```

---

### 5. V25-048：选中道具时全量重绘导致闪烁

**优先级**：P1
**文件**：`public/js/pages/inventory.js`

当前 toggleItem()、selectAll()、selectNone() 都调用 render()，导致整个页面 innerHTML 重写，checkbox 状态变化时产生明显闪烁。改为局部 DOM 更新。

**步骤 A — 新增 updateSynthSummary() 方法**

在 getSelectedTempValue() 方法之后（行 214 附近）添加：

```js
  // V25-048 - 局部更新合成摘要栏，避免全量重绘
  updateSynthSummary() {
    const selectedTotal = this.getSelectedTempValue();
    const permanentGain = Math.floor(selectedTotal / 10);

    // 更新或移除合成摘要栏
    let summary = document.querySelector('.synth-summary');
    if (this.selectedIds.size === 0) {
      if (summary) summary.remove();
      return;
    }

    const summaryHtml = `
      <div class="synth-info">
        已选${this.selectedIds.size}件 · 总值${selectedTotal.toFixed(1)}
        ${permanentGain > 0 ? `<br><span class="synth-gain">可合成 +${permanentGain}点永久属性</span>` : `<br><span style="color:var(--red)">不足10点，无法合成</span>`}
        ${selectedTotal % 10 > 0 && permanentGain > 0 ? `<br><span style="font-size:13px;color:var(--gold)">浪费${(selectedTotal - permanentGain * 10).toFixed(1)}点</span>` : ''}
      </div>
      <button class="btn btn-primary btn-small" ${permanentGain < 1 ? 'disabled' : ''}
        onclick="InventoryPage.synthesize()" style="width:80px">合成</button>
    `;

    if (summary) {
      summary.innerHTML = summaryHtml;
    } else {
      // 摘要栏不存在时需要创建并插入
      summary = document.createElement('div');
      summary.className = 'synth-summary';
      summary.innerHTML = summaryHtml;
      document.getElementById('inventory-content')?.appendChild(summary);
    }
  },
```

**步骤 B — 修改 toggleItem()（行 189-193）**

修改前：
```js
  toggleItem(id) {
    if (this.selectedIds.has(id)) this.selectedIds.delete(id);
    else this.selectedIds.add(id);
    this.render();
  },
```

修改后：
```js
  toggleItem(id) {
    if (this.selectedIds.has(id)) this.selectedIds.delete(id);
    else this.selectedIds.add(id);
    // V25-048 - 局部更新 checkbox + 摘要栏
    const checkbox = document.querySelector(`.item-check[onchange="InventoryPage.toggleItem(${id})"]`);
    if (checkbox) checkbox.checked = this.selectedIds.has(id);
    this.updateSynthSummary();
  },
```

**步骤 C — 修改 selectAll()（行 195-201）**

修改前：
```js
  selectAll() {
    if (!this.activeTab || !this.grouped[this.activeTab]) return;
    for (const item of this.grouped[this.activeTab].items) {
      this.selectedIds.add(item.id);
    }
    this.render();
  },
```

修改后：
```js
  selectAll() {
    if (!this.activeTab || !this.grouped[this.activeTab]) return;
    for (const item of this.grouped[this.activeTab].items) {
      this.selectedIds.add(item.id);
    }
    // V25-048 - 局部更新所有 checkbox + 摘要栏
    document.querySelectorAll('.item-check').forEach(cb => cb.checked = true);
    this.updateSynthSummary();
  },
```

**步骤 D — 修改 selectNone()（行 203-206）**

修改前：
```js
  selectNone() {
    this.selectedIds.clear();
    this.render();
  },
```

修改后：
```js
  selectNone() {
    this.selectedIds.clear();
    // V25-048 - 局部更新所有 checkbox + 摘要栏
    document.querySelectorAll('.item-check').forEach(cb => cb.checked = false);
    this.updateSynthSummary();
  },
```

---

### 6. V25-049：合成摘要栏滚动后不可见

**优先级**：P1
**文件**：`public/css/style.css`

当前 `.synth-summary` 跟随文档流，道具列表较长时滚动后摘要栏不可见。改为吸底固定。

**修改 .synth-summary 样式**

修改前（如果已有 `.synth-summary` 样式）：
```css
.synth-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  /* ... 其他样式 */
}
```

修改后：
```css
/* V25-049 - 合成摘要栏吸底固定 */
.synth-summary {
  position: fixed;
  bottom: 70px;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--bg-card);
  border-top: 1px solid var(--border);
  box-shadow: 0 -2px 8px rgba(0,0,0,0.1);
  z-index: 100;
}
```

如果 style.css 中尚无 `.synth-summary` 样式定义，则在底部导航栏样式附近新增上述样式块。

同时需要修改 `renderItems()` 中的 synth-summary HTML（行 157-167），将其从 renderItems 返回值中移出，改为独立渲染。但考虑到 V25-048 已经将摘要栏改为动态管理，此处只需确保 renderItems() 中仍然输出初始的 synth-summary div，CSS 负责定位即可。

---

### 7. V25-050：分类 Tab 横向滚动无指示

**优先级**：P1
**文件**：`public/js/pages/inventory.js`

**修改 renderItems() 中 tab 容器样式（行 118）**

修改前：
```js
        <div style="display:flex;gap:8px;margin-bottom:12px;overflow-x:auto;flex-wrap:nowrap">
```

修改后：
```js
        <div style="display:flex;gap:8px;margin-bottom:12px;overflow-x:auto;flex-wrap:nowrap;position:relative">
```

当前代码已有 `overflow-x:auto;flex-wrap:nowrap`，只需添加右侧渐变遮罩。在 tab 容器的闭合 `</div>` 之后添加遮罩元素。

修改前（行 118-125 整体结构）：
```js
        <div style="display:flex;gap:8px;margin-bottom:12px;overflow-x:auto;flex-wrap:nowrap">
          ${tabs.map((t, idx) => `
            <button class="btn btn-small ${this.activeTab === t ? 'btn-primary' : 'btn-secondary'}"
              onclick="InventoryPage.switchTabByIndex(${idx})" style="white-space:nowrap">
              ${e(this.grouped[t].name)}(${this.grouped[t].items.length})
            </button>
          `).join('')}
        </div>
```

修改后：
```js
        <div style="position:relative">
          <div style="display:flex;gap:8px;margin-bottom:12px;overflow-x:auto;flex-wrap:nowrap;padding-bottom:4px">
            ${tabs.map((t, idx) => `
              <button class="btn btn-small ${this.activeTab === t ? 'btn-primary' : 'btn-secondary'}"
                onclick="InventoryPage.switchTabByIndex(${idx})" style="white-space:nowrap;flex-shrink:0">
                ${e(this.grouped[t].name)}(${this.grouped[t].items.length})
              </button>
            `).join('')}
          </div>
          ${tabs.length > 3 ? '<div style="position:absolute;right:0;top:0;bottom:4px;width:24px;background:linear-gradient(to right,transparent,var(--bg-card));pointer-events:none"></div>' : ''}
        </div>
```

关键变化：外层包裹 `position:relative` 容器，tab 按钮加 `flex-shrink:0` 防止压缩，超过 3 个 tab 时右侧显示渐变遮罩提示可滚动。

---

### 8. V25-051：道具行点击区域过小

**优先级**：P1
**文件**：`public/js/pages/inventory.js`

**修改 renderItems() 中 item-row 的渲染（行 139-152）**

修改前：
```js
            ${this.grouped[this.activeTab].items.map(item => `
              <div class="item-row">
                <input type="checkbox" class="item-check"
                  ${this.selectedIds.has(item.id) ? 'checked' : ''}
                  onchange="InventoryPage.toggleItem(${item.id})">
                <div class="item-info" style="margin-left:10px">
                  ${(() => {
                    const q = ['凡品', '良品', '上品', '极品'].includes(item.quality) ? item.quality : '凡品';
                    return `<div class="item-name quality-${q}">${e(item.name)}</div>`;
                  })()}
                  <div class="item-meta">${e(item.quality)} · 临时属性 +${item.temp_value}</div>
                </div>
              </div>
            `).join('')}
```

修改后：
```js
            ${this.grouped[this.activeTab].items.map(item => `
              <div class="item-row" style="min-height:44px;cursor:pointer;display:flex;align-items:center"
                onclick="InventoryPage.toggleItem(${item.id})">
                <input type="checkbox" class="item-check"
                  ${this.selectedIds.has(item.id) ? 'checked' : ''}
                  onchange="event.stopPropagation();InventoryPage.toggleItem(${item.id})">
                <div class="item-info" style="margin-left:10px">
                  ${(() => {
                    const q = ['凡品', '良品', '上品', '极品'].includes(item.quality) ? item.quality : '凡品';
                    return `<div class="item-name quality-${q}">${e(item.name)}</div>`;
                  })()}
                  <div class="item-meta">${e(item.quality)} · 临时属性 +${item.temp_value}</div>
                </div>
              </div>
            `).join('')}
```

关键变化：整行 `item-row` 加 `onclick` 和 `min-height:44px`，checkbox 的 `onchange` 加 `event.stopPropagation()` 防止事件冒泡导致双重触发。

---

### 9. V25-052：合成规则弹窗无法点击背景关闭

**优先级**：P1
**文件**：`public/js/pages/inventory.js`

**修改 showSynthesisRule() 方法（行 274-275 之间）**

修改前（行 274-275）：
```js
    // V2-F02 FB-02
    document.body.appendChild(modal);
```

修改后：
```js
    // V25-052 - 点击遮罩区域关闭弹窗
    modal.onclick = function(event) { if (event.target === this) this.remove(); };
    document.body.appendChild(modal);
```

---

### 10. V25-053：合成规则弹窗首次弹出时序混乱

**优先级**：P1
**文件**：`public/js/pages/inventory.js`

**修改 load() 中的 setTimeout（行 28）**

修改前：
```js
        setTimeout(() => this.showSynthesisRule(), 300);
```

修改后：
```js
        // V25-053 - 用 requestAnimationFrame 替代 setTimeout，确保 DOM 渲染完成后再弹窗
        requestAnimationFrame(() => this.showSynthesisRule());
```

---

### 11. V25-054："浪费 X 点"损耗提示不可见

**优先级**：P1
**文件**：`public/js/pages/inventory.js`

**修改 renderItems() 中损耗提示样式（行 162）**

修改前：
```js
            ${selectedTotal % 10 > 0 && permanentGain > 0 ? `<br><span style="font-size:11px;color:var(--text-dim)">浪费${(selectedTotal - permanentGain * 10).toFixed(1)}点</span>` : ''}
```

修改后：
```js
            ${selectedTotal % 10 > 0 && permanentGain > 0 ? `<br><span style="font-size:13px;color:var(--gold)">浪费${(selectedTotal - permanentGain * 10).toFixed(1)}点</span>` : ''}
```

关键变化：`font-size:11px` → `13px`，`color:var(--text-dim)` → `var(--gold)`，提升可读性和警示感。

注意：V25-048 新增的 `updateSynthSummary()` 方法中也包含损耗提示的 HTML，该方法中已使用修改后的样式（`font-size:13px;color:var(--gold)`），无需额外修改。

---

### 12. V25-055：切换 Tab/Section 清空行为不一致

**优先级**：P1
**文件**：`public/js/pages/inventory.js`

当前 `switchTab()` 会清空 `selectedIds`，但 `switchSection()` 不会，导致从"奖励"切回"道具"时残留旧选中状态。

**修改 switchSection() 方法（行 171-174）**

修改前：
```js
  switchSection(section) {
    this.activeSection = section;
    this.render();
  },
```

修改后：
```js
  switchSection(section) {
    this.activeSection = section;
    this.selectedIds.clear(); // V25-055 - 切换 section 时也清空选中
    this.render();
  },
```

---

### 13. V25-084：奖励列表"发起人"字段含义不清

**优先级**：P2
**文件**：`public/js/pages/inventory.js`

**修改 renderRewards() 中待兑现奖励的 meta 行（行 75）**

修改前：
```js
              <div class="item-meta">${e(r.type)} · 难度${r.difficulty}/10 · 发起人${e(r.creator_name)}</div>
```

修改后：
```js
              <div class="item-meta">${e(r.type)} · 难度${r.difficulty}/10 · 由${e(r.creator_name)}发起</div>
```

---

### 14. V25-085：已兑现奖励无时间戳

**优先级**：P2
**文件**：`public/js/pages/inventory.js`

**修改 renderRewards() 中已兑现列表的渲染（行 86-93）**

修改前：
```js
        ${redeemed.map(r => `
          <div class="item-row">
            <div class="item-info">
              <div class="item-name">${e(r.name)}</div>
              <div class="item-meta">🎁 ${e(r.reward_description)}</div>
            </div>
            <span style="font-size:12px;color:var(--green)">已兑现</span>
          </div>
        `).join('')}
```

修改后：
```js
        ${redeemed.map(r => {
          // V25-085 - 显示兑现时间
          const redeemTime = r.redeemed_at ? new Date(r.redeemed_at).toLocaleDateString('zh-CN') : '';
          return `
            <div class="item-row">
              <div class="item-info">
                <div class="item-name">${e(r.name)}</div>
                <div class="item-meta">🎁 ${e(r.reward_description)}</div>
              </div>
              <div style="text-align:right">
                <div style="font-size:12px;color:var(--green)">已兑现</div>
                ${redeemTime ? `<div style="font-size:11px;color:var(--text-dim)">${redeemTime}</div>` : ''}
              </div>
            </div>
          `;
        }).join('')}
```

注意：需要后端在 `/rewards` 接口返回 `redeemed_at` 字段。如果后端已有该字段但未返回，需在查询中加上。如果数据库中无此字段，需要在 rewards 表中添加 `redeemed_at DATETIME` 列，并在兑现接口中写入时间戳。

---

### 15. V25-086：背包为空时引导文案简短

**优先级**：P2
**文件**：`public/js/pages/inventory.js`

**修改 renderItems() 中空状态的渲染（行 102-109）**

修改前：
```js
    if (this.items.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-icon">🎒</div>
          <div>背包空空如也</div>
          <div style="font-size:13px;margin-top:8px">完成行为上报可获得道具</div>
        </div>
      `;
    }
```

修改后：
```js
    if (this.items.length === 0) {
      return `
        <div class="empty-state">
          <div class="empty-icon">🎒</div>
          <div>背包空空如也</div>
          <div style="font-size:13px;margin-top:8px">完成行为上报可获得道具</div>
          <button class="btn btn-small btn-primary" style="margin-top:12px"
            onclick="App.navigate('behavior')">去上报行为 →</button>
        </div>
      `;
    }
```

---

### 16. V25-087：非法品质值未过滤

**优先级**：P2
**文件**：`public/js/pages/inventory.js`

当前 renderItems() 行 146 已有品质 normalize 逻辑，但 renderRewards() 中未做处理。统一在两处添加防御。

**步骤 A — 确认 renderItems() 已有防御（行 145-148）**

当前代码：
```js
                  ${(() => {
                    const q = ['凡品', '良品', '上品', '极品'].includes(item.quality) ? item.quality : '凡品';
                    return `<div class="item-name quality-${q}">${e(item.name)}</div>`;
                  })()}
```

此处已有 normalize，无需修改。

**步骤 B — 新增品质 normalize 工具方法**

在 getSelectedTempValue() 方法之前（行 208 附近）添加：

```js
  // V25-087 - 品质值 normalize，非法值回退"凡品"
  normalizeQuality(quality) {
    const valid = ['凡品', '良品', '上品', '极品'];
    return valid.includes(quality) ? quality : '凡品';
  },
```

**步骤 C — 修改 renderItems() 使用工具方法（行 145-148）**

修改前：
```js
                  ${(() => {
                    const q = ['凡品', '良品', '上品', '极品'].includes(item.quality) ? item.quality : '凡品';
                    return `<div class="item-name quality-${q}">${e(item.name)}</div>`;
                  })()}
```

修改后：
```js
                  <div class="item-name quality-${this.normalizeQuality(item.quality)}">${e(item.name)}</div>
```

**步骤 D — 修改 renderRewards() 添加品质防御**

如果 renderRewards() 中有使用品质值的地方（当前代码中奖励列表未显示品质 class），则在未来扩展时使用 `this.normalizeQuality()` 即可。当前 renderRewards() 无需修改，但工具方法已就位供后续使用。

---

## 执行顺序建议

建议按以下顺序实施，减少冲突：

1. **P0 四条先行**（V25-011 → V25-012 → V25-013 → V25-014）。V25-011 是基础，V25-012/013 在其之上追加 confirm，三者需按序实施。V25-014 独立，可并行。
2. **P1 中先做 V25-048**（局部更新），因为它改变了 toggleItem/selectAll/selectNone 的核心逻辑，后续修改需基于此版本。
3. **P1 其余 JS 修改**（V25-050 → V25-051 → V25-052 → V25-053 → V25-054 → V25-055），这些互相独立，可并行。
4. **P1 CSS 修改**（V25-049）随时可做，与 JS 无冲突。
5. **最后做 P2**（V25-084 → V25-085 → V25-086 → V25-087），改动小且独立。

## 验收检查清单

- [ ] 合成按钮连续快速点击只提交一次，按钮显示"合成中…"
- [ ] 兑现按钮连续快速点击只提交一次，按钮显示"兑现中…"
- [ ] 点击兑现前弹出"确认将此奖励标记为已兑现？"
- [ ] 点击合成前弹出确认框，展示消耗件数、总值、永久属性收益和浪费值
- [ ] load() 失败时显示错误占位页和重试按钮，点击重试可重新加载
- [ ] 勾选/取消勾选道具时页面不闪烁，仅 checkbox 和摘要栏局部更新
- [ ] 全选/取消全选时页面不闪烁
- [ ] 合成摘要栏在页面滚动后仍然可见（吸底固定）
- [ ] 分类 Tab 超过 3 个时可横向滚动，右侧有渐变遮罩
- [ ] 道具行整行可点击切换选中，min-height >= 44px
- [ ] 合成规则弹窗点击遮罩背景可关闭
- [ ] 首次进入背包页弹出合成规则时无时序混乱
- [ ] 损耗提示"浪费 X 点"字号 13px，颜色为 gold
- [ ] 从奖励 tab 切回道具 tab 时，旧选中状态已清空
- [ ] 奖励列表发起人显示为"由 XX 发起"
- [ ] 已兑现奖励显示兑现时间
- [ ] 背包为空时显示"去上报行为 →"按钮，点击跳转行为页
- [ ] 非法品质值（如空字符串、未知值）回退显示为"凡品"
