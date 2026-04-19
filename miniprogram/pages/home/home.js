const api = require('../../utils/api');
const app = getApp();

Page({
  data: {
    loading: true,
    character: null,
    cultivationStatus: null,
    achievements: [],
    achievementsExpanded: false,
    trend: null,
    trendBars: [],
    recommendations: null,
    itemsGrouped: {},
    version: '',
    statusColors: {
      '精进': '#f59e0b',
      '稳修': '#8b5cf6',
      '懈怠': '#94a3b8',
      '停滞': '#ef4444',
    },
    envStatusColors: {
      '居家': '#10b981',
      '生病': '#ef4444',
      '出差': '#3b82f6',
    },
    attrNames: {
      physique: '体魄',
      comprehension: '悟性',
      willpower: '心性',
      dexterity: '灵巧',
      perception: '神识',
    },
    attrColors: {
      physique: '#e57373',
      comprehension: '#64b5f6',
      willpower: '#ba68c8',
      dexterity: '#81c784',
      perception: '#ffb74d',
    },
  },

  onLoad() {
    this.setData({ version: app.globalData.version });
  },

  onShow() {
    if (!api.isLoggedIn()) return;
    this.loadData();
  },

  async loadData() {
    this.setData({ loading: true });
    try {
      const [charData, achievements, itemsData] = await Promise.all([
        api.get('/character'),
        api.get('/character/achievements').catch(() => []),
        api.get('/items').catch(() => ({ items: [], grouped: {} })),
      ]);

      const character = charData.character;
      character.name = character.name || (api.user && api.user.name) || '修仙者';
      const cultivationStatus = charData.cultivationStatus || null;
      const trend = charData.trend || null;
      const trendBars = this.buildTrendBars(trend);
      const recommendations = this.getRecommendations(character, trend, itemsData.grouped || {});

      // 预计算模板需要的值（WXML 不支持复杂表达式）
      const achievementsList = Array.isArray(achievements) ? achievements : [];
      const unlockedList = achievementsList.filter(a => a.unlocked);
      const attrs = ['physique', 'comprehension', 'willpower', 'dexterity', 'perception'];
      const attrNames = this.data.attrNames;
      const maxAttr = Math.max(...attrs.map(a => Number(character[a] || 0)), 1);
      const attrList = attrs.map(a => ({
        key: a,
        name: attrNames[a],
        value: Number(character[a] || 0),
        pct: Math.min(Math.round((Number(character[a] || 0) / maxAttr) * 100), 100),
      }));

      const legendItems = attrs.map(a => ({
        key: a,
        color: this.data.attrColors[a],
        short: attrNames[a][0],
        name: attrNames[a],
      }));

      // 预计算趋势柱 class 和高度
      for (const bar of trendBars) {
        bar.barHeightRpx = bar.barHeight * 2;
        bar.barClass = bar.isToday ? 'trend-bar-today' : '';
        bar.dayClass = bar.isToday ? 'trend-day-today' : 'trend-day';
        for (let bi = 0; bi < bar.blocks.length; bi++) {
          const block = bar.blocks[bi];
          const isTop = bi === bar.blocks.length - 1;
          const isBottom = bi === 0;
          if (isTop && isBottom) {
            block.radius = '8rpx';
          } else if (isTop) {
            block.radius = '8rpx 8rpx 0 0';
          } else if (isBottom) {
            block.radius = '0 0 8rpx 8rpx';
          } else {
            block.radius = '0';
          }
        }
      }

      // 预计算推荐项的 class
      if (recommendations && recommendations.type === 'weak' && recommendations.items) {
        recommendations.items.forEach((item, i) => {
          item.itemClass = i > 0 ? 'recommend-item recommend-item-border' : 'recommend-item';
        });
      }

      // 预计算成就项的 class 和标签
      achievementsList.forEach((item, i) => {
        item.achClass = i > 0 ? 'achievement-item achievement-item-border' : 'achievement-item';
        item.achOpacity = item.unlocked ? 1 : 0.5;
        item.achLabel = item.unlocked ? '已解锁' : '未解锁';
      });

      // 预计算 Hero 区域的颜色值
      const envColors = this.data.envStatusColors;
      const cvColors = this.data.statusColors;
      const envBadgeColor = envColors[character.status] || '#94a3b8';
      const cvLevelColor = cultivationStatus ? (cvColors[cultivationStatus.level] || '#94a3b8') : '#94a3b8';
      const cvLevelPrefix = cultivationStatus && cultivationStatus.level === '精进' ? '🔥 ' : '';

      this.setData({
        loading: false,
        character,
        cultivationStatus,
        achievements: achievementsList,
        unlockedCount: unlockedList.length,
        latestAchievement: unlockedList.length > 0 ? unlockedList[0].name : '',
        trend,
        trendBars,
        recommendations,
        itemsGrouped: itemsData.grouped || {},
        appVersion: charData.appVersion || '',
        attrList,
        legendItems,
        dropBonusText: cultivationStatus ? Math.round(cultivationStatus.dropBonus * 100) : 0,
        showDropBonus: cultivationStatus && cultivationStatus.dropBonus > 0,
        showBufferAdjust: cultivationStatus && cultivationStatus.bufferAdjust < 0,
        envBadgeColor,
        cvLevelColor,
        cvLevelPrefix,
      });

      // 绘制雷达图
      setTimeout(() => this.drawRadar(attrList), 100);
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: e.message, icon: 'none' });
    }
  },

  buildTrendBars(trend) {
    if (!trend || !trend.days) return [];
    const attrs = ['physique', 'comprehension', 'willpower', 'dexterity', 'perception'];
    const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

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

    return dailyData.map(d => {
      const isToday = d.day === today;
      const barHeight = d.total > 0 ? Math.max(Math.round((d.total / maxTotal) * 100), 4) : 2;
      const weekday = WEEKDAYS[new Date(`${d.day}T00:00:00`).getDay()];

      const blocks = [];
      if (d.total > 0) {
        for (const attr of attrs) {
          const pct = d.values[attr] > 0 ? Math.max(Math.round((d.values[attr] / d.total) * 100), 2) : 0;
          if (pct > 0) {
            blocks.push({ attr, pct, color: this.data.attrColors[attr] });
          }
        }
      }

      return {
        day: d.day,
        isToday,
        barHeight,
        weekday,
        total: d.total,
        totalText: d.total > 0 ? d.total.toFixed(1) : '',
        blocks,
      };
    });
  },

  getRecommendations(character, trend, grouped) {
    const attrs = ['physique', 'comprehension', 'willpower', 'dexterity', 'perception'];
    const ATTR_CATEGORY_MAP = {
      physique: { label: '体魄', category: '身体健康' },
      comprehension: { label: '悟性', category: '学习' },
      willpower: { label: '心性', category: '生活习惯' },
      dexterity: { label: '灵巧', category: '家务' },
      perception: { label: '神识', category: '社交互助' },
    };

    const allZero = attrs.every(a => Number(character[a] || 0) === 0);
    if (allZero) {
      const hasRecentBehavior = trend && trend.days && Object.values(trend.byAttribute || {}).some(
        byAttr => byAttr.counts && byAttr.counts.some(c => c > 0)
      );
      if (hasRecentBehavior) {
        const canSynthesize = Object.values(grouped).some(g => g.totalTempValue >= 10);
        if (canSynthesize) return { type: 'synthesize' };
        return { type: 'more_behaviors' };
      }
      return { type: 'first_behavior' };
    }

    const values = attrs.map(a => Number(character[a] || 0));
    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    const threshold = avg * 0.7;

    let weak = attrs
      .filter(a => Number(character[a] || 0) < threshold)
      .sort((a, b) => Number(character[a] || 0) - Number(character[b] || 0))
      .slice(0, 2);

    if (weak.length === 0) {
      const lowest = attrs.reduce((min, a) => (Number(character[a] || 0) < Number(character[min] || 0) ? a : min), attrs[0]);
      weak = [lowest];
    }

    return { type: 'weak', items: weak.map(a => ATTR_CATEGORY_MAP[a]) };
  },

  drawRadar(attrList) {
    const query = this.createSelectorQuery();
    query.select('#radarCanvas').fields({ node: true, size: true }).exec((res) => {
      if (!res || !res[0] || !res[0].node) return;
      const canvas = res[0].node;
      const ctx = canvas.getContext('2d');
      const dpr = wx.getWindowInfo().pixelRatio;
      const w = res[0].width;
      const h = res[0].height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);

      // 标题绘制在左上角
      ctx.font = '600 13px -apple-system, sans-serif';
      ctx.fillStyle = '#f8fafc';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('属性总览', 16, 10);

      const cx = w / 2;
      const cy = h / 2 + 4;
      const r = Math.min(cx, cy - 16) * 0.72;
      const n = attrList.length;
      const maxVal = Math.max(...attrList.map(a => a.value), 1);
      const angles = attrList.map((_, i) => (Math.PI * 2 * i) / n - Math.PI / 2);
      const attrColors = ['#e57373', '#64b5f6', '#ba68c8', '#81c784', '#ffb74d'];

      // 背景填充（3层渐变）
      for (let level = 3; level >= 1; level--) {
        const lr = (r * level) / 3;
        ctx.beginPath();
        for (let i = 0; i <= n; i++) {
          const a = angles[i % n];
          const x = cx + lr * Math.cos(a);
          const y = cy + lr * Math.sin(a);
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = level === 3 ? 'rgba(30, 30, 50, 0.8)' : level === 2 ? 'rgba(37, 37, 64, 0.6)' : 'rgba(50, 50, 80, 0.4)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(100, 116, 139, 0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // 轴线
      ctx.strokeStyle = 'rgba(100, 116, 139, 0.25)';
      ctx.lineWidth = 1;
      for (let i = 0; i < n; i++) {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + r * Math.cos(angles[i]), cy + r * Math.sin(angles[i]));
        ctx.stroke();
      }

      // 数据区域 - 渐变填充
      const values = attrList.map(a => Math.max((a.value / maxVal) * r, r * 0.05));
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const idx = i % n;
        const x = cx + values[idx] * Math.cos(angles[idx]);
        const y = cy + values[idx] * Math.sin(angles[idx]);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      gradient.addColorStop(0, 'rgba(139, 92, 246, 0.4)');
      gradient.addColorStop(1, 'rgba(139, 92, 246, 0.1)');
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.strokeStyle = '#a78bfa';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = 'rgba(139, 92, 246, 0.6)';
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 数据点 - 带发光
      for (let i = 0; i < n; i++) {
        const x = cx + values[i] * Math.cos(angles[i]);
        const y = cy + values[i] * Math.sin(angles[i]);
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(167, 139, 250, 0.4)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#c4b5fd';
        ctx.fill();
      }

      // 属性名 + 数值标签
      const labelR = r + 22;
      for (let i = 0; i < n; i++) {
        const x = cx + labelR * Math.cos(angles[i]);
        const y = cy + labelR * Math.sin(angles[i]);
        const color = attrColors[i] || '#94a3b8';

        ctx.font = 'bold 12px -apple-system, sans-serif';
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(attrList[i].name, x, y - 8);

        ctx.font = '11px -apple-system, sans-serif';
        ctx.fillStyle = attrList[i].value > 0 ? '#e2e8f0' : '#64748b';
        ctx.fillText(String(attrList[i].value), x, y + 8);
      }
    });
  },

  toggleAchievements() {
    this.setData({ achievementsExpanded: !this.data.achievementsExpanded });
  },

  showCultivationHelp() {
    wx.showModal({
      title: '修炼状态说明',
      content: '修炼状态根据最近7天活跃情况自动计算。\n\n🔥 精进：活跃≥6天+≥3类别，良品掉率+10%\n稳修：活跃≥4天，无加成无惩罚\n懈怠：活跃≥1天，衰退缓冲-5天\n停滞：0天活跃，衰退缓冲-10天\n\n衰退缓冲：属性停止增长后经过缓冲期才开始衰退，默认15天。',
      showCancel: false,
      confirmText: '知道了',
    });
  },

  showStatusPicker() {
    wx.showActionSheet({
      itemList: ['居家', '生病', '出差'],
      success: async (res) => {
        const status = ['居家', '生病', '出差'][res.tapIndex];
        try {
          await api.post('/character/status', { status });
          wx.showToast({ title: `已切换为${status}`, icon: 'success' });
          this.loadData();
        } catch (e) {
          wx.showToast({ title: e.message, icon: 'none' });
        }
      },
    });
  },

  goToBehavior(e) {
    const category = e?.currentTarget?.dataset?.category || '';
    if (category) {
      wx.switchTab({ url: '/pages/behavior/behavior' });
    } else {
      wx.switchTab({ url: '/pages/behavior/behavior' });
    }
  },

  goToInventory() {
    wx.switchTab({ url: '/pages/inventory/inventory' });
  },

  logout() {
    wx.showModal({
      title: '确认退出',
      content: '确定要退出登录吗？',
      success(res) {
        if (res.confirm) {
          api.clearAuth();
          wx.reLaunch({ url: '/pages/login/login' });
        }
      },
    });
  },
});
