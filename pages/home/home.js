// 三角洲行动 - 首页

const app = getApp();
const util = require('../../utils/util.js');
const store = require('../../utils/store.js');
const api = require('../../utils/api.js');

Page({
  data: {
    categories: [],
    topMovers: [],
    priceAlert: { show: false, changes: [] },
    priceChanges: [],
    allIconUrl: '',
    autoRefreshTime: '',
    isRefreshing: false,
    isLoaded: false
  },

  onLoad() {
    this._initCategories();
    this._loadData();
  },

  onShow() {
    if (this.data.isLoaded) {
      this._checkFavoritePriceChanges();
      this._renderTopMover();
    }
  },

  // 自动刷新回调（由 App 定时器触发）
  _autoRefresh() {
    if (!this.data.isLoaded) return;
    const cached = app.getCache();
    if (cached && cached._allItems && cached._allItems.length > 0) {
      store.recordAllItemsPrices(cached._allItems);
    }
    this._checkFavoritePriceChanges();
    this._renderTopMover();
  },

  // 初始化分类列表和图标
  _initCategories() {
    const iconCache = store.getCatIconsCache();
    const categories = util.CATEGORIES.map(cat => ({
      ...cat,
      iconUrl: (iconCache && iconCache[cat.key]) ? iconCache[cat.key] : ''
    }));
    this.setData({
      categories,
      allIconUrl: iconCache ? (iconCache['all'] || '') : ''
    });
  },

  // 加载数据
  async _loadData() {
    wx.showNavigationBarLoading();
    try {
      const cached = app.getCache();
      let allItems = cached && cached._allItems ? cached._allItems : [];

      if (allItems.length === 0) {
        allItems = await api.loadAllItems();
      } else {
        // 后台刷新
        api.loadAllItems(true).catch(() => {});
      }

      if (allItems.length > 0) {
        this._updateCategoryIcons(allItems);
      }

      this.setData({ isLoaded: true });
      this._checkFavoritePriceChanges();
      this._renderTopMover();
      this._updateAutoRefreshTime();
    } catch (e) {
      console.error('[首页] 加载失败:', e);
      this.setData({ isLoaded: true });
    } finally {
      wx.hideNavigationBarLoading();
    }
  },

  // 更新分类图标
  _updateCategoryIcons(allItems) {
    if (!allItems || allItems.length === 0) return;
    const existing = store.getCatIconsCache() || {};
    const picks = { ...existing };

    allItems.forEach(item => {
      const cat = item._category;
      if (cat && !picks[cat] && item.pic) picks[cat] = item.pic;
    });

    const logisticsItem = allItems.find(i => i.name === '物流信息单' && i.pic);
    if (logisticsItem) picks['all'] = logisticsItem.pic;

    store.setCatIconsCache(picks);

    const categories = this.data.categories.map(cat => ({
      ...cat,
      iconUrl: picks[cat.key] || ''
    }));
    this.setData({ categories, allIconUrl: picks['all'] || '' });
  },

  // 检查收藏价格变动
  _checkFavoritePriceChanges() {
    const favs = store.getFavorites();
    if (favs.length === 0) {
      this.setData({ 'priceAlert.show': false, priceChanges: [] });
      return;
    }

    const cached = app.getCache();
    const allItems = cached && cached._allItems ? cached._allItems : [];
    if (allItems.length === 0) return;

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
          pct: changePct,
          dir: changePct > 0 ? 'up' : 'down',
          pic: current.pic || '',
          price: current.price,
          pctText: (changePct > 0 ? '+' : '') + changePct.toFixed(1),
          priceText: util.formatPrice(current.price)
        });
        fav.price = current.price;
        fav.pic = current.pic || '';
        anyUpdated = true;
      }
    });

    if (anyUpdated) {
      store.setStorage('deltaforce_favorites', favs);
    }

    if (changes.length > 0) {
      const alertText = changes.map(c => `${c.name} ${c.dir === 'up' ? '↑' : '↓'}${c.pctText}%`).join(' · ');
      this.setData({
        'priceAlert.show': true,
        'priceAlert.changes': changes,
        priceChanges: changes
      });
    } else {
      this.setData({ 'priceAlert.show': false, priceChanges: [] });
    }
  },

  // 首页涨幅推送
  _renderTopMover() {
    const cached = app.getCache();
    let all = cached && cached._allItems ? cached._allItems : [];

    if (all.length === 0) {
      this.setData({ topMovers: [] });
      return;
    }

    const candidates = [];
    all.forEach(item => {
      if (!item.price || item.price < 20000) return;
      let v = item.day_7_bl;
      let isDay7 = v != null && v > 0.01;
      if (!isDay7) v = item.bl;
      if (v != null && v > 0.01) {
        candidates.push({ item, val: v, isDay7 });
      }
    });

    candidates.sort((a, b) => b.val - a.val);
    const top2 = candidates.slice(0, 2);

    const topMovers = top2.map((t, idx) => ({
      id: t.item.id,
      name: t.item.name,
      pic: t.item.pic || '',
      val: t.val,
      valText: t.val.toFixed(2),
      isDay7: t.isDay7,
      priceText: util.formatPrice(t.item.price),
      label: idx === 0 ? '涨幅第一' : '涨幅第二'
    }));

    this.setData({ topMovers });
  },

  _updateAutoRefreshTime() {
    const now = new Date();
    const pad2 = n => String(n).padStart(2, '0');
    this.setData({
      autoRefreshTime: '自动刷新 ' + pad2(now.getHours()) + ':' + pad2(now.getMinutes()) + ':' + pad2(now.getSeconds())
    });
  },

  // ===== 事件处理 =====
  onShowSearch() {
    wx.navigateTo({ url: '/pages/search/search' });
  },

  onOpenCategory(e) {
    const { key, name } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/list/list?category=${key}&name=${encodeURIComponent(name)}`
    });
  },

  onOpenAll() {
    wx.navigateTo({
      url: '/pages/list/list?category=all&name=' + encodeURIComponent('全部物品')
    });
  },

  onOpenDetail(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` });
  },

  onOpenTopMover(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` });
  },

  async onRefreshAll() {
    if (this.data.isRefreshing) return;
    this.setData({ isRefreshing: true });
    wx.showNavigationBarLoading();

    try {
      app.clearCache();
      await api.loadAllItems(true);
      this._checkFavoritePriceChanges();
      this._renderTopMover();
      this._updateAutoRefreshTime();
      util.showToast('全部数据已刷新！');
    } catch (e) {
      util.showToast('刷新失败，请检查网络');
    } finally {
      this.setData({ isRefreshing: false });
      wx.hideNavigationBarLoading();
    }
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.onRefreshAll().then(() => {
      wx.stopPullDownRefresh();
    });
  }
});
