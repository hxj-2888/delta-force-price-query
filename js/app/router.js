// ===== app/router.js — 路由 + 导航 + 详情 + 搜索 + 刷新 =====
// 功能清单: 页面路由(showPage/pushPage/goBack) | 底部Tab切换(switchTab) | 分类导航(openCategory/openAllItems)
// 物品查找(findItemAnywhere) | 详情页(openDetail/openDetailFromSource等) | 收藏按钮(toggleCurrentFavorite)
// 搜索(showSearch/hideSearch/doSearch/searchFromHistory) | 刷新(refreshCurrentList/refreshCurrentItem/refreshAllData/refreshFavTab)
// 依赖: 所有 config/store/render/api/utils 模块
// 被依赖: app/init.js

// ===== 状态变量 =====
var pages = {};
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
  var page = pages[name];
  if (page) {
    page.classList.add('active');
    if (name !== 'search') page.classList.add('fade-in');
  }
  window.scrollTo(0, 0);
}

function goBack() {
  if (pageStack.length > 1) {
    pageStack.pop();
    var prev = pageStack[pageStack.length - 1];
    showPage(prev);
    if (prev === 'home') {
      var saved = restoreBrowseState();
      if (saved && typeof applyHomeBrowseState === 'function') {
        applyHomeBrowseState(saved);
      }
      checkFavoritePriceChanges();
      renderHomeTopMover();
      renderHomeMovers(false);
      if (saved && saved.homeScrollTop) {
        setTimeout(function() { window.scrollTo(0, saved.homeScrollTop); }, 100);
      }
    } else if (prev === 'list') {
      var cached = getCache();
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
    var field = btn.dataset.sort;
    btn.classList.toggle('active', field === sortBy);
  });
}

function resetSort() {
  sortBy = 'price';
  sortDir = 'desc';
  currentPage = 1;
  updateSortBar();
}

// ===== Tab 切换 =====
var _favTabDataReady = false;
var _favTabPreWarmed = false;

function preWarmFavTab() {
  if (_favTabPreWarmed) return;
  _favTabPreWarmed = true;
  var cached = getCache();
  if (cached && cached._allItems && cached._allItems.length > 0) {
    _favTabDataReady = true;
  }
}

