# Codex Task: V2-F02 道具合成透明化

## 溯源标注
所有新增或修改的代码行，必须添加注释：`// V2-F02 FB-02`

---

## 背景说明
合成预览（已选道具总值、可合成永久属性、浪费提示）已在 `renderItems()` 中实现。
本次只需补充**合成规则说明弹窗**：首次进入背包页自动弹出，之后可通过"？"按钮随时查看。

---

## 任务一：`public/js/pages/inventory.js`

### 改动 A：新增 `showSynthesisRule()` 方法

在 `InventoryPage` 对象末尾（`redeem()` 方法之后）插入：

```js
// V2-F02 FB-02 - 合成规则说明弹窗
showSynthesisRule() {
  const existing = document.getElementById('synthesis-rule-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'synthesis-rule-modal';
  modal.style.cssText = `
    position:fixed;top:0;left:0;right:0;bottom:0;
    background:rgba(0,0,0,0.7);z-index:200;
    display:flex;align-items:center;justify-content:center;padding:24px;
  `;
  modal.innerHTML = `
    <div style="background:var(--bg-card);border-radius:var(--radius);padding:24px;max-width:320px;width:100%">
      <div style="font-size:16px;font-weight:700;color:var(--gold);margin-bottom:16px">⚗️ 炼化规则</div>
      <div style="font-size:13px;color:var(--text-secondary);line-height:1.8">
        <p>每次行为上报会生成一个<b>修仙道具</b>，道具有临时属性值：</p>
        <p>· 凡品 = 1点 &nbsp; 良品 = 1.5点</p>
        <p>· 上品 = 2点 &nbsp; 极品 = 3点</p>
        <p style="margin-top:12px">选择同属性道具进行<b>炼化</b>，规则如下：</p>
        <p>· 临时属性值总和 ÷ 10 取整 = 获得永久属性</p>
        <p>· 余数部分会随道具一起消耗（浪费）</p>
        <p style="margin-top:12px;color:var(--text-dim)">示例：10个凡品（总值10）→ 永久+1，无浪费</p>
        <p style="color:var(--text-dim)">示例：7个良品（总值10.5）→ 永久+1，浪费0.5</p>
      </div>
      <button class="btn btn-primary" style="width:100%;margin-top:20px"
        onclick="document.getElementById('synthesis-rule-modal').remove()">明白了</button>
    </div>
  `;
  document.body.appendChild(modal);
},
```

### 改动 B：`load()` 中首次进入自动弹出规则说明

在 `load()` 方法的 `this.render()` 之后插入：

```js
// V2-F02 FB-02 - 首次进入背包页自动弹出合成规则说明
if (!localStorage.getItem('synthesis_rule_shown')) {
  localStorage.setItem('synthesis_rule_shown', '1');
  setTimeout(() => this.showSynthesisRule(), 300);
}
```

### 改动 C：`render()` 中页面标题加"？"按钮

找到 `render()` 方法中的：
```js
<div class="page-header">背包</div>
```

替换为：
```js
<div class="page-header" style="display:flex;align-items:center;justify-content:space-between">
  <span>背包</span>
  <span style="font-size:13px;color:var(--primary);cursor:pointer"
    onclick="InventoryPage.showSynthesisRule()">⚗️ 炼化规则</span>
</div>
<!-- V2-F02 FB-02 - 右上角随时可查看合成规则 -->
```

---

## 验收标准

1. 首次进入背包页，自动弹出炼化规则说明弹窗，点"明白了"关闭后不再自动弹出
2. 页面右上角有"⚗️ 炼化规则"按钮，点击可随时查看规则弹窗
3. 选中道具后底部合成预览正常显示"可合成+X点永久属性"和"浪费Y点"（此功能已有，确认未被破坏）
