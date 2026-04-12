# Codex 指令：V2.5 家庭页交互优化

> 关联策划案：docs/iteration-v2.5.md
> 涉及文件：public/js/pages/family.js, public/css/style.css
> 溯源：V25-024~V25-029, V25-071~V25-076, V25-091~V25-093

---

## 源码确认结论

读取 `public/js/pages/family.js`（107 行）后确认：

- `react()` 行 99-106：调用 `API.post('/family/react', ...)` 后执行 `await this.load()` 全量重渲染。前端无 toggle UI 逻辑、无乐观更新、无防抖。
- 后端已支持 toggle（`f.myReactions` 数组存在，行 67 用于高亮判断），但前端 `react()` 本身未做 toggle 处理。
- **V25-029 结论：F06 fix 仅完成后端 toggle，前端需要实现。不跳过。**
- 团队愿望成员状态（行 90）直接输出 `p.status` 原始英文值，无中文映射。
- quality 回退（行 54）用 includes 检查，不在列表内回退到"凡品"，无 console.warn。
- 表情按钮 padding 为 `2px 10px`（行 72），触控区域不足 44px。

---

## 修改总览表

| 序号 | 策划编号 | 优先级 | 简述 | 涉及方法/行 | 状态 |
|------|---------|--------|------|------------|------|
| 1 | V25-024 | P0 | 页面加载 loading 状态 | load() 行 2-13 | 待实现 |
| 2 | V25-025 | P0 | 表情互动乐观更新，消除全量重渲染 | react() 行 99-106 | 待实现 |
| 3 | V25-026 | P0 | 表情按钮防连点+禁用反馈 | react() 行 99-106 | 待实现 |
| 4 | V25-027 | P0 | 单个 API 失败不影响整页 | load() 行 2-13 | 待实现 |
| 5 | V25-028 | P0 | 表情按钮触控区域增大 | render() 行 72 | 待实现 |
| 6 | V25-029 | P0 | 表情 toggle 前端实现 | react() + render() | 待实现 |
| 7 | V25-071 | P1 | Feed 时间改为相对时间 | render() 行 59 | 待实现 |
| 8 | V25-072 | P1 | 团队愿望成员状态中文映射 | render() 行 90 | 待实现 |
| 9 | V25-073 | P1 | 成员列表移除可点击暗示 | render() 行 28-37 | 待实现 |
| 10 | V25-074 | P1 | 成员为空引导文案 | render() 行 40 | 待实现 |
| 11 | V25-075 | P1 | 表情按钮含义标签 | render() 行 70-74 | 待实现 |
| 12 | V25-076 | P1 | quality 异常值开发提示 | render() 行 54 | 待实现 |
| 13 | V25-091 | P2 | 移动端下拉刷新 | 新增代码 | 待实现 |
| 14 | V25-092 | P2 | Feed 头像背景色区分 | render() 行 29, 48 | 待实现 |
| 15 | V25-093 | P2 | 团队愿望进度折叠 | render() 行 85-93 | 待实现 |

---

## 详细修改指令

### 1. V25-024：页面加载 loading 状态（P0）

**文件**：`public/js/pages/family.js`

**修改 load() 方法**（当前行 2-13）

修改前：

```js
async load() {
  try {
    const [members, feed, wishes] = await Promise.all([
      API.get('/family/members'),
      API.get('/family/feed'),
      API.get('/wishes'),
    ]);
    this.render(members, feed, wishes);
  } catch (e) {
    App.toast(e.message, 'error');
  }
},
```

修改后：

