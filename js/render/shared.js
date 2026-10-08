// ===== render/shared.js — 共享状态 + 下拉面板 + 筛选器 + 分类图标 =====
// 功能清单: 首页筛选/排序状态变量 | 物品显著性评分 | 时间段/价格字段读取
// 预取数据收集 | 下拉面板管理(10个函数) | 首页筛选设置器(6个函数)
// 浏览状态恢复(applyHomeBrowseState) | 分类图标提取(updateCategoryIcons)
// 依赖: config.js(CATEGORIES/HOME_PAGE_SIZE) utils.js store/cache.js
// 被依赖: render/home.js render/list.js api.js app/

// ===== 首页筛选/排序状态 =====
// ★ homeCategoryFilter 自 v20261008 起为「分类 key 数组」，空数组 = 全部类型（多选）。
//   旧版存的是字符串（'all' 或单个 key），applyHomeBrowseState 里做了兼容转换。
var homeCategoryFilter = [];
var homePeriod = 'bl';
var homePriceRange = 'all';     // 快捷档：all / lt1w / 1-10w / 10-100w / gt100w
var homePriceMin = '';          // 自定义区间（字符串，空 = 不限）；一旦填了就覆盖快捷档
var homePriceMax = '';
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

// ===== 首页全量数据（缓存优先，回退预取） =====
function getHomeAllItems() {
  var cached = getCache();
  if (cached && cached._allItems && cached._allItems.length > 0) return cached._allItems;
  return getPrefetchItems();
}

// ===== 分类件数（筛选面板「分类 N 件」用） =====
function getHomeCategoryCounts() {
  var all = getHomeAllItems();
  var counts = {};
  CATEGORIES.forEach(function(c) { counts[c.key] = 0; });
  all.forEach(function(item) {
    if (item._category && counts[item._category] !== undefined) counts[item._category]++;
  });
  return counts;
}

// ===== 价格区间判定 =====
// 自定义区间（homePriceMin/Max）一旦有值就覆盖快捷档；两者都没有才走快捷档。
// 只使用上游真实字段，不臆造成交量之类的派生指标。
function homePriceHit(price) {
  var p = price || 0;
  var hasMin = homePriceMin !== '' && homePriceMin !== null && homePriceMin !== undefined;
  var hasMax = homePriceMax !== '' && homePriceMax !== null && homePriceMax !== undefined;
  if (hasMin || hasMax) {
    if (hasMin) { var mn = Number(homePriceMin); if (isFinite(mn) && p < mn) return false; }
    if (hasMax) { var mx = Number(homePriceMax); if (isFinite(mx) && p > mx) return false; }
    return true;
  }
  if (homePriceRange === 'lt1w') return p < 10000;
  if (homePriceRange === '1-10w') return p >= 10000 && p < 100000;
  if (homePriceRange === '10-100w') return p >= 100000 && p < 1000000;
  if (homePriceRange === 'gt100w') return p >= 1000000;
  return true;
}

// ===== 首页筛选 + 排序（唯一真源：列表渲染与「查看 N 件」预估共用） =====
function getHomeFilteredItems(all) {
  var list = all || [];
  if (homeCategoryFilter.length > 0) {
    list = list.filter(function(item) { return homeCategoryFilter.indexOf(item._category) >= 0; });
  }
  list = list.filter(function(item) { return homePriceHit(item.price); });

  var field = homePeriod;
  list = list.filter(function(item) {
    var v = getFieldByPeriod(item, field);
    return v != null && !isNaN(v);
  });

  var dirMul = homeSortDir === 'desc' ? -1 : 1;
  if (homeSortBy === 'default') {
    if (homeCategoryFilter.length > 0) {
      // 分类视图：保持原有分类排序逻辑，绝不动
      list.sort(function(a, b) { return (getItemSignificance(b) - getItemSignificance(a)); });
    } else {
      // 全部视图：已加载的数据与图片优先进首屏（见 _homeDefaultAllSort）
      list.sort(_homeDefaultAllSort);
    }
  } else if (homeSortBy === 'change') {
    list.sort(function(a, b) {
      return ((getFieldByPeriod(a, field) || 0) - (getFieldByPeriod(b, field) || 0)) * dirMul;
    });
  } else {
    list.sort(function(a, b) { return ((a.price || 0) - (b.price || 0)) * dirMul; });
  }
  return list;
}

