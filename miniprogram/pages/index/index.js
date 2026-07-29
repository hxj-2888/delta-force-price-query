// pages/index/index.js
const util = require('../../utils/util');
const store = require('../../utils/store');
const api = require('../../utils/api');

Page({
  data: {
    categories: [],
    allIcon: '',
    topMovers: [],
    priceAlerts: [],
    priceChangedItems: [],
    priceAlertClass: '',
    priceChangedClass: '',
    autoRefreshTime: '',
    showLoading: true,
    loadingProgress: 0,
    loadingBlur: 20,
    loadingStatus: '正在连接数据源...',
    loadingScreenClass: ''
  },

  onLoad() {
    this.initLoading();
    this.initCategories();
    this.loadData();
  },

  onShow() {
    this.startAutoRefresh();
    this.checkFavChanges();
  },

  onHide() {
    this.stopAutoRefresh();
  },

  onPullDownRefresh() {
    this.refreshAllData().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  initLoading() {
    // 模拟加载进度
    const steps = [0, 0.15, 0.3, 0.5, 0.7, 0.85, 0.95, 1];
    steps.forEach((ratio, i) => {
      setTimeout(() => {
        const blur = (20 * (1 - ratio)).toFixed(1);
        const status = ratio < 0.3 ? '正在准备...' : ratio < 0.7 ? '加载缓存数据' : ratio < 1 ? '即将就绪' : '数据就绪';
        this.setData({
          loadingProgress: ratio,
          loadingBlur: blur,
          loadingStatus: status
        });
        if (ratio === 1) {
          setTimeout(() => {
            this.setData({
              showLoading: false,
              loadingScreenClass: 'fade-out'
            });
          }, 300);
        }
      }, i * 180);
    });
  },

  initCategories() {
    const iconCache = store.getCatIconsCache() || {};
    const categories = util.CATEGORIES.map(cat => ({
      key: cat.key,
      name: cat.name,
      icon: iconCache[cat.key] || '',
      iconText: cat.icon || ''
    }));
    this.setData({
      categories: categories,
      allIcon: iconCache['all'] || ''
    });
  },

  async loadData() {
    try {
      const cached = store.getCache();
      if (cached && cached._allItems && cached._allItems.length > 0) {
        await this.updateCategoryIcons(cached._allItems);
        store.recordAllItemsPrices(cached._allItems);
        this.renderTopMover(cached._allItems);
        this.checkFavChanges();
        // 后台刷新
        api.loadAllItems(true).catch(() => {});
      } else {
        const items = await api.loadAllItems();
        if (items && items.length > 0) {
          await this.updateCategoryIcons(items);
          store.recordAllItemsPrices(items);
          this.renderTopMover(items);
          this.checkFavChanges();
        }
      }
    } catch (e) {
      console.error('加载数据失败:', e);
    }
  },

  updateCategoryIcons(allItems) {
    if (!allItems || allItems.length === 0) return;
    const existing = store.getCatIconsCache() || {};
    const picks = { ...existing };
    allItems.forEach(item => {
      const cat = item._category;
      if (cat && !picks[cat] && item.pic) {
        picks[cat] = item.pic;
      }
    });
    const logisticsItem = allItems.find(i => i.name === '物流信息单' && i.pic);
    if (logisticsItem) picks['all'] = logisticsItem.pic;
    store.setCatIconsCache(picks);

    const categories = util.CATEGORIES.map(cat => ({
      key: cat.key,
      name: cat.name,
      icon: picks[cat.key] || '',
      iconText: cat.icon || ''
    }));
    this.setData({
      categories: categories,
      allIcon: picks['all'] || ''
    });
  },

  renderTopMover(allItems) {
    if (!allItems || allItems.length === 0) return;
    const candidates = [];
    allItems.forEach(item => {
      if (!item.price || item.price < 20000) return;
      let v = item.day_7_bl;
      let isDay7 = v != null && v > 0.01;
      if (!isDay7) { v = item.bl; }
      if (v != null && v > 0.01) {
        candidates.push({ item, val: v, isDay7 });
      }
    });
    if (candidates.length === 0) return;
    candidates.sort((a, b) => b.val - a.val);
    const top2 = candidates.slice(0, 2);
    const topMovers = top2.map((t, idx) => ({
      id: t.item.id,
      name: t.item.name,
      pic: t.item.pic || '',
      priceFormatted: util.formatPrice(t.item.price),
      changeFormatted: (t.val > 0 ? '+' : '') + t.val.toFixed(2) + '%',
      rankLabel: idx === 0 ? '涨幅第一' : '涨幅第二',
      periodText: t.isDay7 ? '近7天' : '今日'
    }));
    this.setData({ topMovers });
  },

  checkFavChanges() {
    const favs = store.getFavorites();
    if (favs.length === 0) {
      this.setData({
        priceAlerts: [],
        priceChangedItems: [],
        priceAlertClass: '',
        priceChangedClass: ''
      });
      return;
    }
    const cached = store.getCache();
    const allItems = cached && cached._allItems;
    if (!allItems || allItems.length === 0) return;

    const changes = [];
    let anyUpdated = false;
    favs.forEach(fav => {
      const current = allItems.find(item => item.id === fav.id);
      if (!current || !fav.price || fav.price <= 0 || !current.price || current.price <= 0) return;
      const changePct = (current.price - fav.price) / fav.price * 100;
      if (Math.abs(changePct) >= 25) {
        changes.push({
          id: fav.id,
          name: fav.name || '未知',
          pct: (changePct > 0 ? '+' : '') + changePct.toFixed(1) + '%',
          dir: changePct > 0 ? 'up' : 'down',
          pic: current.pic || '',
          priceFormatted: util.formatPrice(current.price),
          changeText: (changePct > 0 ? '+' : '') + changePct.toFixed(1) + '%'
        });
        fav.price = current.price;
        fav.pic = current.pic || '';
        anyUpdated = true;
      }
    });
    if (anyUpdated) {
      wx.setStorageSync('deltaforce_favorites', favs);
    }

    this.setData({
      priceAlerts: changes,
      priceChangedItems: changes,
      priceAlertClass: changes.length > 0 ? 'show' : '',
      priceChangedClass: changes.length > 0 ? 'show' : ''
    });
  },

  goToSearch() {
    wx.navigateTo({ url: '/pages/search/search' });
  },

  openCategory(e) {
    const { key, name } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/list/list?key=${key}&name=${encodeURIComponent(name)}`
    });
  },

  openAllItems() {
    wx.navigateTo({
      url: '/pages/list/list?key=all&name=全部物品'
    });
  },

  openDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/detail/detail?id=${id}`
    });
  },

  openTopMover(e) {
    const id = e.currentTarget.dataset.id;
    if (id) {
      wx.navigateTo({
        url: `/pages/detail/detail?id=${id}`
      });
    }
  },

  async refreshAllData() {
    wx.showLoading({ title: '正在刷新全部数据...' });
    try {
      store.clearCache();
      const items = await api.loadAllItems(true);
      if (items && items.length > 0) {
        await this.updateCategoryIcons(items);
        store.recordAllItemsPrices(items);
        this.renderTopMover(items);
        this.checkFavChanges();
      }
      wx.hideLoading();
      wx.showToast({ title: '刷新完成', icon: 'success' });
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '刷新失败', icon: 'none' });
    }
  },

  startAutoRefresh() {
    this._autoTimer = setInterval(() => {
      const now = new Date();
      const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      this.setData({ autoRefreshTime: '自动刷新 ' + time });
      const cached = store.getCache();
      if (cached && cached._allItems) {
        store.recordAllItemsPrices(cached._allItems);
        this.renderTopMover(cached._allItems);
        this.checkFavChanges();
      }
    }, 120000);
  },

  stopAutoRefresh() {
    if (this._autoTimer) {
      clearInterval(this._autoTimer);
      this._autoTimer = null;
    }
  }
});