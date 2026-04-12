# Codex 指令：行为系统简化 - 前端部分

> 目标文件：`public/js/pages/behavior.js`（当前 968 行）
> 核心变更：三级选择简化为两级，template 机制改为概率掉落，数据结构从对象数组变为字符串数组

---

## 修改总览

| # | 类型 | 方法/属性 | 行号 | 操作 |
|---|------|-----------|------|------|
| 1 | 属性 | `selectedSubCategory` | 6 | 删除 |
| 2 | 方法 | `isGroupedCategory()` | 67-70 | 删除 |
| 3 | 方法 | `getBehaviorList()` | 72-78 | 删除 |
| 4 | 方法 | `selectSubCategory()` | 506-513 | 删除 |
| 5 | 方法 | `selectSubCategoryByIndex()` | 515-521 | 删除 |
| 6 | 方法 | `updateCustomFormPreview()` | 681-697 | 删除 |
| 7 | 方法 | `resolveShortcutTemplate()` | 325-346 | 删除 |
| 8 | 方法 | `load()` | 19-65 | 修改 |
| 9 | 方法 | `render()` | 94-159 | 修改 |
| 10 | 方法 | `selectCategory()` | 478-497 | 修改 |
| 11 | 方法 | `selectBehavior()` | 523-530 | 修改 |
| 12 | 方法 | `selectBehaviorByIndex()` | 532-537 | 修改 |
| 13 | 方法 | `renderInputForm()` | 383-417 | 重写 |
| 14 | 方法 | `renderCustomForm()` | 419-470 | 重写 |
| 15 | 方法 | `submitCustom()` | 699-811 | 大幅简化 |
| 16 | 方法 | `submit()` | 813-878 | 修改 |
| 17 | 方法 | `selectShortcut()` | 540-574 | 修改 |
| 18 | 方法 | `quickSubmit()` | 577-616 | 修改 |
| 19 | 方法 | `repeatLast()` | 619-666 | 修改 |
| 20 | 方法 | `renderShortcuts()` | 349-381 | 修改 |

---

## 详细修改指令

### 1. 删除属性 `selectedSubCategory`（行 6）

```js
// 修改前
  selectedSubCategory: null,

// 修改后
  // （整行删除）
```

### 2. 删除 `isGroupedCategory()`（行 67-70）

```js
// 修改前
  isGroupedCategory(category) {
    if (!category || !this.categories?.[category]) return false;
    return !Array.isArray(this.categories[category]);
  },

// 修改后
  // （整个方法删除）
```

### 3. 删除 `getBehaviorList()`（行 72-78）

```js
// 修改前
  getBehaviorList(category, subCategory) {
    if (!category || !this.categories?.[category]) return [];
    const data = this.categories[category];
    if (Array.isArray(data)) return data;
    if (!subCategory || !Array.isArray(data[subCategory])) return [];
    return data[subCategory];
  },

// 修改后
  // （整个方法删除）
```

### 4. 删除 `selectSubCategory()`（行 506-513）

```js
// 修改前
  selectSubCategory(subCategory) {
    this.selectedSubCategory = subCategory;
    this.selectedBehavior = null;
    this.showCustomForm = false;
    localStorage.setItem('behavior_last_subcategory', subCategory);
    this.render();
  },

// 修改后
  // （整个方法删除）
```

### 5. 删除 `selectSubCategoryByIndex()`（行 515-521）

```js
// 修改前
  selectSubCategoryByIndex(index) {
    if (!this.selectedCategory || !this.isGroupedCategory(this.selectedCategory)) return;
    const subs = Object.keys(this.categories[this.selectedCategory] || {});
    const sub = subs[index];
    if (!sub) return;
    this.selectSubCategory(sub);
  },

// 修改后
  // （整个方法删除）
```

### 6. 删除 `updateCustomFormPreview()`（行 681-697）

