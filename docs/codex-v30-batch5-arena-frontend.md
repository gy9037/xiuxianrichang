# Codex 指令：V1.2.7 第五批 - 前端（擂台系统）

> **需求来源**：策划案-09-修炼擂台
> **技术方案**：tech-v127-擂台系统.md
> **执行顺序**：先执行后端指令，再执行本文件（前端）
> **前置条件**：后端 arena 路由已注册，arenas/arena_participants 表已创建

---

## 一、注册擂台页面（修改 miniprogram/app.json）

在 `pages` 数组中，`"pages/login/login"` 之前新增：

```json
"pages/arena/arena",
```

修改后 pages 数组为：

```json
"pages": [
  "pages/home/home",
  "pages/behavior/behavior",
  "pages/inventory/inventory",
  "pages/wish/wish",
  "pages/family/family",
  "pages/arena/arena",
  "pages/login/login"
]
```

注意：如果此时 report 页面已注册，arena 放在 report 之后、login 之前即可。

---

## 二、家庭页添加擂台入口（修改 miniprogram/pages/family/family.js）

在 `toggleWishMembers` 方法之后，新增方法：

```js
goToArena() {
  wx.navigateTo({ url: '/pages/arena/arena' });
},
```

---

## 三、家庭页添加擂台入口按钮（修改 miniprogram/pages/family/family.wxml）

在团队愿望卡片（`</view>` 闭合 `<!-- 团队愿望 -->` 所在的 card）之后、`</block>` 之前，新增擂台入口卡片：

找到：
```xml
    </view>
  </block>
</view>
```

在 `</block>` 之前插入：

```xml
    <!-- 擂台入口 -->
    <view class="card" bindtap="goToArena" style="display:flex;align-items:center;justify-content:space-between;">
      <view>
        <text class="card-title" style="margin-bottom:0">擂台</text>
        <text class="text-dim" style="font-size:24rpx;display:block;margin-top:4rpx">发起挑战，一较高下</text>
      </view>
      <text class="text-dim" style="font-size:28rpx">></text>
    </view>
```

---

## 四、新建 miniprogram/pages/arena/arena.json

```json
{
  "navigationBarTitleText": "擂台",
  "navigationBarBackgroundColor": "#0f0f1a",
  "navigationBarTextStyle": "white",
  "usingComponents": {}
}
```

---

## 五、新建 miniprogram/pages/arena/arena.js

