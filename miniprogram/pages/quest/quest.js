var api = require('../../utils/api');

var TYPE_LABELS = { system: '系统悬赏', self: '自我悬赏', challenge: '挑战', bounty: '悬赏' };
var TYPE_COLORS = { system: '#d4a574', self: '#7ec8e3', challenge: '#c77dba', bounty: '#e8a87c' };
var ROLE_LABELS = { challenger: '挑战者', observer: '观察者', bounty_taker: '接取者' };
var ROLE_COLORS = { challenger: '#c77dba', observer: '#94a3b8', bounty_taker: '#e8a87c' };
var TAB_STATUS = ['active', 'voting', 'completed,failed,cancelled'];
var TAB_NAMES = ['进行中', '投票中', '已结束'];
var PAGE_SIZE = 20;

function formatDeadline(dateStr) {
  if (!dateStr) return '';
  var diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return '已截止';
  var days = Math.floor(diff / 86400000);
  if (days > 0) return '剩余' + days + '天';
  return '剩余' + Math.floor(diff / 3600000) + '小时';
}

function prepareQuest(item) {
  return {
    id: item.id,
    title: item.title,
    type: item.type,
    typeLabel: TYPE_LABELS[item.type] || item.type,
    typeColor: TYPE_COLORS[item.type] || '#94a3b8',
    status: item.status,
    mode: item.mode,
    deadline: item.deadline,
    deadlineText: formatDeadline(item.deadline),
    creatorName: item.creator_name || '',
    participantCount: item.participant_count || 0,
    myRole: item.my_role || null,
    myRoleLabel: item.my_role ? (ROLE_LABELS[item.my_role] || '') : '',
    myRoleColor: item.my_role ? (ROLE_COLORS[item.my_role] || '#94a3b8') : '',
    rewardStones: item.reward_stones || 0,
    bountyStones: item.bounty_stones || 0,
    createdAt: item.created_at,
  };
}

Page({
  data: {
    activeTab: 0,
    tabNames: TAB_NAMES,
    quests: [],
    dailyQuest: null,
    loading: true,
    page: 1,
    hasMore: false,
  },

  onShow: function () {
    this.setData({ page: 1, quests: [], hasMore: false });
    this.loadDailyQuest();
    this.loadQuests();
  },

  loadDailyQuest: function () {
    var that = this;
    api.get('/quests/daily').then(function (res) {
      that.setData({ dailyQuest: res && res.id ? res : null });
    }).catch(function () {
      that.setData({ dailyQuest: null });
    });
  },

  loadQuests: function () {
    var that = this;
    var status = TAB_STATUS[this.data.activeTab];
    that.setData({ loading: true });
    api.get('/quests?status=' + status + '&page=' + that.data.page + '&limit=' + PAGE_SIZE).then(function (res) {
      var list = (res.quests || []).map(prepareQuest);
      that.setData({
        loading: false,
        quests: that.data.page === 1 ? list : that.data.quests.concat(list),
        hasMore: list.length >= PAGE_SIZE,
      });
    }).catch(function () {
      that.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  switchTab: function (e) {
    var idx = parseInt(e.currentTarget.dataset.idx);
    if (idx === this.data.activeTab) return;
    this.setData({ activeTab: idx, page: 1, quests: [], hasMore: false });
    this.loadQuests();
  },

  loadMore: function () {
    if (!this.data.hasMore || this.data.loading) return;
    this.setData({ page: this.data.page + 1 });
    this.loadQuests();
  },

  goDetail: function (e) {
    wx.navigateTo({ url: '/pages/quest-detail/quest-detail?id=' + e.currentTarget.dataset.id });
  },

  goDailyDetail: function () {
    if (this.data.dailyQuest && this.data.dailyQuest.id) {
      wx.navigateTo({ url: '/pages/quest-detail/quest-detail?id=' + this.data.dailyQuest.id });
    }
  },

  goCreate: function () {
    wx.navigateTo({ url: '/pages/quest-create/quest-create' });
  },
});
