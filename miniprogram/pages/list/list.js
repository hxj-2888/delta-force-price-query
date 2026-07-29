// pages/list/list.js
const util = require('../../utils/util');
const store = require('../../utils/store');
const api = require('../../utils/api');

const ITEMS_PER_PAGE = 20;

Page({
  data: {
    title: '物品列表',
    loading: true,
    items: [],
    pageItems: [],
    totalCount: 0,
    totalPages: 0,
    currentPage: 1,
    sortBy: 'price',
    sortDir: 'desc',
    sortDirPrice: '↓',
    sortDirChange: '',
    lastUpdateTime: '',
    pageButtons: [],
    isAllMode: false,
    categoryKey: null
  },

  onLoad(options) {
    const { key, name } = options;
    const title = decodeURIComponent(name || '物品列表');
    this.setData({
      title: title,
      isAllMode: key === 'all',
      categoryKey: key === 'all' ? null : key
    });
    wx.setNavigationBarTitle({ title });
    this.loadItems();
  },

  onPullDownRefresh() {
    this.refreshList().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  async loadItems() {
    this.setData({ loading: true });
    try {
      let items = [];
      const cached = store.getCache();
      if (cached && cached._allItems && cached._allItems.length > 0) {
        items = this.data.isAllMode
          ? cached._allItems
          : cached._allItems.filter(i => i._category === this.data.categoryKey);
      }
      if (items.length === 0) {
        if (this.data.isAllMode) {
          items = await api.loadAllItems();
        } else {
          items = await api.fetchCategoryAll(this.data.categoryKey);
          // 合并回缓存
          const c2 = store.getCache();
          if (c2 && c2._allItems) {
            const other = c2._allItems.filter(i => i._category !== this.data.categoryKey);
            c2._allItems = other.concat(items);
            store.setCache(c2);
          }
        }
      }
      this.processItems(items);
    } catch (e) {
      console.error('加载失败:', e);
      this.setData({ loading: false });
    }
  },

  processItems(items) {
    const sorted = this.sortItems(items);
    const totalPages = Math.ceil(sorted.length / ITEMS_PER_PAGE) || 1;
    const currentPage = 1;
    const pageItems = sorted.slice(0, ITEMS_PER_PAGE);
    const lastUpdate = items.length > 0 ? util.formatTime(items[0].is_get_time) : '';

    const formatted = this.formatPageItems(pageItems);
    const buttons = this.getPageButtons(1, totalPages);

    this.setData({
      items: sorted,
      pageItems: formatted,
      totalCount: sorted.length,
      totalPages,
      currentPage: 1,
      lastUpdateTime: lastUpdate,
      pageButtons: buttons,
      loading: false
    });
  },

  sortItems(items) {
    const sorted = [...items];
    const dir = this.data.sortDir === 'asc' ? 1 : -1;
    if (this.data.sortBy === 'price') {
      sorted.sort((a, b) => ((a.price || 0) - (b.price || 0)) * dir);
    } else if (this.data.sortBy === 'change') {
      sorted.sort((a, b) => ((a.bl || 0) - (b.bl || 0)) * dir);
    }
    return sorted;
  },

  formatPageItems(pageItems) {
    return pageItems.map(item => {
      const bl = item.bl || 0;
      const hasGrade = item._category !== 'gun' && item.grade;
      const attrs = [];
      if (this.data.isAllMode) {
        const catName = util.CATEGORY_MAP[item._category] || '';
        if (catName) attrs.push(catName);
      }
      if (item.length && item.width) attrs.push(item.length + '×' + item.width);
      if (hasGrade) attrs.push(util.getGradeText(item.grade));

      return {
        id: item.id,
        name: item.name,
        pic: item.pic || '',
        priceFormatted: util.formatPrice(item.price),
        changeFormatted: util.formatChange(bl),
        changeClass: util.getChangeClass(bl),
        gradeText: hasGrade ? util.getGradeText(item.grade) : '',
        gradeColor: hasGrade ? util.getGradeColor(item.grade) : '',
        gradeDiamond: hasGrade,
        attrText: attrs.length > 0 ? attrs.join(' · ') : ''
      };
    });
  },

  getPageButtons(current, total) {
    if (total <= 1) return [];
    let start = Math.max(1, current - 3);
    let end = Math.min(total, current + 3);
    if (end - start < 6) {
      if (start === 1) end = Math.min(total, start + 6);
      else start = Math.max(1, end - 6);
    }
    const buttons = [];
    if (start > 1) {
      buttons.push(1);
      if (start > 2) buttons.push('…');
    }
    for (let i = start; i <= end; i++) buttons.push(i);
    if (end < total) {
      if (end < total - 1) buttons.push('…');
      buttons.push(total);
    }
    return buttons;
  },

  setSort(e) {
    const field = e.currentTarget.dataset.field;
    let { sortBy, sortDir } = this.data;
    if (sortBy === field) {
      sortDir = sortDir === 'desc' ? 'asc' : 'desc';
    } else {
      sortBy = field;
      sortDir = 'desc';
    }
    const sorted = this.sortItems(this.data.items);
    const pageItems = sorted.slice(0, ITEMS_PER_PAGE);
    this.setData({
      sortBy,
      sortDir,
      sortDirPrice: sortBy === 'price' ? (sortDir === 'desc' ? '↓' : '↑') : '',
      sortDirChange: sortBy === 'change' ? (sortDir === 'desc' ? '↓' : '↑') : '',
      items: sorted,
      pageItems: this.formatPageItems(pageItems),
      currentPage: 1
    });
  },

  goToPage(e) {
    const page = parseInt(e.currentTarget.dataset.page);
    if (isNaN(page) || page < 1 || page > this.data.totalPages) return;
    const start = (page - 1) * ITEMS_PER_PAGE;
    const pageItems = this.data.items.slice(start, start + ITEMS_PER_PAGE);
    const buttons = this.getPageButtons(page, this.data.totalPages);
    this.setData({
      currentPage: page,
      pageItems: this.formatPageItems(pageItems),
      pageButtons: buttons
    });
  },

  goBack() {
    wx.navigateBack();
  },

  goToSearch() {
    wx.navigateTo({ url: '/pages/search/search' });
  },

  openDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` });
  },

  async refreshList() {
    wx.showLoading({ title: '刷新中...' });
    try {
      store.clearCache();
      let items;
      if (this.data.isAllMode) {
        items = await api.loadAllItems(true);
      } else {
        items = await api.fetchCategoryAll(this.data.categoryKey);
        const c2 = store.getCache();
        if (c2 && c2._allItems) {
          const other = c2._allItems.filter(i => i._category !== this.data.categoryKey);
          c2._allItems = other.concat(items);
          store.setCache(c2);
        }
      }
      this.processItems(items);
      wx.hideLoading();
      wx.showToast({ title: '刷新完成', icon: 'success' });
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '刷新失败', icon: 'none' });
    }
  }
});