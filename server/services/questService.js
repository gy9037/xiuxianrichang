const { db } = require('../db');
const { getTodayUTC8, formatDate, SQL_TZ } = require('../utils/time');
const { generateItem, CATEGORY_TO_ATTR } = require('./itemGen');

const QUEST_CATEGORY_TO_ATTR = {
  discover: 'perception',
  action: 'physique',
  social: 'dexterity',
  perception: 'perception',
  thinking: 'comprehension',
  '体魄': 'physique',
  '悟性': 'comprehension',
  '意志': 'willpower',
  '灵巧': 'dexterity',
  '感知': 'perception',
};

const BEHAVIOR_CATEGORY_TO_ATTR = {
  ...CATEGORY_TO_ATTR,
  ...QUEST_CATEGORY_TO_ATTR,
};

const QUALITY_CHAIN = ['凡品', '良品', '上品', '极品'];

function parsePeriod(period) {
  if (!period) throw new Error('period 不能为空');

  if (period.includes('~')) {
    const [start, end] = period.split('~');
    return { start, end };
  }

  const weekMatch = period.match(/^(\d{4})-W(\d{2})$/);
  if (weekMatch) {
    const year = parseInt(weekMatch[1], 10);
    const week = parseInt(weekMatch[2], 10);
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const dayOfWeek = jan4.getUTCDay() || 7;
    const mondayOfWeek1 = new Date(jan4);
    mondayOfWeek1.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1);
    const targetMonday = new Date(mondayOfWeek1);
    targetMonday.setUTCDate(mondayOfWeek1.getUTCDate() + (week - 1) * 7);
    const targetSunday = new Date(targetMonday);
    targetSunday.setUTCDate(targetMonday.getUTCDate() + 6);
    return { start: formatDate(targetMonday), end: formatDate(targetSunday) };
  }

  const monthMatch = period.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    const year = parseInt(monthMatch[1], 10);
    const month = parseInt(monthMatch[2], 10);
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(Date.UTC(year, month, 0));
    return { start, end: formatDate(lastDay) };
  }

  throw new Error(`无法解析 period: ${period}`);
}

function getActiveFamilyMemberCount(familyId) {
  return db.prepare(
    'SELECT COUNT(*) as count FROM users WHERE family_id = ? AND is_active = 1'
  ).get(familyId).count;
}

function getRewardQuality(questType, createdAt, deadline) {
  if (questType === 'bounty' || questType === 'system') return null;

  const created = new Date(createdAt);
  const dead = new Date(deadline);
  const diffDays = (dead - created) / (1000 * 60 * 60 * 24);

  if (questType === 'self') return diffDays <= 14 ? '良品' : '上品';
  if (questType === 'challenge') return diffDays <= 14 ? '上品' : '极品';
  return '凡品';
}

function upgradeQuality(quality) {
  const idx = QUALITY_CHAIN.indexOf(quality);
  if (idx < 0 || idx >= QUALITY_CHAIN.length - 1) return quality;
  return QUALITY_CHAIN[idx + 1];
}

function generateRewardItem(userId, category, quality) {
  const attrType = BEHAVIOR_CATEGORY_TO_ATTR[category];
  if (!attrType || !quality) return null;

  const reverseCategoryMap = {
    physique: '身体健康',
    comprehension: '学习',
    willpower: '生活习惯',
    dexterity: '家务',
    perception: '社交互助',
  };
  const itemCategory = reverseCategoryMap[attrType] || '身体健康';
  const item = generateItem(itemCategory, quality);
  if (!item) return null;

  const result = db.prepare(
    `INSERT INTO items (user_id, name, quality, attribute_type, temp_value, source_behavior_id)
     VALUES (?, ?, ?, ?, ?, NULL)`
  ).run(userId, item.name, item.quality, item.attribute_type, item.temp_value);

  return { id: result.lastInsertRowid, ...item };
}

function calcBehaviorCount(userId, goalConfig, startDate, endDate) {
  return db.prepare(`
    SELECT COUNT(*) as cnt FROM behaviors
    WHERE user_id = ? AND category = ?
      AND date(completed_at, '${SQL_TZ}') BETWEEN ? AND ?
  `).get(userId, goalConfig.category, startDate, endDate).cnt;
}

