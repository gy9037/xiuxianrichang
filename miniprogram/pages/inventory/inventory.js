const api = require('../../utils/api');

const QUALITY_ORDER = ['极品', '上品', '良品', '凡品'];
const QUALITY_CLASS_MAP = { '凡品': 'quality-fan', '良品': 'quality-liang', '上品': 'quality-shang', '极品': 'quality-ji' };
const SYNTH_THRESHOLD = 10;

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
    synthesizing: false,

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

      // 构建属性 tab 列表
      const attrTabs = Object.keys(grouped).map(key => ({
        key: key,
        name: grouped[key].name,
        count: grouped[key].items.length,
      }));

      // 默认选中第一个属性
      const activeAttr = attrTabs.length > 0
        ? (this.data.activeAttr && attrTabs.some(t => t.key === this.data.activeAttr)
          ? this.data.activeAttr
          : attrTabs[0].key)
        : '';

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
    const { grouped, activeAttr } = this.data;
    if (!activeAttr || !grouped[activeAttr]) {
      this.setData({
        displayItems: [],
        allChecked: false,
        selectedCount: 0,
        selectedTotal: 0,
        canSynth: false,
        synthGain: 0,
        synthWaste: 0,
      });
      return;
    }

    const raw = grouped[activeAttr].items || [];
    const display = raw.map(item => ({
      id: item.id,
      name: item.name,
      quality: item.quality,
      qualityClass: QUALITY_CLASS_MAP[item.quality] || 'quality-fan',
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
    const newVal = !this.data.allChecked;
    const display = this.data.displayItems.map(item => {
      item.checked = newVal;
      return item;
    });
    this.setData({ displayItems: display, allChecked: newVal });
    this.updateSynthSummary();
  },

  updateAllCheckedState() {
    const all = this.data.displayItems.length > 0 &&
      this.data.displayItems.every(item => item.checked);
    this.setData({ allChecked: all });
  },

  updateSynthSummary() {
    const selected = this.data.displayItems.filter(item => item.checked);
    const count = selected.length;
    const total = selected.reduce((sum, item) => sum + item.temp_value, 0);
    const gain = Math.floor(total / SYNTH_THRESHOLD);
    const waste = total % SYNTH_THRESHOLD;
    const canSynth = total >= SYNTH_THRESHOLD;

    this.setData({
      selectedCount: count,
      selectedTotal: total,
      canSynth: canSynth,
      synthGain: gain,
      synthWaste: waste,
    });
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
      const msg = res.attribute + ' +' + res.gain + '（当前 ' + res.newValue + '/' + res.cap + '）';
      wx.showToast({ title: msg, icon: 'none', duration: 2500 });
      this.setData({ synthesizing: false });
      this.loadItems();
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

  // ========== 导航 ==========

  onGoReport() {
    wx.switchTab({ url: '/pages/behavior/behavior' });
  },
});
