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

// Determine quality based on template and input
function determineQuality(template, { duration, quantity, streakCount }) {
  switch (template) {
    case 'duration':
      if (!duration) return '凡品';
      if (duration > 60) return '极品';
      if (duration > 30) return '上品';
      if (duration > 15) return '良品';
      return '凡品';

    case 'quantity':
      // quantity is a multiplier of base amount (pre-calculated by caller)
      if (!quantity) return '凡品';
      if (quantity >= 5) return '极品';
      if (quantity >= 3) return '上品';
      if (quantity >= 2) return '良品';
      return '凡品';

    case 'checkin':
      if (!streakCount) return '凡品';
      if (streakCount >= 14) return '极品';
      if (streakCount >= 7) return '上品';
      if (streakCount >= 3) return '良品';
      return '凡品';

    default:
      return '凡品';
  }
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
