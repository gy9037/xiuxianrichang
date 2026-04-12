# Codex 指令：V2.5 周报功能

> 关联策划案：docs/iteration-v2.5.md
> 涉及文件：server/routes/behavior.js, public/js/pages/behavior.js
> 替换现有"本周汇总"卡片，升级为完整周报

---

## 修改总览表

| 序号 | 类型 | 简述 | 涉及文件 | 状态 |
|------|------|------|---------|------|
| 1 | 后端 | 扩展 GET /behavior/weekly-summary 返回完整周报数据 | server/routes/behavior.js | 待实现 |
| 2 | 前端 | 新增 renderWeeklyReport(summary) 方法 | public/js/pages/behavior.js | 待实现 |
| 3 | 前端 | renderHistory() 中替换 summaryCard 为周报调用 | public/js/pages/behavior.js | 待实现 |
| 4 | 前端 | 更新 weeklySummary 属性注释 | public/js/pages/behavior.js | 待实现 |

---

## 详细修改指令

### 1. 后端：扩展 GET /behavior/weekly-summary

**文件**：`server/routes/behavior.js`

**修改位置**：行 359-372（整个 `/weekly-summary` 路由）

修改前：

```js
// V2-F07 - 本周行为数和道具数汇总
router.get('/weekly-summary', (req, res) => {
  const rows = db.prepare(
    `SELECT b.id, b.item_id
     FROM behaviors b
     WHERE b.user_id = ?
       AND b.completed_at >= datetime('now', 'localtime', 'weekday 0', '-7 days')`
  ).all(req.user.id);

  const behavior_count = rows.length;
  const item_count = rows.filter(r => r.item_id !== null).length;

  res.json({ behavior_count, item_count });
});
```

修改后：

```js
// V2.5 - 周报数据（替换原 V2-F07 本周汇总）
router.get('/weekly-summary', (req, res) => {
  const userId = req.user.id;

  // 计算本周范围：周日到周六
  // strftime('%w') 返回 0=周日, 1=周一, ..., 6=周六
  // 如果今天是周日(0)，week_start = 今天；否则 week_start = 上一个周日
  const weekRange = db.prepare(`
    SELECT
      date('now', 'localtime', '-' || strftime('%w', 'now', 'localtime') || ' days') AS week_start,
      date('now', 'localtime', '-' || strftime('%w', 'now', 'localtime') || ' days', '+6 days') AS week_end
  `).get();

  const { week_start, week_end } = weekRange;

  // 1. behavior_count + item_count（向后兼容）
  const counts = db.prepare(`
    SELECT
      COUNT(*) AS behavior_count,
      COUNT(item_id) AS item_count
    FROM behaviors
    WHERE user_id = ?
      AND date(completed_at, 'localtime') BETWEEN ? AND ?
  `).get(userId, week_start, week_end);

  // 2. active_days：本周有记录的不同日期数
  const activeDaysRow = db.prepare(`
    SELECT COUNT(DISTINCT date(completed_at, 'localtime')) AS active_days
    FROM behaviors
    WHERE user_id = ?
      AND date(completed_at, 'localtime') BETWEEN ? AND ?
  `).get(userId, week_start, week_end);

  // 3. category_distribution：按 category 分组计数，降序，最多 5 条
  const category_distribution = db.prepare(`
    SELECT category, COUNT(*) AS count
    FROM behaviors
    WHERE user_id = ?
      AND date(completed_at, 'localtime') BETWEEN ? AND ?
    GROUP BY category
    ORDER BY count DESC
    LIMIT 5
  `).all(userId, week_start, week_end);

  // 4. quality_distribution：按 quality 分组计数
  const qualityRows = db.prepare(`
    SELECT quality, COUNT(*) AS count
    FROM behaviors
    WHERE user_id = ?
      AND date(completed_at, 'localtime') BETWEEN ? AND ?
    GROUP BY quality
  `).all(userId, week_start, week_end);

  const quality_distribution = {};
  qualityRows.forEach(r => { quality_distribution[r.quality] = r.count; });

  // 5. streak：从今天往前数连续有记录的天数
  // 先检查今天是否有记录
  const todayStr = db.prepare(`SELECT date('now', 'localtime') AS today`).get().today;
  const hasTodayRow = db.prepare(`
    SELECT COUNT(*) AS cnt
    FROM behaviors
    WHERE user_id = ?
      AND date(completed_at, 'localtime') = ?
  `).get(userId, todayStr);
  const hasToday = hasTodayRow.cnt > 0;

  // 获取所有有记录的日期（降序），从起始日开始往前数连续天数
  const startDate = hasToday ? todayStr : db.prepare(`SELECT date('now', 'localtime', '-1 day') AS d`).get().d;
  const activeDates = db.prepare(`
    SELECT DISTINCT date(completed_at, 'localtime') AS d
    FROM behaviors
    WHERE user_id = ?
      AND date(completed_at, 'localtime') <= ?
    ORDER BY d DESC
    LIMIT 365
  `).all(userId, startDate);

  let streak = 0;
  let expectedDate = startDate;
  for (const row of activeDates) {
    if (row.d === expectedDate) {
      streak++;
      // 计算前一天
      expectedDate = db.prepare(`SELECT date(?, '-1 day') AS d`).get(expectedDate).d;
    } else {
      break;
    }
  }

  const streak_note = (!hasToday && streak > 0) ? '截至昨日' : null;

  res.json({
    week_start,
    week_end,
    behavior_count: counts.behavior_count,
    item_count: counts.item_count,
    active_days: activeDaysRow.active_days,
    category_distribution,
    quality_distribution,
    streak,
    streak_note,
  });
});
```

