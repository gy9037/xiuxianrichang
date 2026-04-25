# Codex 指令：任务系统 Batch3 - 前端

> **需求来源**：策划案-02（统一任务系统）
> **技术方案**：tech-quest-system.md
> **执行顺序**：先执行后端指令（codex-quest-batch2-backend.md），再执行本文件
> **前置条件**：后端 quest 路由已注册，quests/quest_participants/quest_judgments/system_quest_pool 表已创建

---

## 一、注册任务页面（修改 miniprogram/app.json）

在 `pages` 数组中，`"pages/arena/arena"` 之前新增 3 个页面路径：

```json
"pages/quest/quest",
"pages/quest-detail/quest-detail",
"pages/quest-create/quest-create",
```

修改后 pages 数组为：

```json
"pages": [
  "pages/home/home",
  "pages/behavior/behavior",
  "pages/inventory/inventory",
  "pages/wish/wish",
  "pages/family/family",
  "pages/report/report",
  "pages/quest/quest",
  "pages/quest-detail/quest-detail",
  "pages/quest-create/quest-create",
  "pages/arena/arena",
  "pages/login/login"
]
```

---

## 二、任务列表页（新建 miniprogram/pages/quest/quest.json）

```json
{
  "navigationBarTitleText": "任务",
  "navigationBarBackgroundColor": "#0f0f1a",
  "navigationBarTextStyle": "white",
  "usingComponents": {}
}
```

---

## 三、任务列表页（新建 miniprogram/pages/quest/quest.js）

```js
var api = require('../../utils/api');

var TYPE_LABELS = {
  system: '系统悬赏',
  self: '自我悬赏',
  challenge: '挑战',
  bounty: '悬赏',
};
var TYPE_COLORS = {
  system: '#d4a574',
  self: '#7ec8e3',
  challenge: '#c77dba',
  bounty: '#e8a87c',
};
var ROLE_LABELS = {
  challenger: '挑战者',
  observer: '观察者',
  bounty_taker: '接取者',
};
var ROLE_COLORS = {
  challenger: '#c77dba',
  observer: '#94a3b8',
  bounty_taker: '#e8a87c',
};
var TAB_STATUS = ['active', 'voting', 'completed,failed,cancelled'];
var TAB_NAMES = ['进行中', '投票中', '已结束'];
var PAGE_SIZE = 20;

function formatDeadline(dateStr) {
  if (!dateStr) return '';
  var now = Date.now();
  var deadline = new Date(dateStr).getTime();
  var diff = deadline - now;
  if (diff <= 0) return '已截止';
  var days = Math.floor(diff / 86400000);
  if (days > 0) return '剩余' + days + '天';
  var hours = Math.floor(diff / 3600000);
  return '剩余' + hours + '小时';
}

function prepareQuest(item, userId) {
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
      if (res && res.id) {
        that.setData({ dailyQuest: res });
      } else {
        that.setData({ dailyQuest: null });
      }
    }).catch(function () {
      that.setData({ dailyQuest: null });
    });
  },

  loadQuests: function () {
    var that = this;
    var status = TAB_STATUS[this.data.activeTab];
    that.setData({ loading: true });
    var userId = api.user ? api.user.id : null;
    api.get('/quests?status=' + status + '&page=' + that.data.page + '&limit=' + PAGE_SIZE).then(function (res) {
      var list = (res.quests || []).map(function (item) {
        return prepareQuest(item, userId);
      });
      var allQuests = that.data.page === 1 ? list : that.data.quests.concat(list);
      that.setData({
        loading: false,
        quests: allQuests,
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
    var id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/quest-detail/quest-detail?id=' + id });
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
```

---

## 四、任务列表页（新建 miniprogram/pages/quest/quest.wxml）

```xml
<view class="page-container">

  <!-- Tab 栏 -->
  <view class="tab-bar">
    <button class="tab-bar-item {{activeTab === 0 ? 'active' : ''}}"
      data-idx="0" bindtap="switchTab">进行中</button>
    <button class="tab-bar-item {{activeTab === 1 ? 'active' : ''}}"
      data-idx="1" bindtap="switchTab">投票中</button>
    <button class="tab-bar-item {{activeTab === 2 ? 'active' : ''}}"
      data-idx="2" bindtap="switchTab">已结束</button>
  </view>

  <!-- 今日悬赏置顶卡片（仅进行中 tab） -->
  <view wx:if="{{activeTab === 0 && dailyQuest}}" class="card quest-daily-card" bindtap="goDailyDetail">
    <view class="flex-between" style="margin-bottom:8rpx">
      <view class="flex-row" style="gap:12rpx">
        <text class="quest-daily-badge">今日悬赏</text>
        <text class="text-bright" style="font-size:30rpx;font-weight:600">{{dailyQuest.title}}</text>
      </view>
      <text class="text-dim" style="font-size:28rpx">></text>
    </view>
    <text class="text-dim" style="font-size:24rpx;display:block">{{dailyQuest.description}}</text>
    <view class="flex-row" style="gap:16rpx;margin-top:8rpx">
      <text wx:if="{{dailyQuest.my_submission}}" class="text-green" style="font-size:24rpx">已完成</text>
      <text wx:else class="text-gold" style="font-size:24rpx">待完成</text>
    </view>
  </view>

  <!-- 任务列表 -->
  <view wx:if="{{quests.length > 0}}">
    <view class="card quest-card" wx:for="{{quests}}" wx:key="id"
      bindtap="goDetail" data-id="{{item.id}}">
      <!-- 第一行：标题 + 类型标签 -->
      <view class="flex-between" style="margin-bottom:8rpx">
        <text class="text-bright" style="font-size:30rpx;font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{item.title}}</text>
        <text class="quest-type-tag" style="background:rgba(255,255,255,0.08);color:{{item.typeColor}}">{{item.typeLabel}}</text>
      </view>
      <!-- 第二行：截止时间 + 参与人数 + 我的角色 -->
      <view class="flex-between">
        <view class="flex-row" style="gap:16rpx">
          <text class="text-dim" style="font-size:24rpx">{{item.creatorName}} 发起</text>
          <text class="text-dim" style="font-size:24rpx">{{item.participantCount}}人参与</text>
          <text wx:if="{{item.deadlineText}}" class="text-dim" style="font-size:24rpx">{{item.deadlineText}}</text>
        </view>
        <text wx:if="{{item.myRoleLabel}}" class="quest-role-tag" style="color:{{item.myRoleColor}}">{{item.myRoleLabel}}</text>
      </view>
      <!-- 第三行：灵石奖励（如有） -->
      <view wx:if="{{item.bountyStones > 0}}" style="margin-top:8rpx">
        <text class="text-gold" style="font-size:24rpx">💎 悬赏 {{item.bountyStones}} 灵石</text>
      </view>
    </view>
  </view>

  <!-- 加载更多 -->
  <view wx:if="{{hasMore}}" class="fold-action" bindtap="loadMore">
    <text class="text-primary">加载更多</text>
  </view>

  <!-- 空状态 -->
  <view wx:if="{{!loading && quests.length === 0}}" class="empty-state">
    <text>暂无任务</text>
  </view>

  <!-- 加载中 -->
  <view wx:if="{{loading && quests.length === 0}}" class="empty-state">
    <text>加载中...</text>
  </view>

  <!-- 浮动发起按钮 -->
  <view class="quest-fab" bindtap="goCreate">
    <text style="font-size:40rpx;color:#fff">+</text>
  </view>

</view>
```