function calcStreakDays(userId, goalConfig, startDate, endDate) {
  const days = db.prepare(`
    SELECT DISTINCT date(completed_at, '${SQL_TZ}') as d FROM behaviors
    WHERE user_id = ? AND category = ? AND sub_type = ?
      AND date(completed_at, '${SQL_TZ}') BETWEEN ? AND ?
    ORDER BY d
  `).all(userId, goalConfig.category, goalConfig.sub_type, startDate, endDate);

  if (days.length === 0) return 0;

  let maxStreak = 1;
  let current = 1;
  for (let i = 1; i < days.length; i += 1) {
    const diff = (new Date(days[i].d) - new Date(days[i - 1].d)) / 86400000;
    if (diff === 1) {
      current += 1;
    } else {
      maxStreak = Math.max(maxStreak, current);
      current = 1;
    }
  }
  return Math.max(maxStreak, current);
}

function calcAttrAccumulate(userId, goalConfig, startDate, endDate) {
  return db.prepare(`
    SELECT COALESCE(SUM(i.temp_value), 0) as total
    FROM behaviors b JOIN items i ON i.id = b.item_id
    WHERE b.user_id = ? AND i.attribute_type = ?
      AND date(b.completed_at, '${SQL_TZ}') BETWEEN ? AND ?
  `).get(userId, goalConfig.attribute, startDate, endDate).total;
}

function calculateProgress(userId, quest) {
  const goalConfig = typeof quest.goal_config === 'string'
    ? JSON.parse(quest.goal_config || '{}')
    : (quest.goal_config || {});

  if (quest.goal_type === 'manual' || !goalConfig.period) {
    return { current: 0, target: 0 };
  }

  const { start, end } = parsePeriod(goalConfig.period);
  const target = goalConfig.target || 0;
  let current = 0;

  if (quest.goal_type === 'behavior_count') {
    current = calcBehaviorCount(userId, goalConfig, start, end);
  } else if (quest.goal_type === 'streak_days') {
    current = calcStreakDays(userId, goalConfig, start, end);
  } else if (quest.goal_type === 'attr_accumulate') {
    current = calcAttrAccumulate(userId, goalConfig, start, end);
  }

  return { current, target };
}

function createQuest(userId, data) {
  const { type, title, description, category, goalType, goalConfig, mode, rewardStones, deadline } = data;

  if (type === 'system') throw new Error('系统任务不可手动创建');
  if (!title || title.length < 1 || title.length > 50) throw new Error('任务标题需要1-50个字符');
  if (!deadline) throw new Error('请设置截止时间');

  const user = db.prepare('SELECT id, family_id, spirit_stones FROM users WHERE id = ?').get(userId);
  if (!user) throw new Error('用户不存在');

  const goalConfigStr = goalConfig ? JSON.stringify(goalConfig) : '{}';
  const now = new Date().toISOString();
  let rewardItemsConfig = '[]';

  if (type !== 'bounty' && category) {
    const quality = getRewardQuality(type, now, deadline);
    const attrType = BEHAVIOR_CATEGORY_TO_ATTR[category];
    if (quality && attrType) {
      rewardItemsConfig = JSON.stringify([{ attribute_type: attrType, quality, count: 1 }]);
    }
  }

  if (type === 'self') {
    const txn = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO quests (family_id, creator_id, type, title, description, category,
          goal_type, goal_config, mode, reward_items, deadline, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
      `).run(
        user.family_id, userId, type, title, description || '', category || null,
        goalType || 'manual', goalConfigStr, mode || 'cooperative', rewardItemsConfig, deadline
      );

      db.prepare(`
        INSERT INTO quest_participants (quest_id, user_id, role, vote)
        VALUES (?, ?, 'challenger', 'approve')
      `).run(result.lastInsertRowid, userId);

      return { id: result.lastInsertRowid, status: 'active' };
    });
    return { quest: txn() };
  }

  if (type === 'bounty') {
    const bountyStones = rewardStones || 0;
    if (bountyStones < 1) throw new Error('悬赏灵石数量至少为1');
    const voteDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const txn = db.transaction(() => {
      const deduct = db.prepare(
        'UPDATE users SET spirit_stones = spirit_stones - ? WHERE id = ? AND spirit_stones >= ?'
      ).run(bountyStones, userId, bountyStones);
      if (deduct.changes === 0) throw new Error('灵石余额不足');

      const result = db.prepare(`
        INSERT INTO quests (family_id, creator_id, type, title, description, category,
          goal_type, goal_config, mode, bounty_stones, reward_items, deadline, status, vote_deadline)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'voting', ?)
      `).run(
        user.family_id, userId, type, title, description || '', category || null,
        goalType || 'manual', goalConfigStr, mode || 'cooperative',
        bountyStones, rewardItemsConfig, deadline, voteDeadline
      );

      db.prepare(`
        INSERT INTO quest_participants (quest_id, user_id, role, vote)
        VALUES (?, ?, 'observer', 'approve')
      `).run(result.lastInsertRowid, userId);

      return { id: result.lastInsertRowid, status: 'voting' };
    });
    return { quest: txn() };
  }

  if (type === 'challenge') {
    const voteDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const txn = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO quests (family_id, creator_id, type, title, description, category,
          goal_type, goal_config, mode, reward_items, deadline, status, vote_deadline)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'voting', ?)
      `).run(
        user.family_id, userId, type, title, description || '', category || null,
        goalType || 'manual', goalConfigStr, mode || 'cooperative',
        rewardItemsConfig, deadline, voteDeadline
      );

      db.prepare(`
        INSERT INTO quest_participants (quest_id, user_id, role, vote)
        VALUES (?, ?, 'challenger', 'approve')
      `).run(result.lastInsertRowid, userId);

      return { id: result.lastInsertRowid, status: 'voting' };
    });
    return { quest: txn() };
  }

  throw new Error(`不支持的任务类型: ${type}`);
}

