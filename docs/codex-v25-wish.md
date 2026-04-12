# Codex 指令：V2.5 愿望页交互优化

> 关联策划案：docs/iteration-v2.5.md
> 涉及文件：public/js/pages/wish.js, public/css/style.css
> 溯源：V25-015~V25-023, V25-056~V25-070, V25-088~V25-090

---

## 修改总览表

| 序号 | 策划编号 | 优先级 | 简述 | 涉及方法/行号 | 状态 |
|------|---------|--------|------|--------------|------|
| 1 | V25-015 | P0 | 许愿提交按钮防重复点击 | submitCreate() 行 251-278 | 待实现 |
| 2 | V25-016 | P0 | 战斗准备阶段加载进度提示 | startBattle() 行 280-303 | 待实现 |
| 3 | V25-017 | P0 | 兑现奖励二次确认 | redeem() 行 513-521 | 待实现 |
| 4 | V25-018 | P0 | 开始挑战按钮 loading 状态 | executeBattle() 行 411-422 | 待实现 |
| 5 | V25-019 | P0 | 页面头部许愿按钮小屏重叠 | render() 行 89-93 | 待实现 |
| 6 | V25-020 | P0 | 返回箭头点击区域过小 | renderBattle() 行 326, renderCreate() 行 205 | 待实现 |
| 7 | V25-021 | P0 | 道具 checkbox iOS 偏小 | renderBattle() 行 373-375 | 待实现 |
| 8 | V25-022 | P0 | 胜算计算未包含道具加成 | renderBattle() 行 341-346 | 待实现 |
| 9 | V25-023 | P0 | Boss 战失败建议过于笼统 | getDefeatAdvice() 行 43-58 | 待实现 |
| 10 | V25-056 | P1 | 创建表单认知负担重 | renderCreate() 行 202-244 | 待实现 |
| 11 | V25-057 | P1 | 战斗启动失败 toast 笼统 | startBattle() 行 287-302 | 待实现 |
| 12 | V25-058 | P1 | 战斗回合动画无完成提示 | showBattleResult() 行 498-510 | 待实现 |
| 13 | V25-059 | P1 | 兑现后状态短暂不一致 | redeem() 行 513-521 | 待实现 |
| 14 | V25-060 | P1 | 主操作按钮样式不统一 | renderBattle() 行 392-395 | 待实现 |
| 15 | V25-061 | P1 | 回合动画期间返回按钮可点击 | showBattleResult() 行 495 | 待实现 |
| 16 | V25-062 | P1 | 筛选区域分组层级不清晰 | render() 行 95-111 | 待实现 |
| 17 | V25-063 | P1 | 愿望名称和奖励无最大长度 | renderCreate() 行 210, 239 | 待实现 |
| 18 | V25-064 | P1 | 难度滑块 DOM 无安全访问 | renderCreate() 行 226 | 待实现 |
| 19 | V25-065 | P1 | 未登录时 canChallenge 静默失败 | canChallenge() 行 187-195 | 待实现 |
| 20 | V25-066 | P1 | 战斗详情小屏显示拥挤 | showBattleResult() 行 464-475 | 待实现 |
| 21 | V25-067 | P1 | iOS Safari 难度滑块偏小 | renderCreate() 行 225-227, style.css | 待实现 |
| 22 | V25-068 | P1 | closeBattle 未重置 battleResult | closeBattle() 行 405-409 | 待实现 |
| 23 | V25-069 | P1 | startBattle 失败后 selectedWish 未清空 | startBattle() 行 297-302 | 待实现 |
| 24 | V25-070 | P1 | 团队愿望缺 teamProgress 时不显示 | render() 行 135-139 | 待实现 |
| 25 | V25-088 | P2 | 空状态引导文案偏小 | render() 行 113-118 | 待实现 |
| 26 | V25-089 | P2 | 胜算未知时无原因说明 | renderBattle() 行 334-335 | 待实现 |
| 27 | V25-090 | P2 | 筛选激活状态无视觉提示 | render() 行 95-111 | 待实现 |

---

## 详细修改指令

### 1. V25-015：许愿提交按钮防重复点击（P0）

**文件**：`public/js/pages/wish.js`

**新增属性**：在 WishPage 对象属性区域（行 10-20 附近）添加：

```js
submittingCreate: false, // V2.5 V25-015 - 创建防重复标志位
```

**修改 submitCreate()**（行 251-278）

修改前：

```js
async submitCreate() {
  const name = document.getElementById('wish-name').value.trim();
  const description = document.getElementById('wish-desc').value.trim();
  const type = document.getElementById('wish-type').value;
  const difficulty = parseInt(document.getElementById('wish-difficulty').value, 10);
  const reward_description = document.getElementById('wish-reward').value.trim();

  if (!name || !reward_description) {
    App.toast('请填写愿望名称和奖励', 'error');
    return;
  }

  try {
    await API.post('/wishes', {
      name,
      description,
      type,
      difficulty,
      reward_description,
      target_user_id: type === '单人' ? API.user.id : null,
    });
    App.toast('愿望创建成功！', 'success');
    this.showCreate = false;
    this.load();
  } catch (e) {
    App.toast(e.message, 'error');
  }
},
```

修改后：

