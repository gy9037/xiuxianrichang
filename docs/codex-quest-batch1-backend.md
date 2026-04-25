# Codex 指令：任务系统 Batch1 — 数据库层 + 服务层

> **关联技术方案**：docs/tech-quest-system.md
> **关联策划案**：策划案-02（统一任务系统）
> **执行顺序**：先执行本文件（后端 batch1），后续 batch2 为路由层+定时任务，batch3 为前端

---

## 一、数据库改动（server/db.js）

### 1.1 新增 4 张表

在 `initDB()` 中，`reports` 表的 `db.exec()` 块（约第 336-348 行）之后，`// Seed default family` 注释（约第 350 行）之前，插入以下代码：

```js
  // 任务系统 — 4 张核心表
  db.exec(`
    CREATE TABLE IF NOT EXISTS quests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      family_id INTEGER NOT NULL,
      creator_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      category TEXT DEFAULT NULL,
      goal_type TEXT DEFAULT 'manual',
      goal_config TEXT DEFAULT '{}',
      mode TEXT DEFAULT 'cooperative',
      reward_stones INTEGER DEFAULT 0,
      reward_items TEXT DEFAULT '[]',
      bounty_stones INTEGER DEFAULT 0,
      source_pool_id INTEGER DEFAULT NULL,
      status TEXT DEFAULT 'voting',
      vote_deadline TEXT DEFAULT NULL,
      deadline TEXT DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT DEFAULT NULL,
      FOREIGN KEY (family_id) REFERENCES families(id),
      FOREIGN KEY (creator_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS quest_participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quest_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      vote TEXT DEFAULT NULL,
      progress TEXT DEFAULT '{}',
      submission TEXT DEFAULT NULL,
      submitted_at TEXT DEFAULT NULL,
      result TEXT DEFAULT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(quest_id, user_id),
      FOREIGN KEY (quest_id) REFERENCES quests(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS quest_judgments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quest_id INTEGER NOT NULL,
      target_user_id INTEGER NOT NULL,
      judge_user_id INTEGER NOT NULL,
      verdict TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(quest_id, target_user_id, judge_user_id),
      FOREIGN KEY (quest_id) REFERENCES quests(id)
    );

    CREATE TABLE IF NOT EXISTS system_quest_pool (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      requires_photo INTEGER DEFAULT 0,
      reward_quality TEXT DEFAULT '凡品'
    );
  `);
```

### 1.2 索引

紧跟上方 `db.exec()` 之后插入：

```js
  // 任务系统索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_quests_family_status ON quests(family_id, status);
    CREATE INDEX IF NOT EXISTS idx_quests_family_type ON quests(family_id, type, created_at);
    CREATE INDEX IF NOT EXISTS idx_qp_quest ON quest_participants(quest_id);
    CREATE INDEX IF NOT EXISTS idx_qp_user ON quest_participants(user_id);
    CREATE INDEX IF NOT EXISTS idx_qj_quest ON quest_judgments(quest_id);
  `);
```

### 1.3 users 表新增 is_active 字段

在 `initDB()` 的 ALTER TABLE 迁移区域，`// 筹码字段迁移` 块（约第 328-333 行）之后插入：

```js
  // 任务系统 — 活跃用户标记
  try {
    db.exec(`ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1`);
  } catch (e) {
    // 列已存在，忽略
  }
```

### 1.4 seed data

在 `initDB()` 末尾，`// Seed default family` 块（约第 350-354 行）之后，`}` 闭合函数之前插入：

```js
  // 任务系统 — 系统悬赏任务池 seed
  const poolCount = db.prepare('SELECT COUNT(*) as count FROM system_quest_pool').get();
  if (poolCount.count === 0) {
    const insert = db.prepare(
      'INSERT INTO system_quest_pool (category, title, description, requires_photo, reward_quality) VALUES (?, ?, ?, ?, ?)'
    );
    const seedData = require('./data/quest-pool-seed.json');
    const insertMany = db.transaction((items) => {
      for (const item of items) {
        insert.run(item.category, item.title, item.description, item.requires_photo ? 1 : 0, item.reward_quality || '凡品');
      }
    });
    insertMany(seedData);
  }
```

---

## 二、服务层（新建 server/services/questService.js）

新建文件 `server/services/questService.js`，完整内容如下：