**实现要点**：

- 周范围用 `strftime('%w')` 计算，周日 = 0，所以 `date('now', '-' || %w || ' days')` 就是本周周日
- `COUNT(item_id)` 等价于 `COUNT(CASE WHEN item_id IS NOT NULL)` —— `COUNT()` 自动忽略 NULL
- streak 循环中用 `date(?, '-1 day')` 逐日回退比较，最多查 365 天
- 向后兼容：`behavior_count` 和 `item_count` 字段保留

---

### 2. 前端：新增 renderWeeklyReport(summary) 方法

**文件**：`public/js/pages/behavior.js`

**插入位置**：在 `renderHistory()` 方法之前（行 160 之前），作为 `BehaviorPage` 对象的新方法。

插入以下代码：

```js
  // V2.5 - 周报卡片渲染
  renderWeeklyReport(summary) {
    if (!summary) {
      return '<div class="card" style="margin-bottom:12px"><div class="item-meta">加载中…</div></div>';
    }

    // 格式化日期 YYYY-MM-DD → M/D
    const fmtDate = (s) => { const p = s.split('-'); return `${+p[1]}/${+p[2]}`; };

    // 区块 1 — 本周概览
    const overviewBlock = `
      <div class="card-title">本周修炼报告（${fmtDate(summary.week_start)} - ${fmtDate(summary.week_end)}）</div>
      <div style="display:flex;gap:24px;font-size:14px;margin-bottom:16px">
        <span>行为 <strong>${summary.behavior_count}</strong> 次</span>
        <span>道具 <strong>${summary.item_count}</strong> 件</span>
        <span>活跃 <strong>${summary.active_days}/7</strong> 天</span>
      </div>
    `;

    // 区块 2 — 类别分布（横向条形图）
    let categoryBlock = '';
    if (summary.category_distribution && summary.category_distribution.length > 0) {
      const maxCount = summary.category_distribution[0].count;
      const bars = summary.category_distribution.map(c => {
        const pct = maxCount > 0 ? Math.round((c.count / maxCount) * 100) : 0;
        return `
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:13px">
            <span style="min-width:56px;text-align:right;color:var(--text-dim)">${c.category}</span>
            <div style="flex:1;height:8px;background:var(--bg-card-light, #f0f0f0);border-radius:4px;overflow:hidden">
              <div style="width:${pct}%;height:100%;background:var(--primary);border-radius:4px"></div>
            </div>
            <span style="min-width:28px;font-size:12px;color:var(--text-dim)">${c.count}次</span>
          </div>
        `;
      }).join('');
      categoryBlock = `<div style="margin-bottom:16px">${bars}</div>`;
    }

    // 区块 3 — 品质分布（一行标签）
    let qualityBlock = '';
    const qd = summary.quality_distribution;
    if (qd && Object.keys(qd).length > 0) {
      const qualityOrder = ['凡品', '良品', '上品', '极品'];
      const tags = qualityOrder
        .filter(q => qd[q])
        .map(q => {
          const cls = ['凡品', '良品', '上品', '极品'].includes(q) ? q : '凡品';
          return `<span class="quality-${cls}" style="font-size:13px">${q} ×${qd[q]}</span>`;
        }).join('&nbsp;&nbsp;&nbsp;');
      if (tags) {
        qualityBlock = `<div style="margin-bottom:16px">${tags}</div>`;
      }
    }

    // 区块 4 — 连续修炼（streak）
    let streakBlock = '';
    if (summary.streak > 0) {
      const note = summary.streak_note ? `<span style="font-size:12px;color:var(--text-dim)">（${summary.streak_note}）</span>` : '';
      streakBlock = `<div style="font-size:14px">🔥 连续修炼 <strong>${summary.streak}</strong> 天${note}</div>`;
    } else {
      streakBlock = `<div style="font-size:13px;color:var(--text-dim)">今天开始新的连续修炼吧</div>`;
    }

    return `
      <div class="card" style="margin-bottom:12px">
        ${overviewBlock}
        ${categoryBlock}
        ${qualityBlock}
        ${streakBlock}
      </div>
    `;
  },
```

