const { db } = require('../db');
const { getTodayUTC8 } = require('../utils/time');

/**
 * 计算用户当前连续签到天数
 * 单次查询取最近365条记录，内存中判断连续性
 * @param {number} userId
 * @param {string} today - 格式 YYYY-MM-DD
 * @returns {number} 连续天数（不含今天）
 */
function getStreak(userId, today) {
  const rows = db.prepare(
    `SELECT checkin_date FROM checkins
     WHERE user_id = ? AND checkin_date < ?
     ORDER BY checkin_date DESC LIMIT 365`
  ).all(userId, today);

  let streak = 0;
  // 从昨天开始，逐日比对
  const expectedDate = new Date(`${today}T00:00:00+08:00`);
  for (const row of rows) {
    expectedDate.setDate(expectedDate.getDate() - 1);
    const expectedStr = `${expectedDate.getFullYear()}-${String(expectedDate.getMonth() + 1).padStart(2, '0')}-${String(expectedDate.getDate()).padStart(2, '0')}`;
    if (row.checkin_date === expectedStr) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

/**
 * 根据连续天数计算灵石奖励
 * 1-5天：1灵石，6-10天：2灵石，11-20天：3灵石，21天+：5灵石
 * @param {number} streak - 含今天的连续天数
 * @returns {number}
 */
function calcReward(streak) {
  if (streak >= 21) return 5;
  if (streak >= 11) return 3;
  if (streak >= 6) return 2;
  return 1;
}

/**
 * 执行签到（幂等：同一天重复调用不会重复发放）
 * @param {number} userId
 * @returns {{ alreadyCheckedIn: boolean, streak: number, reward: number, totalStones: number }}
 */
function doCheckin(userId) {
  const today = getTodayUTC8();

  // 检查今天是否已签到
  const existing = db.prepare('SELECT id, streak, reward FROM checkins WHERE user_id = ? AND checkin_date = ?').get(userId, today);
  if (existing) {
    const user = db.prepare('SELECT spirit_stones FROM users WHERE id = ?').get(userId);
    return {
      alreadyCheckedIn: true,
      streak: existing.streak,
      reward: existing.reward,
      totalStones: user?.spirit_stones || 0,
    };
  }

  // 计算连续天数（昨天往前的连续天数 + 今天 = 总连续天数）
  const prevStreak = getStreak(userId, today);
  const streak = prevStreak + 1;
  const reward = calcReward(streak);

  // 事务：插入签到记录 + 增加灵石
  const transaction = db.transaction(() => {
    db.prepare('INSERT INTO checkins (user_id, checkin_date, streak, reward) VALUES (?, ?, ?, ?)').run(userId, today, streak, reward);
    db.prepare('UPDATE users SET spirit_stones = spirit_stones + ? WHERE id = ?').run(reward, userId);
  });
  transaction();

  const user = db.prepare('SELECT spirit_stones FROM users WHERE id = ?').get(userId);

  return {
    alreadyCheckedIn: false,
    streak,
    reward,
    totalStones: user?.spirit_stones || 0,
  };
}

/**
 * 获取用户签到状态（不执行签到）
 */
function getCheckinStatus(userId) {
  const today = getTodayUTC8();
  const existing = db.prepare('SELECT streak, reward FROM checkins WHERE user_id = ? AND checkin_date = ?').get(userId, today);
  const user = db.prepare('SELECT spirit_stones FROM users WHERE id = ?').get(userId);

  if (existing) {
    return {
      checkedInToday: true,
      streak: existing.streak,
      reward: existing.reward,
      totalStones: user?.spirit_stones || 0,
    };
  }

  // 未签到，预计算如果签到会是什么结果
  const prevStreak = getStreak(userId, today);
  const nextStreak = prevStreak + 1;
  const nextReward = calcReward(nextStreak);

  return {
    checkedInToday: false,
    streak: prevStreak,
    nextStreak,
    nextReward,
    totalStones: user?.spirit_stones || 0,
  };
}

module.exports = { doCheckin, getCheckinStatus };
