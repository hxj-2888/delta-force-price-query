// 三角洲行动 - 物品列表页

const util = require('../../utils/util.js');
const store = require('../../utils/store.js');
const api = require('../../utils/api.js');
const app = getApp();

const ITEMS_PER_PAGE = 20;

Page({
  data: {
    categoryName: '',
    categoryKey: '',
    isAllMode: false,

    // 列表数据
    allItems: [],
    pageItems: [],
    totalCount: 0,
    totalPages: 0,
    currentPage: 1,
    updateTime: '',

    // 排序
    sortBy: 'price',
    sortDir: 'desc',

    // 分页显示
    showFirstBtn: false,
    showLastBtn: false,
    showStartEllipsis: false,
    showEndEllipsis: false,
    pageRange: [],

    // 状态
    isLoading: true,
    hasError: false
  },

  onLoad(options) {
    const category = options.category || 'all';
    const name = decodeURIComponent(options.name || '物品列表');

    this.setData({
      categoryKey: category,
      categoryName: name,
      isAllMode: category === 'all'
    });

    wx.setNavigationBarTitle({ title: name });
    this._loadItems();
  },

  async _loadItems() {
    this.setData({ isLoading: true, hasError: false });

    try {
      const { categoryKey, isAllMode } = this.data;
      const cached = app.getCache();
      let items = [];

      if (isAllMode) {
        if (cached && cached._allItems && cached._allItems.length > 0) {
          items = cached._allItems;
        } else {
          items = await api.loadAllItems();
        }
      } else {
        if (cached && cached._allItems) {
          items = cached._allItems.filter(i => i._category === categoryKey);
        }
        if (!items || items.length === 0) {
          items = await api.fetchCategoryAll(categoryKey);
          // 回填缓存
          const c = app.getCache();
          if (c && c._allItems) {
            c._allItems = c._allItems.filter(i => i._category !== categoryKey).concat(items);
            app.setCache(c);
          }
        }
      }

      const sorted = this._sortItems(items);
      const totalPages = Math.ceil(sorted.length / ITEMS_PER_PAGE) || 1;

      this.setData({
        allItems: sorted,
        totalCount: sorted.length,
        totalPages,
        currentPage: 1,
        updateTime: sorted.length > 0 ? util.formatTime(sorted[0].is_get_time) : '',
        isLoading: false
      });

      this._renderPage();
    } catch (e) {
      console.error('[列表] 加载失败:', e);
      this.setData({ isLoading: false, hasError: true });
    }
  },

  _sortItems(items) {
    const sorted = [...items];
    const dir = this.data.sortDir === 'asc' ? 1 : -1;
    if (this.data.sortBy === 'price') {
      sorted.sort((a, b) => ((a.price || 0) - (b.price || 0)) * dir);
    } else {
      sorted.sort((a, b) => ((a.bl || 0) - (b.bl || 0)) * dir);
    }
    return sorted;
  },

  _renderPage() {
    const { allItems, currentPage, sortBy, sortDir } = this.data;
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const pageItems = allItems.slice(start, start + ITEMS_PER_PAGE);

    const pageItemsData = pageItems.map(item => {
      const bl = item.bl || 0;
      const d30bl = item.day_30_bl || 0;
      const d30p = item.day_30_price || 0;
      const catName = util.CATEGORY_MAP[item._category] || item.secondClassCN || '';
      const isGun = item._category === 'gun';

      const attrs = [];
      if (this.data.isAllMode && catName) attrs.push(catName);
      if (item.length && item.width) attrs.push(item.length + '×' + item.width);
      if (!isGun && item.grade) attrs.push(util.getGradeText(item.grade));

      return {
        id: item.id,
        name: item.name,
        pic: util.sanitizeUrl(item.pic),
        priceText: util.formatPrice(item.price),
        changeText: util.formatChange(bl),
        changeClass: util.getChangeClass(bl),
        gradeText: !isGun && item.grade ? util.getGradeText(item.grade) : '',
        gradeColor: util.getGradeColor(item.grade),
        gradeBg: !isGun && item.grade ? `background:${util.getGradeColor(item.grade)}15;border-color:${util.getGradeColor(item.grade)}30` : '',
        showGradeDiamond: !isGun && item.grade,
        attrs: attrs.join(' · '),
        d30p: d30p ? util.formatPrice(d30p) : '',
        d30pText: d30p ? util.formatPrice(d30p) : '',
        d30ChangeClass: util.getChangeClass(d30bl),
        d30ChangeText: util.formatChange(d30bl),
        isFavorited: store.isFavorited(item.id)
      };
    });

    this.setData({ pageItems: pageItemsData });
    this._updatePagination();
  },

  _updatePagination() {
    const { totalPages, currentPage } = this.data;
    const startPage = Math.max(1, currentPage - 3);
    const endPage = Math.min(totalPages, currentPage + 3);

    let rangeStart = startPage;
    let rangeEnd = endPage;
    if (rangeEnd - rangeStart < 6) {
      if (rangeStart === 1) rangeEnd = Math.min(totalPages, rangeStart + 6);
      else rangeStart = Math.max(1, rangeEnd - 6);
    }

    const pageRange = [];
    for (let i = rangeStart; i <= rangeEnd; i++) pageRange.push(i);

    this.setData({
      pageRange,
      showFirstBtn: rangeStart > 1,
      showLastBtn: rangeEnd < totalPages,
      showStartEllipsis: rangeStart > 2,
      showEndEllipsis: rangeEnd < totalPages - 1
    });
  },

  // ===== 事件处理 =====
  onSetSort(e) {
    const field = e.currentTarget.dataset.sort;
    if (this.data.sortBy === field) {
      this.setData({ sortDir: this.data.sortDir === 'desc' ? 'asc' : 'desc' });
    } else {
      this.setData({ sortBy: field, sortDir: 'desc' });
    }
    const sorted = this._sortItems(this.data.allItems);
    this.setData({ allItems: sorted, currentPage: 1 });
    this._renderPage();
  },

  onGoPage(e) {
    const page = parseInt(e.currentTarget.dataset.page);
    if (page < 1 || page > this.data.totalPages) return;
    this.setData({ currentPage: page });
    this._renderPage();
    wx.pageScrollTo({ scrollTop: 0, duration: 200 });
  },

  onOpenDetail(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` });
  },

  onRetry() {
    this._loadItems();
  },

  onPullDownRefresh() {
    this._loadItems().then(() => wx.stopPullDownRefresh());
  }
});
