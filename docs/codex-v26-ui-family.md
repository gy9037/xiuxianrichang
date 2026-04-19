# Codex 指令：V2.6 家庭页 UI 优化

> **版本**：V2.6 UI 优化
> **来源**：`docs/ux-review-v26-ui-audit.md` + `docs/ui-design-guide.md`
> **涉及文件**：
> - `server/routes/family.js`
> - `public/js/pages/family.js`
> - `public/css/style.css`

---

## P6-BE：后端 — 成员查询增加 `u.status` 字段

**文件**：`server/routes/family.js`
**行号**：10-14

**改前**：

```js
  const members = db.prepare(
    `SELECT u.id, u.name, c.realm_stage,
     c.physique, c.comprehension, c.willpower, c.dexterity, c.perception
     FROM users u JOIN characters c ON u.id = c.user_id
     WHERE u.family_id = ?`
  ).all(req.user.family_id);
```

**改后**：

```js
  const members = db.prepare(
    `SELECT u.id, u.name, u.status, c.realm_stage,
     c.physique, c.comprehension, c.willpower, c.dexterity, c.perception
     FROM users u JOIN characters c ON u.id = c.user_id
     WHERE u.family_id = ?`
  ).all(req.user.family_id);
```

**说明**：SQL 的 SELECT 列表中，在 `u.name` 后加 `u.status`。其余不变。

---

## P5+P6-CSS：新增成员网格样式

**文件**：`public/css/style.css`
**位置**：在文件末尾（第 573 行之后）追加

**新增代码**：

```css
/* V2.6 P5+P6 - 成员网格 */
.member-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.member-cell { display: flex; flex-direction: column; align-items: center; padding: 12px 8px; background: var(--bg-card-light); border-radius: 8px; cursor: pointer; }
.member-cell:active { opacity: 0.8; }
.member-avatar-wrap { position: relative; width: 40px; height: 40px; }
.member-avatar-wrap img, .member-avatar-wrap .feed-avatar { width: 40px; height: 40px; }
.member-status-dot { position: absolute; bottom: 0; right: 0; width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--bg-card); }
.member-name { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; text-align: center; margin-top: 4px; color: var(--text); }
.member-realm { font-size: 10px; padding: 2px 6px; margin-top: 2px; display: inline-block; background: linear-gradient(135deg, var(--primary), var(--gold)); border-radius: 20px; font-weight: 600; color: white; }
```

---

## P5+P6-FE：成员列表重写为网格布局

**文件**：`public/js/pages/family.js`
**行号**：65-84（整个"家庭成员"card 块）

**改前**（第 65-84 行）：

```js
      <div class="card">
        <div class="card-title">家庭成员</div>
        ${safeMembers === null ? '<div class="empty-state" style="color:var(--red)">成员数据加载失败</div>' :
          safeMembers.map((m) => {
            const total = (m.physique + m.comprehension + m.willpower + m.dexterity + m.perception).toFixed(1);
            return `
              <div class="item-row" style="cursor:default">
                <div class="feed-avatar" style="background:${this.avatarColor(m.name)};color:#fff">${e((m.name || '?').slice(0, 1))}</div>
                <div class="item-info" style="margin-left:10px">
                  <div class="item-name">${e(m.name)}</div>
                  <div class="item-meta">
                    <span class="realm-badge" style="font-size:11px;padding:2px 8px">${e(m.realm_stage)}</span>
                    属性总和 ${total}
                  </div>
                </div>
              </div>
            `;
          }).join('') +
          (safeMembers.length === 0 ? '<div class="empty-state">还没有其他家庭成员，邀请家人一起修炼吧</div>' : '')}
      </div>
```

**改后**：

```js
      <div class="card">
        <div class="card-title">家庭成员</div>
        ${safeMembers === null ? '<div class="empty-state" style="color:var(--red)">成员数据加载失败</div>' :
          safeMembers.length === 0 ? '<div class="empty-state">还没有其他家庭成员，邀请家人一起修炼吧</div>' :
          (() => {
            const visibleMembers = safeMembers.slice(0, 6);
            const hiddenCount = safeMembers.length - 6;
            const statusColorMap = { '居家': '#10b981', '生病': '#ef4444', '出差': '#3b82f6' };
            const renderMemberCell = (m) => `
              <div class="member-cell">
                <div class="member-avatar-wrap">
                  <div class="feed-avatar" style="background:${this.avatarColor(m.name)};color:#fff">${e((m.name || '?').slice(0, 1))}</div>
                  <span class="member-status-dot" style="background:${statusColorMap[m.status] || '#10b981'}"></span>
                </div>
                <div class="member-name">${e(m.name)}</div>
                <span class="member-realm">${e(m.realm_stage)}</span>
              </div>
            `;
            let html = `<div class="member-grid" id="family-member-grid">${visibleMembers.map(renderMemberCell).join('')}</div>`;
            if (hiddenCount > 0) {
              html += `<button id="family-members-expand" onclick="document.getElementById('family-member-grid').innerHTML = ${JSON.stringify(safeMembers.map(renderMemberCell).join('').replace(/'/g, "\\'")).slice(0, -1)}';this.remove()" style="display:block;width:100%;padding:10px 0;background:none;border:none;color:var(--primary);cursor:pointer;font-size:13px">+${hiddenCount} 查看全部</button>`;
            }
            return html;
          })()}
      </div>