```js
async submitCreate() {
  if (this.submittingCreate) return; // V2.5 V25-015
  const name = document.getElementById('wish-name').value.trim();
  const description = document.getElementById('wish-desc').value.trim();
  const type = document.getElementById('wish-type').value;
  const difficulty = parseInt(document.getElementById('wish-difficulty').value, 10);
  const reward_description = document.getElementById('wish-reward').value.trim();

  if (!name || !reward_description) {
    App.toast('请填写愿望名称和奖励', 'error');
    return;
  }

  this.submittingCreate = true; // V2.5 V25-015
  const btn = document.querySelector('#page-wish .btn-primary');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '创建中…';
  }
  try {
    await API.post('/wishes', {
      name,
      description,
      type,
      difficulty,
      reward_description,
      target_user_id: type === '单人' ? API.user.id : null,
    });
    App.toast('愿望创建成功！', 'success');
    this.showCreate = false;
    this.load();
  } catch (e) {
    App.toast(e.message, 'error');
    if (btn) {
      btn.disabled = false;
      btn.textContent = '创建愿望';
    }
  } finally {
    this.submittingCreate = false; // V2.5 V25-015
  }
},
```

---

### 2. V25-016：战斗准备阶段加载进度提示（P0）

**文件**：`public/js/pages/wish.js`

**修改 startBattle()**（行 280-303）

修改前：

```js
async startBattle(wishId) {
  this.selectedWish = this.wishes.find(w => w.id === wishId);
  this.showBattle = true;
  this.preparedBoss = null;
  this.battleSelectedIds.clear();
  this.renderBattle(document.getElementById('page-wish'));

  try {
    const [itemData, prepared, characterData] = await Promise.all([
      API.get('/items'),
      API.post('/battle/prepare', { wish_id: wishId }),
      this.character ? Promise.resolve({ character: this.character }) : API.get('/character'),
    ]);
    this.battleItems = itemData.items;
    this.preparedBoss = prepared.boss;
    this.character = characterData?.character || this.character;
    this.renderBattle(document.getElementById('page-wish'));
  } catch (e) {
    this.showBattle = false;
    this.preparedBoss = null;
    App.toast(e.message, 'error');
    this.render();
  }
},
```

修改后：

```js
async startBattle(wishId) {
  this.selectedWish = this.wishes.find(w => w.id === wishId);
  this.showBattle = true;
  this.preparedBoss = null;
  this.battleSelectedIds.clear();
  // V2.5 V25-016 - 立即显示 loading spinner
  const container = document.getElementById('page-wish');
  container.innerHTML = `
    <div class="page-header">
      <span onclick="WishPage.closeBattle()" style="cursor:pointer;min-width:44px;min-height:44px;display:inline-flex;align-items:center;justify-content:center">← </span>挑战Boss
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 0">
      <div style="width:36px;height:36px;border:3px solid var(--border);border-top-color:var(--primary);border-radius:50%;animation:spin 0.8s linear infinite"></div>
      <div style="margin-top:12px;font-size:13px;color:var(--text-dim)">正在推演Boss天机…</div>
      <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
    </div>
  `;

  try {
    const [itemData, prepared, characterData] = await Promise.all([
      API.get('/items'),
      API.post('/battle/prepare', { wish_id: wishId }),
      this.character ? Promise.resolve({ character: this.character }) : API.get('/character'),
    ]);
    this.battleItems = itemData.items;
    this.preparedBoss = prepared.boss;
    this.character = characterData?.character || this.character;
    this.renderBattle(document.getElementById('page-wish'));
  } catch (e) {
    this.showBattle = false;
    this.selectedWish = null; // V2.5 V25-069 - 失败后清空
    this.preparedBoss = null;
    App.toast(e.message, 'error');
    this.render();
  }
},
```

注意：此修改同时包含了 V25-069 的 catch 修复（见第 23 条）。

---

### 3. V25-017：兑现奖励二次确认（P0）

**文件**：`public/js/pages/wish.js`

**修改 redeem()**（行 513-521）

修改前：

```js
async redeem(wishId) {
  try {
    await API.post(`/rewards/${wishId}/redeem`);
    App.toast('奖励已兑现！', 'success');
    this.load();
  } catch (e) {
    App.toast(e.message, 'error');
  }
},
```

修改后：

```js
async redeem(wishId) {
  // V2.5 V25-017 - 兑现前二次确认
  if (!confirm('确认兑现这个愿望的奖励？')) return;
  // V2.5 V25-059 - 乐观更新：立即禁用按钮
  const btn = document.querySelector(`[onclick="WishPage.redeem(${wishId})"]`);
  if (btn) {
    btn.disabled = true;
    btn.textContent = '兑现中…';
  }
  try {
    await API.post(`/rewards/${wishId}/redeem`);
    App.toast('奖励已兑现！', 'success');
    this.load();
  } catch (e) {
    App.toast(e.message, 'error');
    if (btn) {
      btn.disabled = false;
      btn.textContent = '兑现';
    }
  }
},
```

注意：此修改同时包含了 V25-059 的乐观更新（见第 13 条）。

---

### 4. V25-018：开始挑战按钮 loading 状态（P0）

**文件**：`public/js/pages/wish.js`

**新增属性**：在 WishPage 对象属性区域添加：

```js
executing: false, // V2.5 V25-018 - 挑战防重复标志位
```

**修改 executeBattle()**（行 411-422）

修改前：

```js
async executeBattle() {
  if (!this.preparedBoss) return;
  try {
    const result = await API.post('/battle/execute', {
      boss_id: this.preparedBoss.id,
      equipped_item_ids: [...this.battleSelectedIds],
    });
    this.showBattleResult(result);
  } catch (e) {
    App.toast(e.message, 'error');
  }
},
```

修改后：

