const { db } = require('../db');
const questService = require('../services/questService');

function handleVoteTimeout() {
  const expiredQuests = db.prepare(
    "SELECT * FROM quests WHERE status = 'voting' AND vote_deadline < datetime('now')"
  ).all();

  for (const quest of expiredQuests) {
    try {
      const settle = db.transaction(() => {
        const memberCount = db.prepare(
          'SELECT COUNT(*) as cnt FROM users WHERE family_id = ? AND is_active = 1'
        ).get(quest.family_id).cnt;
        const approveCount = db.prepare(
          "SELECT COUNT(*) as cnt FROM quest_participants WHERE quest_id = ? AND vote = 'approve'"
        ).get(quest.id).cnt;

        const passed = memberCount === 2 ? approveCount >= 2 : approveCount > memberCount * 0.51;

        if (passed) {
          db.prepare("UPDATE quests SET status = 'active' WHERE id = ?").run(quest.id);
          console.log(`[questJobs] 任务 ${quest.id} 投票通过，已激活`);
        } else {
          db.prepare("UPDATE quests SET status = 'cancelled' WHERE id = ?").run(quest.id);
          if (quest.bounty_stones > 0) {
            db.prepare('UPDATE users SET spirit_stones = spirit_stones + ? WHERE id = ?')
              .run(quest.bounty_stones, quest.creator_id);
          }
          console.log(`[questJobs] 任务 ${quest.id} 投票未通过，已取消`);
        }
      });
      settle();
    } catch (e) {
      console.error(`[questJobs] handleVoteTimeout 处理任务 ${quest.id} 失败:`, e);
    }
  }
}

function handleQuestTimeout() {
  const expiredQuests = db.prepare(
    "SELECT * FROM quests WHERE status = 'active' AND deadline < datetime('now')"
  ).all();

  for (const quest of expiredQuests) {
    try {
      if (quest.goal_type !== 'manual') {
        questService.settleQuest(quest.id);
        console.log(`[questJobs] 任务 ${quest.id}（自动结算）已结算`);
      } else {
        const handleManual = db.transaction(() => {
          const challengers = db.prepare(
            "SELECT * FROM quest_participants WHERE quest_id = ? AND role IN ('challenger', 'bounty_taker')"
          ).all(quest.id);

          const unsubmitted = challengers.filter((p) => !p.submission);
          for (const p of unsubmitted) {
            db.prepare("UPDATE quest_participants SET result = 'failed' WHERE id = ?").run(p.id);
          }

          const submitted = challengers.filter((p) => p.submission);
          if (submitted.length === 0) {
            db.prepare("UPDATE quests SET status = 'failed', completed_at = datetime('now') WHERE id = ?").run(quest.id);
            if (quest.bounty_stones > 0) {
              db.prepare('UPDATE users SET spirit_stones = spirit_stones + ? WHERE id = ?')
                .run(quest.bounty_stones, quest.creator_id);
            }
            console.log(`[questJobs] 任务 ${quest.id}（手动）无人提交，已标记失败`);
          } else {
            db.prepare("UPDATE quests SET status = 'judging' WHERE id = ?").run(quest.id);
            console.log(`[questJobs] 任务 ${quest.id}（手动）已进入判定阶段`);
          }
        });
        handleManual();
      }
    } catch (e) {
      console.error(`[questJobs] handleQuestTimeout 处理任务 ${quest.id} 失败:`, e);
    }
  }
}

function generateDailyQuests() {
  const families = db.prepare('SELECT DISTINCT family_id FROM users WHERE is_active = 1').all();

  for (const row of families) {
    try {
      questService.getDailySystemQuest(row.family_id);
    } catch (e) {
      console.error(`[questJobs] generateDailyQuests 家庭 ${row.family_id} 失败:`, e);
    }
  }

  console.log(`[questJobs] generateDailyQuests 完成，处理 ${families.length} 个家庭`);
}

function runAll() {
  console.log(`[questJobs] 开始执行定时任务 ${new Date().toISOString()}`);
  try { handleVoteTimeout(); } catch (e) { console.error('[questJobs] handleVoteTimeout failed:', e); }
  try { handleQuestTimeout(); } catch (e) { console.error('[questJobs] handleQuestTimeout failed:', e); }
  try { generateDailyQuests(); } catch (e) { console.error('[questJobs] generateDailyQuests failed:', e); }
}

module.exports = {
  runAll,
  handleVoteTimeout,
  handleQuestTimeout,
  generateDailyQuests,
};