```

**注意**：上面的 `onclick` 内联展开逻辑较复杂，为避免引号转义问题，改用下方更稳健的方案——将展开逻辑放到 `FamilyPage` 对象方法中：

**实际改后**（推荐方案）：

```js
      <div class="card">
        <div class="card-title">家庭成员</div>
        ${safeMembers === null ? '<div class="empty-state" style="color:var(--red)">成员数据加载失败</div>' :
          safeMembers.length === 0 ? '<div class="empty-state">还没有其他家庭成员，邀请家人一起修炼吧</div>' :
          (() => {
            const statusColorMap = { '居家': '#10b981', '生病': '#ef4444', '出差': '#3b82f6' };
            const renderCell = (m) => `
              <div class="member-cell">
                <div class="member-avatar-wrap">
                  <div class="feed-avatar" style="background:${this.avatarColor(m.name)};color:#fff">${e((m.name || '?').slice(0, 1))}</div>
                  <span class="member-status-dot" style="background:${statusColorMap[m.status] || '#10b981'}"></span>
                </div>
                <div class="member-name">${e(m.name)}</div>
                <span class="member-realm">${e(m.realm_stage)}</span>
              </div>`;
            const visibleMembers = safeMembers.slice(0, 6);
            const hiddenCount = safeMembers.length - 6;
            let html = `<div class="member-grid" id="family-member-grid">${visibleMembers.map(renderCell).join('')}</div>`;
            if (hiddenCount > 0) {
              html += `<button id="family-members-expand" onclick="FamilyPage.expandMembers()" style="display:block;width:100%;padding:10px 0;background:none;border:none;color:var(--primary);cursor:pointer;font-size:13px">+${hiddenCount} 查看全部</button>`;
            }
            return html;
          })()}
      </div>
```

---

## P5+P6-FE-2：新增 `expandMembers` 方法 + 缓存成员数据

**文件**：`public/js/pages/family.js`

### 步骤 A：添加缓存属性

**行号**：第 2 行之后插入

**改前**（第 1-2 行）：

```js
const FamilyPage = {
  _pullState: null,
```

**改后**：

```js
const FamilyPage = {
  _pullState: null,
  _membersCache: null,
  _feedDisplayCount: 10,
```

### 步骤 B：`load()` 中缓存成员数据并重置 feed 计数

**行号**：第 41-44 行

**改前**：

```js
    const members = membersResult.status === 'fulfilled' ? membersResult.value : null;
    const feed = feedResult.status === 'fulfilled' ? feedResult.value : null;
    const wishes = wishesResult.status === 'fulfilled' ? wishesResult.value : null;
    this.render(members, feed, wishes);
```

**改后**：

```js
    const members = membersResult.status === 'fulfilled' ? membersResult.value : null;
    const feed = feedResult.status === 'fulfilled' ? feedResult.value : null;
    const wishes = wishesResult.status === 'fulfilled' ? wishesResult.value : null;
    this._membersCache = members;
    this._feedCache = feed;
    this._feedDisplayCount = 10;
    this.render(members, feed, wishes);
```

### 步骤 C：在 `initPullToRefresh` 方法之前（第 227 行前）插入 `expandMembers` 和 `loadMoreFeed` 方法

**插入位置**：第 225 行（`react` 方法的闭合 `},`）之后、第 227 行（`// V2.5 V25-091`）之前

**新增代码**：

```js
  // V2.6 P5+P6 - 展开全部成员
  expandMembers() {
    const grid = document.getElementById('family-member-grid');
    const btn = document.getElementById('family-members-expand');
    if (!grid || !this._membersCache) return;
    const e = API.escapeHtml.bind(API);
    const statusColorMap = { '居家': '#10b981', '生病': '#ef4444', '出差': '#3b82f6' };
    grid.innerHTML = this._membersCache.map(m => `
      <div class="member-cell">
        <div class="member-avatar-wrap">
          <div class="feed-avatar" style="background:${this.avatarColor(m.name)};color:#fff">${e((m.name || '?').slice(0, 1))}</div>
          <span class="member-status-dot" style="background:${statusColorMap[m.status] || '#10b981'}"></span>
        </div>
        <div class="member-name">${e(m.name)}</div>
        <span class="member-realm">${e(m.realm_stage)}</span>
      </div>`).join('');
    if (btn) btn.remove();
  },

  // V2.6 P7 - 加载更多 Feed
  loadMoreFeed() {
    this._feedDisplayCount += 10;
    if (this._feedCache) {
      this.render(this._membersCache, this._feedCache, this._wishesCache);
    }
  },

```

---

## P7-FE：Feed 表情按钮紧凑化 + Feed 分页

**文件**：`public/js/pages/family.js`

### 步骤 A：表情按钮紧凑化

**行号**：108-128（feed-reactions 区块）

**改前**：

```js
                  ${`<div class="feed-reactions" style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
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
                  </div>`} <!-- V2-F06 FB-06 — 表情按钮组 -->
```

**改后**：

```js
                  ${`<div class="feed-reactions" style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;padding:4px 0">
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
      style="border-radius:20px;padding:4px 10px;cursor:pointer;font-size:13px;height:36px;display:inline-flex;align-items:center;gap:2px;${highlight}"
      title="${e(label)}"
      ${reacted ? 'data-reacted="1"' : ''}
    ><span>${emoji}${count > 0 ? ` ${count}` : ''}</span></button>`;
  }).join('')}
                  </div>`} <!-- V2-F06 FB-06 — 表情按钮组（V2.6 紧凑化） -->
