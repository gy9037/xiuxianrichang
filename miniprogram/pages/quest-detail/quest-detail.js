var api = require('../../utils/api');

var TYPE_LABELS = { system: '系统悬赏', self: '自我悬赏', challenge: '挑战', bounty: '悬赏' };
var TYPE_COLORS = { system: '#d4a574', self: '#7ec8e3', challenge: '#c77dba', bounty: '#e8a87c' };
var STATUS_LABELS = { voting: '投票中', active: '进行中', judging: '判定中', completed: '已完成', failed: '已失败', cancelled: '已取消' };
var MODE_LABELS = { cooperative: '合作模式', competitive: '竞争模式' };
var CATEGORY_LABELS = {
  physique: '体魄', comprehension: '悟性', willpower: '意志', dexterity: '灵巧', perception: '感知',
  '体魄': '体魄', '悟性': '悟性', '意志': '意志', '灵巧': '灵巧', '感知': '感知',
};
var GOAL_TYPE_LABELS = { manual: '手动判定', behavior_count: '行为次数', streak_days: '连续天数', attr_accumulate: '属性累计' };

function deadlineText(dateStr) {
  if (!dateStr) return '';
  var diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return '已截止';
  var days = Math.floor(diff / 86400000);
  if (days > 0) return '剩余' + days + '天';
  return '剩余' + Math.floor(diff / 3600000) + '小时';
}

Page({
  data: {
    id: null,
    quest: null,
    loading: true,
    userId: null,
    myParticipant: null,
    myRole: null,
    hasVoted: false,
    hasSubmitted: false,
    isCreator: false,
    joinAsChallenger: false,
    showSubmitModal: false,
    submitText: '',
    submitPhotos: [],
    uploading: false,
    uploadProgress: 0,
    myJudgments: {},
    typeLabel: '',
    typeColor: '',
    statusLabel: '',
    modeLabel: '',
    categoryLabel: '',
    goalTypeLabel: '',
    deadlineText: '',
    creatorName: '',
    hasProgress: false,
    hasSubmissions: false,
    participants: [],
  },

  onLoad: function (options) {
    this.setData({ id: parseInt(options.id, 10), userId: api.user ? api.user.id : null });
  },

  onShow: function () {
    this.loadDetail();
  },

  loadDetail: function () {
    var that = this;
    that.setData({ loading: true });
    api.get('/quests/' + this.data.id).then(function (res) {
      var userId = that.data.userId;
      var isCreator = res.creator && res.creator.id === userId;
      var participants = res.participants || [];
      var myP = null;
      var hasProgress = res.goal_type && res.goal_type !== 'manual';
      var hasSubmissions = false;

      for (var i = 0; i < participants.length; i++) {
        var p = participants[i];
        if (p.user_id === userId) myP = p;
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
        if (p.hasSubmission) hasSubmissions = true;
        if (p.submission) {
          var sub = typeof p.submission === 'string' ? JSON.parse(p.submission) : p.submission;
          p.submissionText = sub.text || '';
          p.submissionPhotos = sub.photo_urls || sub.photoUrls || [];
        } else {
          p.submissionText = '';
          p.submissionPhotos = [];
        }
      }

      var myJudgments = {};
      for (var j = 0; j < (res.my_judgments || []).length; j++) {
        myJudgments[res.my_judgments[j].target_user_id] = res.my_judgments[j].verdict;
      }
      for (var k = 0; k < participants.length; k++) {
        var item = participants[k];
        item.judgedByMe = !!myJudgments[item.user_id];
        item.canJudge = res.status === 'judging' &&
          (item.role === 'challenger' || item.role === 'bounty_taker') &&
          item.user_id !== userId &&
          item.hasSubmission &&
          !item.judgedByMe;
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
        deadlineText: deadlineText(res.deadline),
        creatorName: res.creator ? res.creator.name : '',
        hasProgress: hasProgress,
        hasSubmissions: hasSubmissions,
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

  handleTakeBounty: function () {
    var that = this;
    api.post('/quests/' + this.data.id + '/vote', { approve: true, joinAsChallenger: true }).then(function () {
      wx.showToast({ title: '已接取', icon: 'success' });
      that.loadDetail();
    }).catch(function (err) {
      wx.showToast({ title: err.message || '接取失败', icon: 'none' });
    });
  },

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
    var photos = this.data.submitPhotos.slice();
    photos.splice(e.currentTarget.dataset.idx, 1);
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
          try { resolve(JSON.parse(res.data).url); } catch (e) { reject(new Error('解析上传结果失败')); }
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
      that.doSubmit(text, []);
      return;
    }

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
    api.post('/quests/' + this.data.id + '/submit', { text: text, photoUrls: photoUrls }).then(function () {
      wx.showToast({ title: '提交成功', icon: 'success' });
      that.setData({ showSubmitModal: false });
      that.loadDetail();
    }).catch(function (err) {
      wx.showToast({ title: err.message || '提交失败', icon: 'none' });
    });
  },

  handleJudge: function (e) {
    var that = this;
    api.post('/quests/' + this.data.id + '/judge', {
      targetUserId: parseInt(e.currentTarget.dataset.userid),
      verdict: e.currentTarget.dataset.verdict,
    }).then(function () {
      wx.showToast({ title: '判定完成', icon: 'success' });
      that.loadDetail();
    }).catch(function (err) {
      wx.showToast({ title: err.message || '判定失败', icon: 'none' });
    });
  },
});