```js
const { db } = require('../db');
const { getTodayUTC8, nowUTC8, formatDate, SQL_TZ } = require('../utils/time');
const { generateItem, QUALITY_VALUES, CATEGORY_TO_ATTR } = require('./itemGen');

// ============================================================
// 常量与映射
// ============================================================

/** 任务池 category → 属性类型映射 */
const QUEST_CATEGORY_TO_ATTR = {
  discover: 'perception',
  action: 'physique',
  social: 'dexterity',
  perception: 'perception',
  thinking: 'comprehension',
  // 中文 category 兼容（行为表使用中文）
  体魄: 'physique',
  悟性: 'comprehension',
  意志: 'willpower',
  灵巧: 'dexterity',
  感知: 'perception',
};

/** 行为表中文 category → attribute_type（复用 itemGen 的映射） */
const BEHAVIOR_CATEGORY_TO_ATTR = {
  ...CATEGORY_TO_ATTR,
  ...QUEST_CATEGORY_TO_ATTR,
};

/** 品质升级链 */
const QUALITY_CHAIN = ['凡品', '良品', '上品', '极品'];

// ============================================================
// 工具函数
// ============================================================

/**
 * 解析 period 字符串为 {start, end} 日期字符串
 * 支持格式：
 *   - YYYY-Www（ISO 周，周一起始）
 *   - YYYY-MM（自然月）
 *   - YYYY-MM-DD~YYYY-MM-DD（自定义区间）
 * @param {string} period
 * @returns {{start: string, end: string}} YYYY-MM-DD 格式
 */
function parsePeriod(period) {
  if (!period) {
    throw new Error('period 不能为空');
  }

  // 自定义区间：YYYY-MM-DD~YYYY-MM-DD
  if (period.includes('~')) {
    const [start, end] = period.split('~');
    return { start, end };
  }

  // ISO 周：YYYY-Www
  const weekMatch = period.match(/^(\d{4})-W(\d{2})$/);
  if (weekMatch) {
    const year = parseInt(weekMatch[1]);
    const week = parseInt(weekMatch[2]);
    // ISO 8601: 第1周包含该年第一个周四
    // 简化计算：1月4日所在周为第1周
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const dayOfWeek = jan4.getUTCDay() || 7; // 周日=7
    const mondayOfWeek1 = new Date(jan4);
    mondayOfWeek1.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1);
    const targetMonday = new Date(mondayOfWeek1);
    targetMonday.setUTCDate(mondayOfWeek1.getUTCDate() + (week - 1) * 7);
    const targetSunday = new Date(targetMonday);
    targetSunday.setUTCDate(targetMonday.getUTCDate() + 6);
    return {
      start: formatDate(targetMonday),
      end: formatDate(targetSunday),
    };
  }

  // 自然月：YYYY-MM
  const monthMatch = period.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    const year = parseInt(monthMatch[1]);
    const month = parseInt(monthMatch[2]);
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    // 下月第0天 = 本月最后一天
    const lastDay = new Date(Date.UTC(year, month, 0));
    const end = formatDate(lastDay);
    return { start, end };
  }

  throw new Error(`无法解析 period: ${period}`);
}

/**
 * 获取家庭活跃成员数
 * @param {number} familyId
 * @returns {number}
 */
function getActiveFamilyMemberCount(familyId) {
  const row = db.prepare(
    'SELECT COUNT(*) as count FROM users WHERE family_id = ? AND is_active = 1'
  ).get(familyId);
  return row.count;
}

/**
 * 根据任务类型和周期返回奖励道具品质
 * - system: 由任务池 reward_quality 定义
 * - self: ≤14天=良品, >14天=上品
 * - challenge: ≤14天=上品, >14天=极品
 * - bounty: 不产出道具（只有灵石）
 * @param {string} questType
 * @param {string} createdAt
 * @param {string} deadline
 * @returns {string|null} 品质字符串，bounty 返回 null
 */
function getRewardQuality(questType, createdAt, deadline) {
  if (questType === 'bounty') return null;
  if (questType === 'system') return null; // system 由 reward_items 字段定义

  const created = new Date(createdAt);
  const dead = new Date(deadline);
  const diffDays = (dead - created) / (1000 * 60 * 60 * 24);

  if (questType === 'self') {
    return diffDays <= 14 ? '良品' : '上品';
  }
  if (questType === 'challenge') {
    return diffDays <= 14 ? '上品' : '极品';
  }
  return '凡品';
}

/**
 * 品质升一级
 * @param {string} quality
 * @returns {string}
 */
function upgradeQuality(quality) {
  const idx = QUALITY_CHAIN.indexOf(quality);
  if (idx < 0 || idx >= QUALITY_CHAIN.length - 1) return quality;
  return QUALITY_CHAIN[idx + 1];
}

/**
 * 生成奖励道具并插入 items 表
 * 复用 itemGen.generateItem 的逻辑，但品质由任务系统决定
 * @param {number} userId
 * @param {string} category - 任务 category（英文或中文）
 * @param {string} quality - 品质
 * @returns {object|null} 生成的道具，或 null
 */
function generateRewardItem(userId, category, quality) {
  const attrType = BEHAVIOR_CATEGORY_TO_ATTR[category];
  if (!attrType || !quality) return null;

  // 反查 itemGen 需要的中文 category
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

// ============================================================
// 自动结算计算函数
// ============================================================

/**
 * 计算行为次数（behavior_count 目标类型）
 * @param {number} userId
 * @param {object} goalConfig - {target, category, period}
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @returns {number}
 */
function calcBehaviorCount(userId, goalConfig, startDate, endDate) {
  return db.prepare(`
    SELECT COUNT(*) as cnt FROM behaviors
    WHERE user_id = ? AND category = ?
    AND date(completed_at, '${SQL_TZ}') BETWEEN ? AND ?
  `).get(userId, goalConfig.category, startDate, endDate).cnt;
}

/**
 * 计算连续打卡天数（streak_days 目标类型）
 * 查 behaviors 表 DISTINCT date，内存计算最长连续段
 * @param {number} userId
 * @param {object} goalConfig - {target, category, sub_type, period}
 * @param {string} startDate
 * @param {string} endDate
 * @returns {number}
 */
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
  for (let i = 1; i < days.length; i++) {
    const diff = (new Date(days[i].d) - new Date(days[i - 1].d)) / 86400000;
    if (diff === 1) {
      current++;
    } else {
      maxStreak = Math.max(maxStreak, current);
      current = 1;
    }
  }
  return Math.max(maxStreak, current);
}

/**
 * 计算属性累积值（attr_accumulate 目标类型）
 * @param {number} userId
 * @param {object} goalConfig - {target, attribute, period}
 * @param {string} startDate
 * @param {string} endDate
 * @returns {number}
 */
function calcAttrAccumulate(userId, goalConfig, startDate, endDate) {
  return db.prepare(`
    SELECT COALESCE(SUM(i.temp_value), 0) as total
    FROM behaviors b JOIN items i ON i.id = b.item_id
    WHERE b.user_id = ? AND i.attribute_type = ?
    AND date(b.completed_at, '${SQL_TZ}') BETWEEN ? AND ?
  `).get(userId, goalConfig.attribute, startDate, endDate).total;
}

/**
 * 根据 goal_type 计算进度
 * @param {number} userId
 * @param {object} quest
 * @returns {{current: number, target: number}}
 */
function calculateProgress(userId, quest) {
  const goalConfig = typeof quest.goal_config === 'string'
    ? JSON.parse(quest.goal_config) : quest.goal_config;

  if (quest.goal_type === 'manual' || !goalConfig.period) {
    return { current: 0, target: 0 };
  }

  const { start, end } = parsePeriod(goalConfig.period);
  const target = goalConfig.target || 0;
  let current = 0;

  switch (quest.goal_type) {
    case 'behavior_count':
      current = calcBehaviorCount(userId, goalConfig, start, end);
      break;
    case 'streak_days':
      current = calcStreakDays(userId, goalConfig, start, end);
      break;
    case 'attr_accumulate':
      current = calcAttrAccumulate(userId, goalConfig, start, end);
      break;
  }

  return { current, target };
}

// ============================================================
// 核心业务函数
// ============================================================

/**
 * 创建任务
 * - self: status='active', 创建者自动 challenger+approve
 * - bounty: 校验灵石余额，预扣 bounty_stones，status='voting'
 * - challenge: status='voting', 创建者 challenger+approve
 * - system: 不允许手动创建
 *
 * @param {number} userId - 创建者 ID
 * @param {object} data - {type, title, description, category, goalType, goalConfig, mode, rewardStones, deadline}
 * @returns {{quest: object}}
 */
function createQuest(userId, data) {
  const { type, title, description, category, goalType, goalConfig, mode, rewardStones, deadline } = data;

  if (type === 'system') {
    throw new Error('系统任务不可手动创建');
  }
  if (!title || title.length < 1 || title.length > 50) {
    throw new Error('任务标题需要1-50个字符');
  }
  if (!deadline) {
    throw new Error('请设置截止时间');
  }

  // 获取用户信息
  const user = db.prepare('SELECT id, family_id, spirit_stones FROM users WHERE id = ?').get(userId);
  if (!user) throw new Error('用户不存在');

  const goalConfigStr = goalConfig ? JSON.stringify(goalConfig) : '{}';
  const now = new Date().toISOString();

  // 根据类型和周期生成 reward_items
  let rewardItemsConfig = '[]';
  if (type !== 'bounty' && category) {
    const quality = getRewardQuality(type, now, deadline);
    const attrType = BEHAVIOR_CATEGORY_TO_ATTR[category];
    if (quality && attrType) {
      rewardItemsConfig = JSON.stringify([{ attribute_type: attrType, quality, count: 1 }]);
    }
  }

  if (type === 'self') {
    // 自我悬赏：直接生效
    const txn = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO quests (family_id, creator_id, type, title, description, category,
          goal_type, goal_config, mode, reward_items, deadline, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
      `).run(
        user.family_id, userId, type, title, description || '', category || null,
        goalType || 'manual', goalConfigStr, mode || 'cooperative', rewardItemsConfig, deadline
      );

      const questId = result.lastInsertRowid;

      db.prepare(`
        INSERT INTO quest_participants (quest_id, user_id, role, vote)
        VALUES (?, ?, 'challenger', 'approve')
      `).run(questId, userId);

      return { id: questId, status: 'active' };
    });
    const quest = txn();
    return { quest };
  }

  if (type === 'bounty') {
    // 悬赏任务：预扣灵石，进入投票
    const bountyStones = rewardStones || 0;
    if (bountyStones < 1) {
      throw new Error('悬赏灵石数量至少为1');
    }

    // 投票截止时间：24小时后
    const voteDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const txn = db.transaction(() => {
      // 乐观锁预扣灵石
      const deduct = db.prepare(
        'UPDATE users SET spirit_stones = spirit_stones - ? WHERE id = ? AND spirit_stones >= ?'
      ).run(bountyStones, userId, bountyStones);

      if (deduct.changes === 0) {
        throw new Error('灵石余额不足');
      }

      const result = db.prepare(`
        INSERT INTO quests (family_id, creator_id, type, title, description, category,
          goal_type, goal_config, mode, bounty_stones, reward_items, deadline, status, vote_deadline)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'voting', ?)
      `).run(
        user.family_id, userId, type, title, description || '', category || null,
        goalType || 'manual', goalConfigStr, mode || 'cooperative',
        bountyStones, rewardItemsConfig, deadline, voteDeadline
      );

      const questId = result.lastInsertRowid;

      // 发起者默认赞成，角色为 observer（不参与挑战）
      db.prepare(`
        INSERT INTO quest_participants (quest_id, user_id, role, vote)
        VALUES (?, ?, 'observer', 'approve')
      `).run(questId, userId);

      return { id: questId, status: 'voting' };
    });
    const quest = txn();
    return { quest };
  }

  if (type === 'challenge') {
    // 挑战任务：进入投票
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

      const questId = result.lastInsertRowid;

      // 发起者默认赞成+参与挑战
      db.prepare(`
        INSERT INTO quest_participants (quest_id, user_id, role, vote)
        VALUES (?, ?, 'challenger', 'approve')
      `).run(questId, userId);

      return { id: questId, status: 'voting' };
    });
    const quest = txn();
    return { quest };
  }

  throw new Error(`不支持的任务类型: ${type}`);
}