```

**变更摘要**：
- `.feed-reactions` 容器：`gap:8px` → `gap:6px`，新增 `padding:4px 0`（补足触控区到 44px）
- 按钮：`padding:8px 14px` → `padding:4px 10px`，`min-height:44px` → `height:36px`
- 按钮：删除 `flex-direction:column;`，只保留 `align-items:center;`
- 删除第二个 `<span>`（文字标签"赞""强""悟""定"），只保留 emoji + 计数
- `title` 属性保留无障碍提示

### 步骤 B：Feed 分页（只渲染前 N 条 + "加载更多"）

**行号**：88-131（"最近动态"card 内的 feed 渲染部分）

**改前**：

```js
      <div class="card">
        <div class="card-title">最近动态</div>
        ${safeFeed === null ? '<div class="empty-state" style="color:var(--red)">动态数据加载失败</div>' :
          (safeFeed.length === 0 ? '<div class="empty-state">还没有动态</div>' :
            safeFeed.map(f => `
              <div class="feed-item">
```

**改后**（第 86-89 行区域）：

```js
      <div class="card">
        <div class="card-title">最近动态</div>
        ${safeFeed === null ? '<div class="empty-state" style="color:var(--red)">动态数据加载失败</div>' :
          (safeFeed.length === 0 ? '<div class="empty-state">还没有动态</div>' :
            safeFeed.slice(0, this._feedDisplayCount).map(f => `
              <div class="feed-item">
```

同时，在 feed `.map().join('')` 结束后、`</div>` 闭合 card 之前（原第 131 行 `).join(''))}` 之后），追加"加载更多"按钮：

**改前**（第 131-132 行）：

```js
            `).join(''))}
      </div>
```

**改后**：

```js
            `).join('') +
            (safeFeed.length > this._feedDisplayCount ? `<button onclick="FamilyPage.loadMoreFeed()" style="display:block;width:100%;padding:10px 0;background:none;border:none;color:var(--primary);cursor:pointer;font-size:13px;margin-top:8px">加载更多</button>` : ''))}
      </div>
```

---

## P7-FE-2：`load()` 中缓存 wishes 数据

**文件**：`public/js/pages/family.js`

在步骤 B（P5+P6-FE-2 步骤 B）的改后代码中，再追加一行缓存 wishes：

**改后**（完整版，替换第 41-47 行区域）：

```js
    const members = membersResult.status === 'fulfilled' ? membersResult.value : null;
    const feed = feedResult.status === 'fulfilled' ? feedResult.value : null;
    const wishes = wishesResult.status === 'fulfilled' ? wishesResult.value : null;
    this._membersCache = members;
    this._feedCache = feed;
    this._wishesCache = wishes;
    this._feedDisplayCount = 10;
    this.render(members, feed, wishes);
```

---

## P8-FE：团队愿望进度折叠 — 成员标签化

**文件**：`public/js/pages/family.js`
**行号**：146-151（teamProgress 渲染部分，在 `renderWish` 函数内）

**改前**：

```js
                  <div class="item-meta" style="margin-top:4px">
                    ${(w.teamProgress || []).map((p) => {
                      const st = statusMap[p.status] || p.status;
                      return `${e(p.name)}:${e(st)}`;
                    }).join(' · ')}
                  </div>