---

## 五、任务列表页（新建 miniprogram/pages/quest/quest.wxss）

```css
/* 今日悬赏卡片 */
.quest-daily-card {
  border: 2rpx solid #d4a574;
  margin-bottom: 24rpx;
}

.quest-daily-badge {
  font-size: 22rpx;
  font-weight: 600;
  color: #0f0f1a;
  background: linear-gradient(135deg, #d4a574, #f5d4a0);
  padding: 4rpx 16rpx;
  border-radius: 8rpx;
  flex-shrink: 0;
}

/* 任务卡片 */
.quest-card {
  margin-bottom: 16rpx;
}

/* 类型标签 */
.quest-type-tag {
  font-size: 22rpx;
  font-weight: 600;
  padding: 4rpx 16rpx;
  border-radius: 16rpx;
  flex-shrink: 0;
  margin-left: 12rpx;
}

/* 角色标记 */
.quest-role-tag {
  font-size: 22rpx;
  font-weight: 600;
}

/* 浮动发起按钮 */
.quest-fab {
  position: fixed;
  right: 40rpx;
  bottom: calc(40rpx + env(safe-area-inset-bottom));
  width: 96rpx;
  height: 96rpx;
  border-radius: 50%;
  background: #8b5cf6;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8rpx 24rpx rgba(139, 92, 246, 0.4);
}

.quest-fab:active {
  background: #7c3aed;
}

/* 折叠操作（复用全局，此处补充） */
.fold-action {
  text-align: center;
  padding: 16rpx 0;
  margin-top: 12rpx;
  font-size: 26rpx;
  min-height: 88rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

---

## 六、任务详情页（新建 miniprogram/pages/quest-detail/quest-detail.json）

```json
{
  "navigationBarTitleText": "任务详情",
  "navigationBarBackgroundColor": "#0f0f1a",
  "navigationBarTextStyle": "white",
  "usingComponents": {}
}
```

---

## 七、任务详情页（新建 miniprogram/pages/quest-detail/quest-detail.js）

```js
var api = require('../../utils/api');

var TYPE_LABELS = {
  system: '系统悬赏',
  self: '自我悬赏',
  challenge: '挑战',
  bounty: '悬赏',
};
var TYPE_COLORS = {
  system: '#d4a574',
  self: '#7ec8e3',
  challenge: '#c77dba',
  bounty: '#e8a87c',
};
var STATUS_LABELS = {
  voting: '投票中',
  active: '进行中',
  judging: '判定中',
  completed: '已完成',
  failed: '已失败',
  cancelled: '已取消',
};
var MODE_LABELS = {
  cooperative: '合作模式',
  competitive: '竞争模式',
};
var CATEGORY_LABELS = {
  physique: '体魄',
  comprehension: '悟性',
  willpower: '意志',
  dexterity: '灵巧',
  perception: '感知',
  '体魄': '体魄',
  '悟性': '悟性',
  '意志': '意志',
  '灵巧': '灵巧',
  '感知': '感知',
};
var GOAL_TYPE_LABELS = {
  manual: '手动判定',
  behavior_count: '行为次数',
  streak_days: '连续天数',
  attr_accumulate: '属性累计',
};

