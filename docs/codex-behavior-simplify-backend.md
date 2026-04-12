# Codex: 行为系统简化 - 后端

> 目标：三级选择（类别→子分类→具体行为）简化为两级（类别→行为），品质判定从 template 机制改为概率掉落。

## 修改总览

| # | 文件 | 改动摘要 |
|---|------|----------|
| 1 | `server/data/behaviors.json` | 全部改为 `{ category: string[] }` 扁平结构 |
| 2 | `server/services/itemGen.js` | `determineQuality` 去掉 template，改为概率掉落 |
| 3 | `server/routes/behavior.js` | `getMergedBehaviorData` 简化为字符串数组合并 |
| 4 | `server/routes/behavior.js` | `findBehaviorDef` → `behaviorExists`，返回 boolean |
| 5 | `server/routes/behavior.js` | `POST /behavior/custom` 去掉 template/base_quantity |
| 6 | `server/routes/behavior.js` | `POST /behavior` 去掉 duration/quantity/sub_category/streak，新增 intensity |
| 7 | `server/routes/behavior.js` | `GET /shortcuts` 和 `GET /last` 简化返回字段 |
| 8 | `server/db.js` | behaviors 表新增 intensity 字段 |
| 9 | `server/routes/behavior.js` | 清理不再需要的常量和辅助函数 |

---

## 1. behaviors.json — 全扁平字符串数组

**文件**: `server/data/behaviors.json`

**整文件替换为**:

```json
{
  "身体健康": ["上肢", "核心", "胸背肩", "下肢", "综合/有氧"],
  "学习": ["读书", "做题", "背单词", "写作", "知识分享", "练字", "网课学习", "编程练习"],
  "生活习惯": ["早起", "早睡", "按时吃饭", "不熬夜", "冥想", "控制屏幕时间", "喝够水", "午休"],
  "家务": ["做饭", "洗碗", "买菜", "打扫卫生", "整理房间", "洗衣服", "拖地", "倒垃圾"],
  "社交互助": ["陪家人聊天", "帮助他人", "主动分担", "情绪管理", "主动道歉", "陪伴孩子", "家庭活动"]
}
```

---

## 2. itemGen.js — determineQuality 改为概率掉落

**文件**: `server/services/itemGen.js`

### 2a. 删除旧 determineQuality（行 19-47）

```js
// 修改前（行 19-47）
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
```

### 2b. 替换为概率掉落版本

```js
// 修改后
// Determine quality by probability
function determineQuality(category, intensity) {
  let goodRate = 0.2; // 默认 20% 良品

  if (category === '身体健康' && intensity) {
    const rateMap = {
      '热身': 0.10,
      '低强度': 0.20,
      '高强度': 0.40,
      '拉伸': 0.15,
    };
    goodRate = rateMap[intensity] ?? 0.20;
  }

  return Math.random() < goodRate ? '良品' : '凡品';
}
```

`generateItem` 和 `module.exports` 不变。

---

## 3. getMergedBehaviorData 简化

**文件**: `server/routes/behavior.js`

### 3a. 删除旧版（行 45-73）

```js
// 修改前（行 45-73）
function getMergedBehaviorData(familyId) {
  const merged = cloneBaseBehaviorData();
  const customs = db.prepare(
    `SELECT category, name, template, base_quantity
     FROM custom_behaviors
     WHERE family_id = ?
     ORDER BY created_at ASC`
  ).all(familyId);

  for (const custom of customs) {
    const target = merged[custom.category];
    if (!target) continue;

    const behavior = { name: custom.name, template: custom.template };
    if (custom.base_quantity !== null && custom.base_quantity !== undefined) {
      behavior.baseQuantity = custom.base_quantity;
    }

    if (Array.isArray(target)) {
      pushUniqueBehavior(target, behavior);
      continue;
    }

    if (!target['自定义']) target['自定义'] = [];
    pushUniqueBehavior(target['自定义'], behavior);
  }

  return merged;
}
```

### 3b. 替换为

