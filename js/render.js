// ===== 视图渲染层（所有生成 innerHTML 的函数） =====

// ===== 分类常量 =====
var CATEGORIES = [
  { key: 'gun', name: '枪械', icon: '' },
  { key: 'ammo', name: '子弹', icon: '' },
  { key: 'acc', name: '配件', icon: '' },
  { key: 'helmet', name: '头盔', icon: '' },
  { key: 'armor', name: '护甲', icon: '' },
  { key: 'chest', name: '胸挂', icon: '' },
  { key: 'bag', name: '背包', icon: '' },
  { key: 'key', name: '钥匙卡', icon: '' },
  { key: 'collection', name: '收集品', icon: '' },
  { key: 'consume', name: '消耗品', icon: '' }
];

var CATEGORY_MAP = {};
CATEGORIES.forEach(function(c) { CATEGORY_MAP[c.key] = c.name; });

var itemsPerPage = 20;

// ★ 首页筛选/排序状态
var homeCategoryFilter = 'all';    // 'all' 或分类 key
var homePeriod = 'bl';            // 'bl', 'day_3_bl', 'day_7_bl'
var homePriceRange = 'all';       // 'all', 'lt1w', '1-10w', '10-100w', 'gt100w'
var homeSortBy = 'default';       // 'default' | 'change' | 'price'
var homeSortDir = 'desc';         // 'desc' | 'asc'
var homeMoversCount = 50;         // 首页初始显示条数
var HOME_LOAD_MORE = 30;         // 每次懒加载追加条数
var homeDisplayCount = 50;       // 当前已显示条数
var homeIsLoadingMore = false;   // 懒加载锁
var _homeAllFiltered = [];       // 当前筛选排序后的全量数据
var _homeRenderVersion = 0;      // ★ 渲染版本号：筛选变更时递增，防止旧 rAF 污染新状态
var _homeLoadMoreObserver = null; // IntersectionObserver：监听 #homeLoadMore 提前触发加载

// ★ 重新绑定 #homeLoadMore 的 IntersectionObserver（rootMargin 400px 提前预判）
function _reobserveHomeLoadMore() {
  if (_homeLoadMoreObserver) { _homeLoadMoreObserver.disconnect(); }
  var tip = document.getElementById('homeLoadMore');
  if (!tip) return;
  if (!_homeLoadMoreObserver) {
    _homeLoadMoreObserver = new IntersectionObserver(function(entries) {
      if (entries[0].isIntersecting) {
        loadMoreHomeItems();
      }
    }, { rootMargin: '400px' });
  }
  _homeLoadMoreObserver.observe(tip);
}

// ★ 物品显著性评分：|涨跌幅| × 价格档位
function getItemSignificance(item) {
  var bl = Math.abs(item.bl || item.day_3_bl || item.day_7_bl || 0);
  var p = item.price || 0;
  var pf = p >= 1000000 ? 4 : p >= 100000 ? 3 : p >= 10000 ? 2 : 1;
  return bl * pf;
}

var _topMoverFirstRetryDone = false;

// ===== 首页 =====
function renderHome() {
  checkFavoritePriceChanges();
  renderHomeTopMover();
  renderHomeMovers();
}

// ★ 通用：关闭所有下拉
function closeAllDropdowns() {
  ['timeDropdown','priceDropdown','filterDropdown','sortDropdown'].forEach(function(id) {
    var el = document.getElementById(id); if (el) el.style.display = 'none';
  });
}

// ★ 时间下拉
function toggleTimeDropdown() { toggleDropdown('timeDropdown', 'btnTime'); }
function closeTimeDropdown() { document.getElementById('timeDropdown').style.display = 'none'; }

// ★ 价格下拉
function togglePriceDropdown() { toggleDropdown('priceDropdown', 'btnPrice'); }
function closePriceDropdown() { document.getElementById('priceDropdown').style.display = 'none'; }

// ★ 筛选下拉
function toggleFilterDropdown() { toggleDropdown('filterDropdown', 'btnFilter'); }
function closeFilterDropdown() { document.getElementById('filterDropdown').style.display = 'none'; }

// ★ 排序下拉
function toggleSortDropdown() { toggleDropdown('sortDropdown', 'btnSort'); }
function closeSortDropdown() { document.getElementById('sortDropdown').style.display = 'none'; }

// ★ 启动时将下拉面板移到 body，解决移动端 fixed 定位被父容器裁剪的问题
function moveDropdownsToBody() {
  ['timeDropdown','priceDropdown','filterDropdown','sortDropdown'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el && el.parentNode !== document.body) {
      document.body.appendChild(el);
    }
  });
}

function toggleDropdown(panelId, btnId) {
  var panel = document.getElementById(panelId);
  var isOpen = panel.style.display === 'block';
  closeAllDropdowns();
  if (isOpen) return;
  // 确保面板在 body 下（解决移动端 fixed 定位失效）
  if (panel.parentNode !== document.body) {
    document.body.appendChild(panel);
  }
  // 先显示（不可见）以测量真实宽度
  panel.style.visibility = 'hidden';
  panel.style.display = 'block';
  var panelW = panel.offsetWidth;
  var btn = document.getElementById(btnId);
  var rect = btn.getBoundingClientRect();
  var left = rect.left;
  var vw = window.innerWidth;
  // 夹持到视口内（留 8px 边距），防止窄屏手机面板跑出屏幕
  if (left + panelW > vw - 8) left = vw - panelW - 8;
  if (left < 8) left = 8;
  panel.style.top = (rect.bottom + 4) + 'px';
  panel.style.left = left + 'px';
  panel.style.right = 'auto';
  panel.style.visibility = 'visible';
}

// ★ 点击页面其他地方关闭所有下拉
document.addEventListener('click', function(e) {
  var ids = ['timeDropdown','priceDropdown','filterDropdown','sortDropdown'];
  var btns = ['btnTime','btnPrice','btnFilter','btnSort'];
  var anyOpen = ids.some(function(id) { var el = document.getElementById(id); return el && el.style.display === 'block'; });
  if (!anyOpen) return;
  var target = e.target;
  var inside = ids.some(function(id) { var el = document.getElementById(id); return el && el.contains(target); }) ||
               btns.some(function(id) { var el = document.getElementById(id); return el && el.contains(target); });
  if (!inside) closeAllDropdowns();
});

// ★ 首页筛选：设置时间段
function setHomePeriod(period) {
  homePeriod = period;
  var labels = { bl: '近1天', day_3_bl: '近3天', day_7_bl: '近7天' };
  document.getElementById('timeLabel').textContent = labels[period] || '近1天';
  document.querySelectorAll('#timeDropdown .dropdown-item').forEach(function(item) {
    item.classList.toggle('active', item.dataset.period === period);
  });
  closeAllDropdowns();
  renderHomeMovers();
}

// ★ 首页筛选：设置价格区间
function setHomePriceRange(range) {
  homePriceRange = range;
  var labels = { all: '全部价格', lt1w: '< 1万', '1-10w': '1万~10万', '10-100w': '10万~100万', gt100w: '> 100万' };
  document.getElementById('priceLabel').textContent = labels[range] || '全部价格';
  document.querySelectorAll('#priceDropdown .dropdown-item').forEach(function(item) {
    item.classList.toggle('active', item.dataset.range === range);
  });
  closeAllDropdowns();
  renderHomeMovers();
}

