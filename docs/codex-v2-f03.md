# Codex 任务：V2-F03 情境化引导（今日推荐行为）

## 任务目标

在首页展示 1-2 条"今日推荐行为"卡片，根据角色属性短板推荐对应行为类别，点击可跳转行为上报页并预选类别。

溯源注释要求：所有新增/修改代码加注释 `// V2-F03 FB-01`

---

## 文件 1：`public/js/pages/home.js`

### 改动说明

在 `render()` 方法中，`decayHtml` 卡片之前插入推荐卡片 HTML。推荐逻辑在前端计算，直接使用 `this.data.character` 中已有的属性数据，无需新增接口。

### 新增方法：`getRecommendations(character)`

插入位置：`HomePage` 对象内，`render()` 方法之前。

```js
// V2-F03 FB-01
getRecommendations(character) {
  // 属性 → 推荐行为类别映射
  const ATTR_CATEGORY_MAP = {
    physique:      { label: '体魄', category: '运动健身' },
    comprehension: { label: '悟性', category: '学习成长' },
    willpower:     { label: '心性', category: '冥想休息' },
    dexterity:     { label: '灵巧', category: '生活技能' },
    perception:    { label: '神识', category: '感知记录' },
  };

  const attrs = ['physique', 'comprehension', 'willpower', 'dexterity', 'perception'];

  // 新用户：所有属性均为 0
  const allZero = attrs.every(a => character[a] === 0);
  if (allZero) return null; // 返回 null 表示展示默认引导

  // 计算均值
  const values = attrs.map(a => character[a]);
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  const threshold = avg * 0.7; // 低于均值 30% 视为短板

  // 找出短板属性，按值升序排列，取前 2 条
  const weak = attrs
    .filter(a => character[a] < threshold)
    .sort((a, b) => character[a] - character[b])
    .slice(0, 2);

  // 无明显短板时，取最低的 1 条
  if (weak.length === 0) {
    const lowest = attrs.reduce((min, a) => character[a] < character[min] ? a : min, attrs[0]);
    weak.push(lowest);
  }

  return weak.map(a => ATTR_CATEGORY_MAP[a]);
},
```

### 新增方法：`renderRecommendations(character)`

插入位置：`getRecommendations()` 之后。

```js
// V2-F03 FB-01
renderRecommendations(character) {
  const recs = this.getRecommendations(character);
  const e = API.escapeHtml.bind(API);

  // 新用户默认引导
  if (recs === null) {
    return `
      <div class="card recommend-card" onclick="HomePage.goToBehavior(null)"> <!-- V2-F03 FB-01 -->
        <div class="card-title">✨ 今日推荐</div>
        <div class="recommend-item">
          <span class="recommend-text">先去上报一次行为，获得你的第一个道具</span>
          <span class="recommend-arrow">›</span>
        </div>
      </div>
    `;
  }

  const items = recs.map(r => `
    <div class="recommend-item" onclick="HomePage.goToBehavior('${e(r.category)}')"> <!-- V2-F03 FB-01 -->
      <span class="recommend-text">强化 ${e(r.label)}：去上报一条「${e(r.category)}」行为</span>
      <span class="recommend-arrow">›</span>
    </div>
  `).join('');

  return `
    <div class="card recommend-card"> <!-- V2-F03 FB-01 -->
      <div class="card-title">✨ 今日推荐</div>
      ${items}
    </div>
  `;
},
```

### 新增方法：`goToBehavior(category)`

插入位置：`renderRecommendations()` 之后。

```js
// V2-F03 FB-01
goToBehavior(category) {
  App.navigate('behavior');
  if (category) {
    // 等 BehaviorPage 渲染完成后预选类别
    setTimeout(() => {
      BehaviorPage.selectCategory(category);
    }, 50);
  }
},
```

### 修改 `render()` 方法

在 `container.innerHTML` 模板字符串中，找到属性总览卡片之后、`decayHtml` 卡片之前，插入推荐卡片：

```js
// 在属性总览 </div> 之后插入：
${this.renderRecommendations(character)} <!-- V2-F03 FB-01 -->

// 原有 decayHtml 卡片保持不变
${decayHtml ? `<div class="card">...` : ''}
```

完整插入位置示意（在 `render()` 的 `container.innerHTML` 模板中）：

```
...属性总览卡片结束...
</div>

${this.renderRecommendations(character)}

${decayHtml ? `<div class="card"><div class="card-title">衰退预警</div>${decayHtml}</div>` : ''}
...
```

---

## 文件 2：`public/css/app.css`（或当前主样式文件）

### 新增样式

在文件末尾追加：

```css
/* V2-F03 FB-01 */
.recommend-card {
  cursor: default;
}

.recommend-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid var(--border, #eee);
  cursor: pointer;
}

.recommend-item:last-child {
  border-bottom: none;
}

.recommend-text {
  font-size: 14px;
  color: var(--text-main, #333);
  flex: 1;
}

.recommend-arrow {
  font-size: 18px;
  color: var(--text-dim, #aaa);
  margin-left: 8px;
}
```

---

## 不需要改动的文件

- `server/routes/character.js`：`GET /api/character` 已返回完整属性数据，无需新增接口
- `public/js/app.js`：`App.navigate()` 已支持跳转到 `behavior` 页，无需修改
- `public/js/pages/behavior.js`：`BehaviorPage.selectCategory()` 已存在，直接复用

---

## 验收标准

1. **新用户（所有属性为 0）**：首页显示默认引导卡片"先去上报一次行为，获得你的第一个道具"，点击跳转行为上报页
2. **有属性数据的用户**：首页显示 1-2 条推荐卡片，内容为属性短板对应的行为类别
3. **点击推荐卡片**：跳转到行为上报页，且对应类别按钮已被预选（高亮）
4. **无明显短板时**：展示最低属性对应的 1 条推荐
5. **所有新增代码**：含注释 `// V2-F03 FB-01`
6. **不引入新的后端接口**：推荐逻辑完全在前端计算