```js
// 修改前
  updateCustomFormPreview() {
    const template = document.getElementById('custom-template')?.value || 'duration';
    const instant = document.getElementById('custom-instant-report')?.checked;
    const baseGroup = document.getElementById('custom-base-quantity-group');
    if (baseGroup) baseGroup.style.display = template === 'quantity' ? 'block' : 'none';
    const instantFields = document.getElementById('custom-instant-fields');
    if (instantFields) instantFields.style.display = instant ? 'block' : 'none';
    const durationGroup = document.getElementById('custom-instant-duration-group');
    const quantityGroup = document.getElementById('custom-instant-quantity-group');
    const checkinTip = document.getElementById('custom-instant-checkin-tip');
    if (durationGroup) durationGroup.style.display = template === 'duration' ? 'block' : 'none';
    if (quantityGroup) quantityGroup.style.display = template === 'quantity' ? 'block' : 'none';
    if (checkinTip) checkinTip.style.display = template === 'checkin' ? 'block' : 'none';
  },

// 修改后
  // （整个方法删除）
```

### 7. 删除 `resolveShortcutTemplate()`（行 325-346）

```js
// 修改前
  resolveShortcutTemplate(shortcut) {
    if (!shortcut) return null;
    if (shortcut.template) return shortcut.template;
    // ... 省略中间逻辑
    return null;
  },

// 修改后
  // （整个方法删除）
```

### 8. 修改 `load()`（行 19-65）

去掉 `savedSub` / `selectedSubCategory` 恢复逻辑（行 37-41），`pendingCategory` 消费逻辑保持不变。

```js
// 修改前（行 31-42）
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

// 修改后
      if (this.selectedCategory === null) {
        const savedCat = localStorage.getItem('behavior_last_category');
        if (savedCat && this.categories[savedCat]) {
          this.selectedCategory = savedCat;
        }
      }
```

### 9. 修改 `render()`（行 94-159）

去掉 `grouped`、`subCategories`、`list` 变量。行为列表直接用 `this.categories[this.selectedCategory]`（现在是字符串数组）。去掉"选择训练部位"区块（行 126-134）。"选择具体行为"改为"选择行为"。选中判断从 `this.selectedBehavior?.name === b.name` 改为 `this.selectedBehavior === b`。

```js
// 修改前（行 107-145）
    const cats = Object.keys(this.categories || {});
    const grouped = this.isGroupedCategory(this.selectedCategory);
    const subCategories = grouped ? Object.keys(this.categories[this.selectedCategory] || {}) : [];
    const list = this.getBehaviorList(this.selectedCategory, this.selectedSubCategory);

    container.innerHTML = tabBar + `
      <div class="page-header">行为上报</div>

      ${this.renderShortcuts()}

      <div class="card">
        <div class="card-title">选择行为类型</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">
          ${cats.map((c, idx) => `
            <button class="btn btn-small ${this.selectedCategory === c ? 'btn-primary' : 'btn-secondary'}"
              onclick="BehaviorPage.selectCategoryByIndex(${idx})">${e(c)}</button>
          `).join('')}
        </div>

        ${this.selectedCategory && grouped ? `
          <div class="card-title" style="margin-top:8px">选择训练部位</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px">
            ${subCategories.map((sub, idx) => `
              <button class="btn btn-small ${this.selectedSubCategory === sub ? 'btn-primary' : 'btn-secondary'}"
                onclick="BehaviorPage.selectSubCategoryByIndex(${idx})">${e(sub)}</button>
            `).join('')}
          </div>
        ` : ''}

        ${this.selectedCategory ? `
          <div class="card-title" style="margin-top:8px">选择具体行为</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            ${list.map((b, idx) => `
              <button class="btn btn-small ${this.selectedBehavior?.name === b.name ? 'btn-primary' : 'btn-secondary'}"
                onclick="BehaviorPage.selectBehaviorByIndex(${idx})">${e(b.name)}</button>
            `).join('')}
            <button class="btn btn-small btn-secondary" onclick="BehaviorPage.openAddCustom()">➕ 自定义</button>
          </div>
        ` : ''}
      </div>

// 修改后
    const cats = Object.keys(this.categories || {});
    const list = this.selectedCategory ? (this.categories[this.selectedCategory] || []) : [];

    container.innerHTML = tabBar + `
      <div class="page-header">行为上报</div>

      ${this.renderShortcuts()}

      <div class="card">
        <div class="card-title">选择行为类型</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">
          ${cats.map((c, idx) => `
            <button class="btn btn-small ${this.selectedCategory === c ? 'btn-primary' : 'btn-secondary'}"
              onclick="BehaviorPage.selectCategoryByIndex(${idx})">${e(c)}</button>
          `).join('')}
        </div>

        ${this.selectedCategory ? `
          <div class="card-title" style="margin-top:8px">选择行为</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            ${list.map((b, idx) => `
              <button class="btn btn-small ${this.selectedBehavior === b ? 'btn-primary' : 'btn-secondary'}"
                onclick="BehaviorPage.selectBehaviorByIndex(${idx})">${e(b)}</button>
            `).join('')}
            <button class="btn btn-small btn-secondary" onclick="BehaviorPage.openAddCustom()">➕ 自定义</button>
          </div>
        ` : ''}
      </div>
```

