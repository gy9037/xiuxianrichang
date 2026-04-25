# 技术方案：V1.2.7 数据报告系统

> 需求来源：策划案-07-数据报告系统
> 优先级：P2
> 影响范围：新增报告生成服务、报告路由、报告页面、数据库 reports 表
> 新增文件：`server/services/reportGen.js`、`server/routes/report.js`、`miniprogram/pages/report/`
> 修改文件：`server/db.js`、`server/index.js`、`miniprogram/app.json`

---

## 一、概述

### 1.1 功能目标

为用户提供月/季/年三个维度的阶段性修炼总结，以数据提炼和成就感为核心，生成可保存分享的图卡。

### 1.2 设计约束

- 懒生成：用户访问时按需生成，生成后缓存到 reports 表，后续直接读取
- 覆盖周期内无任何行为记录的用户不生成报告
- 季报复用月报数据，年报复用月报数据，避免重复查询
- 时区统一用 SQL 层 `date(completed_at, 'localtime')` 或 `strftime(..., 'localtime')`
- 图卡在小程序端用 Canvas API 绘制，后端只提供 JSON 数据

---

## 二、数据设计

### 2.1 新增表：reports

在 `server/db.js` 的 `initDB()` 中添加：

```sql
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  period_key TEXT NOT NULL,
  data TEXT NOT NULL,
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, type, period_key),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

字段说明：
- `type`：'monthly' | 'quarterly' | 'yearly'
- `period_key`：'2026-03' | '2026-Q1' | '2026'
- `data`：JSON 字符串，报告全量数据
- `is_read`：用户是否已查看（用于未读标记）

### 2.2 period_key 规则

| 报告类型 | period_key 格式 | 示例 | 覆盖范围 |
|---------|----------------|------|---------|
| monthly | YYYY-MM | 2026-03 | 2026年3月1日至3月31日 |
| quarterly | YYYY-QN | 2026-Q1 | 2026年1月1日至3月31日 |
| yearly | YYYY | 2025 | 2025年1月1日至12月31日 |

### 2.3 可用报告的判定

用户访问报告列表时，后端检查哪些周期可以生成报告：
- 月报：从用户第一条行为记录所在月份到上个月
- 季报：从用户第一条行为记录所在季度到上个完整季度
- 年报：从用户第一条行为记录所在年份到上个完整年份

---

## 三、后端实现

### 3.1 server/services/reportGen.js

#### 3.1.1 辅助函数

```js
const { db } = require('../db');

const ATTR_FIELDS = ['physique', 'comprehension', 'willpower', 'dexterity', 'perception'];
const ATTR_NAMES = {
  physique: '体魄', comprehension: '悟性', willpower: '心性',
  dexterity: '灵巧', perception: '神识',
};

const ACTIVITY_RATINGS = [
  { threshold: 0.9, level: '至诚', flavor: '月无虚日，道心坚韧堪称楷模' },
  { threshold: 0.6, level: '精进', flavor: '修炼颇为稳定，灵台清明' },
  { threshold: 0.3, level: '勤勉', flavor: '已见道心萌动，继续坚持' },
  { threshold: 0,   level: '散漫', flavor: '修炼时断时续，道心尚需磨砺' },
];