Page({
  data: {
    id: null,
    quest: null,
    loading: true,
    userId: null,
    // 我的身份
    myParticipant: null,
    myRole: null,
    hasVoted: false,
    hasSubmitted: false,
    isCreator: false,
    // 投票
    joinAsChallenger: false,
    // 提交弹窗
    showSubmitModal: false,
    submitText: '',
    submitPhotos: [],
    uploading: false,
    uploadProgress: 0,
    // 判定
    myJudgments: {},
    // 预计算展示数据
    typeLabel: '',
    typeColor: '',
    statusLabel: '',
    modeLabel: '',
    categoryLabel: '',
    goalTypeLabel: '',
    deadlineText: '',
    creatorName: '',
    hasProgress: false,
    participants: [],
  },

  onLoad: function (options) {
    var id = parseInt(options.id);
    var userId = api.user ? api.user.id : null;
    this.setData({ id: id, userId: userId });
  },

  onShow: function () {
    this.loadDetail();
  },

  loadDetail: function () {
    var that = this;
    var id = this.data.id;
    that.setData({ loading: true });
    api.get('/quests/' + id).then(function (res) {
      var userId = that.data.userId;
      var isCreator = res.creator && res.creator.id === userId;

      // 找到我的参与记录
      var myP = null;
      var participants = res.participants || [];
      for (var i = 0; i < participants.length; i++) {
        if (participants[i].user_id === userId) {
          myP = participants[i];
          break;
        }
      }

      // 预计算进度百分比
      var hasProgress = res.goal_type && res.goal_type !== 'manual';
      for (var j = 0; j < participants.length; j++) {
        var p = participants[j];
        if (hasProgress && p.progress) {
          var prog = typeof p.progress === 'string' ? JSON.parse(p.progress) : p.progress;
          p.progressCurrent = prog.current || 0;
          p.progressTarget = prog.target || 0;
          p.progressPct = p.progressTarget > 0 ? Math.min(Math.round((p.progressCurrent / p.progressTarget) * 100), 100) : 0;
        } else {
          p.progressCurrent = 0;
          p.progressTarget = 0;
          p.progressPct = 0;
        }
        p.roleLabel = p.role === 'challenger' ? '挑战者' : p.role === 'bounty_taker' ? '接取者' : '观察者';
        p.roleColor = p.role === 'challenger' ? '#c77dba' : p.role === 'bounty_taker' ? '#e8a87c' : '#94a3b8';
        p.resultLabel = p.result === 'completed' ? '已完成' : p.result === 'failed' ? '未完成' : '';
        p.resultColor = p.result === 'completed' ? '#10b981' : p.result === 'failed' ? '#ef4444' : '';
        p.hasSubmission = !!p.submission;
        // 解析 submission
        if (p.submission) {
          var sub = typeof p.submission === 'string' ? JSON.parse(p.submission) : p.submission;
          p.submissionText = sub.text || '';
          p.submissionPhotos = sub.photo_urls || [];
        } else {
          p.submissionText = '';
          p.submissionPhotos = [];
        }
      }

      // 解析 goal_config
      var goalConfig = res.goal_config;
      if (typeof goalConfig === 'string') {
        try { goalConfig = JSON.parse(goalConfig); } catch (e) { goalConfig = {}; }
      }

      // 我的判定记录
      var myJudgments = {};
      if (res.my_judgments) {
        for (var k = 0; k < res.my_judgments.length; k++) {
          myJudgments[res.my_judgments[k].target_user_id] = res.my_judgments[k].verdict;
        }
      }

      // 格式化截止时间
      var deadlineText = '';
      if (res.deadline) {
        var now = Date.now();
        var dl = new Date(res.deadline).getTime();
        var diff = dl - now;
        if (diff <= 0) {
          deadlineText = '已截止';
        } else {
          var days = Math.floor(diff / 86400000);
          if (days > 0) deadlineText = '剩余' + days + '天';
          else deadlineText = '剩余' + Math.floor(diff / 3600000) + '小时';
        }
      }

      that.setData({
        loading: false,
        quest: res,
        typeLabel: TYPE_LABELS[res.type] || res.type,
        typeColor: TYPE_COLORS[res.type] || '#94a3b8',
        statusLabel: STATUS_LABELS[res.status] || res.status,
        modeLabel: MODE_LABELS[res.mode] || '',
        categoryLabel: res.category ? (CATEGORY_LABELS[res.category] || res.category) : '',
        goalTypeLabel: GOAL_TYPE_LABELS[res.goal_type] || '',
        goalConfig: goalConfig,
        deadlineText: deadlineText,
        creatorName: res.creator ? res.creator.name : '',
        hasProgress: hasProgress,
        participants: participants,
        myParticipant: myP,
        myRole: myP ? myP.role : null,
        hasVoted: !!myP,
        hasSubmitted: myP ? !!myP.submission : false,
        isCreator: isCreator,
        myJudgments: myJudgments,
      });
    }).catch(function (err) {
      that.setData({ loading: false });
      wx.showToast({ title: err.message || '加载失败', icon: 'none' });
    });
  },

  // ── 投票 ──

  toggleJoinAsChallenger: function () {
    this.setData({ joinAsChallenger: !this.data.joinAsChallenger });
  },

  handleVote: function (e) {
    var approve = e.currentTarget.dataset.approve === 'true';
    var that = this;
    api.post('/quests/' + this.data.id + '/vote', {
      approve: approve,
      joinAsChallenger: approve ? this.data.joinAsChallenger : false,
    }).then(function () {
      wx.showToast({ title: approve ? '已赞成' : '已反对', icon: 'success' });
      that.loadDetail();
    }).catch(function (err) {
      wx.showToast({ title: err.message || '投票失败', icon: 'none' });
    });
  },

  // ── 接取悬赏 ──

  handleTakeBounty: function () {
    var that = this;
    api.post('/quests/' + this.data.id + '/vote', {
      approve: true,
      joinAsChallenger: true,
    }).then(function () {
      wx.showToast({ title: '已接取', icon: 'success' });
      that.loadDetail();
    }).catch(function (err) {
      wx.showToast({ title: err.message || '接取失败', icon: 'none' });
    });
  },

  // ── 提交完成 ──

  showSubmit: function () {
    this.setData({ showSubmitModal: true, submitText: '', submitPhotos: [], uploading: false, uploadProgress: 0 });
  },

  hideSubmit: function () {
    this.setData({ showSubmitModal: false });
  },

  onSubmitTextInput: function (e) {
    this.setData({ submitText: e.detail.value });
  },

  choosePhotos: function () {
    var that = this;
    var remaining = 3 - this.data.submitPhotos.length;
    if (remaining <= 0) {
      wx.showToast({ title: '最多3张照片', icon: 'none' });
      return;
    }
    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        var newPhotos = that.data.submitPhotos.slice();
        for (var i = 0; i < res.tempFiles.length; i++) {
          newPhotos.push({ tempPath: res.tempFiles[i].tempFilePath, url: '' });
        }
        that.setData({ submitPhotos: newPhotos });
      },
    });
  },

  removePhoto: function (e) {
    var idx = e.currentTarget.dataset.idx;
    var photos = this.data.submitPhotos.slice();
    photos.splice(idx, 1);
    this.setData({ submitPhotos: photos });
  },

  uploadOnePhoto: function (filePath) {
    return new Promise(function (resolve, reject) {
      wx.uploadFile({
        url: 'https://game.lifelab.rocks/api/upload/image',
        filePath: filePath,
        name: 'image',
        header: { Authorization: 'Bearer ' + api.token },
        success: function (res) {
          try {
            var data = JSON.parse(res.data);
            resolve(data.url);
          } catch (e) {
            reject(new Error('解析上传结果失败'));
          }
        },
        fail: reject,
      });
    });
  },

  submitCompletion: function () {
    var that = this;
    var text = this.data.submitText.trim();
    if (!text) {
      wx.showToast({ title: '请填写完成说明', icon: 'none' });
      return;
    }

    var photos = this.data.submitPhotos;
    if (photos.length === 0) {
      // 无照片，直接提交
      that.doSubmit(text, []);
      return;
    }

    // 有照片，逐张上传
    that.setData({ uploading: true, uploadProgress: 0 });
    var photoUrls = [];
    var uploaded = 0;

    function uploadNext() {
      if (uploaded >= photos.length) {
        that.setData({ uploading: false });
        that.doSubmit(text, photoUrls);
        return;
      }
      that.uploadOnePhoto(photos[uploaded].tempPath).then(function (url) {
        photoUrls.push(url);
        uploaded++;
        that.setData({ uploadProgress: Math.round((uploaded / photos.length) * 100) });
        uploadNext();
      }).catch(function () {
        that.setData({ uploading: false });
        wx.showToast({ title: '第' + (uploaded + 1) + '张图片上传失败', icon: 'none' });
      });
    }

    uploadNext();
  },

  doSubmit: function (text, photoUrls) {
    var that = this;
    api.post('/quests/' + this.data.id + '/submit', {
      text: text,
      photoUrls: photoUrls,
    }).then(function () {
      wx.showToast({ title: '提交成功', icon: 'success' });
      that.setData({ showSubmitModal: false });
      that.loadDetail();
    }).catch(function (err) {
      wx.showToast({ title: err.message || '提交失败', icon: 'none' });
    });
  },

  // ── 判定 ──

  handleJudge: function (e) {
    var targetUserId = parseInt(e.currentTarget.dataset.userid);
    var verdict = e.currentTarget.dataset.verdict;
    var that = this;
    api.post('/quests/' + this.data.id + '/judge', {
      targetUserId: targetUserId,
      verdict: verdict,
    }).then(function () {
      wx.showToast({ title: verdict === 'pass' ? '已通过' : '已判定未完成', icon: 'success' });
      that.loadDetail();
    }).catch(function (err) {
      wx.showToast({ title: err.message || '判定失败', icon: 'none' });
    });
  },
});
```

---

## 八、任务详情页（新建 miniprogram/pages/quest-detail/quest-detail.wxml）

```xml
<view class="page-container" wx:if="{{!loading && quest}}">

  <!-- 信息区 -->
  <view class="card">
    <!-- 标题 + 类型标签 -->
    <view class="flex-between" style="margin-bottom:12rpx">
      <text class="text-bright" style="font-size:34rpx;font-weight:700;flex:1">{{quest.title}}</text>
      <text class="quest-type-tag" style="background:rgba(255,255,255,0.08);color:{{typeColor}}">{{typeLabel}}</text>
    </view>
    <!-- 描述 -->
    <text wx:if="{{quest.description}}" class="text-dim" style="font-size:26rpx;display:block;margin-bottom:12rpx">{{quest.description}}</text>
    <!-- 元信息 -->
    <view style="display:flex;flex-wrap:wrap;gap:16rpx;font-size:24rpx">
      <text class="text-dim">发起人：{{creatorName}}</text>
      <text class="text-dim">状态：<text style="color:{{quest.status === 'active' ? '#10b981' : quest.status === 'completed' ? '#8b5cf6' : '#94a3b8'}}">{{statusLabel}}</text></text>
      <text wx:if="{{deadlineText}}" class="text-dim">{{deadlineText}}</text>
      <text wx:if="{{categoryLabel}}" class="text-dim">属性：{{categoryLabel}}</text>
      <text wx:if="{{modeLabel}}" class="text-dim">{{modeLabel}}</text>
      <text wx:if="{{goalTypeLabel}}" class="text-dim">结算：{{goalTypeLabel}}</text>
    </view>
    <!-- 奖励信息 -->
    <view wx:if="{{quest.bounty_stones > 0}}" style="margin-top:12rpx">
      <text class="text-gold" style="font-size:26rpx">💎 悬赏 {{quest.bounty_stones}} 灵石</text>
    </view>
  </view>

  <!-- 进度区（自动结算类型） -->
  <view wx:if="{{hasProgress}}" class="card">
    <view class="card-title">任务进度</view>
    <view wx:for="{{participants}}" wx:key="user_id">
      <view wx:if="{{item.role === 'challenger' || item.role === 'bounty_taker'}}" style="margin-bottom:16rpx">
        <view class="flex-between" style="margin-bottom:8rpx">
          <text class="text-bright" style="font-size:26rpx">{{item.name || item.nickname}}</text>
          <text class="text-dim" style="font-size:24rpx">{{item.progressCurrent}}/{{item.progressTarget}}</text>
        </view>
        <view class="goal-progress-bg">
          <view class="goal-progress-fill {{item.progressPct >= 100 ? 'goal-complete' : ''}}" style="width:{{item.progressPct}}%"></view>
        </view>
      </view>
    </view>
  </view>

  <!-- 参与者列表 -->
  <view class="card">
    <view class="card-title">参与者</view>
    <view wx:if="{{participants.length === 0}}" class="empty-state">暂无参与者</view>
    <view wx:else>
      <view class="qd-participant-row" wx:for="{{participants}}" wx:key="user_id">
        <view class="flex-row" style="gap:12rpx;flex:1;min-width:0">
          <!-- 头像占位 -->
          <view class="qd-avatar flex-center">
            <text style="font-size:26rpx;color:#fff">{{item.name[0] || '?'}}</text>
          </view>
          <!-- 信息 -->
          <view style="flex:1;min-width:0">
            <view class="flex-row" style="gap:8rpx">
              <text class="text-bright" style="font-size:28rpx">{{item.name || item.nickname}}</text>
              <text style="font-size:22rpx;color:{{item.roleColor}}">{{item.roleLabel}}</text>
            </view>
            <view class="flex-row" style="gap:12rpx;margin-top:4rpx">
              <text wx:if="{{item.vote}}" class="text-dim" style="font-size:22rpx">{{item.vote === 'approve' ? '赞成' : '反对'}}</text>
              <text wx:if="{{item.hasSubmission}}" class="text-blue" style="font-size:22rpx">已提交</text>
              <text wx:if="{{item.resultLabel}}" style="font-size:22rpx;color:{{item.resultColor}}">{{item.resultLabel}}</text>
            </view>
          </view>
        </view>

        <!-- judging 阶段：判定按钮（非挑战者自己、目标已提交、我未判定过） -->
        <view wx:if="{{quest.status === 'judging' && item.role === 'challenger' && item.user_id !== userId && item.hasSubmission && !myJudgments[item.user_id]}}"
          class="flex-row" style="gap:8rpx">
          <button class="judge-btn judge-btn-pass"
            data-userid="{{item.user_id}}" data-verdict="pass" bindtap="handleJudge">通过</button>
          <button class="judge-btn judge-btn-fail"
            data-userid="{{item.user_id}}" data-verdict="fail" bindtap="handleJudge">未完成</button>
        </view>
        <!-- 已判定标记 -->
        <text wx:if="{{quest.status === 'judging' && myJudgments[item.user_id]}}"
          class="text-dim" style="font-size:22rpx">已判定</text>
      </view>
    </view>
  </view>

  <!-- 提交内容展示（judging/completed 阶段展示所有人的提交） -->
  <view wx:if="{{quest.status === 'judging' || quest.status === 'completed' || quest.status === 'failed'}}" class="card">
    <view class="card-title">提交记录</view>
    <view wx:for="{{participants}}" wx:key="user_id">
      <view wx:if="{{item.hasSubmission}}" class="qd-submission-item">
        <text class="text-bright" style="font-size:26rpx;font-weight:600">{{item.name || item.nickname}}</text>
        <text class="text-dim" style="font-size:26rpx;display:block;margin-top:4rpx">{{item.submissionText}}</text>
        <!-- 照片网格 -->
        <view wx:if="{{item.submissionPhotos.length > 0}}" class="qd-photo-grid">
          <image wx:for="{{item.submissionPhotos}}" wx:for-item="photo" wx:key="*this"
            src="{{photo}}" mode="aspectFill" class="qd-photo-thumb"></image>
        </view>
      </view>
    </view>
    <view wx:if="{{!participants.some}}" class="empty-state">暂无提交</view>
  </view>

  <!-- 结算结果（completed/failed） -->
  <view wx:if="{{quest.status === 'completed' || quest.status === 'failed'}}" class="card" style="text-align:center">
    <text class="{{quest.status === 'completed' ? 'text-green' : 'text-dim'}}" style="font-size:30rpx;font-weight:600">
      {{quest.status === 'completed' ? '任务完成' : '任务失败'}}
    </text>
  </view>

  <!-- 操作区（底部固定栏） -->
  <view class="qd-action-bar">

    <!-- voting + 未投票 -->
    <view wx:if="{{quest.status === 'voting' && !hasVoted && !isCreator}}">
      <view wx:if="{{quest.type === 'challenge'}}" class="flex-row" style="gap:8rpx;margin-bottom:16rpx;justify-content:center">
        <view class="qd-checkbox {{joinAsChallenger ? 'qd-checkbox-active' : ''}}" bindtap="toggleJoinAsChallenger">
          <text wx:if="{{joinAsChallenger}}" style="font-size:20rpx;color:#fff">✓</text>
        </view>
        <text class="text-dim" style="font-size:26rpx" bindtap="toggleJoinAsChallenger">一起挑战</text>
      </view>
      <view class="flex-row" style="gap:16rpx">
        <button class="btn btn-secondary" style="flex:1" data-approve="false" bindtap="handleVote">反对</button>
        <button class="btn btn-primary" style="flex:1" data-approve="true" bindtap="handleVote">赞成</button>
      </view>
    </view>

    <!-- voting + 已投票 -->
    <view wx:if="{{quest.status === 'voting' && (hasVoted || isCreator)}}" style="text-align:center">
      <text class="text-dim" style="font-size:28rpx">{{isCreator ? '等待家庭成员投票' : '已投票，等待结果'}}</text>
    </view>

    <!-- active + 挑战者未提交 -->
    <view wx:if="{{quest.status === 'active' && myRole === 'challenger' && !hasSubmitted}}">
      <button class="btn btn-primary" style="width:100%" bindtap="showSubmit">提交完成</button>
    </view>

    <!-- active + bounty_taker 未提交 -->
    <view wx:if="{{quest.status === 'active' && myRole === 'bounty_taker' && !hasSubmitted}}">
      <button class="btn btn-primary" style="width:100%" bindtap="showSubmit">提交完成</button>
    </view>

    <!-- active + 悬赏类型 + 未参与 -->
    <view wx:if="{{quest.status === 'active' && quest.type === 'bounty' && !myParticipant}}">
      <button class="btn btn-primary" style="width:100%" bindtap="handleTakeBounty">接取悬赏</button>
    </view>

    <!-- active + 已提交 -->
    <view wx:if="{{quest.status === 'active' && hasSubmitted}}" style="text-align:center">
      <text class="text-dim" style="font-size:28rpx">已提交，等待结算</text>
    </view>

    <!-- cancelled -->
    <view wx:if="{{quest.status === 'cancelled'}}" style="text-align:center">
      <text class="text-dim" style="font-size:28rpx">任务已取消</text>
    </view>

  </view>

