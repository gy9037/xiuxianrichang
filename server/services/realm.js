// REQ-C3: 境界系统
const REALMS = [
  // 练气期 1-10阶
  { name: '练气一阶', tier: 'lianqi', level: 1, attrCap: 3, promoteCondition: { totalAttr: 0 } },
  { name: '练气二阶', tier: 'lianqi', level: 2, attrCap: 6, promoteCondition: { totalAttr: 10 } },
  { name: '练气三阶', tier: 'lianqi', level: 3, attrCap: 10, promoteCondition: { totalAttr: 22 } },
  { name: '练气四阶', tier: 'lianqi', level: 4, attrCap: 14, promoteCondition: { totalAttr: 38 } },
  { name: '练气五阶', tier: 'lianqi', level: 5, attrCap: 19, promoteCondition: { totalAttr: 55 } },
  { name: '练气六阶', tier: 'lianqi', level: 6, attrCap: 24, promoteCondition: { totalAttr: 78 } },
  { name: '练气七阶', tier: 'lianqi', level: 7, attrCap: 30, promoteCondition: { totalAttr: 100 } },
  { name: '练气八阶', tier: 'lianqi', level: 8, attrCap: 37, promoteCondition: { totalAttr: 128 } },
  { name: '练气九阶', tier: 'lianqi', level: 9, attrCap: 44, promoteCondition: { totalAttr: 158 } },
  { name: '练气十阶', tier: 'lianqi', level: 10, attrCap: 50, promoteCondition: { totalAttr: 190 } },
  // 筑基期 1-10阶 (大境界跨越有额外条件)
  { name: '筑基一阶', tier: 'zhuji', level: 1, attrCap: 58, promoteCondition: { totalAttr: 230, minEachAttr: 35, bossWins: { minDifficulty: 5, count: 3 } } },
  { name: '筑基二阶', tier: 'zhuji', level: 2, attrCap: 67, promoteCondition: { totalAttr: 275 } },
  { name: '筑基三阶', tier: 'zhuji', level: 3, attrCap: 77, promoteCondition: { totalAttr: 325 } },
  { name: '筑基四阶', tier: 'zhuji', level: 4, attrCap: 88, promoteCondition: { totalAttr: 380 } },
  { name: '筑基五阶', tier: 'zhuji', level: 5, attrCap: 100, promoteCondition: { totalAttr: 438 } },
  { name: '筑基六阶', tier: 'zhuji', level: 6, attrCap: 113, promoteCondition: { totalAttr: 500 } },
  { name: '筑基七阶', tier: 'zhuji', level: 7, attrCap: 127, promoteCondition: { totalAttr: 568 } },
  { name: '筑基八阶', tier: 'zhuji', level: 8, attrCap: 142, promoteCondition: { totalAttr: 640 } },
  { name: '筑基九阶', tier: 'zhuji', level: 9, attrCap: 158, promoteCondition: { totalAttr: 718 } },
  { name: '筑基十阶', tier: 'zhuji', level: 10, attrCap: 175, promoteCondition: { totalAttr: 800 } },
];

function getRealmByName(name) {
  return REALMS.find(r => r.name === name);
}

function getRealmIndex(name) {
  return REALMS.findIndex(r => r.name === name);
}

function getNextRealm(currentName) {
  const idx = getRealmIndex(currentName);
  if (idx < 0 || idx >= REALMS.length - 1) return null;
  return REALMS[idx + 1];
}

function getAttrCap(realmName) {
  const realm = getRealmByName(realmName);
  return realm ? realm.attrCap : 3;
}

function getTotalAttrs(character) {
  return character.physique + character.comprehension + character.willpower
    + character.dexterity + character.perception;
}

function getMinAttr(character) {
  return Math.min(
    character.physique, character.comprehension, character.willpower,
    character.dexterity, character.perception
  );
}

// Check if character can promote to next realm
function checkPromotion(character) {
  const next = getNextRealm(character.realm_stage);
  const total = getTotalAttrs(character);
  if (!next) {
    return {
      canPromote: false,
      reason: '已达最高境界',
      progress: {
        hasNextRealm: false,
        currentTotal: Math.round(total * 10) / 10,
        requiredTotal: null,
        nextRealm: null,
      },
    };
  }

  const cond = next.promoteCondition;
  const progress = {
    hasNextRealm: true,
    currentTotal: Math.round(total * 10) / 10,
    requiredTotal: cond.totalAttr,
    nextRealm: next.name,
    minEachRequired: cond.minEachAttr || null,
    currentMinAttr: Math.round(getMinAttr(character) * 10) / 10,
    bossWinsRequired: cond.bossWins?.count || 0,
    bossDifficultyRequired: cond.bossWins?.minDifficulty || 0,
    currentQualifiedBossWins: 0,
  };

  if (total < cond.totalAttr) {
    return {
      canPromote: false,
      reason: `属性总和需达到${cond.totalAttr}，当前${total.toFixed(1)}`,
      nextRealm: next.name,
      progress,
    };
  }

  if (cond.minEachAttr) {
    const minVal = getMinAttr(character);
    if (minVal < cond.minEachAttr) {
      return {
        canPromote: false,
        reason: `每项属性需达到${cond.minEachAttr}，当前最低属性${minVal.toFixed(1)}`,
        nextRealm: next.name,
        progress,
      };
    }
  }

  if (cond.bossWins) {
    const bossWins = JSON.parse(character.boss_wins || '{}');
    let qualifiedWins = 0;
    for (const [diff, count] of Object.entries(bossWins)) {
      if (parseInt(diff) >= cond.bossWins.minDifficulty) {
        qualifiedWins += count;
      }
    }
    progress.currentQualifiedBossWins = qualifiedWins;
    if (qualifiedWins < cond.bossWins.count) {
      return {
        canPromote: false,
        reason: `需打赢${cond.bossWins.count}次难度≥${cond.bossWins.minDifficulty}的Boss，当前${qualifiedWins}次`,
        nextRealm: next.name,
        progress,
      };
    }
  }

  return { canPromote: true, nextRealm: next.name, progress };
}

module.exports = { REALMS, getRealmByName, getAttrCap, getTotalAttrs, getMinAttr, checkPromotion, getNextRealm };
