const api = require('../../utils/api');
const app = getApp();

Page({
  data: {
    // mode: 'wx' | 'bind' | 'register' | 'password'
    mode: 'wx',
    wxLoading: true,
    loading: false,
    openid: '',
    unboundUsers: [],
    selectedUser: null,
    confirmUsername: '',
    newName: '',
    username: '',
    password: '',
    version: '',
  },

  onLoad() {
    this.setData({ version: app.globalData.version });
    this.tryWxLogin();
  },

  async tryWxLogin() {
    this.setData({ wxLoading: true, mode: 'wx' });
    try {
      const loginRes = await new Promise((resolve, reject) => {
        wx.login({ success: resolve, fail: reject });
      });

      const res = await api.post('/auth/wx-login', { code: loginRes.code });

      if (res.needBind) {
        if (res.unboundUsers && res.unboundUsers.length > 0) {
          this.setData({ wxLoading: false, mode: 'bind', openid: res.openid, unboundUsers: res.unboundUsers });
        } else {
          this.setData({ wxLoading: false, mode: 'register', openid: res.openid });
        }
      } else {
        api.setAuth(res.token, res.user);
        wx.reLaunch({ url: '/pages/home/home' });
      }
    } catch (e) {
      console.warn('微信登录失败:', e.message);
      this.setData({ wxLoading: false, mode: 'password' });
    }
  },

  // 选择要绑定的角色
  selectUser(e) {
    const userId = e.currentTarget.dataset.id;
    const user = this.data.unboundUsers.find(u => u.id === userId);
    this.setData({ selectedUser: user, confirmUsername: '' });
  },

  // 取消选择
  cancelSelect() {
    this.setData({ selectedUser: null, confirmUsername: '' });
  },

  onConfirmUsernameInput(e) {
    this.setData({ confirmUsername: e.detail.value });
  },

  // 确认绑定
  async confirmBind() {
    const { selectedUser, confirmUsername, openid } = this.data;
    if (!confirmUsername) {
      wx.showToast({ title: '请输入用户名确认', icon: 'none' });
      return;
    }

    this.setData({ loading: true });
    try {
      const res = await api.post('/auth/wx-bind', {
        openid,
        userId: selectedUser.id,
        username: confirmUsername,
      });
      api.setAuth(res.token, res.user);
      wx.reLaunch({ url: '/pages/home/home' });
    } catch (e) {
      wx.showToast({ title: e.message, icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  // 切换到新建角色
  goToRegister() {
    this.setData({ mode: 'register', selectedUser: null });
  },

  onNewNameInput(e) {
    this.setData({ newName: e.detail.value });
  },

  // 新建角色
  async registerUser() {
    const { newName, openid } = this.data;
    if (!newName.trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }

    this.setData({ loading: true });
    try {
      const res = await api.post('/auth/wx-register', { openid, name: newName.trim() });
      api.setAuth(res.token, res.user);
      wx.reLaunch({ url: '/pages/home/home' });
    } catch (e) {
      wx.showToast({ title: e.message, icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  // 返回角色列表
  backToBind() {
    if (this.data.unboundUsers.length > 0) {
      this.setData({ mode: 'bind' });
    } else {
      this.tryWxLogin();
    }
  },

  // 密码登录兜底
  onUsernameInput(e) { this.setData({ username: e.detail.value }); },
  onPasswordInput(e) { this.setData({ password: e.detail.value }); },

  async login() {
    const { username, password } = this.data;
    if (!username || !password) {
      wx.showToast({ title: '请输入用户名和密码', icon: 'none' });
      return;
    }
    this.setData({ loading: true });
    try {
      const res = await api.post('/auth/login', { username, password });
      api.setAuth(res.token, res.user);
      wx.reLaunch({ url: '/pages/home/home' });
    } catch (e) {
      wx.showToast({ title: e.message, icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  switchToPassword() { this.setData({ mode: 'password' }); },
  switchToWx() { this.tryWxLogin(); },
});
