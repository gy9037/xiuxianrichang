const api = require('../../utils/api');

const AVATAR_COLORS = ['#e57373', '#81c784', '#64b5f6', '#ffb74d', '#ba68c8', '#4dd0e1'];
const STATUS_COLORS = { '居家': '#10b981', '生病': '#ef4444', '出差': '#3b82f6' };
const REACTION_EMOJIS = [
  { emoji: '👍', label: '赞' },
  { emoji: '💪', label: '强' },
  { emoji: '📖', label: '悟' },
  { emoji: '✨', label: '定' },
];
const QUALITY_COLORS = {
  '凡品': '#94a3b8', '良品': '#10b981', '上品': '#3b82f6', '极品': '#f59e0b',
};
const MEMBERS_FOLD = 6;
const FEED_PAGE_SIZE = 10;
const WISHES_FOLD = 3;
const WISH_MEMBERS_FOLD = 5;

function getAvatarColor(name) {
  if (!name) return AVATAR_COLORS[0];
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

function getInitial(name) {
  return name ? name.charAt(0) : '?';
}

function relativeTime(dateStr) {
  var now = Date.now();
  var ts = new Date(dateStr).getTime();
  var diff = now - ts;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  if (diff < 604800000) return Math.floor(diff / 86400000) + '天前';
  var d = new Date(dateStr);
  return (d.getMonth() + 1) + '/' + d.getDate();
}

function prepareMember(m) {
  return {
    id: m.id,
    name: m.name,
    initial: getInitial(m.name),
    avatarColor: getAvatarColor(m.name),
    statusColor: STATUS_COLORS[m.status] || '#94a3b8',
    statusLabel: m.status,
    realm_stage: m.realm_stage || '',
  };
}

function prepareFeedItem(item) {
  var reactionList = REACTION_EMOJIS.map(function (r) {
    var found = (item.reactions || []).filter(function (x) { return x.emoji === r.emoji; })[0];
    var count = found ? found.count : 0;
    var active = (item.myReactions || []).indexOf(r.emoji) !== -1;
    return {
      emoji: r.emoji,
      label: r.label,
      count: count,
      active: active,
    };
  });
  return {
    id: item.id,
    user_name: item.user_name,
    initial: getInitial(item.user_name),
    avatarColor: getAvatarColor(item.user_name),
    sub_type: item.sub_type || '',
    quality: item.quality || '',
    qualityColor: QUALITY_COLORS[item.quality] || '#94a3b8',
    item_name: item.item_name || '',
    timeAgo: relativeTime(item.completed_at),
    reactions: reactionList,
  };
}

function prepareWishMember(m) {
  var statusLabel = m.status === 'completed' ? '已通过' : '待挑战';
  var statusColor = m.status === 'completed' ? '#10b981' : '#94a3b8';
  return {
    id: m.id,
    name: m.name,
    statusLabel: statusLabel,
    statusColor: statusColor,
  };
}

function prepareWish(w) {
  var raw = w.teamProgress || [];
  var members = raw.map(prepareWishMember);
  var statusLabel = w.status === 'pending' ? '待挑战' : w.status === 'in_progress' ? '进行中' : '已完成';
  return {
    id: w.id,
    name: w.name,
    status: statusLabel,
    members: members.slice(0, WISH_MEMBERS_FOLD),
    membersExtra: members.length > WISH_MEMBERS_FOLD ? members.length - WISH_MEMBERS_FOLD : 0,
    showAllMembers: false,
    allMembers: members,
  };
}

Page({
  data: {
    loading: true,
    // 成员
    members: [],
    membersVisible: [],
    membersCollapsed: true,
    membersExtra: 0,
    // 动态
    feed: [],
    feedVisible: [],
    feedPage: 1,
    feedHasMore: false,
    feedLoading: false,
    // 愿望
    wishes: [],
    wishesVisible: [],
    wishesCollapsed: true,
    wishesExtra: 0,
    // 防连点
    _reactingMap: {},
  },

  onShow() {
    this.loadAll();
  },

  loadAll() {
    var that = this;
    that.setData({ loading: true });
    Promise.all([
      api.get('/family/members').catch(function () { return []; }),
      api.get('/family/feed').catch(function () { return []; }),
      api.get('/wishes').catch(function () { return []; }),
    ]).then(function (res) {
      var rawMembers = res[0] || [];
      var rawFeed = res[1] || [];
      var rawWishes = res[2] || [];

      var members = rawMembers.map(prepareMember);
      var feed = rawFeed.map(prepareFeedItem);
      var teamWishes = rawWishes.filter(function (w) {
        return w.type === '团队' && w.status !== 'redeemed';
      }).map(prepareWish);

      that.setData({
        loading: false,
        members: members,
        membersVisible: members.slice(0, MEMBERS_FOLD),
        membersCollapsed: members.length > MEMBERS_FOLD,
        membersExtra: Math.max(0, members.length - MEMBERS_FOLD),
        feed: feed,
        feedVisible: feed.slice(0, FEED_PAGE_SIZE),
        feedPage: 1,
        feedHasMore: feed.length > FEED_PAGE_SIZE,
        wishes: teamWishes,
        wishesVisible: teamWishes.slice(0, WISHES_FOLD),
        wishesCollapsed: teamWishes.length > WISHES_FOLD,
        wishesExtra: Math.max(0, teamWishes.length - WISHES_FOLD),
      });
    }).catch(function () {
      that.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  // 成员展开/折叠
  toggleMembers() {
    var collapsed = !this.data.membersCollapsed;
    this.setData({
      membersCollapsed: collapsed,
      membersVisible: collapsed
        ? this.data.members.slice(0, MEMBERS_FOLD)
        : this.data.members,
    });
  },

  // 动态加载更多
  loadMoreFeed() {
    var nextPage = this.data.feedPage + 1;
    var end = nextPage * FEED_PAGE_SIZE;
    this.setData({
      feedPage: nextPage,
      feedVisible: this.data.feed.slice(0, end),
      feedHasMore: end < this.data.feed.length,
    });
  },

  // 表情反应 toggle（乐观更新）
  onReact(e) {
    var behaviorId = e.currentTarget.dataset.id;
    var emoji = e.currentTarget.dataset.emoji;
    var feedIndex = e.currentTarget.dataset.feedindex;
    var reactionIndex = e.currentTarget.dataset.reactionindex;

    // 防连点
    var key = behaviorId + '_' + emoji;
    if (this._reactingMap && this._reactingMap[key]) return;
    if (!this._reactingMap) this._reactingMap = {};
    this._reactingMap[key] = true;

    var that = this;
    var path = 'feedVisible[' + feedIndex + '].reactions[' + reactionIndex + ']';
    var reaction = this.data.feedVisible[feedIndex].reactions[reactionIndex];
    var wasActive = reaction.active;
    var oldCount = reaction.count;

    // 乐观更新
    var update = {};
    update[path + '.active'] = !wasActive;
    update[path + '.count'] = wasActive ? Math.max(0, oldCount - 1) : oldCount + 1;
    this.setData(update);

    // 同步更新 feed 源数据（保持一致）
    var fullFeedPath = 'feed[' + this._getFullFeedIndex(feedIndex) + '].reactions[' + reactionIndex + ']';
    var fullUpdate = {};
    fullUpdate[fullFeedPath + '.active'] = !wasActive;
    fullUpdate[fullFeedPath + '.count'] = wasActive ? Math.max(0, oldCount - 1) : oldCount + 1;
    this.setData(fullUpdate);

    api.post('/family/react', { behavior_id: behaviorId, emoji: emoji })
      .then(function () {
        that._reactingMap[key] = false;
      })
      .catch(function () {
        // 回滚
        var rollback = {};
        rollback[path + '.active'] = wasActive;
        rollback[path + '.count'] = oldCount;
        that.setData(rollback);
        var fullRollback = {};
        fullRollback[fullFeedPath + '.active'] = wasActive;
        fullRollback[fullFeedPath + '.count'] = oldCount;
        that.setData(fullRollback);
        that._reactingMap[key] = false;
        wx.showToast({ title: '操作失败', icon: 'none' });
      });
  },

  _getFullFeedIndex(visibleIndex) {
    // feedVisible 是 feed 的前 N 项，index 一致
    return parseInt(visibleIndex);
  },

  // 愿望展开/折叠
  toggleWishes() {
    var collapsed = !this.data.wishesCollapsed;
    this.setData({
      wishesCollapsed: collapsed,
      wishesVisible: collapsed
        ? this.data.wishes.slice(0, WISHES_FOLD)
        : this.data.wishes,
    });
  },

  // 愿望成员展开
  toggleWishMembers(e) {
    var idx = e.currentTarget.dataset.index;
    var wish = this.data.wishesVisible[idx];
    var path = 'wishesVisible[' + idx + ']';
    var update = {};
    if (wish.showAllMembers) {
      update[path + '.showAllMembers'] = false;
      update[path + '.members'] = wish.allMembers.slice(0, WISH_MEMBERS_FOLD);
    } else {
      update[path + '.showAllMembers'] = true;
      update[path + '.members'] = wish.allMembers;
    }
    this.setData(update);
  },
});