</view>

<!-- 加载中 -->
<view wx:if="{{loading}}" class="empty-state" style="padding-top:200rpx">
  <text>加载中...</text>
</view>

<!-- 提交弹窗 -->
<view wx:if="{{showSubmitModal}}" class="modal-mask" bindtap="hideSubmit">
  <view class="modal-content qd-submit-modal" catchtap="">
    <view class="flex-between" style="margin-bottom:24rpx">
      <text class="card-title" style="margin-bottom:0">提交完成</text>
      <text class="text-dim" style="font-size:32rpx;padding:8rpx" bindtap="hideSubmit">✕</text>
    </view>

    <!-- 文字输入 -->
    <view class="form-group">
      <text class="form-label">完成说明</text>
      <textarea class="form-textarea" placeholder="描述你的完成情况" value="{{submitText}}" bindinput="onSubmitTextInput"
        maxlength="500" style="min-height:160rpx"></textarea>
    </view>

    <!-- 照片选择 -->
    <view class="form-group">
      <text class="form-label">照片（可选，最多3张）</text>
      <view class="qd-photo-grid" style="margin-top:8rpx">
        <view wx:for="{{submitPhotos}}" wx:key="tempPath" class="qd-photo-wrap">
          <image src="{{item.tempPath}}" mode="aspectFill" class="qd-photo-thumb"></image>
          <view class="qd-photo-remove" data-idx="{{index}}" bindtap="removePhoto">✕</view>
        </view>
        <view wx:if="{{submitPhotos.length < 3}}" class="qd-photo-add" bindtap="choosePhotos">
          <text style="font-size:48rpx;color:#64748b">+</text>
        </view>
      </view>
    </view>

    <!-- 上传进度 -->
    <view wx:if="{{uploading}}" style="margin-bottom:16rpx">
      <view class="goal-progress-bg">
        <view class="goal-progress-fill" style="width:{{uploadProgress}}%"></view>
      </view>
      <text class="text-dim" style="font-size:24rpx;margin-top:4rpx;display:block;text-align:center">上传中 {{uploadProgress}}%</text>
    </view>

    <!-- 提交按钮 -->
    <button class="btn btn-primary" style="width:100%" bindtap="submitCompletion" disabled="{{uploading}}">
      {{uploading ? '上传中...' : '确认提交'}}
    </button>
  </view>
