# Codex 指令：V2.6 首页趋势图

> 关联需求：V2.6 首页新增最近 7 天属性获取趋势图
> 涉及文件：public/js/pages/home.js
> 数据来源：GET /character 返回的 trend 字段（已有，无需新增后端接口）
> 明细数据：GET /behavior/history?year=YYYY&month=MM（已有接口，返回 `{ "2026-04-10": [{id, sub_type, quality, item_name, completed_at}, ...] }`）

---

## 修改总览表

| 序号 | 简述 | 修改类型 | 涉及方法/位置 |
|------|------|---------|--------------|
| 1 | 新增趋势图状态属性 | 属性声明 | HomePage 对象顶部 |
| 2 | 新增 renderTrend(trend) 方法 | 新方法 | HomePage |
| 3 | 新增 toggleTrendDetail(dateStr) 方法 | 新方法 | HomePage |
| 4 | 新增 renderTrendDetail() 方法 | 新方法 | HomePage |
| 5 | render() 中插入趋势图 | 修改现有方法 | render() |

---

## 详细修改指令

### 1. 新增趋势图状态属性

**文件**：`public/js/pages/home.js`

**位置**：HomePage 对象属性声明区域（行 24 `settingStatus: false` 之后）

插入：

```js
trendDetailDate: null, // V2.6 - 趋势图当前展开的日期
trendDetailData: null, // V2.6 - 当天行为明细数据
```

修改后该区域完整样貌：

```js
const HomePage = {
  data: null,
  cultivationStatus: null,
  achievements: [],
  promoting: false,
  settingStatus: false,
  trendDetailDate: null, // V2.6 - 趋势图当前展开的日期
  trendDetailData: null, // V2.6 - 当天行为明细数据
```

---

### 2. 新增 renderTrend(trend) 方法

**文件**：`public/js/pages/home.js`

**位置**：在 `renderRadar(character)` 方法之后、`render()` 方法之前插入整个新方法。

