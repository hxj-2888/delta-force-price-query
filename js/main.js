// ===== 入口文件（初始化路由、绑定全局事件） =====

// ===== 状态变量 =====
const pages = {};
['home', 'list', 'detail', 'search', 'price', 'favtab'].forEach(function(id) {
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
var _priceLoading = false;

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
    if (prev === 'list') {
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
  pageStack.push(name);
  showPage(name);
  saveBrowseState();
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

// ===== Tab 切换 =====
function switchTab(tabName) {
  document.querySelectorAll('.bottom-nav .tab').forEach(function(t) { t.classList.remove('active'); });
  var tab = document.querySelector('.bottom-nav .tab[data-tab="' + tabName + '"]');
  if (tab) tab.classList.add('active');
  Object.values(pages).forEach(function(p) { p.classList.remove('active'); });
  const target = document.getElementById('page-' + tabName);
  if (target) {
    target.classList.add('active');
    pageStack = [tabName];
    if (tabName === 'home') { checkFavoritePriceChanges(); renderHomeTopMover(); }
    if (tabName === 'price') {
      var _c = getCache();
      if (_c && _c._allItems && _c._allItems.length > 0) {
        mergeSWPriceHistory().then(function() { recordAllItemsPrices(_c._allItems); });
      }
      renderPriceMovers();
    }
    if (tabName === 'favtab') renderFavTab();
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

  const content = document.getElementById('listContent');
  content.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><div class="loading-text">从API加载所有' + name + '...</div></div>';
  document.getElementById('listStats').innerHTML = '';

  try {
    const cached = getCache();
    let items;
    var fromCache = false;
    if (cached && cached._allItems) {
      items = cached._allItems.filter(function(i) { return i._category === key; });
      fromCache = items && items.length > 0;
    }
    if (!fromCache) {
      items = await fetchCategoryAll(key);
      // 修复：将新拉取的分类数据合并回缓存，保持全量缓存完整性
      if (items && items.length > 0) {
        const c2 = getCache();
        if (c2 && c2._allItems) {
          const otherItems = c2._allItems.filter(function(i) { return i._category !== key; });
          c2._allItems = otherItems.concat(items);
          setCache(c2);
        }
      }
    }
    if (currentCategory.key !== key) return;
    listItems = items;
    renderList(items, false);

    // 后台静默补拉：即使缓存有数据，也异步请求 API 全量，防止旧缓存数据不全
    if (fromCache) {
      fetchCategoryAll(key).then(function(freshItems) {
        if (currentCategory.key !== key) return;
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
    if (currentCategory.key !== key) return;
    console.error('加载失败:', err);
    // 使用 JSON.stringify 安全转义 JS 字符串（防止 key/name 含引号导致 onclick 断裂）
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
  try {
    var cached = getCache();
    if (cached && cached._allItems && cached._allItems.length > 0) {
      items = cached._allItems;
    }
  } catch(e) { console.error('openAllItems getCache 失败:', e); }

  try {
    if (!items || items.length === 0) {
      items = await loadAllItems();
    }
  } catch(e) {
    console.error('loadAllItems error:', e);
  }

  try {
    if (!items || items.length === 0) {
      var allResults = await Promise.all(CATEGORIES.map(function(cat) {
        return fetchCategoryAll(cat.key).catch(function() { return []; });
      }));
      items = Array.prototype.concat.apply([], allResults);
      if (items && items.length > 0) {
        setCache({ _allItems: items });
      }
    }
  } catch(e) {
    console.error('fetchCategoryAll error:', e);
  }

  if (!items || items.length === 0) {
    content.innerHTML = '<div class="error-container"><div class="error-text">暂无数据，请检查网络后刷新重试</div><button class="retry-btn" onclick="openAllItems()">重试</button></div>';
    return;
  }
  if (currentCategory.key !== 'all') return;
  listItems = items;
  renderList(items, true);
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
    const latest = (res.data || []).find(function(i) { return i.id == currentItem.id || i.tid == currentItem.tid; });
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
      renderDetail(currentItem);
    }
  } catch (err) {}
}

function openDetailFromRecent(itemId) {
  const item = findItemAnywhere(itemId);
  if (!item) {
    toast('该物品数据已过期，请刷新后重试');
    return;
  }
  listItems = [item];
  currentItem = item;
  currentCategory = { key: item._category, name: CATEGORY_MAP[item._category] || '物品' };
  openDetail(itemId);
}

function openDetailFromFavorite(itemId) {
  const item = findItemAnywhere(itemId);
  if (!item) {
    toast('该物品数据已过期，请刷新后重试');
    return;
  }
  listItems = [item];
  currentItem = item;
  currentCategory = { key: item._category, name: CATEGORY_MAP[item._category] || '物品' };
  openDetail(itemId);
}

function openDetailFromSearch(itemId) {
  const item = findItemAnywhere(itemId);
  if (!item) {
    toast('未找到该物品数据');
    return;
  }
  listItems = [item];
  currentItem = item;
  currentCategory = { key: item._category, name: CATEGORY_MAP[item._category] || '物品' };
  openDetail(itemId);
}

function openPriceMover(itemId) {
  var item = findItemAnywhere(itemId);
  if (!item) {
    toast('未找到该物品');
    return;
  }
  listItems = [item];
  currentItem = item;
  currentCategory = { key: item._category, name: CATEGORY_MAP[item._category] || '物品' };
  openDetail(itemId);
}

function openTopMover(itemId) {
  if (itemId) {
    var item = findItemAnywhere(itemId);
    if (item) {
      listItems = [item];
      currentItem = item;
      currentCategory = { key: item._category, name: CATEGORY_MAP[item._category] || '物品' };
      openDetail(itemId);
    }
  }
}

// ===== 价格异动筛选 =====
function setPriceRange(range) {
  priceRangeFilter = range;
  renderPriceMovers();
}

function setPriceDirection(dir) {
  priceDirection = dir;
  var btnG = document.getElementById('btnGainers');
  var btnL = document.getElementById('btnLosers');
  if (btnG) btnG.classList.toggle('active', dir === 'up');
  if (btnL) btnL.classList.toggle('active', dir === 'down');
  renderPriceMovers();
}

function setPricePeriod(period) {
  pricePeriod = period;
  ['bl','day_3_bl','day_7_bl','local_1d','local_3d','local_7d'].forEach(function(p) {
    var el = document.getElementById('period-' + p);
    if (el) el.classList.toggle('active', p === period);
  });
  renderPriceMovers();
}

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
    try {
      var prefetched = window.__prefetch || {};
      var catResults = await Promise.all(CATEGORIES.map(function(cat) {
        var p = prefetched[cat.key];
        if (!p) return Promise.resolve([]);
        return p.then(function(r) {
          if (r && r.data) return r.data.map(function(item) { return Object.assign({}, item, { _category: cat.key }); });
          return [];
        }).catch(function() { return []; });
      }));
      allItems = Array.prototype.concat.apply([], catResults);
    } catch(e) { allItems = []; }
    if (allItems.length === 0) {
      document.getElementById('searchResults').innerHTML = '<div class="error-container"><div class="error-text">数据加载中，请稍后重试</div><button class="retry-btn" onclick="doSearch(document.getElementById(\'searchInput\').value)">重试</button></div>';
      return;
    }
  }

  var results = allItems.filter(function(item) { return item.name && item.name.toLowerCase().indexOf(kw) !== -1; });
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
        var items = await loadAllItems(true);
        listItems = items;
        renderList(items, true);
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
    const latest = (res.data || []).find(function(i) { return i.id == currentItem.id || i.tid == currentItem.tid; });
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
  clearCache();
  listItems = [];
  currentItem = null;

  toast('正在刷新全部数据...');
  try {
    await loadAllItems(true);
    markRefreshed();
    if (prevPage === 'home') {
      const cached2 = getCache();
      if (cached2 && cached2._allItems) updateCategoryIcons(cached2._allItems);
      toast('全部数据已刷新！');
    } else if (prevPage === 'list') {
      if (isAllMode) {
        const cached = getCache();
        listItems = (cached && cached._allItems) ? cached._allItems : [];
        renderList(listItems, true);
      } else if (currentCategory) {
        const cached = getCache();
        listItems = (cached && cached._allItems) ? cached._allItems.filter(function(i) { return i._category === currentCategory.key; }) : [];
        renderList(listItems, false);
      }
      toast('全部数据已刷新！');
    } else if (prevPage === 'detail' && prevItemId) {
      const cached = getCache();
      currentItem = cached && cached._allItems ? cached._allItems.find(function(i) { return i.id === prevItemId; }) : null;
      if (currentItem) renderDetail(currentItem);
      toast('全部数据已刷新！');
    }
  } catch (err) {
    console.error('刷新全部数据失败:', err);
    toast('刷新失败，请检查网络');
  }
}

async function refreshPriceMovers() {
  if (!checkRefreshCooldown()) return;
  try {
    var _c = getCache();
    if (_c && _c._allItems && _c._allItems.length > 0) {
      await mergeSWPriceHistory();
      recordAllItemsPrices(_c._allItems);
    }
    var res = await apiRequest('item_price_all', null, 3, true);
    if (res && res.data && res.data.length > 0) {
      var cached = getCache();
      if (cached && cached._allItems) {
        var priceMap = {};
        res.data.forEach(function(p) { priceMap[p.id || p.tid] = p; });
        cached._allItems = cached._allItems.map(function(item) {
          var latest = priceMap[item.id] || priceMap[item.tid];
          if (latest) {
            item.price = latest.price;
            item.bl = latest.bl;
            item.day_3_bl = latest.day_3_bl;
            item.day_3_price = latest.day_3_price;
            item.day_7_bl = latest.day_7_bl;
            item.day_7_price = latest.day_7_price;
            item.day_30_bl = latest.day_30_bl;
            item.day_30_price = latest.day_30_price;
          }
          return item;
        });
        setCache(cached);
      }
    }
    markRefreshed();
    renderPriceMovers();
    toast('价格异动已刷新');
  } catch(err) {
    console.error('刷新价格异动失败:', err);
    toast('刷新失败，请检查网络');
  }
}

function refreshFavTab() {
  if (!checkRefreshCooldown()) return;
  markRefreshed();
  const cached = getCache();
  if (!cached || !cached._allItems) {
    loadAllItems().then(function() {
      if (pageStack[pageStack.length - 1] !== 'favtab') return;
      renderFavTab();
    });
  } else {
    mergeSWPriceHistory().then(function() { recordAllItemsPrices(cached._allItems); });
    renderFavTab();
  }
  toast('已刷新');
}

// ===== 自动刷新定时器 =====
var homeRefreshTimer = null;
var lastKnownChangeCount = 0;

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
    if (alertEl && alertEl.classList.contains('show') && !hadAlert) {
      toast('🔔 收藏物品价格发生变动，点击查看', 3000);
    }
    if (alertEl && alertEl.classList.contains('show')) {
      var items = alertEl.querySelectorAll('.price-alert-item');
      lastKnownChangeCount = items.length;
    } else {
      lastKnownChangeCount = 0;
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
  homeRefreshTimer = setInterval(doAutoRefresh, 120000);
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
    startHomeAutoRefresh();
    startGlobalDailyRecord();
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

// ===== 预加载 =====
(async function preload() {
  var cached = getCache();
  var loadingScreen = document.getElementById('loadingScreen');
  var loadingLogo = document.getElementById('loadingLogo');
  var loadingGlow = document.getElementById('loadingGlow');
  var loadingProgressBar = document.getElementById('loadingProgressBar');
  var loadingStatus = document.getElementById('loadingStatus');
  var totalCats = CATEGORIES.length;
  var loadStart = Date.now();
  var minDisplayMs = 400;

  function setProgress(ratio, statusText) {
    var pct = Math.round(ratio * 100);
    loadingProgressBar.style.width = pct + '%';
    loadingLogo.style.filter = 'blur(' + ((20 * (1 - ratio)).toFixed(1)) + 'px)';
    loadingGlow.style.opacity = ratio.toFixed(2);
    if (statusText) loadingStatus.textContent = statusText;
  }

  function hideLoading() {
    setProgress(1, '数据就绪');
    setTimeout(function() {
      loadingScreen.classList.add('fade-out');
      setTimeout(function() { loadingScreen.classList.add('removed'); }, 400);
    }, 300);
  }

  function hideLoadingFast() {
    loadingScreen.classList.add('fade-out');
    loadingScreen.classList.add('removed');
  }

  if (cached && cached._allItems && cached._allItems.length > 0) {
    updateCategoryIcons(cached._allItems);
    mergeSWPriceHistory().then(function() { recordAllItemsPrices(cached._allItems); });
    // 有缓存时也展示加载动画，让 Logo 模糊→清晰有过程
    var steps = [0, 0.15, 0.3, 0.5, 0.7, 0.85, 0.95, 1];
    steps.forEach(function(ratio, i) {
      setTimeout(function() {
        setProgress(ratio, ratio < 0.3 ? '正在准备...' : ratio < 0.7 ? '加载缓存数据' : ratio < 1 ? '即将就绪' : '数据就绪');
        if (ratio === 1) {
          setTimeout(function() {
            loadingScreen.classList.add('fade-out');
            setTimeout(function() { loadingScreen.classList.add('removed'); }, 400);
          }, 300);
        }
      }, i * 180);
    });
    loadAllItems(true).catch(function(){});
    registerPeriodicSync();
    startHomeAutoRefresh();
    startGlobalDailyRecord();
    return;
  }

  setProgress(0.05, '正在连接...');

  var prefetched = window.__prefetch || {};
  var completedCats = 0;

  function onCatDone(catName, catKey) {
    completedCats++;
    setProgress(Math.min(0.9, completedCats / totalCats), '已加载 ' + catName + ' (' + completedCats + '/' + totalCats + ')');
    if (catKey && prefetched[catKey] && prefetched[catKey]._resolvedData) {
      updateCategoryIcons(prefetched[catKey]._resolvedData);
    }
    renderHomeTopMover();
  }

  CATEGORIES.forEach(function(cat) {
    var p = prefetched[cat.key];
    if (p) {
      p.then(function() { onCatDone(cat.name, cat.key); }).catch(function() { onCatDone(cat.name); });
    }
  });

  try {
    await loadAllItems();
  } catch (err) {
    console.error('预加载失败:', err.message);
  }

  setProgress(0.96, '数据就绪');

  var freshCache = getCache();
  if (freshCache && freshCache._allItems) {
    updateCategoryIcons(freshCache._allItems);
    checkFavoritePriceChanges();
    renderHomeTopMover();
  }

  // 恢复上次浏览状态
  var savedState = restoreBrowseState();
  if (savedState && savedState.page && savedState.page !== 'home') {
    switchTab(savedState.page);
  }

  var elapsed = Date.now() - loadStart;
  setTimeout(function() { hideLoading(); }, Math.max(0, minDisplayMs - elapsed));
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