```js
async executeBattle() {
  if (!this.preparedBoss || this.executing) return; // V2.5 V25-018
  this.executing = true;
  const btn = document.querySelector('#page-wish .btn-primary[onclick*="executeBattle"]');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '挑战中…';
  }
  try {
    const result = await API.post('/battle/execute', {
      boss_id: this.preparedBoss.id,
      equipped_item_ids: [...this.battleSelectedIds],
    });
    this.showBattleResult(result);
  } catch (e) {
    App.toast(e.message, 'error');
    if (btn) {
      btn.disabled = false;
      btn.textContent = '开始挑战！';
    }
  } finally {
    this.executing = false; // V2.5 V25-018
  }
},
```

---

### 5. V25-019：页面头部许愿按钮小屏重叠（P0）

**文件**：`public/js/pages/wish.js`

**修改 render() 中 page-header 部分**（行 89-93）

修改前：

```html
<div class="page-header">
  愿望池
  <button class="btn btn-primary btn-small" style="float:right;width:auto;margin-top:2px" onclick="WishPage.openCreate()">许愿</button>
</div>
```

修改后：

```html
<div class="page-header" style="display:flex;justify-content:space-between;align-items:center">
  愿望池
  <button class="btn btn-primary btn-small" style="width:auto;flex-shrink:0" onclick="WishPage.openCreate()">许愿</button>
</div>
```

---

### 6. V25-020：返回箭头点击区域过小（P0）

**文件**：`public/js/pages/wish.js`

**修改 1：renderBattle() 中返回箭头**（行 326）

修改前：

```html
<span onclick="WishPage.closeBattle()" style="cursor:pointer">← </span>挑战Boss
```

修改后：

```html
<button onclick="WishPage.closeBattle()" style="background:none;border:none;color:inherit;font-size:inherit;cursor:pointer;min-width:44px;min-height:44px;display:inline-flex;align-items:center;justify-content:center;padding:0;margin-right:4px">←</button>挑战Boss
```

**修改 2：renderCreate() 中返回箭头**（行 205）

修改前：

```html
<span onclick="WishPage.closeCreate()" style="cursor:pointer">← </span>许下愿望
```

修改后：

```html
<button onclick="WishPage.closeCreate()" style="background:none;border:none;color:inherit;font-size:inherit;cursor:pointer;min-width:44px;min-height:44px;display:inline-flex;align-items:center;justify-content:center;padding:0;margin-right:4px">←</button>许下愿望
```

---

### 7. V25-021：道具 checkbox iOS 偏小（P0）

**文件**：`public/js/pages/wish.js`

**修改 renderBattle() 中 checkbox**（行 373-375）

修改前：

```html
<input type="checkbox" class="item-check"
  ${this.battleSelectedIds.has(item.id) ? 'checked' : ''}
  onchange="WishPage.toggleBattleItem(${item.id})">
```

修改后：

```html
<input type="checkbox" class="item-check"
  style="width:22px;height:22px;flex-shrink:0"
  ${this.battleSelectedIds.has(item.id) ? 'checked' : ''}
  onchange="WishPage.toggleBattleItem(${item.id})">
```

同时将 `.item-row` 改为用 label 包裹以增大点击区域。修改 renderBattle() 行 372 和 384：

修改前：

```html
<div class="item-row">
  ...
</div>
```

修改后：

```html
<label class="item-row" style="display:flex;align-items:center;cursor:pointer">
  ...
</label>
```

---

### 8. V25-022：胜算计算未包含道具加成（P0）

**文件**：`public/js/pages/wish.js`

**修改 renderBattle() 中胜算计算部分**（行 341-346）

修改前：

```js
${(() => {
  const userPower = (this.character?.physique || 0) + (this.character?.comprehension || 0) +
    (this.character?.willpower || 0) + (this.character?.dexterity || 0) + (this.character?.perception || 0);
  const odds = WishPage.getOddsText(userPower, this.preparedBoss?.total_power);
  return `<div style="font-size:16px;font-weight:700;color:${odds.color};margin-top:8px">${odds.text}</div>`;
})()}
```

修改后：

```js
${(() => {
  const basePower = (this.character?.physique || 0) + (this.character?.comprehension || 0) +
    (this.character?.willpower || 0) + (this.character?.dexterity || 0) + (this.character?.perception || 0);
  // V2.5 V25-022 - 胜算计算包含已选道具加成
  const itemPower = this.battleItems
    .filter(i => this.battleSelectedIds.has(i.id))
    .reduce((s, i) => s + i.temp_value, 0);
  const userPower = basePower + itemPower;
  const odds = WishPage.getOddsText(userPower, this.preparedBoss?.total_power);
  return `
    <div style="font-size:16px;font-weight:700;color:${odds.color};margin-top:8px">${odds.text}</div>
    <div style="font-size:12px;color:var(--text-dim);margin-top:4px">
      永久属性 ${basePower.toFixed(1)}${itemPower > 0 ? ` + 道具 ${itemPower.toFixed(1)}` : ''} vs Boss ${this.preparedBoss?.total_power || '?'}
    </div>
  `;
})()}
```

---

### 9. V25-023：Boss 战失败建议过于笼统（P0）

**文件**：`public/js/pages/wish.js`

**修改 getDefeatAdvice()**（行 43-58）

修改前：

```js
getDefeatAdvice(battle) {
  const ATTR_MAP = {
    physique: { name: '体魄', category: '身体健康', advice: '多做运动类行为' },
    comprehension: { name: '悟性', category: '学习', advice: '多做学习类行为' },
    willpower: { name: '心性', category: '生活习惯', advice: '多做生活习惯类行为' },
    dexterity: { name: '灵巧', category: '家务', advice: '多做家务类行为' },
    perception: { name: '神识', category: '社交互助', advice: '多做社交互助类行为' },
  };
  const boss = battle.boss;
  if (!boss) return '继续积累道具，再来挑战！';

  const attrs = ['physique', 'comprehension', 'willpower', 'dexterity', 'perception'];
  const strongest = attrs.reduce((max, a) => (boss[a] > boss[max] ? a : max), attrs[0]);
  const info = ATTR_MAP[strongest];
  return `${info.name}方向差距最大，建议${info.advice}来提升战力。`;
},
```

