const express = require('express');
const { db } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { generateBoss, calculateBattle } = require('../services/battle');
const { isSingleWish, isTeamWish, mapWishRecord } = require('../services/wishType');

const router = express.Router();
router.use(authMiddleware);

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function parseEquippedIds(rawIds) {
  const raw = Array.isArray(rawIds) ? rawIds : [];
  const normalized = [...new Set(raw.map(id => Number(id)).filter(id => Number.isInteger(id) && id > 0))];
  if (raw.length !== normalized.length) {
    throw new ApiError(400, '装备道具格式不正确');
  }
  return normalized;
}

function parseWishId(rawWishId) {
  const wishId = Number(rawWishId);
  if (!Number.isInteger(wishId) || wishId <= 0) {
    throw new ApiError(400, '请选择愿望');
  }
  return wishId;
}

function parseBossId(rawBossId) {
  const bossId = Number(rawBossId);
  if (!Number.isInteger(bossId) || bossId <= 0) {
    throw new ApiError(400, '无效的Boss');
  }
  return bossId;
}

function getHistoryWins(userId) {
  const winsRow = db.prepare(
    "SELECT COUNT(*) as count FROM battles WHERE user_id = ? AND result = 'win'"
  ).get(userId);
  return winsRow.count;
}

function parseUserTags(rawTags) {
  try {
    const parsed = JSON.parse(rawTags || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getCharacterWithTags(userId) {
  return db.prepare(
    `SELECT c.*, u.tags
     FROM characters c JOIN users u ON c.user_id = u.id
     WHERE c.user_id = ?`
  ).get(userId);
}

function getWishForChallenge(reqUser, wishId) {
  const wish = db.prepare('SELECT * FROM wishes WHERE id = ?').get(wishId);
  if (!wish) throw new ApiError(404, '愿望不存在');

  const normalizedWish = mapWishRecord(wish);
  if (normalizedWish.status === 'completed' || normalizedWish.status === 'redeemed') {
    throw new ApiError(400, '该愿望已完成');
  }
  if (isSingleWish(normalizedWish.type) && normalizedWish.target_user_id !== reqUser.id) {
    throw new ApiError(403, '这是别人的单人愿望');
  }

  const hasWinForWish = db.prepare(
    `SELECT b.id
     FROM battles b
     JOIN bosses bo ON bo.id = b.boss_id
     WHERE bo.wish_id = ? AND b.user_id = ? AND b.result = 'win'
     LIMIT 1`
  ).get(normalizedWish.id, reqUser.id);
  if (hasWinForWish) {
    throw new ApiError(400, '你已通过该愿望，无需重复挑战');
  }

  return normalizedWish;
}

function getBossView(boss) {
  return {
    id: boss.id,
    name: boss.name,
    description: boss.description,
    total_power: boss.total_power,
    physique: boss.physique,
    comprehension: boss.comprehension,
    willpower: boss.willpower,
    dexterity: boss.dexterity,
    perception: boss.perception,
    status: boss.status,
  };
}

function prepareBoss(reqUser, wishId) {
  const wish = getWishForChallenge(reqUser, wishId);
  const character = getCharacterWithTags(reqUser.id);
  if (!character) throw new ApiError(404, '角色不存在');

  const existedBoss = db.prepare(
    `SELECT bo.*
     FROM bosses bo
     LEFT JOIN battles b ON b.boss_id = bo.id AND b.user_id = ?
     WHERE bo.wish_id = ? AND bo.target_user_id = ? AND bo.status = 'pending' AND b.id IS NULL
     ORDER BY bo.id DESC
     LIMIT 1`
  ).get(reqUser.id, wish.id, reqUser.id);

  if (existedBoss) {
    return { wish, boss: existedBoss, historyWins: getHistoryWins(reqUser.id) };
  }

  const historyWins = getHistoryWins(reqUser.id);
  const userTags = parseUserTags(character.tags);
  const bossStats = generateBoss(wish.difficulty, character, historyWins, userTags);

  const bossResult = db.prepare(
    `INSERT INTO bosses (wish_id, target_user_id, name, description, total_power, physique, comprehension, willpower, dexterity, perception, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
  ).run(
    wish.id, reqUser.id, bossStats.name, bossStats.description,
    bossStats.total_power, bossStats.physique, bossStats.comprehension,
    bossStats.willpower, bossStats.dexterity, bossStats.perception
  );

  const boss = db.prepare('SELECT * FROM bosses WHERE id = ?').get(bossResult.lastInsertRowid);
  return { wish, boss, historyWins };
}

function executeBattle(reqUser, bossId, equippedIds) {
  const bossRow = db.prepare(
    `SELECT bo.*,
     w.id as wish_id, w.type as wish_type, w.status as wish_status, w.target_user_id as wish_target_user_id,
     w.difficulty as wish_difficulty, w.reward_description as wish_reward_description, w.family_id as wish_family_id
     FROM bosses bo
     JOIN wishes w ON w.id = bo.wish_id
     WHERE bo.id = ?`
  ).get(bossId);

  if (!bossRow) throw new ApiError(404, 'Boss不存在');
  if (bossRow.target_user_id !== reqUser.id) throw new ApiError(403, '无权挑战该Boss');
  if (bossRow.wish_family_id !== reqUser.family_id) throw new ApiError(403, '无权挑战该Boss');
  if (bossRow.wish_status === 'completed' || bossRow.wish_status === 'redeemed') {
    throw new ApiError(400, '该愿望已完成');
  }

  const wish = mapWishRecord({
    id: bossRow.wish_id,
    type: bossRow.wish_type,
    status: bossRow.wish_status,
    target_user_id: bossRow.wish_target_user_id,
    difficulty: bossRow.wish_difficulty,
    reward_description: bossRow.wish_reward_description,
  });

  if (isSingleWish(wish.type) && wish.target_user_id !== reqUser.id) {
    throw new ApiError(403, '这是别人的单人愿望');
  }
  if (bossRow.status !== 'pending') throw new ApiError(400, '该Boss已结算，无法重复挑战');

  const existingBattle = db.prepare(
    'SELECT id FROM battles WHERE boss_id = ? AND user_id = ? LIMIT 1'
  ).get(bossRow.id, reqUser.id);
  if (existingBattle) throw new ApiError(400, '该Boss已挑战过');

  const character = db.prepare('SELECT * FROM characters WHERE user_id = ?').get(reqUser.id);
  if (!character) throw new ApiError(404, '角色不存在');

  let equippedItems = [];
  if (equippedIds.length > 0) {
    const placeholders = equippedIds.map(() => '?').join(',');
    equippedItems = db.prepare(
      `SELECT * FROM items WHERE id IN (${placeholders}) AND user_id = ? AND status = 'unused'`
    ).all(...equippedIds, reqUser.id);

    if (equippedItems.length !== equippedIds.length) {
      throw new ApiError(400, '部分装备道具不可用，请刷新后重试');
    }
  }

  const battleResult = calculateBattle(character, equippedItems, bossRow);
  const battleInsert = db.prepare(
    `INSERT INTO battles (boss_id, user_id, user_base_power, user_item_power, boss_power,
     is_critical, is_combo, damage_reduction, result, items_consumed, rounds)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    bossRow.id, reqUser.id,
    battleResult.user_base_power, battleResult.user_item_power, battleResult.boss_power,
    battleResult.is_critical, battleResult.is_combo, battleResult.damage_reduction,
    battleResult.result,
    JSON.stringify(equippedIds),
    JSON.stringify(battleResult.rounds)
  );

  if (equippedItems.length > 0) {
    const ids = equippedItems.map(i => i.id);
    const ph = ids.map(() => '?').join(',');
    db.prepare(
      `UPDATE items SET status = 'consumed_battle' WHERE user_id = ? AND status = 'unused' AND id IN (${ph})`
    ).run(reqUser.id, ...ids);
  }

  db.prepare('UPDATE bosses SET status = ? WHERE id = ?')
    .run(battleResult.result === 'win' ? 'defeated' : 'failed', bossRow.id);

  if (battleResult.result === 'win') {
    const bossWins = JSON.parse(character.boss_wins || '{}');
    const diffKey = String(wish.difficulty);
    bossWins[diffKey] = (bossWins[diffKey] || 0) + 1;
    db.prepare('UPDATE characters SET boss_wins = ? WHERE id = ?')
      .run(JSON.stringify(bossWins), character.id);

    if (isTeamWish(wish.type)) {
      const familyMembers = db.prepare('SELECT id FROM users WHERE family_id = ?').all(reqUser.family_id);
      let allWon = true;
      for (const member of familyMembers) {
        const memberWin = db.prepare(
          `SELECT b.result FROM battles b
           JOIN bosses bo ON b.boss_id = bo.id
           WHERE bo.wish_id = ? AND b.user_id = ? AND b.result = 'win'
           LIMIT 1`
        ).get(wish.id, member.id);
        if (!memberWin) { allWon = false; break; }
      }
      if (allWon) {
        db.prepare("UPDATE wishes SET status = 'completed' WHERE id = ?").run(wish.id);
      } else {
        db.prepare("UPDATE wishes SET status = 'in_progress' WHERE id = ?").run(wish.id);
      }
    } else {
      db.prepare("UPDATE wishes SET status = 'completed' WHERE id = ?").run(wish.id);
    }
  }

  return {
    battle_id: battleInsert.lastInsertRowid,
    boss: getBossView(bossRow),
    result: battleResult,
  };
}

// POST /api/battle/prepare — generate boss preview only
router.post('/prepare', (req, res) => {
  try {
    const wishId = parseWishId(req.body.wish_id);
    const prepared = prepareBoss(req.user, wishId);
    res.json({
      wish: {
        id: prepared.wish.id,
        type: prepared.wish.type,
        difficulty: prepared.wish.difficulty,
        reward_description: prepared.wish.reward_description,
      },
      boss: getBossView(prepared.boss),
      estimate: {
        min: Math.round(prepared.boss.total_power * 0.9 * 10) / 10,
        max: Math.round(prepared.boss.total_power * 1.1 * 10) / 10,
        avg: Math.round(prepared.boss.total_power * 10) / 10,
      },
    });
  } catch (error) {
    if (error instanceof ApiError) return res.status(error.status).json({ error: error.message });
    console.error('battle prepare failed', error);
    return res.status(500).json({ error: '准备战斗失败，请稍后重试' });
  }
});

// POST /api/battle/execute — execute battle with prepared boss
router.post('/execute', (req, res) => {
  try {
    const bossId = parseBossId(req.body.boss_id);
    const equippedIds = parseEquippedIds(req.body.equipped_item_ids);
    const result = executeBattle(req.user, bossId, equippedIds);
    res.json(result);
  } catch (error) {
    if (error instanceof ApiError) return res.status(error.status).json({ error: error.message });
    console.error('battle execute failed', error);
    return res.status(500).json({ error: '战斗执行失败，请稍后重试' });
  }
});

// POST /api/battle/start — backward compatibility (prepare + execute in one step)
router.post('/start', (req, res) => {
  try {
    const wishId = parseWishId(req.body.wish_id);
    const equippedIds = parseEquippedIds(req.body.equipped_item_ids);
    const prepared = prepareBoss(req.user, wishId);
    const result = executeBattle(req.user, prepared.boss.id, equippedIds);
    res.json(result);
  } catch (error) {
    if (error instanceof ApiError) return res.status(error.status).json({ error: error.message });
    console.error('battle start failed', error);
    return res.status(500).json({ error: '战斗执行失败，请稍后重试' });
  }
});

function fetchHistory(userId) {
  return db.prepare(
    `SELECT b.id, b.result, b.user_base_power, b.user_item_power, b.boss_power,
     b.is_critical, b.is_combo, b.created_at,
     bo.name as boss_name, w.name as wish_name
     FROM battles b
     JOIN bosses bo ON b.boss_id = bo.id
     JOIN wishes w ON bo.wish_id = w.id
     WHERE b.user_id = ? ORDER BY b.created_at DESC LIMIT 50`
  ).all(userId);
}

// GET /api/battle/history — battle history
router.get('/history', (req, res) => {
  res.json(fetchHistory(req.user.id));
});

// GET /api/battle — battle history (backward compatibility)
router.get('/', (req, res) => {
  res.json(fetchHistory(req.user.id));
});

// GET /api/battle/:id — get battle details
router.get('/:id', (req, res) => {
  const battle = db.prepare(
    `SELECT b.*, bo.name as boss_name, bo.description as boss_description,
     bo.total_power as boss_total_power, bo.physique as boss_physique,
     bo.comprehension as boss_comprehension, bo.willpower as boss_willpower,
     bo.dexterity as boss_dexterity, bo.perception as boss_perception,
     w.name as wish_name, w.reward_description
     FROM battles b
     JOIN bosses bo ON b.boss_id = bo.id
     JOIN wishes w ON bo.wish_id = w.id
     WHERE b.id = ? AND b.user_id = ?`
  ).get(req.params.id, req.user.id);

  if (!battle) return res.status(404).json({ error: '战斗记录不存在' });

  battle.rounds = JSON.parse(battle.rounds || '[]');
  battle.items_consumed = JSON.parse(battle.items_consumed || '[]');

  res.json(battle);
});

module.exports = router;