// ★ 首页筛选：设置分类（v3：非 all 时确保全量数据就绪）
function setHomeCategory(cat) {
  homeCategoryFilter = cat;
  var label = cat === 'all' ? '筛选' : (CATEGORY_MAP[cat] || cat);
  document.getElementById('filterLabel').textContent = label;
  document.querySelectorAll('.filter-cat-chip').forEach(function(chip) {
    chip.classList.toggle('active', chip.dataset.cat === cat);
  });
  closeAllDropdowns();

  if (cat !== 'all') {
    var prefetched = window.__prefetch || {};
    if (typeof prefetched.isCategoryComplete === 'function' && prefetched.isCategoryComplete(cat)) {
      renderHomeMovers();
    } else {
      var listEl = document.getElementById('homeMoversList');
      if (listEl) {
        listEl.innerHTML = '<div class="loading-container" style="padding:40px"><div class="loading-spinner"></div><div class="loading-text">正在加载 ' + (CATEGORY_MAP[cat] || cat) + ' 完整数据...</div></div>';
      }
      if (typeof prefetched.prioritizeCategory === 'function') prefetched.prioritizeCategory(cat);
      var _catCheckTimer = setInterval(function() {
        if (typeof prefetched.isCategoryComplete === 'function' && prefetched.isCategoryComplete(cat)) {
          clearInterval(_catCheckTimer);
          if (homeCategoryFilter === cat) renderHomeMovers();
        }
      }, 300);
      setTimeout(function() { clearInterval(_catCheckTimer); if (homeCategoryFilter === cat) renderHomeMovers(); }, 10000);
    }
  } else {
    renderHomeMovers();
  }
}

// ★ 首页排序
function setHomeSort(sortBy, sortDir) {
  homeSortBy = sortBy;
  homeSortDir = sortDir;
  var labelText;
  if (sortBy === 'default') {
    labelText = '综合↓';
  } else if (sortBy === 'change') {
    labelText = '涨跌幅' + (sortDir === 'desc' ? '↓' : '↑');
  } else {
    labelText = '价格' + (sortDir === 'desc' ? '↓' : '↑');
  }
  document.getElementById('sortLabel').textContent = labelText;
  document.querySelectorAll('#sortDropdown .dropdown-item').forEach(function(item) {
    item.classList.toggle('active', item.dataset.sort === sortBy && (sortBy === 'default' || item.dataset.dir === sortDir));
  });
  closeAllDropdowns();
  renderHomeMovers();
}

// ★ 重置所有筛选
function resetAllFilters() {
  homeCategoryFilter = 'all';
  homePeriod = 'bl';
  homePriceRange = 'all';
  homeSortBy = 'default';
  homeSortDir = 'desc';

  document.getElementById('timeLabel').textContent = '近1天';
  document.getElementById('priceLabel').textContent = '全部价格';
  document.getElementById('filterLabel').textContent = '筛选';
  document.getElementById('sortLabel').textContent = '综合↓';
  document.querySelectorAll('#timeDropdown .dropdown-item').forEach(function(c) { c.classList.toggle('active', c.dataset.period === 'bl'); });
  document.querySelectorAll('#priceDropdown .dropdown-item').forEach(function(c) { c.classList.toggle('active', c.dataset.range === 'all'); });
  document.querySelectorAll('.filter-cat-chip').forEach(function(c) { c.classList.toggle('active', c.dataset.cat === 'all'); });
  document.querySelectorAll('#sortDropdown .dropdown-item').forEach(function(c) { c.classList.toggle('active', c.dataset.sort === 'default'); });

  closeAllDropdowns();
  renderHomeMovers();
}

// ★ 首页物品列表（懒加载：初始显示 homeMoversCount 条，滚动到底部加载更多）
var _homeDataArriveListener = null;  // 数据就绪后自动重渲染的回调
function renderHomeMovers(resetCount) {
  if (resetCount !== false) homeDisplayCount = homeMoversCount;
  _homeRenderVersion++;              // ★ 递增版本号，使进行中的旧 loadMoreHomeItems rAF 失效
  homeIsLoadingMore = false;         // ★ 解锁：筛选切换后允许新的懒加载
  var listEl = document.getElementById('homeMoversList');
  if (!listEl) return;

  var cached = getCache();
  var all = cached && cached._allItems ? cached._allItems : [];
  if (all.length === 0) {
    all = getPrefetchItems();
  }
  if (all.length === 0) {
    listEl.innerHTML = '<div class="empty-container" style="padding:20px"><div class="empty-text" style="font-size:12px">数据加载中...</div></div>';
    _homeAllFiltered = [];
    // ★ 数据还未到达：注册一次性监听，数据到达后自动重渲染
    if (!_homeDataArriveListener) {
      _homeDataArriveListener = true;
      var prefetched = window.__prefetch || {};
      if (typeof prefetched.onItemsArrive === 'function') {
        prefetched.onItemsArrive(function() {
          _homeDataArriveListener = null;
          var homePage = document.getElementById('page-home');
          if (homePage && homePage.classList.contains('active')) {
            renderHomeMovers();
            checkFavoritePriceChanges();
            renderHomeTopMover();
          }
        });
      }
    }
    return;
  }

  // 筛选
  var filtered = all;
  if (homeCategoryFilter !== 'all') {
    filtered = all.filter(function(item) { return item._category === homeCategoryFilter; });
  }
  if (homePriceRange !== 'all') {
    filtered = filtered.filter(function(item) {
      var p = item.price || 0;
      if (homePriceRange === 'lt1w') return p < 10000;
      if (homePriceRange === '1-10w') return p >= 10000 && p < 100000;
      if (homePriceRange === '10-100w') return p >= 100000 && p < 1000000;
      if (homePriceRange === 'gt100w') return p >= 1000000;
      return true;
    });
  }
  var field = homePeriod;
  filtered = filtered.filter(function(item) {
    var val = getFieldByPeriod(item, field);
    return val != null && !isNaN(val);
  });

  // 排序
  var dirMul = homeSortDir === 'desc' ? -1 : 1;
  if (homeSortBy === 'default') {
    // ★ v3：默认栏目（全部分类）不排序，物品按到达顺序持续填充
    if (homeCategoryFilter !== 'all') {
      filtered.sort(function(a, b) { return (getItemSignificance(b) - getItemSignificance(a)); });
    }
  } else if (homeSortBy === 'change') {
    filtered.sort(function(a, b) {
      return ((getFieldByPeriod(a, field) || 0) - (getFieldByPeriod(b, field) || 0)) * dirMul;
    });
  } else {
    filtered.sort(function(a, b) { return ((a.price || 0) - (b.price || 0)) * dirMul; });
  }

  // ★ 存储全量数据供懒加载使用
  _homeAllFiltered = filtered;

  // 截取当前应显示的数量
  var items = filtered.slice(0, homeDisplayCount);

  if (items.length === 0) {
    listEl.innerHTML = '<div class="empty-container" style="padding:20px"><div class="empty-icon" style="font-size:24px">-</div><div class="empty-text" style="font-size:12px">暂无数据</div></div>';
    return;
  }

  var maxAbsBl = 0;
  items.forEach(function(item) { var a = Math.abs(getFieldByPeriod(item, field) || 0); if (a > maxAbsBl) maxAbsBl = a; });

  var html = items.map(function(item) {
    return _renderHomeItemCard(item, field, maxAbsBl);
  }).join('');

  // ★ 底部加载提示（显示剩余数量）
  if (homeDisplayCount < filtered.length) {
    var remaining = filtered.length - homeDisplayCount;
    html += '<div class="home-load-more" id="homeLoadMore" style="text-align:center;padding:16px;color:#888;font-size:12px">上拉加载更多（剩余 ' + remaining + ' 件）</div>';
  }

  listEl.innerHTML = html;
  _reobserveHomeLoadMore();
}

