const api = require('../../utils/api');

const TYPE_OPTIONS = ['出题挑战', '对局记录', '体能比拼'];
const TYPE_MAP = { '出题挑战': 'quiz', '对局记录': 'match', '体能比拼': 'fitness' };
const TYPE_LABEL = { quiz: '出题挑战', match: '对局记录', fitness: '体能比拼' };
const CURRENCY_OPTIONS = ['灵石', '筹码'];
const CURRENCY_MAP = { 灵石: 'stones', 筹码: 'chips' };
const RESULT_LABEL = { win: '胜', lose: '负', draw: '平' };
const RESULT_COLOR = { win: '#22c55e', lose: '#ef4444', draw: '#94a3b8' };

Page({
  data: {
    arenas: [],
    activeTab: 'active',
    arena: null,
    arenaId: null,
    participants: [],
    isCreator: false,
    myParticipant: null,
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
    answerText: '',
    scoreInput: '',
    evidenceImage: '',
    typeOptions: TYPE_OPTIONS,
    currencyOptions: CURRENCY_OPTIONS,
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ arenaId: parseInt(options.id, 10) });
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

  loadArenaList() {
    const that = this;
    api.get(`/arenas?status=${this.data.activeTab}`).then((res) => {
      const list = (res.arenas || []).map((a) => ({
        ...a,
        typeLabel: TYPE_LABEL[a.type] || a.type,
      }));
      that.setData({ arenas: list });
    }).catch(() => {
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
    this.loadArenaList();
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/arena/arena?id=${id}` });
  },

  loadArenaDetail() {
    const that = this;
    const id = this.data.arenaId;
    api.get(`/arenas/${id}`).then((res) => {
      const userId = api.user ? api.user.id : null;
      const isCreator = res.creator_id === userId;
      const participants = (res.participants || []).map((p) => ({
        ...p,
        resultLabel: p.result ? RESULT_LABEL[p.result] : '',
        resultColor: p.result ? RESULT_COLOR[p.result] : '',
        hasSubmitted: !!p.submission,
        judgeResult: p.result || '',
        chipChange: p.currency_change || 0,
      }));

      let myP = null;
      for (let i = 0; i < participants.length; i += 1) {
        if (participants[i].user_id === userId) {
          myP = participants[i];
          break;
        }
      }

      res.typeLabel = TYPE_LABEL[res.type] || res.type;
      that.setData({
        arena: res,
        participants,
        isCreator,
        myParticipant: myP,
      });
    }).catch(() => {
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  showCreate() {
    this.setData({ showCreateForm: true });
  },

  hideCreate() {
    this.setData({ showCreateForm: false });
  },

  onTypeChange(e) {
    this.setData({ createTypeIndex: parseInt(e.detail.value, 10) });
  },

  onCurrencyChange(e) {
    this.setData({ createCurrencyIndex: parseInt(e.detail.value, 10) });
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
    const typeName = TYPE_OPTIONS[this.data.createTypeIndex];
    const type = TYPE_MAP[typeName];
    const title = this.data.createTitle.trim();

    if (!title) {
      wx.showToast({ title: '请输入标题', icon: 'none' });
      return;
    }

    const config = {};
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

    const currencyName = CURRENCY_OPTIONS[this.data.createCurrencyIndex];
    let currency = CURRENCY_MAP[currencyName];
    if (type !== 'match') currency = 'stones';

    let rewardPool = 0;
    if (currency === 'stones' && this.data.createRewardPool) {
      rewardPool = parseInt(this.data.createRewardPool, 10) || 0;
    }

    const data = {
      type,
      title,
      description: this.data.createDescription.trim() || null,
      config,
      currency,
      rewardPool,
    };

    const that = this;
    api.post('/arenas', data).then((res) => {
      that.setData({ showCreateForm: false });
      wx.navigateTo({ url: `/pages/arena/arena?id=${res.id}` });
    }).catch((err) => {
      wx.showToast({ title: err.message || '创建失败', icon: 'none' });
    });
  },

  joinArena() {
    const that = this;
    api.post(`/arenas/${this.data.arenaId}/join`).then(() => {
      wx.showToast({ title: '已加入', icon: 'success' });
      that.loadArenaDetail();
    }).catch((err) => {
      wx.showToast({ title: err.message || '加入失败', icon: 'none' });
    });
  },

  onAnswerInput(e) { this.setData({ answerText: e.detail.value }); },
  onScoreInput(e) { this.setData({ scoreInput: e.detail.value }); },

  chooseEvidence() {
    const that = this;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success(res) {
        that.setData({ evidenceImage: res.tempFiles[0].tempFilePath });
      },
      fail(err) {
        if (err.errMsg && err.errMsg.indexOf('cancel') === -1) {
          wx.showToast({ title: '无法访问相机或相册，请检查权限', icon: 'none' });
        }
      },
    });
  },

  uploadEvidence(filePath) {
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: 'https://game.lifelab.rocks/api/upload/image',
        filePath,
        name: 'image',
        header: { Authorization: `Bearer ${api.token}` },
        success(res) {
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
    const that = this;
    const arena = this.data.arena;
    const submission = {};

    if (arena.type === 'quiz') {
      if (!this.data.answerText.trim()) {
        wx.showToast({ title: '请输入答案', icon: 'none' });
        return;
      }
      submission.text = this.data.answerText.trim();
      submission.photo_urls = [];
    } else if (arena.type === 'fitness') {
      const score = parseInt(this.data.scoreInput, 10);
      if (Number.isNaN(score)) {
        wx.showToast({ title: '请输入成绩', icon: 'none' });
        return;
      }
      submission.score = score;
      submission.photo_urls = [];
    }

    const doSubmit = function doSubmit() {
      api.post(`/arenas/${that.data.arenaId}/submit`, { submission }).then(() => {
        wx.showToast({ title: '已提交', icon: 'success' });
        that.setData({ answerText: '', scoreInput: '', evidenceImage: '' });
        that.loadArenaDetail();
      }).catch((err) => {
        wx.showToast({ title: err.message || '提交失败', icon: 'none' });
      });
    };

    if (this.data.evidenceImage) {
      wx.showLoading({ title: '上传图片...' });
      this.uploadEvidence(this.data.evidenceImage).then((res) => {
        wx.hideLoading();
        if (!submission.photo_urls) submission.photo_urls = [];
        submission.photo_urls.push(res.url);
        doSubmit();
      }).catch(() => {
        wx.hideLoading();
        wx.showToast({ title: '图片上传失败', icon: 'none' });
      });
    } else {
      doSubmit();
    }
  },

  onJudgeChange(e) {
    const idx = e.currentTarget.dataset.idx;
    const result = e.currentTarget.dataset.result;
    const path = `participants[${idx}].judgeResult`;
    this.setData({ [path]: result });
  },

  judgeSubmissions() {
    const judgments = [];
    for (let i = 0; i < this.data.participants.length; i += 1) {
      const p = this.data.participants[i];
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

    const that = this;
    api.post(`/arenas/${this.data.arenaId}/judge`, { judgments }).then(() => {
      wx.showToast({ title: '判定完成', icon: 'success' });
      that.loadArenaDetail();
    }).catch((err) => {
      wx.showToast({ title: err.message || '判定失败', icon: 'none' });
    });
  },

  onChipChangeInput(e) {
    const idx = e.currentTarget.dataset.idx;
    const val = parseInt(e.detail.value, 10) || 0;
    const path = `participants[${idx}].chipChange`;
    this.setData({ [path]: val });
  },

  settleArena() {
    const that = this;
    const arena = this.data.arena;
    const participants = this.data.participants;
    let settlements = [];

    if (arena.type === 'fitness') {
      const sorted = participants
        .filter((p) => p.hasSubmitted)
        .sort((a, b) => (b.submission.score || 0) - (a.submission.score || 0));
      settlements = sorted.map((p, i) => ({
        userId: p.user_id,
        result: i === 0 ? 'win' : 'lose',
        currencyChange: 0,
      }));
    } else if (arena.currency === 'chips') {
      let total = 0;
      settlements = participants.map((p) => {
        const change = p.chipChange || 0;
        total += change;
        const result = change > 0 ? 'win' : (change < 0 ? 'lose' : 'draw');
        return { userId: p.user_id, result, currencyChange: change };
      });
      if (total !== 0) {
        wx.showToast({ title: '筹码总和必须为零', icon: 'none' });
        return;
      }
    } else {
      settlements = participants.map((p) => ({
        userId: p.user_id,
        result: p.result || 'lose',
        currencyChange: 0,
      }));
    }

    wx.showModal({
      title: '确认结算',
      content: '结算后擂台将关闭，确定继续？',
      success(res) {
        if (!res.confirm) return;
        api.post(`/arenas/${that.data.arenaId}/settle`, { settlements }).then(() => {
          wx.showToast({ title: '结算完成', icon: 'success' });
          that.loadArenaDetail();
        }).catch((err) => {
          wx.showToast({ title: err.message || '结算失败', icon: 'none' });
        });
      },
    });
  },

  cancelArena() {
    const that = this;
    wx.showModal({
      title: '确认取消',
      content: '取消后擂台将作废，确定继续？',
      success(res) {
        if (!res.confirm) return;
        api.post(`/arenas/${that.data.arenaId}/cancel`).then(() => {
          wx.showToast({ title: '已取消', icon: 'success' });
          that.loadArenaDetail();
        }).catch((err) => {
          wx.showToast({ title: err.message || '取消失败', icon: 'none' });
        });
      },
    });
  },
});
