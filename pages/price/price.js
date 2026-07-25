// 三角洲行动 - 价格异动页

const util = require('../../utils/util.js');
const store = require('../../utils/store.js');
const api = require('../../utils/api.js');
const app = getApp();

const PERIOD_LABELS = {
  bl: '今日', day_3_bl: '近3天', day_7_bl: '近7天',
  local_1d: '本地1天', local_3d: '本地3天', local_7d: '本地7天'
};

Page({
  data: {
    direction: 'up',
    period: 'bl',
    rangeFilter: 'all',
    periodLabel: '今日',
    movers: [],
    isLoading: true,
    emptyText: ''
  },

  onLoad() {
    this._loadMovers();
  },

  onShow() {
    // 每次显示时刷新
    if (!this.data.isLoading) {
      this._loadMovers();
    }
  },

  async _loadMovers() {
    this.setData({ isLoading: true });

    try {
      // 确保有缓存数据
      const cached = app.getCache();
      let all = cached && cached._allItems ? cached._allItems : [];
      if (all.length === 0) {
        all = await api.loadAllItems();
      }

      // 记录当日价格快照
      store.recordAllItemsPrices(all);

      // 同时异步获取最新价格（不阻塞）
      api.apiRequest('item_price_all', {}, 3, true).then(res => {
        if (res && res.data) {
          const cached2 = app.getCache();
          if (cached2 && cached2._allItems) {
            const priceMap = {};
            res.data.forEach(p => { priceMap[p.id || p.tid] = p; });
            cached2._allItems = cached2._allItems.map(item => {
              const latest = priceMap[item.id] || priceMap[item.tid];
              return latest ? { ...item, ...latest } : item;
            });
            app.setCache(cached2);
          }
        }
        this._renderMovers();
      }).catch(() => {
        this._renderMovers();
      });

      this._renderMovers();
    } catch (e) {
      console.error('[价格异动] 加载失败:', e);
      this.setData({ isLoading: false, emptyText: '加载失败，请检查网络' });
    }
  },

  _renderMovers() {
    const { direction, period, rangeFilter } = this.data;
    const cached = app.getCache();
    let all = cached && cached._allItems ? cached._allItems : [];

    if (all.length === 0) {
      this.setData({ isLoading: false, movers: [], emptyText: '暂无数据' });
      return;
    }

    // 处理本地涨跌幅
    const isLocalPeriod = ['local_1d', 'local_3d', 'local_7d'].includes(period);
    if (isLocalPeriod) {
      const daysMap = { local_1d: 1, local_3d: 3, local_7d: 7 };
      const days = daysMap[period] || 1;
      all.forEach(item => {
        const change = store.getLocalPriceChange(item.id, days);
        if (period === 'local_1d') item._localBl1 = change;
        else if (period === 'local_3d') item._localBl3 = change;
        else if (period === 'local_7d') item._localBl7 = change;
      });
    }

    // 过滤和排序
    let filtered = all.filter(item => {
      if (isLocalPeriod) {
        const v = this._getFieldByPeriod(item, period);
        return item.price > 0 && v != null && v !== undefined;
      }
      return item.price > 0 && this._getFieldByPeriod(item, period) != null;
    });

    // 价格区间过滤
    if (rangeFilter === '1-10w') {
      filtered = filtered.filter(item => item.price >= 10000 && item.price < 100000);
    } else if (rangeFilter === '10-100w') {
      filtered = filtered.filter(item => item.price >= 100000 && item.price < 1000000);
    } else if (rangeFilter === '100w+') {
      filtered = filtered.filter(item => item.price >= 1000000);
    }

    // 方向过滤和排序
    if (direction === 'up') {
      filtered = filtered.filter(item => this._getFieldByPeriod(item, period) > 0);
      filtered.sort((a, b) => (this._getFieldByPeriod(b, period) || 0) - (this._getFieldByPeriod(a, period) || 0));
    } else {
      filtered = filtered.filter(item => this._getFieldByPeriod(item, period) < 0);
      filtered.sort((a, b) => (this._getFieldByPeriod(a, period) || 0) - (this._getFieldByPeriod(b, period) || 0));
    }

    const top15 = filtered.slice(0, 15);

    // 计算最大变化幅度用于进度条
    const maxAbsBl = top15.reduce((max, item) =>
      Math.max(max, Math.abs(this._getFieldByPeriod(item, period) || 0)), 0);

    const movers = top15.map(item => {
      const bl = this._getFieldByPeriod(item, period) || 0;
      const absBl = Math.abs(bl);
      const isGun = item._category === 'gun';

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
        barWidth: maxAbsBl > 0 ? Math.min((absBl / maxAbsBl) * 100, 100) : 0,
        barColor: bl > 0 ? '#4caf50' : '#f44336'
      };
    });

    const emptyText = isLocalPeriod
      ? (direction === 'up' ? '暂无上涨物品（本地历史数据不足，请持续使用积累价格记录）' : '暂无下跌物品（本地历史数据不足，请持续使用积累价格记录）')
      : (direction === 'up' ? '暂无上涨物品' : '暂无下跌物品');

    this.setData({
      movers,
      isLoading: false,
      emptyText,
      periodLabel: PERIOD_LABELS[period] || '今日'
    });
  },

  _getFieldByPeriod(item, field) {
    const fieldMap = {
      bl: item.bl,
      day_3_bl: item.day_3_bl,
      day_7_bl: item.day_7_bl,
      local_1d: item._localBl1,
      local_3d: item._localBl3,
      local_7d: item._localBl7
    };
    return fieldMap[field];
  },

  // ===== 事件处理 =====
  onSetDirection(e) {
    this.setData({ direction: e.currentTarget.dataset.dir });
    this._renderMovers();
  },

  onSetPeriod(e) {
    this.setData({ period: e.currentTarget.dataset.period });
    this._renderMovers();
  },

  onSetRange(e) {
    this.setData({ rangeFilter: e.currentTarget.dataset.range });
    this._renderMovers();
  },

  onOpenDetail(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` });
  },

  onRefresh() {
    this._loadMovers();
    util.showToast('刷新中...');
  },

  onPullDownRefresh() {
    this._loadMovers().then(() => wx.stopPullDownRefresh());
  }
});
