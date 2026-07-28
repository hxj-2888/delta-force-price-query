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

// ===== 价格异动页状态 =====
var priceRangeFilter = 'all';
var priceDirection = 'up';
var pricePeriod = 'bl';
var PERIOD_LABELS = { bl: '今日', day_3_bl: '近3天', day_7_bl: '近7天', local_1d: '本地1天', local_3d: '本地3天', local_7d: '本地7天' };

var _topMoverFirstRetryDone = false;

// ===== 首页 =====
function renderHome() {
  const grid = document.getElementById('categoryGrid');
  const iconCache = getCatIconsCache();
  const allPic = iconCache && iconCache['all'];
  const allIconHtml = allPic ? catIconHTML(allPic) : '';
  const allCard = '<div class="category-card all-items" onclick="openAllItems()">\n      <div class="cat-icon" data-cat="all" data-fallback="">' + allIconHtml + '</div>\n      <div class="cat-name">全部物品</div>\n      <div class="cat-arrow">›</div>\n    </div>';
  const catCards = CATEGORIES.map(function(cat) {
    const pic = iconCache && iconCache[cat.key];
    const iconHtml = pic ? catIconHTML(pic) : cat.icon;
    return '\n      <div class="category-card" onclick="openCategory(\'' + cat.key + '\',\'' + cat.name + '\')">\n        <div class="cat-icon" data-cat="' + cat.key + '" data-fallback="' + cat.icon + '">' + iconHtml + '</div>\n        <div class="cat-name">' + cat.name + '</div>\n        <div class="cat-arrow">›</div>\n      </div>';
  }).join('');
  grid.innerHTML = allCard + catCards;
  checkFavoritePriceChanges();
  renderHomeTopMover();
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
  detailContent.innerHTML = '\n      <div class="detail-header">\n        <div class="detail-pic">\n          ' + picHtml + '\n        </div>\n        <div class="detail-basic">\n          <div class="detail-name">' + escapeHtml(item.name) + '</div>\n          <div class="detail-meta">\n            ' + metaHtml + '\n          </div>\n          ' + descHtml + '\n        </div>\n      </div>\n\n      <div class="price-card">\n        <div class="price-card-header">\n          <span class="price-card-title">当前价格</span>\n          <span class="price-card-time">更新于 ' + formatTime(item.is_get_time) + '</span>\n        </div>\n        <div class="price-main">\n          <span class="price-currency">\xA5</span>\n          <span class="price-value">' + formatPrice(price) + '</span>\n        </div>\n        <div class="price-sub">\n          <div class="sub-item">\n            <span class="sub-label">今日开盘</span>\n            <span class="sub-value">\xA5' + formatPrice(item.price_start || item.priceStart || 0) + '</span>\n          </div>\n          <div class="sub-item">\n            <span class="sub-label">今日涨跌</span>\n            <span class="sub-value ' + getChangeClass(bl) + '">' + formatChange(bl) + '</span>\n          </div>\n        </div>\n      </div>\n\n      <div class="section">\n        <div class="section-title">近30天价格趋势 <span class="cloud-badge" id="cloudBadge" style="display:none;font-size:11px;background:rgba(79,195,247,0.15);color:#4fc3f7;padding:2px 8px;border-radius:10px;margin-left:8px;font-weight:normal"></span></div>\n        <div class="price-curve-box">\n          ' + generatePriceCurveSVG(pricePoints) + '\n          <div class="curve-legend">\n            <div class="curve-legend-item"><span class="curve-legend-dot" style="background:#888"></span>30天前 \xA5' + formatPrice(d30p) + ' <span class="' + getChangeClass(d30bl) + '" style="font-size:10px">' + formatChange(d30bl) + '</span></div>\n            <div class="curve-legend-item"><span class="curve-legend-dot" style="background:#667eea"></span>7天前 \xA5' + formatPrice(d7p) + ' <span class="' + getChangeClass(d7bl) + '" style="font-size:10px">' + formatChange(d7bl) + '</span></div>\n            <div class="curve-legend-item"><span class="curve-legend-dot" style="background:#4caf50"></span>3天前 \xA5' + formatPrice(d3p) + ' <span class="' + getChangeClass(d3bl) + '" style="font-size:10px">' + formatChange(d3bl) + '</span></div>\n            <div class="curve-legend-item"><span class="curve-legend-dot" style="background:#ffd700"></span>当前 \xA5' + formatPrice(price) + '</div>\n          </div>\n        </div>\n      </div>\n\n      ' + propsHtml + '\n\n      <div class="source-note">\n        <span>数据来源：三角洲数据帝 orzice.com 开放平台</span>\n        <span>禁止编造或篡改任何价格信息</span>\n      </div>\n    ';
  updateFavoriteButton(item.id);

  // 异步拉取云端历史数据，渐入更新图表
  getOrFetchCloudSnapshots(item.id).then(function(cloudSnaps) {
    if (!cloudSnaps || cloudSnaps.length === 0) return;

    var badge = document.getElementById('cloudBadge');
    if (badge) {
      badge.style.display = 'inline-block';
      badge.textContent = '线上 ' + cloudSnaps.length + '天';
    }

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
  if (field === 'bl') return item.bl;
  if (field === 'day_3_bl') return item.day_3_bl;
  if (field === 'day_7_bl') return item.day_7_bl;
  if (field === 'local_1d') return item._localBl1;
  if (field === 'local_3d') return item._localBl3;
  if (field === 'local_7d') return item._localBl7;
  return item.bl;
}

function getPriceMovers() {
  var cached = getCache();
  var all = cached && cached._allItems ? cached._allItems : [];
  if (all.length === 0) {
    all = getPrefetchItems();
  }
  var isLocalPeriod = pricePeriod === 'local_1d' || pricePeriod === 'local_3d' || pricePeriod === 'local_7d';
  if (isLocalPeriod) {
    var daysMap = { local_1d: 1, local_3d: 3, local_7d: 7 };
    var days = daysMap[pricePeriod] || 1;
    all.forEach(function(item) {
      var change = getLocalPriceChange(item.id, days);
      if (pricePeriod === 'local_1d') item._localBl1 = change;
      else if (pricePeriod === 'local_3d') item._localBl3 = change;
      else if (pricePeriod === 'local_7d') item._localBl7 = change;
    });
  }
  var filtered = all.filter(function(item) {
    if (isLocalPeriod) {
      var v = getFieldByPeriod(item, pricePeriod);
      return item.price > 0 && v != null && v !== undefined;
    }
    return item.price > 0 && getFieldByPeriod(item, pricePeriod) != null;
  });
  if (priceRangeFilter === '1-10w') {
    filtered = filtered.filter(function(item) { return item.price >= 10000 && item.price < 100000; });
  } else if (priceRangeFilter === '10-100w') {
    filtered = filtered.filter(function(item) { return item.price >= 100000 && item.price < 1000000; });
  } else if (priceRangeFilter === '100w+') {
    filtered = filtered.filter(function(item) { return item.price >= 1000000; });
  }
  var field = pricePeriod;
  if (priceDirection === 'up') {
    filtered.sort(function(a, b) { return (getFieldByPeriod(b, field) || 0) - (getFieldByPeriod(a, field) || 0); });
    filtered = filtered.filter(function(item) { return getFieldByPeriod(item, field) > 0; });
  } else {
    filtered.sort(function(a, b) { return (getFieldByPeriod(a, field) || 0) - (getFieldByPeriod(b, field) || 0); });
    filtered = filtered.filter(function(item) { return getFieldByPeriod(item, field) < 0; });
  }
  return filtered.slice(0, 15);
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

function renderPriceMovers() {
  var content = document.getElementById('priceContent');

  var periods = [
    { key: 'bl', label: '今日' },
    { key: 'day_3_bl', label: '近3天' },
    { key: 'day_7_bl', label: '近7天' },
    { key: 'local_1d', label: '本地1天' },
    { key: 'local_3d', label: '本地3天' },
    { key: 'local_7d', label: '本地7天' }
  ];
  var ranges = [
    { key: 'all', label: '全部' },
    { key: '1-10w', label: '1-10万' },
    { key: '10-100w', label: '10-100万' },
    { key: '100w+', label: '100万以上' }
  ];
  var controlsHtml =
    '<div style="display:flex;gap:8px;padding:8px 16px;background:rgba(255,255,255,0.02);border-bottom:1px solid rgba(255,255,255,0.04);flex-wrap:wrap">' +
      periods.map(function(p) {
        return '<button class="sort-btn' + (pricePeriod === p.key ? ' active' : '') + '" id="period-' + p.key + '" onclick="setPricePeriod(\'' + p.key + '\')">' + p.label + '</button>';
      }).join('') +
    '</div>' +
    '<div style="display:flex;gap:8px;padding:8px 16px;background:rgba(255,255,255,0.02);border-bottom:1px solid rgba(255,255,255,0.04);flex-wrap:wrap">' +
      ranges.map(function(r) {
        return '<button class="sort-btn' + (priceRangeFilter === r.key ? ' active' : '') + '" onclick="setPriceRange(\'' + r.key + '\')">' + r.label + '</button>';
      }).join('') +
    '</div>';

  var items = getPriceMovers();
  if (items.length === 0) {
    var cached = getCache();
    if (!cached || !cached._allItems) {
      content.innerHTML = controlsHtml + '<div class="loading-container"><div class="loading-spinner"></div><div class="loading-text">加载中...</div></div>';
      if (!window._priceLoading) {
        window._priceLoading = true;
        loadAllItems().then(function() {
          window._priceLoading = false;
          if (pageStack[pageStack.length - 1] !== 'price') return;
          renderPriceMovers();
        }).catch(function() {
          window._priceLoading = false;
          content.innerHTML = controlsHtml + '<div class="empty-container"><div class="empty-icon">-</div><div class="empty-text">加载失败，请检查网络</div></div>';
        });
      }
      return;
    }
    var isLocalPeriod = pricePeriod === 'local_1d' || pricePeriod === 'local_3d' || pricePeriod === 'local_7d';
    var emptyLabel = isLocalPeriod
      ? (priceDirection === 'up' ? '暂无上涨物品（本地历史数据不足，请持续使用积累价格记录）' : '暂无下跌物品（本地历史数据不足，请持续使用积累价格记录）')
      : (priceDirection === 'up' ? '暂无上涨物品' : '暂无下跌物品');
    content.innerHTML = controlsHtml + '<div class="empty-container"><div class="empty-icon">-</div><div class="empty-text">' + emptyLabel + '</div></div>';
    return;
  }

  var btnG = document.getElementById('btnGainers');
  var btnL = document.getElementById('btnLosers');
  if (btnG) btnG.classList.toggle('active', priceDirection === 'up');
  if (btnL) btnL.classList.toggle('active', priceDirection === 'down');

  var periodLabel = PERIOD_LABELS[pricePeriod] || '今日';
  var dirLabel = priceDirection === 'up' ? '涨幅榜' : '跌幅榜';
  var maxAbsBl = 0;
  items.forEach(function(item) { var a = Math.abs(getFieldByPeriod(item, pricePeriod) || 0); if (a > maxAbsBl) maxAbsBl = a; });

  content.innerHTML = controlsHtml +
    '<div class="list-stats">' +
      '<span>' + periodLabel + ' ' + dirLabel + ' 前 ' + items.length + ' \xB7 按涨跌幅排序</span>' +
      '<span>点击物品查看详情</span>' +
    '</div>' +
    items.map(function(item) {
      var bl = getFieldByPeriod(item, pricePeriod) || 0;
      var absBl = Math.abs(bl);
      var barWidth = maxAbsBl > 0 ? Math.min((absBl / maxAbsBl) * 100, 100) : 0;
      var gradeBg = (item._category !== 'gun' && item.grade) ? 'background:' + getGradeColor(item.grade) + '15;border-color:' + getGradeColor(item.grade) + '30;' : '';
      var gradeDiamond = (item._category !== 'gun' && item.grade) ? '<div class="grade-diamond" style="background:' + getGradeColor(item.grade) + '"></div>' : '';
      var picHtml = item.pic ? '<img src="' + sanitizeUrl(item.pic) + '" alt="" loading="lazy" decoding="async" onerror="this.parentElement.innerHTML=\'<span class=pic-placeholder>-</span>\'">' : '<span class="pic-placeholder">-</span>';
      var gradeTag = (item._category !== 'gun' && item.grade) ? '<span class="item-grade" style="color:' + getGradeColor(item.grade) + '">' + getGradeText(item.grade) + '</span>' : '';
      return '<div class="item-card fade-in" onclick="openPriceMover(' + JSON.stringify(item.id) + ')" style="position:relative;' + gradeBg + '">' +
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
          '<div style="margin-top:6px;height:4px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden">' +
            '<div style="height:100%;width:' + barWidth + '%;background:' + (bl > 0 ? '#4caf50' : '#f44336') + ';border-radius:2px;transition:width 0.3s"></div>' +
          '</div>' +
        '</div>' +
        '<span class="item-arrow">›</span>' +
      '</div>';
    }).join('');
}

// ===== 首页涨跌幅推送卡片 =====
function renderHomeTopMover() {
  var el = document.getElementById('topMover');
  if (!el) return;
  var cached = getCache();
  var all = cached && cached._allItems ? cached._allItems : [];
  if (all.length === 0) {
    all = getPrefetchItems();
  }
  if (all.length === 0) {
    if (!_topMoverFirstRetryDone) {
      _topMoverFirstRetryDone = true;
      setTimeout(function() { renderHomeTopMover(); }, 100);
    }
    if (!el.innerHTML || el.innerHTML.trim() === '') { el.style.display = 'none'; }
    return;
  }
  var hadContent = el.style.display !== 'none' && el.innerHTML && el.innerHTML.trim() !== '';
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
    if (!hadContent) { el.style.display = 'none'; }
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
      var picHtml = item.pic
        ? '<img src="' + sanitizeUrl(item.pic) + '" alt="" style="width:36px;height:36px;border-radius:6px;object-fit:contain;margin-right:10px" onerror="this.style.display=\'none\'">'
        : '';
      return '<div class="tm-row" onclick="openTopMover(' + JSON.stringify(item.id) + ')" style="display:flex;align-items:center;padding:6px 16px;cursor:pointer;transition:all 0.15s">' +
        picHtml +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:10px;color:#8890b0;line-height:1.3">' + periodText + ' ' + label + '</div>' +
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
      var dotColor = m.isCurrent ? '#ffd700' : (m.isCloud ? '#4fc3f7' : (m.isHist ? '#aaa' : '#667eea'));
      var strokeColor = m.isCurrent ? '#ffaa00' : (m.isCloud ? '#0288d1' : (m.isHist ? '#666' : '#fff'));
      var r = m.isCurrent ? 4 : (m.isCloud ? 3 : (m.isHist ? 2.5 : 3));
      return '<circle cx="' + m.x.toFixed(1) + '" cy="' + m.y.toFixed(1) + '" r="' + r + '" fill="' + dotColor + '" stroke="' + strokeColor + '" stroke-width="1"/>';
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