// ★ 懒加载：追加更多物品
function loadMoreHomeItems() {
  if (homeIsLoadingMore) return;
  if (_homeAllFiltered.length === 0) return;
  // ★ 已全部展示：更新提示文字，不再加载
  if (homeDisplayCount >= _homeAllFiltered.length) {
    var doneTip = document.getElementById('homeLoadMore');
    if (doneTip) doneTip.textContent = '已加载全部 ' + _homeAllFiltered.length + ' 件';
    return;
  }

  homeIsLoadingMore = true;
  var loadMoreEl = document.getElementById('homeLoadMore');
  if (loadMoreEl) loadMoreEl.textContent = '加载中...';

  // ★ 捕获当前版本号，rAF 回调中检验：若筛选已变更则放弃本次追加
  var captureVersion = _homeRenderVersion;

  // 使用 requestAnimationFrame 避免阻塞
  requestAnimationFrame(function() {
    // ★ 筛选已切换 → 放弃本次追加，避免污染新状态
    if (_homeRenderVersion !== captureVersion) {
      homeIsLoadingMore = false;
      return;
    }
    homeDisplayCount = Math.min(homeDisplayCount + HOME_LOAD_MORE, _homeAllFiltered.length);
    var field = homePeriod;

    var existingCards = document.querySelectorAll('#homeMoversList .item-card');
    var existingIds = {};
    for (var i = 0; i < existingCards.length; i++) {
      if (existingCards[i].dataset.itemId) existingIds[existingCards[i].dataset.itemId] = true;
    }

    var newItems = _homeAllFiltered.filter(function(item) {
      return !existingIds[item.id];
    }).slice(0, HOME_LOAD_MORE);

    if (newItems.length === 0) { homeIsLoadingMore = false; return; }

    var maxAbsBl = 0;
    _homeAllFiltered.slice(0, homeDisplayCount).forEach(function(item) {
      var a = Math.abs(getFieldByPeriod(item, field) || 0);
      if (a > maxAbsBl) maxAbsBl = a;
    });

    var fragment = document.createDocumentFragment();
    var div = document.createElement('div');
    div.innerHTML = newItems.map(function(item) {
      return _renderHomeItemCard(item, field, maxAbsBl);
    }).join('');

    // 移除旧的加载提示
    if (loadMoreEl && loadMoreEl.parentNode) loadMoreEl.parentNode.removeChild(loadMoreEl);

    while (div.firstChild) { fragment.appendChild(div.firstChild); }
    var listEl = document.getElementById('homeMoversList');
    if (listEl) listEl.appendChild(fragment);

    // 追加加载提示
    var remaining = _homeAllFiltered.length - homeDisplayCount;
    if (remaining > 0) {
      var tip = document.createElement('div');
      tip.id = 'homeLoadMore';
      tip.style.cssText = 'text-align:center;padding:16px;color:#888;font-size:12px';
      tip.textContent = '上拉加载更多（剩余 ' + remaining + ' 件）';
      if (listEl) listEl.appendChild(tip);
      _reobserveHomeLoadMore();
    } else {
      // 全部加载完成：加入完成提示，1.5s 后自动消失
      var doneTip = document.createElement('div');
      doneTip.id = 'homeLoadMore';
      doneTip.style.cssText = 'text-align:center;padding:16px;color:#4caf50;font-size:12px';
      doneTip.textContent = '已加载全部 ' + _homeAllFiltered.length + ' 件';
      if (listEl) listEl.appendChild(doneTip);
      // ★ 全部加载后断开 observer，避免无效触发
      if (_homeLoadMoreObserver) { _homeLoadMoreObserver.disconnect(); }
      setTimeout(function() {
        var el = document.getElementById('homeLoadMore');
        if (el && el.textContent.indexOf('已加载全部') >= 0) {
          el.textContent = '共 ' + _homeAllFiltered.length + ' 件物品';
        }
      }, 2000);
    }

    homeIsLoadingMore = false;
  });
}

// ★ 使用已排序数据渲染首页（用于首批快速展示，不读缓存）
function renderHomeMoversWithData(items, append) {
  var listEl = document.getElementById('homeMoversList');
  if (!listEl) return;
  if (!items || items.length === 0) {
    if (!append) listEl.innerHTML = '<div class="empty-container" style="padding:20px"><div class="empty-text" style="font-size:12px">数据加载中...</div></div>';
    return;
  }

  // 筛选
  var filtered = items;
  if (homeCategoryFilter !== 'all') {
    filtered = items.filter(function(item) { return item._category === homeCategoryFilter; });
  }
  if (homePriceRange !== 'all') {
    filtered = filtered.filter(function(item) {
      var p = item.price || 0;
      if (homePriceRange === 'lt1w') return p < 10000;
      if (homePriceRange === '1-10w') return p >= 10000 && p < 100000;
      if (homePriceRange === '10-100w') return p >= 100000 && p < 1000000;
      if (homePriceRange === 'gt100w') return p >= 1000000;
      return true;
    });
  }
  var field = homePeriod;
  filtered = filtered.filter(function(item) {
    var val = getFieldByPeriod(item, field);
    return val != null && !isNaN(val);
  });

  if (homeSortBy === 'default') {
    // ★ v3：默认栏目（全部分类）不排序，物品按到达顺序持续填充
    if (homeCategoryFilter !== 'all') {
      filtered.sort(function(a, b) { return (getItemSignificance(b) - getItemSignificance(a)); });
    }
  } else if (homeSortBy === 'change') {
    var dirMul = homeSortDir === 'desc' ? -1 : 1;
    filtered.sort(function(a, b) { return ((getFieldByPeriod(a, field) || 0) - (getFieldByPeriod(b, field) || 0)) * dirMul; });
  } else {
    var dm = homeSortDir === 'desc' ? -1 : 1;
    filtered.sort(function(a, b) { return ((a.price || 0) - (b.price || 0)) * dm; });
  }

  // ★ 存储全量数据
  _homeAllFiltered = filtered;
  homeDisplayCount = homeMoversCount;
  var displayItems = filtered.slice(0, homeDisplayCount);

  if (!append) {
    if (displayItems.length === 0) {
      listEl.innerHTML = '<div class="empty-container" style="padding:20px"><div class="empty-text" style="font-size:12px">暂无数据</div></div>';
      return;
    }
    var maxAbsBl = 0;
    displayItems.forEach(function(item) { var a = Math.abs(getFieldByPeriod(item, field) || 0); if (a > maxAbsBl) maxAbsBl = a; });

    var html = displayItems.map(function(item) {
      return _renderHomeItemCard(item, field, maxAbsBl);
    }).join('');
    if (homeDisplayCount < filtered.length) {
      var remaining = filtered.length - homeDisplayCount;
      html += '<div class="home-load-more" id="homeLoadMore" style="text-align:center;padding:16px;color:#888;font-size:12px">上拉加载更多（剩余 ' + remaining + ' 件）</div>';
    }
    listEl.innerHTML = html;
    _reobserveHomeLoadMore();
  } else {
    var existingIds = {};
    var existingCards = listEl.querySelectorAll('.item-card');
    for (var i = 0; i < existingCards.length; i++) {
      if (existingCards[i].dataset.itemId) existingIds[existingCards[i].dataset.itemId] = true;
    }
    var newItems = displayItems.filter(function(item) { return !existingIds[item.id]; });
    if (newItems.length === 0) return;

    var maxAbsBl2 = 0;
    displayItems.forEach(function(item) { var a = Math.abs(getFieldByPeriod(item, field) || 0); if (a > maxAbsBl2) maxAbsBl2 = a; });

    var fragment = document.createDocumentFragment();
    var tempDiv = document.createElement('div');
    tempDiv.innerHTML = newItems.map(function(item) {
      return _renderHomeItemCard(item, field, maxAbsBl2);
    }).join('');
    while (tempDiv.firstChild) { fragment.appendChild(tempDiv.firstChild); }
    // 移除旧的加载提示
    var oldTip = document.getElementById('homeLoadMore');
    if (oldTip) oldTip.parentNode.removeChild(oldTip);
    listEl.appendChild(fragment);
    if (homeDisplayCount < filtered.length) {
      var tip = document.createElement('div');
      tip.id = 'homeLoadMore';
      tip.style.cssText = 'text-align:center;padding:16px;color:#888;font-size:12px';
      tip.textContent = '上拉加载更多';
      listEl.appendChild(tip);
      _reobserveHomeLoadMore();
    }
  }
}

