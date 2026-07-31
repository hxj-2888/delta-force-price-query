// ===== render/home.js — 首页渲染 =====
// 功能清单: 首页入口(renderHome) | 涨幅前二卡片(renderHomeTopMover) | 物品卡片+迷你折线
// 首页物品列表(renderHomeMovers)含筛选/排序/分页 | 底部分页栏 | 后台数据追加
// 依赖: config.js render/shared.js render/charts.js store/cache.js store/favorites.js utils.js
// 被依赖: app/router.js api.js

// ===== 首页入口 =====
function renderHome() {
  checkFavoritePriceChanges();
  renderHomeTopMover();
  renderHomeMovers();
}

// ===== 涨幅前二卡片 =====
function renderHomeTopMover() {
  var el = document.getElementById('topMover');
  if (!el) return;

  var cached = getCache();
  var all = cached && cached._allItems ? cached._allItems : getPrefetchItems();

  if (all.length === 0) {
    el.style.display = 'none';
    return;
  }

  var prefetched = window.__prefetch || {};
  _topMoverApiDone = !!(prefetched._topMoverApiDone);

  _renderTopMoverFromData(all);
}

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
        ? '<img src="' + sanitizeUrl(item.pic) + '" alt="" loading="eager" decoding="sync" fetchpriority="high" style="width:36px;height:36px;border-radius:6px;object-fit:contain;margin-right:10px" onerror="this.style.display=\'none\'">'
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

// ===== 迷你折线图（首页物品卡片内） =====
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

