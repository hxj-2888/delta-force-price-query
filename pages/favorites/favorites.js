// 三角洲行动 - 我的收藏页

const util = require('../../utils/util.js');
const store = require('../../utils/store.js');
const api = require('../../utils/api.js');
const app = getApp();

Page({
  data: {
    favorites: [],
    isLoading: true
  },

  onLoad() {
    this._loadFavorites();
  },

  onShow() {
    this._loadFavorites();
  },

  _loadFavorites() {
    const favs = store.getFavorites();
    const cached = app.getCache();
    const allItems = cached && cached._allItems ? cached._allItems : [];

    // 合并缓存中的最新数据
    const merged = favs.map(fav => {
      const full = allItems.find(i => i.id === fav.id);
      return full ? { ...fav, ...full } : fav;
    });

    const favorites = merged.map(item => ({
      id: item.id,
      name: item.name || '未知',
      pic: util.sanitizeUrl(item.pic),
      priceText: util.formatPrice(item.price),
      changeText: util.formatChange(item.bl || 0),
      changeClass: util.getChangeClass(item.bl || 0),
      catName: util.CATEGORY_MAP[item._category] || item.secondClassCN || ''
    }));

    this.setData({ favorites, isLoading: false });

    // 如果没有缓存数据，尝试加载
    if (favs.length > 0 && allItems.length === 0) {
      api.loadAllItems().then(() => {
        if (getCurrentPages().slice(-1)[0] !== this) return;
        this._loadFavorites();
      }).catch(() => {});
    }
  },

  // ===== 事件处理 =====
  onOpenDetail(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` });
  },

  onClearAll() {
    wx.showModal({
      title: '确认清空',
      content: '确定要清空所有收藏吗？',
      success: (res) => {
        if (res.confirm) {
          store.clearFavorites();
          this.setData({ favorites: [] });
          util.showToast('收藏已清空');
        }
      }
    });
  },

  onPullDownRefresh() {
    this._loadFavorites();
    setTimeout(() => wx.stopPullDownRefresh(), 500);
  }
});