```

**改后**：

```js
                  <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">
                    ${(() => {
                      const progress = w.teamProgress || [];
                      const visibleP = progress.slice(0, 5);
                      const hiddenP = progress.slice(5);
                      const statusColor = (s) => s === 'completed' ? 'var(--green)' : s === 'in_progress' ? 'var(--primary)' : 'var(--text-dim)';
                      let tags = visibleP.map(p => `<span class="tag" style="color:${statusColor(p.status)}">${e(p.name)}:${e(statusMap[p.status] || p.status)}</span>`).join('');
                      if (hiddenP.length > 0) {
                        const hiddenId = 'tp-hidden-' + w.id;
                        const allTags = progress.map(p => `<span class="tag" style="color:${statusColor(p.status)}">${e(p.name)}:${e(statusMap[p.status] || p.status)}</span>`).join('');
                        tags += `<span id="${hiddenId}-dots" class="tag" style="cursor:pointer;color:var(--primary)" onclick="document.getElementById('${hiddenId}').style.display='flex';this.remove()">+${hiddenP.length}人</span>`;
                        tags += `<div id="${hiddenId}" style="display:none;flex-wrap:wrap;gap:4px;width:100%">${allTags}<span class="tag" style="cursor:pointer;color:var(--primary)" onclick="this.parentElement.style.display='none';document.getElementById('${hiddenId}-dots').style.display=''">收起</span></div>`;
                      }
                      return tags;
                    })()}
                  </div>
```

**变更摘要**：
- 外层容器从 `<div class="item-meta">` 改为 `flex-wrap` 容器
- 每个成员用 `.tag` span（复用已有 `.tag` 样式：11px, padding:2px 8px, border-radius:4px, background:var(--bg-card-light)）
- 状态着色：`completed` → `var(--green)`，`in_progress` → `var(--primary)`，其余 → `var(--text-dim)`
- 默认只显示前 5 人，超出部分显示 "+N人" 可点击展开
- 展开后显示全部 + "收起"链接

---

## P8-FE-2：修复展开/收起的 dots 恢复问题

上面 P8 的 `收起` onclick 中使用了 `document.getElementById('${hiddenId}-dots').style.display=''`，这依赖 dots span 未被 `remove()` 而是被隐藏。需要将 dots 的 onclick 从 `this.remove()` 改为隐藏：

**修正**：P8 改后代码中的 dots span 应为：

```js
tags += `<span id="${hiddenId}-dots" class="tag" style="cursor:pointer;color:var(--primary)" onclick="document.getElementById('${hiddenId}').style.display='flex';this.style.display='none'">+${hiddenP.length}人</span>`;
```

（将 `this.remove()` 改为 `this.style.display='none'`，这样收起时可以恢复显示）

---

## 改动清单汇总

| 编号 | 文件 | 行号 | 改动类型 | 说明 |
|------|------|------|----------|------|
| P6-BE | `server/routes/family.js` | 10-14 | 修改 | SQL 加 `u.status` |
| P5+P6-CSS | `public/css/style.css` | 573+ | 追加 | 成员网格样式 |
| P5+P6-FE | `public/js/pages/family.js` | 65-84 | 重写 | 成员列表 → 网格布局 |
| P5+P6-FE-2 | `public/js/pages/family.js` | 1-2, 41-44, 225后 | 插入 | 缓存属性 + expandMembers + loadMoreFeed |
| P7-FE-A | `public/js/pages/family.js` | 108-128 | 修改 | 表情按钮紧凑化 |
| P7-FE-B | `public/js/pages/family.js` | 88-132 | 修改 | Feed 分页（前10条 + 加载更多） |
| P7-FE-2 | `public/js/pages/family.js` | 41-44 | 修改 | 缓存 wishes |
| P8-FE | `public/js/pages/family.js` | 146-151 | 重写 | 团队进度标签化 + 折叠 |

---

## 执行顺序建议

1. `server/routes/family.js` — P6-BE（1 处改动）
2. `public/css/style.css` — P5+P6-CSS（末尾追加）
3. `public/js/pages/family.js` — 按以下顺序：
   - P5+P6-FE-2 步骤 A（第 2 行后插入属性）
   - P7-FE-2 + P5+P6-FE-2 步骤 B（第 41-44 行，缓存 + 重置）
   - P5+P6-FE（第 65-84 行，成员网格重写）
   - P7-FE-B（第 88-89 行，feed slice）+ P7-FE-A（第 108-128 行，按钮紧凑化）+ 第 131 行加载更多按钮
   - P8-FE（第 146-151 行，团队进度折叠）
   - P5+P6-FE-2 步骤 C（第 225 行后插入 expandMembers + loadMoreFeed 方法）