### 10. 修改 `selectCategory()`（行 478-497）

去掉 `isGroupedCategory` 判断和 `selectedSubCategory` 设置。只设 `selectedCategory`，清空 `selectedBehavior`。

```js
// 修改前
  selectCategory(category) {
    this.selectedCategory = category;
    this.selectedBehavior = null;
    this.showCustomForm = false;

    if (this.isGroupedCategory(category)) {
      const subs = Object.keys(this.categories[category] || {});
      this.selectedSubCategory = subs[0] || null;
    } else {
      this.selectedSubCategory = null;
    }

    localStorage.setItem('behavior_last_category', category);
    if (this.selectedSubCategory) {
      localStorage.setItem('behavior_last_subcategory', this.selectedSubCategory);
    }

    this.render();
  },

// 修改后
  selectCategory(category) {
    this.selectedCategory = category;
    this.selectedBehavior = null;
    this.showCustomForm = false;

    localStorage.setItem('behavior_last_category', category);

    this.render();
  },
```

### 11. 修改 `selectBehavior()`（行 523-530）

`behavior` 参数现在是字符串不是对象，逻辑不变。

```js
// 修改前
  selectBehavior(behavior) {
    this.selectedBehavior = behavior;  // behavior 是对象 { name, template, baseQuantity }
    this.render();
    requestAnimationFrame(() => {
      document.getElementById('input-form-card')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  },

// 修改后
  selectBehavior(behavior) {
    this.selectedBehavior = behavior;  // behavior 现在是字符串
    this.render();
    requestAnimationFrame(() => {
      document.getElementById('input-form-card')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  },
```

> 注意：方法体不变，只是语义变了。加个注释说明即可。

### 12. 修改 `selectBehaviorByIndex()`（行 532-537）

从 `categories[selectedCategory]` 直接取字符串。

```js
// 修改前
  selectBehaviorByIndex(index) {
    const list = this.getBehaviorList(this.selectedCategory, this.selectedSubCategory);
    const behavior = list[index];
    if (!behavior) return;
    this.selectBehavior(behavior);
  },

// 修改后
  selectBehaviorByIndex(index) {
    const list = this.categories?.[this.selectedCategory] || [];
    const behavior = list[index];
    if (!behavior) return;
    this.selectBehavior(behavior);
  },
```

### 13. 重写 `renderInputForm()`（行 383-417）

去掉 duration/quantity 输入框。身体健康类别显示强度下拉，其他类别只显示备注。提交按钮统一为"提交"。

```js
// 修改前
  renderInputForm() {
    const b = this.selectedBehavior;
    const e = API.escapeHtml.bind(API);
    let inputHtml = '';

    if (b.template === 'duration') {
      inputHtml = `
        <div class="form-group">
          <label>时长（分钟）</label>
          <input type="number" id="behavior-duration" placeholder="输入时长" min="1">
        </div>
      `;
    } else if (b.template === 'quantity') {
      inputHtml = `
        <div class="form-group">
          <label>数量（基础量：${e(b.baseQuantity || '无')}）</label>
          <input type="number" id="behavior-quantity" placeholder="输入数量" min="1">
        </div>
      `;
    }

    return `
      <div class="card" id="input-form-card">
        <div class="card-title">${e(b.name)} ${b.template === 'checkin' ? '（打卡）' : ''}</div>
        ${inputHtml}
        <div class="form-group">
          <label>备注（可选）</label>
          <input type="text" id="behavior-desc" placeholder="例如：晚饭后散步30分钟">
        </div>
        <button class="btn btn-primary" id="submit-btn" onclick="BehaviorPage.submit()">
          ${b.template === 'checkin' ? '打卡' : '提交'}
        </button>
      </div>
    `;
  },

// 修改后
  renderInputForm() {
    const e = API.escapeHtml.bind(API);
    const isExercise = this.selectedCategory === '身体健康';

    return `
      <div class="card" id="input-form-card">
        <div class="card-title">${e(this.selectedBehavior)}</div>
        ${isExercise ? `
          <div class="form-group">
            <label>运动强度</label>
            <select id="behavior-intensity">
              <option value="低强度">低强度</option>
              <option value="热身">热身</option>
              <option value="高强度">高强度</option>
              <option value="拉伸">拉伸</option>
            </select>
          </div>
        ` : ''}
        <div class="form-group">
          <label>备注（可选）</label>
          <input type="text" id="behavior-desc" placeholder="例如：晚饭后散步30分钟">
        </div>
        <button class="btn btn-primary" id="submit-btn" onclick="BehaviorPage.submit()">提交</button>
      </div>
    `;
  },
```

