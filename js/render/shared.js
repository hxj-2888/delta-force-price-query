// ===== render/shared.js — 共享状态 + 下拉面板 + 筛选器 + 分类图标 =====
// 功能清单: 首页筛选/排序状态变量 | 物品显著性评分 | 时间段/价格字段读取
// 预取数据收集 | 下拉面板管理(10个函数) | 首页筛选设置器(6个函数)
// 浏览状态恢复(applyHomeBrowseState) | 分类图标提取(updateCategoryIcons)
// 依赖: config.js(CATEGORIES/HOME_PAGE_SIZE) utils.js store/cache.js
// 被依赖: render/home.js render/list.js api.js app/

// ===== 首页筛选/排序状态 =====
var homeCategoryFilter = 'all';
var homePeriod = 'bl';
var homePriceRange = 'all';
var homeSortBy = 'default';
var homeSortDir = 'desc';
var homeCurrentPage = 1;
var _homeAllFiltered = [];
var _topMoverApiDone = false;

// ===== 物品显著性评分 =====
function getItemSignificance(item) {
  var bl = Math.abs(item.bl || item.day_3_bl || item.day_7_bl || 0);
  var p = item.price || 0;
  var pf = p >= 1000000 ? 4 : p >= 100000 ? 3 : p >= 10000 ? 2 : 1;
  return bl * pf;
}

// ===== 工具函数 =====
function getFieldByPeriod(item, field) {
  if (field === 'bl') return (item.bl != null) ? item.bl : 0;
  if (field === 'day_3_bl') return (item.day_3_bl != null) ? item.day_3_bl : 0;
  if (field === 'day_7_bl') return (item.day_7_bl != null) ? item.day_7_bl : 0;
  return (item.bl != null) ? item.bl : 0;
}

function getPrefetchItems() {
  var prefetched = window.__prefetch;
  if (!prefetched) return [];
  var all = [];
  for (var i = 0; i < CATEGORIES.length; i++) {
    var p = prefetched[CATEGORIES[i].key];
    if (p && p._resolvedData && p._resolvedData.length > 0) {
      all = all.concat(p._resolvedData);
    }
  }
  return all;
}

// ===== 下拉面板管理 =====
function closeAllDropdowns() {
  ['timeDropdown','priceDropdown','filterDropdown','sortDropdown'].forEach(function(id) {
    var el = document.getElementById(id); if (el) el.style.display = 'none';
  });
  var toolbar = document.getElementById('filterToolbar');
  if (toolbar) toolbar.classList.remove('dropdown-open');
}

function toggleTimeDropdown() { toggleDropdown('timeDropdown', 'btnTime'); }
function closeTimeDropdown() { document.getElementById('timeDropdown').style.display = 'none'; }
function togglePriceDropdown() { toggleDropdown('priceDropdown', 'btnPrice'); }
function closePriceDropdown() { document.getElementById('priceDropdown').style.display = 'none'; }
function toggleFilterDropdown() { toggleDropdown('filterDropdown', 'btnFilter'); }
function closeFilterDropdown() { document.getElementById('filterDropdown').style.display = 'none'; }
function toggleSortDropdown() { toggleDropdown('sortDropdown', 'btnSort'); }
function closeSortDropdown() { document.getElementById('sortDropdown').style.display = 'none'; }

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
  if (panel.parentNode !== document.body) {
    document.body.appendChild(panel);
  }
  panel.style.visibility = 'hidden';
  panel.style.display = 'block';
  var panelW = panel.offsetWidth;
  var btn = document.getElementById(btnId);
  var rect = btn.getBoundingClientRect();
  var left = rect.left;
  var vw = window.innerWidth;
  if (left + panelW > vw - 8) left = vw - panelW - 8;
  if (left < 8) left = 8;
  panel.style.top = (rect.bottom + 4) + 'px';
  panel.style.left = left + 'px';
  panel.style.right = 'auto';
  panel.style.visibility = 'visible';

  var toolbar = document.getElementById('filterToolbar');
  if (toolbar) toolbar.classList.add('dropdown-open');
}

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

