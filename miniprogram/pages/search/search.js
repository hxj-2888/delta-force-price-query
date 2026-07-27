// pages/search/search.js
const util = require('../../utils/util');
const store = require('../../utils/store');

Page({
  data: {
    keyword: '',
    hasResults: false,
    results: [],
    history: [],
    recentViews: [],
    favorites: []
  },

  onLoad() {
    this.loadSideData();
  },

  onShow() {
    this.loadSideData();
  },

  loadSideData() {
    const history = store.getSearchHistory();
    const views = store.getRecentViews();
    const favs = store.getFavorites();

    const recentViews = views.map(v => ({
      id: v.id,
      name: v.name,
      pic: v.pic || '',
      priceFormatted: util.formatPrice(v.price),
      changeFormatted: util.formatChange(v.bl || 0),
      changeClass: util.getChangeClass(v.bl || 0),
      catName: util.CATEGORY_MAP[v._category] || v.secondClassCN || ''
    }));

    const favorites = favs.map(f => ({
      id: f.id,
      name: f.name,
      pic: f.pic || '',
      priceFormatted: util.formatPrice(f.price),
      changeFormatted: util.formatChange(f.bl || 0),
      changeClass: util.getChangeClass(f.bl || 0),
      catName: util.CATEGORY_MAP[f._category] || f.secondClassCN || ''
    }));

    this.setData({ history, recentViews, favorites });
  },

  onInput(e) {
    const keyword = e.detail.value;
    this.setData({ keyword });
    if (this._searchTimer) clearTimeout(this._searchTimer);
    if (!keyword.trim()) {
      this.setData({ hasResults: false, results: [] });
      return;
    }
    this._searchTimer = setTimeout(() => {
      this.doSearch(keyword);
    }, 300);
  },

  onConfirm(e) {
    const keyword = e.detail.value;
    if (keyword.trim()) {
      this.doSearch(keyword);
    }
  },

  doSearch(keyword) {
    if (!keyword.trim()) return;
    store.saveSearchQuery(keyword.trim());

    const cached = store.getCache();
    let allItems = [];
    if (cached && cached._allItems && cached._allItems.length > 0) {
      allItems = cached._allItems;
    }

    const kw = keyword.toLowerCase();
    const results = allItems.filter(item =>
      item.name && item.name.toLowerCase().indexOf(kw) !== -1
    );

    const formatted = results.map(item => ({
      id: item.id,
      name: item.name,
      pic: item.pic || '',
      priceFormatted: util.formatPrice(item.price),
      changeFormatted: util.formatChange(item.bl || 0),
      changeClass: util.getChangeClass(item.bl || 0),
      catName: util.CATEGORY_MAP[item._category] || item.secondClassCN || ''
    }));

    this.setData({
      hasResults: true,
      results: formatted,
      keyword
    });

    // 刷新侧边数据
    this.loadSideData();
  },

  searchHistory(e) {
    const keyword = e.currentTarget.dataset.keyword;
    this.setData({ keyword });
    this.doSearch(keyword);
  },

  clearSearch() {
    this.setData({
      keyword: '',
      hasResults: false,
      results: []
    });
    this.loadSideData();
  },

  clearHistory() {
    store.clearSearchHistory();
    this.setData({ history: [] });
  },

  clearRecentViews() {
    store.clearRecentViews();
    this.setData({ recentViews: [] });
  },

  clearFavorites() {
    store.clearFavorites();
    this.setData({ favorites: [] });
  },

  openDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` });
  },

  goBack() {
    wx.navigateBack();
  }
});