修改后：

```js
getDefeatAdvice(battle) {
  const ATTR_MAP = {
    physique: { name: '体魄', advice: '多做运动健身类行为' },
    comprehension: { name: '悟性', advice: '多做学习成长类行为' },
    willpower: { name: '心性', advice: '多做冥想/生活习惯类行为' },
    dexterity: { name: '灵巧', advice: '多做家务/生活技能类行为' },
    perception: { name: '神识', advice: '多做社交互助类行为' },
  };
  const boss = battle.boss;
  const character = this.character;
  if (!boss) return '继续积累道具，再来挑战！';

  const attrs = ['physique', 'comprehension', 'willpower', 'dexterity', 'perception'];

  // V2.5 V25-023 - 各属性数值对比 + 差距最大属性 + 具体建议
  const comparisons = attrs.map(a => {
    const userVal = Number(character?.[a] || 0);
    const bossVal = Number(boss[a] || 0);
    const gap = bossVal - userVal;
    return { key: a, userVal, bossVal, gap };
  });

  const maxGap = comparisons.reduce((max, c) => c.gap > max.gap ? c : max, comparisons[0]);
  const info = ATTR_MAP[maxGap.key];

  const lines = comparisons.map(c => {
    const marker = c.key === maxGap.key ? ' ← 重点提升' : '';
    return `${ATTR_MAP[c.key].name}：你 ${c.userVal.toFixed(1)} vs Boss ${c.bossVal.toFixed(1)}（差距 ${c.gap.toFixed(1)}）${marker}`;
  });

  return lines.join('\n') + `\n\n${info.name}差距最大（${maxGap.gap.toFixed(1)}），建议${info.advice}来提升。`;
},
```

**同时修改 showBattleResult() 中失败建议的渲染**（行 488-491）

修改前：

```html
<div style="margin-top:8px;font-size:13px;color:var(--text-dim)">
  ${e(WishPage.getDefeatAdvice(this.battleResult))}
</div>
```

修改后：

```html
<div style="margin-top:8px;font-size:13px;color:var(--text-dim);white-space:pre-line;line-height:1.8">
  ${e(WishPage.getDefeatAdvice(this.battleResult))}
</div>
```

添加 `white-space:pre-line` 以支持多行显示。

---

### 10. V25-056：创建表单认知负担重（P1）

**文件**：`public/js/pages/wish.js`

**修改 renderCreate()**（行 202-244）

修改前：

```js
renderCreate(container) {
  container.innerHTML = `
    <div class="page-header">
      <span onclick="WishPage.closeCreate()" style="cursor:pointer">← </span>许下愿望
    </div>
    <div class="card">
      <div class="form-group">
        <label>愿望名称</label>
        <input type="text" id="wish-name" placeholder="例：喝一杯奶茶">
      </div>
      <div class="form-group">
        <label>愿望描述（可选）</label>
        <textarea id="wish-desc" rows="2" placeholder="详细说明"></textarea>
      </div>
      <div class="form-group">
        <label>愿望类型</label>
        <select id="wish-type">
          <option value="单人">单人（只有自己需要挑战）</option>
          <option value="团队">团队（全员需通过）</option>
        </select>
      </div>
      <div class="form-group">
        <label>难度评分（1-10）</label>
        <input type="range" id="wish-difficulty" min="1" max="10" value="3"
          oninput="document.getElementById('diff-display').textContent=this.value"
          style="width:100%;accent-color:var(--primary)">
        <div style="text-align:center;font-size:20px;font-weight:700;color:var(--gold)" id="diff-display">3</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:6px;line-height:1.8">
          1-3分：小确幸（一杯奶茶、一部电影）<br>
          4-6分：小目标（一次聚餐、一件新衣服）<br>
          7-9分：大愿望（一次旅行、一件大礼物）<br>
          10分：终极愿望（全家共同的大目标）
        </div>
      </div>
      <div class="form-group">
        <label>现实奖励</label>
        <input type="text" id="wish-reward" placeholder="打赢Boss后的奖励">
      </div>
      <button class="btn btn-primary" onclick="WishPage.submitCreate()">创建愿望</button>
    </div>
  `;
},
```

修改后：