</view>
```

---

## 九、任务详情页（新建 miniprogram/pages/quest-detail/quest-detail.wxss）

```css
/* 类型标签（复用列表页样式） */
.quest-type-tag {
  font-size: 22rpx;
  font-weight: 600;
  padding: 4rpx 16rpx;
  border-radius: 16rpx;
  flex-shrink: 0;
  margin-left: 12rpx;
}

/* 参与者行 */
.qd-participant-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16rpx 0;
  border-bottom: 1rpx solid rgba(51, 65, 85, 0.3);
}

.qd-participant-row:last-child {
  border-bottom: none;
}

/* 头像占位 */
.qd-avatar {
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  background: #334155;
  flex-shrink: 0;
}

/* 判定按钮 */
.judge-btn {
  padding: 8rpx 20rpx;
  font-size: 22rpx;
  border-radius: 8rpx;
  background: #252540;
  color: #94a3b8;
  border: 1rpx solid #334155;
  min-height: auto;
}

.judge-btn-pass {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
  border-color: #10b981;
}

.judge-btn-fail {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
  border-color: #ef4444;
}

/* 操作栏 */
.qd-action-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  background: #1a1a2e;
  padding: 24rpx 32rpx calc(24rpx + env(safe-area-inset-bottom));
  border-top: 1rpx solid #334155;
  z-index: 100;
}

/* 勾选框 */
.qd-checkbox {
  width: 40rpx;
  height: 40rpx;
  border-radius: 8rpx;
  border: 2rpx solid #334155;
  background: #252540;
  display: flex;
  align-items: center;
  justify-content: center;
}

.qd-checkbox-active {
  background: #8b5cf6;
  border-color: #8b5cf6;
}

/* 提交弹窗 */
.qd-submit-modal {
  width: 650rpx;
  max-height: 80vh;
  overflow-y: auto;
}

/* 提交记录 */
.qd-submission-item {
  padding: 16rpx 0;
  border-bottom: 1rpx solid rgba(51, 65, 85, 0.3);
}

.qd-submission-item:last-child {
  border-bottom: none;
}

/* 照片网格 */
.qd-photo-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 12rpx;
}

.qd-photo-thumb {
  width: 160rpx;
  height: 160rpx;
  border-radius: 12rpx;
  object-fit: cover;
}

.qd-photo-wrap {
  position: relative;
  width: 160rpx;
  height: 160rpx;
}

