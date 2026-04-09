const ATTR_NAMES = {
  physique: '体魄', comprehension: '悟性', willpower: '心性',
  dexterity: '灵巧', perception: '神识',
};
const ATTR_ICONS = {
  physique: '💪', comprehension: '📖', willpower: '🧘',
  dexterity: '🔧', perception: '👁',
};
// V2-F09 FB-07 - 境界通俗解释映射
const REALM_DESC = {
  练气一阶: '初入修仙', 练气二阶: '感知灵气', 练气三阶: '引气入体',
  练气四阶: '气感稳固', 练气五阶: '小有所成', 练气六阶: '灵气充盈',
  练气七阶: '道心初现', 练气八阶: '根基深厚', 练气九阶: '蓄势待发', 练气十阶: '练气圆满',
  筑基一阶: '筑基初成', 筑基二阶: '根基稳固', 筑基三阶: '道基渐成',
  筑基四阶: '灵台清明', 筑基五阶: '筑基中期', 筑基六阶: '道心坚定',
  筑基七阶: '根基浑厚', 筑基八阶: '筑基后期', 筑基九阶: '蜕变在即', 筑基十阶: '筑基圆满',
};

const HomePage = {
  data: null,
  achievements: [], // V2-F10

  async load() {
    try {
      const [characterData, achievementsData] = await Promise.all([
        API.get('/character'),
        API.get('/character/achievements').catch(() => []), // V2-F10 - 成就接口失败时不阻塞首页
      ]);
      this.data = characterData;
      this.achievements = Array.isArray(achievementsData) ? achievementsData : [];
      this.toastNewAchievements(this.achievements); // V2-F10 - 首次解锁提示
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

  // V2-F10 - 新解锁成就 toast 提示（sessionStorage 去重）
  toastNewAchievements(achievements) {
    if (!Array.isArray(achievements) || achievements.length === 0) return;
    const toastedKey = 'v2f10_toasted';
    let toasted = [];
    try {
      const parsed = JSON.parse(sessionStorage.getItem(toastedKey) || '[]');
      toasted = Array.isArray(parsed) ? parsed : [];
    } catch {
      toasted = [];
    }

    const newlyUnlocked = achievements.filter(a => a.unlocked && !toasted.includes(a.id));
    newlyUnlocked.forEach((a) => {
      App.toast(`成就解锁：${a.icon} ${a.name}`, 'success');
      toasted.push(a.id);
    });
    sessionStorage.setItem(toastedKey, JSON.stringify(toasted));
  },

  // V2-F10 - 成就卡片渲染
  renderAchievements() {
    const e = API.escapeHtml.bind(API);
    if (!Array.isArray(this.achievements) || this.achievements.length === 0) {
      return '';
    }

    return `
      <div class="card"> <!-- V2-F10 -->
        <div class="card-title">成就</div>
        <div id="achievements-container">
          ${this.achievements.map(a => `
            <div class="achievement-item ${a.unlocked ? 'unlocked' : 'locked'}">
              <span class="achievement-icon">${e(a.icon)}</span>
              <div class="achievement-main">
                <div class="achievement-name">${e(a.name)}</div>
                <div class="achievement-desc">${e(a.desc)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  },

  // V2-F08 FB-08
  renderRadar(character) {
    // V2-F08 FB-08 - 五维顺序（顶点从正上方顺时针排列）
    const DIMS = [
      { key: 'physique', label: '体魄' },
      { key: 'comprehension', label: '悟性' },
      { key: 'willpower', label: '心性' },
      { key: 'dexterity', label: '灵巧' },
      { key: 'perception', label: '神识' },
    ]; // V2-F08 FB-08

    const SIZE = 200; // V2-F08 FB-08 - SVG 画布尺寸
    const CX = SIZE / 2; // V2-F08 FB-08 - 中心 X
    const CY = SIZE / 2; // V2-F08 FB-08 - 中心 Y
    const R = 72; // V2-F08 FB-08 - 最大半径（留出标签空间）
    const LABEL_R = R + 16; // V2-F08 FB-08 - 标签距中心距离
    const N = DIMS.length; // V2-F08 FB-08 - 维度数 = 5
    const cap = Number(character.attr_cap) || 1; // V2-F08 FB-08 - 防除零

    // V2-F08 FB-08 - 计算第 i 个顶点的角度（从正上方 -90° 开始，顺时针）
    const angle = i => (Math.PI * 2 * i) / N - Math.PI / 2; // V2-F08 FB-08

    // V2-F08 FB-08 - 极坐标 → 直角坐标
    const pt = (r, i) => ({
      x: CX + r * Math.cos(angle(i)),
      y: CY + r * Math.sin(angle(i)),
    }); // V2-F08 FB-08

    // V2-F08 FB-08 - 将点数组转为 SVG points 字符串
    const toPoints = pts => pts.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' '); // V2-F08 FB-08

    // V2-F08 FB-08 - 背景网格：3 层五边形（25% / 50% / 100%）
    const gridLevels = [0.25, 0.5, 1.0]; // V2-F08 FB-08
    const gridPolygons = gridLevels.map((level) => {
      const pts = DIMS.map((_, i) => pt(R * level, i)); // V2-F08 FB-08
      return `<polygon points="${toPoints(pts)}" fill="none" stroke="var(--border)" stroke-width="1"/>`; // V2-F08 FB-08
    }).join('\n      '); // V2-F08 FB-08

    // V2-F08 FB-08 - 背景轴线：中心 → 各顶点
    const axisLines = DIMS.map((_, i) => {
      const tip = pt(R, i); // V2-F08 FB-08
      return `<line x1="${CX}" y1="${CY}" x2="${tip.x.toFixed(2)}" y2="${tip.y.toFixed(2)}" stroke="var(--border)" stroke-width="1"/>`; // V2-F08 FB-08
    }).join('\n      '); // V2-F08 FB-08

    // V2-F08 FB-08 - 数据多边形：归一化值 = min(当前值 / attr_cap, 1)
    const dataPts = DIMS.map((d, i) => {
      const ratio = Math.min(Number(character[d.key] || 0) / cap, 1); // V2-F08 FB-08
      return pt(R * ratio, i); // V2-F08 FB-08
    }); // V2-F08 FB-08
    const dataPolygon = `<polygon points="${toPoints(dataPts)}" fill="rgba(139,92,246,0.3)" stroke="var(--primary)" stroke-width="2"/>`; // V2-F08 FB-08

    // V2-F08 FB-08 - 顶点标签
    const labels = DIMS.map((d, i) => {
      const lp = pt(LABEL_R, i); // V2-F08 FB-08
      const cos = Math.cos(angle(i));
      const anchor = cos < -0.1 ? 'end' : cos > 0.1 ? 'start' : 'middle'; // V2-F08 FB-08
      return `<text x="${lp.x.toFixed(2)}" y="${lp.y.toFixed(2)}" text-anchor="${anchor}" dominant-baseline="middle" font-size="11" fill="var(--text-dim)">${d.label}</text>`; // V2-F08 FB-08
    }).join('\n      '); // V2-F08 FB-08

    // V2-F08 FB-08 - 拼装完整 SVG
    return `
      <svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"
        style="display:block;margin:0 auto 12px;overflow:visible">
        ${gridPolygons}
        ${axisLines}
        ${dataPolygon}
        ${labels}
      </svg>
    `; // V2-F08 FB-08
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
    // V2-F09 FB-07 - 展示格式：练气一阶（初入修仙）
    const realmDesc = REALM_DESC[character.realm_stage];
    const realmStageText = `${e(character.realm_stage)}${realmDesc ? `（${e(realmDesc)}）` : ''}`;

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
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between">
        <span>${e(API.user.name)}</span>
        <span class="status-badge status-${e(character.status || '正常')}"
          onclick="HomePage.showStatusPicker()"
          style="cursor:pointer;font-size:12px;padding:4px 10px;border-radius:12px;background:var(--bg-card-light)">
          ${e(character.status || '正常')} ▾
        </span>
      </div> <!-- V2-F04 FB-03 - 顶部展示用户名 + 状态badge -->

      <div class="card">
        <div class="realm-progress-line">
          ${promotion.canPromote ? `
            <button class="realm-badge realm-badge-action promotable" onclick="HomePage.promote()">
              ${realmStageText}
            </button>
          ` : `
            <span class="realm-badge">${realmStageText}</span>
          `}
          <span class="realm-progress-text">${realmProgressText}</span>
        </div>
        ${realmReason}
      </div>

      <div class="card">
        <div class="card-title">属性总览</div>
        ${this.renderRadar(character)} <!-- V2-F08 FB-08 -->
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
      ${this.renderAchievements()} <!-- V2-F10 -->

      ${decayHtml ? `<div class="card"><div class="card-title">衰退预警</div>${decayHtml}</div>` : ''}

      <div style="text-align:center;margin-top:20px">
        <span style="font-size:12px;color:var(--text-dim);cursor:pointer" onclick="HomePage.logout()">退出登录</span>
      </div>
    `;
  },

  // V2-F04 FB-03 - 状态切换弹窗
  showStatusPicker() {
    const existing = document.getElementById('status-picker-modal');
    if (existing) existing.remove();

    const STATUS_CONFIG = {
      正常: { icon: '✨', desc: '日常修炼，正常计算衰退' },
      生病: { icon: '🤒', desc: '身体欠佳，衰退缓冲延长至30天' },
      出差: { icon: '✈️', desc: '外出奔波，衰退缓冲延长至30天' },
      休假: { icon: '🏖️', desc: '休养生息，衰退缓冲延长至30天' },
    }; // V2-F04 FB-03

    const modal = document.createElement('div');
    modal.id = 'status-picker-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:200;display:flex;align-items:center;justify-content:center;padding:24px';
    modal.innerHTML = `
      <div style="background:var(--bg-card);border-radius:var(--radius);padding:24px;max-width:320px;width:100%">
        <div style="font-size:16px;font-weight:700;margin-bottom:16px">切换状态</div>
        ${Object.entries(STATUS_CONFIG).map(([s, cfg]) => `
          <div onclick="HomePage.setStatus('${s}')"
            style="padding:12px;border-radius:8px;margin-bottom:8px;cursor:pointer;background:var(--bg-card-light);display:flex;align-items:center;gap:12px">
            <span style="font-size:24px">${cfg.icon}</span>
            <div>
              <div style="font-weight:600">${s}</div>
              <div style="font-size:12px;color:var(--text-dim)">${cfg.desc}</div>
            </div>
          </div>
        `).join('')}
        <button class="btn btn-secondary" style="width:100%;margin-top:8px"
          onclick="document.getElementById('status-picker-modal').remove()">取消</button>
      </div>
    `;
    document.body.appendChild(modal);
  },

  // V2-F04 FB-03 - 提交状态切换
  async setStatus(status) {
    try {
      await API.post('/character/status', { status });
      document.getElementById('status-picker-modal')?.remove();
      App.toast(`状态已切换为：${status}`, 'success');
      this.load();
    } catch (e) {
      App.toast(e.message, 'error');
    }
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
