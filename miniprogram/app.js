// app.js
App({
  onLaunch: function () {
    // 获取系统信息
    const systemInfo = wx.getSystemInfoSync();
    this.globalData.systemInfo = systemInfo;
  },
  globalData: {
    systemInfo: null,
    // 缓存数据
    allItems: [],
    cacheTime: 0,
    // API基础地址
    apiBase: 'https://api.orzice.com'
  }
})