function getActivityRating(activeDays, totalDays) {
  const ratio = activeDays / totalDays;
  for (const r of ACTIVITY_RATINGS) {
    if (ratio >= r.threshold) return { level: r.level, flavor: r.flavor, ratio: Math.round(ratio * 100) };
  }
  return ACTIVITY_RATINGS[ACTIVITY_RATINGS.length - 1];
}

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function getQuarterMonths(year, quarter) {
  const startMonth = (quarter - 1) * 3 + 1;
  return [startMonth, startMonth + 1, startMonth + 2];
}
```

#### 3.1.2 generateMonthlyReport(userId, periodKey)

periodKey 格式：'2026-03'

```js
function generateMonthlyReport(userId, periodKey) {
  const [yearStr, monthStr] = periodKey.split('-');
  const year = parseInt(yearStr);
  const month = parseInt(monthStr);
  const totalDays = getDaysInMonth(year, month);
  const monthStart = `${periodKey}-01`;
  const monthEnd = `${periodKey}-${String(totalDays).padStart(2, '0')}`;

  // 1. 修炼天数
  const activeDaysRow = db.prepare(`
    SELECT COUNT(DISTINCT date(completed_at, 'localtime')) AS active_days
    FROM behaviors WHERE user_id = ?
      AND date(completed_at, 'localtime') BETWEEN ? AND ?
  `).get(userId, monthStart, monthEnd);
  const activeDays = activeDaysRow.active_days;

  // 无行为记录则不生成
  if (activeDays === 0) return null;

  // 2. 活跃度评级
  const rating = getActivityRating(activeDays, totalDays);

  // 3. 五属性成长（本月获得的临时属性值汇总）
  const attrGrowthRows = db.prepare(`
    SELECT i.attribute_type, ROUND(SUM(i.temp_value), 1) AS total
    FROM items i
    JOIN behaviors b ON b.item_id = i.id
    WHERE b.user_id = ?
      AND date(b.completed_at, 'localtime') BETWEEN ? AND ?
    GROUP BY i.attribute_type
  `).all(userId, monthStart, monthEnd);

  const attrGrowth = {};
  for (const f of ATTR_FIELDS) attrGrowth[f] = 0;
  for (const row of attrGrowthRows) {
    if (attrGrowth.hasOwnProperty(row.attribute_type)) {
      attrGrowth[row.attribute_type] = row.total;
    }
  }

  // 4. 最长 Streak（本月内按 sub_type 计算连续天数）
  const streakRows = db.prepare(`
    SELECT sub_type, date(completed_at, 'localtime') AS d
    FROM behaviors WHERE user_id = ?
      AND date(completed_at, 'localtime') BETWEEN ? AND ?
    ORDER BY sub_type, d
  `).all(userId, monthStart, monthEnd);

  let bestStreak = { subType: '', days: 0 };
  let currentSubType = '';
  let currentStreak = 0;
  let lastDate = '';

  for (const row of streakRows) {
    if (row.sub_type !== currentSubType) {
      currentSubType = row.sub_type;
      currentStreak = 1;
      lastDate = row.d;
    } else if (row.d === lastDate) {
      // 同一天同一行为，跳过
      continue;
    } else {
      // 检查是否连续（相差1天）
      const prev = new Date(lastDate + 'T00:00:00');
      const curr = new Date(row.d + 'T00:00:00');
      const diffDays = (curr - prev) / (1000 * 60 * 60 * 24);
      if (diffDays === 1) {
        currentStreak++;
      } else {
        currentStreak = 1;
      }
      lastDate = row.d;
    }
    if (currentStreak > bestStreak.days) {
      bestStreak = { subType: currentSubType, days: currentStreak };
    }
  }

  // 5. 道具收获
  const itemRows = db.prepare(`
    SELECT i.quality, COUNT(*) AS count
    FROM items i
    JOIN behaviors b ON b.item_id = i.id
    WHERE b.user_id = ?
      AND date(b.completed_at, 'localtime') BETWEEN ? AND ?
    GROUP BY i.quality
  `).all(userId, monthStart, monthEnd);

  const itemStats = { total: 0, byQuality: {} };
  for (const row of itemRows) {
    itemStats.byQuality[row.quality] = row.count;
    itemStats.total += row.count;
  }

  // 6. 境界变化（比较月初和月末的 realm_stage）
  // 由于没有 realm 变更历史表，只能检查当前境界
  // 简化方案：查 characters 当前境界，标记为月末境界
  const charRow = db.prepare(
    'SELECT realm_stage FROM characters WHERE user_id = ?'
  ).get(userId);

  // 7. 行为总次数
  const behaviorCountRow = db.prepare(`
    SELECT COUNT(*) AS count FROM behaviors
    WHERE user_id = ? AND date(completed_at, 'localtime') BETWEEN ? AND ?
  `).get(userId, monthStart, monthEnd);

  return {
    periodKey,
    type: 'monthly',
    year, month, totalDays, activeDays,
    rating,
    attrGrowth,
    bestStreak,
    itemStats,
    behaviorCount: behaviorCountRow.count,
    realmStage: charRow?.realm_stage || '练气一阶',
  };
}
```

#### 3.1.3 generateQuarterlyReport(userId, periodKey)

periodKey 格式：'2026-Q1'

```js
function generateQuarterlyReport(userId, periodKey) {
  const [yearStr, qStr] = periodKey.split('-');
  const year = parseInt(yearStr);
  const quarter = parseInt(qStr.replace('Q', ''));
  const months = getQuarterMonths(year, quarter);

  // 确保三个月的月报都已生成
  const monthlyReports = [];
  for (const m of months) {
    const mk = `${year}-${String(m).padStart(2, '0')}`;
    let cached = db.prepare(
      'SELECT data FROM reports WHERE user_id = ? AND type = ? AND period_key = ?'
    ).get(userId, 'monthly', mk);

    if (!cached) {
      const report = generateMonthlyReport(userId, mk);
      if (report) {
        db.prepare(
          'INSERT OR IGNORE INTO reports (user_id, type, period_key, data) VALUES (?, ?, ?, ?)'
        ).run(userId, 'monthly', mk, JSON.stringify(report));
        monthlyReports.push(report);
      }
    } else {
      monthlyReports.push(JSON.parse(cached.data));
    }
  }

  if (monthlyReports.length === 0) return null;

  // 聚合
  let totalActiveDays = 0;
  let totalDays = 0;
  let totalBehaviorCount = 0;
  const attrGrowth = {};
  for (const f of ATTR_FIELDS) attrGrowth[f] = 0;
  const itemStats = { total: 0, byQuality: {} };
  let bestMonth = null;
  let bestStreak = { subType: '', days: 0 };

  for (const r of monthlyReports) {
    totalActiveDays += r.activeDays;
    totalDays += r.totalDays;
    totalBehaviorCount += r.behaviorCount;
    for (const f of ATTR_FIELDS) attrGrowth[f] += r.attrGrowth[f];
    itemStats.total += r.itemStats.total;
    for (const [q, c] of Object.entries(r.itemStats.byQuality)) {
      itemStats.byQuality[q] = (itemStats.byQuality[q] || 0) + c;
    }
    if (!bestMonth || r.activeDays > bestMonth.activeDays) {
      bestMonth = { month: r.month, activeDays: r.activeDays };
    }
    if (r.bestStreak.days > bestStreak.days) {
      bestStreak = r.bestStreak;
    }
  }

  // 四舍五入属性值
  for (const f of ATTR_FIELDS) attrGrowth[f] = Math.round(attrGrowth[f] * 10) / 10;

  // Boss 战绩（季度范围）
  const qStart = `${year}-${String(months[0]).padStart(2, '0')}-01`;
  const lastMonth = months[2];
  const qEndDay = getDaysInMonth(year, lastMonth);
  const qEnd = `${year}-${String(lastMonth).padStart(2, '0')}-${String(qEndDay).padStart(2, '0')}`;

  const bossRow = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) AS wins
    FROM battles
    WHERE user_id = ?
      AND date(created_at, 'localtime') BETWEEN ? AND ?
  `).get(userId, qStart, qEnd);

  const rating = getActivityRating(totalActiveDays, totalDays);

  return {
    periodKey, type: 'quarterly',
    year, quarter, months: months.map(m => `${year}-${String(m).padStart(2, '0')}`),
    totalDays, totalActiveDays, rating,
    attrGrowth, bestStreak, itemStats,
    behaviorCount: totalBehaviorCount,
    bestMonth,
    bossStats: {
      total: bossRow.total,
      wins: bossRow.wins,
      winRate: bossRow.total > 0 ? Math.round((bossRow.wins / bossRow.total) * 100) : 0,
    },
    realmStage: monthlyReports[monthlyReports.length - 1]?.realmStage || '练气一阶',
  };
}
```

