const express = require('express');
const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { nowUTC8, SQL_TZ } = require('../utils/time');
const {
  generateMonthlyReport,
  generateQuarterlyReport,
  generateYearlyReport,
} = require('../services/reportGen');

const router = express.Router();
router.use(authMiddleware);

const MAX_GENERATE_PER_REQUEST = 3;

function getAvailablePeriods(userId) {
  const d = nowUTC8();
  const nowYear = d.getUTCFullYear();
  const nowMonth = d.getUTCMonth() + 1;

  const earliest = db.prepare(`
    SELECT date(MIN(completed_at), '${SQL_TZ}') AS first_date
    FROM behaviors
    WHERE user_id = ?
  `).get(userId);

  if (!earliest || !earliest.first_date) {
    return { monthly: [], quarterly: [], yearly: [] };
  }

  const firstDate = earliest.first_date;
  const firstYear = parseInt(firstDate.substring(0, 4), 10);
  const firstMonth = parseInt(firstDate.substring(5, 7), 10);

  const monthly = [];
  let y = firstYear;
  let m = firstMonth;
  while (y < nowYear || (y === nowYear && m < nowMonth)) {
    monthly.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }

  const quarterly = [];
  const firstQuarter = Math.ceil(firstMonth / 3);
  const lastCompleteQuarter = nowMonth <= 3
    ? { y: nowYear - 1, q: 4 }
    : { y: nowYear, q: Math.ceil(nowMonth / 3) - 1 };

  y = firstYear;
  let q = firstQuarter;
  while (y < lastCompleteQuarter.y || (y === lastCompleteQuarter.y && q <= lastCompleteQuarter.q)) {
    quarterly.push(`${y}-Q${q}`);
    q += 1;
    if (q > 4) {
      q = 1;
      y += 1;
    }
  }

  const yearly = [];
  for (let yr = firstYear; yr < nowYear; yr += 1) {
    yearly.push(String(yr));
  }

  return { monthly, quarterly, yearly };
}

router.get('/list', (req, res) => {
  const userId = req.user.id;
  const periods = getAvailablePeriods(userId);

  const cached = db.prepare(
    'SELECT id, type, period_key, is_read, created_at FROM reports WHERE user_id = ?'
  ).all(userId);

  const cachedMap = {};
  for (const row of cached) {
    cachedMap[`${row.type}|${row.period_key}`] = row;
  }

  let generateCount = 0;
  const reports = [];

  const allPeriods = [
    ...periods.monthly.map((pk) => ({ type: 'monthly', pk })),
    ...periods.quarterly.map((pk) => ({ type: 'quarterly', pk })),
    ...periods.yearly.map((pk) => ({ type: 'yearly', pk })),
  ];

  for (const { type, pk } of allPeriods) {
    const key = `${type}|${pk}`;
    if (cachedMap[key]) {
      reports.push(cachedMap[key]);
      continue;
    }

    if (generateCount >= MAX_GENERATE_PER_REQUEST) continue;

    let data = null;
    if (type === 'monthly') data = generateMonthlyReport(userId, pk);
    else if (type === 'quarterly') data = generateQuarterlyReport(userId, pk);
    else if (type === 'yearly') data = generateYearlyReport(userId, pk);

    generateCount += 1;

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

  reports.sort((a, b) => b.period_key.localeCompare(a.period_key));

  res.json({ reports });
});

router.get('/:id', (req, res) => {
  const userId = req.user.id;
  const reportId = parseInt(req.params.id, 10);

  if (Number.isNaN(reportId)) {
    return res.status(400).json({ error: '无效的报告 ID' });
  }

  const row = db.prepare('SELECT * FROM reports WHERE id = ? AND user_id = ?').get(reportId, userId);

  if (!row) {
    return res.status(404).json({ error: '报告不存在' });
  }

  if (!row.is_read) {
    db.prepare('UPDATE reports SET is_read = 1 WHERE id = ?').run(reportId);
  }

  return res.json({
    id: row.id,
    type: row.type,
    period_key: row.period_key,
    data: JSON.parse(row.data),
    is_read: true,
    created_at: row.created_at,
  });
});

module.exports = router;
