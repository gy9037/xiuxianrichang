# 统一任务系统技术方案

> 溯源：策划案-02（统一任务系统，合并02/03/04）
> 状态：待评审
> 日期：2026-04-24
> 新增文件：server/routes/quest.js, server/services/questService.js, server/jobs/questJobs.js, server/data/quest-pool-seed.json, miniprogram/pages/quest/\*, miniprogram/pages/quest-detail/\*, miniprogram/pages/quest-create/\*
> 修改文件：server/db.js, server/index.js, miniprogram/app.json, miniprogram/pages/home/\*, miniprogram/pages/family/\*

---

## 一、概述

任务系统是行为挑战系统，与愿望系统互补。愿望系统通过 Boss 战做属性验证，任务系统通过实际行为完成做验证。

三种任务来源：
- 系统悬赏：每日自动发布 1 条轻量任务，从 85 条任务池随机抽取
- 自我悬赏：用户给自己发起的挑战目标，无需投票直接生效
- 他人悬赏/挑战：家庭成员发起，需投票通过（51% 赞成），支持悬赏模式（发起者出资灵石）

奖励机制：所有任务类型（系统悬赏、自我悬赏、挑战任务）完成后奖励道具，按任务类别映射属性类型。悬赏模式（bounty）额外涉及灵石质押和转移。

属性映射：发现类→感知道具，行动类→体魄道具，社交类→灵巧道具，感知类→感知道具，思考类→悟性道具。

关联系统：行为系统（自动结算数据源）、道具系统（奖励产出）、货币系统（bounty 灵石质押）、家庭系统（投票/判定）、R2 存储（照片提交）。

---

## 二、数据库设计

### 2.1 表结构

#### quests 表

```sql
CREATE TABLE IF NOT EXISTS quests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id INTEGER NOT NULL,
  creator_id INTEGER NOT NULL,
  type TEXT NOT NULL,                -- 'system'|'self'|'bounty'|'challenge'
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT DEFAULT NULL,        -- 五属性之一，system 类型可为空
  goal_type TEXT DEFAULT 'manual',   -- 'manual'|'behavior_count'|'streak_days'|'attr_accumulate'
  goal_config TEXT DEFAULT '{}',     -- JSON，结构见 2.5
  mode TEXT DEFAULT 'cooperative',   -- 'cooperative'|'competitive'
  reward_stones INTEGER DEFAULT 0,   -- 仅 bounty 模式下系统额外产出的灵石（非 bounty 类型为 0）
  reward_items TEXT DEFAULT '[]',    -- JSON: [{attribute_type, quality, count}]，按任务类别自动生成
  bounty_stones INTEGER DEFAULT 0,   -- 悬赏模式下发起者质押的灵石（与 reward_stones 分开）
  source_pool_id INTEGER DEFAULT NULL, -- system 类型关联 system_quest_pool.id，用于去重
  status TEXT DEFAULT 'voting',      -- 'voting'|'active'|'judging'|'completed'|'failed'|'cancelled'
  vote_deadline TEXT DEFAULT NULL,
  deadline TEXT DEFAULT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT DEFAULT NULL,
  FOREIGN KEY (family_id) REFERENCES families(id),
  FOREIGN KEY (creator_id) REFERENCES users(id)
);
```

与策划案的差异：bounty_stones 独立于 reward_stones，退还逻辑不会混淆。source_pool_id 用独立字段而非嵌套在 goal_config 中，便于索引查询。时间字段统一用 TEXT（与现有表一致）。description/goal_config/reward_items 给默认值避免 NULL 判断。

#### quest_participants 表