```js
const api = require('../../utils/api');

const TYPE_OPTIONS = ['出题挑战', '对局记录', '体能比拼'];
const TYPE_MAP = { '出题挑战': 'quiz', '对局记录': 'match', '体能比拼': 'fitness' };
const TYPE_LABEL = { quiz: '出题挑战', match: '对局记录', fitness: '体能比拼' };
const CURRENCY_OPTIONS = ['灵石', '筹码'];
const CURRENCY_MAP = { '灵石': 'stones', '筹码': 'chips' };
const RESULT_LABEL = { win: '胜', lose: '负', draw: '平' };
const RESULT_COLOR = { win: '#22c55e', lose: '#ef4444', draw: '#94a3b8' };

Page({
  data: {
    // 列表
    arenas: [],
    activeTab: 'active',
    // 详情
    arena: null,
    arenaId: null,
    participants: [],
    isCreator: false,
    myParticipant: null,
    // 创建表单
    showCreateForm: false,
    createTypeIndex: 0,
    createTitle: '',
    createDescription: '',
    createCurrencyIndex: 0,
    createRewardPool: '',
    quizQuestion: '',
    quizAnswer: '',
    fitnessMetric: '',
    fitnessUnit: '',
    matchGame: '',
    // 提交表单
    answerText: '',
    scoreInput: '',
    evidenceImage: '',
    // 常量传入模板
    typeOptions: TYPE_OPTIONS,
    currencyOptions: CURRENCY_OPTIONS,
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ arenaId: parseInt(options.id) });
      this.loadArenaDetail();
    } else {
      this.loadArenaList();
    }
  },

  onShow() {
    if (this.data.arenaId) {
      this.loadArenaDetail();
    } else {
      this.loadArenaList();
    }
  },

  // ── 列表 ──

  loadArenaList() {
    var that = this;
    api.get('/arenas?status=' + this.data.activeTab).then(function (res) {
      var list = (res.arenas || []).map(function (a) {
        a.typeLabel = TYPE_LABEL[a.type] || a.type;
        return a;
      });
      that.setData({ arenas: list });
    }).catch(function () {
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  switchTab(e) {
    var tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
    this.loadArenaList();
  },

  goToDetail(e) {
    var id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/arena/arena?id=' + id });
  },

  // ── 详情 ──

  loadArenaDetail() {
    var that = this;
    var id = this.data.arenaId;
    api.get('/arenas/' + id).then(function (res) {
      var userId = api.user ? api.user.id : null;
      var isCreator = res.creator_id === userId;
      var participants = (res.participants || []).map(function (p) {
        p.resultLabel = p.result ? RESULT_LABEL[p.result] : '';
        p.resultColor = p.result ? RESULT_COLOR[p.result] : '';
        p.hasSubmitted = !!p.submission;
        p.judgeResult = p.result || '';
        p.chipChange = p.currency_change || 0;
        return p;
      });
      var myP = null;
      for (var i = 0; i < participants.length; i++) {
        if (participants[i].user_id === userId) {
          myP = participants[i];
          break;
        }
      }
      res.typeLabel = TYPE_LABEL[res.type] || res.type;
      that.setData({
        arena: res,
        participants: participants,
        isCreator: isCreator,
        myParticipant: myP,
      });
    }).catch(function () {
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  // ── 创建 ──

  showCreate() {
    this.setData({ showCreateForm: true });
  },

  hideCreate() {
    this.setData({ showCreateForm: false });
  },

  onTypeChange(e) {
    this.setData({ createTypeIndex: parseInt(e.detail.value) });
  },

  onCurrencyChange(e) {
    this.setData({ createCurrencyIndex: parseInt(e.detail.value) });
  },

  onTitleInput(e) { this.setData({ createTitle: e.detail.value }); },
  onDescInput(e) { this.setData({ createDescription: e.detail.value }); },
  onRewardInput(e) { this.setData({ createRewardPool: e.detail.value }); },
  onQuizQuestionInput(e) { this.setData({ quizQuestion: e.detail.value }); },
  onQuizAnswerInput(e) { this.setData({ quizAnswer: e.detail.value }); },
  onFitnessMetricInput(e) { this.setData({ fitnessMetric: e.detail.value }); },
  onFitnessUnitInput(e) { this.setData({ fitnessUnit: e.detail.value }); },
  onMatchGameInput(e) { this.setData({ matchGame: e.detail.value }); },

  createArena() {
    var typeName = TYPE_OPTIONS[this.data.createTypeIndex];
    var type = TYPE_MAP[typeName];
    var title = this.data.createTitle.trim();
    if (!title) {
      wx.showToast({ title: '请输入标题', icon: 'none' });
      return;
    }

    var config = {};
    if (type === 'quiz') {
      if (!this.data.quizQuestion.trim()) {
        wx.showToast({ title: '请输入题目', icon: 'none' });
        return;
      }
      config.question = this.data.quizQuestion.trim();
      config.answer_type = 'text';
      config.correct_answer = this.data.quizAnswer.trim();
    } else if (type === 'match') {
      if (!this.data.matchGame.trim()) {
        wx.showToast({ title: '请输入游戏名称', icon: 'none' });
        return;
      }
      config.game = this.data.matchGame.trim();
    } else if (type === 'fitness') {
      if (!this.data.fitnessMetric.trim()) {
        wx.showToast({ title: '请输入比拼项目', icon: 'none' });
        return;
      }
      config.metric = this.data.fitnessMetric.trim();
      config.unit = this.data.fitnessUnit.trim() || '次';
    }

    var currencyName = CURRENCY_OPTIONS[this.data.createCurrencyIndex];
    var currency = CURRENCY_MAP[currencyName];
    // 仅 match 可选 chips，其他类型强制 stones
    if (type !== 'match') currency = 'stones';

    var rewardPool = 0;
    if (currency === 'stones' && this.data.createRewardPool) {
      rewardPool = parseInt(this.data.createRewardPool) || 0;
    }

    var data = {
      type: type,
      title: title,
      description: this.data.createDescription.trim() || null,
      config: config,
      currency: currency,
      rewardPool: rewardPool,
    };

    var that = this;
    api.post('/arenas', data).then(function (res) {
      that.setData({ showCreateForm: false });
      wx.navigateTo({ url: '/pages/arena/arena?id=' + res.id });
    }).catch(function (err) {
      wx.showToast({ title: err.message || '创建失败', icon: 'none' });
    });
  },

  // ── 加入 ──

  joinArena() {
    var that = this;
    api.post('/arenas/' + this.data.arenaId + '/join').then(function () {
      wx.showToast({ title: '已加入', icon: 'success' });
      that.loadArenaDetail();
    }).catch(function (err) {
      wx.showToast({ title: err.message || '加入失败', icon: 'none' });
    });
  },

  // ── 提交 ──

  onAnswerInput(e) { this.setData({ answerText: e.detail.value }); },
  onScoreInput(e) { this.setData({ scoreInput: e.detail.value }); },

  chooseEvidence() {
    var that = this;
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        that.setData({ evidenceImage: res.tempFilePaths[0] });
      },
    });
  },

  uploadEvidence(filePath) {
    return new Promise(function (resolve, reject) {
      wx.uploadFile({
        url: 'https://game.lifelab.rocks/api/upload/image',
        filePath: filePath,
        name: 'image',
        header: { Authorization: 'Bearer ' + api.token },
        success: function (res) {
          try {
            resolve(JSON.parse(res.data));
          } catch (e) {
            reject(new Error('解析上传结果失败'));
          }
        },
        fail: reject,
      });
    });
  },

  submitResult() {
    var that = this;
    var arena = this.data.arena;
    var submission = {};

    if (arena.type === 'quiz') {
      if (!this.data.answerText.trim()) {
        wx.showToast({ title: '请输入答案', icon: 'none' });
        return;
      }
      submission.text = this.data.answerText.trim();
      submission.photo_urls = [];
    } else if (arena.type === 'fitness') {
      var score = parseInt(this.data.scoreInput);
      if (isNaN(score)) {
        wx.showToast({ title: '请输入成绩', icon: 'none' });
        return;
      }
      submission.score = score;
      submission.photo_urls = [];
    }

    var doSubmit = function () {
      api.post('/arenas/' + that.data.arenaId + '/submit', { submission: submission }).then(function () {
        wx.showToast({ title: '已提交', icon: 'success' });
        that.setData({ answerText: '', scoreInput: '', evidenceImage: '' });
        that.loadArenaDetail();
      }).catch(function (err) {
        wx.showToast({ title: err.message || '提交失败', icon: 'none' });
      });
    };

    if (this.data.evidenceImage) {
      wx.showLoading({ title: '上传图片...' });
      this.uploadEvidence(this.data.evidenceImage).then(function (res) {
        wx.hideLoading();
        if (!submission.photo_urls) submission.photo_urls = [];
        submission.photo_urls.push(res.url);
        doSubmit();
      }).catch(function () {
        wx.hideLoading();
        wx.showToast({ title: '图片上传失败', icon: 'none' });
      });
    } else {
      doSubmit();
    }
  },

  // ── 判定（quiz） ──

  onJudgeChange(e) {
    var idx = e.currentTarget.dataset.idx;
    var result = e.currentTarget.dataset.result;
    var path = 'participants[' + idx + '].judgeResult';
    var update = {};
    update[path] = result;
    this.setData(update);
  },

  judgeSubmissions() {
    var that = this;
    var judgments = [];
    for (var i = 0; i < this.data.participants.length; i++) {
      var p = this.data.participants[i];
      if (p.user_id === this.data.arena.creator_id) continue;
      if (!p.hasSubmitted) continue;
      if (!p.judgeResult) {
        wx.showToast({ title: '请判定所有参与者', icon: 'none' });
        return;
      }
      judgments.push({ userId: p.user_id, result: p.judgeResult });
    }
    if (judgments.length === 0) {
      wx.showToast({ title: '暂无可判定的提交', icon: 'none' });
      return;
    }
    api.post('/arenas/' + this.data.arenaId + '/judge', { judgments: judgments }).then(function () {
      wx.showToast({ title: '判定完成', icon: 'success' });
      that.loadArenaDetail();
    }).catch(function (err) {
      wx.showToast({ title: err.message || '判定失败', icon: 'none' });
    });
  },

  // ── 结算 ──

  onChipChangeInput(e) {
    var idx = e.currentTarget.dataset.idx;
    var val = parseInt(e.detail.value) || 0;
    var path = 'participants[' + idx + '].chipChange';
    var update = {};
    update[path] = val;
    this.setData(update);
  },

  settleArena() {
    var that = this;
    var arena = this.data.arena;
    var participants = this.data.participants;
    var settlements = [];

    if (arena.type === 'fitness') {
      // 按 score 降序，第一名 win 其余 lose
      var sorted = participants.filter(function (p) { return p.hasSubmitted; })
        .sort(function (a, b) { return (b.submission.score || 0) - (a.submission.score || 0); });
      settlements = sorted.map(function (p, i) {
        return { userId: p.user_id, result: i === 0 ? 'win' : 'lose', currencyChange: 0 };
      });
    } else if (arena.currency === 'chips') {
      // 筹码模式：读取每人的 chipChange
      var total = 0;
      settlements = participants.map(function (p) {
        var change = p.chipChange || 0;
        total += change;
        var result = change > 0 ? 'win' : (change < 0 ? 'lose' : 'draw');
        return { userId: p.user_id, result: result, currencyChange: change };
      });
      if (total !== 0) {
        wx.showToast({ title: '筹码总和必须为零', icon: 'none' });
        return;
      }
    } else {
      // 灵石模式：使用已判定的 result
      settlements = participants.map(function (p) {
        return { userId: p.user_id, result: p.result || 'lose', currencyChange: 0 };
      });
    }

    wx.showModal({
      title: '确认结算',
      content: '结算后擂台将关闭，确定继续？',
      success: function (res) {
        if (!res.confirm) return;
        api.post('/arenas/' + that.data.arenaId + '/settle', { settlements: settlements }).then(function () {
          wx.showToast({ title: '结算完成', icon: 'success' });
          that.loadArenaDetail();
        }).catch(function (err) {
          wx.showToast({ title: err.message || '结算失败', icon: 'none' });
        });
      },
    });
  },

  // ── 取消 ──

  cancelArena() {
    var that = this;
    wx.showModal({
      title: '确认取消',
      content: '取消后擂台将作废，确定继续？',
      success: function (res) {
        if (!res.confirm) return;
        api.post('/arenas/' + that.data.arenaId + '/cancel').then(function () {
          wx.showToast({ title: '已取消', icon: 'success' });
          that.loadArenaDetail();
        }).catch(function (err) {
          wx.showToast({ title: err.message || '取消失败', icon: 'none' });
        });
      },
    });
  },
});
```