```js
renderCreate(container) {
  container.innerHTML = `
    <div class="page-header">
      <button onclick="WishPage.closeCreate()" style="background:none;border:none;color:inherit;font-size:inherit;cursor:pointer;min-width:44px;min-height:44px;display:inline-flex;align-items:center;justify-content:center;padding:0;margin-right:4px">←</button>许下愿望
    </div>
    <div class="card">
      <div class="form-group">
        <label>愿望名称</label>
        <input type="text" id="wish-name" placeholder="例：喝一杯奶茶" maxlength="20">
        <div style="text-align:right;font-size:11px;color:var(--text-dim)" id="wish-name-count">0/20</div>
      </div>
      <div class="form-group">
        <label>愿望类型</label>
        <select id="wish-type">
          <option value="单人">单人（只有自己需要挑战）</option>
          <option value="团队">团队（全员需通过）</option>
        </select>
      </div>
      <div class="form-group">
        <label>难度评分（1-10）</label>
        <input type="range" id="wish-difficulty" min="1" max="10" value="3"
          oninput="document.getElementById('diff-display')?.textContent=this.value"
          style="width:100%;accent-color:var(--primary)">
        <div style="text-align:center;font-size:20px;font-weight:700;color:var(--gold)" id="diff-display">3</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:6px;line-height:1.8">
          1-3分：小确幸（一杯奶茶、一部电影）<br>
          4-6分：小目标（一次聚餐、一件新衣服）<br>
          7-9分：大愿望（一次旅行、一件大礼物）<br>
          10分：终极愿望（全家共同的大目标）
        </div>
      </div>
      <div class="form-group">
        <label>现实奖励</label>
        <input type="text" id="wish-reward" placeholder="打赢Boss后的奖励" maxlength="30">
        <div style="text-align:right;font-size:11px;color:var(--text-dim)" id="wish-reward-count">0/30</div>
      </div>
      <div class="form-group">
        <a href="javascript:void(0)" id="wish-desc-toggle" style="font-size:13px;color:var(--primary)"
          onclick="document.getElementById('wish-desc-area').style.display='block';this.style.display='none'">
          + 添加描述（可选）
        </a>
        <div id="wish-desc-area" style="display:none">
          <label>愿望描述</label>
          <textarea id="wish-desc" rows="2" placeholder="详细说明"></textarea>
        </div>
      </div>
      <button class="btn btn-primary" onclick="WishPage.submitCreate()">创建愿望</button>
    </div>
  `;
  // V2.5 V25-063 - 实时字数统计
  const nameInput = document.getElementById('wish-name');
  const rewardInput = document.getElementById('wish-reward');
  if (nameInput) nameInput.oninput = function() {
    const counter = document.getElementById('wish-name-count');
    if (counter) counter.textContent = this.value.length + '/20';
  };
  if (rewardInput) rewardInput.oninput = function() {
    const counter = document.getElementById('wish-reward-count');
    if (counter) counter.textContent = this.value.length + '/30';
  };
},
```

注意：此修改同时包含了 V25-020（返回箭头）、V25-063（maxlength + 字数统计）、V25-064（可选链 ?.）的修复。描述字段默认折叠，减少认知负担。

---

### 11. V25-057：战斗启动失败 toast 笼统（P1）

**文件**：`public/js/pages/wish.js`

**修改 startBattle() 的 try 块**（行 287-296）

已在第 2 条（V25-016）中重写了 startBattle()。在此基础上，将 Promise.all 拆分为独立 catch 以提供具体错误信息。

修改前（V25-016 修改后的 try 块）：

```js
try {
  const [itemData, prepared, characterData] = await Promise.all([
    API.get('/items'),
    API.post('/battle/prepare', { wish_id: wishId }),
    this.character ? Promise.resolve({ character: this.character }) : API.get('/character'),
  ]);
  this.battleItems = itemData.items;
  this.preparedBoss = prepared.boss;
  this.character = characterData?.character || this.character;
  this.renderBattle(document.getElementById('page-wish'));
} catch (e) {
  this.showBattle = false;
  this.selectedWish = null;
  this.preparedBoss = null;
  App.toast(e.message, 'error');
  this.render();
}
```

修改后：

```js
try {
  // V2.5 V25-057 - 各步骤独立 catch，提供具体错误文案
  const [itemData, prepared, characterData] = await Promise.all([
    API.get('/items').catch(() => { throw new Error('道具数据加载失败，请检查网络后重试'); }),
    API.post('/battle/prepare', { wish_id: wishId }).catch(() => { throw new Error('Boss 生成失败，请稍后重试'); }),
    this.character ? Promise.resolve({ character: this.character }) : API.get('/character').catch(() => { throw new Error('角色数据加载失败，请重新登录'); }),
  ]);
  this.battleItems = itemData.items;
  this.preparedBoss = prepared.boss;
  this.character = characterData?.character || this.character;
  this.renderBattle(document.getElementById('page-wish'));
} catch (e) {
  this.showBattle = false;
  this.selectedWish = null; // V2.5 V25-069
  this.preparedBoss = null;
  App.toast(e.message, 'error');
  this.render();
}
```

---

### 12. V25-058：战斗回合动画无完成提示（P1）

**文件**：`public/js/pages/wish.js`

**修改 showBattleResult() 中回合动画部分**（行 498-510）

修改前：

```js
const roundsContainer = document.getElementById('battle-rounds');
rounds.forEach((r, i) => {
  setTimeout(() => {
    const div = document.createElement('div');
    div.className = 'battle-round';
    div.style.animationDelay = '0s';
    div.innerHTML = `
      <div class="round-desc">第${r.round}回合：${e(r.description)}</div>
      <div class="round-detail">${e(r.userAction)} | ${e(r.bossAction)}</div>
    `;
    roundsContainer.appendChild(div);
  }, i * 600);
});
```

修改后：

