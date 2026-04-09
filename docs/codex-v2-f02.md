# Codex 任务：V2-F02 道具合成透明化

溯源标注：所有新增/修改代码行尾注释 `// V2-F02 FB-02`

---

## 任务 1：合成规则说明卡片（纯前端）

文件：`public/js/pages/inventory.js`

### 1.1 新增规则说明弹窗方法

在 `InventoryPage` 对象中新增方法 `showSynthGuide()`：

```js
// V2-F02 FB-02
showSynthGuide() {
  const overlay = document.createElement('div');
  overlay.className = 'synth-guide-overlay';
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = `
    <div class="synth-guide-card">
      <div class="synth-guide-title">⚗️ 合成规则说明</div>
      <div class="synth-guide-body">
        <p>1. 每 <b>10点</b> 临时属性值可合成 <b>1点</b> 永久属性</p>
        <p>2. 只能合成 <b>同属性类型</b> 的道具</p>
        <p>3. 不足10点的零头会被 <b>浪费</b>（例如选了25点，获得2点永久，浪费5点）</p>
        <p>4. 永久属性受当前境界上限限制，突破后可继续提升</p>
        <p>5. 合成后道具变为「已转化」状态，不会凭空消失</p>
      </div>
      <button class="btn btn-primary btn-small" onclick="this.closest('.synth-guide-overlay').remove()">我知道了</button>
    </div>
  `;
  document.body.appendChild(overlay);
},
```

### 1.2 首次进入自动弹出

在 `renderItems()` 方法末尾（return 之前），加入首次弹出逻辑：

```js
// V2-F02 FB-02 - 首次进入合成页弹出规则说明
if (!localStorage.getItem('synth_guide_shown')) {
  setTimeout(() => {
    this.showSynthGuide();
    localStorage.setItem('synth_guide_shown', '1');
  }, 300);
}
```

### 1.3 在道具背包标题旁加"规则说明"按钮

在 `renderItems()` 中，找到：
```js
<div class="card-title">道具背包 <span style="font-size:13px;color:var(--text-dim)">共${this.items.length}件</span></div>
```

改为：
```js
<div class="card-title">
  道具背包 <span style="font-size:13px;color:var(--text-dim)">共${this.items.length}件</span>
  <button class="btn btn-small btn-secondary" style="margin-left:8px;font-size:11px;padding:2px 8px"
    onclick="InventoryPage.showSynthGuide()">📖 合成规则</button>
</div>
```

---

## 任务 2：属性分组标注"当前可合成X点永久属性"（纯前端）

文件：`public/js/pages/inventory.js`

在 `renderItems()` 中，找到当前分组卡片的标题区域：

```js
<div class="card-title" style="margin-bottom:10px">
  ${e(this.grouped[this.activeTab].name)}
  <span style="font-size:12px;color:var(--text-dim);margin-left:8px">
    临时属性值总计：${this.grouped[this.activeTab].totalTempValue.toFixed(1)}
  </span>
</div>
```

替换为：

```js
// V2-F02 FB-02 - 标注当前可合成永久属性点数
<div class="card-title" style="margin-bottom:10px">
  ${e(this.grouped[this.activeTab].name)}
  <span style="font-size:12px;color:var(--text-dim);margin-left:8px">
    临时属性值总计：${this.grouped[this.activeTab].totalTempValue.toFixed(1)}
    · 可合成 <span style="color:var(--green);font-weight:bold">${Math.floor(this.grouped[this.activeTab].totalTempValue / 10)}</span> 点永久属性
  </span>
</div>
```

---

## 任务 3：合成预览增强（纯前端）

文件：`public/js/pages/inventory.js`

现有代码在 `renderItems()` 底部已有合成摘要区域（`synth-summary`），当前显示了选中件数、总值、可合成点数、浪费点数。

找到现有的合成摘要块：

```js
${this.selectedIds.size > 0 ? `
  <div class="synth-summary">
    <div class="synth-info">
      已选${this.selectedIds.size}件 · 总值${selectedTotal.toFixed(1)}
      ${permanentGain > 0 ? `<br><span class="synth-gain">可合成 +${permanentGain}点永久属性</span>` : `<br><span style="color:var(--red)">不足10点，无法合成</span>`}
      ${selectedTotal % 10 > 0 && permanentGain > 0 ? `<br><span style="font-size:11px;color:var(--text-dim)">浪费${(selectedTotal - permanentGain * 10).toFixed(1)}点</span>` : ''}
    </div>
    <button class="btn btn-primary btn-small" ${permanentGain < 1 ? 'disabled' : ''}
      onclick="InventoryPage.synthesize()" style="width:80px">合成</button>
  </div>
` : ''}
```

替换为：