/**
 * 投票
 * 校验：quest.status=='voting', 同家庭, 未投过票
 * 通过条件：2人家庭全票，其他>51%
 * 否决条件：反对过半
 *
 * @param {number} userId
 * @param {number} questId
 * @param {boolean} approve - 是否赞成
 * @param {boolean} joinAsChallenger - 赞成时是否一起挑战
 * @returns {{voted: boolean, questStatus: string}}
 */
function vote(userId, questId, approve, joinAsChallenger) {
  const quest = db.prepare('SELECT * FROM quests WHERE id = ?').get(questId);
  if (!quest) throw new Error('任务不存在');
  if (quest.status !== 'voting') throw new Error('该任务不在投票阶段');

  // 校验同家庭
  const user = db.prepare('SELECT id, family_id FROM users WHERE id = ?').get(userId);
  if (!user || user.family_id !== quest.family_id) throw new Error('无权操作此任务');

  // 校验未投过票
  const existing = db.prepare(
    'SELECT id FROM quest_participants WHERE quest_id = ? AND user_id = ?'
  ).get(questId, userId);
  if (existing) throw new Error('你已经投过票了');

  const role = approve && joinAsChallenger ? 'challenger' : 'observer';
  const voteValue = approve ? 'approve' : 'reject';

  const txn = db.transaction(() => {
    // 插入参与者记录（含投票）
    db.prepare(`
      INSERT INTO quest_participants (quest_id, user_id, role, vote)
      VALUES (?, ?, ?, ?)
    `).run(questId, userId, role, voteValue);

    // 统计票数
    const activeMemberCount = getActiveFamilyMemberCount(quest.family_id);
    const approveCount = db.prepare(
      "SELECT COUNT(*) as cnt FROM quest_participants WHERE quest_id = ? AND vote = 'approve'"
    ).get(questId).cnt;
    const rejectCount = db.prepare(
      "SELECT COUNT(*) as cnt FROM quest_participants WHERE quest_id = ? AND vote = 'reject'"
    ).get(questId).cnt;

    let newStatus = 'voting';

    // 通过判定
    let passed = false;
    if (activeMemberCount <= 2) {
      // 2人家庭：全票通过
      passed = approveCount >= activeMemberCount;
    } else {
      // 多人家庭：超过51%
      passed = approveCount > activeMemberCount * 0.51;
    }

    // 否决判定：反对过半
    const rejected = rejectCount > activeMemberCount * 0.5;

    if (passed) {
      newStatus = 'active';
      db.prepare("UPDATE quests SET status = 'active' WHERE id = ?").run(questId);
    } else if (rejected) {
      newStatus = 'cancelled';
      db.prepare("UPDATE quests SET status = 'cancelled' WHERE id = ?").run(questId);

      // bounty 类型退还灵石
      if (quest.type === 'bounty' && quest.bounty_stones > 0) {
        db.prepare(
          'UPDATE users SET spirit_stones = spirit_stones + ? WHERE id = ?'
        ).run(quest.bounty_stones, quest.creator_id);
      }
    }

    return { voted: true, questStatus: newStatus };
  });

  return txn();
}