```js
const roundsContainer = document.getElementById('battle-rounds');
// V2.5 V25-061 - 动画期间禁用返回按钮
const backBtn = document.querySelector('#page-wish .btn-primary[onclick*="closeBattle"]');
if (backBtn) backBtn.disabled = true;

rounds.forEach((r, i) => {
  setTimeout(() => {
    const div = document.createElement('div');
    div.className = 'battle-round';
    div.style.animationDelay = '0s';
    div.innerHTML = `
      <div class="round-desc">第${r.round}回合：${e(r.description)}</div>
      <div class="round-detail">${e(r.userAction)} | ${e(r.bossAction)}</div>
    `;
    roundsContainer.appendChild(div);

    // V2.5 V25-058 - 最后一回合：显示完成提示 + 滚动到结果
    if (i === rounds.length - 1) {
      const endDiv = document.createElement('div');
      endDiv.className = 'battle-round';
      endDiv.style.textAlign = 'center';
      endDiv.style.fontWeight = '700';
      endDiv.style.color = 'var(--text-dim)';
      endDiv.style.marginTop = '8px';
      endDiv.textContent = '— 战斗结束 —';
      roundsContainer.appendChild(endDiv);
      // 滚动到结果区域
      const resultEl = document.querySelector('.battle-result');
      if (resultEl) resultEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // V2.5 V25-061 - 动画结束后启用返回按钮
      if (backBtn) backBtn.disabled = false;
    }
  }, i * 600);
});
```

注意：此修改同时包含了 V25-061（动画期间禁用返回按钮）。

---

### 13. V25-059：兑现后状态短暂不一致（P1）

已在第 3 条（V25-017）中一并实现。redeem() 在 API 调用前立即禁用按钮并改文案为"兑现中…"，API 完成后 load() 刷新数据。

---

### 14. V25-060：主操作按钮样式不统一（P1）

**文件**：`public/js/pages/wish.js`

**修改 renderBattle() 中"开始挑战"按钮**（行 392-395）

修改前：

```html
<button class="btn btn-danger" style="font-size:16px;padding:14px"
  onclick="WishPage.executeBattle()" ${boss ? '' : 'disabled'}>
  开始挑战！
</button>
```

修改后：

```html
<button class="btn btn-primary" style="font-size:16px;padding:14px"
  onclick="WishPage.executeBattle()" ${boss ? '' : 'disabled'}>
  开始挑战！
</button>
```

将 `btn-danger` 改为 `btn-primary`。btn-danger 仅用于破坏性操作（如删除），挑战是正向操作。

---

### 15. V25-061：回合动画期间返回按钮可点击（P1）

已在第 12 条（V25-058）中一并实现。动画开始时禁用返回按钮，最后一回合结束后启用。

---

### 16. V25-062：筛选区域分组层级不清晰（P1）

**文件**：`public/js/pages/wish.js`

**修改 render() 中筛选栏**（行 95-111）

修改前：

```html
<div class="card">
  <div class="card-title">筛选</div>
  <div style="font-size:12px;color:var(--text-dim);margin-bottom:6px">愿望类型</div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
    ${['全部', '单人', '团队'].map(t => `
      <button class="btn btn-small ${this.typeFilter === t ? 'btn-primary' : 'btn-secondary'}"
        onclick="WishPage.setTypeFilter('${t}')">${t}</button>
    `).join('')}
  </div>
  <div style="font-size:12px;color:var(--text-dim);margin-bottom:6px">愿望状态</div>
  <div style="display:flex;gap:8px;flex-wrap:wrap">
    ${['全部', '待挑战', '进行中', '已完成', '已兑现'].map(s => `
      <button class="btn btn-small ${this.statusFilter === s ? 'btn-primary' : 'btn-secondary'}"
        onclick="WishPage.setStatusFilter('${s}')">${s}</button>
    `).join('')}
  </div>
</div>
```

修改后：

```html
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

注意：此修改同时包含了 V25-090（筛选激活时显示"清除筛选"按钮）。组标签字号从 12px 增大到 13px 并加粗，组间距从 8px 增大到 12px。

---

### 17. V25-063：愿望名称和奖励无最大长度（P1）

已在第 10 条（V25-056）中一并实现。name 加 `maxlength="20"`，reward 加 `maxlength="30"`，并绑定 oninput 显示实时字数。

---

### 18. V25-064：难度滑块 DOM 无安全访问（P1）

已在第 10 条（V25-056）中一并实现。`document.getElementById('diff-display').textContent` 改为 `document.getElementById('diff-display')?.textContent`。

---

### 19. V25-065：未登录时 canChallenge 静默失败（P1）

**文件**：`public/js/pages/wish.js`

**修改 canChallenge()**（行 187-195）

修改前：

```js
canChallenge(wish) {
  if (wish.status === 'completed' || wish.status === 'redeemed') return false;
  if (wish.type === '单人' && wish.target_user_id !== API.user.id) return false;
  if (wish.type === '团队' && Array.isArray(wish.teamProgress)) {
    const self = wish.teamProgress.find(m => m.id === API.user.id);
    if (self && self.status === '已通过') return false;
  }
  return true;
},
```

修改后：

```js
canChallenge(wish) {
  // V2.5 V25-065 - 未登录保护
  if (!API.user?.id) return false;
  if (wish.status === 'completed' || wish.status === 'redeemed') return false;
  if (wish.type === '单人' && wish.target_user_id !== API.user.id) return false;
  if (wish.type === '团队' && Array.isArray(wish.teamProgress)) {
    const self = wish.teamProgress.find(m => m.id === API.user.id);
    if (self && self.status === '已通过') return false;
  }
  return true;
},
```

同时在 render() 中挑战按钮区域（行 140-154），当 `!API.user?.id` 时显示提示：

修改前（行 142-143）：

```html
` : `
  <div style="font-size:12px;color:var(--text-dim)">