#### 3.1.4 generateYearlyReport(userId, periodKey)

periodKey 格式：'2026'

```js
function generateYearlyReport(userId, periodKey) {
  const year = parseInt(periodKey);

  // 确保 12 个月的月报都已生成
  const monthlyReports = [];
  for (let m = 1; m <= 12; m++) {
    const mk = `${year}-${String(m).padStart(2, '0')}`;
    let cached = db.prepare(
      'SELECT data FROM reports WHERE user_id = ? AND type = ? AND period_key = ?'
    ).get(userId, 'monthly', mk);

    if (!cached) {
      const report = generateMonthlyReport(userId, mk);
      if (report) {
        db.prepare(
          'INSERT OR IGNORE INTO reports (user_id, type, period_key, data) VALUES (?, ?, ?, ?)'
        ).run(userId, 'monthly', mk, JSON.stringify(report));
        monthlyReports.push(report);
      }
    } else {
      monthlyReports.push(JSON.parse(cached.data));
    }
  }

  if (monthlyReports.length === 0) return null;

  // 聚合（同季报逻辑）
  let totalActiveDays = 0;
  let totalDays = 0;
  let totalBehaviorCount = 0;
  const attrGrowth = {};
  for (const f of ATTR_FIELDS) attrGrowth[f] = 0;
  const itemStats = { total: 0, byQuality: {} };
  let bestMonth = null;
  let bestStreak = { subType: '', days: 0 };

  for (const r of monthlyReports) {
    totalActiveDays += r.activeDays;
    totalDays += r.totalDays;
    totalBehaviorCount += r.behaviorCount;
    for (const f of ATTR_FIELDS) attrGrowth[f] += r.attrGrowth[f];
    itemStats.total += r.itemStats.total;
    for (const [q, c] of Object.entries(r.itemStats.byQuality)) {
      itemStats.byQuality[q] = (itemStats.byQuality[q] || 0) + c;
    }
    if (!bestMonth || r.activeDays > bestMonth.activeDays) {
      bestMonth = { month: r.month, activeDays: r.activeDays };
    }
    if (r.bestStreak.days > bestStreak.days) {
      bestStreak = r.bestStreak;
    }
  }

  for (const f of ATTR_FIELDS) attrGrowth[f] = Math.round(attrGrowth[f] * 10) / 10;

  // Boss 战绩（全年）
  const bossRow = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) AS wins
    FROM battles
    WHERE user_id = ?
      AND strftime('%Y', created_at, 'localtime') = ?
  `).get(userId, String(year));

  const rating = getActivityRating(totalActiveDays, totalDays);

  // 年度一句话评语
  const motto = generateYearlyMotto(totalActiveDays, attrGrowth, bestStreak, bossRow);

  return {
    periodKey, type: 'yearly', year,
    totalDays, totalActiveDays, rating,
    attrGrowth, bestStreak, itemStats,
    behaviorCount: totalBehaviorCount,
    bestMonth,
    bossStats: {
      total: bossRow.total,
      wins: bossRow.wins,
      winRate: bossRow.total > 0 ? Math.round((bossRow.wins / bossRow.total) * 100) : 0,
    },
    realmStage: monthlyReports[monthlyReports.length - 1]?.realmStage || '练气一阶',
    motto,
  };
}
```

#### 3.1.5 年度一句话评语

```js
const YEARLY_MOTTOS = [
  { check: (d) => d.activeDays >= 300, text: '三百余日无间断，此志可感天地。' },
  { check: (d) => d.bestAttrGrowth >= 20, text: (d) => `${d.bestAttrName}一道，深耕细作，成就斐然。` },
  { check: (d) => d.bestStreak >= 30, text: '坚守一事，三十日不辍，此乃修炼之根本。' },
  { check: (d) => d.bossWinRate >= 80 && d.bossTotal >= 5, text: '征战沙场，所向披靡，武道精进。' },
  { check: (d) => d.activeDays < 100, text: '起步虽迟，道路仍在，来年当更勤勉。' },
  { check: () => true, text: '春风化雨，道心坚韧，来年更进一步。' },
];