function vote(userId, questId, approve, joinAsChallenger) {
  const quest = db.prepare('SELECT * FROM quests WHERE id = ?').get(questId);
  if (!quest) throw new Error('任务不存在');

  const user = db.prepare('SELECT id, family_id FROM users WHERE id = ?').get(userId);
  if (!user || user.family_id !== quest.family_id) throw new Error('无权操作此任务');

  const existing = db.prepare(
    'SELECT id FROM quest_participants WHERE quest_id = ? AND user_id = ?'
  ).get(questId, userId);
  if (existing) throw new Error('你已经投过票了');

  if (quest.status === 'active' && quest.type === 'bounty' && approve && joinAsChallenger) {
    db.prepare(`
      INSERT INTO quest_participants (quest_id, user_id, role, vote)
      VALUES (?, ?, 'bounty_taker', 'approve')
    `).run(questId, userId);
    return { voted: true, questStatus: 'active' };
  }

  if (quest.status !== 'voting') throw new Error('该任务不在投票阶段');

  const role = approve && joinAsChallenger ? 'challenger' : 'observer';
  const voteValue = approve ? 'approve' : 'reject';

  const txn = db.transaction(() => {
    db.prepare(`
      INSERT INTO quest_participants (quest_id, user_id, role, vote)
      VALUES (?, ?, ?, ?)
    `).run(questId, userId, role, voteValue);

    const activeMemberCount = getActiveFamilyMemberCount(quest.family_id);
    const approveCount = db.prepare(
      "SELECT COUNT(*) as cnt FROM quest_participants WHERE quest_id = ? AND vote = 'approve'"
    ).get(questId).cnt;
    const rejectCount = db.prepare(
      "SELECT COUNT(*) as cnt FROM quest_participants WHERE quest_id = ? AND vote = 'reject'"
    ).get(questId).cnt;

    const passed = activeMemberCount <= 2
      ? approveCount >= activeMemberCount
      : approveCount > activeMemberCount * 0.51;
    const rejected = rejectCount > activeMemberCount * 0.5;
    let newStatus = 'voting';

    if (passed) {
      newStatus = 'active';
      db.prepare("UPDATE quests SET status = 'active' WHERE id = ?").run(questId);
    } else if (rejected) {
      newStatus = 'cancelled';
      db.prepare("UPDATE quests SET status = 'cancelled' WHERE id = ?").run(questId);
      if (quest.type === 'bounty' && quest.bounty_stones > 0) {
        db.prepare('UPDATE users SET spirit_stones = spirit_stones + ? WHERE id = ?')
          .run(quest.bounty_stones, quest.creator_id);
      }
    }

    return { voted: true, questStatus: newStatus };
  });

  return txn();
}