// ===== 涨跌箭头（色盲可读：不只靠颜色区分涨跌） =====
function formatChangeArrow(bl) {
  if (bl == null || bl === undefined) return '';
  return bl > 0 ? '\u25B2' : bl < 0 ? '\u25BC' : '\u2013';
}

// ===== 列表卡片增强片段：开盘价 / 30天前 / 当前分位 =====
// 区间高低取自上游真实价格锚点（今日开盘 + 3/7/30 天前 + 当前），非编造值。
function renderItemRangeRow(item) {
  var anchors = [item.price_start || item.priceStart || 0, item.day_3_price || 0,
                 item.day_7_price || 0, item.day_30_price || 0, item.price || 0]
    .filter(function(v) { return v > 0; });
  if (anchors.length < 2) return '';
  var lo = Math.min.apply(null, anchors);
  var hi = Math.max.apply(null, anchors);
  var price = item.price || 0;
  var pos = hi > lo ? Math.round((price - lo) / (hi - lo) * 100) : 50;
  if (pos < 0) pos = 0; if (pos > 100) pos = 100;

  var openHtml = item.price_start || item.priceStart
    ? '<span class="ir-item">\u5F00\u76D8 <b class="num">\xA5' + formatPrice(item.price_start || item.priceStart) + '</b></span>' : '';
  var d30Html = item.day_30_price
    ? '<span class="ir-item">30\u5929\u524D <b class="num">\xA5' + formatPrice(item.day_30_price) + '</b></span>' : '';
  if (!openHtml && !d30Html) return '';

  return '<div class="item-range-row">' +
      openHtml + d30Html +
      '<span class="ir-pos" title="\u5F53\u524D\u4EF7\u5728\u533A\u95F4\u4E2D\u7684\u4F4D\u7F6E">' +
        '<span class="ir-track"><span class="ir-fill" style="width:' + pos + '%"></span></span>' +
        '<span class="ir-num num">' + pos + '%</span>' +
      '</span>' +
    '</div>';
}

// ===== 已选筛选 chips 回显 =====
function renderHomeChips() {
  var box = document.getElementById('homeFilterChips');
  if (!box) return;
  var parts = [];
  homeCategoryFilter.forEach(function(cat) {
    parts.push('<span class="fchip"><b>' + escapeHtml(CATEGORY_MAP[cat] || cat) + '</b>' +
      '<button type="button" class="fchip-x" onclick="event.stopPropagation();toggleHomeCategory(\'' + escapeJSStr(cat) + '\')">\u2715</button></span>');
  });
  var hasCustom = (homePriceMin !== '' && homePriceMin != null) || (homePriceMax !== '' && homePriceMax != null);
  if (hasCustom) {
    parts.push('<span class="fchip"><b>' + (homePriceMin ? '\xA5' + formatPrice(Number(homePriceMin)) : '0') +
      ' \u2013 ' + (homePriceMax ? '\xA5' + formatPrice(Number(homePriceMax)) : '\u4E0D\u9650') + '</b>' +
      '<button type="button" class="fchip-x" onclick="event.stopPropagation();clearHomePriceCustom()">\u2715</button></span>');
  } else if (homePriceRange !== 'all') {
    var pl = { lt1w: '< 1\u4E07', '1-10w': '1\u4E07~10\u4E07', '10-100w': '10\u4E07~100\u4E07', gt100w: '> 100\u4E07' };
    parts.push('<span class="fchip"><b>' + (pl[homePriceRange] || homePriceRange) + '</b>' +
      '<button type="button" class="fchip-x" onclick="event.stopPropagation();setHomePriceRange(\'all\')">\u2715</button></span>');
  }
  if (homePeriod !== 'bl') {
    var tl = { day_3_bl: '\u8FD13\u5929', day_7_bl: '\u8FD17\u5929' };
    parts.push('<span class="fchip"><b>' + (tl[homePeriod] || homePeriod) + '</b>' +
      '<button type="button" class="fchip-x" onclick="event.stopPropagation();setHomePeriod(\'bl\')">\u2715</button></span>');
  }
  if (homeSortBy !== 'default') {
    parts.push('<span class="fchip"><b>' + (homeSortBy === 'change' ? '\u6DA8\u8DCC\u5E45' : '\u4EF7\u683C') +
      (homeSortDir === 'desc' ? '\u2193' : '\u2191') + '</b>' +
      '<button type="button" class="fchip-x" onclick="event.stopPropagation();setHomeSort(\'default\',\'desc\')">\u2715</button></span>');
  }
  if (parts.length > 1) {
    parts.push('<button type="button" class="fchip-clear" onclick="event.stopPropagation();resetAllFilters()">\u6E05\u7A7A\u5168\u90E8</button>');
  }
  box.innerHTML = parts.join('');
  box.style.display = parts.length ? 'flex' : 'none';
}

