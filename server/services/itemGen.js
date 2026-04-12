// REQ-B2, REQ-B3: 道具生成
const itemNames = require('../data/items.json');

const QUALITY_VALUES = {
  '凡品': 1,
  '良品': 1.5,
  '上品': 2,
  '极品': 3,
};

const CATEGORY_TO_ATTR = {
  '身体健康': 'physique',
  '学习': 'comprehension',
  '生活习惯': 'willpower',
  '家务': 'dexterity',
  '社交互助': 'perception',
};

// Determine quality by probability
function determineQuality(category, intensity, cultivationDropBonus = 0) {
  let goodRate = 0.2; // 默认 20% 良品

  if (category === '身体健康' && intensity) {
    const rateMap = {
      热身: 0.10,
      低强度: 0.20,
      高强度: 0.40,
      拉伸: 0.15,
    };
    goodRate = rateMap[intensity] ?? 0.20;
  }

  // 修炼状态掉率加成
  goodRate += cultivationDropBonus;
  goodRate = Math.min(goodRate, 0.95);

  return Math.random() < goodRate ? '良品' : '凡品';
}

// Generate a random item for a behavior
function generateItem(category, quality) {
  const attrType = CATEGORY_TO_ATTR[category];
  if (!attrType) return null;

  const names = itemNames[category] || itemNames['默认'];
  const name = names[Math.floor(Math.random() * names.length)];
  const tempValue = QUALITY_VALUES[quality];

  return { name, quality, attribute_type: attrType, temp_value: tempValue };
}

module.exports = { determineQuality, generateItem, QUALITY_VALUES, CATEGORY_TO_ATTR };
