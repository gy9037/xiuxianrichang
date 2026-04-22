const api = require('../../utils/api');

const ATTR_NAMES = {
  physique: '体魄',
  comprehension: '悟性',
  willpower: '心性',
  dexterity: '灵巧',
  perception: '神识',
};
const ATTR_KEYS = ['physique', 'comprehension', 'willpower', 'dexterity', 'perception'];
const ATTR_COLORS = {
  physique: '#e57373',
  comprehension: '#64b5f6',
  willpower: '#ba68c8',
  dexterity: '#81c784',
  perception: '#ffb74d',
};

const TYPE_OPTIONS = ['单人', '团队'];
const STATUS_LABELS = {
  pending: '待挑战',
  in_progress: '进行中',
  completed: '已完成',
  redeemed: '已兑现',
};

Page({
  data: {
    // 视图状态: list / create / battle / result
    view: 'list',
    loading: true,
    submitting: false,

    // --- 列表视图 ---
    wishes: [],
    filteredWishes: [],
    pendingWishes: [],
    completedWishes: [],
    showFilter: false,
    filterExpanded: false,
    filterType: '',
    filterStatus: '',
    filterTypeLabel: '全部',
    filterStatusLabel: '全部',

    // --- 创建视图 ---
    formName: '',
    formNameLen: 0,
    formTypeIndex: 0,
    formType: '单人',
    formDifficulty: 5,
    formReward: '',
    formRewardLen: 0,
    formDesc: '',
    formDescExpanded: false,
    typeOptions: TYPE_OPTIONS,
    difficultyAnchors: [
      { val: 1, label: '随手' },
      { val: 3, label: '简单' },
      { val: 5, label: '适中' },
      { val: 7, label: '困难' },
      { val: 10, label: '极限' },
    ],

    // --- 战斗视图 ---
    battleWish: null,
    boss: null,
    bossAttrList: [],
    character: null,
    charAttrList: [],
    userPower: 0,
    items: [],
    selectedItemIds: [],
    itemBonusTotal: 0,
    winRateText: '',
    winRateColor: '',

    // --- 结果视图 ---
    battleResult: null,
    visibleRounds: [],
    roundsComplete: false,
    resultBoss: null,
    resultBossAttrList: [],
    resultDetail: null,
    resultIsWin: false,
    attrComparison: [],
  },

  onShow() {
    if (!api.isLoggedIn()) return;
    if (this.data.view === 'list') {
      this.loadWishes();
    }
  },

  // ========== 数据加载 ==========

  async loadWishes() {
    this.setData({ loading: true });
    try {
      const wishes = await api.get('/wishes');
      const userId = api.user?.id;
      const processed = (wishes || []).map(w => this._processWish(w, userId));
      this.setData({ wishes: processed, loading: false });
      this._applyFilter();
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
    }
  },

  _processWish(w, userId) {
    const canChallenge = this._canChallenge(w, userId);
    const stars = [];
    for (let i = 0; i < 10; i++) {
      stars.push({ filled: i < w.difficulty });
    }
    const isTeam = w.type === '团队';
    const teamTotal = isTeam && w.teamProgress ? w.teamProgress.length : 0;
    const teamDone = isTeam && w.teamProgress ? w.teamProgress.filter(t => t.status === 'completed').length : 0;
    const bossMin = w.bossEstimate ? w.bossEstimate.min : 0;
    const bossMax = w.bossEstimate ? w.bossEstimate.max : 0;
    const statusLabel = STATUS_LABELS[w.status] || w.status;
    const STATUS_COLORS = { 'pending': '#f59e0b', 'in_progress': '#3b82f6', 'completed': '#10b981', 'redeemed': '#94a3b8' };
    const statusColor = STATUS_COLORS[w.status] || '#94a3b8';
    const isCompleted = w.status === 'completed';
    const isRedeemed = w.status === 'redeemed';
    const isPending = w.status === 'pending' || w.status === 'in_progress';
    const myProgress = isTeam && w.teamProgress
      ? w.teamProgress.find(t => t.id === userId)
      : null;
    const myTeamStatus = myProgress ? myProgress.status : '';
    const myTeamDone = myTeamStatus === 'completed';

    return {
      ...w,
      canChallenge,
      stars,
      isTeam,
      teamTotal,
      teamDone,
      bossMin,
      bossMax,
      statusLabel,
      statusColor,
      isCompleted,
      isRedeemed,
      isPending,
      myTeamDone,
    };
  },

  _canChallenge(w, userId) {
    if (w.status === 'completed' || w.status === 'redeemed') return false;
    if (w.type === '单人' && w.target_user_id !== userId) return false;
    if (w.type === '团队' && w.teamProgress) {
      const me = w.teamProgress.find(t => t.id === userId);
      if (me && me.status === 'completed') return false;
    }
    return true;
  },

  // ========== 筛选 ==========

  _applyFilter() {
    const { wishes, filterType, filterStatus } = this.data;
    let filtered = wishes;
    if (filterType) {
      filtered = filtered.filter(w => w.type === filterType);
    }
    if (filterStatus) {
      const statusMap = { '待挑战': ['pending', 'in_progress'], '进行中': ['in_progress'], '已完成': ['completed'], '已兑现': ['redeemed'] };
      const allowed = statusMap[filterStatus] || [];
      filtered = filtered.filter(w => allowed.includes(w.status));
    }
    const pendingWishes = filtered.filter(w => w.isPending);
    const completedWishes = filtered.filter(w => w.isCompleted || w.isRedeemed);
    const showFilter = wishes.length > 5;
    this.setData({ filteredWishes: filtered, pendingWishes, completedWishes, showFilter });
  },

  toggleFilter() {
    this.setData({ filterExpanded: !this.data.filterExpanded });
  },

  setFilterType(e) {
    const val = e.currentTarget.dataset.val || '';
    const label = val || '全部';
    this.setData({ filterType: val, filterTypeLabel: label });
    this._applyFilter();
  },

  setFilterStatus(e) {
    const val = e.currentTarget.dataset.val || '';
    const label = val || '全部';
    this.setData({ filterStatus: val, filterStatusLabel: label });
    this._applyFilter();
  },

  clearFilter() {
    this.setData({ filterType: '', filterStatus: '', filterTypeLabel: '全部', filterStatusLabel: '全部' });
    this._applyFilter();
  },

  // ========== 创建愿望 ==========

  goCreate() {
    this.setData({
      view: 'create',
      formName: '',
      formNameLen: 0,
      formTypeIndex: 0,
      formType: '单人',
      formDifficulty: 5,
      formReward: '',
      formRewardLen: 0,
      formDesc: '',
      formDescExpanded: false,
      submitting: false,
    });
  },

  onFormNameInput(e) {
    const val = e.detail.value || '';
    this.setData({ formName: val, formNameLen: val.length });
  },

  onFormTypeChange(e) {
    const idx = Number(e.detail.value);
    this.setData({ formTypeIndex: idx, formType: TYPE_OPTIONS[idx] });
  },

  onFormDifficultyChange(e) {
    this.setData({ formDifficulty: Number(e.detail.value) });
  },

  onFormRewardInput(e) {
    const val = e.detail.value || '';
    this.setData({ formReward: val, formRewardLen: val.length });
  },

  onFormDescInput(e) {
    this.setData({ formDesc: e.detail.value || '' });
  },

  toggleDescExpand() {
    this.setData({ formDescExpanded: !this.data.formDescExpanded });
  },

  async submitWish() {
    const { formName, formType, formDifficulty, formReward, formDesc, submitting } = this.data;
    if (submitting) return;
    if (!formName.trim()) {
      wx.showToast({ title: '请输入愿望名称', icon: 'none' });
      return;
    }
    if (!formReward.trim()) {
      wx.showToast({ title: '请输入奖励描述', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    try {
      const body = {
        name: formName.trim(),
        type: formType,
        difficulty: formDifficulty,
        reward_description: formReward.trim(),
      };
      if (formDesc.trim()) body.description = formDesc.trim();
      await api.post('/wishes', body);
      wx.showToast({ title: '许愿成功', icon: 'success' });
      this.setData({ view: 'list', submitting: false });
      this.loadWishes();
    } catch (e) {
      this.setData({ submitting: false });
      wx.showToast({ title: e.message || '创建失败', icon: 'none' });
    }
  },

  // ========== Boss 战斗准备 ==========

  async goChallenge(e) {
    const wishId = e.currentTarget.dataset.id;
    const wish = this.data.wishes.find(w => w.id === wishId);
    if (!wish) return;

    this.setData({ view: 'battle', loading: true, battleWish: wish, boss: null, character: null, items: [], selectedItemIds: [], itemBonusTotal: 0 });

    try {
      const [bossData, charData, itemsData] = await Promise.all([
        api.post('/battle/prepare', { wish_id: wishId }),
        api.get('/character'),
        api.get('/items').catch(() => ({ items: [] })),
      ]);

      const boss = bossData.boss;
      const character = charData.character;
      const items = (itemsData.items || []).filter(it => it.temp_value > 0);

      const bossTotal = boss.total_power || 0;
      const bossAttrList = this._buildAttrList(boss, bossTotal);

      const userPower = ATTR_KEYS.reduce((s, k) => s + Number(character[k] || 0), 0);
      const charAttrList = this._buildAttrList(character, userPower);

      const winRate = this._calcWinRate(userPower, bossTotal);

      this.setData({
        loading: false,
        boss,
        bossAttrList,
        character,
        charAttrList,
        userPower,
        items: items.map(it => ({
          ...it,
          attrLabel: ATTR_NAMES[it.attribute_type] || it.attribute_type,
          checked: false,
        })),
        selectedItemIds: [],
        itemBonusTotal: 0,
        winRateText: winRate.text,
        winRateColor: winRate.color,
      });
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: e.message || '准备失败', icon: 'none' });
      this.backToList();
    }
  },

  _buildAttrList(entity, total) {
    const maxVal = Math.max(...ATTR_KEYS.map(k => Number(entity[k] || 0)), 1);
    return ATTR_KEYS.map(k => {
      const val = Number(entity[k] || 0);
      return {
        key: k,
        name: ATTR_NAMES[k],
        value: val,
        pct: Math.min(Math.round((val / maxVal) * 100), 100),
        color: ATTR_COLORS[k],
      };
    });
  },

  _calcWinRate(userPower, bossPower) {
    if (bossPower <= 0) return { text: '胜算十成', color: '#10b981' };
    const ratio = userPower / bossPower;
    if (ratio >= 0.9) return { text: '胜算十成', color: '#10b981' };
    if (ratio >= 0.7) return { text: '胜算七成', color: '#10b981' };
    if (ratio >= 0.5) return { text: '胜算五成', color: '#f59e0b' };
    if (ratio >= 0.3) return { text: '胜算三成', color: '#f59e0b' };
    return { text: '胜算渺茫', color: '#ef4444' };
  },

  toggleItem(e) {
    const itemId = e.currentTarget.dataset.id;
    let { selectedItemIds, items } = this.data;
    const idx = selectedItemIds.indexOf(itemId);
    if (idx >= 0) {
      selectedItemIds.splice(idx, 1);
    } else {
      selectedItemIds.push(itemId);
    }
    let bonusTotal = 0;
    const updatedItems = items.map(it => {
      const checked = selectedItemIds.includes(it.id);
      if (checked) bonusTotal += Number(it.temp_value || 0);
      return { ...it, checked };
    });

    const totalPower = this.data.userPower + bonusTotal;
    const bossTotal = this.data.boss ? this.data.boss.total_power || 0 : 0;
    const winRate = this._calcWinRate(totalPower, bossTotal);

    this.setData({
      selectedItemIds: [...selectedItemIds],
      items: updatedItems,
      itemBonusTotal: bonusTotal,
      winRateText: winRate.text,
      winRateColor: winRate.color,
    });
  },

  // ========== 执行战斗 ==========

  async executeBattle() {
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    try {
      const res = await api.post('/battle/execute', {
        boss_id: this.data.boss.id,
        equipped_item_ids: this.data.selectedItemIds,
      });

      const result = res.result;
      const boss = res.boss || this.data.boss;
      const isWin = result.result === 'win';

      const bossTotal = boss.total_power || 0;
      const resultBossAttrList = this._buildAttrList(boss, bossTotal);

      // 属性对比（失败时用）
      let attrComparison = [];
      if (!isWin) {
        attrComparison = ATTR_KEYS.map(k => {
          const userVal = Number(this.data.character[k] || 0);
          const bossVal = Number(boss[k] || 0);
          const diff = userVal - bossVal;
          return {
            key: k,
            name: ATTR_NAMES[k],
            userVal,
            bossVal,
            diff,
            diffAbs: Math.abs(diff).toFixed(1),
            isWeak: diff < 0,
            diffLabel: diff >= 0 ? '+' + diff.toFixed(1) : diff.toFixed(1),
            diffColor: diff >= 0 ? '#10b981' : '#ef4444',
          };
        });
      }

      this.setData({
        view: 'result',
        submitting: false,
        battleResult: result,
        resultBoss: boss,
        resultBossAttrList,
        resultIsWin: isWin,
        resultDetail: {
          userBasePower: result.user_base_power,
          userItemPower: result.user_item_power,
          userFinalPower: result.user_final_power,
          bossPower: result.boss_power,
          isCritical: result.is_critical,
          critDamage: result.crit_damage,
          isCombo: result.is_combo,
          damageReduction: result.damage_reduction,
        },
        attrComparison,
        visibleRounds: [],
        roundsComplete: false,
      });

      // 逐条显示战斗回合
      this._animateRounds(result.rounds || []);
    } catch (e) {
      this.setData({ submitting: false });
      wx.showToast({ title: e.message || '战斗失败', icon: 'none' });
    }
  },

  _animateRounds(rounds) {
    if (!rounds.length) {
      this.setData({ roundsComplete: true });
      return;
    }
    let i = 0;
    const next = () => {
      if (i >= rounds.length) {
        this.setData({ roundsComplete: true });
        return;
      }
      const round = rounds[i];
      const visible = this.data.visibleRounds.concat([round]);
      this.setData({ visibleRounds: visible });
      i++;
      setTimeout(next, 600);
    };
    next();
  },

  // ========== 兑现奖励 ==========

  async redeemWish(e) {
    const wishId = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认兑现',
      content: '确定要兑现这个愿望的奖励吗？',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await api.post(`/rewards/${wishId}/redeem`);
          wx.showToast({ title: '兑现成功', icon: 'success' });
          this.loadWishes();
        } catch (e) {
          wx.showToast({ title: e.message || '兑现失败', icon: 'none' });
        }
      },
    });
  },

  // ========== 导航 ==========

  backToList() {
    this.setData({ view: 'list' });
    this.loadWishes();
  },

  goToRewards() {
    const app = getApp();
    app.globalData.inventoryTab = 'rewards';
    wx.switchTab({ url: '/pages/inventory/inventory' });
  },

  backFromResult() {
    this.setData({ view: 'list', battleResult: null, visibleRounds: [], roundsComplete: false });
    this.loadWishes();
  },
});
