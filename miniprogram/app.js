const api = require('./utils/api');

App({
  onLaunch() {
    api.loadAuth();
    if (!api.isLoggedIn()) {
      wx.reLaunch({ url: '/pages/login/login' });
    }
  },

  globalData: {
    version: '1.2.6',
    inventoryTab: null,
    openGoalManage: null,
  },
});