// ===== 首页筛选设置器 =====
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

function setHomeSort(sortBy, sortDir) {
  homeSortBy = sortBy;
  homeSortDir = sortDir;
  var labelText;
  if (sortBy === 'default') {
    labelText = '综合↓';
  } else if (sortBy === 'change') {
    labelText = '涨跌幅';
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

function applyHomeBrowseState(state) {
  if (!state) return;
  if (state.homeCategoryFilter !== undefined) homeCategoryFilter = state.homeCategoryFilter;
  if (state.homePeriod !== undefined) homePeriod = state.homePeriod;
  if (state.homePriceRange !== undefined) homePriceRange = state.homePriceRange;
  if (state.homeSortBy !== undefined) homeSortBy = state.homeSortBy;
  if (state.homeSortDir !== undefined) homeSortDir = state.homeSortDir;
  if (state.homeCurrentPage !== undefined) homeCurrentPage = state.homeCurrentPage;

  var timeLabels = { bl: '近1天', day_3_bl: '近3天', day_7_bl: '近7天' };
  var timeEl = document.getElementById('timeLabel');
  if (timeEl) timeEl.textContent = timeLabels[homePeriod] || '近1天';

  var priceLabels = { all: '全部价格', lt1w: '< 1万', '1-10w': '1万~10万', '10-100w': '10万~100万', gt100w: '> 100万' };
  var priceEl = document.getElementById('priceLabel');
  if (priceEl) priceEl.textContent = priceLabels[homePriceRange] || '全部价格';

  var filterEl = document.getElementById('filterLabel');
  if (filterEl) filterEl.textContent = homeCategoryFilter === 'all' ? '筛选' : (CATEGORY_MAP[homeCategoryFilter] || homeCategoryFilter);

  var sortLabelText;
  if (homeSortBy === 'default') sortLabelText = '综合↓';
  else if (homeSortBy === 'change') sortLabelText = '涨跌幅';
  else sortLabelText = '价格' + (homeSortDir === 'desc' ? '↓' : '↑');
  var sortEl = document.getElementById('sortLabel');
  if (sortEl) sortEl.textContent = sortLabelText;

  document.querySelectorAll('#timeDropdown .dropdown-item').forEach(function(item) {
    item.classList.toggle('active', item.dataset.period === homePeriod);
  });
  document.querySelectorAll('#priceDropdown .dropdown-item').forEach(function(item) {
    item.classList.toggle('active', item.dataset.range === homePriceRange);
  });
  document.querySelectorAll('.filter-cat-chip').forEach(function(chip) {
    chip.classList.toggle('active', chip.dataset.cat === homeCategoryFilter);
  });
  document.querySelectorAll('#sortDropdown .dropdown-item').forEach(function(item) {
    item.classList.toggle('active', item.dataset.sort === homeSortBy && (homeSortBy === 'default' || item.dataset.dir === homeSortDir));
  });
}

// ===== 分类图标 =====
function updateCategoryIcons(allItems) {
  if (!allItems || allItems.length === 0) return;
  var existing = getCatIconsCache() || {};
  var picks = {};
  Object.keys(existing).forEach(function(k) { picks[k] = existing[k]; });
  allItems.forEach(function(item) {
    var cat = item._category;
    if (cat && !picks[cat] && item.pic) {
      picks[cat] = item.pic;
    }
  });
  var logisticsItem = allItems.find(function(i) { return i.name === '物流信息单' && i.pic; });
  if (logisticsItem) picks['all'] = logisticsItem.pic;

  setCatIconsCache(picks);
  document.querySelectorAll('.cat-icon[data-cat]').forEach(function(el) {
    var cat = el.dataset.cat;
    if (picks[cat]) {
      el.innerHTML = catIconHTML(picks[cat]);
    }
  });
}