function submitQuest(userId, questId, submission) {
  const quest = db.prepare('SELECT * FROM quests WHERE id = ?').get(questId);
  if (!quest) throw new Error('任务不存在');
  if (quest.status !== 'active') throw new Error('该任务不在进行中');

  const participant = db.prepare(
    'SELECT * FROM quest_participants WHERE quest_id = ? AND user_id = ?'
  ).get(questId, userId);
  if (!participant) throw new Error('你不是该任务的参与者');
  if (!['challenger', 'bounty_taker'].includes(participant.role)) throw new Error('你不是该任务的挑战者');
  if (participant.submission) throw new Error('你已经提交过了');
  if (!submission || !submission.text) throw new Error('请填写完成说明');

  const submissionStr = JSON.stringify({
    text: submission.text,
    photo_urls: submission.photoUrls || [],
  });
  const now = new Date().toISOString();

  const txn = db.transaction(() => {
    db.prepare(`
      UPDATE quest_participants SET submission = ?, submitted_at = ?
      WHERE quest_id = ? AND user_id = ?
    `).run(submissionStr, now, questId, userId);

    let questStatus = quest.status;

    if (quest.goal_type !== 'manual') {
      const progress = calculateProgress(userId, quest);
      const result = progress.current >= progress.target ? 'completed' : 'failed';
      db.prepare(`
        UPDATE quest_participants SET progress = ?, result = ?
        WHERE quest_id = ? AND user_id = ?
      `).run(JSON.stringify(progress), result, questId, userId);

      const pendingCount = db.prepare(`
        SELECT COUNT(*) as cnt FROM quest_participants
        WHERE quest_id = ? AND role IN ('challenger', 'bounty_taker') AND result IS NULL
      `).get(questId).cnt;
      if (pendingCount === 0) questStatus = settleQuest(questId);
    } else {
      const unsubmittedCount = db.prepare(`
        SELECT COUNT(*) as cnt FROM quest_participants
        WHERE quest_id = ? AND role IN ('challenger', 'bounty_taker') AND submission IS NULL
      `).get(questId).cnt;

      if (unsubmittedCount === 0) {
        db.prepare("UPDATE quests SET status = 'judging' WHERE id = ?").run(questId);
        questStatus = 'judging';
      }
    }

    return { submitted: true, questStatus };
  });

  return txn();
}

