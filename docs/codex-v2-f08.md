# Codex 任务指令 — V2-F08「属性雷达图」

> 溯源标注：`// V2-F08 FB-08`
> 改动文件：`public/js/pages/home.js`（仅此一个文件）

---

## 任务描述

在首页「属性总览」卡片的 `.attr-list` 上方，插入一个纯 SVG 五维雷达图，直观展示角色五项属性的相对强弱。不引入任何外部库。

---

## 改动一：新增 `renderRadar(character)` 方法

在 `HomePage` 对象中，`render()` 方法之前，插入以下方法：

```js
// V2-F08 FB-08
renderRadar(character) {
  // V2-F08 FB-08 - 五维顺序（顶点从正上方顺时针排列）
  const DIMS = [
    { key: 'physique',      label: '体魄' },
    { key: 'comprehension', label: '悟性' },
    { key: 'willpower',     label: '心性' },
    { key: 'dexterity',     label: '灵巧' },
    { key: 'perception',    label: '神识' },
  ]; // V2-F08 FB-08

  const SIZE = 200;          // V2-F08 FB-08 - SVG 画布尺寸
  const CX = SIZE / 2;       // V2-F08 FB-08 - 中心 X
  const CY = SIZE / 2;       // V2-F08 FB-08 - 中心 Y
  const R  = 72;             // V2-F08 FB-08 - 最大半径（留出标签空间）
  const LABEL_R = R + 16;    // V2-F08 FB-08 - 标签距中心距离
  const N = DIMS.length;     // V2-F08 FB-08 - 维度数 = 5
  const cap = Number(character.attr_cap) || 1; // V2-F08 FB-08 - 防除零

  // V2-F08 FB-08 - 计算第 i 个顶点的角度（从正上方 -90° 开始，顺时针）
  const angle = i => (Math.PI * 2 * i) / N - Math.PI / 2; // V2-F08 FB-08

  // V2-F08 FB-08 - 极坐标 → 直角坐标
  const pt = (r, i) => ({
    x: CX + r * Math.cos(angle(i)),
    y: CY + r * Math.sin(angle(i)),
  }); // V2-F08 FB-08

  // V2-F08 FB-08 - 将点数组转为 SVG points 字符串
  const toPoints = pts => pts.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' '); // V2-F08 FB-08

  // V2-F08 FB-08 - 背景网格：3 层五边形（25% / 50% / 100%）
  const gridLevels = [0.25, 0.5, 1.0]; // V2-F08 FB-08
  const gridPolygons = gridLevels.map(level => {
    const pts = DIMS.map((_, i) => pt(R * level, i)); // V2-F08 FB-08
    return `<polygon points="${toPoints(pts)}" fill="none" stroke="var(--border)" stroke-width="1"/>`; // V2-F08 FB-08
  }).join('\n    '); // V2-F08 FB-08

  // V2-F08 FB-08 - 背景轴线：中心 → 各顶点
  const axisLines = DIMS.map((_, i) => {
    const tip = pt(R, i); // V2-F08 FB-08
    return `<line x1="${CX}" y1="${CY}" x2="${tip.x.toFixed(2)}" y2="${tip.y.toFixed(2)}" stroke="var(--border)" stroke-width="1"/>`; // V2-F08 FB-08
  }).join('\n    '); // V2-F08 FB-08

  // V2-F08 FB-08 - 数据多边形：归一化值 = min(当前值 / attr_cap, 1)
  const dataPts = DIMS.map((d, i) => {
    const ratio = Math.min(Number(character[d.key] || 0) / cap, 1); // V2-F08 FB-08
    return pt(R * ratio, i); // V2-F08 FB-08
  }); // V2-F08 FB-08
  const dataPolygon = `<polygon points="${toPoints(dataPts)}" fill="rgba(139,92,246,0.3)" stroke="var(--primary)" stroke-width="2"/>`; // V2-F08 FB-08

  // V2-F08 FB-08 - 顶点标签
  const labels = DIMS.map((d, i) => {
    const lp = pt(LABEL_R, i); // V2-F08 FB-08
    // V2-F08 FB-08 - 水平对齐：左侧 end，右侧 start，顶/底 middle
    const cos = Math.cos(angle(i));
    const anchor = cos < -0.1 ? 'end' : cos > 0.1 ? 'start' : 'middle'; // V2-F08 FB-08
    return `<text x="${lp.x.toFixed(2)}" y="${lp.y.toFixed(2)}" text-anchor="${anchor}" dominant-baseline="middle" font-size="11" fill="var(--text-secondary)">${d.label}</text>`; // V2-F08 FB-08
  }).join('\n    '); // V2-F08 FB-08

  // V2-F08 FB-08 - 拼装完整 SVG
  return `
    <svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"
      style="display:block;margin:0 auto 12px;overflow:visible">
      ${gridPolygons}
      ${axisLines}
      ${dataPolygon}
      ${labels}
    </svg>
  `; // V2-F08 FB-08
},
```

---

## 改动二：在 `render()` 中调用 `renderRadar`

定位 `render()` 方法内「属性总览」卡片的 HTML 片段，找到：

```js
        <div class="attr-list">
```

在其**正上方**插入 `this.renderRadar(character)` 的调用：

```js
        ${this.renderRadar(character)} <!-- V2-F08 FB-08 -->
        <div class="attr-list">
```

完整卡片片段改后如下（仅展示变更上下文）：

```js
      <div class="card">
        <div class="card-title">属性总览</div>
        ${this.renderRadar(character)} <!-- V2-F08 FB-08 -->
        <div class="attr-list">
          ${attrs.map(a => {
```

---

## 验收标准

1. 首页「属性总览」卡片内，条形属性列表上方出现一个 200×200 的五边形雷达图，五个顶点标签（体魄/悟性/心性/灵巧/神识）清晰可读，数据多边形填充色为半透明紫色，网格线与轴线使用主题色变量。
2. 当任意属性值为 0 时，雷达图正常渲染（数据多边形退化为点/线），不报 JS 错误；当属性值达到 `attr_cap` 时，对应顶点恰好触及最外层网格边界。
