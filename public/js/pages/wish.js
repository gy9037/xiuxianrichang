const WISH_ATTR_NAMES = {
  physique: '体魄',
  comprehension: '悟性',
  willpower: '心性',
  dexterity: '灵巧',
  perception: '神识',
};

const WishPage = {
  wishes: [],
  showCreate: false,
  showBattle: false,
  selectedWish: null,
  preparedBoss: null,
  battleItems: [],
  battleSelectedIds: new Set(),
  typeFilter: '全部',
  statusFilter: '全部',

  async load() {
    try {
      this.wishes = await API.get('/wishes');
      if (!this.showBattle) this.render();
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  render() {
    const container = document.getElementById('page-wish');
    const e = API.escapeHtml.bind(API);
    const safeWishTypeClass = (type) => (type === '团队' ? '团队' : '单人');

    if (this.showCreate) {
      this.renderCreate(container);
      return;
    }

    if (this.showBattle) {
      this.renderBattle(container);
      return;
    }

    const filtered = this.wishes.filter(w => {
      const typeOk = this.typeFilter === '全部' || w.type === this.typeFilter;
      const statusMap = {
        '待挑战': 'pending',
        '进行中': 'in_progress',
        '已完成': 'completed',
        '已兑现': 'redeemed',
      };
      const statusOk = this.statusFilter === '全部' || w.status === statusMap[this.statusFilter];
      return typeOk && statusOk;
    });
    const pending = filtered.filter(w => w.status === 'pending' || w.status === 'in_progress');
    const completed = filtered.filter(w => w.status === 'completed' || w.status === 'redeemed');

    container.innerHTML = `
      <div class="page-header">
        愿望池
        <button class="btn btn-primary btn-small" style="float:right;width:auto;margin-top:2px" onclick="WishPage.openCreate()">许愿</button>
      </div>

      <div class="card">
        <div class="card-title">筛选</div>
        <div style="font-size:12px;color:var(--text-dim);margin-bottom:6px">愿望类型</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
          ${['全部', '单人', '团队'].map(t => `
            <button class="btn btn-small ${this.typeFilter === t ? 'btn-primary' : 'btn-secondary'}"
              onclick="WishPage.setTypeFilter('${t}')">${t}</button>
          `).join('')}
        </div>
        <div style="font-size:12px;color:var(--text-dim);margin-bottom:6px">愿望状态</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${['全部', '待挑战', '进行中', '已完成', '已兑现'].map(s => `
            <button class="btn btn-small ${this.statusFilter === s ? 'btn-primary' : 'btn-secondary'}"
              onclick="WishPage.setStatusFilter('${s}')">${s}</button>
          `).join('')}
        </div>
      </div>

      ${pending.length === 0 && completed.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon">🌟</div>
          <div>还没有愿望</div>
          <div style="font-size:13px;margin-top:8px">许下你的第一个愿望吧</div>
        </div>
      ` : ''}

      ${pending.map(w => `
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <span class="wish-type wish-type-${safeWishTypeClass(w.type)}">${e(w.type)}</span>
            <span class="wish-difficulty">${'⭐'.repeat(Math.min(w.difficulty, 5))}${w.difficulty > 5 ? '+' + (w.difficulty - 5) : ''} ${w.difficulty}/10</span>
          </div>
          <div class="card-title">${e(w.name)}</div>
          ${w.description ? `<div style="font-size:13px;color:var(--text-dim);margin-bottom:8px">${e(w.description)}</div>` : ''}
          <div style="font-size:13px;margin-bottom:6px">🎁 ${e(w.reward_description)}</div>
          ${w.bossEstimate ? `
            <div style="font-size:12px;color:var(--text-dim);margin-bottom:8px">
              Boss预估战力：${w.bossEstimate.min} ~ ${w.bossEstimate.max}
            </div>
          ` : ''}
          ${w.type === '团队' && w.teamProgress ? `
            <div style="font-size:12px;color:var(--text-dim);margin-bottom:8px">
              ${w.teamProgress.map(m => `${e(m.name)}：${e(m.status)}`).join(' · ')}
            </div>
          ` : ''}
          ${this.canChallenge(w) ? `
            <button class="btn btn-primary" onclick="WishPage.startBattle(${w.id})">挑战Boss</button>
          ` : `
            <div style="font-size:12px;color:var(--text-dim)">
              ${(() => {
                if (w.type === '团队' && Array.isArray(w.teamProgress)) {
                  const self = w.teamProgress.find(m => m.id === API.user.id);
                  if (self?.status === '已通过') return '你已通过，等待其他成员';
                }
                if (w.status === 'in_progress') return '进行中';
                if (w.status === 'pending') return '待挑战';
                return '不可挑战';
              })()}
            </div>
          `}
        </div>
      `).join('')}

      ${completed.length > 0 ? `
        <div class="page-subheader" style="margin-top:16px">已完成</div>
        ${completed.map(w => `
          <div class="card" style="opacity:0.7">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div>
                <span class="wish-type wish-type-${safeWishTypeClass(w.type)}">${e(w.type)}</span>
                <span style="margin-left:8px;font-weight:600">${e(w.name)}</span>
              </div>
              ${w.status === 'completed' ? `
                <button class="btn btn-success btn-small" onclick="WishPage.redeem(${w.id})">兑现</button>
              ` : `<span style="font-size:12px;color:var(--green)">已兑现</span>`}
            </div>
          </div>
        `).join('')}
      ` : ''}
    `;
  },

  setTypeFilter(type) {
    this.typeFilter = type;
    this.render();
  },

  setStatusFilter(status) {
    this.statusFilter = status;
    this.render();
  },

  canChallenge(wish) {
    if (wish.status === 'completed' || wish.status === 'redeemed') return false;
    if (wish.type === '单人' && wish.target_user_id !== API.user.id) return false;
    if (wish.type === '团队' && Array.isArray(wish.teamProgress)) {
      const self = wish.teamProgress.find(m => m.id === API.user.id);
      if (self && self.status === '已通过') return false;
    }
    return true;
  },

  openCreate() {
    this.showCreate = true;
    this.renderCreate(document.getElementById('page-wish'));
  },

  renderCreate(container) {
    container.innerHTML = `
      <div class="page-header">
        <span onclick="WishPage.closeCreate()" style="cursor:pointer">← </span>许下愿望
      </div>
      <div class="card">
        <div class="form-group">
          <label>愿望名称</label>
          <input type="text" id="wish-name" placeholder="例：喝一杯奶茶">
        </div>
        <div class="form-group">
          <label>愿望描述（可选）</label>
          <textarea id="wish-desc" rows="2" placeholder="详细说明"></textarea>
        </div>
        <div class="form-group">
          <label>愿望类型</label>
          <select id="wish-type">
            <option value="单人">单人（只有自己需要挑战）</option>
            <option value="团队">团队（全员需通过）</option>
          </select>
        </div>
        <div class="form-group">
          <label>难度评分（1-10）</label>
          <input type="range" id="wish-difficulty" min="1" max="10" value="3"
            oninput="document.getElementById('diff-display').textContent=this.value"
            style="width:100%;accent-color:var(--primary)">
          <div style="text-align:center;font-size:20px;font-weight:700;color:var(--gold)" id="diff-display">3</div>
        </div>
        <div class="form-group">
          <label>现实奖励</label>
          <input type="text" id="wish-reward" placeholder="打赢Boss后的奖励">
        </div>
        <button class="btn btn-primary" onclick="WishPage.submitCreate()">创建愿望</button>
      </div>
    `;
  },

  closeCreate() {
    this.showCreate = false;
    this.render();
  },

  async submitCreate() {
    const name = document.getElementById('wish-name').value.trim();
    const description = document.getElementById('wish-desc').value.trim();
    const type = document.getElementById('wish-type').value;
    const difficulty = parseInt(document.getElementById('wish-difficulty').value, 10);
    const reward_description = document.getElementById('wish-reward').value.trim();

    if (!name || !reward_description) {
      App.toast('请填写愿望名称和奖励', 'error');
      return;
    }

    try {
      await API.post('/wishes', {
        name,
        description,
        type,
        difficulty,
        reward_description,
        target_user_id: type === '单人' ? API.user.id : null,
      });
      App.toast('愿望创建成功！', 'success');
      this.showCreate = false;
      this.load();
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  async startBattle(wishId) {
    this.selectedWish = this.wishes.find(w => w.id === wishId);
    this.showBattle = true;
    this.preparedBoss = null;
    this.battleSelectedIds.clear();
    this.renderBattle(document.getElementById('page-wish'));

    try {
      const [itemData, prepared] = await Promise.all([
        API.get('/items'),
        API.post('/battle/prepare', { wish_id: wishId }),
      ]);
      this.battleItems = itemData.items;
      this.preparedBoss = prepared.boss;
      this.renderBattle(document.getElementById('page-wish'));
    } catch (e) {
      this.showBattle = false;
      this.preparedBoss = null;
      App.toast(e.message, 'error');
      this.render();
    }
  },

  renderBattle(container) {
    const e = API.escapeHtml.bind(API);
    const w = this.selectedWish;

    if (!w) {
      container.innerHTML = '<div class="empty-state">愿望不存在</div>';
      return;
    }

    const selectedTotal = this.battleItems
      .filter(i => this.battleSelectedIds.has(i.id))
      .reduce((s, i) => s + i.temp_value, 0);

    const boss = this.preparedBoss;
    const bossAttrValues = boss
      ? [boss.physique, boss.comprehension, boss.willpower, boss.dexterity, boss.perception]
      : [];
    const bossMaxAttr = bossAttrValues.length > 0 ? Math.max(...bossAttrValues, 1) : 1;

    container.innerHTML = `
      <div class="page-header">
        <span onclick="WishPage.closeBattle()" style="cursor:pointer">← </span>挑战Boss
      </div>

      <div class="card">
        <div class="card-title">${e(w.name)}</div>
        <div style="font-size:13px;color:var(--text-dim)">难度 ${w.difficulty}/10 · 🎁 ${e(w.reward_description)}</div>
      </div>

      ${!boss ? `
        <div class="card"><div style="font-size:13px;color:var(--text-dim)">正在推演Boss天机...</div></div>
      ` : `
        <div class="card">
          <div class="card-title">${e(boss.name)}</div>
          <div style="font-size:13px;color:var(--text-dim);margin-bottom:8px">${e(boss.description)}</div>
          <div style="font-size:14px;font-weight:700;margin-bottom:10px">总战力：${boss.total_power}</div>
          ${Object.entries(WISH_ATTR_NAMES).map(([key, label]) => {
            const val = Number(boss[key] || 0);
            const pct = Math.round((val / bossMaxAttr) * 100);
            return `
              <div style="margin-bottom:8px">
                <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
                  <span>${label}</span><span>${val.toFixed(1)}</span>
                </div>
                <div class="attr-bar"><div class="attr-bar-fill" style="width:${pct}%"></div></div>
              </div>
            `;
          }).join('')}
        </div>
      `}

      <div class="card">
        <div class="card-title">装备道具（可选）</div>
        <div style="font-size:12px;color:var(--text-dim);margin-bottom:8px">
          选择要在战斗中使用的道具，战后无论输赢都会消耗
        </div>

        ${this.battleItems.length === 0 ? `
          <div style="font-size:13px;color:var(--text-dim)">背包中没有道具，将以纯永久属性挑战</div>
        ` : `
          ${this.battleItems.map(item => `
            <div class="item-row">
              <input type="checkbox" class="item-check"
                ${this.battleSelectedIds.has(item.id) ? 'checked' : ''}
                onchange="WishPage.toggleBattleItem(${item.id})">
              <div class="item-info" style="margin-left:10px">
                ${(() => {
                  const q = ['凡品', '良品', '上品', '极品'].includes(item.quality) ? item.quality : '凡品';
                  return `<div class="item-name quality-${q}">${e(item.name)}</div>`;
                })()}
                <div class="item-meta">${WISH_ATTR_NAMES[item.attribute_type] || item.attribute_type} +${item.temp_value}</div>
              </div>
            </div>
          `).join('')}
        `}

        <div style="margin-top:12px;font-size:14px;font-weight:600">
          临时属性加成：+${selectedTotal.toFixed(1)}
        </div>
      </div>

      <button class="btn btn-danger" style="font-size:16px;padding:14px"
        onclick="WishPage.executeBattle()" ${boss ? '' : 'disabled'}>
        开始挑战！
      </button>
    `;
  },

  toggleBattleItem(id) {
    if (this.battleSelectedIds.has(id)) this.battleSelectedIds.delete(id);
    else this.battleSelectedIds.add(id);
    this.renderBattle(document.getElementById('page-wish'));
  },

  closeBattle() {
    this.showBattle = false;
    this.preparedBoss = null;
    this.render();
  },

  async executeBattle() {
    if (!this.preparedBoss) return;
    try {
      const result = await API.post('/battle/execute', {
        boss_id: this.preparedBoss.id,
        equipped_item_ids: [...this.battleSelectedIds],
      });
      this.showBattleResult(result);
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  showBattleResult(data) {
    const container = document.getElementById('page-wish');
    const { boss, result } = data;
    const rounds = result.rounds;
    const e = API.escapeHtml.bind(API);
    const bossAttrValues = [boss.physique, boss.comprehension, boss.willpower, boss.dexterity, boss.perception];
    const bossMaxAttr = Math.max(...bossAttrValues, 1);

    container.innerHTML = `
      <div class="page-header">战斗报告</div>

      <div class="card" style="text-align:center">
        <div style="font-size:24px;font-weight:700;color:var(--red);margin-bottom:4px">${e(boss.name)}</div>
        <div style="font-size:13px;color:var(--text-dim)">${e(boss.description)}</div>
        <div style="font-size:14px;margin-top:8px">总战力：${boss.total_power}</div>
      </div>

      <div class="card">
        <div class="card-title">Boss属性分布</div>
        ${Object.entries(WISH_ATTR_NAMES).map(([key, label]) => {
          const val = Number(boss[key] || 0);
          const pct = Math.round((val / bossMaxAttr) * 100);
          return `
            <div style="margin-bottom:8px">
              <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
                <span>${label}</span><span>${val.toFixed(1)}</span>
              </div>
              <div class="attr-bar"><div class="attr-bar-fill" style="width:${pct}%"></div></div>
            </div>
          `;
        }).join('')}
      </div>

      <div class="battle-container" id="battle-rounds"></div>

      <div class="battle-result ${result.result}">
        ${result.result === 'win' ? '胜利！' : '战败...'}
      </div>

      <div class="card" style="margin-top:12px">
        <div class="card-title">战斗详情</div>
        <div style="font-size:13px;line-height:1.8">
          永久属性战力：${result.user_base_power}<br>
          道具临时战力：+${result.user_item_power}<br>
          ${result.is_critical ? `暴击！伤害 ×${result.crit_damage}%<br>` : ''}
          ${result.is_combo ? `连击！战力 ×130%<br>` : ''}
          ${result.damage_reduction > 0 ? `减伤：${result.damage_reduction}%<br>` : ''}
          最终战力：${result.user_final_power}<br>
          Boss有效战力：${result.boss_power}
        </div>
      </div>

      ${result.result === 'win' ? `
        <div class="card" style="border-color:var(--gold)">
          <div style="text-align:center;font-size:16px;font-weight:600;color:var(--gold)">
            🎁 ${e(this.selectedWish.reward_description)}
          </div>
        </div>
      ` : `
        <div class="card">
          <div style="text-align:center;font-size:13px;color:var(--text-dim)">
            继续修炼，积蓄力量再来挑战！
          </div>
        </div>
      `}

      <button class="btn btn-primary" onclick="WishPage.closeBattle();WishPage.load()">返回愿望池</button>
    `;

    const roundsContainer = document.getElementById('battle-rounds');
    rounds.forEach((r, i) => {
      setTimeout(() => {
        const div = document.createElement('div');
        div.className = 'battle-round';
        div.style.animationDelay = '0s';
        div.innerHTML = `
          <div class="round-desc">第${r.round}回合：${e(r.description)}</div>
          <div class="round-detail">${e(r.userAction)} | ${e(r.bossAction)}</div>
        `;
        roundsContainer.appendChild(div);
      }, i * 600);
    });
  },

  async redeem(wishId) {
    try {
      await API.post(`/rewards/${wishId}/redeem`);
      App.toast('奖励已兑现！', 'success');
      this.load();
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },
};
