# Codex 指令：V1.2.7 第四批 - 后端（数据报告系统）

> **需求来源**：策划案-07-数据报告系统
> **技术方案**：tech-v127-数据报告系统.md
> **执行顺序**：先执行本文件（后端），再执行前端指令

---

## 一、新增 reports 表（修改 server/db.js）

在 `initDB()` 末尾（`Seed default family` 之前）新增：

```js
  // V1.2.7 - 数据报告缓存表
  db.exec(`
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
  `);
```

---

## 二、新建 server/services/reportGen.js

完整文件内容：

```js
const { db } = require('../db');
const { SQL_TZ } = require('../utils/time');

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

// ─── 月报 ───

function generateMonthlyReport(userId, periodKey) {
  const [yearStr, monthStr] = periodKey.split('-');
  const year = parseInt(yearStr);
  const month = parseInt(monthStr);
  const totalDays = getDaysInMonth(year, month);
  const monthStart = `${periodKey}-01`;
  const monthEnd = `${periodKey}-${String(totalDays).padStart(2, '0')}`;

  // 1. 修炼天数
  const activeDaysRow = db.prepare(`
    SELECT COUNT(DISTINCT date(completed_at, '${SQL_TZ}')) AS active_days
    FROM behaviors WHERE user_id = ?
      AND date(completed_at, '${SQL_TZ}') BETWEEN ? AND ?
  `).get(userId, monthStart, monthEnd);
  const activeDays = activeDaysRow.active_days;

  if (activeDays === 0) return null;

  // 2. 活跃度评级
  const rating = getActivityRating(activeDays, totalDays);

  // 3. 五属性成长（本月获得的临时属性值汇总）
  const attrGrowthRows = db.prepare(`
    SELECT i.attribute_type, ROUND(SUM(i.temp_value), 1) AS total
    FROM items i
    JOIN behaviors b ON b.item_id = i.id
    WHERE b.user_id = ?
      AND date(b.completed_at, '${SQL_TZ}') BETWEEN ? AND ?
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
    SELECT sub_type, date(completed_at, '${SQL_TZ}') AS d
    FROM behaviors WHERE user_id = ?
      AND date(completed_at, '${SQL_TZ}') BETWEEN ? AND ?
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
      continue;
    } else {
      const prev = new Date(lastDate + 'T00:00:00Z');
      const curr = new Date(row.d + 'T00:00:00Z');
      const diffDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));
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
      AND date(b.completed_at, '${SQL_TZ}') BETWEEN ? AND ?
    GROUP BY i.quality
  `).all(userId, monthStart, monthEnd);

  const itemStats = { total: 0, byQuality: {} };
  for (const row of itemRows) {
    itemStats.byQuality[row.quality] = row.count;
    itemStats.total += row.count;
  }

  // 6. 境界（当前境界作为月末境界）
  const charRow = db.prepare(
    'SELECT realm_stage FROM characters WHERE user_id = ?'
  ).get(userId);

  // 7. 行为总次数
  const behaviorCountRow = db.prepare(`
    SELECT COUNT(*) AS count FROM behaviors
    WHERE user_id = ? AND date(completed_at, '${SQL_TZ}') BETWEEN ? AND ?
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

// ─── 季报 ───

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
      AND date(created_at, '${SQL_TZ}') BETWEEN ? AND ?
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

// ─── 年报 ───