// ===== 筛选面板底部「查看 N 件」实时预估 =====
// 四个面板各有一份计数节点（class 而非 id，避免重复 id），统一刷新
function updateHomeApplyCount() {
  var n = getHomeFilteredItems(getHomeAllItems()).length;
  document.querySelectorAll('.dd-apply-count').forEach(function(el) { el.textContent = n; });
}

// ===== 面板「查看 N 件」：先把面板内的输入落到状态，再关面板并刷新列表 =====
function applyHomeDropdown() {
  var openId = ['timeDropdown', 'priceDropdown', 'filterDropdown', 'sortDropdown'].filter(function(id) {
    var el = document.getElementById(id);
    return el && el.style.display === 'block';
  })[0];
  if (openId === 'priceDropdown') setHomePriceCustom();
  closeAllDropdowns();
  renderHomeChips();
  renderHomeMovers();
}

// 面板内「清空」当前条件（与 resetCurrentDropdown 等价，保留给 chips 区复用）
function resetOpenDropdown() { resetCurrentDropdown(); }

// ===== 面板内分类多选刷新（不关面板，实时更新计数） =====
function refreshCategoryPanelState() {
  var counts = getHomeCategoryCounts();
  document.querySelectorAll('.filter-cat-chip').forEach(function(chip) {
    var cat = chip.dataset.cat;
    chip.classList.toggle('active', cat !== 'all' && homeCategoryFilter.indexOf(cat) >= 0);
    var cnt = chip.querySelector('.cat-cnt');
    if (cnt) cnt.textContent = cat === 'all' ? getHomeAllItems().length + ' \u4EF6' : (counts[cat] || 0) + ' \u4EF6';
  });
  var hint = document.getElementById('filterCatHint');
  if (hint) hint.textContent = homeCategoryFilter.length
    ? '\u5DF2\u9009 ' + homeCategoryFilter.length + ' \u4E2A\u5206\u7C7B\uFF08\u53EF\u591A\u9009\uFF09'
    : '\u9ED8\u8BA4\u5168\u90E8\u7C7B\u578B\uFF0C\u53EF\u591A\u9009';
  updateHomeApplyCount();
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
function toggleFilterDropdown() {
  toggleDropdown('filterDropdown', 'btnFilter');
  if (document.getElementById('filterDropdown').style.display === 'block') refreshCategoryPanelState();
}
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
  updateHomeApplyCount();
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
  renderHomeChips();
  renderHomeMovers();
}

function setHomePriceRange(range) {
  homePriceRange = range;
  // 选快捷档即放弃自定义区间，避免两套条件叠加造成困惑
  homePriceMin = '';
  homePriceMax = '';
  var a = document.getElementById('homePriceMinInput');
  var b = document.getElementById('homePriceMaxInput');
  if (a) a.value = '';
  if (b) b.value = '';
  syncPricePanelState();
  closeAllDropdowns();
  renderHomeChips();
  renderHomeMovers();
}

