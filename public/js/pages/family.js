const FamilyPage = {
  _pullState: null,

  // V2.5 V25-071 - 相对时间格式化
  formatRelativeTime(dateStr) {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diff = now - then;
    if (isNaN(diff) || diff < 0) return dateStr;
    const SEC = 1000; const MIN = 60 * SEC; const HOUR = 60 * MIN; const DAY = 24 * HOUR;
    if (diff < MIN) return '刚刚';
    if (diff < HOUR) return `${Math.floor(diff / MIN)}分钟前`;
    if (diff < DAY) return `${Math.floor(diff / HOUR)}小时前`;
    if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}天前`;
    return new Date(dateStr).toLocaleDateString('zh-CN');
  },

  // V2.5 V25-092 - 按用户名生成稳定头像背景色
  avatarColor(name) {
    const colors = ['#e57373', '#81c784', '#64b5f6', '#ffb74d', '#ba68c8', '#4dd0e1'];
    const code = (name || '?').charCodeAt(0);
    return colors[code % colors.length];
  },

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

    // V2.5 V25-091 - 首次加载后初始化下拉刷新
    if (!this._pullState) {
      this._pullState = true;
      requestAnimationFrame(() => this.initPullToRefresh());
    }
  },

  render(members, feed, wishes) {
    const container = document.getElementById('page-family');
    const safeMembers = Array.isArray(members) ? members : null;
    const safeFeed = Array.isArray(feed) ? feed : null;
    const teamWishes = Array.isArray(wishes)
      ? wishes.filter(w => w.type === '团队' && w.status !== 'redeemed')
      : null;
    const e = API.escapeHtml.bind(API);

    container.innerHTML = `
      <div class="page-header">家庭</div>

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

      <div class="card">
        <div class="card-title">最近动态</div>
        ${safeFeed === null ? '<div class="empty-state" style="color:var(--red)">动态数据加载失败</div>' :
          (safeFeed.length === 0 ? '<div class="empty-state">还没有动态</div>' :
            safeFeed.map(f => `
              <div class="feed-item">
                <div class="feed-avatar" style="background:${this.avatarColor(f.user_name)};color:#fff">${e((f.user_name || '?').slice(0, 1))}</div>
                <div class="feed-content">
                  <div class="feed-name">${e(f.user_name)}</div>
                  <div class="feed-text">
                    完成了 ${e(f.sub_type)}
                    ${(() => {
                      const validQualities = ['凡品', '良品', '上品', '极品'];
                      const q = validQualities.includes(f.quality) ? f.quality : '凡品';
                      if (!validQualities.includes(f.quality)) {
                        console.warn(`[FamilyPage] 未知 quality 值: "${f.quality}"，已回退为"凡品"`, f);
                      }
                      return `<span class="quality-${q}">（${e(q)}）</span>`;
                    })()}
                    ${f.item_name ? `→ 获得 ${e(f.item_name)}` : ''}
                  </div>
                  <div class="feed-time">${this.formatRelativeTime(f.completed_at)}</div>
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
                </div>
              </div>
            `).join(''))}
      </div>

      <div class="card">
        <div class="card-title">团队愿望进度</div>
        ${teamWishes === null ? '<div class="empty-state" style="color:var(--red)">愿望数据加载失败</div>' :
          (teamWishes.length === 0 ? '<div class="empty-state">暂无团队愿望</div>' :
            (() => {
              const visible = teamWishes.slice(0, 3);
              const hidden = teamWishes.slice(3);
              const statusMap = { pending: '待开始', in_progress: '进行中', completed: '已完成', failed: '未完成' };
              const renderWish = w => `
                <div style="padding:10px 0;border-bottom:1px solid var(--border)">
                  <div class="item-name">${e(w.name)}</div>
                  <div class="item-meta">状态：${w.status === 'pending' ? '待挑战' : w.status === 'in_progress' ? '进行中' : '已完成'}</div>
                  <div class="item-meta" style="margin-top:4px">
                    ${(w.teamProgress || []).map((p) => {
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
            })())}
      </div>
    `;
  },

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

  // V2.5 V25-091 - 下拉刷新
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
};