function generateYearlyReport(userId, periodKey) {
  const year = parseInt(periodKey);

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
      AND strftime('%Y', created_at, '${SQL_TZ}') = ?
  `).get(userId, String(year));

  const rating = getActivityRating(totalActiveDays, totalDays);
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

// ─── 年度一句话评语 ───

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

module.exports = { generateMonthlyReport, generateQuarterlyReport, generateYearlyReport };
```

---

## 三、新建 server/routes/report.js

完整文件内容：

```js
const express = require('express');
const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { nowUTC8, SQL_TZ } = require('../utils/time');
const { generateMonthlyReport, generateQuarterlyReport, generateYearlyReport } = require('../services/reportGen');

const router = express.Router();
router.use(authMiddleware);

// 单次最多生成报告数，避免首次访问阻塞过久
const MAX_GENERATE_PER_REQUEST = 3;

/**
 * 计算用户所有可用的 period_key 列表
 * 从第一条行为记录所在月份到上个月/上季度/上年
 */
function getAvailablePeriods(userId) {
  const d = nowUTC8();
  const nowYear = d.getUTCFullYear();
  const nowMonth = d.getUTCMonth() + 1; // 1-12

  // 查询用户最早的行为记录日期
  const earliest = db.prepare(`
    SELECT date(MIN(completed_at), '${SQL_TZ}') AS first_date
    FROM behaviors WHERE user_id = ?
  `).get(userId);

  if (!earliest || !earliest.first_date) return { monthly: [], quarterly: [], yearly: [] };

  const firstDate = earliest.first_date; // 'YYYY-MM-DD'
  const firstYear = parseInt(firstDate.substring(0, 4));
  const firstMonth = parseInt(firstDate.substring(5, 7));

  // 月报：从 firstYear-firstMonth 到上个月
  const monthly = [];
  let y = firstYear, m = firstMonth;
  while (y < nowYear || (y === nowYear && m < nowMonth)) {
    monthly.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }

  // 季报：从第一条记录所在季度到上个完整季度
  const quarterly = [];
  const firstQuarter = Math.ceil(firstMonth / 3);
  const lastCompleteQuarter = nowMonth <= 3 ? { y: nowYear - 1, q: 4 }
    : { y: nowYear, q: Math.ceil(nowMonth / 3) - 1 };

  y = firstYear;
  let q = firstQuarter;
  while (y < lastCompleteQuarter.y || (y === lastCompleteQuarter.y && q <= lastCompleteQuarter.q)) {
    quarterly.push(`${y}-Q${q}`);
    q++;
    if (q > 4) { q = 1; y++; }
  }

  // 年报：从第一条记录所在年份到上个完整年份
  const yearly = [];
  for (let yr = firstYear; yr < nowYear; yr++) {
    yearly.push(String(yr));
  }

  return { monthly, quarterly, yearly };
}

// GET /api/report/list — 返回所有可用报告的元数据
router.get('/list', (req, res) => {
  const userId = req.user.id;
  const periods = getAvailablePeriods(userId);

  // 查询已缓存的报告
  const cached = db.prepare(
    'SELECT id, type, period_key, is_read, created_at FROM reports WHERE user_id = ?'
  ).all(userId);

  const cachedMap = {};
  for (const row of cached) {
    cachedMap[`${row.type}|${row.period_key}`] = row;
  }

  let generateCount = 0;
  const reports = [];

  // 按类型遍历所有可用周期
  const allPeriods = [
    ...periods.monthly.map(pk => ({ type: 'monthly', pk })),
    ...periods.quarterly.map(pk => ({ type: 'quarterly', pk })),
    ...periods.yearly.map(pk => ({ type: 'yearly', pk })),
  ];

  for (const { type, pk } of allPeriods) {
    const key = `${type}|${pk}`;
    if (cachedMap[key]) {
      reports.push(cachedMap[key]);
      continue;
    }

    // 未缓存，按需生成（限制单次生成数量）
    if (generateCount >= MAX_GENERATE_PER_REQUEST) continue;

    let data = null;
    if (type === 'monthly') data = generateMonthlyReport(userId, pk);
    else if (type === 'quarterly') data = generateQuarterlyReport(userId, pk);
    else if (type === 'yearly') data = generateYearlyReport(userId, pk);

    generateCount++;

    if (data) {
      const info = db.prepare(
        'INSERT OR IGNORE INTO reports (user_id, type, period_key, data) VALUES (?, ?, ?, ?)'
      ).run(userId, type, pk, JSON.stringify(data));

      if (info.changes > 0) {
        const row = db.prepare(
          'SELECT id, type, period_key, is_read, created_at FROM reports WHERE user_id = ? AND type = ? AND period_key = ?'
        ).get(userId, type, pk);
        if (row) reports.push(row);
      }
    }
  }

  // 按 period_key 倒序排列
  reports.sort((a, b) => b.period_key.localeCompare(a.period_key));

  res.json({ reports });
});

// GET /api/report/:id — 返回单个报告完整数据
router.get('/:id', (req, res) => {
  const userId = req.user.id;
  const reportId = parseInt(req.params.id);

  if (isNaN(reportId)) {
    return res.status(400).json({ error: '无效的报告 ID' });
  }

  const row = db.prepare(
    'SELECT * FROM reports WHERE id = ? AND user_id = ?'
  ).get(reportId, userId);

  if (!row) {
    return res.status(404).json({ error: '报告不存在' });
  }

  // 标记为已读
  if (!row.is_read) {
    db.prepare('UPDATE reports SET is_read = 1 WHERE id = ?').run(reportId);
  }

  res.json({
    id: row.id,
    type: row.type,
    period_key: row.period_key,
    data: JSON.parse(row.data),
    is_read: true,
    created_at: row.created_at,
  });
});

module.exports = router;
```

---

## 四、注册路由（修改 server/index.js）

在现有路由注册区域（`app.use('/api/behavior-goal', ...)` 之后）新增一行：

```js
app.use('/api/report', require('./routes/report'));
```

---

## 五、验证清单

1. 服务器启动无报错，reports 表自动创建
2. `GET /api/report/list` 返回 `{ reports: [...] }`，每项包含 id/type/period_key/is_read/created_at
3. 无行为记录的用户返回空数组
4. 有行为记录的用户，首次访问触发月报生成（最多 3 个），二次访问读缓存
5. `GET /api/report/:id` 返回完整报告数据（含 data JSON），同时标记 is_read = 1
6. 季报正确聚合三个月月报数据，包含 bossStats
7. 年报正确聚合全年数据，包含 motto 评语
8. SQL 查询统一使用 `SQL_TZ`（'+8 hours'），不使用 'localtime'
9. 报告 period_key 格式正确：月报 '2026-03'，季报 '2026-Q1'，年报 '2026'
