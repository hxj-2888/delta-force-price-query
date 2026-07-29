// ===== 网络请求层（fetch 封装、API 代理请求） =====

// 后端 后端（API 代理 + 价格历史记录）
// 优先读取 index.html 中定义的全局常量，避免域名散落多处
var WORKER_BASE = (typeof window !== 'undefined' && window.__WORKER_BASE) || '';
var PROXY_URL = WORKER_BASE + '/api/proxy';

// 内存缓存 + 请求去重
var _apiMemCache = {};
var _apiMemCacheKeys = [];  // LRU 顺序，最近使用的在末尾
var _MAX_MEM_CACHE = 10;    // 最多缓存 10 个端点响应
var _apiPending = {};

function getApiCacheKey(endpoint, params) {
  return endpoint + '?' + JSON.stringify(params);
}

function getApiFromCache(key, ttl) {
  var entry = _apiMemCache[key];
  if (entry && Date.now() - entry.time < ttl) {
    // LRU: 命中时移到末尾
    var idx = _apiMemCacheKeys.indexOf(key);
    if (idx >= 0) { _apiMemCacheKeys.splice(idx, 1); _apiMemCacheKeys.push(key); }
    return entry.data;
  }
  return null;
}

function setApiCache(key, data) {
  // LRU 淘汰：超过最大容量时移除最旧的条目
  var idx = _apiMemCacheKeys.indexOf(key);
  if (idx >= 0) { _apiMemCacheKeys.splice(idx, 1); }
  _apiMemCacheKeys.push(key);
  if (_apiMemCacheKeys.length > _MAX_MEM_CACHE) {
    var evictKey = _apiMemCacheKeys.shift();
    delete _apiMemCache[evictKey];
  }
  _apiMemCache[key] = { data: data, time: Date.now() };
}

async function apiRequest(endpoint, params, retries, noCache) {
  if (retries === undefined || retries === null) retries = 3;
  var cacheKey = getApiCacheKey(endpoint, params || {});
  var lastErr;

  if (!noCache) {
    var _ttl = endpoint === 'item_price_all' ? 5 * 60 * 1000
             : endpoint === 'item_list'       ? 2 * 60 * 1000
             : 0;
    if (_ttl > 0) {
      var cached = getApiFromCache(cacheKey, _ttl);
      if (cached) return cached;
      if (_apiPending[cacheKey]) {
        try { return await _apiPending[cacheKey]; } catch(e) { /* fall through to fresh request */ }
      }
    }
  }

  for (var attempt = 0; attempt <= retries; attempt++) {
    var result = await (function(attemptN) {
      return new Promise(function(resolve, reject) {
        var controller = new AbortController();
        var timeoutId = setTimeout(function() { controller.abort(); }, 25000);

        var fetchPromise = fetch(PROXY_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: endpoint, params: params || {} }),
          signal: controller.signal
        })
          .then(function(resp) {
            clearTimeout(timeoutId);
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            return resp.json();
          })
          .then(function(data) {
            if (data.code !== 0) throw new Error(data.msg || 'API返回错误');
            if (endpoint === 'item_price_all' || endpoint === 'item_list') {
              setApiCache(cacheKey, data);
              delete _apiPending[cacheKey];
            }
            resolve(data);
          })
          .catch(function(err) {
            clearTimeout(timeoutId);
            if (endpoint === 'item_price_all' || endpoint === 'item_list') {
              delete _apiPending[cacheKey];
            }
            reject(err);
          });

        if ((endpoint === 'item_price_all' || endpoint === 'item_list') && attemptN === 0) {
          _apiPending[cacheKey] = new Promise(function(res, rej) {
            fetchPromise.then(res).catch(rej);
          });
        }
      });
    })(attempt).then(function(data) {
      return { ok: true, data: data };
    }).catch(function(err) {
      return { ok: false, err: err };
    });

    if (result.ok) return result.data;

    lastErr = result.err;
    if (attempt < retries) {
      var delay = result.err && result.err.name === 'AbortError'
        ? 1000 * Math.pow(2, attempt)
        : 600 * (attempt + 1);
      await new Promise(function(r) { setTimeout(r, delay); });
    }
  }
  throw lastErr;
}

