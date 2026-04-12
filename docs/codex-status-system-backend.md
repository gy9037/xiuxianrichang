# Codex: 环境状态+修炼状态体系 - 后端

> 目标：新增两层状态体系。环境状态（居家/生病/出差）影响可用行为集合；修炼状态（精进/稳修/懈怠/停滞）根据近7天活跃度自动计算，影响掉率和衰退缓冲期。

## 修改总览

| # | 文件 | 改动摘要 |
|---|------|----------|
| 1 | `server/data/behaviors.json` | 整文件替换为按环境状态配置的结构 |
| 2 | `server/routes/behavior.js` | `getMergedBehaviorData` 新增 `userStatus` 参数，按状态过滤行为 |
| 3 | `server/routes/behavior.js` | `GET /behavior/categories` 查用户状态后传入 |
| 4 | `server/routes/behavior.js` | `POST /behavior` 查用户状态后传入验证和品质判定 |
| 5 | `server/routes/character.js` | `POST /character/status` 有效值改为居家/生病/出差 |
| 6 | `server/db.js` | 数据迁移：正常→居家，休假→居家 |
| 7 | `server/routes/behavior.js` + `server/services/itemGen.js` | `CATEGORY_TO_ATTR` 改为从 behaviors.json 读取 |
| 8 | `server/services/cultivation.js` | 新建文件：修炼状态计算逻辑 |
| 9 | `server/routes/character.js` | 新增 `GET /character/cultivation-status` 接口 |
| 10 | `server/routes/character.js` | `GET /character` 返回值新增 `cultivationStatus` |
| 11 | `server/services/itemGen.js` | `determineQuality` 接收修炼状态掉率加成 |
| 12 | `server/routes/behavior.js` | `POST /behavior` 传入修炼状态加成到品质判定 |
| 13 | `server/services/decay.js` | `getDailyDecay` / `calculateDecay` / `getDecayStatus` 接收缓冲期调整 |
| 14 | `server/routes/character.js` | `GET /character` 传入修炼状态到衰退计算 |

---

## 改动一：环境状态体系

---

## 1. behaviors.json — 按环境状态配置

**文件**: `server/data/behaviors.json`

**整文件替换为**:

```json
{
  "statuses": ["居家", "生病", "出差"],
  "categories": {
    "身体健康": {
      "attribute": "physique",
      "居家": ["上肢", "核心", "胸背肩", "下肢", "综合/有氧"],
      "生病": ["核心", "下肢", "综合/有氧", "轻度拉伸", "康复训练"],
      "出差": ["上肢", "核心", "胸背肩", "下肢", "综合/有氧"]
    },
    "学习": {
      "attribute": "comprehension",
      "居家": ["读书", "知识分享", "网课学习"],
      "生病": ["读书", "知识分享", "网课学习"],
      "出差": ["读书", "知识分享", "网课学习"]
    },
    "生活习惯": {
      "attribute": "willpower",
      "居家": ["早起", "早睡", "冥想", "喝够水"],
      "生病": ["早起", "早睡", "冥想", "喝够水", "按时吃药"],
      "出差": ["早起", "早睡", "冥想", "喝够水"]
    },
    "家务": {
      "attribute": "dexterity",
      "居家": ["做饭", "洗碗", "买菜", "打扫卫生", "整理房间"],
      "生病": [],
      "出差": []
    },
    "社交互助": {
      "attribute": "perception",
      "居家": ["组织家庭活动", "主动分担", "主动道歉"],
      "生病": ["组织家庭活动", "主动分担", "主动道歉"],
      "出差": ["拍照分享", "趣事分享", "探索新地方", "当地美食打卡"]
    }
  }
}
```

---

## 2. getMergedBehaviorData 改造

**文件**: `server/routes/behavior.js`

### 2a. 修改 cloneBaseBehaviorData 和顶部引用

当前代码（行 5, 19-21）：

```js
// 修改前
const behaviorData = require('../data/behaviors.json');
// ...
function cloneBaseBehaviorData() {
  return JSON.parse(JSON.stringify(behaviorData));
}
```

