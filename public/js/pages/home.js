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
