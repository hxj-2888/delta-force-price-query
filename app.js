// 三角洲行动 - 变卖物价格查询 微信小程序
// 全局应用逻辑

App({
  globalData: {
    // API 配置 - 使用云函数代理
    useCloudProxy: true,        // true: 使用云函数代理; false: 直连API（需配置白名单）
    apiBase: 'https://orzice.com/workApi/v1/sjz_api',

    // 缓存配置
    cacheDuration: 2 * 60 * 60 * 1000,  // 2小时
    refreshCooldown: 30 * 1000,          // 刷新冷却30秒
    lastRefreshTime: 0,

    // 分类常量
    categories: [
      { key: 'gun', name: '枪械', icon: '🔫' },
      { key: 'ammo', name: '子弹', icon: '🔸' },
      { key: 'acc', name: '配件', icon: '🔧' },
      { key: 'helmet', name: '头盔', icon: '🪖' },
      { key: 'armor', name: '护甲', icon: '🛡️' },
      { key: 'chest', name: '胸挂', icon: '🎒' },
      { key: 'bag', name: '背包', icon: '💼' },
      { key: 'key', name: '钥匙卡', icon: '🔑' },
      { key: 'collection', name: '收集品', icon: '💎' },
      { key: 'consume', name: '消耗品', icon: '🧪' }
    ],

    // 应用状态
    allItems: [],          // 全部物品缓存
    currentCategory: null,
    currentItem: null,
    isAllMode: false,

    // 价格异动状态
    priceDirection: 'up',
    pricePeriod: 'bl',
    priceRangeFilter: 'all',

    // 自动刷新定时器
    autoRefreshTimer: null,
    dailyRecordTimer: null
  },

  onLaunch() {
    console.log('[三角洲行动] 小程序启动');

    // 获取系统信息
    const systemInfo = wx.getSystemInfoSync();
    this.globalData.systemInfo = systemInfo;
    this.globalData.statusBarHeight = systemInfo.statusBarHeight;

    // 初始化云开发（如果启用）
    if (wx.cloud) {
      wx.cloud.init({
        env: 'delta-force-xxxxx',  // 替换为实际云环境ID
        traceUser: true
      });
    }

    // 从本地存储恢复缓存
    this._restoreCache();

    // 设置后台/前台监听
    this._setupLifecycleListeners();
  },

  onShow() {
    console.log('[三角洲行动] 小程序显示');
    this._startAutoTasks();
  },

  onHide() {
    console.log('[三角洲行动] 小程序隐藏');
    this._stopAutoTasks();
  },

  // 恢复本地缓存
  _restoreCache() {
    try {
      const cached = wx.getStorageSync('deltaforce_cache');
      const cacheTime = wx.getStorageSync('deltaforce_cache_time');
      if (cached && cacheTime) {
        const elapsed = Date.now() - cacheTime;
        if (elapsed < this.globalData.cacheDuration) {
          this.globalData.allItems = cached._allItems || [];
          console.log('[缓存] 恢复', this.globalData.allItems.length, '件物品');
        } else if (cached._allItems) {
          // 过期但数据可用 — 后台刷新
          this.globalData.allItems = cached._allItems;
          console.log('[缓存] 过期数据恢复，后台刷新中');
        }
      }
    } catch (e) {
      console.warn('[缓存] 恢复失败:', e);
    }
  },

  // 生命周期监听
  _setupLifecycleListeners() {
    const that = this;
    wx.onAppHide(() => {
      that._stopAutoTasks();
    });
    wx.onAppShow(() => {
      that._startAutoTasks();
    });
  },

  _startAutoTasks() {
    if (this.globalData.autoRefreshTimer) return;
    this.globalData.autoRefreshTimer = setInterval(() => {
      // 通知当前活跃页面可以自动刷新
      const pages = getCurrentPages();
      const currentPage = pages[pages.length - 1];
      if (currentPage && currentPage._autoRefresh) {
        currentPage._autoRefresh();
      }
    }, 120000); // 每2分钟
  },

  _stopAutoTasks() {
    if (this.globalData.autoRefreshTimer) {
      clearInterval(this.globalData.autoRefreshTimer);
      this.globalData.autoRefreshTimer = null;
    }
  },

  // 更新全局缓存
  setCache(data) {
    try {
      wx.setStorageSync('deltaforce_cache', data);
      wx.setStorageSync('deltaforce_cache_time', Date.now());
      if (data._allItems) {
        this.globalData.allItems = data._allItems;
      }
    } catch (e) {
      console.warn('[缓存] 写入失败:', e);
      try { wx.removeStorageSync('deltaforce_cache'); } catch(e2) {}
    }
  },

  getCache() {
    try {
      const data = wx.getStorageSync('deltaforce_cache');
      const time = wx.getStorageSync('deltaforce_cache_time');
      if (time && (Date.now() - time < this.globalData.cacheDuration)) {
        return data;
      }
      if (!time && data) return data; // 降级
      return null;
    } catch (e) {
      return null;
    }
  },

  clearCache() {
    wx.removeStorageSync('deltaforce_cache');
    wx.removeStorageSync('deltaforce_cache_time');
    this.globalData.allItems = [];
  }
});
