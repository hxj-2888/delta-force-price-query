// pages/price/price.js
const util = require('../../utils/util');
const store = require('../../utils/store');
const api = require('../../utils/api');

Page({
  data: {
    loading: true,
    items: [],
    period: 'bl',
    direction: 'up',
    range: 'all',
    periodLabel: '今日',
    directionLabel: '涨幅榜',
    emptyText: '暂无数据'
  },

  onLoad() {
    this.loadMovers();
  },

  onShow() {
    // 页面显示时刷新
    const cached = store.getCache();
    if (cached && cached._allItems && cached._allItems.length > 0) {
      store.recordAllItemsPrices(cached._allItems);
      this.computeMovers();
    }
  },

  onPullDownRefresh() {
    this.refreshMovers().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  async loadMovers() {
    this.setData({ loading: true });
    try {
      const cached = store.getCache();
      if (!cached || !cached._allItems || cached._allItems.length === 0) {
        await api.loadAllItemsFast();
      }
      this.computeMovers();
    } catch (e) {
      this.setData({
        loading: false,
        emptyText: '加载失败，请检查网络'
      });
    }
  },

  getFieldByPeriod(item, field) {
    if (field === 'bl') return item.bl;
    if (field === 'day_3_bl') return item.day_3_bl;
    if (field === 'day_7_bl') return item.day_7_bl;
    if (field === 'local_1d') return item._localBl1;
    if (field === 'local_3d') return item._localBl3;
    if (field === 'local_7d') return item._localBl7;
    return item.bl;
  },

  computeMovers() {
    const cached = store.getCache();
    const all = (cached && cached._allItems) ? cached._allItems : [];
    if (all.length === 0) {
      this.setData({
        loading: false,
        emptyText: '暂无数据，请下拉刷新'
      });
      return;
    }

    const { period, direction, range } = this.data;

    // 本地数据预处理
    const isLocalPeriod = period === 'local_1d' || period === 'local_3d' || period === 'local_7d';
    const daysMap = { local_1d: 1, local_3d: 3, local_7d: 7 };
    const days = daysMap[period] || 1;

    if (isLocalPeriod) {
      all.forEach(item => {
        const change = store.getLocalPriceChange(item.id, days);
        if (period === 'local_1d') item._localBl1 = change;
        else if (period === 'local_3d') item._localBl3 = change;
        else if (period === 'local_7d') item._localBl7 = change;
      });
    }

    let filtered = all.filter(item => {
      if (isLocalPeriod) {
        const v = this.getFieldByPeriod(item, period);
        return item.price > 0 && v != null && v !== undefined;
      }
      return item.price > 0 && this.getFieldByPeriod(item, period) != null;
    });

    // 价格范围过滤
    if (range === '1-10w') {
      filtered = filtered.filter(item => item.price >= 10000 && item.price < 100000);
    } else if (range === '10-100w') {
      filtered = filtered.filter(item => item.price >= 100000 && item.price < 1000000);
    } else if (range === '100w+') {
      filtered = filtered.filter(item => item.price >= 1000000);
    }

    const field = period;
    if (direction === 'up') {
      filtered.sort((a, b) => (this.getFieldByPeriod(b, field) || 0) - (this.getFieldByPeriod(a, field) || 0));
      filtered = filtered.filter(item => this.getFieldByPeriod(item, field) > 0);
    } else {
      filtered.sort((a, b) => (this.getFieldByPeriod(a, field) || 0) - (this.getFieldByPeriod(b, field) || 0));
      filtered = filtered.filter(item => this.getFieldByPeriod(item, field) < 0);
    }

    const topItems = filtered.slice(0, 15);
    const maxAbsBl = Math.max(...topItems.map(item => Math.abs(this.getFieldByPeriod(item, period) || 0)), 1);

    const items = topItems.map(item => {
      const bl = this.getFieldByPeriod(item, period) || 0;
      const absBl = Math.abs(bl);
      const barWidth = maxAbsBl > 0 ? Math.min((absBl / maxAbsBl) * 100, 100) : 0;
      const hasGrade = item._category !== 'gun' && item.grade;

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
        barWidth: barWidth,
        barColor: bl > 0 ? '#4caf50' : '#f44336'
      };
    });

    const periodLabel = util.PERIOD_LABELS[period] || '今日';
    const directionLabel = direction === 'up' ? '涨幅榜' : '跌幅榜';
    let emptyText = direction === 'up'
      ? '暂无上涨物品（本地历史数据不足，请持续使用积累价格记录）'
      : '暂无下跌物品（本地历史数据不足，请持续使用积累价格记录）';
    if (!isLocalPeriod) {
      emptyText = direction === 'up' ? '暂无上涨物品' : '暂无下跌物品';
    }

    this.setData({
      items,
      loading: false,
      periodLabel,
      directionLabel,
      emptyText: topItems.length === 0 ? emptyText : ''
    });
  },

  setPeriod(e) {
    const period = e.currentTarget.dataset.period;
    this.setData({ period }, () => this.computeMovers());
  },

  setDirection(e) {
    const direction = e.currentTarget.dataset.dir;
    this.setData({ direction }, () => this.computeMovers());
  },

  setRange(e) {
    const range = e.currentTarget.dataset.range;
    this.setData({ range }, () => this.computeMovers());
  },

  openDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` });
  },

  async refreshMovers() {
    wx.showLoading({ title: '刷新中...' });
    try {
      const cached = store.getCache();
      if (cached && cached._allItems && cached._allItems.length > 0) {
        store.recordAllItemsPrices(cached._allItems);
      }
      const res = await api.apiRequest('item_price_all', null, 3, true);
      if (res && res.data && res.data.length > 0) {
        const c2 = store.getCache();
        if (c2 && c2._allItems) {
          const priceMap = {};
          res.data.forEach(p => { priceMap[p.id || p.tid] = p; });
          c2._allItems = c2._allItems.map(item => {
            const latest = priceMap[item.id] || priceMap[item.tid];
            if (latest) {
              item.price = latest.price;
              item.bl = latest.bl;
              item.day_3_bl = latest.day_3_bl;
              item.day_3_price = latest.day_3_price;
              item.day_7_bl = latest.day_7_bl;
              item.day_7_price = latest.day_7_price;
              item.day_30_bl = latest.day_30_bl;
              item.day_30_price = latest.day_30_price;
            }
            return item;
          });
          store.setCache(c2);
        }
      }
      this.computeMovers();
      wx.hideLoading();
      wx.showToast({ title: '已刷新', icon: 'success' });
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '刷新失败', icon: 'none' });
    }
  }
});
