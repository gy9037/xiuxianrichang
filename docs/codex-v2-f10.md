# Codex 任务指令 — V2-F10 成就/里程碑系统

> 溯源标注：`// V2-F10`
> 项目目录：`/Users/openclaw/AI开发项目/Xiuxianrichang`

---

## 任务概述

为「修仙日常」新增成就/里程碑系统。成就定义硬编码在后端，无需新建数据库表。涉及两个文件：

1. `server/routes/character.js` — 新增 `GET /api/character/achievements` 接口
2. `public/js/pages/home.js` — 首页新增成就卡片 UI

---

## 文件一：`server/routes/character.js`

### 改动位置

在文件顶部 `const ATTR_FIELDS = [...]` 之后、`const TAG_PRESETS = [...]` 之前，插入成就定义常量。

然后在文件末尾 `module.exports = router;` 之前，插入新路由。

### 插入 1 — 成就定义常量（紧接 ATTR_FIELDS 之后）

```js
// V2-F10 — 成就定义（硬编码，无需数据库表）
const ACHIEVEMENTS = [
  { id: 'first_behavior', name: '初入修仙', desc: '完成第一次行为上报', icon: '🌱' },
  { id: 'first_boss_win', name: '斩妖除魔', desc: '第一次打赢Boss', icon: '⚔️' },
  { id: 'streak_7', name: '七日不辍', desc: '任意行为连续打卡7天', icon: '🔥' },
  { id: 'attr_10', name: '小有所成', desc: '任意属性达到10点', icon: '💫' },
  { id: 'realm_up', name: '境界突破', desc: '完成第一次境界突破', icon: '🌟' },
  { id: 'items_50', name: '道具收藏家', desc: '累计获得50个道具', icon: '🎒' },
];
```

### 插入 2 — 新路由（在 `module.exports = router;` 之前）

```js
// V2-F10 — GET /api/character/achievements
router.get('/achievements', (req, res) => {
  const userId = req.user.id;

  // 并行查询所有成就所需数据
  const behaviorCount = db.prepare(
    'SELECT COUNT(*) AS cnt FROM behaviors WHERE user_id = ?'
  ).get(userId).cnt;

  const bossWinCount = db.prepare(
    "SELECT COUNT(*) AS cnt FROM battles WHERE user_id = ? AND result = 'win'"
  ).get(userId).cnt;

  const maxStreak = db.prepare(
    'SELECT MAX(current_streak) AS ms FROM streaks WHERE user_id = ?'
  ).get(userId).ms || 0;

  const character = db.prepare(
    'SELECT physique, comprehension, willpower, dexterity, perception, realm_stage FROM characters WHERE user_id = ?'
  ).get(userId);

  const itemCount = db.prepare(
    'SELECT COUNT(*) AS cnt FROM items WHERE user_id = ?'
  ).get(userId).cnt;

  // 成就解锁判断
  const unlockMap = {
    first_behavior: behaviorCount > 0,
    first_boss_win: bossWinCount > 0,
    streak_7: maxStreak >= 7,
    attr_10: character
      ? ATTR_FIELDS.some(f => (character[f] || 0) >= 10)
      : false,
    realm_up: character ? character.realm_stage !== '练气一阶' : false,
    items_50: itemCount >= 50,
  };

  const result = ACHIEVEMENTS.map(a => ({
    ...a,
    unlocked: unlockMap[a.id] ?? false,
    unlockedAt: null, // V2-F10: 无时间戳表，暂返回 null
  }));

  res.json(result);
});
```

> **注意**：`unlockedAt` 当前无专用时间戳表，统一返回 `null`。如后续需要精确时间，可新建 `achievement_unlocks` 表记录首次解锁时间。

---

## 文件二：`public/js/pages/home.js`

### 改动位置

找到首页数据加载函数（通常是 `loadHome()` 或 `init()` 或页面初始化入口），在其中追加成就卡片的加载逻辑。

### 插入逻辑

```js
// V2-F10 — 加载成就卡片
async function loadAchievements() {
  const res = await fetch('/api/character/achievements');
  if (!res.ok) return;
  const achievements = await res.json();

  // 渲染成就卡片
  const container = document.getElementById('achievements-container');
  if (!container) return;

  container.innerHTML = achievements.map(a => `
    <div class="achievement-item ${a.unlocked ? 'unlocked' : 'locked'}">
      <span class="achievement-icon">${a.icon}</span>
      <span class="achievement-name">${a.name}</span>
      <span class="achievement-desc">${a.desc}</span>
    </div>
  `).join('');

  // V2-F10 — 新解锁成就 toast 提示
  // 用 sessionStorage 记录本次已提示的成就，避免刷新重复弹
  const toastedKey = 'v2f10_toasted';
  const toasted = JSON.parse(sessionStorage.getItem(toastedKey) || '[]');
  const newlyUnlocked = achievements.filter(
    a => a.unlocked && !toasted.includes(a.id)
  );
  newlyUnlocked.forEach(a => {
    showToast(`🎉 成就解锁：${a.icon} ${a.name}`);
    toasted.push(a.id);
  });
  sessionStorage.setItem(toastedKey, JSON.stringify(toasted));
}
```

### HTML 占位（在首页模板中添加）

在首页 HTML（`public/index.html` 或对应模板）中，找到合适位置插入成就卡片容器：

```html
<!-- V2-F10 成就卡片 -->
<section class="achievements-section">
  <h3>成就</h3>
  <div id="achievements-container"></div>
</section>
```

### CSS 样式（可追加到现有样式文件）

```css
/* V2-F10 */
.achievement-item { display: flex; align-items: center; gap: 8px; padding: 6px 0; }
.achievement-item.locked { opacity: 0.35; filter: grayscale(1); }
.achievement-icon { font-size: 1.4em; }
.achievement-name { font-weight: bold; }
.achievement-desc { font-size: 0.85em; color: #888; }
```

---

## 验收标准

1. `GET /api/character/achievements` 返回长度为 6 的数组，每项包含 `id / name / desc / icon / unlocked / unlockedAt` 字段，未达成的 `unlocked` 为 `false`。
2. 首页成就卡片正确渲染：已解锁成就正常显示，未解锁成就灰色半透明。
3. 当某成就在本次页面加载时首次被判定为已解锁，页面弹出 toast 提示，刷新后不重复弹出（sessionStorage 去重）。