// ★ 分类改为多选：点一次加入、再点一次移除；'all' 表示清空（回到全部类型）
function toggleHomeCategory(cat) {
  if (cat === 'all') {
    homeCategoryFilter = [];
  } else {
    var idx = homeCategoryFilter.indexOf(cat);
    if (idx >= 0) homeCategoryFilter.splice(idx, 1);
    else homeCategoryFilter.push(cat);
  }
  updateFilterLabel();
  refreshCategoryPanelState();
  renderHomeChips();
  renderHomeMovers();
}

function updateFilterLabel() {
  var el = document.getElementById('filterLabel');
  if (!el) return;
  if (homeCategoryFilter.length === 0) el.textContent = '筛选';
  else if (homeCategoryFilter.length === 1) el.textContent = CATEGORY_MAP[homeCategoryFilter[0]] || homeCategoryFilter[0];
  else el.textContent = '分类' + homeCategoryFilter.length;
}

// 自定义价格区间（面板内两个输入框）
function setHomePriceCustom() {
  var a = document.getElementById('homePriceMinInput');
  var b = document.getElementById('homePriceMaxInput');
  if (a) homePriceMin = String(a.value || '').trim();
  if (b) homePriceMax = String(b.value || '').trim();
  // 自定义区间生效时，快捷档显示为「自定义」
  syncPricePanelState();
  updateHomeApplyCount();
}

function clearHomePriceCustom() {
  homePriceMin = '';
  homePriceMax = '';
  homePriceRange = 'all';
  var a = document.getElementById('homePriceMinInput');
  var b = document.getElementById('homePriceMaxInput');
  if (a) a.value = '';
  if (b) b.value = '';
  syncPricePanelState();
  renderHomeChips();
  renderHomeMovers();
}

function syncPricePanelState() {
  var hasCustom = homePriceMin !== '' || homePriceMax !== '';
  document.querySelectorAll('#priceDropdown .dropdown-item').forEach(function(item) {
    item.classList.toggle('active', !hasCustom && item.dataset.range === homePriceRange);
  });
  var el = document.getElementById('priceLabel');
  if (el) {
    if (hasCustom) {
      el.textContent = (homePriceMin ? shortPrice(Number(homePriceMin)) : '0') + '~' + (homePriceMax ? shortPrice(Number(homePriceMax)) : '不限');
    } else {
      var labels = { all: '全部价格', lt1w: '< 1万', '1-10w': '1万~10万', '10-100w': '10万~100万', gt100w: '> 100万' };
      el.textContent = labels[homePriceRange] || '全部价格';
    }
  }
  updateHomeApplyCount();
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
  renderHomeChips();
  renderHomeMovers();
}

// ★ 重置（面板底部「重置」按钮 + chips 区「清空全部」共用）
function resetAllFilters() {
  homeCategoryFilter = [];
  homePeriod = 'bl';
  homePriceRange = 'all';
  homePriceMin = '';
  homePriceMax = '';
  homeSortBy = 'default';
  homeSortDir = 'desc';

  document.getElementById('timeLabel').textContent = '近1天';
  document.getElementById('sortLabel').textContent = '综合↓';
  updateFilterLabel();
  document.querySelectorAll('#timeDropdown .dropdown-item').forEach(function(c) { c.classList.toggle('active', c.dataset.period === 'bl'); });
  document.querySelectorAll('#sortDropdown .dropdown-item').forEach(function(c) { c.classList.toggle('active', c.dataset.sort === 'default'); });

  var a = document.getElementById('homePriceMinInput');
  var b = document.getElementById('homePriceMaxInput');
  if (a) a.value = '';
  if (b) b.value = '';
  syncPricePanelState();
  refreshCategoryPanelState();

  closeAllDropdowns();
  renderHomeChips();
  renderHomeMovers();
}

