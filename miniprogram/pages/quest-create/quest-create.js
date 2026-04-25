var api = require('../../utils/api');

var TYPE_OPTIONS = ['self', 'challenge', 'bounty'];
var TYPE_LABELS = ['自我悬赏', '挑战', '悬赏'];
var CATEGORY_OPTIONS = ['体魄', '悟性', '意志', '灵巧', '感知'];
var GOAL_TYPE_OPTIONS = ['manual', 'behavior_count', 'streak_days', 'attr_accumulate'];
var GOAL_TYPE_LABELS = ['手动判定', '行为次数', '连续天数', '属性累计'];
var MODE_OPTIONS = ['cooperative', 'competitive'];
var MODE_LABELS = ['合作模式', '竞争模式'];

Page({
  data: {
    typeIndex: 0,
    typeLabels: TYPE_LABELS,
    title: '',
    description: '',
    categoryIndex: -1,
    categoryOptions: CATEGORY_OPTIONS,
    deadline: '',
    minDate: '',
    goalTypeIndex: 0,
    goalTypeLabels: GOAL_TYPE_LABELS,
    goalTarget: '',
    goalSubType: '',
    goalPeriod: '',
    modeIndex: 0,
    modeLabels: MODE_LABELS,
    rewardStones: '',
    myStones: 0,
    submitting: false,
  },

  onShow: function () {
    var tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    var minDate = tomorrow.getFullYear() + '-' +
      String(tomorrow.getMonth() + 1).padStart(2, '0') + '-' +
      String(tomorrow.getDate()).padStart(2, '0');
    this.setData({ minDate: minDate });
    this.loadMyStones();
  },

  loadMyStones: function () {
    var that = this;
    api.get('/character').then(function (res) {
      that.setData({ myStones: Number(res.spiritStones || 0) });
    }).catch(function () {});
  },

  switchType: function (e) { this.setData({ typeIndex: parseInt(e.currentTarget.dataset.idx) }); },
  onTitleInput: function (e) { this.setData({ title: e.detail.value }); },
  onDescInput: function (e) { this.setData({ description: e.detail.value }); },
  onRewardInput: function (e) { this.setData({ rewardStones: e.detail.value }); },
  onGoalTargetInput: function (e) { this.setData({ goalTarget: e.detail.value }); },
  onGoalSubTypeInput: function (e) { this.setData({ goalSubType: e.detail.value }); },
  onGoalPeriodInput: function (e) { this.setData({ goalPeriod: e.detail.value }); },
  onCategoryChange: function (e) { this.setData({ categoryIndex: parseInt(e.detail.value) }); },
  onDeadlineChange: function (e) { this.setData({ deadline: e.detail.value }); },
  onGoalTypeChange: function (e) { this.setData({ goalTypeIndex: parseInt(e.detail.value) }); },
  onModeChange: function (e) { this.setData({ modeIndex: parseInt(e.detail.value) }); },

  submit: function () {
    var that = this;
    var type = TYPE_OPTIONS[this.data.typeIndex];
    var title = this.data.title.trim();
    var description = this.data.description.trim();
    var deadline = this.data.deadline;

    if (!title) {
      wx.showToast({ title: '请输入任务标题', icon: 'none' });
      return;
    }
    if (title.length > 50) {
      wx.showToast({ title: '标题不超过50字', icon: 'none' });
      return;
    }
    if (!deadline) {
      wx.showToast({ title: '请选择截止时间', icon: 'none' });
      return;
    }

    var goalType = GOAL_TYPE_OPTIONS[this.data.goalTypeIndex];
    var goalConfig = {};

    if (goalType !== 'manual') {
      var target = parseInt(this.data.goalTarget);
      if (!target || target <= 0) {
        wx.showToast({ title: '请输入有效的目标数值', icon: 'none' });
        return;
      }
      goalConfig.target = target;

      if (goalType === 'behavior_count') {
        if (this.data.categoryIndex < 0) {
          wx.showToast({ title: '请选择属性类别', icon: 'none' });
          return;
        }
        goalConfig.category = CATEGORY_OPTIONS[this.data.categoryIndex];
      } else if (goalType === 'streak_days') {
        if (!this.data.goalSubType.trim()) {
          wx.showToast({ title: '请输入行为子类型', icon: 'none' });
          return;
        }
        goalConfig.sub_type = this.data.goalSubType.trim();
        if (this.data.categoryIndex >= 0) goalConfig.category = CATEGORY_OPTIONS[this.data.categoryIndex];
      } else if (goalType === 'attr_accumulate') {
        var attrMap = { '体魄': 'physique', '悟性': 'comprehension', '意志': 'willpower', '灵巧': 'dexterity', '感知': 'perception' };
        if (this.data.categoryIndex < 0) {
          wx.showToast({ title: '请选择属性类别', icon: 'none' });
          return;
        }
        goalConfig.attribute = attrMap[CATEGORY_OPTIONS[this.data.categoryIndex]] || '';
      }
      goalConfig.period = this.data.goalPeriod.trim() || deadline.substring(0, 7);
    }

    if (type === 'bounty') {
      var stones = parseInt(this.data.rewardStones);
      if (!stones || stones <= 0) {
        wx.showToast({ title: '请输入悬赏灵石数量', icon: 'none' });
        return;
      }
      if (stones > this.data.myStones) {
        wx.showToast({ title: '灵石余额不足', icon: 'none' });
        return;
      }
    }

    var data = {
      type: type,
      title: title,
      description: description || null,
      category: this.data.categoryIndex >= 0 ? CATEGORY_OPTIONS[this.data.categoryIndex] : null,
      goal_type: goalType,
      goal_config: goalType !== 'manual' ? goalConfig : {},
      mode: type === 'challenge' ? MODE_OPTIONS[this.data.modeIndex] : 'cooperative',
      reward_stones: type === 'bounty' ? parseInt(this.data.rewardStones) : 0,
      deadline: deadline + 'T23:59:59',
    };

    that.setData({ submitting: true });
    api.post('/quests', data).then(function (res) {
      that.setData({ submitting: false });
      wx.showToast({ title: '创建成功', icon: 'success' });
      wx.redirectTo({ url: '/pages/quest-detail/quest-detail?id=' + res.id });
    }).catch(function (err) {
      that.setData({ submitting: false });
      wx.showToast({ title: err.message || '创建失败', icon: 'none' });
    });
  },
});
