// ===== main.js — 应用入口 =====
// 功能清单: 页面路由(showPage/pushPage/goBack) | 底部Tab导航 | 首页渲染+筛选排序+分页 | 列表页渲染+排序+分页
// 详情页渲染+价格图表 | 搜索页(实时搜索+历史+最近浏览+收藏) | 收藏Tab页 | 下拉刷新 | 自动刷新定时器(5分钟)
// 每日价格记录 | 加载动画+进度条 | 全局事件(下拉关闭/返回键) | 初始化流程(preload)
// 依赖: store.js(getCache/setCache/clearCache/...) api.js(apiRequest/loadAllItems/...) render.js(所有render函数)
//    maps.js(findItemMap) utils.js(toast/formatPrice/...)
// 改动影响: 修改路由→影响所有页面跳转; 修改刷新逻辑→影响数据新鲜度; 修改初始化→影响启动体验

// ===== 状态变量 =====
const pages = {};
['home', 'list', 'detail', 'search', 'favtab'].forEach(function(id) {
  pages[id] = document.getElementById('page-' + id);
});
var pageStack = ['home'];
var currentCategory = null;
var listItems = [];
var currentItem = null;
var isAllMode = false;
var sortBy = 'price';
var sortDir = 'desc';
var currentPage = 1;

var searchTimer;

// ===== 页面导航 =====
function showPage(name) {
  Object.values(pages).forEach(function(p) { p.classList.remove('active'); });
  const page = pages[name];
  if (page) {
    page.classList.add('active');
    if (name !== 'search') page.classList.add('fade-in');
  }
  window.scrollTo(0, 0);
}

function goBack() {
  if (pageStack.length > 1) {
    pageStack.pop();
    const prev = pageStack[pageStack.length - 1];
    showPage(prev);
    if (prev === 'home') {
      // ★ 从详情/搜索/列表返回首页：恢复筛选/排序/分页 + 滚动位置
      var saved = restoreBrowseState();
      if (saved && typeof applyHomeBrowseState === 'function') {
        applyHomeBrowseState(saved);
      }
      // 用最新缓存数据重渲染（保留当前页码 + 筛选条件）
      checkFavoritePriceChanges();
      renderHomeTopMover();
      renderHomeMovers(false);
      if (saved && saved.homeScrollTop) {
        setTimeout(function() { window.scrollTo(0, saved.homeScrollTop); }, 100);
      }
    } else if (prev === 'list') {
      // 修复：从 search→detail 返回时，listItems 可能被单元素污染，从缓存恢复
      const cached = getCache();
      if (cached && cached._allItems && cached._allItems.length > 0) {
        if (currentCategory && currentCategory.key !== 'fav') {
          listItems = isAllMode
            ? cached._allItems
            : cached._allItems.filter(function(i) { return i._category === currentCategory.key; });
        }
      }
      if (listItems && listItems.length > 0) {
        renderList(listItems, isAllMode);
      }
    }
    saveBrowseState();
  }
}

function pushPage(name) {
  // ★ 必须在 showPage 之前保存，否则 scrollTop 已被 showPage 置 0
  saveBrowseState();
  pageStack.push(name);
  showPage(name);
}