```sql
CREATE TABLE IF NOT EXISTS quest_participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quest_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL,                -- 'challenger'|'observer'|'bounty_taker'
  vote TEXT DEFAULT NULL,            -- 'approve'|'reject'|null
  progress TEXT DEFAULT '{}',        -- JSON: {current, target}，自动结算进度快照
  submission TEXT DEFAULT NULL,      -- JSON: {text, photo_urls}
  submitted_at TEXT DEFAULT NULL,    -- 竞争模式需要按提交时间排名
  result TEXT DEFAULT NULL,          -- 'completed'|'failed'|null
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(quest_id, user_id),
  FOREIGN KEY (quest_id) REFERENCES quests(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

#### quest_judgments 表

```sql
CREATE TABLE IF NOT EXISTS quest_judgments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quest_id INTEGER NOT NULL,
  target_user_id INTEGER NOT NULL,
  judge_user_id INTEGER NOT NULL,
  verdict TEXT NOT NULL,             -- 'pass'|'fail'
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(quest_id, target_user_id, judge_user_id),
  FOREIGN KEY (quest_id) REFERENCES quests(id)
);
```

#### system_quest_pool 表

```sql
CREATE TABLE IF NOT EXISTS system_quest_pool (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,            -- 'discover'|'action'|'social'|'perception'|'thinking'
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  requires_photo INTEGER DEFAULT 0,
  reward_quality TEXT DEFAULT '凡品'  -- 奖励道具品质：凡品/良品
);
```

### 2.2 索引

```sql
CREATE INDEX IF NOT EXISTS idx_quests_family_status ON quests(family_id, status);
CREATE INDEX IF NOT EXISTS idx_quests_family_type ON quests(family_id, type, created_at);
CREATE INDEX IF NOT EXISTS idx_qp_quest ON quest_participants(quest_id);
CREATE INDEX IF NOT EXISTS idx_qp_user ON quest_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_qj_quest ON quest_judgments(quest_id);
```

system_quest_pool 只有 85 条，不需要索引。

### 2.3 users 表补充字段

```sql
ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1;
```

废弃账号设为 is_active=0。投票阈值、家庭成员列表等只统计 is_active=1 的用户。避免废弃账号占名额导致投票永远通不过。

### 2.4 任务表迁移策略

在 server/db.js 的 initDB() 的 db.exec() 块末尾追加四个 CREATE TABLE IF NOT EXISTS 和索引语句，与现有模式一致。

seed data 策略：85 条任务池数据存放在 server/data/quest-pool-seed.json，initDB() 末尾用 COUNT(*) === 0 判断后 transaction 批量插入：

```javascript
const poolCount = db.prepare('SELECT COUNT(*) as count FROM system_quest_pool').get();
if (poolCount.count === 0) {
  const insert = db.prepare(
    'INSERT INTO system_quest_pool (category, title, description, requires_photo, reward_quality) VALUES (?, ?, ?, ?, ?)'
  );
  const seedData = require('./data/quest-pool-seed.json');
  const insertMany = db.transaction((items) => {
    for (const item of items) {
      insert.run(item.category, item.title, item.description, item.requires_photo ? 1 : 0, item.reward_quality || '凡品');
    }
  });
  insertMany(seedData);
}
```

### 2.5 与现有表的关联查询

behavior_count 结算：

```sql
SELECT COUNT(*) as cnt FROM behaviors
WHERE user_id = ? AND category = ?
  AND completed_at >= ? AND completed_at < ?
```

streak_days 结算（不复用 streaks 表，因为 streaks 只记录全局连续值，无法限定任务周期）：

```sql
SELECT DISTINCT date(completed_at, '+8 hours') as d FROM behaviors
WHERE user_id = ? AND category = ? AND sub_type = ?
  AND date(completed_at, '+8 hours') BETWEEN ? AND ?
ORDER BY d
```

查出日期列表后在应用层计算最长连续天数。数据量小（单用户单类别单周期最多 30 条），性能无问题。

attr_accumulate 结算：

```sql
SELECT COALESCE(SUM(i.temp_value), 0) as total
FROM behaviors b JOIN items i ON i.id = b.item_id
WHERE b.user_id = ? AND i.attribute_type = ?
  AND date(b.completed_at, '+8 hours') BETWEEN ? AND ?