/**
 * 提交任务完成信息
 * 校验：active, role in (challenger, bounty_taker), 未提交
 * 自动结算类型：计算进度和结果
 * manual 类型：全员提交后→judging
 *
 * @param {number} userId
 * @param {number} questId
 * @param {object} submission - {text, photoUrls}
 * @returns {{submitted: boolean, questStatus: string}}
 */
function submitQuest(userId, questId, submission) {
  const quest = db.prepare('SELECT * FROM quests WHERE id = ?').get(questId);
  if (!quest) throw new Error('任务不存在');
  if (quest.status !== 'active') throw new Error('该任务不在进行中');

  const participant = db.prepare(
    'SELECT * FROM quest_participants WHERE quest_id = ? AND user_id = ?'
  ).get(questId, userId);
  if (!participant) throw new Error('你不是该任务的参与者');
  if (!['challenger', 'bounty_taker'].includes(participant.role)) {
    throw new Error('你不是该任务的挑战者');
  }
  if (participant.submission) throw new Error('你已经提交过了');

  if (!submission || !submission.text) {
    throw new Error('请填写完成说明');
  }

  const submissionStr = JSON.stringify({
    text: submission.text,
    photo_urls: submission.photoUrls || [],
  });
  const now = new Date().toISOString();

  const txn = db.transaction(() => {
    // 更新提交信息
    db.prepare(`
      UPDATE quest_participants SET submission = ?, submitted_at = ?
      WHERE quest_id = ? AND user_id = ?
    `).run(submissionStr, now, questId, userId);

    let questStatus = quest.status;

    if (quest.goal_type !== 'manual') {
      // 自动结算类型：计算进度和结果
      const progress = calculateProgress(userId, quest);
      const result = progress.current >= progress.target ? 'completed' : 'failed';

      db.prepare(`
        UPDATE quest_participants SET progress = ?, result = ?
        WHERE quest_id = ? AND user_id = ?
      `).run(JSON.stringify(progress), result, questId, userId);

      // 检查是否所有挑战者都有结果
      const pendingCount = db.prepare(`
        SELECT COUNT(*) as cnt FROM quest_participants
        WHERE quest_id = ? AND role IN ('challenger', 'bounty_taker') AND result IS NULL
      `).get(questId).cnt;

      if (pendingCount === 0) {
        questStatus = settleQuest(questId);
      }
    } else {
      // manual 类型：检查是否全员已提交
      const unsubmittedCount = db.prepare(`
        SELECT COUNT(*) as cnt FROM quest_participants
        WHERE quest_id = ? AND role IN ('challenger', 'bounty_taker') AND submission IS NULL
      `).get(questId).cnt;

      // 减1因为当前用户刚提交但事务内查询可能还没更新（实际已更新）
      // 这里 unsubmittedCount 已经是更新后的值（同一事务内可见）
      if (unsubmittedCount === 0) {
        db.prepare("UPDATE quests SET status = 'judging' WHERE id = ?").run(questId);
        questStatus = 'judging';
      }
    }

    return { submitted: true, questStatus };
  });

  return txn();
}

