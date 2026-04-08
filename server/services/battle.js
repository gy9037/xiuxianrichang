// REQ-D2, REQ-D3, REQ-G1: Boss生成与战斗
const bossData = require('../data/bosses.json');

const DIFFICULTY_MULTIPLIER = {
  1: 1, 2: 1.5, 3: 2,
  4: 3, 5: 4, 6: 5,
  7: 7, 8: 9, 9: 12,
  10: 15,
};

const BASE_VALUE = 10;
const TAG_WEIGHT_BONUS = {
  '慢性病': { physique: 0.35 },
  '发育期': { physique: 0.3 },
  '熬夜习惯': { willpower: 0.3 },
  '久坐': { physique: 0.25 },
  '学业压力': { physique: 0.2, comprehension: 0.2 },
};

// REQ-D2: Generate boss stats
function generateBoss(difficulty, character, historyWins, userTags = []) {
  const diffMultiplier = DIFFICULTY_MULTIPLIER[difficulty] || 1;
  const historyMultiplier = 1 + (historyWins * 0.1);
  const totalPower = BASE_VALUE * diffMultiplier * historyMultiplier;

  // Distribute among 5 attributes, weighted toward user's weak points
  const attrs = ['physique', 'comprehension', 'willpower', 'dexterity', 'perception'];
  const userTotal = attrs.reduce((s, a) => s + (character[a] || 0), 0) || 1;
  const tagBoost = { physique: 0, comprehension: 0, willpower: 0, dexterity: 0, perception: 0 };

  for (const tag of userTags) {
    const bonus = TAG_WEIGHT_BONUS[tag];
    if (!bonus) continue;
    for (const [attr, value] of Object.entries(bonus)) {
      tagBoost[attr] += value;
    }
  }

  const weights = {};
  let totalWeight = 0;
  for (const attr of attrs) {
    const weaknessWeight = Math.max(0.1, 1 - (character[attr] || 0) / userTotal);
    const w = weaknessWeight * (1 + tagBoost[attr]);
    weights[attr] = w;
    totalWeight += w;
  }

  const bossAttrs = {};
  for (const attr of attrs) {
    bossAttrs[attr] = Math.round((weights[attr] / totalWeight) * totalPower * 10) / 10;
  }

  // Pick a name based on difficulty tier
  let tier;
  if (difficulty <= 3) tier = 'low';
  else if (difficulty <= 6) tier = 'mid';
  else if (difficulty <= 9) tier = 'high';
  else tier = 'ancient';

  const tierBosses = bossData[tier] || bossData['low'];
  const boss = tierBosses[Math.floor(Math.random() * tierBosses.length)];

  return {
    name: boss.name,
    description: boss.description,
    total_power: Math.round(totalPower * 10) / 10,
    ...bossAttrs,
  };
}

// REQ-D3: Battle calculation
function calculateBattle(character, equippedItems, boss) {
  const basePower = character.physique + character.comprehension
    + character.willpower + character.dexterity + character.perception;
  const itemPower = equippedItems.reduce((s, i) => s + i.temp_value, 0);
  let userPower = basePower + itemPower;

  // Crit check (悟性 → crit rate)
  const critRate = Math.min(0.4, 0.05 + character.comprehension * 0.003);
  const isCritical = Math.random() < critRate;

  // Crit damage (神识 → crit damage multiplier)
  const critDmg = Math.min(2.0, 1.5 + character.perception * 0.005);

  if (isCritical) {
    userPower *= critDmg;
  }

  // Combo check (灵巧 → combo rate)
  const comboRate = Math.min(0.15, character.dexterity * 0.002);
  const isCombo = Math.random() < comboRate;
  if (isCombo) {
    userPower *= 1.3;
  }

  // Damage reduction (心性 → reduce boss effective power)
  const dmgReduction = Math.min(0.2, character.willpower * 0.002);
  const bossPower = boss.total_power * (1 - dmgReduction);

  userPower = Math.round(userPower * 10) / 10;
  const result = userPower >= bossPower ? 'win' : 'lose';

  // Generate battle rounds for display
  const rounds = generateRounds(basePower, itemPower, boss.total_power, isCritical, isCombo, dmgReduction, result);

  return {
    user_base_power: Math.round(basePower * 10) / 10,
    user_item_power: Math.round(itemPower * 10) / 10,
    user_final_power: userPower,
    boss_power: Math.round(bossPower * 10) / 10,
    boss_original_power: boss.total_power,
    is_critical: isCritical ? 1 : 0,
    is_combo: isCombo ? 1 : 0,
    damage_reduction: Math.round(dmgReduction * 1000) / 10,
    crit_damage: Math.round(critDmg * 100),
    result,
    rounds,
  };
}

function generateRounds(basePower, itemPower, bossTotalPower, isCritical, isCombo, dmgReduction, result) {
  const rounds = [];

  rounds.push({
    round: 1,
    description: '双方对峙，灵气涌动',
    userAction: `永久属性战力：${basePower.toFixed(1)}`,
    bossAction: `妖力汇聚：${bossTotalPower.toFixed(1)}`,
  });

  if (itemPower > 0) {
    rounds.push({
      round: 2,
      description: '服用丹药，道具加持',
      userAction: `道具加成：+${itemPower.toFixed(1)}`,
      bossAction: '蓄势待发',
    });
  }

  if (isCritical) {
    rounds.push({
      round: rounds.length + 1,
      description: '灵光一闪，悟性触发暴击！',
      userAction: '暴击！战力大幅提升',
      bossAction: '被看破弱点',
    });
  }

  if (isCombo) {
    rounds.push({
      round: rounds.length + 1,
      description: '身法灵动，连击发动！',
      userAction: '连击！追加攻击',
      bossAction: '防御不及',
    });
  }

  if (dmgReduction > 0) {
    rounds.push({
      round: rounds.length + 1,
      description: '道心稳固，化解部分攻势',
      userAction: `减伤：${(dmgReduction * 100).toFixed(1)}%`,
      bossAction: '攻势被削弱',
    });
  }

  rounds.push({
    round: rounds.length + 1,
    description: result === 'win' ? '一击制胜，妖兽溃散！' : '力有不逮，暂且退避',
    userAction: result === 'win' ? '胜利' : '战败',
    bossAction: result === 'win' ? '被击败' : '获胜',
  });

  return rounds;
}

module.exports = { generateBoss, calculateBattle, DIFFICULTY_MULTIPLIER };