```

修改后：

```html
` : `
  <div style="font-size:12px;color:var(--text-dim)">
    ${!API.user?.id ? '请先登录后挑战' :
```

完整替换行 142-153：

```js
${this.canChallenge(w) ? `
  <button class="btn btn-primary" onclick="WishPage.startBattle(${w.id})">挑战Boss</button>
` : `
  <div style="font-size:12px;color:var(--text-dim)">
    ${(() => {
      if (!API.user?.id) return '请先登录后挑战'; // V2.5 V25-065
      if (w.type === '团队' && Array.isArray(w.teamProgress)) {
        const self = w.teamProgress.find(m => m.id === API.user.id);
        if (self?.status === '已通过') return '你已通过，等待其他成员';
      }
      if (w.status === 'in_progress') return '进行中';
      if (w.status === 'pending') return '待挑战';
      return '不可挑战';
    })()}
  </div>
`}
```

---

### 20. V25-066：战斗详情小屏显示拥挤（P1）

**文件**：`public/js/pages/wish.js`

**修改 showBattleResult() 中战斗详情区域**（行 464-475）

修改前：

```html
<div class="card" style="margin-top:12px">
  <div class="card-title">战斗详情</div>
  <div style="font-size:13px;line-height:1.8">
    永久属性战力：${result.user_base_power}<br>
    道具临时战力：+${result.user_item_power}<br>
    ${result.is_critical ? `暴击！伤害 ×${result.crit_damage}%<br>` : ''}
    ${result.is_combo ? `连击！战力 ×130%<br>` : ''}
    ${result.damage_reduction > 0 ? `减伤：${result.damage_reduction}%<br>` : ''}
    最终战力：${result.user_final_power}<br>
    Boss有效战力：${result.boss_power}
  </div>
</div>
```

修改后：

```html
<div class="card" style="margin-top:12px">
  <div class="card-title">战斗详情</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;font-size:13px;line-height:1.8">
    <div>⚔️ 永久属性</div><div>${result.user_base_power}</div>
    <div>🧪 道具加成</div><div>+${result.user_item_power}</div>
    ${result.is_critical ? `<div>💥 暴击</div><div>×${result.crit_damage}%</div>` : ''}
    ${result.is_combo ? `<div>⚡ 连击</div><div>×130%</div>` : ''}
    ${result.damage_reduction > 0 ? `<div>🛡️ 减伤</div><div>${result.damage_reduction}%</div>` : ''}
    <div style="font-weight:700">最终战力</div><div style="font-weight:700">${result.user_final_power}</div>
    <div style="color:var(--red)">Boss战力</div><div style="color:var(--red)">${result.boss_power}</div>
  </div>
</div>
```

---

### 21. V25-067：iOS Safari 难度滑块偏小（P1）

**文件**：`public/css/style.css`

在文件末尾追加：

```css
/* V2.5 V25-067 - iOS Safari range 滑块放大 */
input[type="range"] {
  -webkit-appearance: none;
  appearance: none;
  height: 8px;
  background: var(--border);
  border-radius: 4px;
  outline: none;
}
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--primary);
  cursor: pointer;
}
```

---

### 22. V25-068：closeBattle 未重置 battleResult（P1）

**文件**：`public/js/pages/wish.js`

**修改 closeBattle()**（行 405-409）

修改前：

```js
closeBattle() {
  this.showBattle = false;
  this.preparedBoss = null;
  this.render();
},
```

修改后：

```js
closeBattle() {
  this.showBattle = false;
  this.preparedBoss = null;
  this.battleResult = null; // V2.5 V25-068
  this.selectedWish = null; // 清理引用
  this.battleItems = [];
  this.battleSelectedIds.clear();
  this.render();
},
```

---

### 23. V25-069：startBattle 失败后 selectedWish 未清空（P1）

已在第 2 条（V25-016）中一并实现。catch 块中添加 `this.selectedWish = null; this.showBattle = false;`。

---

### 24. V25-070：团队愿望缺 teamProgress 时不显示（P1）

**文件**：`public/js/pages/wish.js`

**修改 render() 中团队进度部分**（行 135-139）

修改前：

```html
${w.type === '团队' && w.teamProgress ? `
  <div style="font-size:12px;color:var(--text-dim);margin-bottom:8px">
    ${w.teamProgress.map(m => `${e(m.name)}：${e(m.status)}`).join(' · ')}
  </div>
` : ''}
```

修改后：

```html
${w.type === '团队' ? `
  <div style="font-size:12px;color:var(--text-dim);margin-bottom:8px">
    ${Array.isArray(w.teamProgress) && w.teamProgress.length > 0
      ? w.teamProgress.map(m => `${e(m.name)}：${e(m.status)}`).join(' · ')
      : '团队进度加载中…'}
  </div>
` : ''}
```

---

### 25. V25-088：空状态引导文案偏小（P2）

**文件**：`public/js/pages/wish.js`

**修改 render() 中空状态部分**（行 113-118）

修改前：

```html
${pending.length === 0 && completed.length === 0 ? `
  <div class="empty-state">
    <div class="empty-icon">🌟</div>
    <div>还没有愿望</div>
    <div style="font-size:13px;margin-top:8px">许下你的第一个愿望吧</div>
  </div>
` : ''}
```

修改后：

```html
${pending.length === 0 && completed.length === 0 ? `
  <div class="empty-state" style="padding:40px 16px">
    <div class="empty-icon" style="font-size:48px">🌟</div>
    <div style="font-size:16px;font-weight:600;margin-top:12px">还没有愿望</div>
    <div style="font-size:14px;margin-top:8px;color:var(--text-dim)">许下你的第一个愿望吧</div>
    <button class="btn btn-primary btn-small" style="margin-top:16px" onclick="WishPage.openCreate()">立即许愿</button>
  </div>
` : ''}
```

增大图标（48px）、标题（16px 加粗）、描述（14px），并添加 CTA 按钮直接进入创建流程。

---

### 26. V25-089：胜算未知时无原因说明（P2）

**文件**：`public/js/pages/wish.js`

**修改 renderBattle() 中 Boss 未加载时的占位**（行 334-335）

修改前：

```html
${!boss ? `
  <div class="card"><div style="font-size:13px;color:var(--text-dim)">正在推演Boss天机...</div></div>
` : `
```

修改后：

```html
${!boss ? `
  <div class="card">
    <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-dim)">
      <div style="width:20px;height:20px;border:2px solid var(--border);border-top-color:var(--primary);border-radius:50%;animation:spin 0.8s linear infinite;flex-shrink:0"></div>
      正在推演Boss天机…
    </div>
    <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
  </div>