/**
 * 判定参与者完成情况
 * 校验：judging, 不能判自己, 未判过
 * 2人家庭唯一判定者决定，其他>51%
 * 全部有 result → settleQuest
 *
 * @param {number} judgeUserId
 * @param {number} questId
 * @param {number} targetUserId
 * @param {string} verdict - 'pass'|'fail'
 * @returns {{judged: boolean, targetResult: string|null}}
 */
function judgeParticipant(judgeUserId, questId, targetUserId, verdict) {
  const quest = db.prepare('SELECT * FROM quests WHERE id = ?').get(questId);
  if (!quest) throw new Error('任务不存在');
  if (quest.status !== 'judging') throw new Error('该任务不在判定阶段');

  if (judgeUserId === targetUserId) throw new Error('不能判定自己');

  // 校验判定者是同家庭成员
  const judge = db.prepare('SELECT id, family_id FROM users WHERE id = ?').get(judgeUserId);
  if (!judge || judge.family_id !== quest.family_id) throw new Error('无权操作此任务');

  // 校验目标用户是已提交的挑战者
  const target = db.prepare(
    'SELECT * FROM quest_participants WHERE quest_id = ? AND user_id = ?'
  ).get(questId, targetUserId);
  if (!target || !['challenger', 'bounty_taker'].includes(target.role)) {
    throw new Error('目标用户不是该任务的挑战者');
  }
  if (!target.submission) throw new Error('目标用户尚未提交');

  // 校验未判过
  const existingJudgment = db.prepare(
    'SELECT id FROM quest_judgments WHERE quest_id = ? AND target_user_id = ? AND judge_user_id = ?'
  ).get(questId, targetUserId, judgeUserId);
  if (existingJudgment) throw new Error('你已经判定过该成员了');

  const txn = db.transaction(() => {
    // 插入判定记录
    db.prepare(`
      INSERT INTO quest_judgments (quest_id, target_user_id, judge_user_id, verdict)
      VALUES (?, ?, ?, ?)
    `).run(questId, targetUserId, judgeUserId, verdict);

    // 统计该目标用户的判定票数
    const activeMemberCount = getActiveFamilyMemberCount(quest.family_id);
    // 有资格判定的人数 = 活跃成员 - 1（排除被判定者自己）
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
      // 2人家庭：唯一判定者直接决定
      targetResult = passCount > 0 ? 'completed' : 'failed';
    } else if (totalJudged >= eligibleJudges) {
      // 所有有资格的人都判定了
      targetResult = passCount > eligibleJudges * 0.51 ? 'completed' : 'failed';
    } else {
      // 提前判定：如果已经过半数通过或否决
      if (passCount > eligibleJudges * 0.51) {
        targetResult = 'completed';
      } else if (failCount > eligibleJudges * 0.5) {
        targetResult = 'failed';
      }
    }

    // 更新目标用户的结果
    if (targetResult) {
      db.prepare(
        'UPDATE quest_participants SET result = ? WHERE quest_id = ? AND user_id = ?'
      ).run(targetResult, questId, targetUserId);
    }

    // 检查是否所有挑战者都有结果
    const pendingCount = db.prepare(`
      SELECT COUNT(*) as cnt FROM quest_participants
      WHERE quest_id = ? AND role IN ('challenger', 'bounty_taker') AND result IS NULL
    `).get(questId).cnt;

    if (pendingCount === 0) {
      settleQuest(questId);
    }

    return { judged: true, targetResult };
  });

  return txn();
}

