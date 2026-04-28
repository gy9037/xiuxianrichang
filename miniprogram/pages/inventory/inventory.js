const api = require('../../utils/api');

const QUALITY_ORDER = ['极品', '上品', '良品', '凡品'];
const QUALITY_CLASS_MAP = { '凡品': 'quality-fan', '良品': 'quality-liang', '上品': 'quality-shang', '极品': 'quality-ji' };
const QUALITY_KEY_MAP = { '凡品': 'fan', '良品': 'liang', '上品': 'shang', '极品': 'ji' };
const SYNTH_THRESHOLD = 10;
const ATTR_NAMES = {
  physique: '体魄',
  comprehension: '悟性',
  willpower: '心性',
  dexterity: '灵巧',
  perception: '神识',
};

Page({
  data: {
    // 主 Tab: items / rewards
    activeSection: 'items',

    // 道具数据
    items: [],
    grouped: {},
    attrTabs: [],        // [{key, name, count}]
    activeAttr: '',      // 当前属性 tab key
    displayItems: [],    // 当前分类下的道具（含 checked 字段）
    allChecked: false,

    // 合成摘要
    selectedCount: 0,
    selectedTotal: 0,
    canSynth: false,
    synthGain: 0,
    synthWaste: 0,
    synthProgressPct: 0,
    synthesizing: false,

    // 炼化成功弹窗
    showSynthModal: false,
    synthResult: null,

    // 奖励数据
    pendingRewards: [],
    redeemedRewards: [],
    redeemingId: '',

    // 炼化规则弹窗
    showRules: false,

    loading: true,
  },

  onShow() {
    if (!api.isLoggedIn()) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    const app = getApp();
    if (app.globalData.inventoryTab) {
      this.setData({ activeSection: app.globalData.inventoryTab });
      app.globalData.inventoryTab = null;
    }
    this.loadData();
  },

  // ========== 数据加载 ==========

  loadData() {
    this.setData({ loading: true });
    const section = this.data.activeSection;
    if (section === 'items') {
      this.loadItems();
    } else {
      this.loadRewards();
    }
  },

  loadItems() {
    api.get('/items').then(res => {
      const items = res.items || [];
      const grouped = res.grouped || {};

      // 构建属性 tab 列表，首位加"全部"
      const totalCount = items.length;
      const attrTabs = [{ key: 'all', name: '全部', count: totalCount }];
      Object.keys(grouped).forEach(key => {
        attrTabs.push({
          key: key,
          name: grouped[key].name,
          count: grouped[key].items.length,
        });
      });

      // 默认选中"全部"或保持当前选中
      const activeAttr = this.data.activeAttr && attrTabs.some(t => t.key === this.data.activeAttr)
        ? this.data.activeAttr
        : 'all';

      this.setData({
        items: items,
        grouped: grouped,
        attrTabs: attrTabs,
        activeAttr: activeAttr,
        loading: false,
      });

      this.refreshDisplayItems();
      this.checkFirstVisit();
    }).catch(err => {
      wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      this.setData({ loading: false });
    });
  },

  loadRewards() {
    api.get('/rewards').then(res => {
      const rewards = res || [];
      const pending = [];
      const redeemed = [];
      rewards.forEach(r => {
        if (r.status === 'redeemed') {
          redeemed.push(r);
        } else {
          pending.push(r);
        }
      });
      this.setData({
        pendingRewards: pending,
        redeemedRewards: redeemed,
        loading: false,
      });
    }).catch(err => {
      wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      this.setData({ loading: false });
    });
  },

  // ========== 道具列表与选中 ==========

  refreshDisplayItems() {
    const { grouped, activeAttr, items } = this.data;

    let raw;
    if (activeAttr === 'all') {
      // 全部模式：展示所有道具
      raw = items;
    } else if (activeAttr && grouped[activeAttr]) {
      raw = grouped[activeAttr].items || [];
    } else {
      raw = [];
    }

    const display = raw.map(item => ({
      id: item.id,
      name: item.name,
      quality: item.quality,
      qualityClass: QUALITY_CLASS_MAP[item.quality] || 'quality-fan',
      qualityKey: QUALITY_KEY_MAP[item.quality] || 'fan',
      attribute_type: item.attribute_type,
      temp_value: item.temp_value,
      checked: false,
    }));

    // 按品质排序
    display.sort((a, b) => {
      return QUALITY_ORDER.indexOf(a.quality) - QUALITY_ORDER.indexOf(b.quality);
    });

    this.setData({ displayItems: display, allChecked: false });
    this.updateSynthSummary();
  },

  onToggleItem(e) {
    const idx = e.currentTarget.dataset.index;
    const key = 'displayItems[' + idx + '].checked';
    const newVal = !this.data.displayItems[idx].checked;
    this.setData({ [key]: newVal });
    this.updateAllCheckedState();
    this.updateSynthSummary();
  },

  onToggleAll() {
    const { activeAttr, allChecked, displayItems } = this.data;

    if (allChecked) {
      // 取消全选
      const display = displayItems.map(item => ({ ...item, checked: false }));
      this.setData({ displayItems: display, allChecked: false });
      this.updateSynthSummary();
      return;
    }

    if (activeAttr === 'all') {
      // 智能全选：按属性分组，只勾选总值 >= 10 的属性组
      const attrTotals = {};
      for (const item of displayItems) {
        const attr = item.attribute_type;
        attrTotals[attr] = (attrTotals[attr] || 0) + item.temp_value;
      }
      const qualifiedAttrs = new Set();
      for (const [attr, total] of Object.entries(attrTotals)) {
        if (total >= SYNTH_THRESHOLD) qualifiedAttrs.add(attr);
      }
      const display = displayItems.map(item => ({
        ...item,
        checked: qualifiedAttrs.has(item.attribute_type),
      }));
      const anyChecked = display.some(item => item.checked);
      if (!anyChecked) {
        wx.showToast({ title: '没有属性总值达到10点', icon: 'none' });
      }
      this.setData({ displayItems: display, allChecked: display.every(item => item.checked) });
    } else {
      // 单属性 tab：全选所有
      const display = displayItems.map(item => ({ ...item, checked: true }));
      this.setData({ displayItems: display, allChecked: true });
    }
    this.updateSynthSummary();
  },

  updateAllCheckedState() {
    const all = this.data.displayItems.length > 0 &&
      this.data.displayItems.every(item => item.checked);
    this.setData({ allChecked: all });
  },

  updateSynthSummary() {
    const { displayItems, activeAttr } = this.data;
    const selected = displayItems.filter(item => item.checked);
    const count = selected.length;

    if (activeAttr === 'all' && count > 0) {
      // 全部模式：按属性分组计算
      const attrGroups = {};
      for (const item of selected) {
        const attr = item.attribute_type;
        if (!attrGroups[attr]) attrGroups[attr] = { total: 0, count: 0 };
        attrGroups[attr].total += item.temp_value;
        attrGroups[attr].count++;
      }
      let totalGain = 0;
      let totalWaste = 0;
      let totalValue = 0;
      let canSynth = false;
      for (const [, g] of Object.entries(attrGroups)) {
        totalValue += g.total;
        if (g.total >= SYNTH_THRESHOLD) {
          totalGain += Math.floor(g.total / SYNTH_THRESHOLD);
          totalWaste += g.total % SYNTH_THRESHOLD;
          canSynth = true;
        } else {
          totalWaste += g.total;
        }
      }
      this.setData({
        selectedCount: count,
        selectedTotal: totalValue,
        canSynth,
        synthGain: totalGain,
        synthWaste: totalWaste,
        synthProgressPct: canSynth ? 100 : 0,
      });
    } else {
      // 单属性模式
      const total = selected.reduce((sum, item) => sum + item.temp_value, 0);
      const gain = Math.floor(total / SYNTH_THRESHOLD);
      const waste = total % SYNTH_THRESHOLD;
      const canSynth = total >= SYNTH_THRESHOLD;
      const pct = canSynth ? 100 : Math.min(Math.round((total / SYNTH_THRESHOLD) * 100), 100);

      this.setData({
        selectedCount: count,
        selectedTotal: total,
        canSynth,
        synthGain: gain,
        synthWaste: waste,
        synthProgressPct: pct,
      });
    }
  },

  // ========== Tab 切换 ==========

  onSwitchSection(e) {
    const section = e.currentTarget.dataset.section;
    if (section === this.data.activeSection) return;
    this.setData({ activeSection: section });
    this.loadData();
  },

  onSwitchAttr(e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.activeAttr) return;
    this.setData({ activeAttr: key });
    this.refreshDisplayItems();
  },

  // ========== 合成 ==========

  onSynthesize() {
    if (this.data.synthesizing || !this.data.canSynth) return;

    const { selectedCount, synthGain, synthWaste } = this.data;
    let msg = '确定要合成 ' + selectedCount + ' 件道具？\n将获得 +' + synthGain + ' 永久属性';
    if (synthWaste > 0) {
      msg += '\n（' + synthWaste + ' 点将被浪费）';
    }

    wx.showModal({
      title: '确认合成',
      content: msg,
      success: (res) => {
        if (res.confirm) {
          this.doSynthesize();
        }
      },
    });
  },

  doSynthesize() {
    const ids = this.data.displayItems
      .filter(item => item.checked)
      .map(item => item.id);

    this.setData({ synthesizing: true });

    api.post('/items/synthesize', { item_ids: ids }).then(res => {
      this.setData({
        synthesizing: false,
        showSynthModal: true,
        synthResult: {
          gain: res.gain || 0,
          attrName: res.attribute || ATTR_NAMES[res.attribute_type] || '',
          newValue: res.newValue || 0,
        },
      });
    }).catch(err => {
      wx.showToast({ title: err.message || '合成失败', icon: 'none' });
      this.setData({ synthesizing: false });
    });
  },

  // ========== 奖励兑现 ==========

  onRedeemReward(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name;
    if (this.data.redeemingId) return;

    wx.showModal({
      title: '确认兑现',
      content: '确定要兑现「' + name + '」吗？',
      success: (res) => {
        if (res.confirm) {
          this.doRedeem(id);
        }
      },
    });
  },

  doRedeem(id) {
    this.setData({ redeemingId: id });
    api.post('/rewards/' + id + '/redeem').then(() => {
      wx.showToast({ title: '兑现成功', icon: 'success' });
      this.setData({ redeemingId: '' });
      this.loadRewards();
    }).catch(err => {
      wx.showToast({ title: err.message || '兑现失败', icon: 'none' });
      this.setData({ redeemingId: '' });
    });
  },

  // ========== 炼化规则弹窗 ==========

  checkFirstVisit() {
    const seen = wx.getStorageSync('inventory_rules_seen');
    if (!seen) {
      this.setData({ showRules: true });
      wx.setStorageSync('inventory_rules_seen', '1');
    }
  },

  onShowRules() {
    this.setData({ showRules: true });
  },

  onCloseRules() {
    this.setData({ showRules: false });
  },

  closeSynthModal() {
    this.setData({ showSynthModal: false, synthResult: null });
    this.loadData();
  },

  // ========== 导航 ==========

  onGoReport() {
    wx.switchTab({ url: '/pages/behavior/behavior' });
  },
});