---

## 六、新建 miniprogram/pages/arena/arena.wxml

```xml
<view class="page-container">

  <!-- ====== 列表视图 ====== -->
  <view wx:if="{{!arena}}">

    <!-- Tab 栏 -->
    <view class="tab-bar">
      <button class="tab-bar-item {{activeTab === 'active' ? 'active' : ''}}"
        data-tab="active" bindtap="switchTab">进行中</button>
      <button class="tab-bar-item {{activeTab === 'completed' ? 'active' : ''}}"
        data-tab="completed" bindtap="switchTab">已结束</button>
    </view>

    <!-- 擂台卡片列表 -->
    <view wx:if="{{arenas.length > 0}}">
      <view class="card arena-card" wx:for="{{arenas}}" wx:key="id"
        bindtap="goToDetail" data-id="{{item.id}}">
        <view class="flex-between" style="margin-bottom:12rpx">
          <text class="text-bright" style="font-size:30rpx;font-weight:600">{{item.title}}</text>
          <text class="tag arena-type-tag">{{item.typeLabel}}</text>
        </view>
        <view class="flex-between">
          <text class="text-dim" style="font-size:24rpx">{{item.creator_name}} 发起</text>
          <text class="text-dim" style="font-size:24rpx">{{item.participant_count}}人参与</text>
        </view>
      </view>
    </view>

    <!-- 空状态 -->
    <view wx:else class="empty-state">暂无擂台，点击右下角发起一场</view>

    <!-- 浮动发起按钮 -->
    <view class="arena-fab" bindtap="showCreate">
      <text style="font-size:40rpx;color:#fff">+</text>
    </view>
  </view>

  <!-- ====== 详情视图 ====== -->
  <view wx:if="{{arena}}">

    <!-- 擂台信息 -->
    <view class="card">
      <view class="flex-between" style="margin-bottom:12rpx">
        <text class="text-bright" style="font-size:34rpx;font-weight:700">{{arena.title}}</text>
        <text class="tag arena-type-tag">{{arena.typeLabel}}</text>
      </view>
      <text wx:if="{{arena.description}}" class="text-dim" style="font-size:26rpx;display:block;margin-bottom:12rpx">{{arena.description}}</text>
      <view class="flex-row" style="gap:24rpx;flex-wrap:wrap">
        <text class="text-dim" style="font-size:24rpx">状态：<text class="{{arena.status === 'active' ? 'text-green' : 'text-dim'}}">{{arena.status === 'active' ? '进行中' : arena.status === 'completed' ? '已结束' : '已取消'}}</text></text>
        <text wx:if="{{arena.currency === 'stones' && arena.reward_pool > 0}}" class="text-gold" style="font-size:24rpx">奖池 {{arena.reward_pool}} 灵石</text>
        <text wx:if="{{arena.currency === 'chips'}}" class="text-dim" style="font-size:24rpx">筹码模式</text>
      </view>
    </view>

    <!-- 参与者列表 -->
    <view class="card">
      <view class="card-title">参与者</view>
      <view wx:if="{{participants.length === 0}}" class="empty-state">暂无参与者</view>
      <view wx:else>
        <view class="participant-row" wx:for="{{participants}}" wx:key="id" wx:for-index="pIdx">
          <view class="flex-row" style="gap:16rpx;flex:1">
            <!-- 头像 -->
            <view wx:if="{{item.avatar}}" class="participant-avatar">
              <image src="{{item.avatar}}" mode="aspectFill" style="width:64rpx;height:64rpx;border-radius:50%"></image>
            </view>
            <view wx:else class="participant-avatar-placeholder flex-center">
              <text style="font-size:26rpx;color:#fff">{{item.nickname[0]}}</text>
            </view>
            <!-- 信息 -->
            <view style="flex:1">
              <text class="text-bright" style="font-size:28rpx">{{item.nickname}}</text>
              <view class="flex-row" style="gap:12rpx;margin-top:4rpx">
                <text class="text-dim" style="font-size:22rpx">{{item.hasSubmitted ? '已提交' : '未提交'}}</text>
                <text wx:if="{{item.resultLabel}}" style="font-size:22rpx;color:{{item.resultColor}}">{{item.resultLabel}}</text>
                <text wx:if="{{item.currency_change !== 0}}" class="{{item.currency_change > 0 ? 'text-green' : 'text-red'}}" style="font-size:22rpx">
                  {{item.currency_change > 0 ? '+' : ''}}{{item.currency_change}}
                </text>
              </view>
            </view>
          </view>

          <!-- quiz 判定按钮（创建者视角，仅 active 状态） -->
          <view wx:if="{{isCreator && arena.type === 'quiz' && arena.status === 'active' && item.user_id !== arena.creator_id && item.hasSubmitted && !item.result}}"
            class="flex-row" style="gap:8rpx">
            <button class="judge-btn {{item.judgeResult === 'win' ? 'judge-btn-win' : ''}}"
              data-idx="{{pIdx}}" data-result="win" bindtap="onJudgeChange">胜</button>
            <button class="judge-btn {{item.judgeResult === 'lose' ? 'judge-btn-lose' : ''}}"
              data-idx="{{pIdx}}" data-result="lose" bindtap="onJudgeChange">负</button>
          </view>

          <!-- chips 结算输入（创建者视角，仅 match + chips + active） -->
          <view wx:if="{{isCreator && arena.currency === 'chips' && arena.status === 'active'}}" style="width:160rpx">
            <input class="form-input" type="number" placeholder="筹码变动"
              value="{{item.chipChange}}" data-idx="{{pIdx}}" bindinput="onChipChangeInput"
              style="height:64rpx;font-size:24rpx;text-align:center" />
          </view>
        </view>
      </view>
    </view>

    <!-- quiz 提交内容展示（创建者可看所有人的答案） -->
    <view wx:if="{{isCreator && arena.type === 'quiz' && arena.status === 'active'}}" class="card">
      <view class="card-title">提交的答案</view>
      <view wx:if="{{arena.config}}" style="margin-bottom:16rpx">
        <text class="text-dim" style="font-size:24rpx">题目：</text>
        <text class="text-bright" style="font-size:26rpx">{{arena.config.question}}</text>
        <view wx:if="{{arena.config.correct_answer}}" style="margin-top:4rpx">
          <text class="text-dim" style="font-size:24rpx">参考答案：</text>
          <text class="text-gold" style="font-size:26rpx">{{arena.config.correct_answer}}</text>
        </view>
      </view>
      <view wx:for="{{participants}}" wx:key="id">
        <view wx:if="{{item.hasSubmitted && item.user_id !== arena.creator_id}}" style="margin-bottom:12rpx">
          <text class="text-dim" style="font-size:24rpx">{{item.nickname}}：</text>
          <text class="text-bright" style="font-size:26rpx">{{item.submission.text}}</text>
        </view>
      </view>
    </view>

    <!-- 操作区 -->
    <view wx:if="{{arena.status === 'active'}}">

      <!-- 未加入：显示加入按钮 -->
      <view wx:if="{{!myParticipant}}" style="margin-bottom:32rpx">
        <button class="btn btn-primary" bindtap="joinArena">加入擂台</button>
      </view>

      <!-- 已加入未提交：显示提交表单 -->
      <view wx:elif="{{myParticipant && !myParticipant.hasSubmitted}}" class="card">
        <view class="card-title">提交成绩</view>

        <!-- quiz 文字输入 -->
        <view wx:if="{{arena.type === 'quiz'}}">
          <view wx:if="{{arena.config}}" style="margin-bottom:16rpx">
            <text class="text-dim" style="font-size:24rpx">题目：</text>
            <text class="text-bright" style="font-size:28rpx">{{arena.config.question}}</text>
          </view>
          <view class="form-group">
            <text class="form-label">你的答案</text>
            <input class="form-input" placeholder="输入答案" value="{{answerText}}" bindinput="onAnswerInput" />
          </view>
        </view>

        <!-- fitness 数字输入 -->
        <view wx:if="{{arena.type === 'fitness'}}">
          <view class="form-group">
            <text class="form-label">成绩（{{arena.config.unit || '次'}}）</text>
            <input class="form-input" type="number" placeholder="输入成绩" value="{{scoreInput}}" bindinput="onScoreInput" />
          </view>
        </view>

        <!-- 可选图片上传 -->
        <view class="form-group">
          <text class="form-label">证据图片（可选）</text>
          <view class="flex-row" style="gap:16rpx;margin-top:8rpx">
            <view wx:if="{{evidenceImage}}" class="evidence-preview">
              <image src="{{evidenceImage}}" mode="aspectFill" style="width:160rpx;height:160rpx;border-radius:12rpx"></image>
            </view>
            <button class="btn btn-secondary btn-small" bindtap="chooseEvidence">
              {{evidenceImage ? '重新选择' : '选择图片'}}
            </button>
          </view>
        </view>

        <button class="btn btn-primary" bindtap="submitResult">提交</button>
      </view>

      <!-- 已提交提示 -->
      <view wx:elif="{{myParticipant && myParticipant.hasSubmitted && !isCreator}}" class="card">
        <text class="text-dim" style="font-size:28rpx">已提交，等待结算</text>
      </view>

      <!-- 创建者操作 -->
      <view wx:if="{{isCreator}}" style="margin-top:16rpx">
        <!-- quiz 判定按钮 -->
        <button wx:if="{{arena.type === 'quiz'}}" class="btn btn-primary" style="margin-bottom:16rpx" bindtap="judgeSubmissions">确认判定</button>
        <!-- 结算 -->
        <button class="btn btn-primary" style="margin-bottom:16rpx" bindtap="settleArena">结算擂台</button>
        <!-- 取消 -->
        <button class="btn btn-secondary" bindtap="cancelArena">取消擂台</button>
      </view>
    </view>

    <!-- 已结束/已取消状态提示 -->
    <view wx:if="{{arena.status !== 'active'}}" class="card" style="text-align:center">
      <text class="text-dim" style="font-size:28rpx">{{arena.status === 'completed' ? '擂台已结算' : '擂台已取消'}}</text>
    </view>
  </view>

  <!-- ====== 创建表单弹窗 ====== -->
  <view wx:if="{{showCreateForm}}" class="modal-mask" catchtap="hideCreate">
    <view class="modal-content" catchtap="">
      <view class="card-title" style="margin-bottom:24rpx">发起擂台</view>

      <!-- 类型选择 -->
      <view class="form-group">
        <text class="form-label">类型</text>
        <picker range="{{typeOptions}}" value="{{createTypeIndex}}" bindchange="onTypeChange">
          <view class="form-input flex-between">
            <text>{{typeOptions[createTypeIndex]}}</text>
            <text class="text-dim">▼</text>
          </view>
        </picker>
      </view>

      <!-- 标题 -->
      <view class="form-group">
        <text class="form-label">标题</text>
        <input class="form-input" placeholder="给擂台起个名" value="{{createTitle}}" bindinput="onTitleInput" />
      </view>

      <!-- 描述 -->
      <view class="form-group">
        <text class="form-label">描述（可选）</text>
        <textarea class="form-textarea" placeholder="补充说明" value="{{createDescription}}" bindinput="onDescInput"></textarea>
      </view>

      <!-- quiz config -->
      <block wx:if="{{typeOptions[createTypeIndex] === '出题挑战'}}">
        <view class="form-group">
          <text class="form-label">题目</text>
          <input class="form-input" placeholder="输入题目" value="{{quizQuestion}}" bindinput="onQuizQuestionInput" />
        </view>
        <view class="form-group">
          <text class="form-label">参考答案（可选）</text>
          <input class="form-input" placeholder="输入参考答案" value="{{quizAnswer}}" bindinput="onQuizAnswerInput" />
        </view>
      </block>

      <!-- match config -->
      <block wx:if="{{typeOptions[createTypeIndex] === '对局记录'}}">
        <view class="form-group">
          <text class="form-label">游戏名称</text>
          <input class="form-input" placeholder="如：麻将、象棋" value="{{matchGame}}" bindinput="onMatchGameInput" />
        </view>
        <view class="form-group">
          <text class="form-label">货币类型</text>
          <picker range="{{currencyOptions}}" value="{{createCurrencyIndex}}" bindchange="onCurrencyChange">
            <view class="form-input flex-between">
              <text>{{currencyOptions[createCurrencyIndex]}}</text>
              <text class="text-dim">▼</text>
            </view>
          </picker>
        </view>
      </block>

      <!-- fitness config -->
      <block wx:if="{{typeOptions[createTypeIndex] === '体能比拼'}}">
        <view class="form-group">
          <text class="form-label">比拼项目</text>
          <input class="form-input" placeholder="如：俯卧撑、平板撑" value="{{fitnessMetric}}" bindinput="onFitnessMetricInput" />
        </view>
        <view class="form-group">
          <text class="form-label">单位</text>
          <input class="form-input" placeholder="如：个、秒" value="{{fitnessUnit}}" bindinput="onFitnessUnitInput" />
        </view>
      </block>

      <!-- 灵石奖池（非 chips 时显示） -->
      <view wx:if="{{typeOptions[createTypeIndex] !== '对局记录' || currencyOptions[createCurrencyIndex] === '灵石'}}" class="form-group">
        <text class="form-label">灵石奖池（可选）</text>
        <input class="form-input" type="number" placeholder="0" value="{{createRewardPool}}" bindinput="onRewardInput" />
      </view>

      <!-- 按钮 -->
      <view class="flex-row" style="gap:16rpx;margin-top:24rpx">
        <button class="btn btn-secondary" style="flex:1" bindtap="hideCreate">取消</button>
        <button class="btn btn-primary" style="flex:1" bindtap="createArena">确认发起</button>
      </view>
    </view>
  </view>

</view>
```