```js
// V2.6 - 趋势图：最近 7 天属性值堆叠柱状图
renderTrend(trend) {
  if (!trend || !trend.days) return '';
  const e = API.escapeHtml.bind(API);

  const ATTR_COLORS = {
    physique: '#e57373',
    comprehension: '#64b5f6',
    willpower: '#ba68c8',
    dexterity: '#81c784',
    perception: '#ffb74d',
  };
  const ATTR_SHORT = {
    physique: '体',
    comprehension: '悟',
    willpower: '心',
    dexterity: '灵',
    perception: '神',
  };
  const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
  const attrs = ['physique', 'comprehension', 'willpower', 'dexterity', 'perception'];

  // 计算每天各属性的 tempValue
  const dailyData = trend.days.map((day, i) => {
    const values = {};
    let total = 0;
    for (const attr of attrs) {
      const v = trend.byAttribute[attr]?.tempValues[i] || 0;
      values[attr] = v;
      total += v;
    }
    return { day, values, total };
  });

  const maxTotal = Math.max(...dailyData.map(d => d.total), 0.1); // 避免除以 0
  const today = new Date().toISOString().slice(0, 10);

  // 检查是否全空
  const allEmpty = dailyData.every(d => d.total === 0);
  if (allEmpty) {
    return `
      <div class="card" style="margin-bottom:12px">
        <div class="card-title">本周修炼趋势</div>
        <div class="empty-state" style="padding:24px 16px">
          <div style="font-size:14px;color:var(--text-dim)">还没有修炼记录，上报第一条行为开始积累趋势</div>
          <button class="btn btn-primary btn-small" style="margin-top:12px" onclick="App.navigate('behavior')">去上报 →</button>
        </div>
      </div>
    `;
  }

  // 图例
  const legend = attrs.map(a =>
    `<span style="display:inline-flex;align-items:center;gap:2px;margin-left:6px">
      <span style="width:8px;height:8px;border-radius:2px;background:${ATTR_COLORS[a]}"></span>
      <span style="font-size:11px;color:var(--text-dim)">${ATTR_SHORT[a]}</span>
    </span>`
  ).join('');

  // 柱状图
  const chartHeight = 120;
  const bars = dailyData.map(d => {
    const isToday = d.day === today;
    const barHeight = d.total > 0 ? Math.max(Math.round((d.total / maxTotal) * chartHeight), 4) : 2;
    const weekday = WEEKDAYS[new Date(d.day + 'T00:00:00').getDay()];

    // 堆叠色块（column-reverse：physique 在底部，perception 在顶部）
    let blocks = '';
    if (d.total > 0) {
      blocks = attrs.map((attr, ai) => {
        const pct = d.values[attr] > 0 ? Math.max(Math.round((d.values[attr] / d.total) * 100), 2) : 0;
        if (pct === 0) return '';
        // column-reverse 下第一个渲染的元素在最底部，所以 physique(index=0) 在底部
        // 圆角：最顶部的可见色块需要顶部圆角，最底部的需要底部圆角
        const isTop = ai === attrs.length - 1 || attrs.slice(ai + 1).every(a => d.values[a] === 0);
        const isBottom = ai === 0 || attrs.slice(0, ai).every(a => d.values[a] === 0);
        const radius = `${isTop ? '4px 4px' : '0 0'} ${isBottom ? '4px 4px' : '0 0'}`;
        return `<div style="width:100%;height:${pct}%;background:${ATTR_COLORS[attr]};border-radius:${radius}"></div>`;
      }).join('');
    } else {
      blocks = `<div style="width:100%;height:2px;background:var(--border);border-radius:1px"></div>`;
    }

    return `
      <div style="display:flex;flex-direction:column;align-items:center;width:28px;cursor:pointer"
        onclick="HomePage.toggleTrendDetail('${d.day}')">
        <div style="width:100%;height:${barHeight}px;display:flex;flex-direction:column-reverse${isToday ? ';box-shadow:0 0 6px rgba(139,92,246,0.4)' : ''}">
          ${blocks}
        </div>
        <div style="font-size:11px;color:${isToday ? 'var(--primary)' : 'var(--text-dim)'};margin-top:4px;font-weight:${isToday ? '700' : '400'}">${weekday}</div>
        <div style="font-size:10px;color:var(--text-dim)">${d.total > 0 ? d.total.toFixed(1) : ''}</div>
      </div>
    `;
  }).join('');

  // 明细区域
  const detailHtml = this.trendDetailDate ? this.renderTrendDetail() : '';

  return `
    <div class="card" style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div class="card-title" style="margin-bottom:0">本周修炼趋势</div>
        <div>${legend}</div>
      </div>
      <div style="display:flex;align-items:flex-end;justify-content:center;gap:8px;height:${chartHeight}px;padding:8px 0">
        ${bars}
      </div>
      ${detailHtml}
    </div>
  `;
},
```

---

### 3. 新增 toggleTrendDetail(dateStr) 方法

**文件**：`public/js/pages/home.js`

**位置**：紧接 `renderTrend()` 之后插入。

```js
// V2.6 - 点击柱子展开/收起当天行为明细
async toggleTrendDetail(dateStr) {
  if (this.trendDetailDate === dateStr) {
    this.trendDetailDate = null;
    this.trendDetailData = null;
    this.render(); // 重新渲染收起明细
    return;
  }

  this.trendDetailDate = dateStr;
  this.trendDetailData = null;
  this.render(); // 先渲染"加载中"

  try {
    const [year, month] = dateStr.split('-');
    // 复用已有的 behavior/history 接口，返回 { "2026-04-10": [...], ... }
    const history = await API.get(`/behavior/history?year=${year}&month=${month}`);
    this.trendDetailData = history[dateStr] || [];
    this.render();
  } catch (err) {
    this.trendDetailData = [];
    this.render();
  }
},
```

---

### 4. 新增 renderTrendDetail() 方法

**文件**：`public/js/pages/home.js`

**位置**：紧接 `toggleTrendDetail()` 之后插入。

