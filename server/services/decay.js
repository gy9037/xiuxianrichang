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

// V2-F04 FB-03 - 非正常状态缓冲期从15天延长到30天
function getDailyDecay(inactiveDays, userStatus = '正常') {
  // Never-active attributes should not decay.
  if (inactiveDays === 9999) return 0;
  const buffer = (userStatus && userStatus !== '正常') ? 30 : 15; // V2-F04 FB-03
  if (inactiveDays <= buffer) return 0;
  if (inactiveDays <= buffer + 7) return 0.1;
  if (inactiveDays <= buffer + 14) return 0.2;
  return 0.3;
}

// Calculate decay for a character, return updated attribute values
// V2-F04 FB-03 - 传入用户状态
function calculateDecay(character, now = new Date(), userStatus = '正常') {
  const updates = {};
  let hasDecay = false;

  for (let i = 0; i < ATTR_FIELDS.length; i++) {
    const attr = ATTR_FIELDS[i];
    const lastActivity = character[ACTIVITY_FIELDS[i]];
    const days = daysBetween(lastActivity, now);
    if (days === 9999) continue;
    const decay = getDailyDecay(days, userStatus); // V2-F04 FB-03

    if (decay > 0 && character[attr] > 0) {
      const newVal = Math.max(0, character[attr] - decay);
      updates[attr] = Math.round(newVal * 10) / 10;
      hasDecay = true;
    }
  }

  return { updates, hasDecay };
}

// Get decay status for display
// V2-F04 FB-03
function getDecayStatus(character, now = new Date(), userStatus = '正常') {
  const statuses = [];
  const attrNames = { physique: '体魄', comprehension: '悟性', willpower: '心性', dexterity: '灵巧', perception: '神识' };
  const buffer = (userStatus && userStatus !== '正常') ? 30 : 15; // V2-F04 FB-03

  for (let i = 0; i < ATTR_FIELDS.length; i++) {
    const attr = ATTR_FIELDS[i];
    const lastActivity = character[ACTIVITY_FIELDS[i]];
    const days = daysBetween(lastActivity, now);

    let status = '正常';
    let daysUntilDecay = buffer - days;

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

    if (days > buffer + 14) status = '虚弱III'; // V2-F04 FB-03
    else if (days > buffer + 7) status = '虚弱II'; // V2-F04 FB-03
    else if (days > buffer) status = '虚弱I'; // V2-F04 FB-03
    else if (days > buffer - 3) status = '即将衰退'; // V2-F04 FB-03

    statuses.push({
      attribute: attr,
      name: attrNames[attr],
      status,
      inactiveDays: days === 9999 ? null : days,
      dailyDecay: getDailyDecay(days, userStatus), // V2-F04 FB-03
      daysUntilDecay: daysUntilDecay > 0 ? daysUntilDecay : 0,
    });
  }

  return statuses;
}

module.exports = { calculateDecay, getDecayStatus, ATTR_FIELDS, ACTIVITY_FIELDS };
