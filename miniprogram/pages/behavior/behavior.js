const api = require('../../utils/api');

const INTENSITY_OPTIONS = ['低强度', '热身', '高强度', '拉伸'];
const QUALITY_CLASS_MAP = { '凡品': 'quality-fan', '良品': 'quality-liang', '上品': 'quality-shang', '极品': 'quality-ji' };
const ATTR_NAMES = {
  physique: '体魄',
  comprehension: '悟性',
  willpower: '心性',
  dexterity: '灵巧',
  perception: '神识',
};

Page({
  data: {
    // Tab
    activeTab: 'report', // report | history

    // 上报流程
    step: 'category', // category | subtype | form
    categories: {},
    categoryList: [],
    selectedCategory: '',
    subtypeList: [],
    selectedSubtype: '',
    description: '',
    intensity: '',
    intensityIndex: -1,
    wakeupTime: '',
    showWakeupInput: false,
    submitting: false,

    // 快捷入口
    shortcuts: [],
    lastBehavior: null,
    showPinMenu: false,
    pinMenuTarget: null,
    pinnedBehaviors: [],

    // 最近记录
    recentList: [],
    showRecent: false,

    // 打卡奖励弹窗
    showRewardModal: false,
    rewardData: null,

    // 月度目标
    showGoalPanel: false,
    monthlyGoals: [],
    newGoalSubType: '',
    newGoalCount: '',

    // 自定义行为
    showCustomInput: false,
    customName: '',

    // 历史 Tab
    weeklySummary: null,
    calendarYear: 0,
    calendarMonth: 0,
    calendarMonthLabel: '',
    calendarDays: [],
    historyMap: {},
    selectedDate: '',
    selectedDateRecords: [],

    // 辅助
    isHealthCategory: false,
    isWakeup: false,
  },

  onShow() {
    if (!api.isLoggedIn()) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    const app = getApp();
    if (app.globalData.openGoalManage) {
      this.setData({ activeTab: 'report', showGoalPanel: true });
      app.globalData.openGoalManage = null;
    }
    this.loadReportData();
    this.loadMonthlyGoals();
  },

  // ========== Tab 切换 ==========
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
    if (tab === 'history') {
      this.loadWeeklySummary();
      if (!this.data.calendarYear) {
        const now = new Date();
        this.setData({
          calendarYear: now.getFullYear(),
          calendarMonth: now.getMonth() + 1,
        });
      }
      this.loadCalendar();
    }
  },

  // ========== 上报 Tab 数据加载 ==========
  loadReportData() {
    this.loadCategories();
    this.loadShortcuts();
    this.loadLastBehavior();
    this.loadRecentList();
    if (this.data.showGoalPanel) this.loadMonthlyGoals();
  },

  loadCategories() {
    api.get('/behavior/categories').then(data => {
      const categoryList = Object.keys(data);
      this.setData({ categories: data, categoryList });
    }).catch(() => {});
  },

  loadShortcuts() {
    api.get('/behavior/shortcuts').then(data => {
      const shortcuts = data || [];
      const pinnedBehaviors = shortcuts.filter(s => s.pinned).map(s => ({
        category: s.category,
        sub_type: s.sub_type,
      }));
      this.setData({ shortcuts, pinnedBehaviors });
    }).catch(() => {});
  },

  loadLastBehavior() {
    api.get('/behavior/last').then(data => {
      this.setData({ lastBehavior: data });
    }).catch(() => {});
  },

  loadRecentList() {
    api.get('/behavior/list').then(data => {
      const list = (data || []).slice(0, 10).map(item => {
        return Object.assign({}, item, {
          completedAtShort: this.formatTime(item.completed_at),
          qualityClass: QUALITY_CLASS_MAP[item.quality] || 'quality-fan',
        });
      });
      this.setData({ recentList: list });
    }).catch(() => {});
  },

  // ========== 快捷操作 ==========
  repeatLast() {
    const last = this.data.lastBehavior;
    if (!last) return;
    const isHealth = last.category === '身体健康';
    const isWakeup = last.sub_type === '早起';
    if (isHealth) {
      // 身体健康需要进入表单填写强度
      this.setData({
        step: 'form',
        selectedCategory: last.category,
        selectedSubtype: last.sub_type,
        description: last.description || '',
        intensity: last.intensity || '',
        intensityIndex: last.intensity ? INTENSITY_OPTIONS.indexOf(last.intensity) : -1,
        isHealthCategory: true,
        isWakeup: isWakeup,
        showWakeupInput: false,
        wakeupTime: '',
      });
      if (isWakeup) this.checkWakeupWindow();
    } else {
      // 非身体健康直接提交
      this.doSubmit(last.category, last.sub_type, last.description || '', '', '');
    }
  },

  tapShortcut(e) {
    const { category, subtype } = e.currentTarget.dataset;
    if (category === '身体健康') {
      const isWakeup = subtype === '早起';
      this.setData({
        step: 'form',
        selectedCategory: category,
        selectedSubtype: subtype,
        description: '',
        intensity: '',
        intensityIndex: -1,
        isHealthCategory: true,
        isWakeup: isWakeup,
        showWakeupInput: false,
        wakeupTime: '',
      });
      if (isWakeup) this.checkWakeupWindow();
    } else {
      this.doSubmit(category, subtype, '', '', '');
    }
  },

  onShortcutLongPress(e) {
    const { category, subtype, index, pinned } = e.currentTarget.dataset;
    const isPinned = pinned === true || pinned === 'true' || pinned === 1 || pinned === '1';
    this.setData({
      showPinMenu: true,
      pinMenuTarget: {
        category,
        sub_type: subtype,
        index,
        pinned: isPinned,
      },
    });
  },

  closePinMenu() {
    this.setData({ showPinMenu: false, pinMenuTarget: null });
  },

  pinBehavior() {
    const target = this.data.pinMenuTarget;
    if (!target) return;

    const current = [...this.data.pinnedBehaviors];
    if (current.length >= 2) {
      wx.showToast({ title: '最多置顶 2 个，请先取消一个', icon: 'none' });
      this.closePinMenu();
      return;
    }

    current.push({ category: target.category, sub_type: target.sub_type });
    this.updatePinnedBehaviors(current);
  },

  unpinBehavior() {
    const target = this.data.pinMenuTarget;
    if (!target) return;
    const current = this.data.pinnedBehaviors.filter(
      p => !(p.category === target.category && p.sub_type === target.sub_type)
    );
    this.updatePinnedBehaviors(current);
  },

  updatePinnedBehaviors(pinnedBehaviors) {
    api.patch('/character/pin-behavior', { pinnedBehaviors }).then(() => {
      this.setData({ pinnedBehaviors });
      this.closePinMenu();
      this.loadShortcuts();
      wx.showToast({ title: '已更新', icon: 'success', duration: 1000 });
    }).catch(err => {
      wx.showToast({ title: err.message || '操作失败', icon: 'none' });
      this.closePinMenu();
    });
  },

  // ========== 分类选择 ==========
  selectCategory(e) {
    const category = e.currentTarget.dataset.category;
    const subtypes = this.data.categories[category] || [];
    this.setData({
      selectedCategory: category,
      subtypeList: subtypes,
      step: 'subtype',
      isHealthCategory: category === '身体健康',
    });
  },

  // ========== 行为选择 ==========
  selectSubtype(e) {
    const subtype = e.currentTarget.dataset.subtype;
    const isWakeup = subtype === '早起';
    this.setData({
      selectedSubtype: subtype,
      step: 'form',
      intensity: '',
      intensityIndex: -1,
      description: '',
      isWakeup: isWakeup,
      showWakeupInput: false,
      wakeupTime: '',
    });
    if (isWakeup) this.checkWakeupWindow();
  },

  // ========== 自定义行为 ==========
  showCustom() {
    this.setData({ showCustomInput: true, customName: '' });
  },

  onCustomNameInput(e) {
    this.setData({ customName: e.detail.value });
  },

  cancelCustom() {
    this.setData({ showCustomInput: false, customName: '' });
  },

  submitCustom() {
    const name = this.data.customName.trim();
    if (!name) {
      wx.showToast({ title: '请输入行为名称', icon: 'none' });
      return;
    }
    api.post('/behavior/custom', {
      category: this.data.selectedCategory,
      name: name,
    }).then(() => {
      wx.showToast({ title: '添加成功', icon: 'success' });
      this.setData({ showCustomInput: false, customName: '' });
      // 刷新分类数据
      this.loadCategories();
      // 重新加载当前分类的子类型
      setTimeout(() => {
        const subtypes = this.data.categories[this.data.selectedCategory] || [];
        this.setData({ subtypeList: subtypes });
      }, 500);
    }).catch(err => {
      wx.showToast({ title: err.message || '添加失败', icon: 'none' });
    });
  },

  // ========== 表单 ==========
  onIntensityChange(e) {
    const idx = e.detail.value;
    this.setData({
      intensityIndex: idx,
      intensity: INTENSITY_OPTIONS[idx],
    });
  },

  onDescriptionInput(e) {
    this.setData({ description: e.detail.value });
  },

  onWakeupTimeChange(e) {
    this.setData({ wakeupTime: e.detail.value });
  },

  checkWakeupWindow() {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    const totalMin = h * 60 + m;
    // 5:30 = 330, 8:30 = 510
    if (totalMin >= 330 && totalMin <= 510) {
      const timeStr = this.padZero(h) + ':' + this.padZero(m);
      this.setData({ wakeupTime: timeStr, showWakeupInput: false });
    } else {
      this.setData({ showWakeupInput: true, wakeupTime: '' });
    }
  },

  // ========== 提交 ==========
  submitBehavior() {
    const { selectedCategory, selectedSubtype, description, intensity, wakeupTime, isHealthCategory, isWakeup } = this.data;
    if (isHealthCategory && !isWakeup && !intensity) {
      wx.showToast({ title: '请选择运动强度', icon: 'none' });
      return;
    }
    if (isWakeup && !wakeupTime) {
      wx.showToast({ title: '请输入起床时间', icon: 'none' });
      return;
    }
    this.doSubmit(selectedCategory, selectedSubtype, description, intensity, wakeupTime);
  },

  doSubmit(category, sub_type, description, intensity, wakeup_time) {
    if (this.data.submitting) return;
    this.setData({ submitting: true });

    const body = { category, sub_type };
    if (description) body.description = description;
    if (intensity) body.intensity = intensity;
    if (wakeup_time) body.wakeup_time = wakeup_time;

    api.post('/behavior', body).then(res => {
      const attrTempTotal = Math.round((res.attrTempTotal || 0) * 10) / 10;
      const canSynth = attrTempTotal >= 10;
      const remaining = canSynth ? 0 : Math.round((10 - attrTempTotal) * 10) / 10;
      const progressPct = Math.min(Math.round(((attrTempTotal % 10) / 10) * 100), 100);
      const rewardData = {
        itemName: res.item?.name || '',
        quality: res.item?.quality || '凡品',
        qualityClass: QUALITY_CLASS_MAP[res.item?.quality] || 'quality-fan',
        tempValue: res.item?.temp_value || 0,
        attrName: ATTR_NAMES[res.item?.attribute_type] || '',
        description: res.item?.description || '',
        attrTempTotal,
        canSynth,
        remaining,
        progressPct: canSynth ? 100 : progressPct,
        showCheckin: !!(res.checkinResult && !res.checkinResult.alreadyCheckedIn),
        checkinReward: res.checkinResult ? res.checkinResult.reward : 0,
        checkinStreak: res.checkinResult ? res.checkinResult.streak : 0,
      };

      this.setData({
        submitting: false,
        showRewardModal: true,
        rewardData,
      });
      this.resetForm();
      this.loadReportData();
      this.loadMonthlyGoals().then(goals => {
        const hit = goals.find(g => (
          g.completed &&
          g.subType === sub_type &&
          g.currentCount === g.targetCount
        ));
        if (hit) {
          wx.showToast({
            title: `「${hit.subType}」本月目标达成！`,
            icon: 'none',
            duration: 2500,
          });
        }
      });
    }).catch(err => {
      this.setData({ submitting: false });
      wx.showToast({ title: err.message || '提交失败', icon: 'none' });
    });
  },

  resetForm() {
    this.setData({
      step: 'category',
      selectedCategory: '',
      selectedSubtype: '',
      subtypeList: [],
      description: '',
      intensity: '',
      intensityIndex: -1,
      wakeupTime: '',
      showWakeupInput: false,
      isHealthCategory: false,
      isWakeup: false,
      showCustomInput: false,
      customName: '',
    });
  },

  goBack() {
    const { step } = this.data;
    if (step === 'form') {
      this.setData({ step: 'subtype', selectedSubtype: '', description: '', intensity: '', intensityIndex: -1 });
    } else if (step === 'subtype') {
      this.setData({ step: 'category', selectedCategory: '', subtypeList: [] });
    }
  },

  // ========== 最近记录 ==========
  toggleRecent() {
    this.setData({ showRecent: !this.data.showRecent });
  },

  closeRewardModal() {
    this.setData({ showRewardModal: false, rewardData: null });
  },

  goToInventoryFromReward() {
    this.setData({ showRewardModal: false, rewardData: null });
    wx.switchTab({ url: '/pages/inventory/inventory' });
  },

  loadMonthlyGoals() {
    return api.get('/behavior-goal/current').then(data => {
      const goals = (data || []).map(g => ({
        ...g,
        progressPct: Math.min(Math.round((g.currentCount / g.targetCount) * 100), 100),
      }));
      this.setData({ monthlyGoals: goals });
      return goals;
    }).catch(() => {
      this.setData({ monthlyGoals: [] });
      return [];
    });
  },

  toggleGoalPanel() {
    const show = !this.data.showGoalPanel;
    this.setData({ showGoalPanel: show });
    if (show) this.loadMonthlyGoals();
  },

  onGoalSubTypeInput(e) {
    this.setData({ newGoalSubType: e.detail.value });
  },

  onGoalCountInput(e) {
    this.setData({ newGoalCount: e.detail.value });
  },

  addGoal() {
    const subType = this.data.newGoalSubType.trim();
    const count = parseInt(this.data.newGoalCount, 10);

    if (!subType) {
      wx.showToast({ title: '请输入行为名称', icon: 'none' });
      return;
    }
    if (!count || count < 1) {
      wx.showToast({ title: '请输入有效的目标次数', icon: 'none' });
      return;
    }

    api.post('/behavior-goal', { sub_type: subType, target_count: count }).then(() => {
      wx.showToast({ title: '目标已添加', icon: 'success', duration: 1000 });
      this.setData({ newGoalSubType: '', newGoalCount: '' });
      this.loadMonthlyGoals();
    }).catch(err => {
      wx.showToast({ title: err.message || '添加失败', icon: 'none' });
    });
  },

  deleteGoal(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个目标吗？',
      success: (res) => {
        if (!res.confirm) return;
        api.delete(`/behavior-goal/${id}`).then(() => {
          wx.showToast({ title: '已删除', icon: 'success', duration: 1000 });
          this.loadMonthlyGoals();
        }).catch(err => {
          wx.showToast({ title: err.message || '删除失败', icon: 'none' });
        });
      },
    });
  },

  // ========== 历史 Tab ==========
  loadWeeklySummary() {
    api.get('/behavior/weekly-summary').then(data => {
      if (data && data.category_distribution) {
        const maxCount = Math.max(...data.category_distribution.map(c => c.count), 1);
        data.category_distribution = data.category_distribution.map(c => {
          return Object.assign({}, c, {
            barWidth: Math.round((c.count / maxCount) * 100),
          });
        });
      }
      if (data && data.quality_distribution) {
        const qualityList = [];
        const qualityOrder = ['凡品', '良品', '上品', '极品'];
        for (let i = 0; i < qualityOrder.length; i++) {
          const q = qualityOrder[i];
          if (data.quality_distribution[q]) {
            qualityList.push({ name: q, count: data.quality_distribution[q], qualityClass: QUALITY_CLASS_MAP[q] || 'quality-fan' });
          }
        }
        data.qualityList = qualityList;
      }
      this.setData({ weeklySummary: data });
    }).catch(() => {});
  },

  loadCalendar() {
    const { calendarYear, calendarMonth } = this.data;
    const label = calendarYear + '年' + calendarMonth + '月';
    this.setData({ calendarMonthLabel: label });

    api.get('/behavior/history?year=' + calendarYear + '&month=' + (calendarMonth < 10 ? '0' + calendarMonth : calendarMonth)).then(data => {
      this.setData({ historyMap: data || {} });
      this.buildCalendarDays();
    }).catch(() => {
      this.setData({ historyMap: {} });
      this.buildCalendarDays();
    });
  },

  buildCalendarDays() {
    const { calendarYear, calendarMonth, historyMap } = this.data;
    const firstDay = new Date(calendarYear, calendarMonth - 1, 1).getDay();
    const daysInMonth = new Date(calendarYear, calendarMonth, 0).getDate();
    const days = [];

    // 填充前面的空白
    for (let i = 0; i < firstDay; i++) {
      days.push({ day: '', dateStr: '', hasRecord: false, isToday: false });
    }

    const today = new Date();
    const todayStr = today.getFullYear() + '-' + this.padZero(today.getMonth() + 1) + '-' + this.padZero(today.getDate());

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = calendarYear + '-' + this.padZero(calendarMonth) + '-' + this.padZero(d);
      const hasRecord = !!(historyMap[dateStr] && historyMap[dateStr].length > 0);
      days.push({
        day: d,
        dateStr: dateStr,
        hasRecord: hasRecord,
        isToday: dateStr === todayStr,
      });
    }

    this.setData({ calendarDays: days });
  },

  prevMonth() {
    let { calendarYear, calendarMonth } = this.data;
    calendarMonth--;
    if (calendarMonth < 1) {
      calendarMonth = 12;
      calendarYear--;
    }
    this.setData({ calendarYear, calendarMonth, selectedDate: '', selectedDateRecords: [] });
    this.loadCalendar();
  },

  nextMonth() {
    let { calendarYear, calendarMonth } = this.data;
    calendarMonth++;
    if (calendarMonth > 12) {
      calendarMonth = 1;
      calendarYear++;
    }
    this.setData({ calendarYear, calendarMonth, selectedDate: '', selectedDateRecords: [] });
    this.loadCalendar();
  },

  tapCalendarDay(e) {
    const dateStr = e.currentTarget.dataset.date;
    if (!dateStr) return;
    const records = (this.data.historyMap[dateStr] || []).map(r => {
      return Object.assign({}, r, {
        completedAtShort: this.formatTime(r.completed_at),
        qualityClass: QUALITY_CLASS_MAP[r.quality] || 'quality-fan',
      });
    });
    this.setData({ selectedDate: dateStr, selectedDateRecords: records });
  },

  // ========== 工具方法 ==========
  padZero(n) {
    return n < 10 ? '0' + n : '' + n;
  },

  formatTime(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    return this.padZero(d.getMonth() + 1) + '-' + this.padZero(d.getDate()) + ' ' + this.padZero(d.getHours()) + ':' + this.padZero(d.getMinutes());
  },
});