```js
async load() {
  const container = document.getElementById('page-family');
  // V2.5 V25-024 - 加载期间显示 spinner
  container.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 0">
      <div style="width:36px;height:36px;border:3px solid var(--border);border-top-color:var(--primary);border-radius:50%;animation:spin 0.8s linear infinite"></div>
      <div style="margin-top:12px;font-size:13px;color:var(--text-dim)">加载中…</div>
      <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
    </div>
  `;
  // V2.5 V25-027 - 改为 allSettled，单个失败不影响整页
  const [membersResult, feedResult, wishesResult] = await Promise.allSettled([
    API.get('/family/members'),
    API.get('/family/feed'),
    API.get('/wishes'),
  ]);
  const members = membersResult.status === 'fulfilled' ? membersResult.value : null;
  const feed = feedResult.status === 'fulfilled' ? feedResult.value : null;
  const wishes = wishesResult.status === 'fulfilled' ? wishesResult.value : null;
  this.render(members, feed, wishes);
},
```

注意：V25-024 和 V25-027 合并实施。load() 不再有 try/catch 包裹整体，容错由 allSettled + render 内部降级处理。

---

### 2. V25-027：单个 API 失败降级展示（P0）

**文件**：`public/js/pages/family.js`

已在 V25-024 中完成 load() 改造。render() 需要处理参数为 null 的情况。

**修改 render() 方法开头**（当前行 15-17）

修改前：

```js
render(members, feed, wishes) {
  const container = document.getElementById('page-family');
  const teamWishes = (wishes || []).filter(w => w.type === '团队' && w.status !== 'redeemed');
```

修改后：

```js
render(members, feed, wishes) {
  const container = document.getElementById('page-family');
  const safeMembers = Array.isArray(members) ? members : null;
  const safeFeed = Array.isArray(feed) ? feed : null;
  const teamWishes = Array.isArray(wishes)
    ? wishes.filter(w => w.type === '团队' && w.status !== 'redeemed')
    : null;
```

然后在 render() 的三个卡片区域分别加降级处理（见下方各卡片修改）。

**成员卡片降级**（行 23-41 区域）：

修改前：

```js
<div class="card">
  <div class="card-title">家庭成员</div>
  ${members.map(m => {
```

修改后：

```js
<div class="card">
  <div class="card-title">家庭成员</div>
  ${safeMembers === null ? '<div class="empty-state" style="color:var(--red)">成员数据加载失败</div>' :
  safeMembers.map(m => {
```

对应闭合处（行 39-41）：

修改前：

```js
  }).join('')}
  ${members.length === 0 ? '<div class="empty-state">暂无其他家庭成员</div>' : ''}
</div>
```

修改后：

```js
  }).join('') +
  (safeMembers.length === 0 ? '<div class="empty-state">还没有其他家庭成员，邀请家人一起修炼吧</div>' : '')}
</div>
```

注意：此处同时完成了 V25-074（空状态引导文案）。

**动态卡片降级**（行 43-79 区域）：

修改前：

```js
<div class="card">
  <div class="card-title">最近动态</div>
  ${feed.length === 0 ? '<div class="empty-state">还没有动态</div>' : ''}
  ${feed.map(f => `
```

修改后：

```js
<div class="card">
  <div class="card-title">最近动态</div>
  ${safeFeed === null ? '<div class="empty-state" style="color:var(--red)">动态数据加载失败</div>' :
  (safeFeed.length === 0 ? '<div class="empty-state">还没有动态</div>' :
  safeFeed.map(f => `
```

对应闭合处（行 79）需要多加一个 `)` 闭合三元表达式。

**团队愿望卡片降级**（行 82-94 区域）：

修改前：

```js
<div class="card">
  <div class="card-title">团队愿望进度</div>
  ${teamWishes.length === 0 ? '<div class="empty-state">暂无团队愿望</div>' : ''}
  ${teamWishes.map(w => `
```

修改后：

```js
<div class="card">
  <div class="card-title">团队愿望进度</div>
  ${teamWishes === null ? '<div class="empty-state" style="color:var(--red)">愿望数据加载失败</div>' :
  (teamWishes.length === 0 ? '<div class="empty-state">暂无团队愿望</div>' :
  teamWishes.map(w => `
```

同样在闭合处多加 `)` 。

---

### 3. V25-025 + V25-026 + V25-029：表情互动乐观更新 + 防连点 + toggle（P0）

**文件**：`public/js/pages/family.js`

这三条高度耦合，合并实施。

**修改 render() 中表情按钮**（当前行 60-76）

修改前：

```js
<div class="feed-reactions" style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
  ${[
    { emoji: '👍', label: '灵气充沛' },
    { emoji: '💪', label: '体魄精进' },
    { emoji: '📖', label: '悟性大增' },
    { emoji: '✨', label: '道心坚定' },
  ].map(({ emoji, label }) => {
    const reacted = (f.myReactions || []).includes(emoji);
    const count = ((f.reactions || []).find(r => r.emoji === emoji) || {}).count || 0;
    const highlight = reacted ? 'border:1px solid var(--primary);' : 'border:1px solid var(--border);';
    return `<button
      onclick="FamilyPage.react(${f.id}, '${emoji}')"
      style="background:none;border-radius:20px;padding:2px 10px;cursor:pointer;font-size:13px;${highlight}"
      title="${e(label)}"
    >${emoji}${count > 0 ? ` ${count}` : ''}</button>`;
  }).join('')}
</div>
```

修改后：

```js
<div class="feed-reactions" style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
  ${[
    { emoji: '👍', label: '赞' },
    { emoji: '💪', label: '强' },
    { emoji: '📖', label: '悟' },
    { emoji: '✨', label: '定' },
  ].map(({ emoji, label }) => {
    const reacted = (f.myReactions || []).includes(emoji);
    const count = ((f.reactions || []).find(r => r.emoji === emoji) || {}).count || 0;
    const highlight = reacted
      ? 'border:1.5px solid var(--primary);background:rgba(var(--primary-rgb),0.08);'
      : 'border:1px solid var(--border);background:none;';
    return `<button
      id="react-btn-${f.id}-${emoji}"
      onclick="FamilyPage.react(${f.id}, '${emoji}')"
      style="border-radius:20px;padding:8px 14px;cursor:pointer;font-size:13px;min-height:44px;display:inline-flex;flex-direction:column;align-items:center;gap:2px;${highlight}"
      title="${e(label)}"
      ${reacted ? 'data-reacted="1"' : ''}
    ><span>${emoji}${count > 0 ? ` ${count}` : ''}</span><span style="font-size:10px;color:var(--text-dim)">${label}</span></button>`;
  }).join('')}
</div>
```

改动要点：
- V25-028：`padding:8px 14px; min-height:44px` 满足触控区域要求
- V25-075：按钮内增加 `<span>` 小字标签（赞/强/悟/定）
- V25-025/029：每个按钮加 `id="react-btn-${f.id}-${emoji}"` 和 `data-reacted` 属性，供乐观更新定位
- V25-029：`data-reacted="1"` 标记当前已反应的按钮，toggle 时用于判断

**修改 react() 方法**（当前行 99-106）

修改前：

```js
async react(behaviorId, emoji) {
  try {
    await API.post('/family/react', { behavior_id: behaviorId, emoji });
    await this.load();
  } catch (e) {
    App.toast(e.message, 'error');
  }
},
```

修改后：

```js
// V2.5 V25-025/026/029 - 乐观更新 + 防连点 + toggle
async react(behaviorId, emoji) {
  const btn = document.getElementById(`react-btn-${behaviorId}-${emoji}`);
  if (!btn || btn.dataset.reacting) return; // V25-026 防连点

  // V25-026 标记请求中
  btn.dataset.reacting = '1';
  btn.style.opacity = '0.6';
  btn.style.pointerEvents = 'none';

  // V25-029 判断当前是否已反应（toggle 方向）
  const wasReacted = btn.dataset.reacted === '1';

  // V25-025 乐观更新 UI
  const countSpan = btn.querySelector('span:first-child');
  const currentText = countSpan ? countSpan.textContent : '';
  const countMatch = currentText.match(/\d+/);
  let count = countMatch ? parseInt(countMatch[0], 10) : 0;

  if (wasReacted) {
    // 取消反应
    count = Math.max(0, count - 1);
    btn.style.border = '1px solid var(--border)';
    btn.style.background = 'none';
    delete btn.dataset.reacted;
  } else {
    // 添加反应
    count += 1;
    btn.style.border = '1.5px solid var(--primary)';
    btn.style.background = 'rgba(var(--primary-rgb),0.08)';
    btn.dataset.reacted = '1';
  }
  if (countSpan) {
    countSpan.textContent = `${emoji}${count > 0 ? ` ${count}` : ''}`;
  }

  try {
    await API.post('/family/react', { behavior_id: behaviorId, emoji });
  } catch (err) {
    // V25-025 失败回滚
    if (wasReacted) {
      count += 1;
      btn.style.border = '1.5px solid var(--primary)';
      btn.style.background = 'rgba(var(--primary-rgb),0.08)';
      btn.dataset.reacted = '1';
    } else {
      count = Math.max(0, count - 1);
      btn.style.border = '1px solid var(--border)';
      btn.style.background = 'none';
      delete btn.dataset.reacted;
    }
    if (countSpan) {
      countSpan.textContent = `${emoji}${count > 0 ? ` ${count}` : ''}`;
    }
    App.toast(err.message, 'error');
  } finally {
    delete btn.dataset.reacting;
    btn.style.opacity = '';
    btn.style.pointerEvents = '';
  }
},
```

---

### 4. V25-028：表情按钮触控区域增大（P0）

> 已在 V25-025 合并修改中完成。按钮样式改为 `padding:8px 14px; min-height:44px`。

---

### 5. V25-029：表情 toggle 前端实现（P0）

> 已在 V25-025 合并修改中完成。react() 通过 `btn.dataset.reacted` 判断 toggle 方向，乐观更新 UI，后端接口不变。

---

### 6. V25-071：Feed 时间改为相对时间（P1）

**文件**：`public/js/pages/family.js`

**新增工具方法**（在 `const FamilyPage = {` 之后、`load()` 之前插入）

```js
// V2.5 V25-071 - 相对时间格式化
formatRelativeTime(dateStr) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  if (isNaN(diff) || diff < 0) return dateStr;
  const SEC = 1000, MIN = 60 * SEC, HOUR = 60 * MIN, DAY = 24 * HOUR;
  if (diff < MIN) return '刚刚';
  if (diff < HOUR) return `${Math.floor(diff / MIN)}分钟前`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}小时前`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}天前`;
  return new Date(dateStr).toLocaleDateString('zh-CN');
},
```

**修改 render() 中 feed-time**（当前行 59）

修改前：

```js
<div class="feed-time">${new Date(f.completed_at).toLocaleString()}</div>
```

修改后：

```js
<div class="feed-time">${this.formatRelativeTime(f.completed_at)}</div>
```

注意：render() 中使用 `this.formatRelativeTime`，因为 render 是通过 `this.render(...)` 调用的，this 指向 FamilyPage。

---

### 7. V25-072：团队愿望成员状态中文映射（P1）

**文件**：`public/js/pages/family.js`

**修改 render() 中 teamProgress 部分**（当前行 90）

修改前：

```js
${(w.teamProgress || []).map(p => `${e(p.name)}:${e(p.status)}`).join(' · ')}
```

修改后：

```js
${(w.teamProgress || []).map(p => {
  const statusMap = { pending: '待开始', in_progress: '进行中', completed: '已完成', failed: '未完成' };
  const statusText = statusMap[p.status] || p.status;
  return `${e(p.name)}:${e(statusText)}`;
}).join(' · ')}
```

---

### 8. V25-073：成员列表移除可点击暗示（P1）

**文件**：`public/js/pages/family.js`

**修改 render() 中成员行**（当前行 28）

修改前：

```js
<div class="item-row">
```

修改后：

```js
<div class="item-row" style="cursor:default">
```

**文件**：`public/css/style.css`

确认 `.item-row` 是否有 `cursor:pointer` 或 `:hover` 效果。如果有，追加覆盖：

```css
/* V2.5 V25-073 - 家庭成员行不可点击 */
#page-family .item-row {
  cursor: default;
}
#page-family .item-row:hover {
  background: inherit;
}
```

---

### 9. V25-074：成员为空引导文案（P1）

> 已在 V25-027 降级处理中完成。空状态文案改为"还没有其他家庭成员，邀请家人一起修炼吧"。

---

### 10. V25-075：表情按钮含义标签（P1）

> 已在 V25-025 合并修改中完成。每个按钮内增加 `<span style="font-size:10px;color:var(--text-dim)">${label}</span>`，label 值为"赞/强/悟/定"。

---

### 11. V25-076：quality 异常值开发提示（P1）

**文件**：`public/js/pages/family.js`

**修改 render() 中 quality 回退逻辑**（当前行 53-56）

修改前：

```js
${(() => {
  const q = ['凡品', '良品', '上品', '极品'].includes(f.quality) ? f.quality : '凡品';
  return `<span class="quality-${q}">（${e(f.quality)}）</span>`;
})()}
```

修改后：

```js
${(() => {
  const validQualities = ['凡品', '良品', '上品', '极品'];
  const q = validQualities.includes(f.quality) ? f.quality : '凡品';
  if (!validQualities.includes(f.quality)) {
    console.warn(`[FamilyPage] 未知 quality 值: "${f.quality}"，已回退为"凡品"`, f);
  }
  return `<span class="quality-${q}">（${e(q)}）</span>`;
})()}
```

注意：修改后 span 内显示的是回退后的 `q` 而非原始 `f.quality`，避免展示异常值给用户。console.warn 仅在开发环境有意义。

---

### 12. V25-091：移动端下拉刷新（P2）

**文件**：`public/js/pages/family.js`

**在 FamilyPage 对象中新增方法**（在 react() 之后）

```js
// V2.5 V25-091 - 下拉刷新
_pullState: null,

initPullToRefresh() {
  const container = document.getElementById('page-family');
  if (!container) return;
  let startY = 0;
  let pulling = false;

  const indicator = document.createElement('div');
  indicator.id = 'family-pull-indicator';
  indicator.style.cssText = 'text-align:center;padding:12px 0;font-size:13px;color:var(--text-dim);display:none;transition:opacity 0.2s';
  indicator.textContent = '下拉刷新…';
  container.prepend(indicator);

  container.addEventListener('touchstart', (ev) => {
    if (container.scrollTop === 0) {
      startY = ev.touches[0].clientY;
      pulling = true;
    }
  }, { passive: true });

  container.addEventListener('touchmove', (ev) => {
    if (!pulling) return;
    const dy = ev.touches[0].clientY - startY;
    if (dy > 20) {
      indicator.style.display = 'block';
      indicator.textContent = dy > 60 ? '松手刷新' : '下拉刷新…';
      indicator.style.opacity = Math.min(1, dy / 60);
    }
  }, { passive: true });

  container.addEventListener('touchend', (ev) => {
    if (!pulling) return;
    pulling = false;
    const dy = (ev.changedTouches[0]?.clientY || 0) - startY;
    if (dy > 60) {
      indicator.textContent = '刷新中…';
      FamilyPage.load().then(() => {
        // load 会重写 innerHTML，indicator 自动消失
      });
    } else {
      indicator.style.display = 'none';
    }
  }, { passive: true });
},
```

**在 load() 末尾（render 调用之后）追加初始化**：

```js
// V2.5 V25-091 - 首次加载后初始化下拉刷新
if (!this._pullState) {
  this._pullState = true;
  requestAnimationFrame(() => this.initPullToRefresh());
}
```

注意：由于 load() 会重写 container.innerHTML，每次 load 后 indicator 会被销毁。initPullToRefresh 只在首次调用，后续 load 后需要重新 prepend indicator。更稳健的做法是把 initPullToRefresh 的事件绑定在 container 的父元素上，或在每次 render 后重新插入 indicator。建议实施时根据实际 DOM 结构调整。

---

### 13. V25-092：Feed 头像背景色区分（P2）

**文件**：`public/js/pages/family.js`

**新增工具方法**（与 formatRelativeTime 同级）

```js
// V2.5 V25-092 - 按用户名生成稳定头像背景色
avatarColor(name) {
  const colors = ['#e57373', '#81c784', '#64b5f6', '#ffb74d', '#ba68c8', '#4dd0e1'];
  const code = (name || '?').charCodeAt(0);
  return colors[code % colors.length];
},
```

**修改 render() 中成员头像**（当前行 29）

修改前：

```js
<div class="feed-avatar">${e((m.name || '?').slice(0, 1))}</div>
```

修改后：

```js
<div class="feed-avatar" style="background:${this.avatarColor(m.name)};color:#fff">${e((m.name || '?').slice(0, 1))}</div>
```

**修改 render() 中 feed 头像**（当前行 48）

修改前：

```js
<div class="feed-avatar">${e((f.user_name || '?').slice(0, 1))}</div>
```

修改后：

```js
<div class="feed-avatar" style="background:${this.avatarColor(f.user_name)};color:#fff">${e((f.user_name || '?').slice(0, 1))}</div>
```

---

### 14. V25-093：团队愿望进度折叠（P2）

**文件**：`public/js/pages/family.js`

**修改 render() 中团队愿望部分**（当前行 85-93）

修改前：

```js
${teamWishes.map(w => `
  <div style="padding:10px 0;border-bottom:1px solid var(--border)">
    <div class="item-name">${e(w.name)}</div>
    <div class="item-meta">状态：${w.status === 'pending' ? '待挑战' : w.status === 'in_progress' ? '进行中' : '已完成'}</div>
    <div class="item-meta" style="margin-top:4px">
      ${(w.teamProgress || []).map(p => `${e(p.name)}:${e(p.status)}`).join(' · ')}
    </div>
  </div>
`).join('')}
```

修改后：

```js
${(() => {
  const visible = teamWishes.slice(0, 3);
  const hidden = teamWishes.slice(3);
  const statusMap = { pending: '待开始', in_progress: '进行中', completed: '已完成', failed: '未完成' };
  const renderWish = (w) => `
    <div style="padding:10px 0;border-bottom:1px solid var(--border)">
      <div class="item-name">${e(w.name)}</div>
      <div class="item-meta">状态：${w.status === 'pending' ? '待挑战' : w.status === 'in_progress' ? '进行中' : '已完成'}</div>
      <div class="item-meta" style="margin-top:4px">
        ${(w.teamProgress || []).map(p => {
          const st = statusMap[p.status] || p.status;
          return `${e(p.name)}:${e(st)}`;
        }).join(' · ')}
      </div>
    </div>
  `;
  let html = visible.map(renderWish).join('');
  if (hidden.length > 0) {
    html += `<div id="family-wishes-hidden" style="display:none">${hidden.map(renderWish).join('')}</div>`;
    html += `<button id="family-wishes-toggle" onclick="document.getElementById('family-wishes-hidden').style.display='block';this.remove()" style="display:block;width:100%;padding:10px 0;background:none;border:none;color:var(--primary);cursor:pointer;font-size:13px">查看全部（共 ${teamWishes.length} 条）</button>`;
  }
  return html;
})()}
```

注意：此处同时包含了 V25-072 的 statusMap 中文映射。如果 V25-072 已单独实施，此处的 statusMap 可复用。

---

## 执行顺序建议

1. **第一批（P0 核心改造）**：V25-024 + V25-027 合并改造 load()，同时改造 render() 的降级处理
2. **第二批（P0 表情系统）**：V25-025 + V25-026 + V25-028 + V25-029 合并改造 react() 和表情按钮模板
3. **第三批（P1 文案与样式）**：V25-071, V25-072, V25-073, V25-074, V25-075, V25-076 逐条实施
4. **第四批（P2 增强）**：V25-091, V25-092, V25-093 逐条实施

依赖关系：
- V25-027 依赖 V25-024（合并在 load 改造中）
- V25-026/028/029 依赖 V25-025（合并在表情系统改造中）
- V25-074 依赖 V25-027（空状态在降级处理中一并完成）
- V25-075 依赖 V25-025（标签在按钮模板中一并完成）
- V25-093 包含 V25-072 的 statusMap（如先做 V25-072 可复用）

---

## 验收检查清单

### P0

- [ ] 进入家庭页时显示 loading spinner，数据加载完成后替换为内容
- [ ] 断开网络或模拟单个 API 500，其余两个卡片正常渲染，失败卡片显示红色错误占位
- [ ] 点击表情按钮后，按钮立即高亮/取消高亮，计数立即 +1/-1，无整页闪烁
- [ ] 快速连点表情按钮，只发出一次请求（检查 Network 面板）
- [ ] 表情请求失败时，按钮状态回滚，显示 toast 错误提示
- [ ] 已点击的表情再次点击可取消（toggle），UI 和后端状态一致
- [ ] 表情按钮在移动端可轻松点击，触控区域不小于 44x44px

### P1

- [ ] Feed 时间显示为"刚刚/X分钟前/X小时前/X天前"，超过 7 天显示具体日期
- [ ] 团队愿望成员状态显示中文（待开始/进行中/已完成/未完成），无英文原始值
- [ ] 成员列表行无 cursor:pointer，hover 无背景变化
- [ ] 成员为空时显示"还没有其他家庭成员，邀请家人一起修炼吧"
- [ ] 每个表情按钮下方有小字标签（赞/强/悟/定）
- [ ] 控制台输入异常 quality 值时，console 输出 warn 日志，页面显示回退后的"凡品"

### P2

- [ ] 移动端在页面顶部下拉超过 60px 松手后触发刷新
- [ ] 不同用户的头像有不同背景色，同一用户每次颜色一致
- [ ] 团队愿望超过 3 条时，默认只显示 3 条 + "查看全部"按钮，点击后展开