function judgeParticipant(judgeUserId, questId, targetUserId, verdict) {
  const quest = db.prepare('SELECT * FROM quests WHERE id = ?').get(questId);
  if (!quest) throw new Error('任务不存在');
  if (quest.status !== 'judging') throw new Error('该任务不在判定阶段');
  if (judgeUserId === targetUserId) throw new Error('不能判定自己');

  const judge = db.prepare('SELECT id, family_id FROM users WHERE id = ?').get(judgeUserId);
  if (!judge || judge.family_id !== quest.family_id) throw new Error('无权操作此任务');

  const target = db.prepare(
    'SELECT * FROM quest_participants WHERE quest_id = ? AND user_id = ?'
  ).get(questId, targetUserId);
  if (!target || !['challenger', 'bounty_taker'].includes(target.role)) throw new Error('目标用户不是该任务的挑战者');
  if (!target.submission) throw new Error('目标用户尚未提交');

  const existingJudgment = db.prepare(
    'SELECT id FROM quest_judgments WHERE quest_id = ? AND target_user_id = ? AND judge_user_id = ?'
  ).get(questId, targetUserId, judgeUserId);
  if (existingJudgment) throw new Error('你已经判定过该成员了');

  const txn = db.transaction(() => {
    db.prepare(`
      INSERT INTO quest_judgments (quest_id, target_user_id, judge_user_id, verdict)
      VALUES (?, ?, ?, ?)
    `).run(questId, targetUserId, judgeUserId, verdict);

    const activeMemberCount = getActiveFamilyMemberCount(quest.family_id);
    const eligibleJudges = activeMemberCount - 1;
    const passCount = db.prepare(
      "SELECT COUNT(*) as cnt FROM quest_judgments WHERE quest_id = ? AND target_user_id = ? AND verdict = 'pass'"
    ).get(questId, targetUserId).cnt;
    const failCount = db.prepare(
      "SELECT COUNT(*) as cnt FROM quest_judgments WHERE quest_id = ? AND target_user_id = ? AND verdict = 'fail'"
    ).get(questId, targetUserId).cnt;
    const totalJudged = passCount + failCount;
    let targetResult = null;

    if (eligibleJudges <= 1) {
      targetResult = passCount > 0 ? 'completed' : 'failed';
    } else if (totalJudged >= eligibleJudges) {
      targetResult = passCount > eligibleJudges * 0.51 ? 'completed' : 'failed';
    } else if (passCount > eligibleJudges * 0.51) {
      targetResult = 'completed';
    } else if (failCount > eligibleJudges * 0.5) {
      targetResult = 'failed';
    }

    if (targetResult) {
      db.prepare('UPDATE quest_participants SET result = ? WHERE quest_id = ? AND user_id = ?')
        .run(targetResult, questId, targetUserId);
    }

    const pendingCount = db.prepare(`
      SELECT COUNT(*) as cnt FROM quest_participants
      WHERE quest_id = ? AND role IN ('challenger', 'bounty_taker') AND result IS NULL
    `).get(questId).cnt;
    if (pendingCount === 0) settleQuest(questId);

    return { judged: true, targetResult };
  });

  return txn();
}

function settleQuest(questId) {
  const quest = db.prepare('SELECT * FROM quests WHERE id = ?').get(questId);
  if (!quest) throw new Error('任务不存在');

  const challengers = db.prepare(`
    SELECT * FROM quest_participants
    WHERE quest_id = ? AND role IN ('challenger', 'bounty_taker')
  `).all(questId);

  if (quest.goal_type !== 'manual') {
    for (const c of challengers) {
      const progress = calculateProgress(c.user_id, quest);
      const result = progress.current >= progress.target ? 'completed' : 'failed';
      db.prepare(`
        UPDATE quest_participants SET progress = ?, result = ?
        WHERE quest_id = ? AND user_id = ?
      `).run(JSON.stringify(progress), result, questId, c.user_id);
      c.progress = progress;
      c.result = result;
    }
  }

  const completedUsers = challengers.filter((c) => c.result === 'completed');

  if (quest.type !== 'bounty' && quest.category) {
    let rewardItems;
    try { rewardItems = JSON.parse(quest.reward_items || '[]'); } catch { rewardItems = []; }

    if (quest.mode === 'cooperative') {
      if (completedUsers.length === challengers.length && completedUsers.length > 0) {
        for (const u of completedUsers) {
          if (quest.type === 'system' && rewardItems.length > 0) {
            for (const ri of rewardItems) generateRewardItem(u.user_id, quest.category, ri.quality);
          } else {
            const quality = getRewardQuality(quest.type, quest.created_at, quest.deadline);
            if (quality) generateRewardItem(u.user_id, quest.category, quality);
          }
        }
      }
    } else {
      const ranked = [...completedUsers].sort((a, b) => {
        const pa = typeof a.progress === 'string' ? JSON.parse(a.progress || '{}') : (a.progress || {});
        const pb = typeof b.progress === 'string' ? JSON.parse(b.progress || '{}') : (b.progress || {});
        if ((pb.current || 0) !== (pa.current || 0)) return (pb.current || 0) - (pa.current || 0);
        return (a.submitted_at || '').localeCompare(b.submitted_at || '');
      });

      for (let i = 0; i < ranked.length; i += 1) {
        const u = ranked[i];
        if (quest.type === 'system') {
          const baseQuality = rewardItems[0]?.quality || '凡品';
          generateRewardItem(u.user_id, quest.category, i === 0 ? upgradeQuality(baseQuality) : baseQuality);
        } else {
          const baseQuality = getRewardQuality(quest.type, quest.created_at, quest.deadline);
          if (baseQuality) generateRewardItem(u.user_id, quest.category, i === 0 ? upgradeQuality(baseQuality) : baseQuality);
        }
      }
    }
  }

  if (quest.type === 'bounty' && quest.bounty_stones > 0) {
    if (completedUsers.length > 0) {
      const perUser = Math.floor(quest.bounty_stones / completedUsers.length);
      for (const u of completedUsers) {
        if (perUser > 0) {
          db.prepare('UPDATE users SET spirit_stones = spirit_stones + ? WHERE id = ?')
            .run(perUser, u.user_id);
        }
      }
    } else {
      db.prepare('UPDATE users SET spirit_stones = spirit_stones + ? WHERE id = ?')
        .run(quest.bounty_stones, quest.creator_id);
    }
  }

  db.prepare("UPDATE quests SET status = 'completed', completed_at = ? WHERE id = ?")
    .run(new Date().toISOString(), questId);

  return 'completed';
}