替换为：

```js
// 修改后
const behaviorConfig = require('../data/behaviors.json');

// CATEGORY_TO_ATTR 从配置读取，替代硬编码
const CATEGORY_TO_ATTR = {};
for (const [cat, conf] of Object.entries(behaviorConfig.categories)) {
  CATEGORY_TO_ATTR[cat] = conf.attribute;
}

function cloneBaseBehaviorData() {
  return JSON.parse(JSON.stringify(behaviorConfig));
}
```

同时删除行 4 中从 itemGen.js 导入的 `CATEGORY_TO_ATTR`：

```js
// 修改前（行 4）
const { determineQuality, generateItem, CATEGORY_TO_ATTR } = require('../services/itemGen');

// 修改后
const { determineQuality, generateItem } = require('../services/itemGen');
```

### 2b. 删除旧 getMergedBehaviorData（行 23-38）

```js
// 修改前（行 23-38）
function getMergedBehaviorData(familyId) {
  const merged = cloneBaseBehaviorData();
  const customs = db.prepare(
    `SELECT category, name FROM custom_behaviors WHERE family_id = ? ORDER BY created_at ASC`
  ).all(familyId);

  for (const custom of customs) {
    const target = merged[custom.category];
    if (!Array.isArray(target)) continue;
    if (!target.includes(custom.name)) {
      target.push(custom.name);
    }
  }

  return merged;
}
```

### 2c. 替换为

```js
// 修改后
function getMergedBehaviorData(familyId, userStatus = '居家') {
  const config = cloneBaseBehaviorData();
  const validStatus = config.statuses.includes(userStatus) ? userStatus : '居家';

  const result = {};
  for (const [category, catConfig] of Object.entries(config.categories)) {
    const behaviors = [...(catConfig[validStatus] || catConfig['居家'] || [])];
    result[category] = behaviors;
  }

  // 合并自定义行为（自定义行为在所有状态下都可用）
  const customs = db.prepare(
    `SELECT category, name FROM custom_behaviors WHERE family_id = ? ORDER BY created_at ASC`
  ).all(familyId);
  for (const custom of customs) {
    if (!result[custom.category]) result[custom.category] = [];
    if (!result[custom.category].includes(custom.name)) {
      result[custom.category].push(custom.name);
    }
  }

  // 过滤空类别（无内置行为且无自定义行为）
  for (const [cat, list] of Object.entries(result)) {
    if (list.length === 0) delete result[cat];
  }

  return result;
}
```

`behaviorExists` 函数不变。

---

## 3. GET /behavior/categories 传入用户状态

**文件**: `server/routes/behavior.js`

### 3a. 删除旧版（行 47-50）

```js
// 修改前（行 47-50）
router.get('/categories', (req, res) => {
  const mergedData = getMergedBehaviorData(req.user.family_id);
  res.json(mergedData);
});
```

### 3b. 替换为

```js
// 修改后
router.get('/categories', (req, res) => {
  const userRow = db.prepare('SELECT status FROM users WHERE id = ?').get(req.user.id);
  const userStatus = userRow?.status || '居家';
  const mergedData = getMergedBehaviorData(req.user.family_id, userStatus);
  res.json(mergedData);
});
```

---

## 4. POST /behavior 传入用户状态

**文件**: `server/routes/behavior.js`

### 4a. 修改行为验证部分（行 95-111 附近）

在 `POST /` 路由中，当前直接调用 `getMergedBehaviorData(req.user.family_id)`。改为先查用户状态：

```js
// 修改前（行 102）
  const mergedData = getMergedBehaviorData(req.user.family_id);
```

```js
// 修改后
  const userRow = db.prepare('SELECT status FROM users WHERE id = ?').get(req.user.id);
  const userStatus = userRow?.status || '居家';
  const mergedData = getMergedBehaviorData(req.user.family_id, userStatus);
```

### 4b. 品质判定接入修炼状态加成（与改动 12 合并）

在 `determineQuality` 调用前，获取修炼状态并传入加成：

```js
// 修改前（行 111）
  const quality = determineQuality(category, intensity || null);
```