// ★ 渲染单个首页物品卡片（复用逻辑）
function _renderHomeItemCard(item, field, maxAbsBl) {
  var bl = getFieldByPeriod(item, field) || 0;
  var absBl = Math.abs(bl);
  var gradeBg = (item._category !== 'gun' && item.grade) ? 'background:' + getGradeColor(item.grade) + '15;border-color:' + getGradeColor(item.grade) + '30;' : '';
  var gradeDiamond = (item._category !== 'gun' && item.grade) ? '<div class="grade-diamond" style="background:' + getGradeColor(item.grade) + '"></div>' : '';
  var picHtml = item.pic ? '<img src="' + sanitizeUrl(item.pic) + '" alt="" loading="lazy" decoding="async" onerror="this.parentElement.innerHTML=\'<span class=pic-placeholder>-</span>\'">' : '<span class="pic-placeholder">-</span>';
  var gradeTag = (item._category !== 'gun' && item.grade) ? '<span class="item-grade" style="color:' + getGradeColor(item.grade) + '">' + getGradeText(item.grade) + '</span>' : '';
  // ★ 迷你折线图：用 API 锚点（30d/7d/3d/当前）画趋势，无 localStorage 开销
  var sparkHtml = _renderMiniSparkline(item);
  return '<div class="item-card fade-in" data-item-id="' + item.id + '" onclick="openPriceMover(' + JSON.stringify(item.id) + ')" style="position:relative;' + gradeBg + '">' +
    gradeDiamond +
    '<div class="item-pic">' + picHtml + '</div>' +
    '<div class="item-info">' +
      '<div class="item-name-row">' +
        '<span class="item-name">' + escapeHtml(item.name) + '</span>' +
        gradeTag +
      '</div>' +
      '<div class="item-price-row">' +
        '<span class="item-price">\xA5' + formatPrice(item.price) + '</span>' +
        '<span class="item-change ' + getChangeClass(bl) + '">' + formatChange(bl) + '</span>' +
      '</div>' +
      sparkHtml +
    '</div>' +
    '<span class="item-arrow">›</span>' +
  '</div>';
}

// ★ 迷你折线图（统一使用 getMergedPriceData，整合 API 锚点 + 本地历史 + 云端快照）
function _renderMiniSparkline(item) {
  var pts = getMergedPriceData(item);
  if (!pts || pts.length < 2) return '';
  var prices = pts.map(function(p) { return p.price; });
  var minP = Math.min.apply(null, prices);
  var maxP = Math.max.apply(null, prices);
  var range = (maxP - minP) || 1;
  var W = 60, H = 20;
  var padX = 2, padY = 4;
  var pw = W - padX * 2, ph = H - padY * 2;

  var ptsStr = pts.map(function(p) {
    var safeDay = Math.max(0, Math.min(p.day, 30));
    var x = padX + (1 - safeDay / 30) * pw;
    var y = padY + ph - ((p.price - minP) / range) * ph;
    return x.toFixed(1) + ',' + y.toFixed(1);
  }).join(' ');

  var isUp = pts[pts.length - 1].price >= pts[0].price;
  var color = isUp ? '#4caf50' : '#f44336';

  return '<div class="item-mini-spark" style="margin-top:4px">' +
    '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:60px;height:20px;display:block"><polyline points="' + ptsStr + '" fill="none" stroke="' + color + '" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
  '</div>';
}

// ★ 后台渐进式追加物品到首页（静默更新，不阻塞交互）
function appendHomeItems(newItems) {
  if (!newItems || newItems.length === 0) return;
  renderHomeMoversWithData(newItems, true);
}

// ★ 静默更新首页数据（后台加载完成后更新，保留滚动位置）
var _homeSilentUpdateTimer = null;
function scheduleHomeSilentUpdate() {
  if (_homeSilentUpdateTimer) clearTimeout(_homeSilentUpdateTimer);
  _homeSilentUpdateTimer = setTimeout(function() {
    _homeSilentUpdateTimer = null;
    var homePage = document.getElementById('page-home');
    if (!homePage || !homePage.classList.contains('active')) return;
    var cached = getCache();
    var all = cached && cached._allItems ? cached._allItems : [];
    if (all.length === 0) all = getPrefetchItems();
    if (all.length === 0) return;
    // ★ 如果数据量增加了，用 renderHomeMovers 完整更新（应用当前筛选）
    if (all.length > _homeAllFiltered.length) {
      renderHomeMovers(false);
      checkFavoritePriceChanges();
      renderHomeTopMover();
    }
  }, 500);
}

// ===== 分类图标 =====
function updateCategoryIcons(allItems) {
  if (!allItems || allItems.length === 0) return;
  const existing = getCatIconsCache() || {};
  const picks = {};
  // 浅拷贝 existing 到 picks
  Object.keys(existing).forEach(function(k) { picks[k] = existing[k]; });
  allItems.forEach(function(item) {
    const cat = item._category;
    if (cat && !picks[cat] && item.pic) {
      picks[cat] = item.pic;
    }
  });
  const logisticsItem = allItems.find(function(i) { return i.name === '物流信息单' && i.pic; });
  if (logisticsItem) picks['all'] = logisticsItem.pic;

  setCatIconsCache(picks);
  document.querySelectorAll('.cat-icon[data-cat]').forEach(function(el) {
    const cat = el.dataset.cat;
    if (picks[cat]) {
      el.innerHTML = catIconHTML(picks[cat]);
    }
  });
}

// ===== 列表渲染 =====
function sortItems(items) {
  const sorted = [...items];
  const dir = sortDir === 'asc' ? 1 : -1;
  if (sortBy === 'price') {
    sorted.sort(function(a, b) { return ((a.price || 0) - (b.price || 0)) * dir; });
  } else if (sortBy === 'change') {
    sorted.sort(function(a, b) { return ((a.bl || 0) - (b.bl || 0)) * dir; });
  }
  return sorted;
}

