# Codex 任务指令 — V2-F09「境界与难度文案优化」

溯源标注：`// V2-F09 FB-07`

---

## 任务概述

两处独立改动，互不依赖，可并行执行。

---

## 改动 1：境界名称加通俗解释

**文件**：`public/js/pages/home.js`

**定位方式**：搜索 `character.realm_stage` 或渲染角色境界名称的字符串插值位置（如 `${character.realm_stage}` 或 `e(character.realm_stage)`）。

**改动内容**：

在该文件顶部（或 `character.realm_stage` 首次使用前）插入映射表，然后将所有渲染境界名称的地方替换为带括号说明的格式。

```js
// V2-F09 FB-07 - 境界通俗解释映射
const REALM_DESC = {
  '练气一阶': '初入修仙', '练气二阶': '感知灵气', '练气三阶': '引气入体',
  '练气四阶': '气感稳固', '练气五阶': '小有所成', '练气六阶': '灵气充盈',
  '练气七阶': '道心初现', '练气八阶': '根基深厚', '练气九阶': '蓄势待发', '练气十阶': '练气圆满',
  '筑基一阶': '筑基初成', '筑基二阶': '根基稳固', '筑基三阶': '道基渐成',
  '筑基四阶': '灵台清明', '筑基五阶': '筑基中期', '筑基六阶': '道心坚定',
  '筑基七阶': '根基浑厚', '筑基八阶': '筑基后期', '筑基九阶': '蜕变在即', '筑基十阶': '筑基圆满',
};
```

渲染时将原来的：

```js
${character.realm_stage}
// 或
e(character.realm_stage)
```

替换为：

```js
// V2-F09 FB-07 - 展示格式：练气一阶（初入修仙）
${character.realm_stage}${REALM_DESC[character.realm_stage] ? `（${REALM_DESC[character.realm_stage]}）` : ''}
```

若原处使用了 `e()`，则：

```js
// V2-F09 FB-07
${e(character.realm_stage)}${REALM_DESC[character.realm_stage] ? `（${REALM_DESC[character.realm_stage]}）` : ''}
```

---

## 改动 2：愿望难度滑块加参考锚点

**文件**：`public/js/pages/wish.js`

**定位方式**：`renderCreate` 方法内，找到以下现有代码块：

```js
<input type="range" id="wish-difficulty" min="1" max="10" value="3"
  oninput="document.getElementById('diff-display').textContent=this.value"
  style="width:100%;accent-color:var(--primary)">
<div style="text-align:center;font-size:20px;font-weight:700;color:var(--gold)" id="diff-display">3</div>
```

**改动内容**：在 `diff-display` div 之后，紧接插入参考锚点说明：

```js
<input type="range" id="wish-difficulty" min="1" max="10" value="3"
  oninput="document.getElementById('diff-display').textContent=this.value"
  style="width:100%;accent-color:var(--primary)">
<div style="text-align:center;font-size:20px;font-weight:700;color:var(--gold)" id="diff-display">3</div>
<!-- V2-F09 FB-07 - 难度参考锚点 -->
<div style="font-size:11px;color:var(--text-dim);margin-top:6px;line-height:1.8">
  1-3分：小确幸（一杯奶茶、一部电影）<br>
  4-6分：小目标（一次聚餐、一件新衣服）<br>
  7-9分：大愿望（一次旅行、一件大礼物）<br>
  10分：终极愿望（全家共同的大目标）
</div>
```

---

## 验收标准

1. 首页角色卡片中，境界名称显示为「练气一阶（初入修仙）」格式；未收录的境界名称不显示括号，不报错。
2. 许愿表单中，难度滑块下方显示四行参考锚点文案，样式为小字灰色，不影响滑块交互和数值提交。
