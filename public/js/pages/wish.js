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
  battleResult: null, // V2-F05 FB-04
  character: null, // V2-F05 FB-04
  typeFilter: '全部',
  statusFilter: '全部',
  submittingCreate: false, // V2.5 V25-015 - 创建防重复标志位
  executing: false, // V2.5 V25-018 - 挑战防重复标志位
  filterExpanded: false, // V2.6 P11 - 筛选面板折叠状态

  async load() {
    try {
      this.wishes = await API.get('/wishes');
      this.filterExpanded = false; // V2.6 P11 - 每次加载重置筛选折叠
      if (!this.showBattle) this.render();
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  // V2-F05 FB-04 - 计算胜算文案
  getOddsText(userPower, bossPower) {
    if (!bossPower || bossPower <= 0) return { text: '胜算未知（角色数据加载中…）', color: 'var(--text-dim)' };
    const ratio = userPower / bossPower;
    if (ratio >= 0.9) return { text: '胜算十成', color: 'var(--green)' };
    if (ratio >= 0.7) return { text: '胜算七成', color: 'var(--green)' };
    if (ratio >= 0.5) return { text: '胜算五成', color: 'var(--gold)' };
    if (ratio >= 0.3) return { text: '胜算三成', color: 'var(--gold)' };
    return { text: '胜算渺茫', color: 'var(--red)' };
  },

  // V2-F05 FB-04 - 失败后差距分析和提升建议
  getDefeatAdvice(battle) {
    const ATTR_MAP = {
      physique: { name: '体魄', advice: '多做运动健身类行为' },
      comprehension: { name: '悟性', advice: '多做学习成长类行为' },
      willpower: { name: '心性', advice: '多做冥想/生活习惯类行为' },
      dexterity: { name: '灵巧', advice: '多做家务/生活技能类行为' },
      perception: { name: '神识', advice: '多做社交互助类行为' },
    };
    const boss = battle.boss;
    const character = this.character;
    if (!boss) return '继续积累道具，再来挑战！';

    const attrs = ['physique', 'comprehension', 'willpower', 'dexterity', 'perception'];

    // V2.5 V25-023 - 各属性数值对比 + 差距最大属性 + 具体建议
    const comparisons = attrs.map((a) => {
      const userVal = Number(character?.[a] || 0);
      const bossVal = Number(boss[a] || 0);
      const gap = bossVal - userVal;
      return { key: a, userVal, bossVal, gap };
    });

    const maxGap = comparisons.reduce((max, c) => (c.gap > max.gap ? c : max), comparisons[0]);
    const info = ATTR_MAP[maxGap.key];

    const lines = comparisons.map((c) => {
      const marker = c.key === maxGap.key ? ' ← 重点提升' : '';
      return `${ATTR_MAP[c.key].name}：你 ${c.userVal.toFixed(1)} vs Boss ${c.bossVal.toFixed(1)}（差距 ${c.gap.toFixed(1)}）${marker}`;
    });

    return `${lines.join('\n')}\n\n${info.name}差距最大（${maxGap.gap.toFixed(1)}），建议${info.advice}来提升。`;
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
        <button class="btn btn-primary btn-small" style="width:auto;flex-shrink:0" onclick="WishPage.openCreate()">许愿</button>
      </div>

      ${this.wishes.length > 5 ? `
        ${this.filterExpanded ? `
          <div class="card">
            <div class="card-title" style="display:flex;justify-content:space-between;align-items:center">
              筛选
              <span>
                ${(this.typeFilter !== '全部' || this.statusFilter !== '全部') ? `
                  <button class="btn btn-small btn-secondary" style="font-size:11px;margin-right:4px"
                    onclick="WishPage.setTypeFilter('全部');WishPage.setStatusFilter('全部')">清除筛选</button>
                ` : ''}
                <a href="javascript:void(0)" style="font-size:12px;color:var(--text-dim)" onclick="WishPage.toggleFilter()">收起 ▴</a>
              </span>
            </div>
            <div style="font-size:13px;color:var(--text-dim);margin-bottom:6px;font-weight:600">类型</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
              ${['全部', '单人', '团队'].map(t => `
                <button class="btn btn-small ${this.typeFilter === t ? 'btn-primary' : 'btn-secondary'}"
                  onclick="WishPage.setTypeFilter('${t}')">${t}</button>
              `).join('')}
            </div>
            <div style="font-size:13px;color:var(--text-dim);margin-bottom:6px;font-weight:600">状态</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              ${['全部', '待挑战', '进行中', '已完成', '已兑现'].map(s => `
                <button class="btn btn-small ${this.statusFilter === s ? 'btn-primary' : 'btn-secondary'}"
                  onclick="WishPage.setStatusFilter('${s}')">${s}</button>
              `).join('')}
            </div>
          </div>
        ` : `
          <div class="card" style="padding:0" onclick="WishPage.toggleFilter()">
            <div class="filter-collapsed-row">
              <span class="filter-collapsed-title">筛选</span>
              <span class="filter-collapsed-summary" style="${(this.typeFilter !== '全部' || this.statusFilter !== '全部') ? 'color:var(--primary)' : ''}">类型:${this.typeFilter} · 状态:${this.statusFilter}</span>
              <span class="filter-collapsed-indicator">▾</span>
            </div>
          </div>
        `}
      ` : ''}

      ${pending.length === 0 && completed.length === 0 ? `
        <div class="empty-state" style="padding:40px 16px">
          <div class="empty-icon" style="font-size:48px">🌟</div>
          <div style="font-size:16px;font-weight:600;margin-top:12px">还没有愿望</div>
          <div style="font-size:14px;margin-top:8px;color:var(--text-dim)">许下你的第一个愿望吧</div>
          <button class="btn btn-primary btn-small" style="margin-top:16px" onclick="WishPage.openCreate()">立即许愿</button>
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
          ${w.type === '团队' ? `
            <div style="font-size:12px;color:var(--text-dim);margin-bottom:8px" id="team-progress-${w.id}">
              ${Array.isArray(w.teamProgress) && w.teamProgress.length > 0
                ? (() => {
                    const visible = w.teamProgress.slice(0, 5);
                    const hidden = w.teamProgress.slice(5);
                    let html = visible.map(m => {
                      const statusColor = m.status === '已通过' ? 'var(--green)' : 'var(--text-dim)';
                      return `<span>${e(m.name)}：<span style="color:${statusColor}">${e(m.status)}</span></span>`;
                    }).join(' · ');
                    if (hidden.length > 0) {
                      html += ` <a href="javascript:void(0)" onclick="event.stopPropagation();WishPage.expandTeam(${w.id})" style="color:var(--primary)">查看全部 (${w.teamProgress.length}人)</a>`;
                    }
                    return html;
                  })()
                : '团队进度加载中…'}
            </div>
          ` : ''}
          ${this.canChallenge(w) ? `
            <button class="btn btn-primary" onclick="WishPage.startBattle(${w.id})">挑战Boss</button>
          ` : `
            <div style="font-size:12px;color:var(--text-dim)">
              ${(() => {
                if (!API.user?.id) return '请先登录后挑战'; // V2.5 V25-065
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

  // V2.6 P11 - 筛选面板折叠切换
  toggleFilter() {
    this.filterExpanded = !this.filterExpanded;
    this.render();
  },

  // V2.6 P12 - 展开团队进度为网格
  expandTeam(wishId) {
    const wish = this.wishes.find(w => w.id === wishId);
    const container = document.getElementById(`team-progress-${wishId}`);
    if (!wish || !container || !Array.isArray(wish.teamProgress)) return;
    const e = API.escapeHtml.bind(API);
    container.innerHTML = `
      <div class="team-grid">
        ${wish.teamProgress.map(m => {
          const statusColor = m.status === '已通过' ? 'var(--green)' : 'var(--text-dim)';
          return `
            <div class="team-grid-cell">
              <div class="team-grid-name">${e(m.name)}</div>
              <div class="team-grid-status" style="color:${statusColor}">${e(m.status)}</div>
            </div>
          `;
        }).join('')}
      </div>
      <a href="javascript:void(0)" onclick="event.stopPropagation();WishPage.collapseTeam(${wishId})"
        style="color:var(--primary);font-size:12px;display:inline-block;margin-top:6px">收起</a>
    `;
  },

  // V2.6 P12 - 收起团队进度恢复默认
  collapseTeam(wishId) {
    void wishId;
    // 重新渲染整个页面以恢复默认态
    this.render();
  },

  canChallenge(wish) {
    // V2.5 V25-065 - 未登录保护
    if (!API.user?.id) return false;
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
        <button onclick="WishPage.closeCreate()" style="background:none;border:none;color:inherit;font-size:inherit;cursor:pointer;min-width:44px;min-height:44px;display:inline-flex;align-items:center;justify-content:center;padding:0;margin-right:4px">←</button>许下愿望
      </div>
      <div class="card">
        <div class="form-group">
          <label>愿望名称</label>
          <input type="text" id="wish-name" placeholder="例：喝一杯奶茶" maxlength="20">
          <div style="text-align:right;font-size:11px;color:var(--text-dim)" id="wish-name-count">0/20</div>
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
            style="width:100%;accent-color:var(--primary)">
          <div style="text-align:center;font-size:20px;font-weight:700;color:var(--gold)" id="diff-display">3</div>
          <!-- V2-F09 FB-07 - 难度参考锚点 -->
          <div style="font-size:11px;color:var(--text-dim);margin-top:6px;line-height:1.8">
            1-3分：小确幸（一杯奶茶、一部电影）<br>
            4-6分：小目标（一次聚餐、一件新衣服）<br>
            7-9分：大愿望（一次旅行、一件大礼物）<br>
            10分：终极愿望（全家共同的大目标）
          </div>
        </div>
        <div class="form-group">
          <label>现实奖励</label>
          <input type="text" id="wish-reward" placeholder="打赢Boss后的奖励" maxlength="30">
          <div style="text-align:right;font-size:11px;color:var(--text-dim)" id="wish-reward-count">0/30</div>
        </div>
        <div class="form-group">
          <a href="javascript:void(0)" id="wish-desc-toggle" style="font-size:13px;color:var(--primary)"
            onclick="document.getElementById('wish-desc-area').style.display='block';this.style.display='none'">
            + 添加描述（可选）
          </a>
          <div id="wish-desc-area" style="display:none">
            <label>愿望描述</label>
            <textarea id="wish-desc" rows="2" placeholder="详细说明"></textarea>
          </div>
        </div>
        <button class="btn btn-primary" onclick="WishPage.submitCreate()">创建愿望</button>
      </div>
    `;
    // FIX-7 - 难度滑块展示修复
    const diffInput = document.getElementById('wish-difficulty');
    if (diffInput) diffInput.oninput = function () {
      const display = document.getElementById('diff-display');
      if (display) display.textContent = this.value;
    };

    // V2.5 V25-063 - 实时字数统计
    const nameInput = document.getElementById('wish-name');
    const rewardInput = document.getElementById('wish-reward');
    if (nameInput) nameInput.oninput = function () {
      const counter = document.getElementById('wish-name-count');
      if (counter) counter.textContent = `${this.value.length}/20`;
    };
    if (rewardInput) rewardInput.oninput = function () {
      const counter = document.getElementById('wish-reward-count');
      if (counter) counter.textContent = `${this.value.length}/30`;
    };
  },

  closeCreate() {
    this.showCreate = false;
    this.render();
  },

  async submitCreate() {
    if (this.submittingCreate) return; // V2.5 V25-015
    const name = document.getElementById('wish-name').value.trim();
    const description = document.getElementById('wish-desc').value.trim();
    const type = document.getElementById('wish-type').value;
    const difficulty = parseInt(document.getElementById('wish-difficulty').value, 10);
    const reward_description = document.getElementById('wish-reward').value.trim();

    if (!name || !reward_description) {
      App.toast('请填写愿望名称和奖励', 'error');
      return;
    }

    this.submittingCreate = true; // V2.5 V25-015
    const btn = document.querySelector('#page-wish .btn-primary');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '创建中…';
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
      if (btn) {
        btn.disabled = false;
        btn.textContent = '创建愿望';
      }
    } finally {
      this.submittingCreate = false; // V2.5 V25-015
    }
  },

  async startBattle(wishId) {
    this.selectedWish = this.wishes.find(w => w.id === wishId);
    this.showBattle = true;
    this.preparedBoss = null;
    this.battleSelectedIds.clear();
    // V2.5 V25-016 - 立即显示 loading spinner
    const container = document.getElementById('page-wish');
    container.innerHTML = `
      <div class="page-header">
        <span onclick="WishPage.closeBattle()" style="cursor:pointer;min-width:44px;min-height:44px;display:inline-flex;align-items:center;justify-content:center">← </span>挑战Boss
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 0">
        <div style="width:36px;height:36px;border:3px solid var(--border);border-top-color:var(--primary);border-radius:50%;animation:spin 0.8s linear infinite"></div>
        <div style="margin-top:12px;font-size:13px;color:var(--text-dim)">正在推演Boss天机…</div>
        <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
      </div>
    `;

    try {
      // V2.5 V25-057 - 各步骤独立 catch，提供具体错误文案
      const [itemData, prepared, characterData] = await Promise.all([
        API.get('/items').catch(() => { throw new Error('道具数据加载失败，请检查网络后重试'); }),
        API.post('/battle/prepare', { wish_id: wishId }).catch(() => { throw new Error('Boss 生成失败，请稍后重试'); }),
        this.character ? Promise.resolve({ character: this.character }) : API.get('/character').catch(() => { throw new Error('角色数据加载失败，请重新登录'); }),
      ]);
      this.battleItems = itemData.items;
      this.preparedBoss = prepared.boss;
      this.character = characterData?.character || this.character; // V2-F05 FB-04
      this.renderBattle(document.getElementById('page-wish'));
    } catch (e) {
      this.showBattle = false;
      this.selectedWish = null; // V2.5 V25-069 - 失败后清空
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
        <button onclick="WishPage.closeBattle()" style="background:none;border:none;color:inherit;font-size:inherit;cursor:pointer;min-width:44px;min-height:44px;display:inline-flex;align-items:center;justify-content:center;padding:0;margin-right:4px">←</button>挑战Boss
      </div>

      <div class="card">
        <div class="card-title">${e(w.name)}</div>
        <div style="font-size:13px;color:var(--text-dim)">难度 ${w.difficulty}/10 · 🎁 ${e(w.reward_description)}</div>
      </div>

      ${!boss ? `
        <div class="card">
          <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-dim)">
            <div style="width:20px;height:20px;border:2px solid var(--border);border-top-color:var(--primary);border-radius:50%;animation:spin 0.8s linear infinite;flex-shrink:0"></div>
            正在推演Boss天机…
          </div>
          <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
        </div>
      ` : `
        <div class="card">
          <div class="card-title">${e(boss.name)}</div>
          <div style="font-size:13px;color:var(--text-dim);margin-bottom:8px">${e(boss.description)}</div>
          <div style="font-size:14px;font-weight:700;margin-bottom:10px">总战力：${boss.total_power}</div>
          ${(() => {
            const basePower = (this.character?.physique || 0) + (this.character?.comprehension || 0) +
              (this.character?.willpower || 0) + (this.character?.dexterity || 0) + (this.character?.perception || 0);
            // V2.5 V25-022 - 胜算计算包含已选道具加成
            const itemPower = this.battleItems
              .filter(i => this.battleSelectedIds.has(i.id))
              .reduce((s, i) => s + i.temp_value, 0);
            const userPower = basePower + itemPower;
            const odds = WishPage.getOddsText(userPower, this.preparedBoss?.total_power);
            return `
              <div style="font-size:16px;font-weight:700;color:${odds.color};margin-top:8px">${odds.text}</div>
              <div style="font-size:12px;color:var(--text-dim);margin-top:4px">
                永久属性 ${basePower.toFixed(1)}${itemPower > 0 ? ` + 道具 ${itemPower.toFixed(1)}` : ''} vs Boss ${this.preparedBoss?.total_power || '?'}
              </div>
            `;
          })()} <!-- V2-F05 FB-04 - 胜算展示 -->
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
            <label class="item-row" style="display:flex;align-items:center;cursor:pointer">
              <input type="checkbox" class="item-check"
                style="width:22px;height:22px;flex-shrink:0"
                ${this.battleSelectedIds.has(item.id) ? 'checked' : ''}
                onchange="WishPage.toggleBattleItem(${item.id})">
              <div class="item-info" style="margin-left:10px">
                ${(() => {
                  const q = ['凡品', '良品', '上品', '极品'].includes(item.quality) ? item.quality : '凡品';
                  return `<div class="item-name quality-${q}">${e(item.name)}</div>`;
                })()}
                <div class="item-meta">${WISH_ATTR_NAMES[item.attribute_type] || item.attribute_type} +${item.temp_value}</div>
              </div>
            </label>
          `).join('')}
        `}

        <div style="margin-top:12px;font-size:14px;font-weight:600">
          临时属性加成：+${selectedTotal.toFixed(1)}
        </div>
      </div>

      <button class="btn btn-primary" style="font-size:16px;padding:14px"
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
    this.battleResult = null; // V2.5 V25-068
    this.selectedWish = null; // 清理引用
    this.battleItems = [];
    this.battleSelectedIds.clear();
    this.render();
  },

  async executeBattle() {
    if (!this.preparedBoss || this.executing) return; // V2.5 V25-018
    this.executing = true;
    const btn = document.querySelector('#page-wish .btn-primary[onclick*="executeBattle"]');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '挑战中…';
    }
    try {
      const result = await API.post('/battle/execute', {
        boss_id: this.preparedBoss.id,
        equipped_item_ids: [...this.battleSelectedIds],
      });
      this.showBattleResult(result);
    } catch (e) {
      App.toast(e.message, 'error');
      if (btn) {
        btn.disabled = false;
        btn.textContent = '开始挑战！';
      }
    } finally {
      this.executing = false; // V2.5 V25-018
    }
  },

  showBattleResult(data) {
    this.battleResult = data; // V2-F05 FB-04
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
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;font-size:13px;line-height:1.8">
          <div>⚔️ 永久属性</div><div>${result.user_base_power}</div>
          <div>🧪 道具加成</div><div>+${result.user_item_power}</div>
          ${result.is_critical ? `<div>💥 暴击</div><div>×${result.crit_damage}%</div>` : ''}
          ${result.is_combo ? `<div>⚡ 连击</div><div>×130%</div>` : ''}
          ${result.damage_reduction > 0 ? `<div>🛡️ 减伤</div><div>${result.damage_reduction}%</div>` : ''}
          <div style="font-weight:700">最终战力</div><div style="font-weight:700">${result.user_final_power}</div>
          <div style="color:var(--red)">Boss战力</div><div style="color:var(--red)">${result.boss_power}</div>
        </div>
      </div>

      ${result.result === 'win' ? `
        <div class="card" style="border-color:var(--gold)">
          <div style="color:var(--gold);font-size:24px;font-weight:800;text-align:center">🎉 斩妖除魔！</div>
          <div style="color:var(--gold);font-size:14px;text-align:center;margin-top:4px">愿望达成，现实奖励等你兑现</div>
          <div style="text-align:center;font-size:16px;font-weight:600;color:var(--gold);margin-top:8px">
            🎁 ${e(this.selectedWish.reward_description)}
          </div> <!-- V2-F05 FB-04 - 胜利仪式感 -->
        </div>
      ` : `
        <div class="card">
          <div style="color:var(--red);font-size:16px;font-weight:700">⚔️ 败北</div>
          <div style="margin-top:8px;font-size:13px;color:var(--text-dim);white-space:pre-line;line-height:1.8">
            ${e(WishPage.getDefeatAdvice(this.battleResult))}
          </div>
          <div style="font-size:12px;color:var(--text-dim);margin-top:4px">道具已消耗，积累后可再次挑战</div> <!-- V2-F05 FB-04 - 失败后差距分析 -->
        </div>
      `}

      <button class="btn btn-primary" onclick="WishPage.closeBattle();WishPage.load()">返回愿望池</button>
    `;

    const roundsContainer = document.getElementById('battle-rounds');
    // V2.5 V25-061 - 动画期间禁用返回按钮
    const backBtn = document.querySelector('#page-wish .btn-primary[onclick*="closeBattle"]');
    if (backBtn) backBtn.disabled = true;

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

        // V2.5 V25-058 - 最后一回合：显示完成提示 + 滚动到结果
        if (i === rounds.length - 1) {
          const endDiv = document.createElement('div');
          endDiv.className = 'battle-round';
          endDiv.style.textAlign = 'center';
          endDiv.style.fontWeight = '700';
          endDiv.style.color = 'var(--text-dim)';
          endDiv.style.marginTop = '8px';
          endDiv.textContent = '— 战斗结束 —';
          roundsContainer.appendChild(endDiv);
          // 滚动到结果区域
          const resultEl = document.querySelector('.battle-result');
          if (resultEl) resultEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // V2.5 V25-061 - 动画结束后启用返回按钮
          if (backBtn) backBtn.disabled = false;
        }
      }, i * 600);
    });
  },

  async redeem(wishId) {
    // V2.5 V25-017 - 兑现前二次确认
    if (!confirm('确认兑现这个愿望的奖励？')) return;
    // V2.5 V25-059 - 乐观更新：立即禁用按钮
    const btn = document.querySelector(`[onclick="WishPage.redeem(${wishId})"]`);
    if (btn) {
      btn.disabled = true;
      btn.textContent = '兑现中…';
    }
    try {
      await API.post(`/rewards/${wishId}/redeem`);
      App.toast('奖励已兑现！', 'success');
      this.load();
    } catch (e) {
      App.toast(e.message, 'error');
      if (btn) {
        btn.disabled = false;
        btn.textContent = '兑现';
      }
    }
  },
};