.qd-photo-remove {
  position: absolute;
  top: -8rpx;
  right: -8rpx;
  width: 36rpx;
  height: 36rpx;
  border-radius: 50%;
  background: rgba(239, 68, 68, 0.9);
  color: #fff;
  font-size: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.qd-photo-add {
  width: 160rpx;
  height: 160rpx;
  border-radius: 12rpx;
  border: 2rpx dashed #334155;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #252540;
}

/* 页面底部留出操作栏空间 */
.page-container {
  padding-bottom: calc(160rpx + env(safe-area-inset-bottom));
}
```

---

## 十、创建任务页（新建 miniprogram/pages/quest-create/quest-create.json）

```json
{
  "navigationBarTitleText": "发起任务",
  "navigationBarBackgroundColor": "#0f0f1a",
  "navigationBarTextStyle": "white",
  "usingComponents": {}
}
```

---

## 十一、创建任务页（新建 miniprogram/pages/quest-create/quest-create.js）

```js
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
    // 类型选择
    typeIndex: 0,
    typeLabels: TYPE_LABELS,
    // 表单字段
    title: '',
    description: '',
    // 属性类别
    categoryIndex: -1,
    categoryOptions: CATEGORY_OPTIONS,
    // 截止时间
    deadline: '',
    minDate: '',
    // 结算方式
    goalTypeIndex: 0,
    goalTypeLabels: GOAL_TYPE_LABELS,
    // 自动结算参数
    goalTarget: '',
    goalCategory: '',
    goalSubType: '',
    goalAttribute: '',
    goalPeriod: '',
    // 模式（仅 challenge）
    modeIndex: 0,
    modeLabels: MODE_LABELS,
    // 灵石（仅 bounty）
    rewardStones: '',
    myStones: 0,
    // 状态
    submitting: false,
  },

  onShow: function () {
    // 设置最小日期为明天
    var tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    var minDate = tomorrow.getFullYear() + '-' +
      String(tomorrow.getMonth() + 1).padStart(2, '0') + '-' +
      String(tomorrow.getDate()).padStart(2, '0');
    this.setData({ minDate: minDate });

    // 加载灵石余额
    this.loadMyStones();
  },

  loadMyStones: function () {
    var that = this;
    api.get('/character').then(function (res) {
      var stones = Number(res.spiritStones || 0);
      that.setData({ myStones: stones });
    }).catch(function () {});
  },

  // ── 类型切换 ──

  switchType: function (e) {
    var idx = parseInt(e.currentTarget.dataset.idx);
    this.setData({ typeIndex: idx });
  },

  // ── 输入事件 ──

  onTitleInput: function (e) { this.setData({ title: e.detail.value }); },
  onDescInput: function (e) { this.setData({ description: e.detail.value }); },
  onRewardInput: function (e) { this.setData({ rewardStones: e.detail.value }); },
  onGoalTargetInput: function (e) { this.setData({ goalTarget: e.detail.value }); },
  onGoalSubTypeInput: function (e) { this.setData({ goalSubType: e.detail.value }); },
  onGoalPeriodInput: function (e) { this.setData({ goalPeriod: e.detail.value }); },

  onCategoryChange: function (e) {
    this.setData({ categoryIndex: parseInt(e.detail.value) });
  },

  onDeadlineChange: function (e) {
    this.setData({ deadline: e.detail.value });
  },

  onGoalTypeChange: function (e) {
    this.setData({ goalTypeIndex: parseInt(e.detail.value) });
  },

  onModeChange: function (e) {
    this.setData({ modeIndex: parseInt(e.detail.value) });
  },

  // ── 提交 ──

  submit: function () {
    var that = this;
    var type = TYPE_OPTIONS[this.data.typeIndex];
    var title = this.data.title.trim();
    var description = this.data.description.trim();
    var deadline = this.data.deadline;

    // 校验
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
        if (this.data.categoryIndex >= 0) {
          goalConfig.category = CATEGORY_OPTIONS[this.data.categoryIndex];
        }
      } else if (goalType === 'attr_accumulate') {
        var attrMap = { '体魄': 'physique', '悟性': 'comprehension', '意志': 'willpower', '灵巧': 'dexterity', '感知': 'perception' };
        if (this.data.categoryIndex < 0) {
          wx.showToast({ title: '请选择属性类别', icon: 'none' });
          return;
        }
        goalConfig.attribute = attrMap[CATEGORY_OPTIONS[this.data.categoryIndex]] || '';
      }

      // period 自动根据 deadline 推算
      goalConfig.period = this.data.goalPeriod.trim() || deadline.substring(0, 7);
    }

    // bounty 校验
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
      // 跳转到详情页
      wx.redirectTo({ url: '/pages/quest-detail/quest-detail?id=' + res.id });
    }).catch(function (err) {
      that.setData({ submitting: false });
      wx.showToast({ title: err.message || '创建失败', icon: 'none' });
    });
  },
});
```

---

## 十二、创建任务页（新建 miniprogram/pages/quest-create/quest-create.wxml）

```xml
<view class="page-container">

  <!-- 类型选择 -->
  <view class="card">
    <view class="card-title">任务类型</view>
    <view class="qc-type-row">
      <view class="qc-type-btn {{typeIndex === 0 ? 'qc-type-active qc-type-self' : ''}}"
        data-idx="0" bindtap="switchType">
        <text>自我悬赏</text>
      </view>
      <view class="qc-type-btn {{typeIndex === 1 ? 'qc-type-active qc-type-challenge' : ''}}"
        data-idx="1" bindtap="switchType">
        <text>挑战</text>
      </view>
      <view class="qc-type-btn {{typeIndex === 2 ? 'qc-type-active qc-type-bounty' : ''}}"
        data-idx="2" bindtap="switchType">
        <text>悬赏</text>
      </view>
    </view>
    <view class="qc-type-hint">
      <text wx:if="{{typeIndex === 0}}" class="text-dim" style="font-size:24rpx">给自己设定目标，无需投票直接生效</text>
      <text wx:if="{{typeIndex === 1}}" class="text-dim" style="font-size:24rpx">向家庭成员发起挑战，需投票通过</text>
      <text wx:if="{{typeIndex === 2}}" class="text-dim" style="font-size:24rpx">出资灵石悬赏，完成者获得灵石奖励</text>
    </view>
  </view>

  <!-- 基本信息 -->
  <view class="card">
    <!-- 标题 -->
    <view class="form-group">
      <text class="form-label">标题</text>
      <input class="form-input" placeholder="任务标题（1-50字）" value="{{title}}" bindinput="onTitleInput" maxlength="50" />
    </view>

    <!-- 描述 -->
    <view class="form-group">
      <text class="form-label">描述（可选）</text>
      <textarea class="form-textarea" placeholder="补充说明任务要求" value="{{description}}" bindinput="onDescInput" maxlength="500"></textarea>
    </view>

    <!-- 属性类别 -->
    <view class="form-group">
      <text class="form-label">属性类别（可选）</text>
      <picker range="{{categoryOptions}}" value="{{categoryIndex}}" bindchange="onCategoryChange">
        <view class="form-input flex-between">
          <text>{{categoryIndex >= 0 ? categoryOptions[categoryIndex] : '选择属性'}}</text>
          <text class="text-dim">▼</text>
        </view>
      </picker>
    </view>

    <!-- 截止时间 -->
    <view class="form-group">
      <text class="form-label">截止时间</text>
      <picker mode="date" start="{{minDate}}" value="{{deadline}}" bindchange="onDeadlineChange">
        <view class="form-input flex-between">
          <text>{{deadline || '选择日期'}}</text>
          <text class="text-dim">▼</text>
        </view>
      </picker>
    </view>
  </view>

  <!-- 结算方式 -->
  <view class="card">
    <view class="card-title">结算方式</view>
    <picker range="{{goalTypeLabels}}" value="{{goalTypeIndex}}" bindchange="onGoalTypeChange">
      <view class="form-input flex-between" style="margin-bottom:16rpx">
        <text>{{goalTypeLabels[goalTypeIndex]}}</text>
        <text class="text-dim">▼</text>
      </view>
    </picker>

    <!-- 自动结算参数（非 manual 时展开） -->
    <block wx:if="{{goalTypeIndex > 0}}">
      <!-- 目标数值 -->
      <view class="form-group">
        <text class="form-label">目标数值</text>
        <input class="form-input" type="number" placeholder="如：5" value="{{goalTarget}}" bindinput="onGoalTargetInput" />
      </view>

      <!-- streak_days 需要子类型 -->
      <view wx:if="{{goalTypeIndex === 2}}" class="form-group">
        <text class="form-label">行为子类型</text>
        <input class="form-input" placeholder="如：早起" value="{{goalSubType}}" bindinput="onGoalSubTypeInput" />
      </view>

      <!-- 统计周期（可选） -->
      <view class="form-group">
        <text class="form-label">统计周期（可选，默认按截止月份）</text>
        <input class="form-input" placeholder="如：2026-04 或 2026-W17" value="{{goalPeriod}}" bindinput="onGoalPeriodInput" />
      </view>
    </block>
  </view>

  <!-- 模式选择（仅 challenge） -->
  <view wx:if="{{typeIndex === 1}}" class="card">
    <view class="card-title">模式</view>
    <picker range="{{modeLabels}}" value="{{modeIndex}}" bindchange="onModeChange">
      <view class="form-input flex-between">
        <text>{{modeLabels[modeIndex]}}</text>
        <text class="text-dim">▼</text>
      </view>
    </picker>
    <text class="text-dim" style="font-size:24rpx;display:block;margin-top:8rpx">
      {{modeIndex === 0 ? '合作模式：全员达成才全员获奖' : '竞争模式：按完成排名，第1名品质升一级'}}
    </text>
  </view>

  <!-- 灵石出资（仅 bounty） -->
  <view wx:if="{{typeIndex === 2}}" class="card">
    <view class="card-title">悬赏灵石</view>
    <view class="form-group">
      <view class="flex-between" style="margin-bottom:8rpx">
        <text class="form-label" style="margin-bottom:0">出资数量</text>
        <text class="text-gold" style="font-size:24rpx">余额：💎 {{myStones}}</text>
      </view>
      <input class="form-input" type="number" placeholder="输入灵石数量" value="{{rewardStones}}" bindinput="onRewardInput" />
    </view>
  </view>

  <!-- 提交按钮 -->
  <view style="margin-top:16rpx;padding-bottom:32rpx">
    <button class="btn btn-primary" style="width:100%" bindtap="submit" disabled="{{submitting}}">
      {{submitting ? '创建中...' : '确认创建'}}
    </button>
  </view>

