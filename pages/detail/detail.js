// 三角洲行动 - 物品详情页

const util = require('../../utils/util.js');
const store = require('../../utils/store.js');
const api = require('../../utils/api.js');
const chart = require('../../utils/chart.js');
const app = getApp();

Page({
  data: {
    itemId: '',
    item: null,
    isFavorited: false,
    isLoading: true,
    hasError: false,
    chartReady: false,
    chartError: ''
  },

  onLoad(options) {
    const itemId = parseInt(options.id);
    if (!itemId) {
      this.setData({ isLoading: false, hasError: true });
      return;
    }
    this.setData({ itemId });
    this._loadItem();
  },

  onReady() {
    // Canvas 在 onReady 后可用
  },

  async _loadItem() {
    this.setData({ isLoading: true, hasError: false });

    try {
      let item = this._findItemInCache(this.data.itemId);

      if (!item) {
        util.showToast('未找到该物品');
        this.setData({ isLoading: false, hasError: true });
        return;
      }

      // 保存快照和浏览记录
      store.savePriceSnapshot(item.id, item);
      store.saveRecentView(item);

      this._renderItem(item);
      this.setData({ isLoading: false });

      // 异步请求最新价格
      this._refreshLatestPrice(item);

      // 延迟绘制图表（等待 Canvas 节点获取）
      setTimeout(() => { this._drawChart(); }, 300);
    } catch (e) {
      console.error('[详情] 加载失败:', e);
      this.setData({ isLoading: false, hasError: true });
    }
  },

  _findItemInCache(itemId) {
    const cached = app.getCache();
    if (cached && cached._allItems) {
      return cached._allItems.find(i => i.id === itemId);
    }
    return null;
  },

  _renderItem(item) {
    const bl = item.bl || 0;
    const d3bl = item.day_3_bl || 0;
    const d7bl = item.day_7_bl || 0;
    const d30bl = item.day_30_bl || 0;

    const itemData = {
      id: item.id,
      name: item.name || '未知',
      pic: util.sanitizeUrl(item.pic),
      price: item.price || 0,
      priceText: util.formatPrice(item.price),
      priceStartText: util.formatPrice(item.price_start || item.priceStart || 0),
      changeText: util.formatChange(bl),
      changeClass: util.getChangeClass(bl),
      secondClassCN: item.secondClassCN || '',
      grade: item.grade || 0,
      gradeText: util.getGradeText(item.grade),
      gradeColor: util.getGradeColor(item.grade),
      desc: item.desc || '',
      updateTime: util.formatTime(item.is_get_time),
      objectID: item.objectID || '',
      size: (item.length && item.width) ? item.length + '×' + item.width : '',
      weightText: item.weight || item.Weight || '',
      hasProps: !!(item.secondClassCN || item.length || item.weight || item.Weight || item.grade || item.objectID),

      d3pText: util.formatPrice(item.day_3_price || 0),
      d7pText: util.formatPrice(item.day_7_price || 0),
      d30pText: util.formatPrice(item.day_30_price || 0),
      d3ChangeClass: util.getChangeClass(d3bl),
      d3ChangeText: util.formatChange(d3bl),
      d7ChangeClass: util.getChangeClass(d7bl),
      d7ChangeText: util.formatChange(d7bl),
      d30ChangeClass: util.getChangeClass(d30bl),
      d30ChangeText: util.formatChange(d30bl)
    };

    this.setData({
      item: itemData,
      isFavorited: store.isFavorited(item.id)
    });

    // 设置收藏按钮
    wx.setNavigationBarTitle({ title: item.name || '物品详情' });
  },

  async _refreshLatestPrice(item) {
    try {
      const res = await api.apiRequest('item_price_all', {}, 3, true);
      const latest = (res.data || []).find(i => i.id == item.id || i.tid == item.tid);
      if (latest) {
        const updated = { ...item, ...latest };
        store.savePriceSnapshot(updated.id, updated);
        // 更新缓存中的该物品
        const cached = app.getCache();
        if (cached && cached._allItems) {
          const idx = cached._allItems.findIndex(i => i.id === updated.id);
          if (idx >= 0) { cached._allItems[idx] = updated; app.setCache(cached); }
        }
        this._renderItem(updated);
      }
    } catch (e) {
      console.log('[详情] 最新价格获取失败，使用缓存数据');
    }
  },

  _drawChart() {
    const pricePoints = store.getMergedPriceData(this.data.item);
    if (!pricePoints || pricePoints.length < 2) {
      this.setData({ chartError: '数据不足，无法生成曲线' });
      return;
    }

    const query = wx.createSelectorQuery();
    query.select('#priceChart')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res[0] || !res[0].node) {
          this.setData({ chartError: '画布初始化失败' });
          return;
        }

        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const dpr = wx.getSystemInfoSync().pixelRatio;

        canvas.width = res[0].width * dpr;
        canvas.height = res[0].height * dpr;
        ctx.scale(dpr, dpr);

        try {
          chart.drawPriceCurve(ctx, res[0].width, res[0].height, pricePoints);
          this.setData({ chartReady: true });
        } catch (e) {
          console.error('[图表] 绘制失败:', e);
          this.setData({ chartError: '图表渲染失败' });
        }
      });
  },

  // ===== 事件处理 =====
  onToggleFavorite() {
    const { item, itemId } = this.data;
    if (!item) return;

    const isNowFav = store.toggleFavorite({ id: itemId, name: item.name, price: item.price, pic: item.pic });
    this.setData({ isFavorited: isNowFav });
    util.showToast(isNowFav ? '已加入收藏' : '已取消收藏');
  },

  onRefresh() {
    const item = this._findItemInCache(this.data.itemId);
    if (item) {
      this._renderItem(item);
      this._refreshLatestPrice(item);
      util.showToast('刷新中...');
    }
  },

  onRetry() {
    this._loadItem();
  }
});