```

灵石操作统一用相对更新 `spirit_stones = spirit_stones + ?`，配合 SQLite 写锁串行，天然避免并发问题。bounty 预扣加 `AND spirit_stones >= ?` 防负数。

### 2.6 goal_config JSON 结构规范

behavior_count：`{"target": 5, "category": "体魄", "period": "2026-04-W17"}`
streak_days：`{"target": 7, "sub_type": "早起", "period": "2026-04"}`
attr_accumulate：`{"target": 20, "attribute": "comprehension", "period": "2026-04"}`
manual：`{}`

period 格式：YYYY-Www（ISO 周，周一起始）、YYYY-MM（自然月）、YYYY-MM-DD~YYYY-MM-DD（自定义区间，波浪号分隔）。应用层提供 parsePeriod(period) 工具函数返回 {start, end}。

---

## 三、服务层设计

新增文件：server/services/questService.js，遵循 checkinService.js 模式（纯函数，不接触 req/res）。

### 3.1 函数签名

```javascript
// 创建
function createQuest(userId, data) {}
// data: {type, title, description?, category?, goalType, goalConfig?, mode?, rewardStones?, deadline}
// returns: {quest, participant?}
// throws: 灵石不足(bounty) / 参数校验失败

// 投票
function vote(userId, questId, approve, joinAsChallenger) {}
// returns: {vote, questStatus, passed}
// throws: 非 voting 状态 / 已投过票 / 非家庭成员

// 提交
function submitQuest(userId, questId, submission) {}
// submission: {text?, photoUrls?}
// returns: {submitted, questStatus}
// throws: 非 challenger / 非 active 状态 / 已提交

// 判定
function judgeParticipant(judgeUserId, questId, targetUserId, verdict) {}
// verdict: 'pass'|'fail'
// returns: {judgment, targetResult, allJudged}
// throws: 非 judging 状态 / 不能判定自己 / 已判定

// 结算（由定时任务或判定完成后自动调用）
function settleQuest(questId) {}
// returns: {results: [{userId, result, reward}]}

// 系统悬赏
function getDailySystemQuest(familyId) {}
// returns: {quest}

// 查询
function getQuestList(familyId, filters) {}
// filters: {status?, type?, page?, limit?}
function getQuestDetail(questId) {}
function refreshProgress(userId, questId) {}
```

### 3.2 核心业务逻辑

#### createQuest

```
switch data.type:
  case 'self':
    TRANSACTION:
      INSERT quests (status='active', ...)
      INSERT quest_participants (role='challenger', vote='approve')

  case 'bounty':
    校验灵石余额 >= data.rewardStones
    TRANSACTION:
      UPDATE users SET spirit_stones -= rewardStones WHERE spirit_stones >= rewardStones  // 乐观锁
      INSERT quests (status='voting', bounty_stones=rewardStones, vote_deadline=now+24h)
      INSERT quest_participants (role='observer', vote='approve')  // 发起者默认赞成

  case 'challenge':
    TRANSACTION:
      INSERT quests (status='voting', vote_deadline=now+24h)
      INSERT quest_participants (role='challenger', vote='approve')  // 发起者默认赞成+参与

  case 'system':
    throw Error('系统任务不可手动创建')  // 由 getDailySystemQuest 内部创建
```

bounty 预扣灵石而非结算时扣，避免结算时灵石已被花光。创建者自动写入 quest_participants 并算一票赞成，投票判定逻辑统一走 quest_participants 表。

#### vote

```
assert quest.status == 'voting'
assert userInFamily(userId, quest.familyId)
assert notAlreadyVoted(userId, questId)

role = approve && joinAsChallenger ? 'challenger' : 'observer'

TRANSACTION:
  INSERT quest_participants (role, vote)
  familyMembers = getActiveFamilyMemberCount(quest.familyId)  // 只统计 is_active=1
  approveCount = countApproveVotes(questId)

  if familyMembers == 2: passed = (approveCount == 2)       // 2人家庭全票
  else: passed = (approveCount > familyMembers * 0.51)       // 超过51%

  rejected = rejectCount > familyMembers * 0.5               // 反对过半则否决

  if passed: UPDATE quests SET status = 'active'
  if rejected: UPDATE quests SET status = 'cancelled'; 退还 bounty_stones