function getDailySystemQuest(familyId, userId = null) {
  const today = getTodayUTC8();
  const existing = db.prepare(`
    SELECT q.*, qp.submission AS my_submission
    FROM quests q
    LEFT JOIN quest_participants qp ON qp.quest_id = q.id AND qp.user_id = ?
    WHERE q.family_id = ? AND q.type = 'system' AND date(q.created_at, '${SQL_TZ}') = ?
  `).get(userId || 0, familyId, today);
  if (existing) {
    if (userId) {
      db.prepare(`
        INSERT OR IGNORE INTO quest_participants (quest_id, user_id, role, vote)
        VALUES (?, ?, 'challenger', 'approve')
      `).run(existing.id, userId);
      const participant = db.prepare(
        'SELECT submission FROM quest_participants WHERE quest_id = ? AND user_id = ?'
      ).get(existing.id, userId);
      existing.my_submission = participant ? participant.submission : null;
    }
    return existing;
  }

  const recentPoolIds = db.prepare(`
    SELECT source_pool_id FROM quests
    WHERE family_id = ? AND type = 'system'
      AND created_at >= datetime('now', '-30 days')
      AND source_pool_id IS NOT NULL
  `).all(familyId).map((r) => r.source_pool_id);

  let pool;
  if (recentPoolIds.length > 0) {
    const placeholders = recentPoolIds.map(() => '?').join(',');
    pool = db.prepare(`
      SELECT * FROM system_quest_pool
      WHERE id NOT IN (${placeholders})
      ORDER BY RANDOM() LIMIT 1
    `).get(...recentPoolIds);
  } else {
    pool = db.prepare('SELECT * FROM system_quest_pool ORDER BY RANDOM() LIMIT 1').get();
  }
  if (!pool) return null;

  const attrType = QUEST_CATEGORY_TO_ATTR[pool.category] || 'perception';
  const rewardItems = JSON.stringify([{ attribute_type: attrType, quality: pool.reward_quality || '凡品', count: 1 }]);
  const deadline = `${today}T23:59:59`;

  const result = db.prepare(`
    INSERT INTO quests (family_id, creator_id, type, title, description, category,
      goal_type, goal_config, mode, reward_items, source_pool_id, deadline, status)
    VALUES (?, 0, 'system', ?, ?, ?, 'manual', '{}', 'cooperative', ?, ?, ?, 'active')
  `).run(familyId, pool.title, pool.description, pool.category, rewardItems, pool.id, deadline);

  if (userId) {
    db.prepare(`
      INSERT OR IGNORE INTO quest_participants (quest_id, user_id, role, vote)
      VALUES (?, ?, 'challenger', 'approve')
    `).run(result.lastInsertRowid, userId);
  }

  return db.prepare('SELECT *, NULL AS my_submission FROM quests WHERE id = ?').get(result.lastInsertRowid);
}