function switchTab(tabName) {
  var leavingPage = pageStack[pageStack.length - 1];
  if (leavingPage === 'home' || leavingPage === 'list') {
    saveBrowseState();
  }

  document.querySelectorAll('.bottom-nav .tab').forEach(function(t) { t.classList.remove('active'); });
  var tab = document.querySelector('.bottom-nav .tab[data-tab="' + tabName + '"]');
  if (tab) tab.classList.add('active');
  Object.values(pages).forEach(function(p) { p.classList.remove('active'); });
  var target = document.getElementById('page-' + tabName);
  if (target) {
    target.classList.add('active');
    pageStack = [tabName];
    if (tabName === 'home') {
      var saved = restoreBrowseState();
      if (saved && typeof applyHomeBrowseState === 'function') {
        applyHomeBrowseState(saved);
      }
      checkFavoritePriceChanges();
      renderHomeTopMover();
      renderHomeMovers(false);
      if (saved && saved.homeScrollTop) {
        setTimeout(function() { window.scrollTo(0, saved.homeScrollTop); }, 100);
      }
      setTimeout(function() { preWarmFavTab(); }, 300);
      return;
    }
    if (tabName === 'favtab') {
      if (!_favTabDataReady) {
        var cached = getCache();
        if (cached && cached._allItems && cached._allItems.length > 0) {
          _favTabDataReady = true;
        }
      }
      renderFavTab();
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

    var prefetched = window.__prefetch || {};
    var pCat = prefetched[key];
    if (pCat && pCat._resolvedData && pCat._resolvedData.length > 0) {
      items = pCat._resolvedData.slice();
      fromCache = true;
      if (!pCat._complete && typeof pCat._onComplete !== 'function') {
        pCat._onComplete = function(fullItems) {
          if (currentCategory && currentCategory.key !== key) return;
          if (fullItems && fullItems.length > listItems.length) {
            listItems = fullItems;
            renderList(fullItems, false);
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
    // ★ v3 修复: 移除"缓存命中后仍自动全量翻页刷新"的请求。
    //   预取 v3 已用 item_price_all + metadata 拿到全量最新数据,
    //   此处再翻页只会重复消耗上游(acc 类一次约 56 次), 数据会在下次页面加载时自动更新。
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

  if (!items || items.length === 0) {
    try {
      var cached = getCache();
      if (cached && cached._allItems && cached._allItems.length > 0) {
        items = cached._allItems;
      }
    } catch(e) { console.error('openAllItems getCache 失败:', e); }
  }

  if (!items || items.length === 0) {
    try { items = await loadAllItems(); } catch(e) { console.error('loadAllItems error:', e); }
  }

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
  var locals = (getFavorites()).concat(getRecentViews());
  for (var li = 0; li < locals.length; li++) {
    if (locals[li].id === itemId) return locals[li];
  }
  return null;
}

// ===== 详情页 =====
async function openDetail(itemId) {
  var item = listItems.find(function(i) { return i.id === itemId; });
  if (!item) {
    var cached = getCache();
    var found = cached && cached._allItems ? cached._allItems.find(function(i) { return i.id === itemId; }) : null;
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
    var res = await apiRequest('item_price_all');
    if (pageStack[pageStack.length - 1] !== 'detail') return;
    var cleanData = sanitizeItemArray(res.data, 'price');
    var latest = cleanData.find(function(i) { return i.id === currentItem.id; });
    if (latest) {
      currentItem = Object.assign({}, currentItem, latest);
      savePriceSnapshot(currentItem.id, currentItem);
      var cached = getCache();
      if (cached && cached._allItems) {
        var cacheIdx = cached._allItems.findIndex(function(i) { return i.id === currentItem.id; });
        if (cacheIdx >= 0) {
          cached._allItems[cacheIdx] = currentItem;
          setCache(cached);
        }
      }
      updateDetailPrices(currentItem);
    }
  } catch (err) {}
}

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

// ===== 收藏按钮 =====
function toggleCurrentFavorite() {
  if (!currentItem || !currentItem.id) return;
  var isNowFav = toggleFavorite(currentItem);
  var btn = document.getElementById('detailFavBtn');
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
  var resultsEl = document.getElementById('searchResults');
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
  var input = document.getElementById('searchInput');
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
    try {
      var prefetched = window.__prefetch || {};
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
  var content = document.getElementById('listContent');
  content.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><div class="loading-text">刷新中...</div></div>';
  document.getElementById('listStats').innerHTML = '';

  try {
    var refreshFailed = false;
    if (currentCategory.key === 'fav') {
      var favs = getFavorites();
      var cached = getCache();
      var allItems = cached && cached._allItems ? cached._allItems : [];
      listItems = favs.map(function(fav) {
        var full = allItems.find(function(i) { return i.id === fav.id; });
        return full ? Object.assign({}, fav, full) : fav;
      });
      renderList(listItems, false);
    } else if (isAllMode) {
      var backupCache = getCache();
      clearCache();
      try {
        var oldItems2 = (backupCache && backupCache._allItems) || [];
        var metaMap2 = {};
        oldItems2.forEach(function(item) {
          if (item.name && item.name.indexOf('#') !== 0) {
            metaMap2[canonicalId(item)] = { name: item.name, pic: item.pic, _category: item._category, grade: item.grade, ShopSellType: item.ShopSellType, desc: item.desc, secondClassCN: item.secondClassCN, length: item.length, width: item.width, weight: item.weight, objectID: item.objectID, tid: item.tid };
          }
        });
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
      var items = await fetchCategoryAll(currentCategory.key);
      listItems = items;
      var cached = getCache();
      if (cached && cached._allItems) {
        var otherItems = cached._allItems.filter(function(i) { return i._category !== currentCategory.key; });
        cached._allItems = [].concat(otherItems).concat(items);
        setCache(cached);
      }
      renderList(items, false);
    }
    if (!refreshFailed) {
      markRefreshed();
      toast('刷新完成');
    }
    if (document.getElementById('page-home').classList.contains('active')) {
      checkFavoritePriceChanges();
      renderHomeTopMover();
      renderHomeMovers(false);
    }
  } catch (err) {
    console.error('刷新失败:', err);
    content.innerHTML = '<div class="error-container"><div class="error-text">刷新失败，请检查网络后重试</div><button class="retry-btn" onclick="refreshCurrentList()">重新刷新</button></div>';
  }
}

async function refreshCurrentItem() {
  if (!checkRefreshCooldown()) return;
  if (!currentItem) return;
  var content = document.getElementById('detailContent');
  content.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><div class="loading-text">正在向API请求最新数据...</div></div>';

  try {
    var res = await apiRequest('item_price_all', null, 3, true);
    var cleanData = sanitizeItemArray(res.data, 'price');
    var latest = cleanData.find(function(i) { return i.id === currentItem.id; });
    if (latest) {
      currentItem = Object.assign({}, currentItem, latest);
      savePriceSnapshot(currentItem.id, currentItem);
      var idx = listItems.findIndex(function(i) { return i.id === currentItem.id; });
      if (idx >= 0) listItems[idx] = currentItem;
      var cached = getCache();
      if (cached && cached._allItems) {
        var cacheIdx = cached._allItems.findIndex(function(i) { return i.id === currentItem.id; });
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

  var oldCache = getCache();
  var oldItems = (oldCache && oldCache._allItems) || [];
  var metaMap = {};
  oldItems.forEach(function(item) {
    if (item.name && item.name.indexOf('#') !== 0) {
      metaMap[canonicalId(item)] = { name: item.name, pic: item.pic, _category: item._category, grade: item.grade, ShopSellType: item.ShopSellType, desc: item.desc, secondClassCN: item.secondClassCN, length: item.length, width: item.width, weight: item.weight, objectID: item.objectID, tid: item.tid };
    }
  });
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
    var priceRes = await apiRequest('item_price_all', null, 3, true);
    var cleanPrices = sanitizeItemArray(priceRes && priceRes.data, 'price');
    if (cleanPrices.length === 0) {
      throw new Error('API 返回空数据');
    }

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
      renderHomeMovers(false);
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