function renderList(items, showCategory) {
  if (showCategory === undefined || showCategory === null) showCategory = false;
  var sorted = sortItems(items);
  var loadedCount = sorted.length;

  // ★ 从预取数据获取 API 真实总数（用于显示准确分页信息）
  var realTotal = 0;
  var isLoadingMore = false;
  if (currentCategory && currentCategory.key && currentCategory.key !== 'fav' && currentCategory.key !== 'all') {
    realTotal = typeof getCategoryTotalCount === 'function' ? getCategoryTotalCount(currentCategory.key) : 0;
    var prefetched = window.__prefetch || {};
    var pCat = prefetched[currentCategory.key];
    isLoadingMore = pCat && pCat._loadingMore === true;
  } else if (currentCategory && currentCategory.key === 'all') {
    var stats = typeof getGlobalStats === 'function' ? getGlobalStats() : null;
    realTotal = stats ? stats.totalItems : 0;
    isLoadingMore = stats ? !stats.allComplete : false;
  }

  // 用真实总数计算分页
  var effectiveTotal = realTotal > loadedCount ? realTotal : loadedCount;
  var totalPages = Math.ceil(effectiveTotal / itemsPerPage) || 1;
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;
  var start = (currentPage - 1) * itemsPerPage;
  var pageItems = sorted.slice(start, start + itemsPerPage);

  // ★ 列表统计：显示真实总数 + 加载状态
  var statsHtml = '<span>共 ' + (realTotal > 0 ? formatLargeNum(realTotal) : loadedCount) + ' 件';
  if (realTotal > 0 && realTotal > loadedCount) {
    statsHtml += ' <span style="font-size:10px;color:#888">(已加载 ' + formatLargeNum(loadedCount) + ')</span>';
  }
  if (isLoadingMore) {
    statsHtml += ' <span style="font-size:10px;color:#6366f1">加载中...</span>';
  }
  statsHtml += ' \xB7 第 ' + currentPage + '/' + totalPages + ' 页</span>';
  if (sorted.length > 0) {
    statsHtml += '<span>更新于 ' + formatTime(sorted[0].is_get_time) + '</span>';
  }
  document.getElementById('listStats').innerHTML = statsHtml;

  const content = document.getElementById('listContent');
  if (sorted.length === 0) {
    var emptyMsg = isLoadingMore ? '正在加载数据，请稍候...' : '暂无物品数据';
    content.innerHTML = '<div class="empty-container"><div class="empty-icon">' + (isLoadingMore ? '' : '-') + '</div><div class="empty-text">' + emptyMsg + '</div></div>';
    document.getElementById('pagination').innerHTML = '';
    return;
  }
  content.innerHTML = pageItems.map(function(item) {
    const bl = item.bl || 0;
    const d30bl = item.day_30_bl || 0;
    const d30p = item.day_30_price || 0;
    const catName = CATEGORY_MAP[item._category] || escapeHtml(item.secondClassCN || '');
    var gradeBg = (item._category !== 'gun' && item.grade) ? 'background:' + getGradeColor(item.grade) + '15;border-color:' + getGradeColor(item.grade) + '30;' : '';
    var gradeDiamond = (item._category !== 'gun' && item.grade) ? '<div class="grade-diamond" style="background:' + getGradeColor(item.grade) + '"></div>' : '';
    var picHtml = item.pic
      ? '<img src="' + sanitizeUrl(item.pic) + '" alt="" loading="lazy" decoding="async" onerror="this.parentElement.innerHTML=\'<span class=pic-placeholder>-</span>\'">'
      : '<span class="pic-placeholder">-</span>';
    var catGradeTag = (item._category !== 'gun' && item.grade) ? '<span class="item-grade" style="color:' + getGradeColor(item.grade) + '">' + getGradeText(item.grade) + '</span>' : '';
    var attrs = [];
    if (showCategory && catName) attrs.push(catName);
    if (item.length && item.width) attrs.push(item.length + '\xD7' + item.width);
    if (item._category !== 'gun' && item.grade) attrs.push(getGradeText(item.grade));
    var attrHtml = attrs.length ? '<div class="item-attrs"><span class="item-attrs-text">' + attrs.join(' \xB7 ') + '</span></div>' : '';
    var trendHtml = d30p ? '\n            <div class="item-trend-mini">\n              <span class="trend-mini-label">30天前:</span>\n              <span class="trend-mini-price">\xA5' + formatPrice(d30p) + '</span>\n              <span class="trend-mini-change ' + getChangeClass(d30bl) + '">' + formatChange(d30bl) + '</span>\n            </div>' : '';
    var pts = getMergedPriceData(item);
    var sparkHtml = pts.length >= 2 ? '<div class="item-sparkline">' + generateSparklineSVG(pts) + '</div>' : '';
    var favIndicator = isFavorited(item.id) ? '<span class="item-fav-indicator"></span>' : '';

    return '<div class="item-card fade-in" style="position:relative;' + gradeBg + '" onclick="openDetail(' + JSON.stringify(item.id) + ')">\n          ' + gradeDiamond + '\n          <div class="item-pic">\n            ' + picHtml + '\n          </div>\n          <div class="item-info">\n            <div class="item-name-row">\n              <span class="item-name">' + escapeHtml(item.name) + '</span>\n              ' + catGradeTag + '\n            </div>\n            <div class="item-price-row">\n              <span class="item-price">\xA5' + formatPrice(item.price) + '</span>\n              <span class="item-change ' + getChangeClass(bl) + '">' + formatChange(bl) + '</span>\n            </div>\n            ' + attrHtml + '\n            ' + trendHtml + '\n          </div>\n          ' + sparkHtml + '\n          <span class="item-arrow">›</span>\n          ' + favIndicator + '\n        </div>';
  }).join('');
  renderPagination(totalPages);
}

function renderPagination(totalPages) {
  const pagination = document.getElementById('pagination');
  if (totalPages <= 1) {
    pagination.innerHTML = '';
    return;
  }
  var startPage = Math.max(1, currentPage - 3);
  var endPage = Math.min(totalPages, currentPage + 3);
  if (endPage - startPage < 6) {
    if (startPage === 1) endPage = Math.min(totalPages, startPage + 6);
    else startPage = Math.max(1, endPage - 6);
  }
  var html = '<div class="pagination">';
  html += '<button class="page-btn arrow ' + (currentPage <= 1 ? 'disabled' : '') + '" onclick="goToPage(' + (currentPage - 1) + ')">◀</button>';
  if (startPage > 1) {
    html += '<button class="page-btn" onclick="goToPage(1)">1</button>';
    if (startPage > 2) html += '<span style="color:#666;padding:0 2px">…</span>';
  }
  for (var i = startPage; i <= endPage; i++) {
    html += '<button class="page-btn' + (i === currentPage ? ' active' : '') + '" onclick="goToPage(' + i + ')">' + i + '</button>';
  }
  if (endPage < totalPages) {
    if (endPage < totalPages - 1) html += '<span style="color:#666;padding:0 2px">…</span>';
    html += '<button class="page-btn" onclick="goToPage(' + totalPages + ')">' + totalPages + '</button>';
  }
  html += '<button class="page-btn arrow ' + (currentPage >= totalPages ? 'disabled' : '') + '" onclick="goToPage(' + (currentPage + 1) + ')">▶</button>';
  html += '</div>';
  pagination.innerHTML = html;
}