### 14. 重写 `renderCustomForm()`（行 419-470）

去掉 template 选择、baseQuantity 输入、"同时上报一条"checkbox 及相关字段。简化为只有行为名称输入 + 保存/取消按钮。

```js
// 修改前
  renderCustomForm() {
    return `
      <div class="card">
        <div class="card-title">新增自定义行为</div>
        <div class="form-group">
          <label>行为名称</label>
          <input type="text" id="custom-name" placeholder="例如：波比跳">
        </div>
        <div class="form-group">
          <label>品质判定模板</label>
          <select id="custom-template" onchange="BehaviorPage.updateCustomFormPreview()">
            <option value="duration">时长型</option>
            <option value="quantity">数量型</option>
            <option value="checkin">打卡型</option>
          </select>
        </div>
        <div class="form-group" id="custom-base-quantity-group" style="display:none">
          <label>基础量（数量型必填）</label>
          <input type="number" id="custom-base-quantity" placeholder="例如：20" min="1">
        </div>
        <!-- ... 省略 instant report 相关字段 ... -->
        <div style="display:flex;gap:8px">
          <button class="btn btn-secondary" onclick="BehaviorPage.closeAddCustom()">取消</button>
          <button class="btn btn-primary" id="submit-custom-btn" onclick="BehaviorPage.submitCustom()">保存</button>
        </div>
      </div>
    `;
  },

// 修改后
  renderCustomForm() {
    return `
      <div class="card">
        <div class="card-title">新增自定义行为</div>
        <div class="form-group">
          <label>行为名称</label>
          <input type="text" id="custom-name" placeholder="例如：波比跳">
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-secondary" onclick="BehaviorPage.closeAddCustom()">取消</button>
          <button class="btn btn-primary" id="submit-custom-btn" onclick="BehaviorPage.submitCustom()">保存</button>
        </div>
      </div>
    `;
  },
```

### 15. 大幅简化 `submitCustom()`（行 699-811）

只需要 category 和 name。POST `/behavior/custom` 只发 `{ category, name }`。创建成功后自动选中该行为。去掉 template/baseQuantity/instant 相关逻辑。

