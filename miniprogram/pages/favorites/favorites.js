// pages/favorites/favorites.js
const util = require('../../utils/util');
const store = require('../../utils/store');

Page({
  data: {
    loading: true,
    items: []
  },

  onLoad() {
    this.loadFavorites();
  },

  onShow() {
    this.loadFavorites();
  },

  onPullDownRefresh() {
    this.refreshFavs().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  loadFavorites() {
    const favs = store.getFavorites();
    const cached = store.getCache();
    const allItems = cached && cached._allItems ? cached._allItems : [];

    const items = favs.map(fav => {
      const full = allItems.find(i => i.id === fav.id);
      const item = full ? { ...fav, ...full } : fav;
      const bl = item.bl || 0;
      return {
        id: item.id,
        name: item.name,
        pic: item.pic || '',
        priceFormatted: util.formatPrice(item.price),
        changeFormatted: util.formatChange(bl),
        changeClass: util.getChangeClass(bl),
        catName: util.CATEGORY_MAP[item._category] || item.secondClassCN || ''
      };
    });

    this.setData({
      items,
      loading: false
    });
  },

  openDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` });
  },

  clearAllFavs() {
    wx.showModal({
      title: '提示',
      content: '确定清空所有收藏吗？',
      success: (res) => {
        if (res.confirm) {
          store.clearFavorites();
          this.setData({ items: [] });
          wx.showToast({ title: '收藏已清空', icon: 'none' });
        }
      }
    });
  },

  async refreshFavs() {
    const cached = store.getCache();
    if (!cached || !cached._allItems) {
      const api = require('../../utils/api');
      try {
        await api.loadAllItemsFast();
      } catch (e) { }
    }
    this.loadFavorites();
    wx.showToast({ title: '已刷新', icon: 'success' });
  }
});