/**
 * 结算任务
 * - 自动结算类型：全量重算所有挑战者进度
 * - 合作模式：全员 completed 才发奖
 * - 竞争模式：第1名 upgradeQuality
 * - bounty：完成者分灵石，无人完成退还
 * - 最终 status → completed
 *
 * @param {number} questId
 * @returns {string} 最终 quest status
 */
function settleQuest(questId) {
  const quest = db.prepare('SELECT * FROM quests WHERE id = ?').get(questId);
  if (!quest) throw new Error('任务不存在');

  const challengers = db.prepare(`
    SELECT * FROM quest_participants
    WHERE quest_id = ? AND role IN ('challenger', 'bounty_taker')
  `).all(questId);

  // 自动结算类型：全量重算（不依赖增量 progress）
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

  const completedUsers = challengers.filter(c => c.result === 'completed');

  // 奖励发放
  if (quest.type !== 'bounty' && quest.category) {
    let rewardItems;
    try {
      rewardItems = JSON.parse(quest.reward_items || '[]');
    } catch {
      rewardItems = [];
    }

    if (quest.mode === 'cooperative') {
      // 合作模式：全员达成才全员获奖
      if (completedUsers.length === challengers.length && completedUsers.length > 0) {
        for (const u of completedUsers) {
          if (quest.type === 'system' && rewardItems.length > 0) {
            // 系统任务：按 reward_items 配置生成
            for (const ri of rewardItems) {
              generateRewardItem(u.user_id, quest.category, ri.quality);
            }
          } else {
            // 非系统任务：按类型和周期决定品质
            const quality = getRewardQuality(quest.type, quest.created_at, quest.deadline);
            if (quality) {
              generateRewardItem(u.user_id, quest.category, quality);
            }
          }
        }
      }
    } else {
      // 竞争模式：按进度排名，第1名品质升一级
      const ranked = [...completedUsers].sort((a, b) => {
        const pa = typeof a.progress === 'string' ? JSON.parse(a.progress) : (a.progress || {});
        const pb = typeof b.progress === 'string' ? JSON.parse(b.progress) : (b.progress || {});
        // 进度降序
        if ((pb.current || 0) !== (pa.current || 0)) {
          return (pb.current || 0) - (pa.current || 0);
        }
        // 提交时间升序（先提交排前）
        return (a.submitted_at || '').localeCompare(b.submitted_at || '');
      });

      for (let i = 0; i < ranked.length; i++) {
        const u = ranked[i];
        if (quest.type === 'system') {
          let rewardItemsParsed;
          try { rewardItemsParsed = JSON.parse(quest.reward_items || '[]'); } catch { rewardItemsParsed = []; }
          const baseQuality = rewardItemsParsed[0]?.quality || '凡品';
          const quality = i === 0 ? upgradeQuality(baseQuality) : baseQuality;
          generateRewardItem(u.user_id, quest.category, quality);
        } else {
          const baseQuality = getRewardQuality(quest.type, quest.created_at, quest.deadline);
          if (baseQuality) {
            const quality = i === 0 ? upgradeQuality(baseQuality) : baseQuality;
            generateRewardItem(u.user_id, quest.category, quality);
          }
        }
      }
    }
  }

  // bounty 模式额外处理：质押灵石转给完成者或退还
  if (quest.type === 'bounty' && quest.bounty_stones > 0) {
    if (completedUsers.length > 0) {
      const perUser = Math.floor(quest.bounty_stones / completedUsers.length);
      for (const u of completedUsers) {
        if (perUser > 0) {
          db.prepare(
            'UPDATE users SET spirit_stones = spirit_stones + ? WHERE id = ?'
          ).run(perUser, u.user_id);
        }
      }
    } else {
      // 无人完成，退还给发起者
      db.prepare(
        'UPDATE users SET spirit_stones = spirit_stones + ? WHERE id = ?'
      ).run(quest.bounty_stones, quest.creator_id);
    }
  }

  // 更新任务状态
  const now = new Date().toISOString();
  db.prepare(
    "UPDATE quests SET status = 'completed', completed_at = ? WHERE id = ?"
  ).run(now, questId);

  return 'completed';
}

