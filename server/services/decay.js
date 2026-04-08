// REQ-C1: 属性衰退机制
// 15天缓冲 → 虚弱I(-0.1) → 虚弱II(-0.2) → 虚弱III(-0.3)

const ATTR_FIELDS = ['physique', 'comprehension', 'willpower', 'dexterity', 'perception'];
const ACTIVITY_FIELDS = [
  'last_physique_activity', 'last_comprehension_activity',
  'last_willpower_activity', 'last_dexterity_activity', 'last_perception_activity'
];

function daysBetween(dateStr, now) {
  if (!dateStr) return 9999;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return 9999;
  const diff = now - d;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function getDailyDecay(inactiveDays) {
  // Never-active attributes should not decay.
  if (inactiveDays === 9999) return 0;
  if (inactiveDays <= 15) return 0;
  if (inactiveDays <= 22) return 0.1;
  if (inactiveDays <= 29) return 0.2;
  return 0.3;
}

// Calculate decay for a character, return updated attribute values
function calculateDecay(character, now = new Date()) {
  const updates = {};
  let hasDecay = false;

  for (let i = 0; i < ATTR_FIELDS.length; i++) {
    const attr = ATTR_FIELDS[i];
    const lastActivity = character[ACTIVITY_FIELDS[i]];
    const days = daysBetween(lastActivity, now);
    if (days === 9999) continue;
    const decay = getDailyDecay(days);

    if (decay > 0 && character[attr] > 0) {
      const newVal = Math.max(0, character[attr] - decay);
      updates[attr] = Math.round(newVal * 10) / 10;
      hasDecay = true;
    }
  }

  return { updates, hasDecay };
}

// Get decay status for display
function getDecayStatus(character, now = new Date()) {
  const statuses = [];
  const attrNames = { physique: '体魄', comprehension: '悟性', willpower: '心性', dexterity: '灵巧', perception: '神识' };

  for (let i = 0; i < ATTR_FIELDS.length; i++) {
    const attr = ATTR_FIELDS[i];
    const lastActivity = character[ACTIVITY_FIELDS[i]];
    const days = daysBetween(lastActivity, now);

    let status = '正常';
    let daysUntilDecay = 15 - days;

    if (days === 9999) {
      statuses.push({
        attribute: attr,
        name: attrNames[attr],
        status: '正常',
        inactiveDays: null,
        dailyDecay: 0,
        daysUntilDecay: null,
      });
      continue;
    }

    if (days > 29) status = '虚弱III';
    else if (days > 22) status = '虚弱II';
    else if (days > 15) status = '虚弱I';
    else if (days > 12) status = '即将衰退';

    statuses.push({
      attribute: attr,
      name: attrNames[attr],
      status,
      inactiveDays: days === 9999 ? null : days,
      dailyDecay: getDailyDecay(days),
      daysUntilDecay: daysUntilDecay > 0 ? daysUntilDecay : 0,
    });
  }

  return statuses;
}

module.exports = { calculateDecay, getDecayStatus, ATTR_FIELDS, ACTIVITY_FIELDS };