// ===== 搜索历史 =====
function renderSearchHistory() {
  const history = getSearchHistory();
  const section = document.getElementById('searchHistory');
  const tags = document.getElementById('historyTags');
  if (history.length === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';
  tags.innerHTML = history.map(function(kw) {
    return '<span class="history-tag" onclick="searchFromHistory(\'' + escapeJSStr(kw) + '\')">' + escapeHtml(kw) + '</span>';
  }).join('');
}

// ===== 最近浏览 =====
function renderRecentViews() {
  const views = getRecentViews();
  const section = document.getElementById('recentViewSection');
  const container = document.getElementById('recentViewItems');
  if (views.length === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';
  container.innerHTML = views.map(function(item) {
    const bl = item.bl || 0;
    var picHtml = item.pic
      ? '<img src="' + sanitizeUrl(item.pic) + '" alt="" loading="lazy" decoding="async" onerror="this.parentElement.innerHTML=\'<span class=pic-placeholder style=font-size:20px>-</span>\'">'
      : '<span class="pic-placeholder" style="font-size:20px">-</span>';
    return '\n        <div class="result-item fade-in" onclick="openDetailFromRecent(' + JSON.stringify(item.id) + ')">\n          <div class="item-pic" style="width:40px;height:40px;margin-right:10px">\n            ' + picHtml + '\n          </div>\n          <div class="item-info">\n            <div class="item-name-row">\n              <span class="item-name">' + escapeHtml(item.name) + '</span>\n              <span style="font-size:10px;color:#667eea;margin-left:6px">' + escapeHtml(CATEGORY_MAP[item._category] || item.secondClassCN || '') + '</span>\n            </div>\n            <div class="item-price-row">\n              <span class="item-price">\xA5' + formatPrice(item.price) + '</span>\n              <span class="item-change ' + getChangeClass(bl) + '">' + formatChange(bl) + '</span>\n            </div>\n          </div>\n          <span class="item-arrow">›</span>\n        </div>';
  }).join('');
}

// ===== 收藏列表 =====
function renderFavorites() {
  const favs = getFavorites();
  const section = document.getElementById('favoritesSection');
  const container = document.getElementById('favoritesItems');
  if (favs.length === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';
  container.innerHTML = favs.map(function(item) {
    const bl = item.bl || 0;
    var picHtml = item.pic
      ? '<img src="' + sanitizeUrl(item.pic) + '" alt="" loading="lazy" decoding="async" onerror="this.parentElement.innerHTML=\'<span class=pic-placeholder style=font-size:20px>-</span>\'">'
      : '<span class="pic-placeholder" style="font-size:20px">-</span>';
    return '\n        <div class="result-item fade-in" onclick="openDetailFromFavorite(' + JSON.stringify(item.id) + ')">\n          <div class="item-pic" style="width:40px;height:40px;margin-right:10px">\n            ' + picHtml + '\n          </div>\n          <div class="item-info">\n            <div class="item-name-row">\n              <span class="item-name">' + escapeHtml(item.name) + '</span>\n              <span style="font-size:10px;color:#667eea;margin-left:6px">' + escapeHtml(CATEGORY_MAP[item._category] || item.secondClassCN || '') + '</span>\n            </div>\n            <div class="item-price-row">\n              <span class="item-price">\xA5' + formatPrice(item.price) + '</span>\n              <span class="item-change ' + getChangeClass(bl) + '">' + formatChange(bl) + '</span>\n            </div>\n          </div>\n          <span class="item-arrow">›</span>\n        </div>';
  }).join('');
}

// ===== 详情页 =====
function renderDetail(item) {
  const bl = item.bl || 0;
  const d3bl = item.day_3_bl || 0;
  const d7bl = item.day_7_bl || 0;
  const d30bl = item.day_30_bl || 0;
  const d3p = item.day_3_price || 0;
  const d7p = item.day_7_price || 0;
  const d30p = item.day_30_price || 0;
  const price = item.price || 0;
  const pricePoints = getMergedPriceData(item);

  var picHtml = item.pic
    ? '<img src="' + sanitizeUrl(item.pic) + '" alt="" decoding="async" fetchpriority="high" onerror="this.parentElement.innerHTML=\'<span style=font-size:36px>-</span>\'">'
    : '<span style="font-size:36px">-</span>';
  var metaHtml = '';
  if (item.secondClassCN) metaHtml += '<span class="meta-tag">' + escapeHtml(item.secondClassCN) + '</span>';
  if (item.grade) metaHtml += '<span class="meta-tag" style="color:' + getGradeColor(item.grade) + '">' + getGradeText(item.grade) + '</span>';
  var descHtml = item.desc ? '<div style="font-size:11px;color:#666;margin-top:6px;line-height:1.5">' + escapeHtml(item.desc) + '</div>' : '';

  var propsHtml = '';
  if (item.length || item.width || item.weight || item.Weight) {
    var propItems = '';
    if (item.secondClassCN) propItems += '<div class="info-item"><span class="info-label">分类</span><span class="info-value">' + escapeHtml(item.secondClassCN) + '</span></div>';
    if (item.length && item.width) propItems += '<div class="info-item"><span class="info-label">占格</span><span class="info-value">' + item.length + '\xD7' + item.width + '</span></div>';
    if (item.weight || item.Weight) propItems += '<div class="info-item"><span class="info-label">重量</span><span class="info-value">' + (item.weight || item.Weight) + ' kg</span></div>';
    if (item.grade) propItems += '<div class="info-item"><span class="info-label">等级</span><span class="info-value" style="color:' + getGradeColor(item.grade) + '">' + getGradeText(item.grade) + '</span></div>';
    if (item.objectID) propItems += '<div class="info-item"><span class="info-label">ID</span><span class="info-value" style="font-size:13px">' + escapeHtml(item.objectID) + '</span></div>';
    propsHtml = '\n      <div class="section">\n        <div class="section-title">物品属性</div>\n        <div class="info-grid">' + propItems + '</div>\n      </div>';
  }

  const detailContent = document.getElementById('detailContent');
  detailContent.innerHTML = '\n      <div class="detail-header">\n        <div class="detail-pic">\n          ' + picHtml + '\n        </div>\n        <div class="detail-basic">\n          <div class="detail-name">' + escapeHtml(item.name) + '</div>\n          <div class="detail-meta">\n            ' + metaHtml + '\n          </div>\n          ' + descHtml + '\n        </div>\n      </div>\n\n      <div class="price-card">\n        <div class="price-card-header">\n          <span class="price-card-title">当前价格</span>\n          <span class="price-card-time">更新于 ' + formatTime(item.is_get_time) + '</span>\n        </div>\n        <div class="price-main">\n          <span class="price-currency">\xA5</span>\n          <span class="price-value">' + formatPrice(price) + '</span>\n        </div>\n        <div class="price-sub">\n          <div class="sub-item">\n            <span class="sub-label">今日开盘</span>\n            <span class="sub-value">\xA5' + formatPrice(item.price_start || item.priceStart || 0) + '</span>\n          </div>\n          <div class="sub-item">\n            <span class="sub-label">今日涨跌</span>\n            <span class="sub-value ' + getChangeClass(bl) + '">' + formatChange(bl) + '</span>\n          </div>\n        </div>\n      </div>\n\n      <div class="section">\n        <div class="section-title">近30天价格趋势</div>\n        <div class="price-curve-box">\n          ' + generatePriceCurveSVG(pricePoints) + '\n          <div class="curve-legend">\n            <div class="curve-legend-item"><span class="curve-legend-dot" style="background:#888"></span>30天前 \xA5' + formatPrice(d30p) + ' <span class="' + getChangeClass(d30bl) + '" style="font-size:10px">' + formatChange(d30bl) + '</span></div>\n            <div class="curve-legend-item"><span class="curve-legend-dot" style="background:#667eea"></span>7天前 \xA5' + formatPrice(d7p) + ' <span class="' + getChangeClass(d7bl) + '" style="font-size:10px">' + formatChange(d7bl) + '</span></div>\n            <div class="curve-legend-item"><span class="curve-legend-dot" style="background:#4caf50"></span>3天前 \xA5' + formatPrice(d3p) + ' <span class="' + getChangeClass(d3bl) + '" style="font-size:10px">' + formatChange(d3bl) + '</span></div>\n            <div class="curve-legend-item"><span class="curve-legend-dot" style="background:#ffd700"></span>当前 \xA5' + formatPrice(price) + '</div>\n          </div>\n        </div>\n      </div>\n\n      ' + propsHtml + '\n\n      <div class="source-note">\n        <span>数据来源：三角洲数据帝 orzice.com 开放平台</span>\n        <span>禁止编造或篡改任何价格信息</span>\n      </div>\n    ';
  updateFavoriteButton(item.id);

  // 异步拉取云端历史数据，渐入更新图表
  getOrFetchCloudSnapshots(item.id).then(function(cloudSnaps) {
    if (!cloudSnaps || cloudSnaps.length === 0) return;

    var cloudPricePoints = getMergedPriceData(item, cloudSnaps);
    var svgContainer = document.querySelector('.price-curve-box');
    if (!svgContainer || cloudPricePoints.length < 2) return;

    var oldSvg = svgContainer.querySelector('svg');
    var legendEl = svgContainer.querySelector('.curve-legend');
    var newSvg = generatePriceCurveSVG(cloudPricePoints);

    // 渐入过渡：先淡出旧图，替换后淡入新图
    if (oldSvg) {
      oldSvg.style.opacity = '0';
      setTimeout(function() {
        svgContainer.innerHTML = newSvg + (legendEl ? legendEl.outerHTML : '');
        var newSvgEl = svgContainer.querySelector('svg');
        if (newSvgEl) newSvgEl.style.opacity = '1';
      }, 260);
    } else {
      svgContainer.innerHTML = newSvg + (legendEl ? legendEl.outerHTML : '');
    }
  }).catch(function(e) {
    console.log('[详情] 云端历史获取失败，使用本地数据');
  });
}

function updateFavoriteButton(itemId) {
  const btn = document.getElementById('detailFavBtn');
  if (!btn) return;
  if (isFavorited(itemId)) {
    btn.classList.add('favorited');
  } else {
    btn.classList.remove('favorited');
  }
}

// ===== 搜索结果 =====
function renderSearchResults(results, keyword) {
  const container = document.getElementById('searchResults');
  if (results.length === 0) {
    container.innerHTML = '<div class="empty-container"><div class="empty-icon">-</div><div class="empty-text">未找到 "' + escapeHtml(keyword) + '" 相关物品</div></div>';
    return;
  }
  container.innerHTML = '<div style="padding:10px 16px;font-size:12px;color:#888">找到 ' + results.length + ' 个结果</div>' +
    results.map(function(item) {
      const bl = item.bl || 0;
      var picHtml = item.pic
        ? '<img src="' + sanitizeUrl(item.pic) + '" alt="" loading="lazy" decoding="async" onerror="this.parentElement.innerHTML=\'<span class=pic-placeholder style=font-size:20px>-</span>\'">'
        : '<span class="pic-placeholder" style="font-size:20px">-</span>';
      return '\n          <div class="result-item fade-in" onclick="openDetailFromSearch(' + JSON.stringify(item.id) + ')">\n            <div class="item-pic" style="width:40px;height:40px;margin-right:10px">\n              ' + picHtml + '\n            </div>\n            <div class="item-info">\n              <div class="item-name-row">\n                <span class="item-name">' + escapeHtml(item.name) + '</span>\n                <span class="item-grade" style="background:rgba(102,126,234,0.15);color:#667eea;font-size:10px;padding:2px 8px;border-radius:8px;margin-left:8px">' + escapeHtml(CATEGORY_MAP[item._category] || item.secondClassCN || '') + '</span>\n              </div>\n              <div class="item-price-row">\n                <span class="item-price">\xA5' + formatPrice(item.price) + '</span>\n                <span class="item-change ' + getChangeClass(bl) + '">' + formatChange(bl) + '</span>\n              </div>\n            </div>\n            <span class="item-arrow">›</span>\n          </div>';
    }).join('');
}

// ===== 价格异动页 =====
function getFieldByPeriod(item, field) {
  // ★ 容错：字段不存在或为 null/undefined 时返回 0，防止筛选把旧缓存数据全部滤掉
  if (field === 'bl') return (item.bl != null) ? item.bl : 0;
  if (field === 'day_3_bl') return (item.day_3_bl != null) ? item.day_3_bl : 0;
  if (field === 'day_7_bl') return (item.day_7_bl != null) ? item.day_7_bl : 0;
  return (item.bl != null) ? item.bl : 0;
}

function getPrefetchItems() {
  var prefetched = window.__prefetch;
  if (!prefetched) return [];
  var cats = Object.keys(prefetched);
  var all = [];
  for (var i = 0; i < cats.length; i++) {
    var p = prefetched[cats[i]];
    if (p && p._resolvedData) {
      all = all.concat(p._resolvedData);
    }
  }
  return all;
}

// ===== 获取分类图标 =====
var _topMoverApiDone = false;
function renderHomeTopMover() {
  var el = document.getElementById('topMover');
  if (!el) return;

  var cached = getCache();
  var all = cached && cached._allItems ? cached._allItems : getPrefetchItems();

  if (all.length === 0) {
    if (!_topMoverFirstRetryDone) {
      _topMoverFirstRetryDone = true;
      setTimeout(function() { renderHomeTopMover(); }, 100);
    }
    if (!el.innerHTML || el.innerHTML.trim() === '') { el.style.display = 'none'; }
    return;
  }

  // ★ v3：prefetch 已将 item_price_all 真实价格注入所有物品
  var prefetched = window.__prefetch || {};
  _topMoverApiDone = !!(prefetched._topMoverApiDone);

  _renderTopMoverFromData(all);
}

/** 从给定数据中提取涨幅前二并渲染 */
function _renderTopMoverFromData(all) {
  var el = document.getElementById('topMover');
  if (!el) return;
  var candidates = [];
  all.forEach(function(item) {
    if (!item.price || item.price < 20000) return;
    var v = item.day_7_bl;
    var isDay7 = v != null && v > 0.01;
    if (!isDay7) { v = item.bl; }
    if (v != null && v > 0.01) {
      candidates.push({ item: item, val: v, isDay7: isDay7 });
    }
  });
  if (candidates.length === 0) {
    el.style.display = 'none';
    return;
  }
  candidates.sort(function(a, b) { return b.val - a.val; });
  var top2 = candidates.slice(0, 2);
  el.style.display = 'block';
  el.innerHTML = '<div style="padding:8px 0">' +
    top2.map(function(t, idx) {
      var item = t.item;
      var val = t.val;
      var label = idx === 0 ? '涨幅第一' : '涨幅第二';
      var periodText = t.isDay7 ? '近7天' : '今日';
      var freshness = _topMoverApiDone ? ' <span style="font-size:9px;color:#4fc3f7;font-weight:normal">●实时</span>' : '';
      var picHtml = item.pic
        ? '<img src="' + sanitizeUrl(item.pic) + '" alt="" style="width:36px;height:36px;border-radius:6px;object-fit:contain;margin-right:10px" onerror="this.style.display=\'none\'">'
        : '';
      return '<div class="tm-row" onclick="openTopMover(' + JSON.stringify(item.id) + ')" style="display:flex;align-items:center;padding:6px 16px;cursor:pointer;transition:all 0.15s">' +
        picHtml +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:10px;color:#8890b0;line-height:1.3">' + periodText + ' ' + label + freshness + '</div>' +
          '<div style="font-size:13px;font-weight:bold;color:#e0e0e0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escapeHtml(item.name) + '</div>' +
        '</div>' +
        '<div style="text-align:right;margin-left:8px;flex-shrink:0">' +
          '<div style="font-size:13px;color:#ffd700;font-weight:500">\xA5' + formatPrice(item.price) + '</div>' +
          '<div style="font-size:12px;font-weight:bold;color:#4caf50">' + (val > 0 ? '+' : '') + val.toFixed(2) + '%</div>' +
        '</div>' +
      '</div>';
    }).join('') +
  '</div>';
}

// ===== 收藏标签页 =====
function renderFavTab() {
  const content = document.getElementById('favtabContent');
  const favs = getFavorites();
  if (favs.length === 0) {
    content.innerHTML = '<div class="empty-container"><div class="empty-icon">-</div><div class="empty-text">暂无收藏物品，在物品详情页收藏</div></div>';
    return;
  }
  const cached = getCache();
  const allItems = cached && cached._allItems ? cached._allItems : [];
  const items = favs.map(function(fav) {
    const full = allItems.find(function(i) { return i.id === fav.id; });
    return full ? Object.assign({}, fav, full) : fav;
  });
  content.innerHTML = '\n      <div class="list-stats">\n        <span>共 ' + items.length + ' 件收藏</span>\n        <span class="history-clear" onclick="clearFavorites(); renderFavTab();" style="color:#f44336;cursor:pointer">清空收藏</span>\n      </div>\n      ' + items.map(function(item) {
        const bl = item.bl || 0;
        var picHtml = item.pic
          ? '<img src="' + sanitizeUrl(item.pic) + '" alt="" loading="lazy" decoding="async" onerror="this.parentElement.innerHTML=\'<span class=pic-placeholder>-</span>\'">'
          : '<span class="pic-placeholder">-</span>';
        return '\n        <div class="item-card fade-in" onclick="openPriceMover(' + JSON.stringify(item.id) + ')" style="position:relative">\n          <div class="item-pic">\n            ' + picHtml + '\n          </div>\n          <div class="item-info">\n            <div class="item-name-row">\n              <span class="item-name">' + escapeHtml(item.name) + '</span>\n              <span style="font-size:10px;color:#667eea;margin-left:6px">' + escapeHtml(CATEGORY_MAP[item._category] || item.secondClassCN || '') + '</span>\n            </div>\n            <div class="item-price-row">\n              <span class="item-price">\xA5' + formatPrice(item.price) + '</span>\n              <span class="item-change ' + getChangeClass(bl) + '">' + formatChange(bl) + '</span>\n            </div>\n          </div>\n          <span class="item-arrow">›</span>\n        </div>';
      }).join('');
}

// ===== SVG 图表 =====
function generatePriceCurveSVG(pricePoints) {
  if (!pricePoints || pricePoints.length < 2) return '<div style="text-align:center;color:#666;padding:30px">数据不足，无法生成曲线</div>';
  var _gradId = 'grad_' + (generatePriceCurveSVG._seq = (generatePriceCurveSVG._seq || 0) + 1); // 自增计数器，防止同时存在多个 SVG 时 ID 冲突
  var pts = pricePoints.slice().sort(function(a, b) { return b.day - a.day; });
  var allPrices = pts.map(function(p) { return p.price; });
  var minPrice = Math.min.apply(null, allPrices);
  var maxPrice = Math.max.apply(null, allPrices);
  var priceRange = (maxPrice - minPrice) || 1;
  var paddedMin = minPrice - priceRange * 0.08;

  var W = 320, H = 170;
  var PAD = { top: 22, right: 14, bottom: 28, left: 52 };
  var plotW = W - PAD.left - PAD.right;
  var plotH = H - PAD.top - PAD.bottom;

  // 先计算均匀 Y 轴刻度，再将上限对齐到刻度线
  function niceStepSize(range, targetSteps) {
    var rough = range / targetSteps;
    var exp = Math.pow(10, Math.floor(Math.log10(rough)));
    var f = rough / exp;
    var nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 5 ? 5 : 10;
    return nf * exp;
  }
  var roughRange = maxPrice - paddedMin;
  var yStep = niceStepSize(roughRange, 4);
  var yMin = Math.floor(paddedMin / yStep) * yStep;
  var yMax = Math.ceil(maxPrice / yStep) * yStep;
  var paddedMax = yMax;         // 上限对齐刻度线
  paddedMin = yMin;             // 下限也对齐
  var paddedRange = paddedMax - paddedMin || 1;

  var dataPoints = pts.map(function(p) {
    return {
      x: PAD.left + (1 - p.day / 30) * plotW,
      y: PAD.top + plotH - ((p.price - paddedMin) / paddedRange) * plotH,
      day: p.day, price: p.price, hist: !!p.hist, cloud: !!p.cloud
    };
  });

  function catmullRom(p0, p1, p2, p3, t) {
    var t2 = t * t, t3 = t2 * t;
    return 0.5 * (
      (2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3
    );
  }

  var smoothPts = [];
  for (var i = 0; i < dataPoints.length; i++) {
    if (i === 0) {
      smoothPts.push({ x: dataPoints[0].x, y: dataPoints[0].y });
      continue;
    }
    var p0 = dataPoints[Math.max(0, i - 2)];
    var p1 = dataPoints[i - 1];
    var p2 = dataPoints[i];
    var p3 = dataPoints[Math.min(dataPoints.length - 1, i + 1)];
    var steps = Math.max(8, Math.round((p2.x - p1.x) / 0.8));
    for (var s = 1; s <= steps; s++) {
      var t = s / steps;
      var cx = catmullRom(p0.x, p1.x, p2.x, p3.x, t);
      var cy = catmullRom(p0.y, p1.y, p2.y, p3.y, t);
      smoothPts.push({ x: cx, y: cy });
    }
  }

  var pathD = '';
  smoothPts.forEach(function(p, idx) {
    pathD += (idx === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1) + ' ';
  });
  var firstX = smoothPts[0].x.toFixed(1);
  var lastX = smoothPts[smoothPts.length - 1].x.toFixed(1);
  var bottomY = (PAD.top + plotH).toFixed(1);
  var areaD = pathD + 'L' + lastX + ',' + bottomY + ' L' + firstX + ',' + bottomY + ' Z';

  // 生成均匀 Y 轴刻度标签
  var yTicks = [];
  for (var p = yMin; p <= yMax + yStep * 0.01; p += yStep) {
    yTicks.push({
      price: p,
      y: PAD.top + plotH - ((p - paddedMin) / paddedRange) * plotH
    });
  }

  var xTicks = [30, 25, 20, 15, 10, 5, 0];
  var nowDate = new Date();
  var xTickLabels = {};
  xTicks.forEach(function(d) {
    var dt = new Date(nowDate.getTime() - d * 86400000);
    xTickLabels[d] = (dt.getMonth() + 1) + '/' + dt.getDate();
  });

  var markers = dataPoints.map(function(dp) {
    return { x: dp.x, y: dp.y, price: dp.price, day: dp.day, isCurrent: dp.day === 0, isHist: dp.hist, isCloud: dp.cloud };
  });

  return '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg">' +
    '<defs>' +
      '<linearGradient id="' + _gradId + '" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="#667eea" stop-opacity="0.28"/>' +
        '<stop offset="100%" stop-color="#667eea" stop-opacity="0.03"/>' +
      '</linearGradient>' +
    '</defs>' +
    yTicks.map(function(tk) {
      return '<line x1="' + PAD.left + '" y1="' + tk.y.toFixed(1) + '" x2="' + (W - PAD.right) + '" y2="' + tk.y.toFixed(1) + '" stroke="rgba(255,255,255,0.08)" stroke-dasharray="3,4"/>' +
        '<text x="' + (PAD.left - 6) + '" y="' + tk.y.toFixed(1) + '" text-anchor="end" fill="#888" font-size="9" dominant-baseline="middle">\xA5' + shortPrice(tk.price) + '</text>';
    }).join('') +
    xTicks.map(function(d) {
      var xx = PAD.left + (1 - d / 30) * plotW;
      var label = xTickLabels[d] || '';
      return '<line x1="' + xx.toFixed(1) + '" y1="' + PAD.top + '" x2="' + xx.toFixed(1) + '" y2="' + (PAD.top + plotH) + '" stroke="rgba(255,255,255,0.05)" stroke-dasharray="2,5"/>' +
        '<line x1="' + xx.toFixed(1) + '" y1="' + (PAD.top + plotH) + '" x2="' + xx.toFixed(1) + '" y2="' + (PAD.top + plotH + 4) + '" stroke="rgba(255,255,255,0.3)"/>' +
        '<text x="' + xx.toFixed(1) + '" y="' + (H - 4) + '" text-anchor="middle" fill="#888" font-size="8">' + label + '</text>';
    }).join('') +
    '<path d="' + areaD + '" fill="url(#' + _gradId + ')"/>' +
    '<path d="' + pathD + '" fill="none" stroke="#667eea" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
    markers.map(function(m) {
      var dotColor = m.isCurrent ? '#ffd700' : '#667eea';
      // 微小点标注（当前日稍大，其余统一小点，无描边）
      var r = m.isCurrent ? 2.5 : 1.5;
      return '<circle cx="' + m.x.toFixed(1) + '" cy="' + m.y.toFixed(1) + '" r="' + r + '" fill="' + dotColor + '"/>';
    }).join('') +
  '</svg>';
}

function generateSparklineSVG(pricePoints) {
  if (!pricePoints || pricePoints.length < 2) return '';
  var prices = pricePoints.map(function(p) { return p.price; });
  var minP = Math.min.apply(null, prices);
  var maxP = Math.max.apply(null, prices);
  var range = (maxP - minP) || 1;
  var W = 68, H = 24;
  var padX = 3, padY = 3;
  var pw = W - padX * 2, ph = H - padY * 2;

  var ptsStr = pricePoints.map(function(p) {
    var safeDay = Math.max(0, Math.min(p.day, 30)); // 修复：防止day越界导致x坐标为负
    var x = padX + (1 - safeDay / 30) * pw;
    var y = padY + ph - ((p.price - minP) / range) * ph;
    return x.toFixed(1) + ',' + y.toFixed(1);
  }).join(' ');

  var firstPrice = pricePoints[0].price;
  var lastPrice = pricePoints[pricePoints.length - 1].price;
  var isUp = lastPrice >= firstPrice;
  var color = isUp ? '#4caf50' : '#f44336';

  return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="item-sparkline-svg"><polyline points="' + ptsStr + '" fill="none" stroke="' + color + '" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}
