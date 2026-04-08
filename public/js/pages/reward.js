const RewardPage = {
  rewards: [],
  battles: [],
  battleDetail: null,

  async load() {
    try {
      const [rewards, battles] = await Promise.all([
        API.get('/rewards'),
        API.get('/battle/history'),
      ]);
      this.rewards = rewards;
      this.battles = battles;
      this.battleDetail = null;
      this.render();
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  render() {
    const container = document.getElementById('page-reward');
    const pending = this.rewards.filter(r => r.status === 'completed');
    const redeemed = this.rewards.filter(r => r.status === 'redeemed');
    const e = API.escapeHtml.bind(API);

    container.innerHTML = `
      <div class="page-header">奖励记录</div>

      <div class="card">
        <div class="card-title">待兑现奖励</div>
        ${pending.length === 0 ? '<div class="empty-state">暂无待兑现奖励</div>' : ''}
        ${pending.map(r => `
          <div class="item-row">
            <div class="item-info">
              <div class="item-name">${e(r.name)}</div>
              <div class="item-meta">${e(r.type)} · 难度${r.difficulty}/10 · 发起人${e(r.creator_name)}</div>
              <div class="item-meta">🎁 ${e(r.reward_description)}</div>
            </div>
            <button class="btn btn-success btn-small" onclick="RewardPage.redeem(${r.id})">兑现</button>
          </div>
        `).join('')}
      </div>

      <div class="card">
        <div class="card-title">已兑现</div>
        ${redeemed.length === 0 ? '<div class="empty-state">暂无已兑现记录</div>' : ''}
        ${redeemed.map(r => `
          <div class="item-row">
            <div class="item-info">
              <div class="item-name">${e(r.name)}</div>
              <div class="item-meta">🎁 ${e(r.reward_description)}</div>
            </div>
            <span style="font-size:12px;color:var(--green)">已兑现</span>
          </div>
        `).join('')}
      </div>

      <div class="card">
        <div class="card-title">最近战斗</div>
        ${this.battles.length === 0 ? '<div class="empty-state">暂无战斗记录</div>' : ''}
        ${this.battles.slice(0, 12).map(b => `
          <div class="item-row" style="cursor:pointer" onclick="RewardPage.openBattle(${b.id})">
            <div class="item-info">
              <div class="item-name">${e(b.boss_name)}</div>
              <div class="item-meta">${e(b.wish_name)} · ${new Date(b.created_at).toLocaleString()}</div>
            </div>
            <span class="${b.result === 'win' ? 'quality-极品' : ''}" style="font-size:12px">
              ${b.result === 'win' ? '胜利' : '失败'}
            </span>
          </div>
        `).join('')}
      </div>

      ${this.battleDetail ? this.renderBattleDetail() : ''}
    `;
  },

  renderBattleDetail() {
    const b = this.battleDetail;
    const e = API.escapeHtml.bind(API);
    return `
      <div class="card">
        <div class="card-title">战斗详情：${e(b.boss_name)}</div>
        <div style="font-size:13px;line-height:1.8">
          愿望：${e(b.wish_name)}<br>
          结果：${b.result === 'win' ? '胜利' : '失败'}<br>
          基础战力：${b.user_base_power}<br>
          道具战力：+${b.user_item_power}<br>
          Boss战力：${b.boss_power}<br>
          暴击：${b.is_critical ? '是' : '否'} · 连击：${b.is_combo ? '是' : '否'}<br>
          减伤：${b.damage_reduction}%
        </div>
        ${Array.isArray(b.rounds) && b.rounds.length > 0 ? `
          <div style="font-size:12px;color:var(--text-dim);margin-top:10px">
            ${b.rounds.map(r => `第${r.round}回合：${e(r.description)}`).join(' ｜ ')}
          </div>
        ` : ''}
      </div>
    `;
  },

  async openBattle(id) {
    try {
      this.battleDetail = await API.get(`/battle/${id}`);
      this.render();
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  async redeem(id) {
    try {
      await API.post(`/rewards/${id}/redeem`);
      App.toast('奖励已标记为兑现', 'success');
      this.load();
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },
};