function goToPage(page) {
  currentPage = page;
  renderList(listItems, isAllMode);
  var el = document.getElementById('listContent');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ===== 排序 =====
function setSort(field) {
  if (sortBy === field) {
    sortDir = sortDir === 'desc' ? 'asc' : 'desc';
  } else {
    sortBy = field;
    sortDir = 'desc';
  }
  currentPage = 1;
  updateSortBar();
  renderList(listItems, isAllMode);
}

function updateSortBar() {
  document.querySelectorAll('.sort-btn').forEach(function(btn) {
    const field = btn.dataset.sort;
    btn.classList.toggle('active', field === sortBy);
  });
  ['price', 'change'].forEach(function(f) {
    const el = document.getElementById('dir-' + f);
    if (el) el.textContent = (f === sortBy) ? (sortDir === 'desc' ? '↓' : '↑') : '';
  });
}

function resetSort() {
  sortBy = 'price';
  sortDir = 'desc';
  currentPage = 1;
  updateSortBar();
}

// ===== Tab 切换（★ 预暖：切换标签瞬间响应） =====
var _favTabDataReady = false;
var _favTabPreWarmed = false;

function preWarmFavTab() {
  if (_favTabPreWarmed) return;
  _favTabPreWarmed = true;
  // 确保收藏数据与缓存数据合并完成
  var cached = getCache();
  if (cached && cached._allItems && cached._allItems.length > 0) {
    // 数据已就绪，标记收藏页可用
    _favTabDataReady = true;
  }
}

function switchTab(tabName) {
  // ★ 仅在离开需要保留状态的页面时才保存（防止 detail/favtab 覆盖 home 的保存）
  var leavingPage = pageStack[pageStack.length - 1];
  if (leavingPage === 'home' || leavingPage === 'list') {
    saveBrowseState();
  }

  document.querySelectorAll('.bottom-nav .tab').forEach(function(t) { t.classList.remove('active'); });
  var tab = document.querySelector('.bottom-nav .tab[data-tab="' + tabName + '"]');
  if (tab) tab.classList.add('active');
  Object.values(pages).forEach(function(p) { p.classList.remove('active'); });
  const target = document.getElementById('page-' + tabName);
  if (target) {
    target.classList.add('active');
    pageStack = [tabName];
    if (tabName === 'home') {
      // ★ 恢复首页筛选/排序/分页状态
      var saved = restoreBrowseState();
      if (saved && typeof applyHomeBrowseState === 'function') {
        applyHomeBrowseState(saved);
      }
      checkFavoritePriceChanges();
      renderHomeTopMover();
      renderHomeMovers(false);   // ★ 保留当前页码，不重置到第一页
      // ★ 恢复滚动位置（renderHomeMovers 已重建 DOM，延迟滚动）
      if (saved && saved.homeScrollTop) {
        setTimeout(function() { window.scrollTo(0, saved.homeScrollTop); }, 100);
      }
      // ★ 后台预暖收藏页数据
      setTimeout(function() { preWarmFavTab(); }, 300);
      return; // ★ 跳过末尾的 scrollTo(0,0)
    }
    if (tabName === 'favtab') {
      // ★ 如果缓存未就绪，异步加载后渲染
      if (!_favTabDataReady) {
        var cached = getCache();
        if (cached && cached._allItems && cached._allItems.length > 0) {
          _favTabDataReady = true;
        }
      }
      renderFavTab();
      // 后台确保数据最新
      if (!_favTabDataReady) {
        loadAllItems(false).then(function() {
          _favTabDataReady = true;
          if (pageStack[pageStack.length - 1] === 'favtab') renderFavTab();
        });
      }
    }
  }
  window.scrollTo(0, 0);
}

// ===== 分类导航 =====
async function openCategory(key, name) {
  currentCategory = { key: key, name: name };
  isAllMode = false;
  resetSort();
  document.getElementById('listTitle').textContent = name;
  pushPage('list');

  var content = document.getElementById('listContent');
  content.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><div class="loading-text">加载' + name + '...</div></div>';
  document.getElementById('listStats').innerHTML = '';

  try {
    var cached = getCache();
    var items;
    var fromCache = false;

    // ★ 优先使用预取数据（即使不完整也先展示出来）
    var prefetched = window.__prefetch || {};
    var pCat = prefetched[key];
    if (pCat && pCat._resolvedData && pCat._resolvedData.length > 0) {
      items = pCat._resolvedData.slice();
      fromCache = true;
      // 如果数据不完整，监听完成回调
      if (!pCat._complete && typeof pCat._onComplete !== 'function') {
        pCat._onComplete = function(fullItems) {
          if (currentCategory && currentCategory.key !== key) return;
          if (fullItems && fullItems.length > listItems.length) {
            listItems = fullItems;
            renderList(fullItems, false);
            // 更新缓存
            var c3 = getCache();
            if (c3 && c3._allItems) {
              var others = c3._allItems.filter(function(i) { return i._category !== key; });
              c3._allItems = others.concat(fullItems);
              setCache(c3);
            }
          }
        };
      }
    } else if (cached && cached._allItems) {
      items = cached._allItems.filter(function(i) { return i._category === key; });
      fromCache = items && items.length > 0;
    }

    if (!fromCache) {
      items = await fetchCategoryAll(key);
      if (items && items.length > 0) {
        var c2 = getCache();
        if (c2 && c2._allItems) {
          var otherItems = c2._allItems.filter(function(i) { return i._category !== key; });
          c2._allItems = otherItems.concat(items);
          setCache(c2);
        }
      }
    }
    if (currentCategory && currentCategory.key !== key) return;
    listItems = items;
    renderList(items, false);

    // ★ 如果用的是首页不完整数据，后台加载完整数据
    if (fromCache && pCat && pCat._loadingMore) {
      // _onComplete 已注册，会在后台加载完成后自动更新列表
    } else if (fromCache) {
      // 缓存数据存在时后台静默刷新
      fetchCategoryAll(key).then(function(freshItems) {
        if (currentCategory && currentCategory.key !== key) return;
        if (freshItems && freshItems.length > 0 && freshItems.length !== listItems.length) {
          listItems = freshItems;
          renderList(freshItems, false);
          var c3 = getCache();
          if (c3 && c3._allItems) {
            var others = c3._allItems.filter(function(i) { return i._category !== key; });
            c3._allItems = others.concat(freshItems);
            setCache(c3);
          }
        }
      }).catch(function() {});
    }
  } catch (err) {
    if (currentCategory && currentCategory.key !== key) return;
    console.error('加载失败:', err);
    content.innerHTML = '<div class="error-container"><div class="error-text">加载失败，请检查网络后重试</div><button class="retry-btn" onclick="openCategory(' + JSON.stringify(key) + ',' + JSON.stringify(name) + ')">重新加载</button></div>';
  }
}

async function openAllItems() {
  currentCategory = { key: 'all', name: '全部物品' };
  isAllMode = true;
  resetSort();
  document.getElementById('listTitle').textContent = '全部物品';
  pushPage('list');

  var content = document.getElementById('listContent');
  content.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><div class="loading-text">正在加载全部物品...</div></div>';
  document.getElementById('listStats').innerHTML = '';

  var items = null;

  // ★ 优先用预取首页数据快速展示
  var prefetched = window.__prefetch || {};
  var hasAnyPage1 = false;
  var page1All = [];
  CATEGORIES.forEach(function(cat) {
    var p = prefetched[cat.key];
    if (p && p._resolvedData && p._resolvedData.length > 0) {
      page1All = page1All.concat(p._resolvedData);
      hasAnyPage1 = true;
    }
  });
  if (hasAnyPage1) {
    items = page1All;
  }

  // 检查缓存
  if (!items || items.length === 0) {
    try {
      var cached = getCache();
      if (cached && cached._allItems && cached._allItems.length > 0) {
        items = cached._allItems;
      }
    } catch(e) { console.error('openAllItems getCache 失败:', e); }
  }

  // 如果没有预取也没有缓存，等待完整加载
  if (!items || items.length === 0) {
    try { items = await loadAllItems(); } catch(e) { console.error('loadAllItems error:', e); }
  }

  // 最后兜底
  if (!items || items.length === 0) {
    try {
      var allResults = await Promise.all(CATEGORIES.map(function(cat) {
        return fetchCategoryAll(cat.key).catch(function() { return []; });
      }));
      items = Array.prototype.concat.apply([], allResults);
      if (items && items.length > 0) { setCache({ _allItems: items }); }
    } catch(e) { console.error('fetchCategoryAll error:', e); }
  }

  if (!items || items.length === 0) {
    content.innerHTML = '<div class="error-container"><div class="error-text">暂无数据，请检查网络后刷新重试</div><button class="retry-btn" onclick="openAllItems()">重试</button></div>';
    return;
  }
  if (currentCategory && currentCategory.key !== 'all') return;
  listItems = items;
  renderList(items, true);

  // ★ 后台静默加载完整数据
  if (!isPrefetchComplete() && typeof loadAllItemsBackground === 'function') {
    loadAllItemsBackground(items).then(function(fullItems) {
      if (currentCategory && currentCategory.key !== 'all') return;
      if (fullItems && fullItems.length > listItems.length) {
        listItems = fullItems;
        renderList(fullItems, true);
      }
    });
  }
}

// ===== 物品查找 =====
function findItemAnywhere(itemId) {
  var cached = getCache();
  if (cached && cached._allItems) {
    var found = cached._allItems.find(function(i) { return i.id === itemId; });
    if (found) return found;
  }
  var pf = getPrefetchItems();
  if (pf.length > 0) {
    var found2 = pf.find(function(i) { return i.id === itemId; });
    if (found2) return found2;
  }
  // ★ 兜底：从收藏/最近浏览中恢复已从 API 删除的物品数据
  var locals = (getFavorites()).concat(getRecentViews());
  for (var li = 0; li < locals.length; li++) {
    if (locals[li].id === itemId) return locals[li];
  }
  return null;
}

// ===== 详情页 =====
async function openDetail(itemId) {
  const item = listItems.find(function(i) { return i.id === itemId; });
  if (!item) {
    const cached = getCache();
    const found = cached && cached._allItems ? cached._allItems.find(function(i) { return i.id === itemId; }) : null;
    if (!found) {
      toast('未找到该物品');
      return;
    }
    currentItem = found;
  } else {
    currentItem = item;
  }

  savePriceSnapshot(currentItem.id, currentItem);
  saveRecentView(currentItem);
  pushPage('detail');
  renderDetail(currentItem);

  try {
    const res = await apiRequest('item_price_all');
    // 页面守卫：如果用户已离开详情页，放弃更新
    if (pageStack[pageStack.length - 1] !== 'detail') return;
    var cleanData = sanitizeItemArray(res.data, 'price');
    const latest = cleanData.find(function(i) { return i.id === currentItem.id; });
    if (latest) {
      currentItem = Object.assign({}, currentItem, latest);
      savePriceSnapshot(currentItem.id, currentItem);
      const cached = getCache();
      if (cached && cached._allItems) {
        const cacheIdx = cached._allItems.findIndex(function(i) { return i.id === currentItem.id; });
        if (cacheIdx >= 0) {
          cached._allItems[cacheIdx] = currentItem;
          setCache(cached);
        }
      }
      updateDetailPrices(currentItem);   // ★ 只更新价格和图表，不重建整页 DOM
    }
  } catch (err) {}
}

// ★ 统一入口：从任意来源打开物品详情
function openDetailFromSource(itemId, notFoundMsg) {
  var item = findItemAnywhere(itemId);
  if (!item) {
    toast(notFoundMsg || '未找到该物品');
    return;
  }
  listItems = [item];
  currentItem = item;
  currentCategory = { key: item._category, name: CATEGORY_MAP[item._category] || '物品' };
  openDetail(itemId);
}

function openDetailFromRecent(itemId) { openDetailFromSource(itemId, '该物品数据已过期，请刷新后重试'); }
function openDetailFromFavorite(itemId) { openDetailFromSource(itemId, '该物品数据已过期，请刷新后重试'); }
function openDetailFromSearch(itemId) { openDetailFromSource(itemId, '未找到该物品数据'); }
function openPriceMover(itemId) { openDetailFromSource(itemId, '未找到该物品'); }
function openTopMover(itemId) { if (itemId) openDetailFromSource(itemId, '未找到该物品'); }

// ===== 收藏提醒（首页价格变动检测） =====
function checkFavoritePriceChanges() {
  const alertEl = document.getElementById('priceAlert');
  const sectionEl = document.getElementById('priceChangedSection');
  const itemsEl = document.getElementById('priceChangedItems');
  if (!alertEl || !sectionEl || !itemsEl) return;
  const favs = getFavorites();
  if (favs.length === 0) { alertEl.classList.remove('show'); alertEl.innerHTML = ''; sectionEl.classList.remove('show'); itemsEl.innerHTML = ''; return; }
  const cached = getCache();
  const allItems = cached && cached._allItems;
  if (!allItems || allItems.length === 0) { alertEl.classList.remove('show'); alertEl.innerHTML = ''; sectionEl.classList.remove('show'); itemsEl.innerHTML = ''; return; }

  const changes = [];
  var anyUpdated = false;
  favs.forEach(function(fav) {
    const current = allItems.find(function(item) { return item.id === fav.id; });
    if (!current || !fav.price || fav.price <= 0) return;
    if (!current.price || current.price <= 0) return; // 修复：current.price无效时不更新基准价
    const changePct = (current.price - fav.price) / fav.price * 100;
    if (Math.abs(changePct) >= 25) {
      changes.push({
        name: fav.name || '未知',
        pct: changePct,
        dir: changePct > 0 ? 'up' : 'down',
        id: fav.id,
        pic: current.pic || '',
        price: current.price
      });
      // 更新基准价，避免反复告警
      fav.price = current.price;
      fav.pic = current.pic || '';
      anyUpdated = true;
    }
  });
  if (anyUpdated) {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
  }

  if (changes.length === 0) {
    alertEl.classList.remove('show'); alertEl.innerHTML = '';
    sectionEl.classList.remove('show'); itemsEl.innerHTML = '';
    return;
  }

  const text = changes.map(function(c) {
    return '<span class="price-alert-item ' + c.dir + '">' + escapeHtml(c.name) + ' ' + (c.pct > 0 ? '+' : '') + c.pct.toFixed(1) + '%</span>';
  }).join('、');
  alertEl.innerHTML = '收藏提醒: ' + text;
  alertEl.classList.add('show');

  const cardHtml = changes.map(function(c) {
    const changeText = (c.pct > 0 ? '+' : '') + c.pct.toFixed(1) + '%';
    const picHtml = c.pic
      ? '<img src="' + sanitizeUrl(c.pic) + '" alt="" loading="lazy" onerror="this.parentElement.innerHTML=\'<span style=font-size:16px>-</span>\'">'
      : '<span style="font-size:16px">-</span>';
    return '<div class="price-changed-item" onclick="openDetail(' + JSON.stringify(c.id) + ')">\n        <div class="item-pic">' + picHtml + '</div>\n        <div class="item-info">\n          <div class="item-name">' + escapeHtml(c.name) + '</div>\n          <div class="item-price-row">\n            <span class="item-cur-price">\xA5' + formatPrice(c.price) + '</span>\n            <span class="item-change-pct ' + c.dir + '">' + changeText + '</span>\n          </div>\n        </div>\n      </div>';
  }).join('');
  itemsEl.innerHTML = cardHtml;
  sectionEl.classList.add('show');
}

// ===== 收藏按钮 =====
function toggleCurrentFavorite() {
  if (!currentItem || !currentItem.id) return;
  const isNowFav = toggleFavorite(currentItem);
  const btn = document.getElementById('detailFavBtn');
  if (btn) {
    btn.classList.add('fav-pop');
    setTimeout(function() { btn.classList.remove('fav-pop'); }, 300);
  }
  updateFavoriteButton(currentItem.id);
  if (document.getElementById('page-home').classList.contains('active')) {
    renderHome();
  }
  toast(isNowFav ? '已加入收藏' : '已取消收藏');
}

// ===== 搜索 =====
function showSearch() {
  pushPage('search');
  document.getElementById('searchInput').focus();
  document.getElementById('searchInput').value = '';
  document.getElementById('searchClear').classList.remove('visible');
  document.getElementById('searchHint').style.display = 'block';
  document.getElementById('searchResults').innerHTML = '';
  renderSearchHistory();
  renderRecentViews();
  renderFavorites();
}

function hideSearch() {
  const resultsEl = document.getElementById('searchResults');
  if (resultsEl.innerHTML && !resultsEl.querySelector('.loading-container')) {
    document.getElementById('searchResults').innerHTML = '';
    document.getElementById('searchHint').style.display = 'block';
    document.getElementById('searchInput').value = '';
    document.getElementById('searchClear').classList.remove('visible');
    renderSearchHistory();
    renderRecentViews();
    renderFavorites();
    return;
  }
  goBack();
}

function clearSearch() {
  const input = document.getElementById('searchInput');
  input.value = '';
  document.getElementById('searchClear').classList.remove('visible');
  document.getElementById('searchHint').style.display = 'block';
  document.getElementById('searchResults').innerHTML = '';
  renderSearchHistory();
  renderRecentViews();
  renderFavorites();
  input.focus();
}

async function doSearch(keyword) {
  if (!keyword.trim()) return;
  saveSearchQuery(keyword.trim());
  document.getElementById('searchHint').style.display = 'none';
  document.getElementById('searchHistory').style.display = 'none';
  document.getElementById('recentViewSection').style.display = 'none';
  document.getElementById('favoritesSection').style.display = 'none';
  document.getElementById('searchResults').innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><div class="loading-text">搜索中...</div></div>';

  var kw = keyword.toLowerCase();
  var allItems;
  var cached = getCache();
  if (cached && cached._allItems && cached._allItems.length > 0) {
    allItems = cached._allItems;
  } else {
    // ★ 优先用 _quick 首页数据快速搜索
    try {
      var prefetched = window.__prefetch || {};
      // 先用已就绪的 _resolvedData
      var fallbackItems = [];
      CATEGORIES.forEach(function(cat) {
        var p = prefetched[cat.key];
        if (p && p._resolvedData && p._resolvedData.length > 0) {
          fallbackItems = fallbackItems.concat(p._resolvedData);
        }
      });
      if (fallbackItems.length > 0) {
        allItems = fallbackItems;
      } else {
        // fallback: 等待 _quick promises
        var quickResults = await Promise.all(CATEGORIES.map(function(cat) {
          var p = prefetched[cat.key];
          if (!p || !p._quick) return Promise.resolve([]);
          return p._quick.then(function(r) {
            if (r && r.data) return sanitizeItemArray(r.data, 'list').map(function(item) { return Object.assign({}, item, { _category: cat.key }); });
            return [];
          }).catch(function() { return []; });
        }));
        allItems = Array.prototype.concat.apply([], quickResults);
      }
    } catch(e) { allItems = []; }
    if (!allItems || allItems.length === 0) {
      document.getElementById('searchResults').innerHTML = '<div class="error-container"><div class="error-text">数据加载中，请稍后重试</div><button class="retry-btn" onclick="doSearch(document.getElementById(\'searchInput\').value)">重试</button></div>';
      return;
    }
  }

  var results = searchByIndex(allItems, kw);
  renderSearchResults(results, keyword);
}

function searchFromHistory(keyword) {
  document.getElementById('searchInput').value = keyword;
  document.getElementById('searchClear').classList.add('visible');
  document.getElementById('searchHint').style.display = 'none';
  doSearch(keyword);
}

// ===== 刷新 =====
async function refreshCurrentList() {
  if (!checkRefreshCooldown()) return;
  if (!currentCategory) return;
  const content = document.getElementById('listContent');
  content.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><div class="loading-text">刷新中...</div></div>';
  document.getElementById('listStats').innerHTML = '';

  try {
    var refreshFailed = false;
    if (currentCategory.key === 'fav') {
      const favs = getFavorites();
      const cached = getCache();
      const allItems = cached && cached._allItems ? cached._allItems : [];
      listItems = favs.map(function(fav) {
        const full = allItems.find(function(i) { return i.id === fav.id; });
        return full ? Object.assign({}, fav, full) : fav;
      });
      renderList(listItems, false);
    } else if (isAllMode) {
      var backupCache = getCache();
      clearCache();
      try {
        // ★ 保存元数据用于合并
        var oldItems2 = (backupCache && backupCache._allItems) || [];
        var metaMap2 = {};
        oldItems2.forEach(function(item) {
          if (item.name && item.name.indexOf('#') !== 0) {
            metaMap2[canonicalId(item)] = { name: item.name, pic: item.pic, _category: item._category, grade: item.grade, ShopSellType: item.ShopSellType, desc: item.desc, secondClassCN: item.secondClassCN, length: item.length, width: item.width, weight: item.weight, objectID: item.objectID, tid: item.tid };
          }
        });
        // ★ 直接从 API 拉取最新价格
        var priceRes2 = await apiRequest('item_price_all', null, 3, true);
        var cleanPrices = sanitizeItemArray(priceRes2 && priceRes2.data, 'price');
        if (cleanPrices.length > 0) {
          var items = cleanPrices.map(function(p) {
            var meta = metaMap2[p.id] || {};
            return Object.assign({}, p, {
              name: meta.name || ('物品#' + p.id), pic: meta.pic || '',
              _category: meta._category || 'unknown', grade: meta.grade || 0,
              ShopSellType: meta.ShopSellType || '', desc: meta.desc || '',
              secondClassCN: meta.secondClassCN || '', length: meta.length || 0,
              width: meta.width || 0, weight: meta.weight || 0, objectID: meta.objectID || ''
            });
          });
          setCache({ _allItems: items });
          if (typeof buildSearchIndex === 'function') buildSearchIndex(items);
          if (typeof updateCategoryIcons === 'function') updateCategoryIcons(items);
          listItems = items;
          renderList(items, true);
        } else {
          throw new Error('API 返回空');
        }
      } catch (e) {
        if (backupCache && backupCache._allItems) {
          setCache(backupCache);
          listItems = backupCache._allItems;
          renderList(backupCache._allItems, true);
          toast('刷新失败，显示缓存数据');
          refreshFailed = true;
        } else {
          throw e;
        }
      }
    } else {
      const items = await fetchCategoryAll(currentCategory.key);
      listItems = items;
      const cached = getCache();
      if (cached && cached._allItems) {
        const otherItems = cached._allItems.filter(function(i) { return i._category !== currentCategory.key; });
        cached._allItems = [].concat(otherItems).concat(items);
        setCache(cached);
      }
      renderList(items, false);
    }
    if (!refreshFailed) {
      markRefreshed();
      toast('刷新完成');
    }
    // 仅首页可见时才更新首页 DOM（避免无效 DOM 操作和 localStorage 写入）
    if (document.getElementById('page-home').classList.contains('active')) {
      checkFavoritePriceChanges();
      renderHomeTopMover();
      renderHomeMovers();
    }
  } catch (err) {
    console.error('刷新失败:', err);
    content.innerHTML = '<div class="error-container"><div class="error-text">刷新失败，请检查网络后重试</div><button class="retry-btn" onclick="refreshCurrentList()">重新刷新</button></div>';
  }
}

async function refreshCurrentItem() {
  if (!checkRefreshCooldown()) return;
  if (!currentItem) return;
  const content = document.getElementById('detailContent');
  content.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><div class="loading-text">正在向API请求最新数据...</div></div>';

  try {
    const res = await apiRequest('item_price_all', null, 3, true);
    var cleanData = sanitizeItemArray(res.data, 'price');
    const latest = cleanData.find(function(i) { return i.id === currentItem.id; });
    if (latest) {
      currentItem = Object.assign({}, currentItem, latest);
      savePriceSnapshot(currentItem.id, currentItem);
      const idx = listItems.findIndex(function(i) { return i.id === currentItem.id; });
      if (idx >= 0) listItems[idx] = currentItem;
      const cached = getCache();
      if (cached && cached._allItems) {
        const cacheIdx = cached._allItems.findIndex(function(i) { return i.id === currentItem.id; });
        if (cacheIdx >= 0) {
          cached._allItems[cacheIdx] = currentItem;
          setCache(cached);
        }
      }
    }
    renderDetail(currentItem);
    markRefreshed();
    toast('刷新完成');
  } catch (err) {
    console.error('刷新物品失败:', err);
    renderDetail(currentItem);
    toast('刷新失败，显示已有数据');
  }
}

async function refreshAllData() {
  if (!checkRefreshCooldown()) return;
  var prevPage = pageStack[pageStack.length - 1];
  var prevItemId = currentItem ? currentItem.id : null;

  // ★ 保存旧缓存中的元数据（名称/图标/分类），刷新只更新价格
  var oldCache = getCache();
  var oldItems = (oldCache && oldCache._allItems) || [];
  var metaMap = {};
  oldItems.forEach(function(item) {
    if (item.name && item.name.indexOf('#') !== 0) {
      metaMap[canonicalId(item)] = { name: item.name, pic: item.pic, _category: item._category, grade: item.grade, ShopSellType: item.ShopSellType, desc: item.desc, secondClassCN: item.secondClassCN, length: item.length, width: item.width, weight: item.weight, objectID: item.objectID, tid: item.tid };
    }
  });
  // ★ 如果缓存没有完整元数据，从 prefetch 中补充
  var prefetched = window.__prefetch || {};
  if (Object.keys(metaMap).length < 100 && prefetched._resolvedData) {
    CATEGORIES.forEach(function(cat) {
      var p = prefetched[cat.key];
      if (p && p._resolvedData) {
        p._resolvedData.forEach(function(item) {
          var cid = canonicalId(item);
          if (item.name && item.name.indexOf('#') !== 0 && !metaMap[cid]) {
            metaMap[cid] = { name: item.name, pic: item.pic, _category: item._category, grade: item.grade, ShopSellType: item.ShopSellType, desc: item.desc, secondClassCN: item.secondClassCN, length: item.length, width: item.width, weight: item.weight, objectID: item.objectID, tid: item.tid };
          }
        });
      }
    });
  }

  clearCache();
  listItems = [];
  currentItem = null;

  toast('正在刷新全部数据...');
  try {
    // ★ 直接从 API 拉取最新价格（强制刷新，跳过缓存）
    var priceRes = await apiRequest('item_price_all', null, 3, true);
    var cleanPrices = sanitizeItemArray(priceRes && priceRes.data, 'price');
    if (cleanPrices.length === 0) {
      throw new Error('API 返回空数据');
    }

    // ★ 合并：API 价格 + 元数据
    var merged = cleanPrices.map(function(p) {
      var meta = metaMap[p.id] || {};
      return Object.assign({}, p, {
        name: meta.name || ('物品#' + p.id),
        pic: meta.pic || '',
        _category: meta._category || 'unknown',
        grade: meta.grade || 0,
        ShopSellType: meta.ShopSellType || '',
        desc: meta.desc || '',
        secondClassCN: meta.secondClassCN || '',
        length: meta.length || 0,
        width: meta.width || 0,
        weight: meta.weight || 0,
        objectID: meta.objectID || ''
      });
    });

    setCache({ _allItems: merged });
    if (typeof buildSearchIndex === 'function') buildSearchIndex(merged);
    if (typeof updateCategoryIcons === 'function') updateCategoryIcons(merged);
    markRefreshed();

    if (prevPage === 'home') {
      renderHomeMovers();
      checkFavoritePriceChanges();
      renderHomeTopMover();
      toast('全部数据已刷新！（' + merged.length + ' 件）');
    } else if (prevPage === 'list') {
      if (isAllMode) {
        listItems = merged;
        renderList(listItems, true);
      } else if (currentCategory) {
        listItems = merged.filter(function(i) { return i._category === currentCategory.key; });
        renderList(listItems, false);
      }
      toast('全部数据已刷新！（' + merged.length + ' 件）');
    } else if (prevPage === 'detail' && prevItemId) {
      currentItem = merged.find(function(i) { return i.id === prevItemId; });
      if (currentItem) renderDetail(currentItem);
      toast('全部数据已刷新！（' + merged.length + ' 件）');
    }
  } catch (err) {
    console.error('刷新全部数据失败:', err);
    toast('刷新失败，请检查网络');
    // ★ 恢复旧缓存数据（仅当缓存未被其他操作修改时）
    var currentCache = getCache();
    if (oldCache && oldCache._allItems && oldCache._allItems.length > 0 &&
        (!currentCache || !currentCache._allItems || currentCache._allItems.length === 0)) {
      setCache(oldCache);
      if (prevPage === 'home') renderHomeMovers();
    }
  }
}

function refreshFavTab() {
  if (!checkRefreshCooldown()) return;
  toast('正在刷新收藏价格...');
  // ★ 直接从 API 拉取最新价格，不再依赖缓存
  apiRequest('item_price_all', null, 3, true).then(function(res) {
    if (res && res.data && res.data.length > 0) {
      var cached = getCache();
      if (cached && cached._allItems) {
        var priceMap = {};
        var cleanPrices = sanitizeItemArray(res.data, 'price');
        cleanPrices.forEach(function(p) { priceMap[p.id] = p; });
        cached._allItems = cached._allItems.map(function(item) {
          var latest = priceMap[canonicalId(item)];
          if (latest) {
            item.price = latest.price;
            item.bl = latest.bl;
            item.day_3_bl = latest.day_3_bl;
            item.day_3_price = latest.day_3_price;
            item.day_7_bl = latest.day_7_bl;
            item.day_7_price = latest.day_7_price;
            item.day_30_bl = latest.day_30_bl;
            item.day_30_price = latest.day_30_price;
            item.is_get_time = latest.is_get_time;
          }
          return item;
        });
        setCache(cached);
        mergeSWPriceHistory().then(function() { recordAllItemsPrices(cached._allItems); });
      }
    }
    markRefreshed();
    renderFavTab();
    toast('收藏价格已刷新');
  }).catch(function(err) {
    console.error('刷新收藏失败:', err);
    renderFavTab();
    toast('刷新失败，显示已有数据');
  });
}

// ===== 自动刷新定时器（5 分钟间隔，仅记录价格 + 检测收藏变动，不重新渲染列表） =====
var homeRefreshTimer = null;

function startHomeAutoRefresh() {
  stopHomeAutoRefresh();
  function doAutoRefresh() {
    var homePage = document.getElementById('page-home');
    if (!homePage || !homePage.classList.contains('active') || pageStack[pageStack.length - 1] !== 'home') return;
    var cached = getCache();
    if (cached && cached._allItems && cached._allItems.length > 0) {
      recordAllItemsPrices(cached._allItems);
      mergeSWPriceHistory();
    }
    var alertEl = document.getElementById('priceAlert');
    var hadAlert = alertEl && alertEl.classList.contains('show');
    checkFavoritePriceChanges();
    renderHomeTopMover();
    // ★ 不再每次重新渲染整个列表，只更新涨跌幅数据提示
    if (alertEl && alertEl.classList.contains('show') && !hadAlert) {
      toast('收藏物品价格发生变动，点击查看', 3000);
    }
    var refreshIndicator = document.getElementById('autoRefreshTime');
    if (refreshIndicator) {
      var now = new Date();
      refreshIndicator.textContent = '自动刷新 ' +
        String(now.getHours()).padStart(2,'0') + ':' +
        String(now.getMinutes()).padStart(2,'0') + ':' +
        String(now.getSeconds()).padStart(2,'0');
    }
  }
  doAutoRefresh();
  homeRefreshTimer = setInterval(doAutoRefresh, 300000); // 5 分钟
}

function stopHomeAutoRefresh() {
  if (homeRefreshTimer) {
    clearInterval(homeRefreshTimer);
    homeRefreshTimer = null;
  }
}

var globalDailyRecordTimer = null;

function doRecordDaily() {
  var cached = getCache();
  if (cached && cached._allItems && cached._allItems.length > 0) {
    mergeSWPriceHistory().then(function() { recordAllItemsPrices(cached._allItems); });
  }
}

function startGlobalDailyRecord() {
  stopGlobalDailyRecord();
  doRecordDaily();
  globalDailyRecordTimer = setInterval(doRecordDaily, 1800000);
}

function stopGlobalDailyRecord() {
  if (globalDailyRecordTimer) {
    clearInterval(globalDailyRecordTimer);
    globalDailyRecordTimer = null;
  }
}

// ===== 事件绑定 =====
document.addEventListener('DOMContentLoaded', function() {
  // ★ 移动端修复：将下拉面板移到 body 下，确保 fixed 定位可靠
  if (typeof moveDropdownsToBody === 'function') moveDropdownsToBody();

  document.getElementById('searchInput').addEventListener('input', function(e) {
    const kw = e.target.value;
    const clearBtn = document.getElementById('searchClear');
    clearBtn.classList.toggle('visible', kw.length > 0);

    if (searchTimer) clearTimeout(searchTimer);
    if (!kw.trim()) {
      document.getElementById('searchHint').style.display = 'block';
      document.getElementById('searchResults').innerHTML = '';
      return;
    }
    searchTimer = setTimeout(function() { doSearch(kw); }, 300);
  });

  document.getElementById('searchInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      if (searchTimer) clearTimeout(searchTimer);
      doSearch(e.target.value);
    }
  });
});

