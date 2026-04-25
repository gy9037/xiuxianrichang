const { db } = require('../db');

function createArena({ familyId, creatorId, type, title, description, config, currency, rewardPool }) {
  if (!['quiz', 'match', 'fitness'].includes(type)) {
    throw new Error('无效的擂台类型');
  }

  const useCurrency = currency || 'stones';
  const useRewardPool = rewardPool || 0;

  if (useCurrency === 'chips' && type !== 'match') {
    throw new Error('仅对局记录可使用筹码');
  }

  const configStr = config ? JSON.stringify(config) : null;

  const txn = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO arenas (family_id, creator_id, type, title, description, config, currency, reward_pool)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(familyId, creatorId, type, title, description || null, configStr, useCurrency, useRewardPool);

    db.prepare('INSERT INTO arena_participants (arena_id, user_id) VALUES (?, ?)').run(result.lastInsertRowid, creatorId);

    return { id: result.lastInsertRowid };
  });

  return txn();
}

function listArenas(familyId, status) {
  let sql = `
    SELECT a.*, u.name AS creator_name,
      (SELECT COUNT(*) FROM arena_participants WHERE arena_id = a.id) AS participant_count
    FROM arenas a
    JOIN users u ON u.id = a.creator_id
    WHERE a.family_id = ?
  `;
  const params = [familyId];

  if (status) {
    sql += ' AND a.status = ?';
    params.push(status);
  }

  sql += ' ORDER BY a.started_at DESC';

  return db.prepare(sql).all(...params);
}

function getArena(arenaId) {
  const arena = db.prepare(`
    SELECT a.*, u.name AS creator_name
    FROM arenas a
    JOIN users u ON u.id = a.creator_id
    WHERE a.id = ?
  `).get(arenaId);

  if (!arena) return null;

  arena.config = arena.config ? JSON.parse(arena.config) : null;

  const participants = db.prepare(`
    SELECT ap.*, u.name AS nickname, u.avatar
    FROM arena_participants ap
    JOIN users u ON u.id = ap.user_id
    WHERE ap.arena_id = ?
    ORDER BY ap.created_at ASC
  `).all(arenaId);

  for (const p of participants) {
    p.submission = p.submission ? JSON.parse(p.submission) : null;
  }

  return { ...arena, participants };
}

function joinArena(arenaId, userId) {
  const arena = db.prepare('SELECT * FROM arenas WHERE id = ?').get(arenaId);
  if (!arena) throw new Error('擂台不存在');
  if (arena.status !== 'active') throw new Error('擂台已结束');

  const existing = db.prepare(
    'SELECT id FROM arena_participants WHERE arena_id = ? AND user_id = ?'
  ).get(arenaId, userId);
  if (existing) throw new Error('已加入该擂台');

  db.prepare('INSERT INTO arena_participants (arena_id, user_id) VALUES (?, ?)').run(arenaId, userId);

  return { success: true };
}

function submitResult(arenaId, userId, submission) {
  const arena = db.prepare('SELECT * FROM arenas WHERE id = ?').get(arenaId);
  if (!arena) throw new Error('擂台不存在');
  if (arena.status !== 'active') throw new Error('擂台已结束');

  const participant = db.prepare(
    'SELECT id FROM arena_participants WHERE arena_id = ? AND user_id = ?'
  ).get(arenaId, userId);
  if (!participant) throw new Error('未加入该擂台');

  db.prepare('UPDATE arena_participants SET submission = ? WHERE arena_id = ? AND user_id = ?')
    .run(JSON.stringify(submission), arenaId, userId);

  return { success: true };
}

function judgeQuiz(arenaId, creatorId, judgments) {
  const arena = db.prepare('SELECT * FROM arenas WHERE id = ?').get(arenaId);
  if (!arena) throw new Error('擂台不存在');
  if (arena.type !== 'quiz') throw new Error('仅出题挑战支持判定');
  if (arena.creator_id !== creatorId) throw new Error('仅出题者可判定');
  if (arena.status !== 'active') throw new Error('擂台已结束');

  const updateStmt = db.prepare(
    'UPDATE arena_participants SET result = ? WHERE arena_id = ? AND user_id = ?'
  );

  const txn = db.transaction(() => {
    for (const j of judgments) {
      if (!['win', 'lose', 'draw'].includes(j.result)) {
        throw new Error(`无效的判定结果: ${j.result}`);
      }
      updateStmt.run(j.result, arenaId, j.userId);
    }
  });

  txn();
  return { success: true };
}

function settleArena(arenaId, creatorId, settlements) {
  const arena = db.prepare('SELECT * FROM arenas WHERE id = ?').get(arenaId);
  if (!arena) throw new Error('擂台不存在');
  if (arena.creator_id !== creatorId) throw new Error('仅创建者可结算');
  if (arena.status !== 'active') throw new Error('擂台已结束');

  const txn = db.transaction(() => {
    const updateParticipant = db.prepare(
      'UPDATE arena_participants SET result = ?, currency_change = ? WHERE arena_id = ? AND user_id = ?'
    );

    if (arena.currency === 'chips') {
      const totalChange = settlements.reduce((sum, s) => sum + (s.currencyChange || 0), 0);
      if (totalChange !== 0) {
        throw new Error('筹码结算总和必须为零');
      }

      const updateChips = db.prepare('UPDATE users SET chips = chips + ? WHERE id = ?');

      for (const s of settlements) {
        updateParticipant.run(s.result, s.currencyChange || 0, arenaId, s.userId);
        if (s.currencyChange) {
          updateChips.run(s.currencyChange, s.userId);
        }
      }
    } else {
      const winners = settlements.filter((s) => s.result === 'win');
      let rewardPerWinner = 0;
      if (winners.length > 0 && arena.reward_pool > 0) {
        rewardPerWinner = Math.floor(arena.reward_pool / winners.length);
      }

      const updateStones = db.prepare('UPDATE users SET spirit_stones = spirit_stones + ? WHERE id = ?');

      for (const s of settlements) {
        const change = s.result === 'win' ? rewardPerWinner : 0;
        updateParticipant.run(s.result, change, arenaId, s.userId);
        if (change > 0) {
          updateStones.run(change, s.userId);
        }
      }
    }

    db.prepare("UPDATE arenas SET status = 'completed', completed_at = datetime('now') WHERE id = ?")
      .run(arenaId);
  });

  txn();
  return { success: true };
}

function cancelArena(arenaId, creatorId) {
  const arena = db.prepare('SELECT * FROM arenas WHERE id = ?').get(arenaId);
  if (!arena) throw new Error('擂台不存在');
  if (arena.creator_id !== creatorId) throw new Error('仅创建者可取消');
  if (arena.status !== 'active') throw new Error('擂台已结束');

  db.prepare("UPDATE arenas SET status = 'cancelled', completed_at = datetime('now') WHERE id = ?")
    .run(arenaId);

  return { success: true };
}

module.exports = {
  createArena,
  listArenas,
  getArena,
  joinArena,
  submitResult,
  judgeQuiz,
  settleArena,
  cancelArena,
};
