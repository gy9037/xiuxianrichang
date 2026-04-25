const api = require('../../utils/api');

const ATTR_FIELDS = ['physique', 'comprehension', 'willpower', 'dexterity', 'perception'];
const ATTR_NAMES = {
  physique: '体魄',
  comprehension: '悟性',
  willpower: '心性',
  dexterity: '灵巧',
  perception: '神识',
};
const ATTR_COLORS = {
  physique: '#e57373',
  comprehension: '#64b5f6',
  willpower: '#ba68c8',
  dexterity: '#81c784',
  perception: '#ffb74d',
};
const QUALITY_COLOR_CLASS = {
  凡品: 'quality-fan',
  良品: 'quality-liang',
  上品: 'quality-shang',
  极品: 'quality-ji',
};
const TYPE_LABELS = { monthly: '月报', quarterly: '季报', yearly: '年报' };
const MONTH_NAMES = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];

Page({
  data: {
    loading: true,
    reports: [],
    currentReport: null,
    canvasReady: false,
    attrDisplay: [],
    itemQualityDisplay: [],
  },

  onLoad() {
    this.loadReportList();
  },

  async loadReportList() {
    this.setData({ loading: true });
    try {
      const res = await api.get('/report/list');
      const reports = (res.reports || []).map((r) => ({
        ...r,
        typeLabel: TYPE_LABELS[r.type] || r.type,
        periodLabel: this.formatPeriodLabel(r.type, r.period_key),
      }));
      this.setData({ reports, loading: false });
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
    }
  },

  formatPeriodLabel(type, periodKey) {
    if (type === 'monthly') {
      const [y, m] = periodKey.split('-');
      return `${y}年${MONTH_NAMES[parseInt(m, 10)]}月`;
    }
    if (type === 'quarterly') {
      const [y, q] = periodKey.split('-');
      return `${y}年第${q.replace('Q', '')}季度`;
    }
    if (type === 'yearly') {
      return `${periodKey}年`;
    }
    return periodKey;
  },

  async viewReport(e) {
    const id = e.currentTarget.dataset.id;
    wx.showLoading({ title: '加载中' });
    try {
      const report = await api.get(`/report/${id}`);
      const attrDisplay = this.buildAttrDisplay(report.data.attrGrowth);
      const itemQualityDisplay = this.buildItemQualityDisplay(report.data.itemStats);

      this.setData({
        currentReport: report,
        canvasReady: false,
        attrDisplay,
        itemQualityDisplay,
      });
      wx.hideLoading();

      setTimeout(() => this.initCanvas(), 300);
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
    }
  },

  buildAttrDisplay(attrGrowth) {
    if (!attrGrowth) return [];
    const maxVal = Math.max(...ATTR_FIELDS.map((f) => attrGrowth[f] || 0), 1);
    return ATTR_FIELDS.map((f) => ({
      key: f,
      name: ATTR_NAMES[f],
      value: attrGrowth[f] || 0,
      pct: Math.min(Math.round(((attrGrowth[f] || 0) / maxVal) * 100), 100),
      color: ATTR_COLORS[f],
    }));
  },

  buildItemQualityDisplay(itemStats) {
    if (!itemStats || !itemStats.byQuality) return [];
    return Object.entries(itemStats.byQuality).map(([quality, count]) => ({
      quality,
      count,
      colorClass: QUALITY_COLOR_CLASS[quality] || 'text-dim',
    }));
  },

  backToList() {
    this.setData({ currentReport: null, canvasReady: false });
    this.canvas = null;
  },

  toggleView() {
    if (this.data.canvasReady) {
      this.setData({ canvasReady: false });
    } else {
      this.initCanvas();
    }
  },

  initCanvas() {
    const query = wx.createSelectorQuery();
    query.select('#reportCanvas').fields({ node: true, size: true }).exec((res) => {
      if (!res || !res[0] || !res[0].node) {
        return;
      }
      const canvas = res[0].node;
      this.canvas = canvas;
      const ctx = canvas.getContext('2d');
      canvas.width = 750;
      canvas.height = 1000;

      try {
        this.drawReportCard(ctx, this.data.currentReport);
        this.setData({ canvasReady: true });
      } catch (e) {
        console.error('Canvas 绘制失败:', e);
        this.setData({ canvasReady: false });
      }
    });
  },

  drawReportCard(ctx, report) {
    const data = report.data;
    const type = data.type;

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, 750, 1000);

    ctx.fillStyle = '#8b5cf6';
    ctx.fillRect(0, 0, 750, 6);

    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';

    let title = '';
    if (type === 'monthly') title = `${MONTH_NAMES[data.month]}月修炼月报`;
    else if (type === 'quarterly') title = `${data.year}年第${data.quarter}季度总览`;
    else if (type === 'yearly') title = `${data.year}年修炼年报`;
    ctx.fillText(title, 375, 60);

    let y = 90;
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(40, y);
    ctx.lineTo(710, y);
    ctx.stroke();

    y = 130;
    ctx.fillStyle = '#f1f5f9';
    ctx.font = '24px sans-serif';
    const activeDays = data.activeDays || data.totalActiveDays;
    ctx.fillText(`修炼天数 ${activeDays} 天 / ${data.totalDays} 天  ·  ${data.rating.level}`, 375, y);

    if (data.bestMonth) {
      y += 40;
      ctx.fillStyle = '#94a3b8';
      ctx.font = '22px sans-serif';
      ctx.fillText(`最强月份：${data.bestMonth.month}月（${data.bestMonth.activeDays}天活跃）`, 375, y);
    }

    y += 30;
    ctx.strokeStyle = '#334155';
    ctx.beginPath();
    ctx.moveTo(40, y);
    ctx.lineTo(710, y);
    ctx.stroke();

    y += 35;
    ctx.fillStyle = '#f1f5f9';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('属性成长', 40, y);

    const maxAttr = Math.max(...ATTR_FIELDS.map((f) => data.attrGrowth[f] || 0), 1);
    y += 10;
    for (const f of ATTR_FIELDS) {
      y += 35;
      const val = data.attrGrowth[f] || 0;
      const barWidth = Math.round((val / maxAttr) * 400);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(ATTR_NAMES[f], 40, y);

      ctx.fillStyle = '#252540';
      ctx.fillRect(130, y - 14, 420, 18);

      ctx.fillStyle = ATTR_COLORS[f];
      ctx.fillRect(130, y - 14, barWidth, 18);

      ctx.fillStyle = '#f59e0b';
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`+${val}`, 560, y);
    }

    y += 30;
    ctx.strokeStyle = '#334155';
    ctx.beginPath();
    ctx.moveTo(40, y);
    ctx.lineTo(710, y);
    ctx.stroke();

    y += 35;
    ctx.fillStyle = '#f1f5f9';
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'center';
    if (data.bestStreak && data.bestStreak.days > 0) {
      ctx.fillText(`最长坚持  ${data.bestStreak.subType} · 连续 ${data.bestStreak.days} 天`, 375, y);
      y += 35;
    }

    const qualityParts = [];
    for (const [q, c] of Object.entries(data.itemStats.byQuality || {})) {
      qualityParts.push(`${q} ${c}`);
    }
    ctx.fillText(`道具收获  共 ${data.itemStats.total} 件  ${qualityParts.join(' · ')}`, 375, y);

    if (data.bossStats && data.bossStats.total > 0) {
      y += 35;
      ctx.fillText(`Boss 战绩  挑战 ${data.bossStats.total} 次 · 胜率 ${data.bossStats.winRate}%`, 375, y);
    }

    y += 30;
    ctx.strokeStyle = '#334155';
    ctx.beginPath();
    ctx.moveTo(40, y);
    ctx.lineTo(710, y);
    ctx.stroke();

    y += 40;
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'italic 24px sans-serif';
    ctx.textAlign = 'center';
    const motto = data.motto || data.rating.flavor || '';
    if (motto) {
      ctx.fillText(`「${motto}」`, 375, y);
    }

    ctx.fillStyle = '#475569';
    ctx.font = '18px sans-serif';
    ctx.fillText('修仙日常', 375, 970);
  },

  saveToAlbum() {
    if (!this.canvas) {
      wx.showToast({ title: '图卡未就绪', icon: 'none' });
      return;
    }

    wx.canvasToTempFilePath({
      canvas: this.canvas,
      success(res) {
        wx.saveImageToPhotosAlbum({
          filePath: res.tempFilePath,
          success() {
            wx.showToast({ title: '已保存到相册', icon: 'success' });
          },
          fail(err) {
            if (err.errMsg && err.errMsg.includes('auth deny')) {
              wx.showToast({ title: '请授权相册权限', icon: 'none' });
            } else {
              wx.showToast({ title: '保存失败', icon: 'none' });
            }
          },
        });
      },
      fail() {
        wx.showToast({ title: '生成图片失败', icon: 'none' });
      },
    });
  },
});