function generateYearlyMotto(activeDays, attrGrowth, bestStreak, bossRow) {
  let bestAttrGrowth = 0;
  let bestAttrName = '';
  for (const [k, v] of Object.entries(attrGrowth)) {
    if (v > bestAttrGrowth) {
      bestAttrGrowth = v;
      bestAttrName = ATTR_NAMES[k] || k;
    }
  }

  const ctx = {
    activeDays,
    bestAttrGrowth,
    bestAttrName,
    bestStreak: bestStreak.days,
    bossWinRate: bossRow.total > 0 ? Math.round((bossRow.wins / bossRow.total) * 100) : 0,
    bossTotal: bossRow.total,
  };

  for (const rule of YEARLY_MOTTOS) {
    if (rule.check(ctx)) {
      return typeof rule.text === 'function' ? rule.text(ctx) : rule.text;
    }
  }
  return '春风化雨，道心坚韧，来年更进一步。';
}
```

#### 3.1.6 导出

```js
module.exports = { generateMonthlyReport, generateQuarterlyReport, generateYearlyReport };
```

---

## 四、API 设计

### 4.1 server/routes/report.js

#### GET /api/report/list

返回用户所有可用报告的列表。对于尚未生成的报告，按需触发生成。

请求：无参数（从 token 获取 user_id）

响应：
```json
{
  "reports": [
    {
      "id": 1,
      "type": "monthly",
      "period_key": "2026-03",
      "is_read": false,
      "created_at": "2026-04-01T00:00:00"
    }
  ]
}
```

实现逻辑：
1. 查询用户最早的行为记录日期
2. 计算从最早月份到上个月的所有 period_key
3. 对每个 period_key，检查 reports 表是否已有缓存
4. 未缓存的调用 reportGen 生成并写入
5. 返回所有报告的元数据（不含 data 字段，减少传输量）

注意：首次访问可能触发多个月报生成，需要控制性能。限制单次最多生成 3 个报告，其余下次访问时继续生成。

#### GET /api/report/:id

返回单个报告的完整数据。

响应：
```json
{
  "id": 1,
  "type": "monthly",
  "period_key": "2026-03",
  "data": { ... },
  "is_read": true
}
```

同时将 is_read 标记为 1。

### 4.2 路由注册

在 `server/index.js` 中添加：
```js
app.use('/api/report', require('./routes/report'));
```

---

## 五、前端实现

### 5.1 新增页面

`miniprogram/pages/report/report.js`、`report.json`、`report.wxml`、`report.wxss`

在 `app.json` 的 pages 数组中添加：
```json
"pages/report/report"
```

### 5.2 页面结构

报告页面分两个视图：

1. 报告列表视图：按时间倒序展示所有可用报告，未读的有标记
2. 报告详情视图：展示报告数据 + Canvas 图卡

### 5.3 入口

从首页 HUD 区域或 Tab 进入。建议在首页添加一个入口按钮（如浮动按钮组中新增"报告"按钮）。

### 5.4 Canvas 图卡绘制

#### 5.4.1 Canvas 配置

```html
<canvas type="2d" id="reportCanvas" style="width:375px;height:500px;" />
```

实际绘制分辨率 750x1000（2倍像素密度）。

#### 5.4.2 文字版兜底

Canvas 绘制失败时（如低端机型不支持 Canvas 2D），降级为 WXML 模板渲染报告数据。

实现方式：
- 页面 data 中维护 `canvasReady` 标志，默认 false
- Canvas 初始化成功后置为 true，绘制图卡
- 若 Canvas 初始化抛异常或超时 3 秒未完成，保持 false，展示 WXML 文字版
- WXML 文字版复用报告 JSON 数据，用 `wx:if="{{!canvasReady}}"` 控制显示
- 文字版不提供保存到相册功能，仅供查看

#### 5.4.3 绘制流程伪代码（月报）

```js
async function drawReportCard(canvas, data) {
  const ctx = canvas.getContext('2d');
  const dpr = 2;
  canvas.width = 750;
  canvas.height = 1000;

  // 1. 背景
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, 750, 1000);

  // 2. 标题区
  ctx.fillStyle = '#f59e0b';
  ctx.font = 'bold 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${data.month}月修炼月报`, 375, 60);

  // 3. 修炼天数 + 活跃度
  ctx.fillStyle = '#f1f5f9';
  ctx.font = '24px sans-serif';
  ctx.fillText(`修炼天数 ${data.activeDays} 天 · ${data.rating.level}`, 375, 120);

  // 4. 属性成长区（五行横排）
  let y = 180;
  for (const attr of ATTR_FIELDS) {
    const name = ATTR_NAMES[attr];
    const val = data.attrGrowth[attr];
    ctx.fillText(`${name} +${val}`, x, y);
    y += 40;
  }

  // 5. 最长坚持
  ctx.fillText(`最长坚持 ${data.bestStreak.subType} · 连续 ${data.bestStreak.days} 天`, 375, y + 20);

  // 6. 道具收获
  // 7. 底部评语
  // 8. App 名称

  // 导出为图片
  return canvas.toDataURL('image/png');
}
```

#### 5.4.4 季报/年报图卡绘制

季报和年报图卡与月报共用同一套绘制框架（背景、配色、字体），通过报告 type 分支渲染不同内容区块。

季报图卡额外区块：
- 季度修炼天数（totalActiveDays / totalDays + 百分比）
- 最强月份（bestMonth）
- Boss 战绩（total + winRate）
- 属性成长标注"三月合计"

年报图卡额外区块：
- 属性成长带进度条（用 `ctx.fillRect` 按比例绘制横条，最大值属性占满宽度，其余按比例缩放）
- 最高境界（realmStage）
- 年度最佳月份
- Boss 战绩
- 年度一句话评语（motto，居中，金色字体）
- 底部 App 名称（"修仙日常"）

三种图卡统一尺寸 750x1000，统一导出逻辑。建议抽取 `drawReportCard(canvas, type, data)` 函数，内部按 type 分支绘制。

#### 5.4.5 保存到相册

```js
saveToAlbum() {
  wx.canvasToTempFilePath({
    canvas: this.canvas,
    success(res) {
      wx.saveImageToPhotosAlbum({
        filePath: res.tempFilePath,
        success() { wx.showToast({ title: '已保存', icon: 'success' }); },
        fail() { wx.showToast({ title: '保存失败', icon: 'none' }); },
      });
    },
  });
}
```

---

## 六、db.js 改动

在 `initDB()` 末尾添加 reports 表创建语句（见第二节）。

---

## 七、改动文件清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新增 | `server/services/reportGen.js` | 报告生成服务（月/季/年） |
| 新增 | `server/routes/report.js` | GET /api/report/list, GET /api/report/:id |
| 新增 | `miniprogram/pages/report/report.js` | 报告页面逻辑 |
| 新增 | `miniprogram/pages/report/report.json` | 页面配置 |
| 新增 | `miniprogram/pages/report/report.wxml` | 页面模板 |
| 新增 | `miniprogram/pages/report/report.wxss` | 页面样式 |
| 修改 | `server/db.js` | initDB 中新增 reports 表 |
| 修改 | `server/index.js` | 注册 /api/report 路由 |
| 修改 | `miniprogram/app.json` | pages 数组新增 report 页面 |
| 修改 | `miniprogram/pages/home/home.wxml` | 新增报告入口按钮 |
| 修改 | `miniprogram/pages/home/home.js` | 新增跳转报告页逻辑 |

---

## 八、测试要点

1. 月报生成：创建跨月行为数据，验证天数统计、属性汇总、streak 计算正确
2. 缓存机制：首次访问生成，二次访问读缓存，验证 data 一致
3. 空数据：无行为记录的月份不生成报告
4. 季报聚合：验证三个月数据正确汇总，Boss 战绩统计准确
5. 年报评语：验证优先级规则按序匹配
6. Canvas 图卡：验证在不同机型上绘制正常，保存到相册功能可用
7. 性能：首次访问限制最多生成 3 个报告，避免长时间阻塞