</view>
```

---

## 十三、创建任务页（新建 miniprogram/pages/quest-create/quest-create.wxss）

```css
/* 类型选择行 */
.qc-type-row {
  display: flex;
  gap: 12rpx;
  margin-bottom: 12rpx;
}

.qc-type-btn {
  flex: 1;
  text-align: center;
  padding: 20rpx 0;
  border-radius: 12rpx;
  font-size: 28rpx;
  font-weight: 500;
  color: #cbd5e1;
  background: #252540;
  border: 2rpx solid #334155;
}

.qc-type-active {
  font-weight: 600;
  color: #fff;
}

.qc-type-self {
  background: rgba(126, 200, 227, 0.15);
  border-color: #7ec8e3;
  color: #7ec8e3;
}

.qc-type-challenge {
  background: rgba(199, 125, 186, 0.15);
  border-color: #c77dba;
  color: #c77dba;
}

.qc-type-bounty {
  background: rgba(232, 168, 124, 0.15);
  border-color: #e8a87c;
  color: #e8a87c;
}

.qc-type-hint {
  margin-top: 4rpx;
}
```

---

## 十四、首页集成（修改 miniprogram/pages/home/home.js）

### 14.1 data 新增字段

在 `data` 对象中，`version: ''` 之前新增：

```js
    dailyQuest: null,
    pendingQuestCount: 0,
```

### 14.2 onShow 中新增调用

在 `this.loadData();` 之后新增两行：

```js
    this.loadDailyQuest();
    this.loadPendingCount();
```

修改后 onShow 为：

```js
  onShow() {
    if (!api.isLoggedIn()) return;
    this.loadData();
    this.loadDailyQuest();
    this.loadPendingCount();
  },
```

### 14.3 新增方法

在 `goToReport()` 方法之前新增以下方法：

```js
  loadDailyQuest() {
    var that = this;
    api.get('/quests/daily').then(function (res) {
      if (res && res.id) {
        that.setData({ dailyQuest: res });
      } else {
        that.setData({ dailyQuest: null });
      }
    }).catch(function () {
      that.setData({ dailyQuest: null });
    });
  },

  loadPendingCount() {
    var that = this;
    api.get('/quests?status=voting&limit=1').then(function (res) {
      that.setData({ pendingQuestCount: res.total || 0 });
    }).catch(function () {
      that.setData({ pendingQuestCount: 0 });
    });
  },

  goQuests() {
    wx.navigateTo({ url: '/pages/quest/quest' });
  },

  goDailyQuest() {
    if (this.data.dailyQuest && this.data.dailyQuest.id) {
      wx.navigateTo({ url: '/pages/quest-detail/quest-detail?id=' + this.data.dailyQuest.id });
    }
  },
```

---

## 十五、首页集成（修改 miniprogram/pages/home/home.wxml）

### 15.1 插入今日悬赏卡片

在「今日推荐」卡片之前（找到 `<!-- 今日推荐 -->` 注释），插入今日悬赏卡片：

```xml
  <!-- 今日悬赏 -->
  <view wx:if="{{dailyQuest}}" class="card home-daily-quest" bindtap="goDailyQuest">
    <view class="flex-between">
      <view class="flex-row" style="gap:12rpx;flex:1;min-width:0">
        <text class="home-daily-badge">今日悬赏</text>
        <text class="text-bright" style="font-size:28rpx;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{dailyQuest.title}}</text>
      </view>
      <text wx:if="{{dailyQuest.my_submission}}" class="text-green" style="font-size:24rpx;flex-shrink:0">已完成</text>
      <text wx:else class="text-gold" style="font-size:24rpx;flex-shrink:0">待完成 ></text>
    </view>
  </view>
```

即在以下位置之前插入：

```xml
  <!-- 今日推荐 -->
  <view class="card" wx:if="{{recommendations}}">
```

### 15.2 FAB 按钮组新增「任务」按钮

在现有 FAB 按钮组中，「报告」按钮之前新增「任务」按钮。

找到：

```xml
  <!-- 浮动按钮组 -->
  <view class="fab-container">
    <view class="fab-btn fab-btn-secondary" bindtap="goToReport">
```

在 `<view class="fab-container">` 之后、报告按钮之前插入：

```xml
    <view class="fab-btn fab-btn-secondary" bindtap="goQuests" style="position:relative">
      <text class="fab-icon">📋</text>
      <text class="fab-label">任务</text>
      <view wx:if="{{pendingQuestCount > 0}}" class="fab-dot"></view>
    </view>