```js
// 修改后
  const { getCultivationStatus } = require('../services/cultivation');
  const cultivation = getCultivationStatus(req.user.id);
  const quality = determineQuality(category, intensity || null, cultivation.dropBonus);
```

注意：`require` 可以提到文件顶部以避免重复加载（推荐）。如果放在顶部：

```js
// 文件顶部新增
const { getCultivationStatus } = require('../services/cultivation');
```

### 4c. 返回值新增 cultivationStatus

```js
// 修改前（行 153-161）
  res.json({
    behavior: {
      id: behaviorId,
      category,
      sub_type,
      quality,
    },
    item: { id: itemId, name: item.name, quality: item.quality, attribute_type: item.attribute_type, temp_value: item.temp_value },
  });
```

```js
// 修改后
  res.json({
    behavior: {
      id: behaviorId,
      category,
      sub_type,
      quality,
    },
    item: { id: itemId, name: item.name, quality: item.quality, attribute_type: item.attribute_type, temp_value: item.temp_value },
    cultivationStatus: cultivation,
  });
```

---

## 5. POST /character/status 更新有效状态值

**文件**: `server/routes/character.js`

### 5a. 修改有效值（行 162-170）

```js
// 修改前（行 162-170）
router.post('/status', (req, res) => {
  const { status } = req.body;
  const VALID_STATUSES = ['正常', '生病', '出差', '休假'];
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: '无效的状态，可选：正常/生病/出差/休假' });
  }
  db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, req.user.id);
  res.json({ success: true, status });
});
```

### 5b. 替换为

```js
// 修改后
router.post('/status', (req, res) => {
  const { status } = req.body;
  const VALID_STATUSES = ['居家', '生病', '出差'];
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: '无效的状态，可选：居家/生病/出差' });
  }
  db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, req.user.id);
  res.json({ success: true, status });
});
```

---

## 6. 数据迁移

**文件**: `server/db.js`

在 `initDB()` 函数末尾（行 189 之后，seed 逻辑之前）插入：

```js
// 环境状态迁移：正常→居家，休假→居家
db.prepare("UPDATE users SET status = '居家' WHERE status = '正常'").run();
db.prepare("UPDATE users SET status = '居家' WHERE status = '休假'").run();
```

同时修改 status 字段的默认值注释（行 184-189）：

```js
// 修改前（行 184-189）
  // V2-F04 FB-03 - 用户状态字段（正常/生病/出差/休假）
  try {
    db.exec(`ALTER TABLE users ADD COLUMN status TEXT DEFAULT '正常'`);
  } catch (e) {
    // V2-F04 FB-03 - 列已存在，忽略
  }
```

```js
// 修改后
  // 用户环境状态字段（居家/生病/出差）
  try {
    db.exec(`ALTER TABLE users ADD COLUMN status TEXT DEFAULT '居家'`);
  } catch (e) {
    // 列已存在，忽略
  }
```

注意：ALTER TABLE 的 DEFAULT 值对已有行无效，所以需要上面的 UPDATE 迁移语句。新用户会自动获得 '居家' 默认值。

---

## 7. CATEGORY_TO_ATTR 改为从配置读取

### 7a. behavior.js 中的改动

已在第 2 条中完成。behavior.js 顶部从 `behaviorConfig.categories` 动态构建 `CATEGORY_TO_ATTR`，不再从 itemGen.js 导入。

### 7b. itemGen.js 保留硬编码

**文件**: `server/services/itemGen.js`

itemGen.js 中的 `CATEGORY_TO_ATTR`（行 11-17）保留不变，因为被其他模块（如 behavior.js 之外的地方）通过 `require` 引用。两处值必须一致，behaviors.json 的 `attribute` 字段是权威数据源。

如果未来需要统一，可以将 itemGen.js 的 `CATEGORY_TO_ATTR` 也改为从 behaviors.json 读取：

```js
// 可选优化（itemGen.js 顶部）
const behaviorConfig = require('../data/behaviors.json');
const CATEGORY_TO_ATTR = {};
for (const [cat, conf] of Object.entries(behaviorConfig.categories)) {
  CATEGORY_TO_ATTR[cat] = conf.attribute;
}
```