// 只重置当前打开的那个面板（面板内「重置」按钮）
function resetCurrentDropdown() {
  var openId = ['timeDropdown', 'priceDropdown', 'filterDropdown', 'sortDropdown'].filter(function(id) {
    var el = document.getElementById(id);
    return el && el.style.display === 'block';
  })[0];
  if (openId === 'priceDropdown') {
    homePriceRange = 'all';
    homePriceMin = '';
    homePriceMax = '';
    var a = document.getElementById('homePriceMinInput');
    var b = document.getElementById('homePriceMaxInput');
    if (a) a.value = '';
    if (b) b.value = '';
    syncPricePanelState();
  } else if (openId === 'filterDropdown') {
    homeCategoryFilter = [];
    updateFilterLabel();
    refreshCategoryPanelState();
  } else if (openId === 'timeDropdown') {
    homePeriod = 'bl';
    document.getElementById('timeLabel').textContent = '近1天';
    document.querySelectorAll('#timeDropdown .dropdown-item').forEach(function(c) { c.classList.toggle('active', c.dataset.period === 'bl'); });
  } else if (openId === 'sortDropdown') {
    homeSortBy = 'default';
    homeSortDir = 'desc';
    document.getElementById('sortLabel').textContent = '综合↓';
    document.querySelectorAll('#sortDropdown .dropdown-item').forEach(function(c) { c.classList.toggle('active', c.dataset.sort === 'default'); });
  }
  updateHomeApplyCount();
  renderHomeChips();
  renderHomeMovers();
}

function applyHomeBrowseState(state) {
  if (!state) return;
  // ★ 兼容旧存档：homeCategoryFilter 旧为字符串（'all' 或单个 key），现统一为数组
  if (state.homeCategoryFilter !== undefined) {
    var cf = state.homeCategoryFilter;
    if (Array.isArray(cf)) homeCategoryFilter = cf.filter(function(k) { return !!CATEGORY_MAP[k]; });
    else if (typeof cf === 'string' && cf !== 'all' && CATEGORY_MAP[cf]) homeCategoryFilter = [cf];
    else homeCategoryFilter = [];
  }
  if (state.homePeriod !== undefined) homePeriod = state.homePeriod;
  if (state.homePriceRange !== undefined) homePriceRange = state.homePriceRange;
  if (state.homePriceMin !== undefined) homePriceMin = state.homePriceMin;
  if (state.homePriceMax !== undefined) homePriceMax = state.homePriceMax;
  if (state.homeSortBy !== undefined) homeSortBy = state.homeSortBy;
  if (state.homeSortDir !== undefined) homeSortDir = state.homeSortDir;
  if (state.homeCurrentPage !== undefined) homeCurrentPage = state.homeCurrentPage;

  var timeLabels = { bl: '近1天', day_3_bl: '近3天', day_7_bl: '近7天' };
  var timeEl = document.getElementById('timeLabel');
  if (timeEl) timeEl.textContent = timeLabels[homePeriod] || '近1天';

  var sortLabelText;
  if (homeSortBy === 'default') sortLabelText = '综合↓';
  else if (homeSortBy === 'change') sortLabelText = '涨跌幅';
  else sortLabelText = '价格' + (homeSortDir === 'desc' ? '↓' : '↑');
  var sortEl = document.getElementById('sortLabel');
  if (sortEl) sortEl.textContent = sortLabelText;

  document.querySelectorAll('#timeDropdown .dropdown-item').forEach(function(item) {
    item.classList.toggle('active', item.dataset.period === homePeriod);
  });
  document.querySelectorAll('#sortDropdown .dropdown-item').forEach(function(item) {
    item.classList.toggle('active', item.dataset.sort === homeSortBy && (homeSortBy === 'default' || item.dataset.dir === homeSortDir));
  });

  updateFilterLabel();
  syncPricePanelState();
  refreshCategoryPanelState();
  renderHomeChips();
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