```

修改后 FAB 区域完整代码：

```xml
  <!-- 浮动按钮组 -->
  <view class="fab-container">
    <view class="fab-btn fab-btn-secondary" bindtap="goQuests" style="position:relative">
      <text class="fab-icon">📋</text>
      <text class="fab-label">任务</text>
      <view wx:if="{{pendingQuestCount > 0}}" class="fab-dot"></view>
    </view>
    <view class="fab-btn fab-btn-secondary" bindtap="goToReport">
      <text class="fab-icon">📊</text>
      <text class="fab-label">报告</text>
    </view>
    <view class="fab-btn {{checkinStatus.checkedInToday ? 'fab-btn-done' : 'fab-btn-active'}}" bindtap="showCheckin">
      <text class="fab-icon">{{checkinStatus.checkedInToday ? '✓' : '📅'}}</text>
      <text class="fab-label">签到</text>
      <view wx:if="{{checkinStatus && !checkinStatus.checkedInToday}}" class="fab-dot"></view>
    </view>
  </view>
```

---

## 十六、首页集成（修改 miniprogram/pages/home/home.wxss）

在文件末尾追加：

```css
/* 今日悬赏卡片 */
.home-daily-quest {
  border: 2rpx solid #d4a574;
}

.home-daily-badge {
  font-size: 22rpx;
  font-weight: 600;
  color: #0f0f1a;
  background: linear-gradient(135deg, #d4a574, #f5d4a0);
  padding: 4rpx 16rpx;
  border-radius: 8rpx;
  flex-shrink: 0;
}
```

---

## 十七、家庭页集成（修改 miniprogram/pages/family/family.js）

### 17.1 data 新增字段

在 `data` 对象中，`_reactingMap: {}` 之前新增：

```js
    // 家庭任务
    familyQuests: [],
```

### 17.2 loadAll 中新增请求

在 `Promise.all` 数组中新增一个请求。

找到：

```js
    Promise.all([
      api.get('/family/members').catch(function () { return []; }),
      api.get('/family/feed').catch(function () { return []; }),
      api.get('/wishes').catch(function () { return []; }),
    ]).then(function (res) {
```

修改为：

```js
    Promise.all([
      api.get('/family/members').catch(function () { return []; }),
      api.get('/family/feed').catch(function () { return []; }),
      api.get('/wishes').catch(function () { return []; }),
      api.get('/quests?status=active,voting&limit=3').catch(function () { return { quests: [] }; }),
    ]).then(function (res) {
```

### 17.3 then 回调中处理任务数据

在 `var teamWishes = ...` 之后新增：

```js
      var rawQuests = res[3] || {};
      var familyQuests = (rawQuests.quests || []).map(function (q) {
        var statusLabel = q.status === 'voting' ? '投票中' : '进行中';
        var statusColor = q.status === 'voting' ? '#f59e0b' : '#10b981';
        return {
          id: q.id,
          title: q.title,
          statusLabel: statusLabel,
          statusColor: statusColor,
          participantCount: q.participant_count || 0,
        };
      });
```

### 17.4 setData 中新增 familyQuests

在 `that.setData({` 调用中，`wishes: teamWishes,` 之后新增：

```js
        familyQuests: familyQuests,
```

### 17.5 新增跳转方法

在 `goToArena()` 方法之前新增：

```js
  goQuests: function () {
    wx.navigateTo({ url: '/pages/quest/quest' });
  },

  goQuestDetail: function (e) {
    var id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/quest-detail/quest-detail?id=' + id });
  },
```

---

## 十八、家庭页集成（修改 miniprogram/pages/family/family.wxml）

在团队愿望卡片之后、擂台入口之前插入家庭任务卡片。

找到：

```xml
    <!-- 擂台入口 -->
    <view class="card" bindtap="goToArena"
```

在其之前插入：

```xml
    <!-- 家庭任务 -->
    <view class="card" wx:if="{{familyQuests.length > 0}}">
      <view class="flex-between" style="margin-bottom:16rpx">
        <view class="card-title" style="margin-bottom:0">家庭任务</view>
        <text class="text-primary" style="font-size:24rpx" bindtap="goQuests">查看全部 ></text>
      </view>
      <view class="fq-list">
        <view class="fq-item" wx:for="{{familyQuests}}" wx:key="id"
          bindtap="goQuestDetail" data-id="{{item.id}}">
          <view class="flex-between">
            <text class="text-bright" style="font-size:28rpx;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{item.title}}</text>
            <text style="font-size:22rpx;color:{{item.statusColor}};flex-shrink:0;margin-left:12rpx">{{item.statusLabel}}</text>
          </view>
          <text class="text-dim" style="font-size:22rpx;margin-top:4rpx;display:block">{{item.participantCount}}人参与</text>
        </view>
      </view>
    </view>
```

---

## 十九、家庭页集成（修改 miniprogram/pages/family/family.wxss）

在文件末尾追加：

```css
/* 家庭任务卡片 */
.fq-list {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.fq-item {
  padding: 16rpx 20rpx;
  background: #252540;
  border-radius: 12rpx;
}

.fq-item:active {
  opacity: 0.7;
}
```

---

## 二十、验证清单

1. `app.json` 中 pages 数组包含 `pages/quest/quest`、`pages/quest-detail/quest-detail`、`pages/quest-create/quest-create`，位于 `pages/arena/arena` 之前
2. 任务列表页加载时调用 `GET /api/quests/daily` 和 `GET /api/quests?status=active&page=1&limit=20`
3. 三个 tab 切换正常：进行中/投票中/已结束，切换时重新加载
4. 今日悬赏金色边框卡片仅在「进行中」tab 显示，点击跳转详情
5. 任务卡片显示标题、类型标签（不同颜色）、截止时间、参与人数、我的角色标记
6. 右下角「+」按钮跳转创建页
7. 分页加载：滚动到底部点击「加载更多」
8. 任务详情页通过 `GET /api/quests/:id` 加载，展示完整信息
9. voting 状态：未投票成员看到赞成/反对按钮，challenge 类型有「一起挑战」勾选框
10. active 状态：挑战者看到「提交完成」按钮，bounty 未接取者看到「接取悬赏」按钮
11. 提交弹窗：文字输入（必填）+ 照片选择（最多3张）+ 上传进度条
12. 照片上传使用 `wx.uploadFile` 调用 `/api/upload/image`，携带 Bearer token
13. judging 状态：非挑战者看到通过/未完成判定按钮，已判定显示标记
14. completed/failed 状态：显示结算结果和提交记录
15. 创建页类型选择联动：自我悬赏/挑战/悬赏，不同类型显示不同字段
16. 结算方式选择「自动结算」后展开目标参数输入
17. 悬赏类型显示灵石余额和出资输入，校验不超过余额
18. 创建成功后 redirectTo 详情页
19. 首页「今日悬赏」金色边框卡片显示在「今日推荐」之前，点击跳转详情
20. 首页 FAB 新增「任务」按钮，有待投票任务时显示红点
21. 家庭页「家庭任务」卡片显示最多3条进行中/投票中任务，点击跳转详情
22. 家庭页「查看全部」跳转任务列表页
