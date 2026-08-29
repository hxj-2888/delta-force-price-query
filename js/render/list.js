// ===== render/list.js — 列表页渲染 =====
// 功能清单: 物品排序(sortItems) | 分类列表渲染(renderList)含统计+卡片+分页
// 依赖: config.js(CATEGORY_MAP/itemsPerPage) store/cache.js store/favorites.js utils.js api.js(gGCS/gGS)
// 被依赖: app/router.js

function sortItems(items) {
  var sorted = items.slice();
  var dir = sortDir === 'asc' ? 1 : -1;
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

  var effectiveTotal = realTotal > loadedCount ? realTotal : loadedCount;
  var totalPages = Math.ceil(effectiveTotal / itemsPerPage) || 1;
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;
  var start = (currentPage - 1) * itemsPerPage;
  var pageItems = sorted.slice(start, start + itemsPerPage);

  var statsHtml = '<span>共 ' + (realTotal > 0 ? formatLargeNum(realTotal) : loadedCount) + ' 件';
  if (realTotal > 0 && realTotal > loadedCount) {
    statsHtml += ' <span style="font-size:10px;color:#888">(已加载 ' + formatLargeNum(loadedCount) + ')</span>';
  }
  if (isLoadingMore) {
    statsHtml += ' <span style="font-size:10px;color:#6366f1">加载中...</span>';
  }
  statsHtml += ' · 第 ' + currentPage + '/' + totalPages + ' 页</span>';
  if (sorted.length > 0) {
    statsHtml += '<span>更新于 ' + formatTime(sorted[0].is_get_time) + '</span>';
  }
  document.getElementById('listStats').innerHTML = statsHtml;

  var content = document.getElementById('listContent');
  if (sorted.length === 0) {
    var emptyMsg = isLoadingMore ? '正在加载数据，请稍候...' : '暂无物品数据';
    content.innerHTML = '<div class="empty-container"><div class="empty-icon">' + (isLoadingMore ? '' : '-') + '</div><div class="empty-text">' + emptyMsg + '</div></div>';
    document.getElementById('pagination').innerHTML = '';
    return;
  }
  content.innerHTML = pageItems.map(function(item) {
    var bl = item.bl || 0;
    var d30bl = item.day_30_bl || 0;
    var d30p = item.day_30_price || 0;
    var catName = CATEGORY_MAP[item._category] || escapeHtml(item.secondClassCN || '');
    var gradeBg = (item._category !== 'gun' && item.grade) ? 'background:' + getGradeColor(item.grade) + '15;border-color:' + getGradeColor(item.grade) + '30;' : '';
    var gradeDiamond = (item._category !== 'gun' && item.grade) ? '<div class="grade-diamond" style="background:' + getGradeColor(item.grade) + '"></div>' : '';
    var picHtml = item.pic
      ? '<img src="' + sanitizeUrl(smallPicUrl(item.pic, 144)) + '" alt="" loading="lazy" decoding="async" onerror="this.parentElement.innerHTML=\'<span class=pic-placeholder>-</span>\'">'
      : '<span class="pic-placeholder">-</span>';
    var catGradeTag = (item._category !== 'gun' && item.grade) ? '<span class="item-grade" style="color:' + getGradeColor(item.grade) + '">' + getGradeText(item.grade) + '</span>' : '';
    var attrs = [];
    if (showCategory && catName) attrs.push(catName);
    if (item.length && item.width) attrs.push(item.length + '\xD7' + item.width);
    if (item._category !== 'gun' && item.grade) attrs.push(getGradeText(item.grade));
    var attrHtml = attrs.length ? '<div class="item-attrs"><span class="item-attrs-text">' + attrs.join(' · ') + '</span></div>' : '';
    var trendHtml = d30p ? '\n            <div class="item-trend-mini">\n              <span class="trend-mini-label">30天前:</span>\n              <span class="trend-mini-price">\xA5' + formatPrice(d30p) + '</span>\n              <span class="trend-mini-change ' + getChangeClass(d30bl) + '">' + formatChange(d30bl) + '</span>\n            </div>' : '';
    var pts = getMergedPriceData(item);
    var sparkHtml = pts.length >= 2 ? '<div class="item-sparkline">' + generateSparklineSVG(pts) + '</div>' : '';
    var favIndicator = isFavorited(item.id) ? '<span class="item-fav-indicator"></span>' : '';

    return '<div class="item-card fade-in" style="position:relative;' + gradeBg + '" onclick="openDetail(' + Number(item.id) + ')">\n          ' + gradeDiamond + '\n          <div class="item-pic">\n            ' + picHtml + '\n          </div>\n          <div class="item-info">\n            <div class="item-name-row">\n              <span class="item-name">' + escapeHtml(item.name) + '</span>\n              ' + catGradeTag + '\n            </div>\n            <div class="item-price-row">\n              <span class="item-price">\xA5' + formatPrice(item.price) + '</span>\n              <span class="item-change ' + getChangeClass(bl) + '">' + formatChange(bl) + '</span>\n            </div>\n            ' + attrHtml + '\n            ' + trendHtml + '\n          </div>\n          ' + sparkHtml + '\n          <span class="item-arrow">›</span>\n          ' + favIndicator + '\n        </div>';
  }).join('');
  renderPagination(totalPages);
}

function renderPagination(totalPages) {
  var pagination = document.getElementById('pagination');
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