本次不强制要求改 itemGen.js，但 behavior.js 必须改。

---

## 改动二：修炼状态体系

---

## 8. 新建 server/services/cultivation.js

**文件**: `server/services/cultivation.js`（新建）

```js
const { db } = require('../db');

// 修炼状态定义（从高到低匹配）
const CULTIVATION_LEVELS = [
  { name: '精进', minDays: 6, minCategories: 3, dropBonus: 0.10, bufferAdjust: 0 },
  { name: '稳修', minDays: 4, minCategories: 0, dropBonus: 0, bufferAdjust: 0 },
  { name: '懈怠', minDays: 1, minCategories: 0, dropBonus: 0, bufferAdjust: -5 },
  { name: '停滞', minDays: 0, minCategories: 0, dropBonus: 0, bufferAdjust: -10 },
];

function getCultivationStatus(userId) {
  // 最近 7 天的行为数据
  const rows = db.prepare(`
    SELECT DISTINCT date(completed_at, 'localtime') AS d, category
    FROM behaviors
    WHERE user_id = ?
      AND completed_at >= datetime('now', '-7 days')
  `).all(userId);

  const activeDays = new Set(rows.map(r => r.d)).size;
  const activeCategories = new Set(rows.map(r => r.category)).size;

  // 从高到低匹配
  for (const level of CULTIVATION_LEVELS) {
    if (activeDays >= level.minDays && activeCategories >= level.minCategories) {
      return {
        level: level.name,
        activeDays,
        activeCategories,
        dropBonus: level.dropBonus,
        bufferAdjust: level.bufferAdjust,
      };
    }
  }

  return {
    level: '停滞',
    activeDays: 0,
    activeCategories: 0,
    dropBonus: 0,
    bufferAdjust: -10,
  };
}

module.exports = { getCultivationStatus, CULTIVATION_LEVELS };
```

---

## 9. GET /character/cultivation-status 新接口

**文件**: `server/routes/character.js`

### 9a. 顶部新增 require

```js
// 文件顶部新增（行 5 之后）
const { getCultivationStatus } = require('../services/cultivation');
```

### 9b. 在 `POST /status` 路由之后（行 170 之后）插入新路由

```js
// 新增路由
router.get('/cultivation-status', (req, res) => {
  const status = getCultivationStatus(req.user.id);

  // 计算距离下一级的提示
  let nextLevelHint = null;
  if (status.level === '停滞') {
    nextLevelHint = '上报 1 次行为即可脱离停滞';
  } else if (status.level === '懈怠') {
    nextLevelHint = `再活跃 ${4 - status.activeDays} 天即可达到稳修`;
  } else if (status.level === '稳修') {
    const needDays = 6 - status.activeDays;
    const needCats = 3 - status.activeCategories;
    const hints = [];
    if (needDays > 0) hints.push(`再活跃 ${needDays} 天`);
    if (needCats > 0) hints.push(`再覆盖 ${needCats} 个类别`);
    nextLevelHint = hints.length > 0 ? `${hints.join('，')}即可达到精进` : null;
  }

  res.json({ ...status, nextLevelHint });
});
```

---

## 10. GET /character 返回修炼状态

**文件**: `server/routes/character.js`

### 10a. 在 GET / 路由中新增修炼状态计算

当前代码（行 77-126）中，在 `res.json` 之前插入修炼状态获取：

```js
// 修改前（行 104-125）
  const realm = getRealmByName(character.realm_stage);
  const promotion = checkPromotion(character);
  const decayStatus = getDecayStatus(character, new Date(), userStatus);
  const tags = parseTags(character.tags);
  const trend = getRecentTrend(req.user.id);

  res.json({
    character: {
      id: character.id,
      physique: character.physique,
      comprehension: character.comprehension,
      willpower: character.willpower,
      dexterity: character.dexterity,
      perception: character.perception,
      realm_stage: character.realm_stage,
      attr_cap: realm ? realm.attrCap : 3,
      total_attrs: getTotalAttrs(character),
      status: userStatus,
    },
    tags,
    trend,
    promotion,
    decayStatus,
  });
```