```js
// V2-F02 FB-02 - 合成预览增强：公式可视化 + 浪费警告
${this.selectedIds.size > 0 ? (() => {
  const waste = selectedTotal - permanentGain * 10; // V2-F02 FB-02
  const wastePercent = selectedTotal > 0 ? ((waste / selectedTotal) * 100).toFixed(0) : 0; // V2-F02 FB-02
  return `
    <div class="synth-summary">
      <div class="synth-info">
        <div style="font-size:13px;margin-bottom:4px">已选 ${this.selectedIds.size} 件 · 总临时属性 ${selectedTotal.toFixed(1)} 点</div>
        ${permanentGain > 0 ? `
          <div class="synth-formula">
            <span>${selectedTotal.toFixed(1)}</span> ÷ 10 = <span class="synth-gain" style="font-size:16px">+${permanentGain} 点永久属性</span>
          </div>
          ${waste > 0 ? `
            <div style="font-size:12px;color:var(--orange);margin-top:4px">
              ⚠️ 将浪费 ${waste.toFixed(1)} 点（${wastePercent}%）
              ${waste >= 5 ? '<br><span style="color:var(--red)">💡 建议凑满整十再合成，减少浪费</span>' : ''}
            </div>
          ` : '<div style="font-size:12px;color:var(--green);margin-top:4px">✅ 零浪费，完美合成！</div>'}
        ` : `
          <div style="color:var(--red)">不足10点，无法合成（还差 ${(10 - selectedTotal).toFixed(1)} 点）</div>
        `}
      </div>
      <button class="btn btn-primary btn-small" ${permanentGain < 1 ? 'disabled' : ''}
        onclick="InventoryPage.synthesize()" style="width:80px">合成</button>
    </div>
  `;
})() : ''}
```

---

## 任务 4：已消耗道具显示"已转化"状态（前端 + 后端）

### 4.1 后端：GET /api/items 返回已转化道具

文件：`server/routes/item.js`

找到 GET `/` 路由中的查询：

```js
const items = db.prepare(
  "SELECT * FROM items WHERE user_id = ? AND status = 'unused' ORDER BY attribute_type, quality DESC"
).all(req.user.id);
```

在其下方新增一条查询，获取最近已转化的道具（最近7天）：

```js
// V2-F02 FB-02 - 查询已转化道具（最近7天）
const synthesizedItems = db.prepare(
  "SELECT * FROM items WHERE user_id = ? AND status = 'synthesized' AND created_at >= datetime('now', '-7 days') ORDER BY created_at DESC LIMIT 50"
).all(req.user.id);
```

修改返回的 JSON，在原有基础上增加 `synthesizedItems`：

```js
// V2-F02 FB-02 - 返回已转化道具
res.json({ items, grouped, synthesizedItems });
```

### 4.2 前端：load() 存储已转化道具

文件：`public/js/pages/inventory.js`

在 `load()` 方法中，找到：

```js
this.items = itemData.items;
this.grouped = itemData.grouped;
```

在其下方新增：

```js
this.synthesizedItems = itemData.synthesizedItems || []; // V2-F02 FB-02
```

### 4.3 前端：renderItems() 底部增加"已转化道具"折叠区

在 `renderItems()` 方法中，在合成摘要块之后、return 结束之前，追加已转化道具区域：

```js
// V2-F02 FB-02 - 已转化道具展示
${(this.synthesizedItems && this.synthesizedItems.length > 0) ? `
  <div class="card" style="opacity:0.8">
    <div class="card-title" style="cursor:pointer" onclick="document.getElementById('synth-history').classList.toggle('hidden')">
      🔄 已转化道具（${this.synthesizedItems.length}件，近7天）
      <span style="font-size:11px;color:var(--text-dim)">点击展开/收起</span>
    </div>
    <div id="synth-history" class="hidden">
      ${this.synthesizedItems.map(item => `
        <div class="item-row" style="opacity:0.6">
          <div class="item-info">
            <div class="item-name">${e(item.name)}</div>
            <div class="item-meta">${e(item.quality)} · 临时属性 +${item.temp_value} · <span style="color:var(--green)">✅ 已转化为永久属性</span></div>
          </div>
        </div>
      `).join('')}
    </div>
  </div>
` : ''}
```

---

## 任务 5：样式补充

文件：`public/css/style.css`（或项目中实际的全局样式文件）

追加以下样式：

```css
/* V2-F02 FB-02 - 合成规则说明弹窗 */
.synth-guide-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.synth-guide-card {
  background: var(--bg-card);
  border-radius: 12px;
  padding: 20px;
  max-width: 340px;
  width: 90%;
  text-align: center;
}
.synth-guide-title {
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 12px;
}
.synth-guide-body {
  text-align: left;
  font-size: 13px;
  line-height: 1.8;
  margin-bottom: 16px;
}
.synth-guide-body p {
  margin: 4px 0;
}

/* V2-F02 FB-02 - 合成公式 */
.synth-formula {
  font-size: 13px;
  color: var(--text-dim);
  margin-top: 4px;
}

/* V2-F02 FB-02 - 折叠区 */
.hidden {
  display: none;
}
```

---

## 验收标准

1. **规则说明卡片**：首次进入道具背包页，自动弹出合成规则说明；关闭后不再自动弹出；标题栏「📖 合成规则」按钮可随时手动打开
2. **分组标注**：每个属性分组标题显示"可合成 X 点永久属性"（X = Math.floor(totalTempValue / 10)）
3. **合成预览**：
   - 选中道具后显示公式 `总值 ÷ 10 = +N 点永久属性`
   - 有浪费时显示浪费点数和百分比，浪费≥5点时额外提示"建议凑满整十"
   - 零浪费时显示"✅ 零浪费，完美合成！"
   - 不足10点时显示"还差 X 点"
4. **已转化道具**：合成后道具状态变为 `synthesized`（后端已有），前端在道具列表底部显示"已转化道具"折叠区，标注"✅ 已转化为永久属性"
5. **溯源**：所有新增/修改行包含 `// V2-F02 FB-02` 注释
6. **无破坏性变更**：现有合成逻辑、API 接口契约不变，仅新增 `synthesizedItems` 字段
