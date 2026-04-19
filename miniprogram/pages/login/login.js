const api = require('../../utils/api');
const app = getApp();

Page({
  data: {
    username: '',
    password: '',
    loading: false,
    wxLoading: true,
    mode: 'wx', // 'wx' = 微信自动登录中, 'bind' = 需要绑定, 'password' = 密码登录
    openid: '',
    version: '',
  },

  onLoad() {
    this.setData({ version: app.globalData.version });
    this.tryWxLogin();
  },

  async tryWxLogin() {
    this.setData({ wxLoading: true });
    try {
      const loginRes = await new Promise((resolve, reject) => {
        wx.login({
          success: resolve,
          fail: reject,
        });
      });

      const res = await api.post('/auth/wx-login', { code: loginRes.code });

      if (res.needBind) {
        // openid 未绑定，显示绑定表单
        this.setData({ wxLoading: false, mode: 'bind', openid: res.openid });
      } else {
        // 已绑定，直接进入
        api.setAuth(res.token, res.user);
        wx.reLaunch({ url: '/pages/home/home' });
      }
    } catch (e) {
      // 微信登录失败（可能是后端未配置 AppSecret），回退到密码登录
      console.warn('微信登录失败，回退密码登录:', e.message);
      this.setData({ wxLoading: false, mode: 'password' });
    }
  },

  onUsernameInput(e) {
    this.setData({ username: e.detail.value });
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value });
  },

  // 绑定微信（首次微信登录）
  async bindAndLogin() {
    const { username, password, openid } = this.data;
    if (!username || !password) {
      wx.showToast({ title: '请输入用户名和密码', icon: 'none' });
      return;
    }

    this.setData({ loading: true });
    try {
      const res = await api.post('/auth/wx-bind', { openid, username, password });
      api.setAuth(res.token, res.user);
      wx.reLaunch({ url: '/pages/home/home' });
    } catch (e) {
      wx.showToast({ title: e.message, icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  // 密码登录（兜底）
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

  // 切换到密码登录模式
  switchToPassword() {
    this.setData({ mode: 'password' });
  },

  // 切换回微信登录
  switchToWx() {
    this.tryWxLogin();
    this.setData({ mode: 'wx' });
  },
});