` : `
```

同时修改 getOddsText() 中胜算未知的返回值（行 33），增加说明：

修改前：

```js
if (!bossPower || bossPower <= 0) return { text: '胜算未知', color: 'var(--text-dim)' };
```

修改后：

```js
if (!bossPower || bossPower <= 0) return { text: '胜算未知（角色数据加载中…）', color: 'var(--text-dim)' };
```

---

### 27. V25-090：筛选激活状态无视觉提示（P2）

已在第 16 条（V25-062）中一并实现。当 typeFilter 或 statusFilter 不为"全部"时，在筛选卡片标题右侧显示"清除筛选"按钮。

---

## 执行顺序建议

分三批实施，每批内部无依赖可并行：

**第一批：基础防护（P0 核心）**

1. V25-015（submitCreate 防重复）
2. V25-017 + V25-059（redeem 确认 + 乐观更新）
3. V25-018（executeBattle 防重复）
4. V25-019（header flex 布局）
5. V25-020（返回箭头触控区域）
6. V25-021（checkbox 尺寸）

**第二批：战斗体验（P0 + P1 战斗相关）**

7. V25-016 + V25-057 + V25-069（startBattle loading + 错误文案 + 失败清理）
8. V25-022（胜算含道具加成）
9. V25-023（失败建议详细化）
10. V25-058 + V25-061（回合动画完成提示 + 禁用返回）
11. V25-060（按钮样式统一）
12. V25-068（closeBattle 重置）

**第三批：表单与筛选优化（P1 + P2）**

13. V25-056 + V25-063 + V25-064（表单重构 + maxlength + 可选链）
14. V25-062 + V25-090（筛选分组 + 清除按钮）
15. V25-065（未登录保护）
16. V25-066（战斗详情 grid 布局）
17. V25-067（iOS range 样式，style.css）
18. V25-070（团队进度占位）
19. V25-088（空状态 CTA）
20. V25-089（胜算未知说明）

## 新增属性汇总

以下属性需添加到 WishPage 对象属性区域（行 10-20 附近），与现有属性同级：

```js
submittingCreate: false, // V2.5 V25-015
executing: false,        // V2.5 V25-018
```

## 涉及 style.css 的修改

仅 V25-067 需要在 `public/css/style.css` 末尾追加 range 滑块自定义样式。其余所有修改均为 wish.js 内联样式。

## 验收检查清单

- [ ] V25-015：快速连点"创建愿望"按钮，只触发一次请求，按钮显示"创建中…"
- [ ] V25-016：点击"挑战Boss"后立即看到 spinner + "正在推演Boss天机…"
- [ ] V25-017：点击"兑现"弹出 confirm 对话框，取消后不发请求
- [ ] V25-018：点击"开始挑战"后按钮变为"挑战中…"且不可重复点击
- [ ] V25-019：小屏（320px 宽）下"愿望池"标题和"许愿"按钮不重叠
- [ ] V25-020：返回箭头触控区域 >= 44×44px
- [ ] V25-021：iOS Safari 上 checkbox 可见且易于点击
- [ ] V25-022：选择道具后胜算文案实时更新，显示"永久属性 X + 道具 Y vs Boss Z"
- [ ] V25-023：战败后显示五维属性对比表，标出差距最大属性和具体建议
- [ ] V25-056：创建表单默认只显示 4 个必填项，描述通过链接展开
- [ ] V25-057：道具/Boss/角色加载分别失败时，toast 显示对应的具体错误
- [ ] V25-058：最后一回合动画后显示"战斗结束"，自动滚动到结果区域
- [ ] V25-059：点击兑现后按钮立即变为"兑现中…"并禁用
- [ ] V25-060："开始挑战"按钮为 btn-primary 蓝色，非红色
- [ ] V25-061：回合动画播放期间"返回愿望池"按钮不可点击
- [ ] V25-062：筛选区域组标签加粗、组间距增大，层级清晰
- [ ] V25-063：愿望名称输入超过 20 字被截断，奖励超过 30 字被截断，右下角显示字数
- [ ] V25-064：难度滑块快速操作不报 DOM 错误
- [ ] V25-065：未登录状态下不显示挑战按钮，显示"请先登录后挑战"
- [ ] V25-066：小屏下战斗详情为两列网格，不拥挤
- [ ] V25-067：iOS Safari 上难度滑块 thumb 清晰可见、易拖动
- [ ] V25-068：从战斗结果返回后，再次进入战斗不残留上次结果
- [ ] V25-069：startBattle 网络失败后，页面正常回到愿望列表
- [ ] V25-070：团队愿望缺少 teamProgress 时显示"团队进度加载中…"
- [ ] V25-088：无愿望时空状态图标大、文案清晰、有"立即许愿"CTA
- [ ] V25-089：Boss 未加载时显示 spinner + 文案，胜算显示"角色数据加载中…"
- [ ] V25-090：筛选非"全部"时，标题栏出现"清除筛选"按钮