```

投票阈值基于家庭总人数而非已投票人数，未投票视为弃权不阻塞通过。

#### submitQuest

```
assert quest.status == 'active'
assert participant.role in ('challenger', 'bounty_taker')
assert participant.submission == null

TRANSACTION:
  UPDATE quest_participants SET submission=JSON, submitted_at=NOW()

  if quest.goalType != 'manual':
    // 自动结算类型：计算结果
    progress = calculateProgress(userId, quest)
    result = progress >= target ? 'completed' : 'failed'
    UPDATE quest_participants SET progress, result
    if allChallengersHaveResult: settleQuest(questId)
  else:
    if allChallengersSubmitted: UPDATE quests SET status = 'judging'
```

#### judgeParticipant

```
assert quest.status == 'judging'
assert judgeUserId != targetUserId
assert target.role == 'challenger' && target.submission != null

TRANSACTION:
  INSERT quest_judgments (verdict)
  eligibleJudges = activeFamilyMembers - 1  // 活跃成员数 - 挑战者自己
  passCount = countPassVerdicts(questId, targetUserId)

  if eligibleJudges == 1:  // 2人家庭
    targetResult = passCount > 0 ? 'completed' : 'failed'
  else if allEligibleJudged:
    targetResult = passCount > eligibleJudges * 0.51 ? 'completed' : 'failed'

  if targetResult: UPDATE quest_participants SET result = targetResult
  if allChallengersHaveResult: settleQuest(questId)
```

#### settleQuest

```
TRANSACTION:
  // 自动结算类型：全量重算（不依赖增量 progress）
  if quest.goalType != 'manual':
    for each challenger:
      progress = calculateProgress(userId, quest)
      result = progress >= target ? 'completed' : 'failed'
      UPDATE quest_participants SET progress, result

  completedUsers = challengers.filter(result == 'completed')

  // 奖励发放：道具产出，品质按任务类型和周期决定
  // 品质梯度：系统悬赏(凡品/良品) < 自我悬赏(周=良品,月=上品) < 挑战任务(周=上品,月=极品)
  baseQuality = getRewardQuality(quest.type, quest.deadline - quest.created_at)

  if quest.mode == 'cooperative':
    // 合作模式：全员达成才全员获奖
    if completedUsers.length == challengers.length:
      for each user:
        generateRewardItem(user.userId, quest.category, baseQuality)

  else:
    // 竞争模式：第1名在基础品质上升一级，其余按基础品质
    ranked = sort by progress DESC, submitted_at ASC
    for each completed user:
      quality = (rank == 1) ? upgradeQuality(baseQuality) : baseQuality
      generateRewardItem(user.userId, quest.category, quality)

  // bounty 模式额外处理：质押灵石转给完成者或退还
  if quest.type == 'bounty':
    if completedUsers.length > 0:
      perUser = floor(quest.bounty_stones / completedUsers.length)
      for each: spirit_stones += perUser
    else:
      退还 bounty_stones 给 creator

  UPDATE quests SET status='completed', completed_at=NOW()
```

合作模式全员达成才获奖，强化互相督促。竞争模式第1名品质升一级（如基础上品则第1名极品）。平局按完成时间排序，仍平局则均分该梯度。

奖励品质梯度（已确认）：

| 任务类型 | 周任务 | 月任务 | 竞争模式第1名 |
|---------|--------|--------|-------------|
| 系统悬赏 | 凡品/良品（由任务池定义） | — | — |
| 自我悬赏 | 良品 | 上品 | — |
| 挑战任务 | 上品 | 极品 | 基础品质+1级 |

品质升级规则：凡品→良品→上品→极品，极品封顶不再升。周期判定：deadline - created_at ≤ 14天为周任务，否则为月任务。

#### getDailySystemQuest

```
today = getTodayUTC8()
existing = SELECT FROM quests WHERE family_id=? AND type='system' AND date(created_at, '+8 hours')=today
if existing: return existing

recentPoolIds = SELECT source_pool_id FROM quests
  WHERE family_id=? AND type='system' AND created_at >= datetime('now', '-30 days')

