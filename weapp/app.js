// app.js
const config = require('./utils/config');

App({
  onLaunch: function () {
    // 获取系统信息
    var systemInfo = wx.getSystemInfoSync();
    this.globalData.systemInfo = systemInfo;
  },
  globalData: {
    systemInfo: null,
    // 缓存数据
    allItems: [],
    cacheTime: 0,
    // ★ API 代理地址（统一从 utils/config.js 读取）
    // token 留在服务端代理中，不在客户端暴露
    apiBase: config.API_BASE
  }
})