document.addEventListener('visibilitychange', function() {
  if (document.hidden) {
    stopHomeAutoRefresh();
    stopGlobalDailyRecord();
  } else {
    // ★ 页面恢复可见：刷新数据、恢复自动刷新、确保数据持续加载
    startHomeAutoRefresh();
    startGlobalDailyRecord();
    // 如果缓存数据不足，后台继续加载
    var cached = getCache();
    if (!cached || !cached._allItems || cached._allItems.length < 50) {
      loadAllItems(false).then(function() {
        if (pageStack[pageStack.length - 1] === 'home') {
          checkFavoritePriceChanges();
          renderHomeTopMover();
          renderHomeMovers();
        }
        preWarmFavTab();
      }).catch(function(){});
    } else {
      // 后台静默刷新
      loadAllItems(true).catch(function(){});
    }
  }
});

// ===== 启动初始化 =====
// 从本地已有数据中直接提取图标缓存（无视过期时间，图标永不失效）
if (!getCatIconsCache()) {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (raw && raw._allItems && raw._allItems.length > 0) {
      const picks = {};
      raw._allItems.forEach(function(item) {
        const cat = item._category;
        if (cat && !picks[cat] && item.pic) picks[cat] = item.pic;
      });
      const logisticsItem = raw._allItems.find(function(i) { return i.name === '物流信息单' && i.pic; });
      if (logisticsItem) picks['all'] = logisticsItem.pic;
      if (Object.keys(picks).length > 0) setCatIconsCache(picks);
    }
  } catch(e) { console.warn('图标缓存提取失败:', e); }
}
renderHome();