pool = SELECT FROM system_quest_pool WHERE id NOT IN (recentPoolIds) ORDER BY RANDOM() LIMIT 1
if !pool: return null  // 池耗尽

INSERT quests (creator_id=0, type='system', source_pool_id=pool.id,
  status='active', deadline=today+'T23:59:59',
  category=pool.category, reward_items=generateRewardConfig(pool.category, pool.reward_quality))
```

creator_id=0 表示系统发布。去重窗口 30 天，85 条池子足够轮转。

### 3.3 自动结算引擎

三种计算函数：

```javascript
// behavior_count: 查 behaviors 表 COUNT
function calcBehaviorCount(userId, goalConfig, startDate, endDate) {
  return db.prepare(`
    SELECT COUNT(*) as cnt FROM behaviors
    WHERE user_id = ? AND category = ?
    AND date(completed_at, '+8 hours') BETWEEN ? AND ?
  `).get(userId, goalConfig.category, startDate, endDate).cnt;
}

// streak_days: 查 behaviors 表 DISTINCT date，内存计算最长连续段
function calcStreakDays(userId, goalConfig, startDate, endDate) {
  const days = db.prepare(`
    SELECT DISTINCT date(completed_at, '+8 hours') as d FROM behaviors
    WHERE user_id = ? AND category = ? AND sub_type = ?
    AND date(completed_at, '+8 hours') BETWEEN ? AND ?
    ORDER BY d
  `).all(userId, goalConfig.category, goalConfig.sub_type, startDate, endDate);

  let maxStreak = 0, current = 1;
  for (let i = 1; i < days.length; i++) {
    const diff = (new Date(days[i].d) - new Date(days[i-1].d)) / 86400000;
    if (diff === 1) current++;
    else { maxStreak = Math.max(maxStreak, current); current = 1; }
  }
  return Math.max(maxStreak, current);
}

// attr_accumulate: 查 items 表 SUM(temp_value)
function calcAttrAccumulate(userId, goalConfig, startDate, endDate) {
  return db.prepare(`
    SELECT COALESCE(SUM(i.temp_value), 0) as total
    FROM behaviors b JOIN items i ON i.id = b.item_id
    WHERE b.user_id = ? AND i.attribute_type = ?
    AND date(b.completed_at, '+8 hours') BETWEEN ? AND ?
  `).get(userId, goalConfig.attribute, startDate, endDate).total;
}
```

进度更新策略：行为提交时增量更新 quest_participants.progress（用于前端展示），结算时全量重算保证准确性。增量更新可能因异常不准确，结算重算成本低，两者结合兼顾实时性和准确性。

### 3.4 事务设计

| 操作 | 事务范围 | 原因 |
|------|---------|------|
| createQuest (bounty) | 扣灵石 + 插 quest + 插 participant | 灵石扣除必须与任务创建原子绑定 |
| createQuest (其他) | 插 quest + 插 participant | 主表和参与者表一致 |
| vote | 插 participant + 可能更新 quest status | 投票和状态变更原子 |
| submitQuest | 更新 submission + 可能更新 quest status | 提交和状态变更原子 |
| judgeParticipant | 插 judgment + 更新 result + 可能触发 settle | 判定链路原子 |
| settleQuest | 更新所有 result + 发放灵石 + 更新 quest status | 结算最关键的原子操作 |
| 定时任务（过期处理） | 更新 quest status + 可能退还灵石 | 状态变更和灵石退还原子 |

---

## 四、路由层设计

新增文件：server/routes/quest.js，挂载到 /api/quests，全局 authMiddleware。

路由挂载（server/index.js）：

```javascript
app.use('/api/quests', require('./routes/quest'));
```

### 4.1 GET /api/quests — 任务列表

Query params：status（可选）、type（可选）、page（默认1）、limit（默认20，最大50）。

权限：只返回 req.user.family_id 下的任务。

```json
{
  "quests": [
    {
      "id": 1,
      "type": "challenge",
      "title": "本周运动5次",
      "status": "active",
      "mode": "cooperative",
      "reward_stones": 50,
      "deadline": "2026-04-30T23:59:59",
      "creator_name": "小明",
      "participant_count": 2,
      "my_role": "challenger",
      "created_at": "2026-04-20T10:00:00"
    }
  ],
  "total": 15,
  "page": 1,
  "limit": 20
}
```

my_role 通过 LEFT JOIN quest_participants 获取，取值 challenger/observer/bounty_taker/null（未参与）。

### 4.2 POST /api/quests — 创建任务

| 字段 | 类型 | self | bounty | challenge | 说明 |
|------|------|------|--------|-----------|------|
| type | string | 必填 | 必填 | 必填 | system 由定时任务创建 |
| title | string | 必填 | 必填 | 必填 | 1-50字符 |
| description | string | 选填 | 选填 | 选填 | |
| category | string | 选填 | 选填 | 选填 | 五属性之一 |
| goal_type | string | 必填 | 必填 | 必填 | manual/behavior_count/streak_days/attr_accumulate |
| goal_config | object | 条件必填 | 条件必填 | 条件必填 | goal_type 非 manual 时必填 |
| mode | string | — | — | 选填 | cooperative(默认)/competitive |
| reward_stones | number | — | 必填 | — | bounty 灵石出资，≥1 |
| deadline | string | 必填 | 必填 | 必填 | ISO 日期，必须在未来 |

```json
// 成功
{ "id": 1, "status": "active" }
{ "id": 2, "status": "voting" }

