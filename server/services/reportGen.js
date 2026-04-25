const { db } = require('../db');
const { SQL_TZ } = require('../utils/time');

const ATTR_FIELDS = ['physique', 'comprehension', 'willpower', 'dexterity', 'perception'];
const ATTR_NAMES = {
  physique: '体魄',
  comprehension: '悟性',
  willpower: '心性',
  dexterity: '灵巧',
  perception: '神识',
};

const ACTIVITY_RATINGS = [
  { threshold: 0.9, level: '至诚', flavor: '月无虚日，道心坚韧堪称楷模' },
  { threshold: 0.6, level: '精进', flavor: '修炼颇为稳定，灵台清明' },
  { threshold: 0.3, level: '勤勉', flavor: '已见道心萌动，继续坚持' },
  { threshold: 0, level: '散漫', flavor: '修炼时断时续，道心尚需磨砺' },
];

function getActivityRating(activeDays, totalDays) {
  const ratio = totalDays > 0 ? activeDays / totalDays : 0;
  for (const r of ACTIVITY_RATINGS) {
    if (ratio >= r.threshold) {
      return { level: r.level, flavor: r.flavor, ratio: Math.round(ratio * 100) };
    }
  }
  const fallback = ACTIVITY_RATINGS[ACTIVITY_RATINGS.length - 1];
  return { level: fallback.level, flavor: fallback.flavor, ratio: 0 };
}

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function getQuarterMonths(year, quarter) {
  const startMonth = (quarter - 1) * 3 + 1;
  return [startMonth, startMonth + 1, startMonth + 2];
}

function generateMonthlyReport(userId, periodKey) {
  const [yearStr, monthStr] = periodKey.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const totalDays = getDaysInMonth(year, month);
  const monthStart = `${periodKey}-01`;
  const monthEnd = `${periodKey}-${String(totalDays).padStart(2, '0')}`;

  const activeDaysRow = db.prepare(`
    SELECT COUNT(DISTINCT date(completed_at, '${SQL_TZ}')) AS active_days
    FROM behaviors
    WHERE user_id = ?
      AND date(completed_at, '${SQL_TZ}') BETWEEN ? AND ?
  `).get(userId, monthStart, monthEnd);
  const activeDays = activeDaysRow.active_days;

  if (activeDays === 0) return null;

  const rating = getActivityRating(activeDays, totalDays);

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
    if (Object.prototype.hasOwnProperty.call(attrGrowth, row.attribute_type)) {
      attrGrowth[row.attribute_type] = row.total;
    }
  }

  const streakRows = db.prepare(`
    SELECT sub_type, date(completed_at, '${SQL_TZ}') AS d
    FROM behaviors
    WHERE user_id = ?
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
      const prev = new Date(`${lastDate}T00:00:00Z`);
      const curr = new Date(`${row.d}T00:00:00Z`);
      const diffDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        currentStreak += 1;
      } else {
        currentStreak = 1;
      }
      lastDate = row.d;
    }

    if (currentStreak > bestStreak.days) {
      bestStreak = { subType: currentSubType, days: currentStreak };
    }
  }

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

  const charRow = db.prepare('SELECT realm_stage FROM characters WHERE user_id = ?').get(userId);

  const behaviorCountRow = db.prepare(`
    SELECT COUNT(*) AS count
    FROM behaviors
    WHERE user_id = ?
      AND date(completed_at, '${SQL_TZ}') BETWEEN ? AND ?
  `).get(userId, monthStart, monthEnd);

  return {
    periodKey,
    type: 'monthly',
    year,
    month,
    totalDays,
    activeDays,
    rating,
    attrGrowth,
    bestStreak,
    itemStats,
    behaviorCount: behaviorCountRow.count,
    realmStage: charRow?.realm_stage || '练气一阶',
  };
}

function generateQuarterlyReport(userId, periodKey) {
  const [yearStr, qStr] = periodKey.split('-');
  const year = parseInt(yearStr, 10);
  const quarter = parseInt(qStr.replace('Q', ''), 10);
  const months = getQuarterMonths(year, quarter);

  const monthlyReports = [];
  for (const m of months) {
    const mk = `${year}-${String(m).padStart(2, '0')}`;
    const cached = db.prepare(
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

  for (const f of ATTR_FIELDS) {
    attrGrowth[f] = Math.round(attrGrowth[f] * 10) / 10;
  }

  const qStart = `${year}-${String(months[0]).padStart(2, '0')}-01`;
  const lastMonth = months[2];
  const qEndDay = getDaysInMonth(year, lastMonth);
  const qEnd = `${year}-${String(lastMonth).padStart(2, '0')}-${String(qEndDay).padStart(2, '0')}`;

  const bossRow = db.prepare(`
    SELECT
      COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END), 0) AS wins
    FROM battles
    WHERE user_id = ?
      AND date(created_at, '${SQL_TZ}') BETWEEN ? AND ?
  `).get(userId, qStart, qEnd);

  const rating = getActivityRating(totalActiveDays, totalDays);

  return {
    periodKey,
    type: 'quarterly',
    year,
    quarter,
    months: months.map((m) => `${year}-${String(m).padStart(2, '0')}`),
    totalDays,
    totalActiveDays,
    rating,
    attrGrowth,
    bestStreak,
    itemStats,
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

function generateYearlyReport(userId, periodKey) {
  const year = parseInt(periodKey, 10);

  const monthlyReports = [];
  for (let m = 1; m <= 12; m += 1) {
    const mk = `${year}-${String(m).padStart(2, '0')}`;
    const cached = db.prepare(
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

  for (const f of ATTR_FIELDS) {
    attrGrowth[f] = Math.round(attrGrowth[f] * 10) / 10;
  }

  const bossRow = db.prepare(`
    SELECT
      COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END), 0) AS wins
    FROM battles
    WHERE user_id = ?
      AND strftime('%Y', created_at, '${SQL_TZ}') = ?
  `).get(userId, String(year));

  const rating = getActivityRating(totalActiveDays, totalDays);
  const motto = generateYearlyMotto(totalActiveDays, attrGrowth, bestStreak, bossRow);

  return {
    periodKey,
    type: 'yearly',
    year,
    totalDays,
    totalActiveDays,
    rating,
    attrGrowth,
    bestStreak,
    itemStats,
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

const YEARLY_MOTTOS = [
  { check: (d) => d.activeDays >= 300, text: '三百余日无间断，此志可感天地。' },
  {
    check: (d) => d.bestAttrGrowth >= 20,
    text: (d) => `${d.bestAttrName}一道，深耕细作，成就斐然。`,
  },
  { check: (d) => d.bestStreak >= 30, text: '坚守一事，三十日不辍，此乃修炼之根本。' },
  { check: (d) => d.bossWinRate >= 80 && d.bossTotal >= 5, text: '征战沙场，所向披靡，武道精进。' },
  { check: (d) => d.activeDays < 100, text: '起步虽迟，道路仍在，来年当更勤勉。' },
  { check: () => true, text: '春风化雨，道心坚韧，来年更进一步。' },
];

module.exports = {
  generateMonthlyReport,
  generateQuarterlyReport,
  generateYearlyReport,
};