// ★ 检测元数据降级：metadata 加载失败时显示警告横幅
(function checkMetadataDegraded() {
  var prefetched = window.__prefetch || {};
  if (typeof prefetched.isMetadataDegraded === 'function' && prefetched.isMetadataDegraded()) {
    var alertEl = document.getElementById('priceAlert');
    if (alertEl) {
      alertEl.innerHTML = '⚠️ 物品元数据加载失败，部分物品名称可能显示为"物品#ID"。请刷新重试。';
      alertEl.classList.add('show');
    }
  }
})();

// ===== 预加载（★ loading 期内全力拉取，10 秒硬超时，真实进度） =====
(async function preload() {
  var cached = getCache();
  var loadingScreen = document.getElementById('loadingScreen');
  var loadingLogo = document.getElementById('loadingLogo');
  var loadingGlow = document.getElementById('loadingGlow');
  var loadingProgressBar = document.getElementById('loadingProgressBar');
  var loadingStatus = document.getElementById('loadingStatus');
  var loadStart = Date.now();
  var minDisplayMs = 300;
  var LOADING_TIMEOUT = 10000; // ★ 10 秒硬超时
  var _loadingHidden = false;

  function setProgress(ratio, statusText) {
    if (_loadingHidden) return;
    var pct = Math.round(ratio * 100);
    loadingProgressBar.style.width = pct + '%';
    loadingLogo.style.filter = 'blur(' + ((20 * (1 - ratio)).toFixed(1)) + 'px)';
    loadingGlow.style.opacity = ratio.toFixed(2);
    if (statusText) loadingStatus.textContent = statusText;
  }

  function hideLoading() {
    if (_loadingHidden || loadingScreen.classList.contains('fade-out')) return;
    _loadingHidden = true;
    setProgress(1, '数据就绪');
    setTimeout(function() {
      loadingScreen.classList.add('fade-out');
      setTimeout(function() { loadingScreen.classList.add('removed'); }, 400);
    }, 200);
  }

  // ★ 渲染首屏 + 持续更新 loading 进度条
  function showAndContinueLoading(allItems, skipCache) {
    if (!allItems || allItems.length === 0) {
      hideLoading();
      return;
    }
    // 写入缓存 + 渲染（但不隐藏 loading）
    if (!skipCache) setCache({ _allItems: allItems });
    if (typeof buildSearchIndex === 'function') buildSearchIndex(allItems);
    updateCategoryIcons(allItems);
    checkFavoritePriceChanges();
    renderHomeTopMover();
    renderHomeMoversWithData(allItems, false);
    setProgress(0.55, '已展示 ' + allItems.length + ' 件，继续加载更多...');

    // ★ loading 期内实时追踪预取进度
    var _pollTimer = setInterval(function() {
      if (_loadingHidden) { clearInterval(_pollTimer); return; }
      var prefetched = window.__prefetch || {};
      var realProgress = (typeof prefetched.getProgress === 'function')
        ? prefetched.getProgress()
        : 0;
      var expected = (typeof prefetched.getExpectedTotal === 'function')
        ? prefetched.getExpectedTotal()
        : 0;
      var arrived = (typeof prefetched.getTotalArrived === 'function')
        ? prefetched.getTotalArrived()
        : allItems.length;
      // 进度：首屏 50% + 翻页进度 50%
      var displayProgress = 0.55 + realProgress * 0.43;
      if (displayProgress > 0.98) displayProgress = 0.98;
      setProgress(displayProgress, '已加载 ' + arrived + (expected > 0 ? '/' + expected : '') + ' 件...');
      // ★ 数据量足够或翻页完成 → 提前结束 loading
      if (arrived >= expected && expected > 0 && arrived > 100) {
        clearInterval(_pollTimer);
        hideLoading();
      }
      if (typeof prefetched.isPaginationDone === 'function' && prefetched.isPaginationDone() && arrived > 100) {
        clearInterval(_pollTimer);
        hideLoading();
      }
    }, 400);

    // ★ 后台监听翻页完成 → 更新缓存 + 搜索结果
    if (!skipCache) {
      setTimeout(function() {
        loadAllItemsBackground(allItems).then(function(fullItems) {
          if (fullItems && fullItems.length > allItems.length) {
            if (typeof buildSearchIndex === 'function') buildSearchIndex(fullItems);
            updateCategoryIcons(fullItems);
            scheduleHomeSilentUpdate();
          }
        });
      }, 100);
    }
  }

  // ===== 有缓存：快速展示，后台刷新 =====
  if (cached && cached._allItems && cached._allItems.length > 0) {
    // ★ 先清空首页内容，防止旧数据闪现
    var homeList = document.getElementById('homeMoversList');
    if (homeList) homeList.innerHTML = '';
    var topMover = document.getElementById('topMover');
    if (topMover) topMover.style.display = 'none';

    updateCategoryIcons(cached._allItems);
    buildSearchIndex(cached._allItems);
    mergeSWPriceHistory().then(function() { recordAllItemsPrices(cached._allItems); });
    // 加速动画：缓存命中时快速展示
    var steps = [0, 0.2, 0.45, 0.7, 0.9, 1];
    steps.forEach(function(ratio, i) {
      setTimeout(function() {
        setProgress(ratio, ratio < 0.3 ? '正在准备...' : ratio < 0.7 ? '正在同步最新价格' : ratio < 1 ? '即将就绪' : '数据就绪');
        if (ratio === 1) {
          setTimeout(function() { renderHomeMovers(); renderHomeTopMover(); }, 50);
          setTimeout(function() { hideLoading(); }, 150);
        }
      }, i * 80);
    });
    // 后台刷新最新数据（缩短延迟，优先拉取）
    setTimeout(function() { loadAllItems(true).catch(function(){}); }, 800);
    registerPeriodicSync();
    startHomeAutoRefresh();
    startGlobalDailyRecord();
    return;
  }

  // ===== 无缓存：★ v3 双请求合并，2-3s 全量 1350 件一次到齐 =====
  var prefetched = window.__prefetch || {};
  setProgress(0.05, '正在连接数据源...');

  var _noCacheAllItems = [];
  var _noCacheDone = false;
  var _progressTimer = null;

  // ★ 监听数据到达（v3: metadata+price 合并后一次性通知全部物品）
  if (typeof prefetched.onItemsArrive === 'function') {
    prefetched.onItemsArrive(function(newItems, totalArrived) {
      _noCacheAllItems = _noCacheAllItems.concat(newItems);
      if (!_noCacheDone && _noCacheAllItems.length >= 30) {
        _noCacheDone = true;
        if (_progressTimer) clearInterval(_progressTimer);
        setCache({ _allItems: _noCacheAllItems });
        if (typeof buildSearchIndex === 'function') buildSearchIndex(_noCacheAllItems);
        updateCategoryIcons(_noCacheAllItems);
        checkFavoritePriceChanges();
        renderHomeTopMover();
        renderHomeMoversWithData(_noCacheAllItems, false);
        setProgress(1, '已加载 ' + totalArrived + ' 件');
        setTimeout(function() { hideLoading(); }, 300);
      }
    });
  }

  // 进度条：~3 秒平滑动画
  setProgress(0.08, '正在请求数据...');
  var _progressStage = 0;
  _progressTimer = setInterval(function() {
    _progressStage++;
    if (_loadingHidden || _noCacheDone) { clearInterval(_progressTimer); return; }
    // 0-3s: 线性提升到 90%，给用户"在加载"的感觉
    var fakeRatio = Math.min(0.08 + _progressStage * 0.06, 0.9);
    setProgress(fakeRatio, '正在拉取实时价格...');
  }, 200);

  // ★ 全部数据到齐
  if (prefetched._allPage1Ready) {
    prefetched._allPage1Ready.then(function(sortedAll) {
      if (!sortedAll || sortedAll.length === 0 || _noCacheDone) return;
      _noCacheDone = true;
      if (_progressTimer) clearInterval(_progressTimer);
      setCache({ _allItems: sortedAll });
      if (typeof buildSearchIndex === 'function') buildSearchIndex(sortedAll);
      updateCategoryIcons(sortedAll);
      checkFavoritePriceChanges();
      renderHomeTopMover();
      renderHomeMoversWithData(sortedAll, false);
      setProgress(1, '已加载 ' + sortedAll.length + ' 件');
      setTimeout(function() { hideLoading(); }, 300);
    }).catch(function() {});
  }

  // ★ 8 秒硬超时（v3 数据量小，2-3s 正常完成；8s 兜底足够）
  setTimeout(function() {
    if (_loadingHidden || (loadingScreen && loadingScreen.classList.contains('fade-out'))) return;
    if (_progressTimer) clearInterval(_progressTimer);
    if (!_noCacheDone) {
      _noCacheDone = true;
      var items = (typeof prefetched.getAllPage1Items === 'function')
        ? prefetched.getAllPage1Items()
        : _noCacheAllItems;
      if (items.length > 0) {
        setCache({ _allItems: items });
        if (typeof buildSearchIndex === 'function') buildSearchIndex(items);
        updateCategoryIcons(items);
        renderHomeTopMover();
        renderHomeMoversWithData(items, false);
        hideLoading();
      } else {
        // ★ 数据为空 → 显示重试按钮，不隐藏 loading
        var errWrap = document.getElementById('loadingRetryWrap');
        var errText = document.getElementById('loadingErrorText');
        var statusEl = document.getElementById('loadingStatus');
        if (errWrap) errWrap.style.display = 'flex';
        if (errText) errText.textContent = '数据加载超时，请检查网络后重试';
        if (statusEl) statusEl.textContent = '连接超时';
        setProgress((prefetched && prefetched.getProgress) ? prefetched.getProgress() : 0.2, '');
      }
    } else {
      hideLoading();
    }
  }, LOADING_TIMEOUT);

  registerPeriodicSync();
  startHomeAutoRefresh();
  startGlobalDailyRecord();
})();