// 错误 400
{ "error": "灵石余额不足" }
{ "error": "请填写任务标题" }
{ "error": "截止时间必须在未来" }
{ "error": "自动结算任务需要填写目标配置" }
```

### 4.3 POST /api/quests/:id/vote — 投票

```json
// 请求
{ "approve": true, "joinAsChallenger": true }

// 成功
{ "voted": true, "quest_status": "active" }

// 错误
{ "error": "你已经投过票了" }
{ "error": "该任务不在投票阶段" }
{ "error": "无权操作此任务" }
```

权限：同家庭成员可投票，创建者不能投票（创建时默认算赞成票），每人只投一次，self 类型不允许投票。

### 4.4 POST /api/quests/:id/submit — 提交完成信息

```json
// 请求
{ "text": "今天跑了5公里", "photoUrls": ["https://r2.example.com/images/1/xxx.jpg"] }

// 成功
{ "submitted": true, "quest_status": "judging" }

// 错误
{ "error": "请填写完成说明" }
{ "error": "你不是该任务的挑战者" }
{ "error": "该任务不在进行中" }
```

权限：role=challenger 或 bounty_taker 可提交，status 必须为 active。校验：text 必填 1-500 字符，photoUrls 选填最多 3 张，URL 必须以项目 R2 域名开头。照片先通过 POST /api/upload/image 上传，此处只传 URL。

### 4.5 POST /api/quests/:id/judge — 判定

```json
// 请求
{ "targetUserId": 2, "verdict": "pass" }

// 成功
{ "judged": true, "target_result": "completed" }