```js
// 修改后
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

---

## 4. findBehaviorDef → behaviorExists

**文件**: `server/routes/behavior.js`

### 4a. 删除旧版（行 75-95）

```js
// 修改前（行 75-95）
function findBehaviorDef(mergedData, category, subType, subCategory) {
  const target = mergedData[category];
  if (!target) return null;

  if (Array.isArray(target)) {
    const found = target.find(b => b.name === subType);
    return found ? { behaviorDef: found, subCategory: null } : null;
  }

  if (subCategory && Array.isArray(target[subCategory])) {
    const found = target[subCategory].find(b => b.name === subType);
    if (found) return { behaviorDef: found, subCategory };
  }

  for (const [groupName, list] of Object.entries(target)) {
    const found = Array.isArray(list) ? list.find(b => b.name === subType) : null;
    if (found) return { behaviorDef: found, subCategory: groupName };
  }

  return null;
}
```

### 4b. 替换为

```js
// 修改后
function behaviorExists(mergedData, category, subType) {
  const list = mergedData[category];
  if (!Array.isArray(list)) return false;
  return list.includes(subType);
}
```

---

## 5. POST /behavior/custom 简化

**文件**: `server/routes/behavior.js`

### 5a. 删除旧版（行 104-165）

```js
// 修改前（行 104-165）
// POST /api/behavior/custom — create a custom behavior for family
router.post('/custom', (req, res) => {
  const category = String(req.body.category || '').trim();
  const name = String(req.body.name || '').trim();
  const templateRaw = String(req.body.template || '').trim();
  const template = TEMPLATE_MAP[templateRaw];
  const baseQuantityRaw = req.body.base_quantity;
  const baseQuantity = Number.isInteger(baseQuantityRaw)
    ? baseQuantityRaw
    : Number.parseInt(baseQuantityRaw, 10);

  if (!category || !name || !template) {
    return res.status(400).json({ error: '请完整填写行为分类、名称和模板' });
  }
  if (!(category in behaviorData)) {
    return res.status(400).json({ error: '无效的行为分类' });
  }
  if (name.length < 1 || name.length > 30) {
    return res.status(400).json({ error: '行为名称长度需在1-30字符之间' });
  }
  if (!VALID_TEMPLATES.has(template)) {
    return res.status(400).json({ error: '无效的品质模板' });
  }
  if (template === 'quantity' && (!Number.isInteger(baseQuantity) || baseQuantity <= 0)) {
    return res.status(400).json({ error: '数量型行为需填写大于0的基础量' });
  }

  const duplicate = db.prepare(
    `SELECT id FROM custom_behaviors
     WHERE family_id = ? AND category = ? AND lower(name) = lower(?)
     LIMIT 1`
  ).get(req.user.family_id, category, name);
  if (duplicate) {
    return res.status(400).json({ error: '该行为已存在，无需重复添加' });
  }

  const mergedForCheck = getMergedBehaviorData(req.user.family_id);
  const existed = findBehaviorDef(mergedForCheck, category, name);
  if (existed) {
    return res.status(400).json({ error: '该行为已存在，无需重复添加' });
  }

  const result = db.prepare(
    `INSERT INTO custom_behaviors (family_id, category, name, template, base_quantity, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    req.user.family_id,
    category,
    name,
    template,
    template === 'quantity' ? baseQuantity : null,
    req.user.id
  );

  res.json({
    id: result.lastInsertRowid,
    category,
    name,
    template,
    base_quantity: template === 'quantity' ? baseQuantity : null,
    message: '自定义行为添加成功',
  });
});
```

### 5b. 替换为

注意：`custom_behaviors` 表的 `template` 字段是 `NOT NULL`，需要给默认值 `'checkin'`（作为占位，简化后不再使用 template 逻辑）。

```js
// 修改后
// POST /api/behavior/custom — create a custom behavior for family
router.post('/custom', (req, res) => {
  const category = String(req.body.category || '').trim();
  const name = String(req.body.name || '').trim();

  if (!category || !name) {
    return res.status(400).json({ error: '请填写行为分类和名称' });
  }
  if (!(category in behaviorData)) {
    return res.status(400).json({ error: '无效的行为分类' });
  }
  if (name.length < 1 || name.length > 30) {
    return res.status(400).json({ error: '行为名称长度需在1-30字符之间' });
  }

  const duplicate = db.prepare(
    `SELECT id FROM custom_behaviors
     WHERE family_id = ? AND category = ? AND lower(name) = lower(?)
     LIMIT 1`
  ).get(req.user.family_id, category, name);
  if (duplicate) {
    return res.status(400).json({ error: '该行为已存在，无需重复添加' });
  }

  const mergedForCheck = getMergedBehaviorData(req.user.family_id);
  if (behaviorExists(mergedForCheck, category, name)) {
    return res.status(400).json({ error: '该行为已存在，无需重复添加' });
  }

  const result = db.prepare(
    `INSERT INTO custom_behaviors (family_id, category, name, template, base_quantity, created_by)
     VALUES (?, ?, ?, 'checkin', NULL, ?)`
  ).run(req.user.family_id, category, name, req.user.id);

  res.json({
    id: result.lastInsertRowid,
    category,
    name,
    message: '自定义行为添加成功',
  });
});
```

---

## 6. POST /behavior 简化

**文件**: `server/routes/behavior.js`

### 6a. 删除旧版（行 167-291）

```js
// 修改前（行 167-291）
// POST /api/behavior — report a behavior
router.post('/', (req, res) => {
  const { category, sub_type, sub_category, description, duration, quantity } = req.body;

  if (!category || !sub_type) {
    return res.status(400).json({ error: '请选择行为类型' });
  }

  // Find behavior definition
  const mergedData = getMergedBehaviorData(req.user.family_id);
  if (!mergedData[category]) {
    return res.status(400).json({ error: '无效的行为分类' });
  }
  const foundBehavior = findBehaviorDef(mergedData, category, sub_type, sub_category);
  if (!foundBehavior) {
    return res.status(400).json({ error: '无效的行为类型' });
  }
  const { behaviorDef } = foundBehavior;

  const template = behaviorDef.template;

  // Calculate streak for checkin-type behaviors
  let streakCount = 1;
  if (template === 'checkin') {
    const today = formatLocalDate();
    const streak = db.prepare(
      'SELECT * FROM streaks WHERE user_id = ? AND category = ? AND sub_type = ?'
    ).get(req.user.id, category, sub_type);

    if (streak) {
      const lastDate = streak.last_date;
      const yesterdayDate = new Date();
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      const yesterday = formatLocalDate(yesterdayDate);

      // BUG-01 FB-用户反馈：打卡型行为每日限一次不合理
      // 去掉每日一次的硬性限制，连击只在当天第一次打卡时更新
      if (lastDate !== today) {
        if (lastDate === yesterday) {
          streakCount = streak.current_streak + 1;
          db.prepare('UPDATE streaks SET current_streak = ?, last_date = ? WHERE id = ?')
            .run(streakCount, today, streak.id);
        } else {
          streakCount = 1;
          db.prepare('UPDATE streaks SET current_streak = 1, last_date = ? WHERE id = ?')
            .run(today, streak.id);
        }
      } else {
        // BUG-01 FB-用户反馈：打卡型行为每日限一次不合理
        // 今天已打卡过，连击数保持不变，streakCount 取当前值
        streakCount = streak.current_streak;
      }
    } else {
      db.prepare('INSERT INTO streaks (user_id, category, sub_type, current_streak, last_date) VALUES (?, ?, ?, 1, ?)')
        .run(req.user.id, category, sub_type, today);
    }
  }

  // Calculate quantity multiplier for quantity-type
  let quantityMultiplier = quantity;
  if (template === 'quantity' && behaviorDef.baseQuantity) {
    quantityMultiplier = (quantity || 0) / behaviorDef.baseQuantity;
  }

  // Determine quality
  const quality = determineQuality(template, {
    duration: duration || 0,
    quantity: quantityMultiplier,
    streakCount,
  });

  // Generate item
  const item = generateItem(category, quality);
  if (!item) return res.status(500).json({ error: '道具生成失败' });

  // Insert behavior record
  // V2-F01 FB-05 - 新增 sub_category 字段写入
  const behaviorResult = db.prepare(
    `INSERT INTO behaviors (user_id, category, sub_category, sub_type, description, quality_template, duration, quantity, quality, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  ).run(req.user.id, category, foundBehavior.subCategory || null, sub_type, description || '', template, duration || null, quantity || null, quality);

  const behaviorId = behaviorResult.lastInsertRowid;

  // Insert item
  const itemResult = db.prepare(
    `INSERT INTO items (user_id, name, quality, attribute_type, temp_value, status, source_behavior_id)
     VALUES (?, ?, ?, ?, ?, 'unused', ?)`
  ).run(req.user.id, item.name, item.quality, item.attribute_type, item.temp_value, behaviorId);

  const itemId = itemResult.lastInsertRowid;

  // Update behavior with item_id
  db.prepare('UPDATE behaviors SET item_id = ? WHERE id = ?').run(itemId, behaviorId);

  // Update last activity date for corresponding attribute
  const attrField = CATEGORY_TO_ATTR[category];
  if (!SAFE_ATTR_FIELD_SET.has(attrField)) {
    return res.status(500).json({ error: '属性映射异常' });
  }
  const activityField = ACTIVITY_FIELD_BY_ATTR[attrField];
  db.prepare(`UPDATE characters SET ${activityField} = datetime('now') WHERE user_id = ?`).run(req.user.id);

  // V2-F01 FB-05 - 更新常用行为快捷入口频次
  db.prepare(`
    INSERT INTO user_behavior_shortcuts (user_id, category, sub_category, sub_type, use_count, last_used_at)
    VALUES (?, ?, ?, ?, 1, datetime('now'))
    ON CONFLICT(user_id, category, sub_type) DO UPDATE SET
      use_count = use_count + 1,
      sub_category = excluded.sub_category,
      last_used_at = datetime('now')
  `).run(req.user.id, category, foundBehavior.subCategory || null, sub_type);

  res.json({
    behavior: {
      id: behaviorId,
      category,
      sub_type,
      sub_category: foundBehavior.subCategory,
      quality,
      streak: streakCount,
    },
    item: { id: itemId, name: item.name, quality: item.quality, attribute_type: item.attribute_type, temp_value: item.temp_value },
  });
});
```

### 6b. 替换为

```js
// 修改后
// POST /api/behavior — report a behavior
router.post('/', (req, res) => {
  const { category, sub_type, description, intensity } = req.body;

  if (!category || !sub_type) {
    return res.status(400).json({ error: '请选择行为类型' });
  }

  const mergedData = getMergedBehaviorData(req.user.family_id);
  if (!mergedData[category]) {
    return res.status(400).json({ error: '无效的行为分类' });
  }
  if (!behaviorExists(mergedData, category, sub_type)) {
    return res.status(400).json({ error: '无效的行为类型' });
  }

  // Determine quality by probability
  const quality = determineQuality(category, intensity || null);

  // Generate item
  const item = generateItem(category, quality);
  if (!item) return res.status(500).json({ error: '道具生成失败' });

  // Insert behavior record
  const behaviorResult = db.prepare(
    `INSERT INTO behaviors (user_id, category, sub_category, sub_type, description, quality_template, duration, quantity, intensity, quality, completed_at)
     VALUES (?, ?, NULL, ?, ?, NULL, NULL, NULL, ?, ?, datetime('now'))`
  ).run(req.user.id, category, sub_type, description || '', intensity || null, quality);

  const behaviorId = behaviorResult.lastInsertRowid;

  // Insert item
  const itemResult = db.prepare(
    `INSERT INTO items (user_id, name, quality, attribute_type, temp_value, status, source_behavior_id)
     VALUES (?, ?, ?, ?, ?, 'unused', ?)`
  ).run(req.user.id, item.name, item.quality, item.attribute_type, item.temp_value, behaviorId);

  const itemId = itemResult.lastInsertRowid;

  // Update behavior with item_id
  db.prepare('UPDATE behaviors SET item_id = ? WHERE id = ?').run(itemId, behaviorId);

  // Update last activity date for corresponding attribute
  const attrField = CATEGORY_TO_ATTR[category];
  if (!SAFE_ATTR_FIELD_SET.has(attrField)) {
    return res.status(500).json({ error: '属性映射异常' });
  }
  const activityField = ACTIVITY_FIELD_BY_ATTR[attrField];
  db.prepare(`UPDATE characters SET ${activityField} = datetime('now') WHERE user_id = ?`).run(req.user.id);

  // 更新常用行为快捷入口频次
  db.prepare(`
    INSERT INTO user_behavior_shortcuts (user_id, category, sub_category, sub_type, use_count, last_used_at)
    VALUES (?, ?, NULL, ?, 1, datetime('now'))
    ON CONFLICT(user_id, category, sub_type) DO UPDATE SET
      use_count = use_count + 1,
      sub_category = NULL,
      last_used_at = datetime('now')
  `).run(req.user.id, category, sub_type);

  res.json({
    behavior: {
      id: behaviorId,
      category,
      sub_type,
      quality,
    },
    item: { id: itemId, name: item.name, quality: item.quality, attribute_type: item.attribute_type, temp_value: item.temp_value },
  });
});
```

---

## 7. GET /shortcuts 和 GET /last 简化

**文件**: `server/routes/behavior.js`

### 7a. GET /shortcuts（行 293-303）

```js
// 修改前
router.get('/shortcuts', (req, res) => {
  const shortcuts = db.prepare(`
    SELECT category, sub_category, sub_type, use_count, last_used_at
    FROM user_behavior_shortcuts
    WHERE user_id = ?
    ORDER BY use_count DESC, last_used_at DESC
    LIMIT 5
  `).all(req.user.id);
  res.json(shortcuts);
});
```

```js
// 修改后
router.get('/shortcuts', (req, res) => {
  const shortcuts = db.prepare(`
    SELECT category, sub_type, use_count, last_used_at
    FROM user_behavior_shortcuts
    WHERE user_id = ?
    ORDER BY use_count DESC, last_used_at DESC
    LIMIT 5
  `).all(req.user.id);
  res.json(shortcuts);
});
```

### 7b. GET /last（行 305-315）

```js
// 修改前
router.get('/last', (req, res) => {
  const last = db.prepare(`
    SELECT category, sub_category, sub_type, duration, quantity, description
    FROM behaviors
    WHERE user_id = ?
    ORDER BY completed_at DESC
    LIMIT 1
  `).get(req.user.id);
  res.json(last || null);
});
```

```js
// 修改后
router.get('/last', (req, res) => {
  const last = db.prepare(`
    SELECT category, sub_type, intensity, description
    FROM behaviors
    WHERE user_id = ?
    ORDER BY completed_at DESC
    LIMIT 1
  `).get(req.user.id);
  res.json(last || null);
});
```

---

## 8. 数据库迁移 — behaviors 表新增 intensity 字段

**文件**: `server/db.js`

在行 175（`sub_category` ALTER TABLE 的 catch 块之后）插入：

```js
// 行为简化 - 新增 intensity 字段
try {
  db.exec(`ALTER TABLE behaviors ADD COLUMN intensity TEXT DEFAULT NULL`);
} catch (e) {
  // 列已存在，忽略
}
```

---

## 9. 清理不再需要的常量和辅助函数

**文件**: `server/routes/behavior.js`

删除以下代码（简化后不再使用）：

```js
// 删除（行 18-26）
const TEMPLATE_MAP = {
  duration: 'duration',
  quantity: 'quantity',
  checkin: 'checkin',
  时长型: 'duration',
  数量型: 'quantity',
  打卡型: 'checkin',
};
const VALID_TEMPLATES = new Set(['duration', 'quantity', 'checkin']);
```

```js
// 删除（行 39-43）
function pushUniqueBehavior(list, item) {
  if (!Array.isArray(list)) return;
  if (list.some(b => b.name === item.name)) return;
  list.push(item);
}
```

`formatLocalDate` 函数（行 28-33）：如果 streak 逻辑完全移除，也可以删除。但如果其他地方还在用，保留。当前文件中只有 `POST /behavior` 的 streak 逻辑使用它，简化后可以删除。

---

## 验收检查清单

- [ ] `behaviors.json` 是纯字符串数组结构，无嵌套对象
- [ ] `GET /api/behavior/categories` 返回 `{ category: string[] }` 格式
- [ ] `POST /api/behavior/custom` 只需 `{ category, name }`，不需要 template/base_quantity
- [ ] `POST /api/behavior` 只需 `{ category, sub_type, description?, intensity? }`，不需要 sub_category/duration/quantity
- [ ] `POST /api/behavior` 返回中无 sub_category 和 streak 字段
- [ ] 身体健康类别传入 intensity 时，良品概率按 rateMap 生效
- [ ] 非身体健康类别默认 20% 良品概率
- [ ] `GET /api/behavior/shortcuts` 返回中无 sub_category
- [ ] `GET /api/behavior/last` 返回 intensity 字段，无 duration/quantity/sub_category
- [ ] 已有数据不受影响（新字段 intensity 默认 NULL，旧字段保留但不再写入新值）
- [ ] 自定义行为写入 custom_behaviors 时 template 使用默认值 `'checkin'`，不报 NOT NULL 错误