```js
// 修改前（核心逻辑，省略防重复点击部分）
    try {
      const name = (document.getElementById('custom-name')?.value || '').trim();
      const template = document.getElementById('custom-template')?.value || 'duration';
      const instant = !!document.getElementById('custom-instant-report')?.checked;
      const desc = (document.getElementById('custom-instant-desc')?.value || '').trim();

      if (!name) { App.toast('请输入行为名称', 'error'); return; }

      let baseQuantity = null;
      if (template === 'quantity') {
        const rawBase = document.getElementById('custom-base-quantity')?.value;
        baseQuantity = Number.parseInt(rawBase, 10);
        if (!Number.isInteger(baseQuantity) || baseQuantity <= 0) {
          App.toast('数量型行为需要填写基础量', 'error'); return;
        }
      }

      const reportBody = { category: this.selectedCategory, sub_type: name, description: desc };
      if (this.isGroupedCategory(this.selectedCategory)) {
        reportBody.sub_category = '自定义';
      }
      // ... template 相关验证和 reportBody 字段 ...

      let created = false;
      try {
        await API.post('/behavior/custom', {
          category: this.selectedCategory, name, template, base_quantity: baseQuantity,
        });
        created = true;
      } catch (e) { /* ... */ }

      try {
        this.categories = await API.get('/behavior/categories');
        if (this.isGroupedCategory(this.selectedCategory) && this.categories[this.selectedCategory]['自定义']) {
          this.selectedSubCategory = '自定义';
        }
        if (instant) {
          const result = await API.post('/behavior', reportBody);
          // ... toast ...
        } else {
          App.toast(created ? '自定义行为已添加' : '行为已存在', 'success');
        }
        const currentList = this.getBehaviorList(this.selectedCategory, this.selectedSubCategory);
        this.selectedBehavior = currentList.find(b => b.name === name) || null;
        this.showCustomForm = false;
        this.render();
      } catch (e) { App.toast(e.message, 'error'); }
    } finally { /* 恢复按钮 */ }

// 修改后（保留防重复点击框架，简化核心逻辑）
    try {
      const name = (document.getElementById('custom-name')?.value || '').trim();
      if (!name) {
        App.toast('请输入行为名称', 'error');
        return;
      }

      await API.post('/behavior/custom', {
        category: this.selectedCategory,
        name,
      });

      // 刷新 categories
      this.categories = await API.get('/behavior/categories');

      // 自动选中新行为
      const list = this.categories[this.selectedCategory] || [];
      this.selectedBehavior = list.includes(name) ? name : null;
      this.showCustomForm = false;

      App.toast('自定义行为已添加', 'success');
      this.render();
    } catch (e) {
      App.toast(e.message, 'error');
    } finally {
      // V25-010 - 恢复按钮状态（保持不变）
      this.submittingCustom = false;
      const resetBtn = document.getElementById('submit-custom-btn');
      if (resetBtn) {
        resetBtn.disabled = false;
        resetBtn.textContent = '保存';
      }
    }
```

### 16. 修改 `submit()`（行 813-878）

body 去掉 `sub_category`、`duration`、`quantity`。新增 `intensity`（仅身体健康类别）。`selectedBehavior` 现在是字符串。

```js
// 修改前（行 826-844）
    try {
      const body = {
        category: this.selectedCategory,
        sub_type: b.name,
        description: document.getElementById('behavior-desc')?.value || '',
      };
      if (this.selectedSubCategory) {
        body.sub_category = this.selectedSubCategory;
      }

      if (b.template === 'duration') {
        const dur = parseInt(document.getElementById('behavior-duration')?.value, 10);
        if (!dur || dur < 1) { App.toast('请输入时长', 'error'); return; }
        body.duration = dur;
      } else if (b.template === 'quantity') {
        const qty = parseInt(document.getElementById('behavior-quantity')?.value, 10);
        if (!qty || qty < 1) { App.toast('请输入数量', 'error'); return; }
        body.quantity = qty;
      }

// 修改后
    try {
      const body = {
        category: this.selectedCategory,
        sub_type: this.selectedBehavior,
        description: document.getElementById('behavior-desc')?.value || '',
      };

      if (this.selectedCategory === '身体健康') {
        body.intensity = document.getElementById('behavior-intensity')?.value || '低强度';
      }
```

同时修改 `finally` 块中的按钮文字恢复逻辑（行 875）：

```js
// 修改前
        resetBtn.textContent = this.selectedBehavior?.template === 'checkin' ? '打卡' : '提交';

// 修改后
        resetBtn.textContent = '提交';
```

### 17. 修改 `selectShortcut()`（行 540-574）

去掉 `sub_category` 相关逻辑。直接设 `selectedCategory` 和 `selectedBehavior`（字符串）。验证行为是否存在用 `includes`。

```js
// 修改前
  selectShortcut(index) {
    const s = this.shortcuts[index];
    if (!s) return;

    this.selectedCategory = s.category;
    this.showCustomForm = false;

    if (s.sub_category) {
      this.selectedSubCategory = s.sub_category;
    } else if (this.isGroupedCategory(s.category)) {
      const subs = Object.keys(this.categories[s.category] || {});
      this.selectedSubCategory = subs[0] || null;
    } else {
      this.selectedSubCategory = null;
    }

    const list = this.getBehaviorList(this.selectedCategory, this.selectedSubCategory);
    const behavior = list.find(b => b.name === s.sub_type);
    if (!behavior) {
      App.toast('该行为已不存在，请手动选择', 'error');
      this.selectedCategory = null;
      this.selectedSubCategory = null;
      this.selectedBehavior = null;
      this.render();
      return;
    }

    this.selectedBehavior = behavior;
    this.render();
  },

// 修改后
  selectShortcut(index) {
    const s = this.shortcuts[index];
    if (!s) return;

    this.selectedCategory = s.category;
    this.showCustomForm = false;

    if (!this.categories[s.category]?.includes(s.sub_type)) {
      App.toast('该行为已不存在，请手动选择', 'error');
      this.selectedCategory = null;
      this.selectedBehavior = null;
      this.render();
      return;
    }

    this.selectedBehavior = s.sub_type;
    this.render();
  },
```