// 错误
{ "error": "你已经判定过该成员了" }
{ "error": "不能判定自己" }
{ "error": "该任务不在判定阶段" }
```

权限：同家庭成员可判定，不能判定自己，status 必须为 judging，目标用户必须是已提交的挑战者。

### 4.6 GET /api/quests/:id — 任务详情

```json
{
  "id": 1,
  "type": "challenge",
  "title": "本周运动5次",
  "description": "每人本周完成5次体魄类行为",
  "category": "体魄",
  "goal_type": "behavior_count",
  "goal_config": { "category": "体魄", "target": 5 },
  "mode": "cooperative",
  "status": "active",
  "reward_stones": 50,
  "deadline": "2026-04-30T23:59:59",
  "creator": { "id": 1, "name": "小明" },
  "participants": [
    {
      "user_id": 1, "name": "小明", "role": "challenger",
      "vote": "approve", "progress": { "current": 3, "target": 5 },
      "submission": null, "result": null
    }
  ],
  "my_judgments": [{ "target_user_id": 2, "verdict": "pass" }],
  "created_at": "2026-04-20T10:00:00"
}
```

progress 字段：自动结算任务实时计算返回（查 behaviors 表），手动任务返回 null。

### 4.7 GET /api/quests/daily — 今日系统悬赏

```json
{
  "id": 10,
  "title": "拍一张今天看到的最美的光影",
  "description": "用手机记录下今天最打动你的一个光影瞬间",
  "category": "discover",
  "reward_items": [{"attribute_type": "perception", "quality": "凡品", "count": 1}],
  "status": "active",
  "deadline": "2026-04-24T23:59:59",
  "my_submission": null
}
```

不存在则调用 questService.getDailySystemQuest(familyId) 自动生成。

---

## 五、定时任务设计

新增文件：server/jobs/questJobs.js，导出 runAll() 函数。

挂载方式（server/index.js）：

```javascript
const questJobs = require('./jobs/questJobs');
setInterval(questJobs.runAll, 10 * 60 * 1000); // 每10分钟
```

用 setInterval 而非独立 cron，因为项目是 Docker 单容器部署，进程内定时器最简单。10 分钟间隔足够覆盖投票超时和任务超时场景。

### 5.1 handleVoteTimeout

触发：status='voting' 且 vote_deadline < NOW()。

处理：统计当前票数，赞成过半（基于活跃成员数）则 status='active'，否则 status='cancelled'。bounty 类型退还 bounty_stones 给 creator。

### 5.2 handleQuestTimeout

触发：status='active' 且 deadline < NOW()。

处理：
- 自动结算任务：计算最终结果，发放道具奖励，status='completed'
- 手动判定任务：未提交的挑战者 result='failed'，已提交的进入 judging（status='judging'）。无人提交则直接 status='failed'

### 5.3 generateDailyQuests

触发：每次 runAll 检查，当日首次运行时为所有家庭生成系统悬赏。

去重：查 quests 表该家庭最近 30 天的 source_pool_id，排除后随机抽取。池耗尽则跳过。

注意：judging 阶段不设超时。任务进入 judging 后一直等待，直到有人完成判定。符合策划案"失败无惩罚"原则，避免因家庭成员忘记判定导致挑战者白做。

```javascript
function runAll() {
  try { handleVoteTimeout(); } catch(e) { console.error('handleVoteTimeout failed:', e); }
  try { handleQuestTimeout(); } catch(e) { console.error('handleQuestTimeout failed:', e); }
  try { generateDailyQuests(); } catch(e) { console.error('generateDailyQuests failed:', e); }
}
```

三个子任务各自独立 try/catch，互不影响。

---

## 六、前端设计

### 6.1 页面规划

新增 3 个二级页面，不加入 tabBar（5 个 tab 已满，微信限制最多 5 个）。

| 页面 | 路径 | 说明 |
|------|------|------|
| 任务列表 | pages/quest/quest | 全部任务筛选浏览 |
| 任务详情 | pages/quest-detail/quest-detail | 信息、操作、进度 |
| 创建任务 | pages/quest-create/quest-create | 表单创建各类型任务 |

入口设计：
- 首页「今日悬赏」卡片（金色边框，展示当日系统悬赏，点击进入详情）
- 首页 FAB 浮动按钮组新增「任务」按钮，跳转任务列表
- 家庭页插入「家庭任务」卡片，展示进行中/投票中任务摘要（最多3条），点击进入列表

### 6.2 任务列表页

顶部三 tab 切换：进行中（active，截止时间升序）、投票中（voting，创建时间降序）、已结束（completed/failed/cancelled，完成时间降序）。默认选中「进行中」。

「进行中」tab 顶部用金色边框置顶展示今日系统悬赏（独立调用 GET /api/quests/daily）。

列表项信息：标题、类型标签（不同颜色）、截止时间（剩余 X 天）、参与人数、我的角色标记（紫色=挑战者、金色=待投票、蓝色=待判定）、进度条（自动结算类型）。

右下角悬浮「+ 发起任务」按钮。

### 6.3 任务详情页

通过 GET /api/quests/:id 获取数据，根据 status 和用户角色动态渲染。

信息区：标题+类型标签、描述、发起人/创建时间/截止时间、奖励信息、模式标签。

进度区（自动结算类型）：进度条+数值，多人时展示每位挑战者进度行。

参与者列表：头像+昵称+角色标签+状态。

操作区（底部固定栏，动态按钮）：

| 状态 | 用户身份 | 操作 |
|------|---------|------|
| voting | 未投票成员 | 赞成/反对 + 一起挑战勾选框 |
| voting | 已投票成员 | 显示已投票状态 |
| active | 挑战者（未提交） | 提交完成按钮 |
| active | 悬赏未接取者 | 接取悬赏按钮 |
| judging | 非挑战者 | 通过/未完成判定按钮 |
| completed/failed | 所有人 | 显示结算结果 |

提交流程：点击「提交完成」弹出半屏弹窗，文字输入（必填）+ 照片选择（wx.chooseMedia，最多3张）。上传流程：选照片 → 逐张 POST /api/upload/image → 收集 URL → POST /api/quests/:id/submit。

### 6.4 创建任务页

类型选择联动不同字段。系统悬赏由后端自动生成，前端不提供创建入口。

结算方式配置：选择「自动结算」后展开二级 picker（目标类型 → 行为类别/子类型/属性 → 目标数值）。

悬赏模式：显示当前灵石余额，输入出资数量，实时校验不超过余额。

### 6.5 与现有系统集成

行为提交后的任务进度：后端自动更新，前端在 onShow 时刷新。任务详情页展示进度条（如 3/5 次），自动结算类型实时反映最新进度。

家庭 Feed：首版实现。任务事件（创建、投票通过、完成）由后端写入 feed，前端现有 feed 渲染逻辑已支持不同类型，只需后端加 feed_type='quest'。需要在 family.wxml 中增加 `wx:if="{{item.feed_type === 'quest'}}"` 分支渲染任务卡片样式。

通知：首页 FAB 和家庭页卡片用红点 badge 提示待处理任务。微信订阅消息作为可选增强，不阻塞首版。

---

## 七、文件变更清单

### 新增文件

| 文件 | 说明 |
|------|------|
| server/routes/quest.js | 7 个 API 端点 |
| server/services/questService.js | 任务系统核心业务逻辑 |
| server/jobs/questJobs.js | 3 个定时任务函数 |
| server/data/quest-pool-seed.json | 85 条系统悬赏任务池 |
| miniprogram/pages/quest/quest.{js,wxml,wxss,json} | 任务列表页 |
| miniprogram/pages/quest-detail/quest-detail.{js,wxml,wxss,json} | 任务详情页 |
| miniprogram/pages/quest-create/quest-create.{js,wxml,wxss,json} | 创建任务页 |

### 修改文件

| 文件 | 改动 |
|------|------|
| server/db.js | initDB() 追加 4 张表 + 5 个索引 + seed data + users.is_active 字段 |
| server/index.js | 挂载 /api/quests 路由 + setInterval 定时任务 |
| miniprogram/app.json | pages 数组新增 3 个页面路径 |
| miniprogram/pages/home/home.js | 新增 loadDailyQuest()、loadPendingCount()、FAB 跳转 |
| miniprogram/pages/home/home.wxml | 新增今日悬赏卡片、FAB 任务按钮 |
| miniprogram/pages/home/home.wxss | 今日悬赏卡片样式 |
| miniprogram/pages/family/family.js | 新增 loadFamilyQuests()、跳转方法 |
| miniprogram/pages/family/family.wxml | 新增家庭任务卡片 |
| miniprogram/pages/family/family.wxss | 家庭任务卡片样式 |

---

## 八、待确认事项

1. 85 条任务池的具体内容：已完成，见 server/data/quest-pool-seed.json
2. 竞争模式奖励分配：当前方案第1名品质升一级、其余基础品质，体验后再调整
3. 探索图鉴功能：策划案-02 已标记待补充，后续单独细化策划案再出技术方案
4. 里程碑机制：Gavin 提到行为提交后的进度展示想做成里程碑形式，具体设计待讨论