### 10b. 替换为

```js
// 修改后
  const cultivationStatus = getCultivationStatus(req.user.id);

  const realm = getRealmByName(character.realm_stage);
  const promotion = checkPromotion(character);
  const decayStatus = getDecayStatus(character, new Date(), userStatus, cultivationStatus.bufferAdjust);
  const tags = parseTags(character.tags);
  const trend = getRecentTrend(req.user.id);

  res.json({
    character: {
      id: character.id,
      physique: character.physique,
      comprehension: character.comprehension,
      willpower: character.willpower,
      dexterity: character.dexterity,
      perception: character.perception,
      realm_stage: character.realm_stage,
      attr_cap: realm ? realm.attrCap : 3,
      total_attrs: getTotalAttrs(character),
      status: userStatus,
    },
    tags,
    trend,
    promotion,
    decayStatus,
    cultivationStatus,
  });
```

注意：`calculateDecay` 调用（行 91）也需要传入 `bufferAdjust`：

```js
// 修改前（行 91）
  const { updates, hasDecay } = calculateDecay(character, new Date(), userStatus);
```

```js
// 修改后
  const cultivationStatus = getCultivationStatus(req.user.id);
  const { updates, hasDecay } = calculateDecay(character, new Date(), userStatus, cultivationStatus.bufferAdjust);
```

完整的 GET / 路由修改后执行顺序：
1. 查角色数据
2. 查用户状态
3. 计算修炼状态（`getCultivationStatus`）
4. 计算衰退（`calculateDecay`，传入 `bufferAdjust`）
5. 应用衰退
6. 获取衰退展示状态（`getDecayStatus`，传入 `bufferAdjust`）
7. 返回所有数据

---

## 11. determineQuality 接收修炼状态加成

**文件**: `server/services/itemGen.js`

### 11a. 修改 determineQuality（行 20-33）

```js
// 修改前（行 20-33）
function determineQuality(category, intensity) {
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

  return Math.random() < goodRate ? '良品' : '凡品';
}
```

### 11b. 替换为

```js
// 修改后
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

  // 修炼状态加成
  goodRate += cultivationDropBonus;
  goodRate = Math.min(goodRate, 0.95); // 上限 95%

  return Math.random() < goodRate ? '良品' : '凡品';
}
```

---

## 12. POST /behavior 中传入修炼状态加成

已在第 4 条（4b）中合并说明。核心改动：

```js
// behavior.js POST / 路由中
const cultivation = getCultivationStatus(req.user.id);
const quality = determineQuality(category, intensity || null, cultivation.dropBonus);
// ...
res.json({
  behavior: { ... },
  item: { ... },
  cultivationStatus: cultivation,
});
```

---

## 13. decay.js 接收修炼状态缓冲期调整

**文件**: `server/services/decay.js`

### 13a. getDailyDecay 修改（行 19-27）

```js
// 修改前（行 19-27）
function getDailyDecay(inactiveDays, userStatus = '正常') {
  // Never-active attributes should not decay.
  if (inactiveDays === 9999) return 0;
  const buffer = (userStatus && userStatus !== '正常') ? 30 : 15; // V2-F04 FB-03
  if (inactiveDays <= buffer) return 0;
  if (inactiveDays <= buffer + 7) return 0.1;
  if (inactiveDays <= buffer + 14) return 0.2;
  return 0.3;
}
```

```js
// 修改后
function getDailyDecay(inactiveDays, userStatus = '居家', bufferAdjust = 0) {
  if (inactiveDays === 9999) return 0;
  let buffer = (userStatus && userStatus !== '居家') ? 30 : 15;

  // 修炼状态调整缓冲期（非居家状态下不叠加负面效果）
  if (userStatus === '居家' && bufferAdjust < 0) {
    buffer += bufferAdjust; // bufferAdjust 是负数
    buffer = Math.max(buffer, 5); // 最低 5 天缓冲
  }

  if (inactiveDays <= buffer) return 0;
  if (inactiveDays <= buffer + 7) return 0.1;
  if (inactiveDays <= buffer + 14) return 0.2;
  return 0.3;
}
```