### 18. 修改 `quickSubmit()`（行 577-616）

body 去掉 `sub_category`。身体健康类别不走 `quickSubmit`（因为需要选强度），改为走 `selectShortcut` 流程（由 `renderShortcuts` 控制调用）。

```js
// 修改前（行 584-592）
      const body = {
        category: s.category,
        sub_type: s.sub_type,
        description: '',
      };
      if (s.sub_category) {
        body.sub_category = s.sub_category;
      }

// 修改后
      const body = {
        category: s.category,
        sub_type: s.sub_type,
        description: '',
      };
```

> 注意：身体健康类别的快捷行为不会调用 `quickSubmit`，由 `renderShortcuts` 在渲染时控制（见修改 #20）。

### 19. 修改 `repeatLast()`（行 619-666）

去掉 `sub_category` 相关逻辑。验证行为是否存在用 `includes`。预填充去掉 `duration`/`quantity`，只保留 `description`。身体健康类别预填充 `intensity`。

```js
// 修改前
  repeatLast() {
    const last = this.lastBehavior;
    if (!last) return;

    this.selectedCategory = last.category;
    this.showCustomForm = false;

    if (last.sub_category) {
      this.selectedSubCategory = last.sub_category;
    } else if (this.isGroupedCategory(last.category)) {
      const subs = Object.keys(this.categories[last.category] || {});
      this.selectedSubCategory = subs[0] || null;
    } else {
      this.selectedSubCategory = null;
    }

    const list = this.getBehaviorList(this.selectedCategory, this.selectedSubCategory);
    const behavior = list.find(b => b.name === last.sub_type);
    if (!behavior) {
      App.toast('该行为已不存在，请手动选择', 'error');
      this.selectedCategory = null;
      this.selectedSubCategory = null;
      this.selectedBehavior = null;
      this.render();
      return;
    }

    this.selectedBehavior = behavior;
    this.render();

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
  },

// 修改后
  repeatLast() {
    const last = this.lastBehavior;
    if (!last) return;

    this.selectedCategory = last.category;
    this.showCustomForm = false;

    if (!this.categories[last.category]?.includes(last.sub_type)) {
      App.toast('该行为已不存在，请手动选择', 'error');
      this.selectedCategory = null;
      this.selectedBehavior = null;
      this.render();
      return;
    }

    this.selectedBehavior = last.sub_type;
    this.render();

    requestAnimationFrame(() => {
      if (last.description) {
        const el = document.getElementById('behavior-desc');
        if (el) el.value = last.description;
      }
      if (last.category === '身体健康' && last.intensity) {
        const el = document.getElementById('behavior-intensity');
        if (el) el.value = last.intensity;
      }
    });
  },
```

### 20. 修改 `renderShortcuts()`（行 349-381）

去掉 `resolveShortcutTemplate` 调用。身体健康类别的快捷行为不显示一键打卡按钮（需要选强度），走 `selectShortcut`。其他类别全部走 `quickSubmit`。

```js
// 修改前（行 361-370）
            ${hasShortcuts ? this.shortcuts.map((s, idx) => {
              const isCheckin = this.resolveShortcutTemplate(s) === 'checkin';
              return `
                <button class="btn btn-small ${isCheckin ? 'btn-success' : 'btn-secondary'}" style="${scrollable ? 'flex-shrink:0' : ''}"
                  onclick="BehaviorPage.${isCheckin ? 'quickSubmit' : 'selectShortcut'}(${idx})">
                  ${isCheckin ? '✓ ' : ''}${e(s.sub_type)}
                </button>
              `;
            }).join('') : ''}

// 修改后
            ${hasShortcuts ? this.shortcuts.map((s, idx) => {
              const isExercise = s.category === '身体健康';
              return `
                <button class="btn btn-small ${isExercise ? 'btn-secondary' : 'btn-success'}" style="${scrollable ? 'flex-shrink:0' : ''}"
                  onclick="BehaviorPage.${isExercise ? 'selectShortcut' : 'quickSubmit'}(${idx})">
                  ${isExercise ? '' : '✓ '}${e(s.sub_type)}
                </button>
              `;
            }).join('') : ''}
```

