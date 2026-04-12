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
  cultivationStatus: null,
  achievements: [], // V2-F10
  promoting: false, // V2.5 V25-002 - 晋级防重复标志位
  settingStatus: false, // V2.5 V25-003 - 状态提交防重复标志位
  trendDetailDate: null, // V2.6 - 趋势图当前展开的日期
  trendDetailData: null, // V2.6 - 当天行为明细数据

  async load() {
    const container = document.getElementById('page-home');
    // V2.5 V25-001 - 加载期间显示 loading 骨架屏
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 0">
        <div style="width:36px;height:36px;border:3px solid var(--border);border-top-color:var(--primary);border-radius:50%;animation:spin 0.8s linear infinite"></div>
        <div style="margin-top:12px;font-size:13px;color:var(--text-dim)">加载中…</div>
        <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
      </div>
    `;
    try {
      const [characterData, achievementsData] = await Promise.all([
        API.get('/character'),
        API.get('/character/achievements').catch(() => []), // V2-F10 - 成就接口失败时不阻塞首页
      ]);
      this.trendDetailDate = null;
      this.trendDetailData = null;
      this.data = characterData;
      this.cultivationStatus = characterData.cultivationStatus || null;
      this.achievements = Array.isArray(achievementsData) ? achievementsData : [];
      this.toastNewAchievements(this.achievements); // V2-F10 - 首次解锁提示
      this.render();
    } catch (e) {
      App.toast(e.message, 'error');
      // 加载失败兜底：显示错误提示 + 重试按钮
      container.innerHTML = `
        <div class="card" style="text-align:center;padding:32px 16px">
          <div style="font-size:16px;margin-bottom:12px;color:var(--text-dim)">加载失败</div>
          <div style="font-size:13px;color:var(--text-dim);margin-bottom:16px">${API.escapeHtml(e.message)}</div>
          <button class="btn btn-primary" style="width:auto;padding:10px 32px" onclick="HomePage.load()">重试</button>
        </div>
      `;
    }
  },

  // V2-F03 FB-01
  getRecommendations(character, trend) {
    // V2-F03 FB-01 - 属性 → 推荐行为类别映射
    // V2.5 V25-037 - category 值直接使用行为页实际分类名
    const ATTR_CATEGORY_MAP = {
      physique: { label: '体魄', category: '身体健康' }, // V2-F03 FB-01
      comprehension: { label: '悟性', category: '学习' }, // V2-F03 FB-01
      willpower: { label: '心性', category: '生活习惯' }, // V2-F03 FB-01
      dexterity: { label: '灵巧', category: '家务' }, // V2-F03 FB-01
      perception: { label: '神识', category: '社交互助' }, // V2-F03 FB-01
    };

    // V2-F03 FB-01
    const attrs = ['physique', 'comprehension', 'willpower', 'dexterity', 'perception'];

    // V2-F03 FB-01 - 新用户：所有属性均为 0
    const allZero = attrs.every(a => Number(character[a] || 0) === 0);
    if (allZero) {
      // 最近 7 天有行为但属性仍为 0：更可能是还没合成，优先推荐去背包
      const hasRecentBehavior = trend && trend.days && Object.values(trend.byAttribute || {}).some(
        byAttr => byAttr.counts && byAttr.counts.some(c => c > 0)
      );
      if (hasRecentBehavior) return 'suggest_synthesize';
      return null;
    }

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
  renderRecommendations(character, trend) {
    const recs = this.getRecommendations(character, trend); // V2-F03 FB-01
    const e = API.escapeHtml.bind(API); // V2-F03 FB-01

    // V2-F03 FB-01 - 新用户默认引导
    if (recs === null) {
      return `
        <div class="card recommend-card" onclick="HomePage.goToBehavior(null)"> <!-- V2-F03 FB-01 -->
          <div class="card-title">✨ 今日推荐</div>
          <div class="recommend-item">
            <div>
              <span class="recommend-text">先去上报一次行为，获得你的第一个道具</span>
              <button class="btn btn-small btn-primary" style="margin-top:8px">去上报 →</button>
            </div>
          </div>
        </div>
      `;
    }

    if (recs === 'suggest_synthesize') {
      return `
        <div class="card recommend-card" onclick="App.navigate('inventory')">
          <div class="card-title">✨ 今日推荐</div>
          <div class="recommend-item">
            <div>
              <span class="recommend-text">你已经获得了道具，去背包合成提升属性吧</span>
              <button class="btn btn-small btn-primary" style="margin-top:8px">去合成 →</button>
            </div>
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
    // V2.5 V25-035 - 通过 pendingCategory 机制替代 setTimeout
    if (category && typeof BehaviorPage !== 'undefined') {
      BehaviorPage.pendingCategory = category;
    }
    App.navigate('behavior'); // V2-F03 FB-01
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
    if (newlyUnlocked.length === 0) return;

    // V2.5 V25-033 - 多条成就合并为一条 toast
    if (newlyUnlocked.length === 1) {
      App.toast(`成就解锁：${newlyUnlocked[0].icon} ${newlyUnlocked[0].name}`, 'success');
    } else {
      const names = newlyUnlocked.map(a => `${a.icon}${a.name}`).join('、');
      App.toast(`解锁了 ${newlyUnlocked.length} 个成就：${names}`, 'success');
    }

    newlyUnlocked.forEach(a => toasted.push(a.id));
    sessionStorage.setItem(toastedKey, JSON.stringify(toasted));
  },

  // V2-F10 - 成就卡片渲染
  renderAchievements() {
    const e = API.escapeHtml.bind(API);
    if (!Array.isArray(this.achievements) || this.achievements.length === 0) {
      // V2.5 V25-079 - 空状态引导
      return `
        <div class="card">
          <div class="card-title">成就</div>
          <div class="empty-state" style="padding:24px 16px">
            <div class="empty-icon">🏆</div>
            <div style="font-size:13px;color:var(--text-dim)">继续修炼，解锁更多成就</div>
          </div>
        </div>
      `;
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

    // 补充-1 - 标签旁显示数值："体魄 12.5"
    const labels = DIMS.map((d, i) => {
      const lp = pt(LABEL_R, i); // V2-F08 FB-08
      const cos = Math.cos(angle(i));
      const anchor = cos < -0.1 ? 'end' : cos > 0.1 ? 'start' : 'middle'; // V2-F08 FB-08
      const val = Number(character[d.key] || 0);
      const valText = Number.isInteger(val) ? String(val) : val.toFixed(1);
      return `<text x="${lp.x.toFixed(2)}" y="${lp.y.toFixed(2)}" text-anchor="${anchor}" dominant-baseline="middle" font-size="11" fill="var(--text-dim)">${d.label} ${valText}</text>`; // V2-F08 FB-08
    }).join('\n      '); // V2-F08 FB-08

    // V2-F08 FB-08 - 拼装完整 SVG
    return `
      <svg viewBox="0 0 ${SIZE} ${SIZE}"
        width="100%" style="max-width:200px;display:block;margin:0 auto 12px;overflow:visible">
        ${gridPolygons}
        ${axisLines}
        ${dataPolygon}
        ${labels}
      </svg>
    `; // V2-F08 FB-08
  },

  // V2.6 - 趋势图：最近 7 天属性值堆叠柱状图
  renderTrend(trend) {
    if (!trend || !trend.days) return '';
    const e = API.escapeHtml.bind(API);

    const ATTR_COLORS = {
      physique: '#e57373',
      comprehension: '#64b5f6',
      willpower: '#ba68c8',
      dexterity: '#81c784',
      perception: '#ffb74d',
    };
    const ATTR_SHORT = {
      physique: '体',
      comprehension: '悟',
      willpower: '心',
      dexterity: '灵',
      perception: '神',
    };
    const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
    const attrs = ['physique', 'comprehension', 'willpower', 'dexterity', 'perception'];

    const dailyData = trend.days.map((day, i) => {
      const values = {};
      let total = 0;
      for (const attr of attrs) {
        const v = trend.byAttribute?.[attr]?.tempValues?.[i] || 0;
        values[attr] = v;
        total += v;
      }
      return { day, values, total };
    });

    const maxTotal = Math.max(...dailyData.map(d => d.total), 0.1);
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const allEmpty = dailyData.every(d => d.total === 0);
    if (allEmpty) {
      return `
        <div class="card" style="margin-bottom:12px">
          <div class="card-title">本周修炼趋势</div>
          <div class="empty-state" style="padding:24px 16px">
            <div style="font-size:14px;color:var(--text-dim)">还没有修炼记录，上报第一条行为开始积累趋势</div>
            <button class="btn btn-primary btn-small" style="margin-top:12px" onclick="App.navigate('behavior')">去上报 →</button>
          </div>
        </div>
      `;
    }

    const legend = attrs.map(a =>
      `<span style="display:inline-flex;align-items:center;gap:2px;margin-left:6px">
        <span style="width:8px;height:8px;border-radius:2px;background:${ATTR_COLORS[a]}"></span>
        <span style="font-size:11px;color:var(--text-dim)">${ATTR_SHORT[a]}</span>
      </span>`
    ).join('');

    const chartHeight = 120;
    const bars = dailyData.map(d => {
      const isToday = d.day === today;
      const barHeight = d.total > 0 ? Math.max(Math.round((d.total / maxTotal) * chartHeight), 4) : 2;
      const weekday = WEEKDAYS[new Date(`${d.day}T00:00:00`).getDay()];

      let blocks = '';
      if (d.total > 0) {
        blocks = attrs.map((attr, ai) => {
          const pct = d.values[attr] > 0 ? Math.max(Math.round((d.values[attr] / d.total) * 100), 2) : 0;
          if (pct === 0) return '';
          const isTop = ai === attrs.length - 1 || attrs.slice(ai + 1).every(a => d.values[a] === 0);
          const isBottom = ai === 0 || attrs.slice(0, ai).every(a => d.values[a] === 0);
          const radius = `${isTop ? '4px 4px' : '0 0'} ${isBottom ? '4px 4px' : '0 0'}`;
          return `<div style="width:100%;height:${pct}%;background:${ATTR_COLORS[attr]};border-radius:${radius}"></div>`;
        }).join('');
      } else {
        blocks = `<div style="width:100%;height:2px;background:var(--border);border-radius:1px"></div>`;
      }

      return `
        <div style="display:flex;flex-direction:column;align-items:center;width:28px;cursor:pointer"
          onclick="HomePage.toggleTrendDetail('${e(d.day)}')">
          <div style="width:100%;height:${barHeight}px;display:flex;flex-direction:column-reverse${isToday ? ';box-shadow:0 0 6px rgba(139,92,246,0.4)' : ''}">
            ${blocks}
          </div>
          <div style="font-size:11px;color:${isToday ? 'var(--primary)' : 'var(--text-dim)'};margin-top:4px;font-weight:${isToday ? '700' : '400'}">${weekday}</div>
          <div style="font-size:10px;color:var(--text-dim)">${d.total > 0 ? d.total.toFixed(1) : ''}</div>
        </div>
      `;
    }).join('');

    const detailHtml = this.trendDetailDate ? this.renderTrendDetail() : '';

    return `
      <div class="card" style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div class="card-title" style="margin-bottom:0">本周修炼趋势</div>
          <div>${legend}</div>
        </div>
        <div style="display:flex;align-items:flex-end;justify-content:center;gap:8px;height:${chartHeight}px;padding:8px 0">
          ${bars}
        </div>
        ${detailHtml}
      </div>
    `;
  },

  // V2.6 - 点击柱子展开/收起当天行为明细
  async toggleTrendDetail(dateStr) {
    if (this.trendDetailDate === dateStr) {
      this.trendDetailDate = null;
      this.trendDetailData = null;
      this.render();
      return;
    }

    this.trendDetailDate = dateStr;
    this.trendDetailData = null;
    this.render();

    try {
      const [year, month] = dateStr.split('-');
      const history = await API.get(`/behavior/history?year=${year}&month=${month}`);
      if (this.trendDetailDate !== dateStr) return;
      this.trendDetailData = history[dateStr] || [];
      this.render();
    } catch (_) {
      if (this.trendDetailDate !== dateStr) return;
      this.trendDetailData = [];
      this.render();
    }
  },

  // V2.6 - 渲染趋势图点击展开的当天行为明细
  renderTrendDetail() {
    const e = API.escapeHtml.bind(API);
    const dateStr = this.trendDetailDate;
    if (!dateStr) return '';

    const d = new Date(`${dateStr}T00:00:00`);
    const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
    const label = `${d.getMonth() + 1}月${d.getDate()}日（周${WEEKDAYS[d.getDay()]}）`;

    if (this.trendDetailData === null) {
      return `<div style="margin-top:12px;font-size:13px;color:var(--text-dim)">加载中…</div>`;
    }

    if (this.trendDetailData.length === 0) {
      return `<div style="margin-top:12px;font-size:13px;color:var(--text-dim)">${label} — 无记录</div>`;
    }

    const QUALITY_VALUES = { 凡品: 1, 良品: 1.5, 上品: 2, 极品: 3 };
    const totalValue = this.trendDetailData.reduce((sum, b) => sum + (QUALITY_VALUES[b.quality] || 1), 0);

    const rows = this.trendDetailData.map((b) => {
      const q = ['凡品', '良品', '上品', '极品'].includes(b.quality) ? b.quality : '凡品';
      return `
        <div class="item-row" style="padding:6px 0">
          <div class="item-info">
            <div class="item-name">${e(b.sub_type)}</div>
            <div class="item-meta">
              <span class="quality-${q}">${e(q)}</span>
              ${b.item_name ? `· ${e(b.item_name)}` : ''}
            </div>
          </div>
          <div class="item-meta">${new Date(b.completed_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
      `;
    }).join('');

    return `
      <div style="margin-top:12px;border-top:1px solid var(--border);padding-top:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="font-size:13px;font-weight:600">${label}</span>
          <span style="font-size:12px;color:var(--gold)">属性 +${totalValue.toFixed(1)}</span>
        </div>
        ${rows}
      </div>
    `;
  },

  render() {
    const { character, promotion, decayStatus, trend } = this.data;
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
      decayHtml = warnings.map((d) => {
        // V2.5 V25-031 - 按严重程度区分样式
        const isDecaying = d.dailyDecay > 0; // 正在衰退
        const severityClass = isDecaying ? 'decay-warning-severe' : 'decay-warning-mild';
        return `
          <div class="decay-warning ${severityClass}">
            ${e(d.name)}：${e(d.status)}${isDecaying ? `（每日-${d.dailyDecay}）` : '（即将衰退）'}
            ${d.inactiveDays ? `，已${d.inactiveDays}天未活跃` : ''}
          </div>
        `;
      }).join('');
    }

    const realmProgressText = progress.hasNextRealm
      ? `▸ ${e(nextRealmShort)}（${currentTotalText}/${requiredTotal}）`
      : '已达当前版本最高境界';

    const realmReason = !promotion.canPromote && promotion.reason !== '已达最高境界'
      ? `<div class="realm-progress-reason">${e(promotion.reason)}</div>`
      : '';

    const cultivationStatus = this.cultivationStatus;
    const cultivationColors = {
      精进: 'var(--gold)',
      稳修: 'var(--primary)',
      懈怠: 'var(--text-dim)',
      停滞: 'var(--red)',
    };
    const cvColor = cultivationColors[cultivationStatus?.level] || 'var(--text-dim)';
    const cultivationCard = cultivationStatus ? `
      <div class="card" style="margin-bottom:12px;border-left:4px solid ${cvColor}">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <span style="font-size:15px;font-weight:700;color:${cvColor}">
              ${cultivationStatus.level === '精进' ? '🔥 ' : ''}${e(cultivationStatus.level)}
            </span>
            <span style="font-size:13px;color:var(--text-dim);margin-left:8px">
              本周活跃 ${cultivationStatus.activeDays}/7 天 · ${cultivationStatus.activeCategories} 类
            </span>
          </div>
          ${cultivationStatus.dropBonus > 0 ? `
            <span style="font-size:12px;color:var(--gold)">良品+${Math.round(cultivationStatus.dropBonus * 100)}%</span>
          ` : ''}
          ${cultivationStatus.bufferAdjust < 0 ? `
            <span style="font-size:12px;color:var(--red)">缓冲${cultivationStatus.bufferAdjust}天</span>
          ` : ''}
        </div>
        ${cultivationStatus.nextLevelHint ? `
          <div style="font-size:12px;color:var(--text-dim);margin-top:6px">${e(cultivationStatus.nextLevelHint)}</div>
        ` : ''}
      </div>
    ` : '';

    container.innerHTML = `
      <div class="page-header" style="display:flex;align-items:center;justify-content:space-between">
        <span>${e(API.user.name)}</span>
        <span class="status-badge status-${e(character.status || '居家')}"
          onclick="HomePage.showStatusPicker()"
          style="cursor:pointer;font-size:12px;padding:4px 10px;border-radius:12px;${(() => {
            const status = character.status || '居家';
            const statusColors = { 居家: 'var(--green)', 生病: 'var(--red)', 出差: 'var(--blue)' };
            const bg = statusColors[status] || 'var(--bg-card-light)';
            return `background:${bg};color:#fff`;
          })()};min-height:44px;min-width:44px;display:inline-flex;align-items:center;justify-content:center">
          ${e(character.status || '居家')} ▾
        </span>
      </div> <!-- V2-F04 FB-03 - 顶部展示用户名 + 状态badge -->

      <div class="card">
        <div class="realm-progress-line">
          ${promotion.canPromote ? `
            <button class="realm-badge realm-badge-action promotable" onclick="HomePage.promote()"
              role="status" aria-label="当前境界：${e(character.realm_stage)}，可晋级">
              ${realmStageText}
            </button>
          ` : `
            <span class="realm-badge"
              role="status" aria-label="当前境界：${e(character.realm_stage)}">
              ${realmStageText}
            </span>
          `}
          <span class="realm-progress-text">${realmProgressText}</span>
        </div>
        ${realmReason}
      </div>

      ${decayHtml ? `<div class="card"><div class="card-title">衰退预警</div>${decayHtml}</div>` : ''}

      ${cultivationCard}

      <div class="card">
        <div class="card-title">属性总览</div>
        ${this.renderRadar(character)}
      </div>

      ${this.renderTrend(trend)}

      ${this.renderRecommendations(character, trend)} <!-- V2-F03 FB-01 -->
      ${this.renderAchievements()} <!-- V2-F10 -->

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
      居家: { icon: '🏠', desc: '日常修炼，正常计算衰退' },
      生病: { icon: '🤒', desc: '身体欠佳，衰退缓冲延长至30天' },
      出差: { icon: '✈️', desc: '外出奔波，衰退缓冲延长至30天' },
    }; // V2-F04 FB-03

    const modal = document.createElement('div');
    modal.id = 'status-picker-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:200;display:flex;align-items:center;justify-content:center;padding:24px';
    // V2.5 V25-080 - 点击遮罩区域关闭弹窗
    modal.onclick = function (event) { if (event.target === this) this.remove(); };
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
    if (this.settingStatus) return; // V2.5 V25-003
    this.settingStatus = true;
    // V2.5 V25-003 - 禁用所有选项并显示加载指示器
    const modal = document.getElementById('status-picker-modal');
    if (modal) {
      const options = modal.querySelectorAll('[onclick^="HomePage.setStatus"]');
      options.forEach((el) => {
        el.style.pointerEvents = 'none';
        el.style.opacity = '0.5';
      });
      // 在被点击的选项上显示加载状态
      options.forEach((el) => {
        if (el.getAttribute('onclick')?.includes(`'${status}'`)) {
          el.insertAdjacentHTML('beforeend',
            '<span class="status-loading" style="margin-left:8px;font-size:12px;color:var(--text-dim)">提交中…</span>');
        }
      });
    }
    try {
      await API.post('/character/status', { status });
      modal?.remove();
      App.toast(`状态已切换为：${status}`, 'success');
      // 环境状态会影响行为分类，切换后清空行为页缓存
      if (typeof BehaviorPage !== 'undefined') {
        BehaviorPage.categories = null;
      }
      this.load();
    } catch (e) {
      App.toast(e.message, 'error');
      // 失败时恢复选项
      if (modal) {
        const options = modal.querySelectorAll('[onclick^="HomePage.setStatus"]');
        options.forEach((el) => {
          el.style.pointerEvents = '';
          el.style.opacity = '';
        });
        modal.querySelectorAll('.status-loading').forEach(el => el.remove());
      }
    } finally {
      this.settingStatus = false;
    }
  },

  async promote() {
    if (this.promoting) return; // V2.5 V25-002
    this.promoting = true;
    const btn = document.querySelector('.realm-badge-action.promotable');
    if (btn) {
      btn.disabled = true;
      btn.dataset.originalText = btn.textContent;
      btn.textContent = '晋级中…';
    }
    try {
      const result = await API.post('/character/promote');
      App.toast(result.message, 'success');
      this.load();
    } catch (e) {
      App.toast(e.message, 'error');
      // 失败时恢复按钮
      if (btn) {
        btn.disabled = false;
        btn.textContent = btn.dataset.originalText || '';
      }
    } finally {
      this.promoting = false;
    }
  },

  logout() {
    // V2.5 V25-036 - 退出前确认
    if (!confirm('确认退出登录？')) return;
    API.clearAuth();
    App.showLogin();
  },
};