function getQuestList(familyId, userId, filters = {}) {
  const { status, type, page = 1, limit = 20 } = filters;
  const safeLimit = Math.min(Math.max(limit, 1), 50);
  const offset = (Math.max(page, 1) - 1) * safeLimit;
  const whereClauses = ['q.family_id = ?'];
  const params = [familyId];

  if (status) {
    const statuses = String(status).split(',').map((s) => s.trim()).filter(Boolean);
    if (statuses.length > 1) {
      whereClauses.push(`q.status IN (${statuses.map(() => '?').join(',')})`);
      params.push(...statuses);
    } else {
      whereClauses.push('q.status = ?');
      params.push(status);
    }
  }
  if (type) {
    whereClauses.push('q.type = ?');
    params.push(type);
  }

  const whereStr = whereClauses.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) as cnt FROM quests q WHERE ${whereStr}`).get(...params).cnt;

  const quests = db.prepare(`
    SELECT q.*,
      COALESCE(u.name, '系统') AS creator_name,
      (SELECT COUNT(*) FROM quest_participants WHERE quest_id = q.id) AS participant_count,
      qp.role AS my_role
    FROM quests q
    LEFT JOIN users u ON u.id = q.creator_id
    LEFT JOIN quest_participants qp ON qp.quest_id = q.id AND qp.user_id = ?
    WHERE ${whereStr}
    ORDER BY
      CASE q.status
        WHEN 'active' THEN 1
        WHEN 'voting' THEN 2
        WHEN 'judging' THEN 3
        ELSE 4
      END,
      q.created_at DESC
    LIMIT ? OFFSET ?
  `).all(userId, ...params, safeLimit, offset);

  return { quests, total, page: Math.max(page, 1), limit: safeLimit };
}

function getQuestDetail(questId, userId) {
  const quest = db.prepare(`
    SELECT q.*, COALESCE(u.name, '系统') AS creator_name
    FROM quests q
    LEFT JOIN users u ON u.id = q.creator_id
    WHERE q.id = ?
  `).get(questId);
  if (!quest) return null;

  const participants = db.prepare(`
    SELECT qp.*, u.name, u.avatar
    FROM quest_participants qp
    JOIN users u ON u.id = qp.user_id
    WHERE qp.quest_id = ?
  `).all(questId);

  if (quest.goal_type !== 'manual' && quest.status === 'active') {
    for (const p of participants) {
      if (['challenger', 'bounty_taker'].includes(p.role)) {
        p.progress = JSON.stringify(calculateProgress(p.user_id, quest));
      }
    }
  }

  for (const p of participants) {
    try { p.progress = JSON.parse(p.progress || '{}'); } catch { p.progress = {}; }
    try { p.submission = JSON.parse(p.submission || 'null'); } catch { p.submission = null; }
  }

  const myJudgments = db.prepare(
    'SELECT target_user_id, verdict FROM quest_judgments WHERE quest_id = ? AND judge_user_id = ?'
  ).all(questId, userId);

  try { quest.goal_config = JSON.parse(quest.goal_config || '{}'); } catch { quest.goal_config = {}; }
  try { quest.reward_items = JSON.parse(quest.reward_items || '[]'); } catch { quest.reward_items = []; }

  return {
    ...quest,
    creator: { id: quest.creator_id, name: quest.creator_name },
    participants,
    my_judgments: myJudgments,
  };
}

function refreshProgress(userId, questId) {
  const quest = db.prepare('SELECT * FROM quests WHERE id = ? AND status = ?').get(questId, 'active');
  if (!quest || quest.goal_type === 'manual') return;

  const participant = db.prepare(
    "SELECT * FROM quest_participants WHERE quest_id = ? AND user_id = ? AND role IN ('challenger', 'bounty_taker')"
  ).get(questId, userId);
  if (!participant) return;

  const progress = calculateProgress(userId, quest);
  db.prepare('UPDATE quest_participants SET progress = ? WHERE quest_id = ? AND user_id = ?')
    .run(JSON.stringify(progress), questId, userId);
}

module.exports = {
  createQuest,
  vote,
  submitQuest,
  judgeParticipant,
  settleQuest,
  getDailySystemQuest,
  getQuestList,
  getQuestDetail,
  refreshProgress,
  parsePeriod,
  getActiveFamilyMemberCount,
  getRewardQuality,
  upgradeQuality,
  generateRewardItem,
  calculateProgress,
  calcBehaviorCount,
  calcStreakDays,
  calcAttrAccumulate,
};