---

### 3. 前端：renderHistory() 中替换 summaryCard

**文件**：`public/js/pages/behavior.js`

**修改位置**：行 170-178（summaryCard 变量）

修改前：

```js
    const summaryCard = summary ? `
      <div class="card" style="margin-bottom:12px">
        <div class="card-title">本周汇总</div>
        <div style="display:flex;gap:24px;font-size:14px">
          <span>行为 <strong>${summary.behavior_count}</strong> 次</span>
          <span>道具 <strong>${summary.item_count}</strong> 件</span>
        </div>
      </div>
    ` : '<div class="card" style="margin-bottom:12px"><div class="item-meta">加载中…</div></div>';
```

修改后：

```js
    const summaryCard = this.renderWeeklyReport(summary); // V2.5 周报
```

---

### 4. 前端：更新 weeklySummary 属性注释

**文件**：`public/js/pages/behavior.js`

**修改位置**：行 15

修改前：

```js
  weeklySummary: null, // V2-F07 - { behavior_count, item_count }
```

修改后：

```js
  weeklySummary: null, // V2.5 - 周报数据 { week_start, week_end, behavior_count, item_count, active_days, category_distribution, quality_distribution, streak, streak_note }
```

---

## 验收检查清单

- [ ] GET /behavior/weekly-summary 返回完整 JSON，包含 week_start, week_end, behavior_count, item_count, active_days, category_distribution, quality_distribution, streak, streak_note
- [ ] week_start 是周日，week_end 是周六（week_start + 6 天）
- [ ] behavior_count 和 item_count 与旧接口逻辑一致（向后兼容）
- [ ] active_days 正确统计本周有记录的不同日期数
- [ ] category_distribution 按次数降序，最多 5 条
- [ ] quality_distribution 按品质分组计数
- [ ] streak 正确计算连续天数：今天有记录从今天算，无记录从昨天算
- [ ] streak_note 在今天无记录但 streak > 0 时为 "截至昨日"
- [ ] 周报卡片正确显示 4 个区块：概览、类别条形图、品质标签、streak
- [ ] 类别条形图最大值 = 100%，其余按比例缩放
- [ ] 品质标签使用对应 quality-XX CSS class 着色
- [ ] streak = 0 时显示"今天开始新的连续修炼吧"
- [ ] 日期格式为 M/D（如 4/6 - 4/12）
- [ ] loadHistory() 缓存逻辑不变，切换月份不重新请求周报
- [ ] 旧的"本周汇总"卡片已被完全替换