### 13b. calculateDecay 修改（行 31-50）

```js
// 修改前（行 31-50）
function calculateDecay(character, now = new Date(), userStatus = '正常') {
  const updates = {};
  let hasDecay = false;

  for (let i = 0; i < ATTR_FIELDS.length; i++) {
    const attr = ATTR_FIELDS[i];
    const lastActivity = character[ACTIVITY_FIELDS[i]];
    const days = daysBetween(lastActivity, now);
    if (days === 9999) continue;
    const decay = getDailyDecay(days, userStatus);

    if (decay > 0 && character[attr] > 0) {
      const newVal = Math.max(0, character[attr] - decay);
      updates[attr] = Math.round(newVal * 10) / 10;
      hasDecay = true;
    }
  }

  return { updates, hasDecay };
}
```

```js
// 修改后
function calculateDecay(character, now = new Date(), userStatus = '居家', bufferAdjust = 0) {
  const updates = {};
  let hasDecay = false;

  for (let i = 0; i < ATTR_FIELDS.length; i++) {
    const attr = ATTR_FIELDS[i];
    const lastActivity = character[ACTIVITY_FIELDS[i]];
    const days = daysBetween(lastActivity, now);
    if (days === 9999) continue;
    const decay = getDailyDecay(days, userStatus, bufferAdjust);

    if (decay > 0 && character[attr] > 0) {
      const newVal = Math.max(0, character[attr] - decay);
      updates[attr] = Math.round(newVal * 10) / 10;
      hasDecay = true;
    }
  }

  return { updates, hasDecay };
}
```

### 13c. getDecayStatus 修改（行 54-95）

```js
// 修改前（行 54-95）
function getDecayStatus(character, now = new Date(), userStatus = '正常') {
  const statuses = [];
  const attrNames = { physique: '体魄', comprehension: '悟性', willpower: '心性', dexterity: '灵巧', perception: '神识' };
  const buffer = (userStatus && userStatus !== '正常') ? 30 : 15;

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

    if (days > buffer + 14) status = '虚弱III';
    else if (days > buffer + 7) status = '虚弱II';
    else if (days > buffer) status = '虚弱I';
    else if (days > buffer - 3) status = '即将衰退';

    statuses.push({
      attribute: attr,
      name: attrNames[attr],
      status,
      inactiveDays: days === 9999 ? null : days,
      dailyDecay: getDailyDecay(days, userStatus),
      daysUntilDecay: daysUntilDecay > 0 ? daysUntilDecay : 0,
    });
  }

  return statuses;
}
```

```js
// 修改后
function getDecayStatus(character, now = new Date(), userStatus = '居家', bufferAdjust = 0) {
  const statuses = [];
  const attrNames = { physique: '体魄', comprehension: '悟性', willpower: '心性', dexterity: '灵巧', perception: '神识' };

  let buffer = (userStatus && userStatus !== '居家') ? 30 : 15;
  if (userStatus === '居家' && bufferAdjust < 0) {
    buffer += bufferAdjust;
    buffer = Math.max(buffer, 5);
  }

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

    if (days > buffer + 14) status = '虚弱III';
    else if (days > buffer + 7) status = '虚弱II';
    else if (days > buffer) status = '虚弱I';
    else if (days > buffer - 3) status = '即将衰退';

    statuses.push({
      attribute: attr,
      name: attrNames[attr],
      status,
      inactiveDays: days === 9999 ? null : days,
      dailyDecay: getDailyDecay(days, userStatus, bufferAdjust),
      daysUntilDecay: daysUntilDecay > 0 ? daysUntilDecay : 0,
    });
  }

  return statuses;
}
```

---

## 14. GET /character 中传入修炼状态到衰退计算

已在第 10 条中合并说明。核心改动：

