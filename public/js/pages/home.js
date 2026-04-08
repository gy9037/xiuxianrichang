const ATTR_NAMES = {
  physique: '体魄', comprehension: '悟性', willpower: '心性',
  dexterity: '灵巧', perception: '神识',
};
const ATTR_ICONS = {
  physique: '💪', comprehension: '📖', willpower: '🧘',
  dexterity: '🔧', perception: '👁',
};

const HomePage = {
  data: null,

  async load() {
    try {
      this.data = await API.get('/character');
      this.render();
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  // V2-F03 FB-01
  getRecommendations(character) {
    // V2-F03 FB-01 - 属性 → 推荐行为类别映射
    const ATTR_CATEGORY_MAP = {
      physique: { label: '体魄', category: '运动健身' }, // V2-F03 FB-01
      comprehension: { label: '悟性', category: '学习成长' }, // V2-F03 FB-01
      willpower: { label: '心性', category: '冥想休息' }, // V2-F03 FB-01
      dexterity: { label: '灵巧', category: '生活技能' }, // V2-F03 FB-01
      perception: { label: '神识', category: '感知记录' }, // V2-F03 FB-01
    };

    // V2-F03 FB-01
    const attrs = ['physique', 'comprehension', 'willpower', 'dexterity', 'perception'];

    // V2-F03 FB-01 - 新用户：所有属性均为 0
    const allZero = attrs.every(a => Number(character[a] || 0) === 0);
    // V2-F03 FB-01
    if (allZero) return null; // V2-F03 FB-01 - 返回 null 表示展示默认引导

    // V2-F03 FB-01 - 计算均值
    const values = attrs.map(a => Number(character[a] || 0)); // V2-F03 FB-01
    const avg = values.reduce((s, v) => s + v, 0) / values.length; // V2-F03 FB-01
    const threshold = avg * 0.7; // V2-F03 FB-01 - 低于均值 30% 视为短板

    // V2-F03 FB-01 - 找出短板属性，按值升序排列，取前 2 条
    const weak = attrs
      .filter(a => Number(character[a] || 0) < threshold) // V2-F03 FB-01
      .sort((a, b) => Number(character[a] || 0) - Number(character[b] || 0)) // V2-F03 FB-01
      .slice(0, 2); // V2-F03 FB-01

    // V2-F03 FB-01 - 无明显短板时，取最低的 1 条
    if (weak.length === 0) {
      const lowest = attrs.reduce((min, a) => (Number(character[a] || 0) < Number(character[min] || 0) ? a : min), attrs[0]); // V2-F03 FB-01
      weak.push(lowest); // V2-F03 FB-01
    }

    // V2-F03 FB-01
    return weak.map(a => ATTR_CATEGORY_MAP[a]);
  },

  // V2-F03 FB-01
  renderRecommendations(character) {
    const recs = this.getRecommendations(character); // V2-F03 FB-01
    const e = API.escapeHtml.bind(API); // V2-F03 FB-01

    // V2-F03 FB-01 - 新用户默认引导
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

    // V2-F03 FB-01
    const items = recs.map(r => `
      <div class="recommend-item" onclick="HomePage.goToBehavior('${e(r.category)}')"> <!-- V2-F03 FB-01 -->
        <span class="recommend-text">强化 ${e(r.label)}：去上报一条「${e(r.category)}」行为</span>
        <span class="recommend-arrow">›</span>
      </div>
    `).join('');

    // V2-F03 FB-01
    return `
      <div class="card recommend-card"> <!-- V2-F03 FB-01 -->
        <div class="card-title">✨ 今日推荐</div>
        ${items}
      </div>
    `;
  },

  // V2-F03 FB-01
  goToBehavior(category) {
    App.navigate('behavior'); // V2-F03 FB-01
    if (category) {
      // V2-F03 FB-01 - 推荐类别映射到实际行为分类
      const categoryMap = {
        运动健身: '身体健康', // V2-F03 FB-01
        学习成长: '学习', // V2-F03 FB-01
        冥想休息: '生活习惯', // V2-F03 FB-01
        生活技能: '家务', // V2-F03 FB-01
        感知记录: '社交互助', // V2-F03 FB-01
      };
      // V2-F03 FB-01
      const targetCategory = categoryMap[category] || category;
      // V2-F03 FB-01 - 等 BehaviorPage 渲染完成后预选类别
      setTimeout(() => {
        if (typeof BehaviorPage !== 'undefined' && BehaviorPage.selectCategory) BehaviorPage.selectCategory(targetCategory); // V2-F03 FB-01
      }, 50);
    }
  },

  render() {
    const { character, promotion, decayStatus } = this.data;
    const attrs = ['physique', 'comprehension', 'willpower', 'dexterity', 'perception'];
    const container = document.getElementById('page-home');
    const e = API.escapeHtml.bind(API);

    const progress = promotion.progress || {};
    const currentTotal = Number(progress.currentTotal || 0);
    const requiredTotal = Number(progress.requiredTotal || 0);
    const nextRealm = progress.nextRealm || promotion.nextRealm || '';
    const nextRealmShort = nextRealm ? String(nextRealm).replace(/^练气|^筑基/, '') : '';
    const currentTotalText = Number.isInteger(currentTotal) ? String(currentTotal) : currentTotal.toFixed(1);

    let decayHtml = '';
    const warnings = decayStatus.filter(d => d.status !== '正常');
    if (warnings.length > 0) {
      decayHtml = warnings.map(d => `
        <div class="decay-warning">
          ${e(d.name)}：${e(d.status)}${d.dailyDecay > 0 ? `（每日-${d.dailyDecay}）` : '（即将衰退）'}
          ${d.inactiveDays ? `，已${d.inactiveDays}天未活跃` : ''}
        </div>
      `).join('');
    }

    const realmProgressText = progress.hasNextRealm
      ? `▸ ${e(nextRealmShort)}（${currentTotalText}/${requiredTotal}）`
      : '已达当前版本最高境界';

    const realmReason = !promotion.canPromote && promotion.reason !== '已达最高境界'
      ? `<div class="realm-progress-reason">${e(promotion.reason)}</div>`
      : '';

    container.innerHTML = `
      <div class="page-header">${e(API.user.name)}</div>

      <div class="card">
        <div class="realm-progress-line">
          ${promotion.canPromote ? `
            <button class="realm-badge realm-badge-action promotable" onclick="HomePage.promote()">
              ${e(character.realm_stage)}
            </button>
          ` : `
            <span class="realm-badge">${e(character.realm_stage)}</span>
          `}
          <span class="realm-progress-text">${realmProgressText}</span>
        </div>
        ${realmReason}
      </div>

      <div class="card">
        <div class="card-title">属性总览</div>
        <div class="attr-list">
          ${attrs.map(a => {
            const val = character[a];
            const pct = character.attr_cap > 0 ? Math.min(100, (val / character.attr_cap) * 100) : 0;
            return `
              <div class="attr-line">
                <div class="attr-line-head">
                  <span class="attr-line-name">${ATTR_ICONS[a]} ${ATTR_NAMES[a]}</span>
                  <span class="attr-line-value">${val.toFixed(1)} / ${character.attr_cap}</span>
                </div>
                <div class="attr-bar"><div class="attr-bar-fill" style="width:${pct}%"></div></div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      ${this.renderRecommendations(character)} <!-- V2-F03 FB-01 -->

      ${decayHtml ? `<div class="card"><div class="card-title">衰退预警</div>${decayHtml}</div>` : ''}

      <div style="text-align:center;margin-top:20px">
        <span style="font-size:12px;color:var(--text-dim);cursor:pointer" onclick="HomePage.logout()">退出登录</span>
      </div>
    `;
  },

  async promote() {
    try {
      const result = await API.post('/character/promote');
      App.toast(result.message, 'success');
      this.load();
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  logout() {
    API.clearAuth();
    App.showLogin();
  },
};