/**
 * 获取/生成今日系统悬赏
 * 检查今日是否已有，有则返回；无则从任务池随机抽取（排除近30天）
 *
 * @param {number} familyId
 * @returns {object|null} quest 对象，池耗尽返回 null
 */
function getDailySystemQuest(familyId) {
  const today = getTodayUTC8();

  // 检查今日是否已有系统任务
  const existing = db.prepare(`
    SELECT * FROM quests
    WHERE family_id = ? AND type = 'system' AND date(created_at, '${SQL_TZ}') = ?
  `).get(familyId, today);

  if (existing) return existing;

  // 获取近30天已用的 source_pool_id
  const recentPoolIds = db.prepare(`
    SELECT source_pool_id FROM quests
    WHERE family_id = ? AND type = 'system'
    AND created_at >= datetime('now', '-30 days')
    AND source_pool_id IS NOT NULL
  `).all(familyId).map(r => r.source_pool_id);

  // 从任务池随机抽取（排除近30天已用的）
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

  if (!pool) return null; // 池耗尽

  // 生成 reward_items 配置
  const attrType = QUEST_CATEGORY_TO_ATTR[pool.category] || 'perception';
  const rewardItems = JSON.stringify([{
    attribute_type: attrType,
    quality: pool.reward_quality || '凡品',
    count: 1,
  }]);

  // 截止时间：今日 23:59:59
  const deadline = `${today}T23:59:59`;

  const result = db.prepare(`
    INSERT INTO quests (family_id, creator_id, type, title, description, category,
      goal_type, goal_config, mode, reward_items, source_pool_id, deadline, status)
    VALUES (?, 0, 'system', ?, ?, ?, 'manual', '{}', 'cooperative', ?, ?, ?, 'active')
  `).run(
    familyId, pool.title, pool.description, pool.category,
    rewardItems, pool.id, deadline
  );

  return db.prepare('SELECT * FROM quests WHERE id = ?').get(result.lastInsertRowid);
}

/**
 * 获取任务列表（分页）
 *
 * @param {number} familyId
 * @param {number} userId - 当前用户，用于获取 my_role
 * @param {object} filters - {status, type, page, limit}
 * @returns {{quests: Array, total: number, page: number, limit: number}}
 */