---

## 七、新建 miniprogram/pages/arena/arena.wxss

```css
/* 擂台卡片 */
.arena-card {
  margin-bottom: 16rpx;
}

.arena-type-tag {
  background: rgba(139, 92, 246, 0.15);
  color: #a78bfa;
}

/* 浮动发起按钮 */
.arena-fab {
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

.arena-fab:active {
  background: #7c3aed;
}

/* 参与者行 */
.participant-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16rpx 0;
  border-bottom: 1rpx solid rgba(51, 65, 85, 0.3);
}

.participant-row:last-child {
  border-bottom: none;
}

.participant-avatar {
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
}

.participant-avatar-placeholder {
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

.judge-btn-win {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
  border-color: #22c55e;
}

.judge-btn-lose {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
  border-color: #ef4444;
}

/* 证据图片预览 */
.evidence-preview {
  border-radius: 12rpx;
  overflow: hidden;
  border: 1rpx solid #334155;
}
```

---

## 八、验证清单

1. `app.json` 中 pages 数组包含 `pages/arena/arena`，位于 `pages/login/login` 之前
2. 家庭页底部出现"擂台"入口卡片，点击跳转到擂台列表页
3. 擂台列表页加载时调用 `GET /api/arenas?status=active`，展示进行中的擂台
4. 切换"已结束" tab 调用 `GET /api/arenas?status=completed`
5. 点击擂台卡片跳转到详情页（带 id 参数）
6. 详情页加载时调用 `GET /api/arenas/:id`，展示擂台信息和参与者列表
7. 未加入的用户看到"加入擂台"按钮，点击调用 `POST /api/arenas/:id/join`
8. quiz 类型：已加入用户看到题目和文字输入框，提交调用 `POST /api/arenas/:id/submit`
9. fitness 类型：已加入用户看到数字输入框，可选上传证据图片
10. 图片上传使用 `wx.uploadFile` 调用 `/api/upload/image`，携带 Bearer token
11. 创建者在 quiz 类型下可看到所有人的答案，每人旁边有胜/负判定按钮
12. 点击"确认判定"调用 `POST /api/arenas/:id/judge`
13. 创建者点击"结算擂台"弹出确认框，确认后调用 `POST /api/arenas/:id/settle`
14. fitness 结算自动按 score 排名；chips 结算校验总和为零
15. 创建者点击"取消擂台"弹出确认框，确认后调用 `POST /api/arenas/:id/cancel`
16. 浮动"+"按钮点击弹出创建表单弹窗
17. 创建表单根据类型切换不同的 config 输入项
18. match 类型可选灵石/筹码货币
19. 创建成功后跳转到新擂台详情页
20. 已结束/已取消的擂台不显示操作按钮，显示状态提示
