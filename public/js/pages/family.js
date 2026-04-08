const FamilyPage = {
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

  render(members, feed, wishes) {
    const container = document.getElementById('page-family');
    const teamWishes = (wishes || []).filter(w => w.type === '团队' && w.status !== 'redeemed');
    const e = API.escapeHtml.bind(API);

    container.innerHTML = `
      <div class="page-header">家庭</div>

      <div class="card">
        <div class="card-title">家庭成员</div>
        ${members.map(m => {
          const total = (m.physique + m.comprehension + m.willpower + m.dexterity + m.perception).toFixed(1);
          return `
            <div class="item-row">
              <div class="feed-avatar">${e((m.name || '?').slice(0, 1))}</div>
              <div class="item-info" style="margin-left:10px">
                <div class="item-name">${e(m.name)}</div>
                <div class="item-meta">
                  <span class="realm-badge" style="font-size:11px;padding:2px 8px">${e(m.realm_stage)}</span>
                  属性总和 ${total}
                </div>
              </div>
            </div>
          `;
        }).join('')}
        ${members.length === 0 ? '<div class="empty-state">暂无其他家庭成员</div>' : ''}
      </div>

      <div class="card">
        <div class="card-title">最近动态</div>
        ${feed.length === 0 ? '<div class="empty-state">还没有动态</div>' : ''}
        ${feed.map(f => `
          <div class="feed-item">
            <div class="feed-avatar">${e((f.user_name || '?').slice(0, 1))}</div>
            <div class="feed-content">
              <div class="feed-name">${e(f.user_name)}</div>
              <div class="feed-text">
                完成了 ${e(f.sub_type)}
                ${(() => {
                  const q = ['凡品', '良品', '上品', '极品'].includes(f.quality) ? f.quality : '凡品';
                  return `<span class="quality-${q}">（${e(f.quality)}）</span>`;
                })()}
                ${f.item_name ? `→ 获得 ${e(f.item_name)}` : ''}
              </div>
              <div class="feed-time">${new Date(f.completed_at).toLocaleString()}</div>
            </div>
          </div>
        `).join('')}
      </div>

      <div class="card">
        <div class="card-title">团队愿望进度</div>
        ${teamWishes.length === 0 ? '<div class="empty-state">暂无团队愿望</div>' : ''}
        ${teamWishes.map(w => `
          <div style="padding:10px 0;border-bottom:1px solid var(--border)">
            <div class="item-name">${e(w.name)}</div>
            <div class="item-meta">状态：${w.status === 'pending' ? '待挑战' : w.status === 'in_progress' ? '进行中' : '已完成'}</div>
            <div class="item-meta" style="margin-top:4px">
              ${(w.teamProgress || []).map(p => `${e(p.name)}:${e(p.status)}`).join(' · ')}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  },
};
