// pages/detail/detail.js
const util = require('../../utils/util');
const store = require('../../utils/store');
const api = require('../../utils/api');

Page({
  data: {
    loading: true,
    item: {},
    isFavorited: false,
    favBtnText: '收藏'
  },

  onLoad(options) {
    this.itemId = options.id;
    this.loadItem();
  },

  onPullDownRefresh() {
    this.refreshItem().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  async loadItem() {
    this.setData({ loading: true });
    try {
      const cached = store.getCache();
      let item = null;
      if (cached && cached._allItems) {
        item = cached._allItems.find(i => i.id == this.itemId);
      }
      if (!item) {
        // 尝试从收藏或最近浏览中找
        const favs = store.getFavorites();
        item = favs.find(i => i.id == this.itemId);
        if (!item) {
          const views = store.getRecentViews();
          item = views.find(i => i.id == this.itemId);
        }
      }
      if (item) {
        this.renderItem(item);
        store.saveRecentView(item);
        store.savePriceSnapshot(item.id, item);
        // 后台刷新最新价格
        this.refreshPrice(item);
      } else {
        this.setData({
          loading: false,
          item: { name: '未找到该物品' }
        });
      }
    } catch (e) {
      console.error('加载详情失败:', e);
      this.setData({ loading: false });
    }
  },

  async refreshPrice(item) {
    try {
      const res = await api.apiRequest('item_price_all');
      const latest = (res.data || []).find(i => i.id == item.id || i.tid == item.tid);
      if (latest) {
        const merged = { ...item, ...latest };
        store.savePriceSnapshot(merged.id, merged);
        // 更新缓存
        const cached = store.getCache();
        if (cached && cached._allItems) {
          const idx = cached._allItems.findIndex(i => i.id == merged.id);
          if (idx >= 0) {
            cached._allItems[idx] = merged;
            store.setCache(cached);
          }
        }
        this.renderItem(merged);
      }
    } catch (e) { }
  },

  renderItem(item) {
    const bl = item.bl || 0;
    const d3bl = item.day_3_bl || 0;
    const d7bl = item.day_7_bl || 0;
    const d30bl = item.day_30_bl || 0;
    const d3p = item.day_3_price || 0;
    const d7p = item.day_7_price || 0;
    const d30p = item.day_30_price || 0;
    const isFav = store.isFavorited(item.id);

    const sizeText = item.length && item.width ? item.length + '×' + item.width : '';
    const weightText = item.weight || item.Weight || '';
    const hasGrade = item._category !== 'gun' && item.grade;

    const detailItem = {
      id: item.id,
      name: item.name,
      pic: item.pic || '',
      desc: item.desc || '',
      secondClassCN: item.secondClassCN || '',
      gradeText: hasGrade ? util.getGradeText(item.grade) : '',
      gradeColor: hasGrade ? util.getGradeColor(item.grade) : '',
      objectID: item.objectID || '',
      sizeText,
      weightText,
      hasProps: !!(item.secondClassCN || sizeText || weightText || hasGrade || item.objectID),
      updateTime: util.formatTime(item.is_get_time),
      priceFormatted: util.formatPrice(item.price),
      openPrice: util.formatPrice(item.price_start || item.priceStart || 0),
      changeFormatted: util.formatChange(bl),
      changeClass: util.getChangeClass(bl),
      // 趋势数据
      d3PriceFormatted: util.formatPrice(d3p),
      d3ChangeFormatted: util.formatChange(d3bl),
      d3ChangeClass: util.getChangeClass(d3bl),
      d3Active: d3p > 0,
      d7PriceFormatted: util.formatPrice(d7p),
      d7ChangeFormatted: util.formatChange(d7bl),
      d7ChangeClass: util.getChangeClass(d7bl),
      d7Active: d7p > 0,
      d30PriceFormatted: util.formatPrice(d30p),
      d30ChangeFormatted: util.formatChange(d30bl),
      d30ChangeClass: util.getChangeClass(d30bl),
      d30Active: d30p > 0
    };

    this.setData({
      loading: false,
      item: detailItem,
      isFavorited: isFav,
      favBtnText: isFav ? '★收藏' : '☆收藏'
    });
  },

  toggleFavorite() {
    const cached = store.getCache();
    let item = null;
    if (cached && cached._allItems) {
      item = cached._allItems.find(i => i.id == this.itemId);
    }
    if (!item) return;
    const isNowFav = store.toggleFavorite(item);
    this.setData({
      isFavorited: isNowFav,
      favBtnText: isNowFav ? '★收藏' : '☆收藏'
    });
    wx.showToast({
      title: isNowFav ? '已加入收藏' : '已取消收藏',
      icon: 'none'
    });
  },

  async refreshItem() {
    const cached = store.getCache();
    let item = null;
    if (cached && cached._allItems) {
      item = cached._allItems.find(i => i.id == this.itemId);
    }
    if (!item) {
      wx.showToast({ title: '未找到该物品', icon: 'none' });
      return;
    }
    this.setData({ loading: true });
    try {
      const res = await api.apiRequest('item_price_all', null, 3, true);
      const latest = (res.data || []).find(i => i.id == item.id || i.tid == item.tid);
      if (latest) {
        const merged = { ...item, ...latest };
        store.savePriceSnapshot(merged.id, merged);
        const idx = cached._allItems.findIndex(i => i.id == merged.id);
        if (idx >= 0) {
          cached._allItems[idx] = merged;
          store.setCache(cached);
        }
        this.renderItem(merged);
      } else {
        this.renderItem(item);
      }
      wx.showToast({ title: '刷新完成', icon: 'success' });
    } catch (e) {
      this.renderItem(item);
      wx.showToast({ title: '刷新失败，显示已有数据', icon: 'none' });
    }
  },

  goBack() {
    wx.navigateBack();
  }
});