const BASE_URL = 'https://game.lifelab.rocks/api';

const api = {
  token: '',
  user: null,

  setAuth(token, user) {
    this.token = token;
    this.user = user;
    wx.setStorageSync('token', token);
    wx.setStorageSync('user', JSON.stringify(user));
  },

  clearAuth() {
    this.token = '';
    this.user = null;
    wx.removeStorageSync('token');
    wx.removeStorageSync('user');
  },

  loadAuth() {
    this.token = wx.getStorageSync('token') || '';
    const userStr = wx.getStorageSync('user');
    this.user = userStr ? JSON.parse(userStr) : null;
  },

  isLoggedIn() {
    return !!this.token;
  },

  request(method, path, data) {
    return new Promise((resolve, reject) => {
      const header = { 'Content-Type': 'application/json' };
      if (this.token) {
        header['Authorization'] = `Bearer ${this.token}`;
      }
      wx.request({
        url: `${BASE_URL}${path}`,
        method,
        header,
        data,
        success(res) {
          if (res.statusCode === 401) {
            api.clearAuth();
            wx.reLaunch({ url: '/pages/login/login' });
            reject(new Error('登录已过期'));
            return;
          }
          if (res.statusCode >= 400) {
            reject(new Error(res.data?.error || '请求失败'));
            return;
          }
          resolve(res.data);
        },
        fail(err) {
          reject(new Error('网络连接失败'));
        },
      });
    });
  },

  get(path) { return this.request('GET', path); },
  post(path, data) { return this.request('POST', path, data); },
  put(path, data) { return this.request('PUT', path, data); },
  patch(path, data) { return this.request('PATCH', path, data); },
  delete(path) { return this.request('DELETE', path); },
};

module.exports = api;