// ★ 使用 item_list（含名称+图标）获取单分类全量数据，支持翻页
async function fetchCategoryAll(catKey) {
  var t0 = Date.now();
  try {
    // 首页
    var res1 = await apiRequest('item_list', { types: catKey, p: 1 });
    var allItems = (res1.data || []).map(function(item) {
      item._category = catKey;
      return item;
    });
    var totalCount = res1.count || 0;
    var perPage = allItems.length > 0 ? allItems.length : 10;
    var totalPages = totalCount > 0 ? Math.ceil(totalCount / perPage) : 1;

    if (allItems.length >= totalCount || totalPages <= 1) {
      if (typeof setApiDuration === 'function') setApiDuration(Date.now() - t0);
      return allItems;
    }

    // 剩余页并行加载
    var remainingPages = [];
    for (var p = 2; p <= totalPages; p++) remainingPages.push(p);
    var pageResults = await batchAsync(remainingPages.map(function(page) {
      return function() {
        return apiRequest('item_list', { types: catKey, p: page })
          .then(function(r) { return (r.data || []).map(function(item) { item._category = catKey; return item; }); })
          .catch(function() { return []; });
      };
    }), 8);
    pageResults.forEach(function(items) { allItems = allItems.concat(items); });
    if (typeof setApiDuration === 'function') setApiDuration(Date.now() - t0);
    return allItems;
  } catch (e) {
    console.error('[fetchCategoryAll] 请求失败 (' + catKey + '):', e.message);
    return [];
  }
}

// 并发控制工具
function batchAsync(tasks, concurrency) {
  if (concurrency === undefined || concurrency === null) concurrency = 5;
  var results = [];
  var queue = tasks.slice();
  return new Promise(function(resolve) {
    var running = 0;
    function next() {
      if (queue.length === 0 && running === 0) { resolve(results); return; }
      while (running < concurrency && queue.length > 0) {
        var task = queue.shift();
        running++;
        task().then(function(r) { results.push(r); }).catch(function() { results.push(null); }).finally(function() {
          running--;
          next();
        });
      }
    }
    next();
  });
}

// ★ 从预取数据收集全量物品（所有分类 _quick 同源，任意一个 resolve 即全量就绪）
async function loadAllItemsQuick() {
  var prefetched = window.__prefetch || {};
  // 取第一个可用的 _quick promise 等待（所有分类共享同一 API 响应）
  for (var i = 0; i < CATEGORIES.length; i++) {
    var p = prefetched[CATEGORIES[i].key];
    if (p && p._quick) {
      try {
        await p._quick;
        break;
      } catch(e) { /* continue */ }
    }
  }
  // 从所有分类收集已就绪数据
  var allItems = [];
  CATEGORIES.forEach(function(cat) {
    var p = prefetched[cat.key];
    if (p && p._resolvedData && p._resolvedData.length > 0) {
      allItems = allItems.concat(p._resolvedData);
    }
  });
  if (allItems.length === 0) {
    // fallback: 直接调 API（所有分类，首页）
    try {
      var fallbackAll = [];
      var catResults = await Promise.all(CATEGORIES.map(function(cat) {
        return apiRequest('item_list', { types: cat.key, p: 1 }).then(function(r) {
          return (r.data || []).map(function(item) {
            item._category = cat.key;
            return item;
          });
        }).catch(function() { return []; });
      }));
      catResults.forEach(function(items) { fallbackAll = fallbackAll.concat(items); });
      allItems = fallbackAll;
    } catch(e) { return []; }
  }
  return allItems;
}

/** 预取数据是否全部就绪 */
function isPrefetchComplete() {
  var prefetched = window.__prefetch || {};
  for (var i = 0; i < CATEGORIES.length; i++) {
    var p = prefetched[CATEGORIES[i].key];
    if (!p || !p._complete) return false;
  }
  return true;
}