// ===== 自定义滚动条 =====
(function initCustomScrollbar() {
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    return;
  }
  var body = document.body;
  var html = document.documentElement;

  var bar = document.createElement('div');
  bar.className = 'custom-scrollbar';
  bar.innerHTML = '<div class="cs-track"><div class="cs-thumb" id="csThumb"></div></div>';
  body.appendChild(bar);

  var track = bar.querySelector('.cs-track');
  var thumb = document.getElementById('csThumb');
  var dragging = false;
  var startY = 0;
  var startTop = 0;

  function getScrollHeight() { return Math.max(body.scrollHeight, html.scrollHeight); }
  function getViewHeight() { return window.innerHeight; }
  function getTrackHeight() { return track.clientHeight; }

  function updateThumb() {
    var sh = getScrollHeight();
    var vh = getViewHeight();
    var th = getTrackHeight();
    if (sh <= vh) { thumb.style.display = 'none'; return; }
    thumb.style.display = 'block';
    var ratio = Math.min(vh / sh, 1);
    var thumbH = Math.max(ratio * th, 28);
    thumb.style.height = thumbH + 'px';
    // ★ 拖拽中不重置滑钮位置（由 onMove 控制），仅更新高度适配内容变化
    if (dragging) return;
    var maxScroll = sh - vh;
    var scrollY = window.pageYOffset || html.scrollTop;
    var maxTop = th - thumbH;
    var top = maxScroll > 0 ? (scrollY / maxScroll) * maxTop : 0;
    thumb.style.top = top + 'px';
  }

  window.addEventListener('scroll', updateThumb, { passive: true });
  window.addEventListener('resize', updateThumb);
  var observer = new MutationObserver(updateThumb);
  observer.observe(body, { childList: true, subtree: true }); // 属性变化不影响页面总高度，不需要监听

  thumb.addEventListener('mousedown', onStart);
  thumb.addEventListener('touchstart', onStart, { passive: false });
  function onStart(e) {
    e.preventDefault();
    dragging = true;
    document.addEventListener('mousemove', onMove);   // 仅在拖拽时注册
    document.addEventListener('touchmove', onMove, { passive: false });
    thumb.style.background = '#ffaa00';
    thumb.style.boxShadow = '0 0 10px rgba(255,170,0,0.7)';
    var ev = e.touches ? e.touches[0] : e;
    startY = ev.clientY;
    startTop = parseFloat(thumb.style.top) || 0;
  }
  // touchmove 仅在拖动时动态注册，避免全局 passive:false 导致滚动卡顿
  function onMove(e) {
    if (!dragging) return;
    e.preventDefault();
    var ev = e.touches ? e.touches[0] : e;
    var dy = ev.clientY - startY;
    var newTop = startTop + dy;
    var th = getTrackHeight();
    var thumbH = parseFloat(thumb.style.height) || 28;
    newTop = Math.max(0, Math.min(newTop, th - thumbH));
    thumb.style.top = newTop + 'px';
    var sh = getScrollHeight();
    var vh = getViewHeight();
    var maxScroll = sh - vh;
    var maxTop = th - thumbH;
    var scrollY = maxTop > 0 ? (newTop / maxTop) * maxScroll : 0;
    window.scrollTo(0, scrollY);

    }

  document.addEventListener('mouseup', onEnd);
  document.addEventListener('touchend', onEnd);
  function onEnd() {
    if (!dragging) return;
    dragging = false;
    document.removeEventListener('mousemove', onMove);  // 拖拽结束时移除
    document.removeEventListener('touchmove', onMove);
    thumb.style.background = '#ffd700';
    thumb.style.boxShadow = '0 0 6px rgba(255,215,0,0.5)';

  }

  track.addEventListener('mousedown', function(e) {
    if (e.target === thumb) return;
    var th = getTrackHeight();
    var thumbH = parseFloat(thumb.style.height) || 28;
    var clickRatio = e.offsetY / th;
    var sh = getScrollHeight();
    var vh = getViewHeight();
    var maxScroll = sh - vh;
    window.scrollTo(0, clickRatio * maxScroll);
  });

  updateThumb();
})();