### 21. 清理 `openAddCustom()`（行 668-674）

去掉 `this.updateCustomFormPreview()` 调用（该方法已删除）。

```js
// 修改前
  async openAddCustom() {
    if (!this.selectedCategory) return;
    this.showCustomForm = true;
    this.selectedBehavior = null;
    this.render();
    this.updateCustomFormPreview();
  },

// 修改后
  async openAddCustom() {
    if (!this.selectedCategory) return;
    this.showCustomForm = true;
    this.selectedBehavior = null;
    this.render();
  },
```

### 22. 清理 `loadRecentHistory()`（行 925-967）

最近记录中去掉 `duration`/`quantity` 显示（可选，取决于后端是否还返回这些字段）。

```js
// 修改前（行 943-944）
              ${b.duration ? `· ${b.duration}分钟` : ''}
              ${b.quantity ? `· ${b.quantity}个` : ''}

// 修改后
              ${b.intensity ? `· ${b.intensity}` : ''}
```

---

## 全局清理

完成上述修改后，全文搜索以下关键词确认无残留引用：

- `selectedSubCategory` — 应无任何引用
- `isGroupedCategory` — 应无任何引用
- `getBehaviorList` — 应无任何引用
- `sub_category` — 应无任何引用（前端不再发送此字段）
- `updateCustomFormPreview` — 应无任何引用
- `resolveShortcutTemplate` — 应无任何引用
- `template` — 应无任何引用（行为对象不再有 template 属性）
- `baseQuantity` — 应无任何引用
- `behavior-duration` — 应无任何引用
- `behavior-quantity` — 应无任何引用
- `custom-template` — 应无任何引用
- `custom-base-quantity` — 应无任何引用
- `custom-instant` — 应无任何引用
- `b.name` — 应无任何引用（行为现在是字符串，不是对象）

---

## 验收检查清单

- [ ] 属性 `selectedSubCategory` 已从对象定义中删除
- [ ] `isGroupedCategory()`、`getBehaviorList()`、`selectSubCategory()`、`selectSubCategoryByIndex()`、`updateCustomFormPreview()`、`resolveShortcutTemplate()` 六个方法已完全删除
- [ ] `load()` 不再恢复 `savedSub` / `selectedSubCategory`
- [ ] `render()` 不再渲染"选择训练部位"区块，行为列表从字符串数组渲染
- [ ] `selectCategory()` 不再设置 `selectedSubCategory`
- [ ] `selectBehaviorByIndex()` 直接从 `categories[selectedCategory]` 取值
- [ ] `renderInputForm()` 身体健康显示强度下拉，其他类别只显示备注，按钮统一为"提交"
- [ ] `renderCustomForm()` 只有行为名称输入 + 保存/取消按钮
- [ ] `submitCustom()` 只发 `{ category, name }`，创建后自动选中
- [ ] `submit()` body 无 `sub_category`/`duration`/`quantity`，身体健康发 `intensity`
- [ ] `selectShortcut()` 用 `includes` 验证行为存在，直接设字符串
- [ ] `quickSubmit()` body 无 `sub_category`
- [ ] `repeatLast()` 用 `includes` 验证，预填充只有 `description` 和 `intensity`
- [ ] `renderShortcuts()` 身体健康走 `selectShortcut`，其他走 `quickSubmit`
- [ ] `openAddCustom()` 不再调用 `updateCustomFormPreview()`
- [ ] `loadRecentHistory()` 显示 `intensity` 而非 `duration`/`quantity`
- [ ] 全局搜索确认无残留引用（见上方关键词列表）
- [ ] 页面可正常加载，类别选择 → 行为选择 → 提交流程通畅
- [ ] 身体健康类别：选行为后出现强度下拉，提交时发送 intensity
- [ ] 非身体健康类别：选行为后只有备注，提交时不发 intensity
- [ ] 快捷行为：身体健康走选择流程，其他一键提交
- [ ] 重复上次：正确预填充 description 和 intensity
- [ ] 自定义行为：创建后自动选中，列表刷新正确
- [ ] localStorage 不再存储 `behavior_last_subcategory`