/** 后台等待预取完成并更新缓存（复用 prefetch 翻页池，不重复请求） */
function loadAllItemsBackground(currentItems) {
  var prefetched = window.__prefetch || {};

  // 先等待所有 _quick promise（page1 全部到齐）
  return Promise.all(CATEGORIES.map(function(cat) {
    var p = prefetched[cat.key];
    if (p && p._quick) return p._quick.catch(function() { return null; });
    return Promise.resolve(null);
  })).then(function() {
    var allItems = [];
    CATEGORIES.forEach(function(cat) {
      var p = prefetched[cat.key];
      if (p && p._resolvedData) allItems = allItems.concat(p._resolvedData);
    });

    if (allItems.length === 0 && currentItems && currentItems.length > 0) {
      allItems = currentItems;
    }

    if (allItems.length > 0) {
      setCache({ _allItems: allItems });
      if (typeof buildSearchIndex === 'function') buildSearchIndex(allItems);
      if (typeof updateCategoryIcons === 'function') updateCategoryIcons(allItems);
      if (typeof checkFavoritePriceChanges === 'function') checkFavoritePriceChanges();
      if (typeof renderHomeTopMover === 'function') renderHomeTopMover();
    }

    // ★ 不再重复拉取！等待 prefetch 翻页池自然完成
    // prefetch 的 _globalLoadNext 已将全部后续页面入队，无需再用 fetchCategoryAll 发 POST
    return _waitForPagination(prefetched, 20000).then(function() {
      var fullItems = [];
      var seen = {};
      CATEGORIES.forEach(function(cat) {
        var p = prefetched[cat.key];
        if (p && p._resolvedData) {
          p._resolvedData.forEach(function(item) {
            if (!seen[item.id]) { seen[item.id] = true; fullItems.push(item); }
          });
        }
      });
      if (fullItems.length > allItems.length) {
        setCache({ _allItems: fullItems });
        if (typeof buildSearchIndex === 'function') buildSearchIndex(fullItems);
        if (typeof updateCategoryIcons === 'function') updateCategoryIcons(fullItems);
        if (typeof checkFavoritePriceChanges === 'function') checkFavoritePriceChanges();
        if (typeof renderHomeTopMover === 'function') renderHomeTopMover();
      }
      return fullItems.length > 0 ? fullItems : allItems;
    });
  }).catch(function() { return currentItems || []; });
}

// ★ 轮询等待 prefetch 翻页完成
function _waitForPagination(prefetched, timeout) {
  return new Promise(function(resolve) {
    if (typeof prefetched.isPaginationDone === 'function' && prefetched.isPaginationDone()) {
      resolve(); return;
    }
    var start = Date.now();
    var timer = setInterval(function() {
      var done = typeof prefetched.isPaginationDone === 'function' && prefetched.isPaginationDone();
      if (done || (Date.now() - start > timeout)) {
        clearInterval(timer);
        resolve();
      }
    }, 500);
  });
}

async function loadAllItems(forceRefresh) {
  if (!forceRefresh) {
    var cached = getCache();
    if (cached && cached._allItems && cached._allItems.length > 0) {
      return cached._allItems;
    }
  }

  var allItems = await loadAllItemsQuick();
  if (allItems.length > 0) {
    setCache({ _allItems: allItems });
    if (typeof buildSearchIndex === 'function') buildSearchIndex(allItems);
    if (typeof updateCategoryIcons === 'function') updateCategoryIcons(allItems);
  }

  setTimeout(function() {
    if (typeof mergeSWPriceHistory === 'function') {
      mergeSWPriceHistory().then(function() {
        if (typeof recordAllItemsPrices === 'function') recordAllItemsPrices(allItems);
      });
    }
    if (typeof checkFavoritePriceChanges === 'function') checkFavoritePriceChanges();
    if (typeof renderHomeTopMover === 'function') renderHomeTopMover();
  }, 0);
  return allItems;
}

/** 从预取数据中获取分类物品总数 */
function getCategoryTotalCount(catKey) {
  var prefetched = window.__prefetch || {};
  var p = prefetched[catKey];
  if (p && typeof p._totalCount === 'number' && p._totalCount > 0) return p._totalCount;
  return 0;
}

/** 获取所有分类的总体统计 */
function getGlobalStats() {
  var prefetched = window.__prefetch || {};
  var totalItems = 0;
  var catsComplete = 0;
  CATEGORIES.forEach(function(cat) {
    var p = prefetched[cat.key];
    if (p && p._hasPage1) {
      totalItems += (p._totalCount || 0);
      if (p._complete) catsComplete++;
    }
  });
  return {
    totalItems: totalItems,
    loadedItems: totalItems,
    catsWithData: catsComplete,
    catsComplete: catsComplete,
    totalCats: CATEGORIES.length,
    allComplete: catsComplete >= CATEGORIES.length
  };
}

// ===== 后端 历史数据 =====

/**
 * 从 后端 D1 数据库获取物品的云端价格历史快照
 * @param {number} itemId
 * @returns {Promise<object>} { code, data: { itemId, name, snapshots: [{d, p, b, s}] } }
 */
async function fetchItemHistory(itemId) {
  var MAX_RETRIES = 2;
  for (var attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      var resp = await fetch(WORKER_BASE + '/api/history/' + Number(itemId));
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      var data = await resp.json();
      return data;
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        await new Promise(function(r) { setTimeout(r, 500 * (attempt + 1)); });
      } else {
        console.error('[fetchItemHistory] 最终失败 (itemId=' + itemId + '):', err.message);
        return { code: -1, msg: err.message };
      }
    }
  }
}