```js
// character.js GET / 路由中
const cultivationStatus = getCultivationStatus(req.user.id);
const { updates, hasDecay } = calculateDecay(character, new Date(), userStatus, cultivationStatus.bufferAdjust);
// ...
const decayStatus = getDecayStatus(character, new Date(), userStatus, cultivationStatus.bufferAdjust);
```

---

## 数据迁移脚本

如果需要独立执行迁移（不依赖 `initDB` 自动运行），可用以下脚本：

```sql
-- 环境状态迁移
UPDATE users SET status = '居家' WHERE status = '正常';
UPDATE users SET status = '居家' WHERE status = '休假';

-- 验证迁移结果
SELECT status, COUNT(*) FROM users GROUP BY status;
-- 预期：只有 居家/生病/出差 三种值
```

修炼状态无需数据迁移，`getCultivationStatus` 基于 behaviors 表实时计算。

---

## 执行顺序建议

1. `server/data/behaviors.json` — 替换配置文件（第 1 条）
2. `server/services/cultivation.js` — 新建文件（第 8 条）
3. `server/services/itemGen.js` — 修改 `determineQuality`（第 11 条）
4. `server/services/decay.js` — 修改三个函数签名（第 13 条）
5. `server/db.js` — 数据迁移（第 6 条）
6. `server/routes/behavior.js` — 改造 `getMergedBehaviorData`、路由、CATEGORY_TO_ATTR（第 2/3/4/7/12 条）
7. `server/routes/character.js` — 新增路由、修改返回值、更新有效状态（第 5/9/10/14 条）

先改底层服务（cultivation、itemGen、decay），再改路由层，最后做数据迁移。

---

## 验收检查清单

### 环境状态

- [ ] `behaviors.json` 已替换为按状态配置的新结构，包含 `statuses` 和 `categories` 两个顶层字段
- [ ] `GET /api/behavior/categories` 在用户状态为"居家"时返回居家行为集合
- [ ] `GET /api/behavior/categories` 在用户状态为"生病"时，家务类别不出现（空数组被过滤）
- [ ] `GET /api/behavior/categories` 在用户状态为"出差"时，社交互助返回出差专属行为（拍照分享等）
- [ ] `POST /api/behavior` 在"生病"状态下上报"做饭"返回 400 错误
- [ ] `POST /api/character/status` 只接受"居家/生病/出差"三个值
- [ ] `POST /api/character/status` 传入"正常"或"休假"返回 400 错误
- [ ] 自定义行为在所有环境状态下都可用
- [ ] 数据迁移后，原"正常"和"休假"用户的 status 字段均为"居家"
- [ ] `CATEGORY_TO_ATTR` 在 behavior.js 中从 behaviorConfig 动态构建，值与 itemGen.js 一致

### 修炼状态

- [ ] `server/services/cultivation.js` 文件存在且可正常 require
- [ ] 7 天内活跃 6 天 + 覆盖 3 个类别 → 精进（dropBonus=0.10）
- [ ] 7 天内活跃 4 天 → 稳修（dropBonus=0, bufferAdjust=0）
- [ ] 7 天内活跃 1-3 天 → 懈怠（bufferAdjust=-5）
- [ ] 7 天内活跃 0 天 → 停滞（bufferAdjust=-10）
- [ ] `GET /api/character/cultivation-status` 返回 level、activeDays、activeCategories、dropBonus、bufferAdjust、nextLevelHint
- [ ] `GET /api/character` 返回值中包含 `cultivationStatus` 字段
- [ ] `POST /api/behavior` 返回值中包含 `cultivationStatus` 字段
- [ ] 精进状态下，身体健康高强度的良品概率为 0.40 + 0.10 = 0.50
- [ ] 良品概率上限为 0.95，不会超过
- [ ] 居家 + 停滞状态下，衰退缓冲期为 max(15-10, 5) = 5 天
- [ ] 居家 + 懈怠状态下，衰退缓冲期为 max(15-5, 5) = 10 天
- [ ] 非居家状态下（生病/出差），bufferAdjust 负值不生效，缓冲期保持 30 天
- [ ] 居家 + 精进/稳修状态下，缓冲期保持 15 天（bufferAdjust=0）