```js
// V2.6 - 渲染趋势图点击展开的当天行为明细
renderTrendDetail() {
  const e = API.escapeHtml.bind(API);
  const dateStr = this.trendDetailDate;
  if (!dateStr) return '';

  const d = new Date(dateStr + 'T00:00:00');
  const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
  const label = `${d.getMonth() + 1}月${d.getDate()}日（周${WEEKDAYS[d.getDay()]}）`;

  if (this.trendDetailData === null) {
    return `<div style="margin-top:12px;font-size:13px;color:var(--text-dim)">加载中…</div>`;
  }

  if (this.trendDetailData.length === 0) {
    return `<div style="margin-top:12px;font-size:13px;color:var(--text-dim)">${label} — 无记录</div>`;
  }

  // 用品质推算总属性值
  const QUALITY_VALUES = { '凡品': 1, '良品': 1.5, '上品': 2, '极品': 3 };
  const totalValue = this.trendDetailData.reduce((s, b) => {
    return s + (QUALITY_VALUES[b.quality] || 1);
  }, 0);

  const rows = this.trendDetailData.map(b => {
    const q = ['凡品', '良品', '上品', '极品'].includes(b.quality) ? b.quality : '凡品';
    return `
      <div class="item-row" style="padding:6px 0">
        <div class="item-info">
          <div class="item-name">${e(b.sub_type)}</div>
          <div class="item-meta">
            <span class="quality-${q}">${e(q)}</span>
            ${b.item_name ? `· ${e(b.item_name)}` : ''}
          </div>
        </div>
        <div class="item-meta">${new Date(b.completed_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</div>
      </div>
    `;
  }).join('');

  return `
    <div style="margin-top:12px;border-top:1px solid var(--border);padding-top:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span style="font-size:13px;font-weight:600">${label}</span>
        <span style="font-size:12px;color:var(--gold)">属性 +${totalValue.toFixed(1)}</span>
      </div>
      ${rows}
    </div>
  `;
},
```

---

### 5. render() 中插入趋势图

**文件**：`public/js/pages/home.js`

**修改 render() 方法**

**修改 1：解构 trend 数据**（行 281）

修改前：

```js
const { character, promotion, decayStatus } = this.data;
```

修改后：

```js
const { character, promotion, decayStatus, trend } = this.data;
```

**修改 2：在雷达图卡片之后、推荐卡片之前插入趋势图**（行 393-394 之间）

修改前：

```js
      </div>

      ${this.renderRecommendations(character)} <!-- V2-F03 FB-01 -->
```

修改后：

```js
      </div>

      ${this.renderTrend(trend)}

      ${this.renderRecommendations(character)} <!-- V2-F03 FB-01 -->
```

即在 `</div>`（属性总览卡片闭合标签）之后、`renderRecommendations` 调用之前，插入 `${this.renderTrend(trend)}`。

---

## 验收检查清单

| # | 检查项 | 预期结果 |
|---|--------|---------|
| 1 | 首页加载后雷达图下方出现趋势图卡片 | 显示"本周修炼趋势"标题 + 图例 + 7 根柱子 |
| 2 | 柱子按五属性分色堆叠 | 体魄红、悟性蓝、心性紫、灵巧绿、神识橙，从下到上 |
| 3 | 最高柱占满 120px 高度，其余按比例缩放 | 视觉上比例正确 |
| 4 | 当天柱子有紫色发光效果 | box-shadow 可见 |
| 5 | 当天星期几文字为主题色加粗 | 与其他天视觉区分明显 |
| 6 | 无行为的天显示 2px 灰色底线 | 不显示空白 |
| 7 | 柱子下方显示星期几 + 总属性值 | 如"三"和"5.0" |
| 8 | 卡片标题右侧显示五色图例 | 体/悟/心/灵/神 |
| 9 | 点击某天柱子展开明细 | 显示日期标题 + 属性总值 + 行为列表 |
| 10 | 明细中每条显示：行为名 · 品质（着色）· 道具名 | 品质用 quality-XX class 着色 |
| 11 | 再次点击同一天柱子收起明细 | 明细区域消失 |
| 12 | 点击另一天柱子切换明细 | 旧明细消失，新明细展开 |
| 13 | 7 天全无行为时显示空状态 | "还没有修炼记录" + "去上报 →"按钮 |
| 14 | 空状态按钮点击跳转行为页 | App.navigate('behavior') 正常工作 |
| 15 | trend 字段不存在时不渲染趋势图 | 不报错，不显示空卡片 |