function getQuestList(familyId, userId, filters = {}) {
  const { status, type, page = 1, limit = 20 } = filters;
  const safeLimit = Math.min(Math.max(limit, 1), 50);
  const offset = (Math.max(page, 1) - 1) * safeLimit;

  let whereClauses = ['q.family_id = ?'];
  let params = [familyId];

  if (status) {
    whereClauses.push('q.status = ?');
    params.push(status);
  }
  if (type) {
    whereClauses.push('q.type = ?');
    params.push(type);
  }

  const whereStr = whereClauses.join(' AND ');

  // 总数
  const total = db.prepare(
    `SELECT COUNT(*) as cnt FROM quests q WHERE ${whereStr}`
  ).get(...params).cnt;

  // 列表查询，LEFT JOIN 获取 my_role
  const quests = db.prepare(`
    SELECT q.*,
      u.name AS creator_name,
      (SELECT COUNT(*) FROM quest_participants WHERE quest_id = q.id) AS participant_count,
      qp.role AS my_role
    FROM quests q
    JOIN users u ON u.id = q.creator_id
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

/**
 * 获取任务详情
 * JOIN 获取完整信息，自动结算类型实时计算 progress
 *
 * @param {number} questId
 * @param {number} userId - 当前用户
 * @returns {object} quest + participants + my_judgments
 */
function getQuestDetail(questId, userId) {
  const quest = db.prepare(`
    SELECT q.*, u.name AS creator_name
    FROM quests q
    JOIN users u ON u.id = q.creator_id
    WHERE q.id = ?
  `).get(questId);

  if (!quest) throw new Error('任务不存在');

  // 获取所有参与者
  const participants = db.prepare(`
    SELECT qp.*, u.name, u.avatar
    FROM quest_participants qp
    JOIN users u ON u.id = qp.user_id
    WHERE qp.quest_id = ?
  `).all(questId);

  // 自动结算类型：实时计算进度
  if (quest.goal_type !== 'manual' && quest.status === 'active') {
    for (const p of participants) {
      if (['challenger', 'bounty_taker'].includes(p.role)) {
        const progress = calculateProgress(p.user_id, quest);
        p.progress = JSON.stringify(progress);
      }
    }
  }

  // 解析 JSON 字段
  for (const p of participants) {
    try { p.progress = JSON.parse(p.progress || '{}'); } catch { p.progress = {}; }
    try { p.submission = JSON.parse(p.submission || 'null'); } catch { p.submission = null; }
  }

  // 获取当前用户的判定记录
  const myJudgments = db.prepare(
    'SELECT target_user_id, verdict FROM quest_judgments WHERE quest_id = ? AND judge_user_id = ?'
  ).all(questId, userId);

  // 解析 quest JSON 字段
  try { quest.goal_config = JSON.parse(quest.goal_config || '{}'); } catch { quest.goal_config = {}; }
  try { quest.reward_items = JSON.parse(quest.reward_items || '[]'); } catch { quest.reward_items = []; }

  return {
    ...quest,
    participants,
    my_judgments: myJudgments,
  };
}

/**
 * 刷新任务进度（行为提交时调用）
 * 增量更新 quest_participants.progress，用于前端实时展示
 *
 * @param {number} userId
 * @param {number} questId
 */
function refreshProgress(userId, questId) {
  const quest = db.prepare('SELECT * FROM quests WHERE id = ? AND status = ?').get(questId, 'active');
  if (!quest || quest.goal_type === 'manual') return;

  const participant = db.prepare(
    "SELECT * FROM quest_participants WHERE quest_id = ? AND user_id = ? AND role IN ('challenger', 'bounty_taker')"
  ).get(questId, userId);
  if (!participant) return;

  const progress = calculateProgress(userId, quest);
  db.prepare(
    'UPDATE quest_participants SET progress = ? WHERE quest_id = ? AND user_id = ?'
  ).run(JSON.stringify(progress), questId, userId);
}

// ============================================================
// 导出
// ============================================================

module.exports = {
  // 核心业务
  createQuest,
  vote,
  submitQuest,
  judgeParticipant,
  settleQuest,
  getDailySystemQuest,
  getQuestList,
  getQuestDetail,
  refreshProgress,
  // 工具函数（供定时任务和测试使用）
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
```

---

## 三、验证清单

完成后请验证：

1. `node -e "require('./server/db'); console.log('db ok')"` — 数据库初始化无报错，4 张新表和 5 个索引创建成功
2. `node -e "const db = require('./server/db').db; console.log(db.prepare('SELECT COUNT(*) as c FROM system_quest_pool').get())"` — seed data 插入成功（应为 85 条）
3. `node -e "const db = require('./server/db').db; console.log(db.pragma('table_info(users)').map(c=>c.name))"` — users 表包含 `is_active` 字段
4. `node -e "require('./server/services/questService')"` — questService.js 加载无报错
5. 手动检查 `questService.js` 中所有 `require` 路径正确（db, time, itemGen）

---

## 四、注意事项

- `creator_id=0` 表示系统发布的任务（getDailySystemQuest），users 表中不存在 id=0 的用户，路由层查询 creator_name 时需处理 NULL（JOIN users 用 LEFT JOIN）
- `bounty_stones` 与 `reward_stones` 分开：bounty_stones 是发起者质押的灵石（退还/转移），reward_stones 保留给未来系统额外奖励扩展
- `reward_items` 是 JSON 配置（描述应发什么道具），实际道具在 settleQuest 时生成并插入 items 表
- SQL 中时区统一用 `'+8 hours'` 修饰符（来自 `utils/time.js` 的 `SQL_TZ` 常量），不用 `'localtime'`
- 所有灵石操作用相对更新 `spirit_stones = spirit_stones + ?`，bounty 预扣加 `AND spirit_stones >= ?` 防负数