// ===== 首页物品卡片 =====
function _renderHomeItemCard(item, field, maxAbsBl, isEager) {
  var bl = getFieldByPeriod(item, field) || 0;
  var gradeBg = (item._category !== 'gun' && item.grade) ? 'background:' + getGradeColor(item.grade) + '15;border-color:' + getGradeColor(item.grade) + '30;' : '';
  var gradeDiamond = (item._category !== 'gun' && item.grade) ? '<div class="grade-diamond" style="background:' + getGradeColor(item.grade) + '"></div>' : '';
  var loadingAttr = isEager ? 'loading="eager" decoding="sync"' : 'loading="lazy" decoding="async"';
  var picHtml = item.pic ? '<img src="' + sanitizeUrl(item.pic) + '" alt="" ' + loadingAttr + ' onerror="this.parentElement.innerHTML=\'<span class=pic-placeholder>-</span>\'">' : '<span class="pic-placeholder">-</span>';
  var gradeTag = (item._category !== 'gun' && item.grade) ? '<span class="item-grade" style="color:' + getGradeColor(item.grade) + '">' + getGradeText(item.grade) + '</span>' : '';
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

// ===== 首页物品列表（分页） =====
var _homeDataArriveListener = null;
function renderHomeMovers(resetPage) {
  if (resetPage !== false) homeCurrentPage = 1;
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
    if (!_homeDataArriveListener) {
      _homeDataArriveListener = true;
      var _arriveTimeout = setTimeout(function() {
        if (_homeDataArriveListener) {
          _homeDataArriveListener = null;
        }
      }, 15000);
      var prefetched = window.__prefetch || {};
      if (typeof prefetched.onItemsArrive === 'function') {
        prefetched.onItemsArrive(function() {
          clearTimeout(_arriveTimeout);
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

  var dirMul = homeSortDir === 'desc' ? -1 : 1;
  if (homeSortBy === 'default') {
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

  _homeAllFiltered = filtered;

  var totalPages = Math.ceil(filtered.length / HOME_PAGE_SIZE) || 1;
  if (homeCurrentPage > totalPages) homeCurrentPage = totalPages;
  var offset = (homeCurrentPage - 1) * HOME_PAGE_SIZE;
  var items = filtered.slice(offset, offset + HOME_PAGE_SIZE);

  if (items.length === 0) {
    listEl.innerHTML = '<div class="empty-container" style="padding:20px"><div class="empty-icon" style="font-size:24px">-</div><div class="empty-text" style="font-size:12px">暂无数据</div></div>';
    return;
  }

  var maxAbsBl = 0;
  items.forEach(function(item) { var a = Math.abs(getFieldByPeriod(item, field) || 0); if (a > maxAbsBl) maxAbsBl = a; });

  var html = items.map(function(item) {
    return _renderHomeItemCard(item, field, maxAbsBl);
  }).join('');

  html += _renderPagination(totalPages, homeCurrentPage, filtered.length);

  listEl.innerHTML = html;
}

function renderHomeMoversWithData(items) {
  var listEl = document.getElementById('homeMoversList');
  if (!listEl || !items || items.length === 0) {
    if (listEl) listEl.innerHTML = '<div class="empty-container" style="padding:20px"><div class="empty-text" style="font-size:12px">数据加载中...</div></div>';
    return;
  }
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
  filtered = filtered.filter(function(item) { var v = getFieldByPeriod(item, field); return v != null && !isNaN(v); });
  if (homeSortBy === 'default') {
    if (homeCategoryFilter !== 'all') filtered.sort(function(a,b) { return getItemSignificance(b) - getItemSignificance(a); });
  } else if (homeSortBy === 'change') {
    var dm = homeSortDir === 'desc' ? -1 : 1;
    filtered.sort(function(a,b) { return ((getFieldByPeriod(a,field)||0) - (getFieldByPeriod(b,field)||0)) * dm; });
  } else {
    var dm2 = homeSortDir === 'desc' ? -1 : 1;
    filtered.sort(function(a,b) { return ((a.price||0) - (b.price||0)) * dm2; });
  }
  _homeAllFiltered = filtered;
  homeCurrentPage = 1;
  var pItems = filtered.slice(0, HOME_PAGE_SIZE);
  if (pItems.length === 0) { listEl.innerHTML = '<div class="empty-container" style="padding:20px"><div class="empty-text" style="font-size:12px">暂无数据</div></div>'; return; }
  var maxAbsBl = 0;
  pItems.forEach(function(item) { var a = Math.abs(getFieldByPeriod(item, field)||0); if (a > maxAbsBl) maxAbsBl = a; });
  var html = pItems.map(function(item, idx) { return _renderHomeItemCard(item, field, maxAbsBl, idx < 4); }).join('');
  var totalPages = Math.ceil(filtered.length / HOME_PAGE_SIZE) || 1;
  html += _renderPagination(totalPages, 1, filtered.length);
  listEl.innerHTML = html;
}

// ===== 分页 =====
function goToHomePage(n) {
  homeCurrentPage = n;
  var listEl = document.getElementById('homeMoversList');
  if (!listEl) return;
  var totalPages = Math.ceil(_homeAllFiltered.length / HOME_PAGE_SIZE) || 1;
  if (n < 1) n = 1;
  if (n > totalPages) n = totalPages;
  homeCurrentPage = n;
  var offset = (n - 1) * HOME_PAGE_SIZE;
  var items = _homeAllFiltered.slice(offset, offset + HOME_PAGE_SIZE);
  var field = homePeriod;
  var maxAbsBl = 0;
  items.forEach(function(item) { var a = Math.abs(getFieldByPeriod(item, field) || 0); if (a > maxAbsBl) maxAbsBl = a; });
  var html = items.map(function(item) {
    return _renderHomeItemCard(item, field, maxAbsBl);
  }).join('');
  html += _renderPagination(totalPages, n, _homeAllFiltered.length);
  listEl.innerHTML = html;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function _renderPagination(totalPages, current, totalItems) {
  if (totalPages <= 1) {
    return '<div class="home-pagination" style="text-align:center;padding:14px 12px;color:#666;font-size:12px">共 ' + totalItems + ' 件</div>';
  }
  var html = '<div class="home-pagination" style="display:flex;align-items:center;justify-content:center;gap:6px;padding:14px 8px;flex-wrap:wrap">';
  if (current > 1) {
    html += '<button class="page-btn" onclick="goToHomePage(' + (current - 1) + ')" style="font-size:12px">‹</button>';
  } else {
    html += '<span style="width:34px"></span>';
  }
  for (var i = 1; i <= totalPages; i++) {
    if (totalPages <= 7 || i === 1 || i === totalPages || (i >= current - 1 && i <= current + 1)) {
      if (i === current) {
        html += '<button class="page-btn active" style="background:rgba(102,126,234,0.3);color:#aab8ff;font-weight:600">' + i + '</button>';
      } else {
        html += '<button class="page-btn" onclick="goToHomePage(' + i + ')" style="font-size:12px">' + i + '</button>';
      }
    } else if (i === current - 2 || i === current + 2) {
      html += '<span style="color:#555;width:34px;text-align:center">...</span>';
    }
  }
  if (current < totalPages) {
    html += '<button class="page-btn" onclick="goToHomePage(' + (current + 1) + ')" style="font-size:12px">›</button>';
  } else {
    html += '<span style="width:34px"></span>';
  }
  html += '<span style="color:#555;font-size:11px;margin-left:8px">共 ' + totalItems + ' 件</span>';
  html += '</div>';
  return html;
}

function appendHomeItems(newItems) {
  if (!newItems || newItems.length === 0) return;
  renderHomeMovers(false);
}

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
    if (all.length > _homeAllFiltered.length) {
      renderHomeMovers(false);
      checkFavoritePriceChanges();
      renderHomeTopMover();
    }
  }, 500);
}
