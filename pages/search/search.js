// 三角洲行动 - 搜索页

const util = require('../../utils/util.js');
const store = require('../../utils/store.js');
const app = getApp();

Page({
  data: {
    keyword: '',
    isSearching: false,
    isLoading: false,
    searchResults: [],
    searchHistory: [],
    recentViews: [],
    favorites: [],
    _searchTimer: null
  },

  onLoad() {
    this._loadQuickEntries();
  },

  onShow() {
    this._loadQuickEntries();
  },

  _loadQuickEntries() {
    const history = store.getSearchHistory();
    const views = store.getRecentViews();
    const favs = store.getFavorites();

    this.setData({
      searchHistory: history,
      recentViews: views.map(v => ({
        ...v,
        priceText: util.formatPrice(v.price),
        changeText: util.formatChange(v.bl),
        changeClass: util.getChangeClass(v.bl),
        catName: util.CATEGORY_MAP[v._category] || v.secondClassCN || ''
      })),
      favorites: favs.map(f => ({
        ...f,
        priceText: util.formatPrice(f.price),
        changeText: util.formatChange(f.bl),
        changeClass: util.getChangeClass(f.bl),
        catName: util.CATEGORY_MAP[f._category] || f.secondClassCN || ''
      }))
    });
  },

  // ===== 搜索 =====
  onInput(e) {
    const kw = e.detail.value;
    this.setData({ keyword: kw });

    if (this.data._searchTimer) clearTimeout(this.data._searchTimer);

    if (!kw.trim()) {
      this.setData({ isSearching: false, searchResults: [] });
      return;
    }

    this.data._searchTimer = setTimeout(() => {
      this._doSearch(kw);
    }, 300);
  },

  onSearch(e) {
    const kw = e.detail.value;
    if (this.data._searchTimer) clearTimeout(this.data._searchTimer);
    if (kw.trim()) this._doSearch(kw);
  },

  _doSearch(keyword) {
    if (!keyword.trim()) return;
    store.saveSearchQuery(keyword.trim());

    this.setData({ isSearching: true, isLoading: true });

    try {
      const kw = keyword.toLowerCase();
      const cached = app.getCache();
      let allItems = cached && cached._allItems ? cached._allItems : app.globalData.allItems || [];

      const results = allItems.filter(item =>
        item.name && item.name.toLowerCase().includes(kw)
      );

      this.setData({
        isLoading: false,
        searchResults: results.slice(0, 100).map(item => ({
          id: item.id,
          name: item.name,
          pic: util.sanitizeUrl(item.pic),
          priceText: util.formatPrice(item.price),
          changeText: util.formatChange(item.bl || 0),
          changeClass: util.getChangeClass(item.bl || 0),
          catName: util.CATEGORY_MAP[item._category] || item.secondClassCN || ''
        }))
      });
    } catch (e) {
      console.error('[搜索] 失败:', e);
      this.setData({ isLoading: false, searchResults: [] });
    }
  },

  // ===== 事件处理 =====
  onClear() {
    this.setData({ keyword: '', isSearching: false, searchResults: [] });
  },

  onCancel() {
    wx.navigateBack();
  },

  onSearchHistory(e) {
    const kw = e.currentTarget.dataset.kw;
    this.setData({ keyword: kw, isSearching: true });
    this._doSearch(kw);
  },

  onOpenDetail(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` });
  },

  onClearHistory() {
    store.clearSearchHistory();
    this.setData({ searchHistory: [] });
    util.showToast('搜索历史已清除');
  },

  onClearRecent() {
    store.clearRecentViews();
    this.setData({ recentViews: [] });
    util.showToast('最近浏览已清除');
  }
});
