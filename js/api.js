// ===== api.js — 网络请求层 =====
// 功能清单: API代理请求(带重试+超时) | 请求去重(同端点并发合并) | 分类全量拉取(fetchCategoryAll)
// 预取数据收集(loadAllItemsQuick) | 首批物品获取(getFirstBatchItems) | 后台静默加载(warmAllDataBackground)
// 预取完成等待(loadAllItemsBackground) | 全局统计(getGlobalStats) | 价格历史API(fetchItemHistory)
// 数据净化(sanitizeItemArray/canonicalId/clampPrice) | 并发控制(batchAsync)
// 依赖: config.js(CATEGORIES) store/cache.js(setCache/getCache/setApiDuration) store/search.js(buildSearchIndex)
// 被依赖: render/ app/

var WORKER_BASE = (typeof window !== 'undefined' && window.__WORKER_BASE) || '';
var PROXY_URL = WORKER_BASE + '/api/proxy';

var _isWeChat = false;
if (typeof navigator !== 'undefined' && navigator.userAgent) {
  _isWeChat = /MicroMessenger/i.test(navigator.userAgent);
}

var _apiPending = {};
var _apiTtlCache = {};   // item_price_all 5 分钟内存缓存（v3 修复: 详情页/收藏刷新不再每次都打上游）
var API_TTL_MS = 5 * 60 * 1000;

function getApiCacheKey(endpoint, params) {
  return endpoint + '?' + JSON.stringify(params);
}

async function apiRequest(endpoint, params, retries, noCache) {
  if (retries === undefined || retries === null) retries = 3;
  params = params || {};
  if (_isWeChat) { params._wc = Math.floor(Date.now() / 60000); }
  var cacheKey = getApiCacheKey(endpoint, params);
  var lastErr;

  // ★ v3: item_price_all 5 分钟 TTL 缓存（刷新类操作传 noCache=true 绕过）
  if (!noCache && endpoint === 'item_price_all') {
    var ttlHit = _apiTtlCache[endpoint];
    if (ttlHit && Date.now() - ttlHit.ts < API_TTL_MS) return ttlHit.data;
  }

  var canDedup = endpoint === 'item_price_all' || endpoint === 'item_list';
  if (!noCache && canDedup && _apiPending[cacheKey]) {
    try { return await _apiPending[cacheKey]; } catch(e) { /* fall through to fresh request */ }
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
            delete _apiPending[cacheKey];
            if (!noCache && endpoint === 'item_price_all') {
              _apiTtlCache[endpoint] = { ts: Date.now(), data: data };
            }
            resolve(data);
          })
          .catch(function(err) {
            clearTimeout(timeoutId);
            if (canDedup) { delete _apiPending[cacheKey]; }
            reject(err);
          });

        if (canDedup && attemptN === 0) {
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

async function fetchCategoryAll(catKey) {
  var t0 = Date.now();
  try {
    var res1 = await apiRequest('item_list', { types: catKey, p: 1 });
    var allItems = sanitizeItemArray(res1.data, 'list').map(function(item) {
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

    var remainingPages = [];
    for (var p = 2; p <= totalPages; p++) remainingPages.push(p);
    var pageResults = await batchAsync(remainingPages.map(function(page) {
      return function() {
        return apiRequest('item_list', { types: catKey, p: page })
          .then(function(r) { return sanitizeItemArray(r.data, 'list').map(function(item) { item._category = catKey; return item; }); })
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

async function loadAllItemsQuick() {
  var prefetched = window.__prefetch || {};
  for (var i = 0; i < CATEGORIES.length; i++) {
    var p = prefetched[CATEGORIES[i].key];
    if (p && p._quick) {
      try {
        await p._quick;
        break;
      } catch(e) { /* continue */ }
    }
  }
  var allItems = [];
  CATEGORIES.forEach(function(cat) {
    var p = prefetched[cat.key];
    if (p && p._resolvedData && p._resolvedData.length > 0) {
      allItems = allItems.concat(p._resolvedData);
    }
  });
  if (allItems.length === 0) {
    try {
      var fallbackAll = [];
      var catResults = await Promise.all(CATEGORIES.map(function(cat) {
        return apiRequest('item_list', { types: cat.key, p: 1 }).then(function(r) {
          return sanitizeItemArray(r.data, 'list').map(function(item) {
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

async function getFirstBatchItems(targetCount) {
  if (targetCount === undefined || targetCount === null) targetCount = 50;
  var prefetched = window.__prefetch || {};

  if (prefetched._allPage1Ready) {
    try {
      var sortedItems = await prefetched._allPage1Ready;
      if (sortedItems && sortedItems.length > 0) {
        return sortedItems.slice(0, targetCount);
      }
    } catch(e) { /* 降级 */ }
  }

  var all = [];
  try {
    all = await loadAllItemsQuick();
  } catch(e) { all = []; }

  function score(item) {
    var bl = Math.abs(item.bl || item.day_3_bl || item.day_7_bl || 0);
    var p = item.price || 0;
    var pf = p >= 1000000 ? 4 : p >= 100000 ? 3 : p >= 10000 ? 2 : 1;
    return bl * pf;
  }
  all.sort(function(a, b) { return score(b) - score(a); });
  return all.slice(0, targetCount);
}

function warmAllDataBackground(onProgress) {
  var prefetched = window.__prefetch || {};
  var catsLoaded = 0;
  var totalCats = CATEGORIES.length;

  return Promise.all(CATEGORIES.map(function(cat) {
    var p = prefetched[cat.key];
    if (p && p._quick) {
      return p._quick.then(function() {
        return new Promise(function(resolve) {
          if (p._complete) { catsLoaded++; if (onProgress) onProgress(catsLoaded, totalCats); resolve(true); return; }
          var checkTimer;
          var timeout = setTimeout(function() {
            clearInterval(checkTimer);
            catsLoaded++;
            if (onProgress) onProgress(catsLoaded, totalCats);
            resolve(false);
          }, 15000);
          checkTimer = setInterval(function() {
            if (p._complete) {
              clearTimeout(timeout);
              clearInterval(checkTimer);
              catsLoaded++;
              if (onProgress) onProgress(catsLoaded, totalCats);
              resolve(true);
            }
          }, 200);
        });
      }).catch(function() { catsLoaded++; if (onProgress) onProgress(catsLoaded, totalCats); return false; });
    }
    return fetchCategoryAll(cat.key).then(function() {
      catsLoaded++;
      if (onProgress) onProgress(catsLoaded, totalCats);
      return true;
    }).catch(function() {
      catsLoaded++;
      if (onProgress) onProgress(catsLoaded, totalCats);
      return false;
    });
  }));
}

function isPrefetchComplete() {
  var prefetched = window.__prefetch || {};
  for (var i = 0; i < CATEGORIES.length; i++) {
    var p = prefetched[CATEGORIES[i].key];
    if (!p || !p._complete) return false;
  }
  return true;
}

function loadAllItemsBackground(currentItems) {
  var prefetched = window.__prefetch || {};

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

function getCategoryTotalCount(catKey) {
  var prefetched = window.__prefetch || {};
  var p = prefetched[catKey];
  if (p && typeof p._totalCount === 'number' && p._totalCount > 0) return p._totalCount;
  return 0;
}

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

// ===== 历史数据 API =====
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

// ===== 数据净化层 =====
var _idMismatchWarned = {};
function _warnIdMismatch(rawItem) {
  if (rawItem.id && rawItem.tid && String(rawItem.id) !== String(rawItem.tid)) {
    var key = rawItem.id + '|' + rawItem.tid;
    if (!_idMismatchWarned[key]) {
      _idMismatchWarned[key] = true;
      console.warn('[canonicalId] id/tid 不一致:',
        { id: rawItem.id, tid: rawItem.tid, name: rawItem.name || '(未知)' },
        '已使用 id=' + canonicalId(rawItem));
    }
  }
}

function canonicalId(rawItem) {
  var id = Number(rawItem.id) || Number(rawItem.tid) || 0;
  return id || 0;
}

function safeNum(v) {
  var n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function clampPrice(v) {
  var n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function sanitizePriceItem(p) {
  _warnIdMismatch(p);
  return {
    id: canonicalId(p),
    tid: p.tid != null ? Number(p.tid) : null,
    price: clampPrice(p.price),
    bl: safeNum(p.bl),
    day_3_bl: safeNum(p.day_3_bl),
    day_3_price: clampPrice(p.day_3_price),
    day_7_bl: safeNum(p.day_7_bl),
    day_7_price: clampPrice(p.day_7_price),
    day_30_bl: safeNum(p.day_30_bl),
    day_30_price: clampPrice(p.day_30_price),
    price_start: clampPrice(p.price_start || p.priceStart),
    is_get_time: p.is_get_time
  };
}

function sanitizeListItem(item) {
  _warnIdMismatch(item);
  return {
    id: canonicalId(item),
    tid: item.tid != null ? Number(item.tid) : null,
    name: item.name || '',
    pic: item.pic || '',
    grade: safeNum(item.grade),
    ShopSellType: item.ShopSellType || '',
    desc: item.desc || '',
    secondClassCN: item.secondClassCN || '',
    length: safeNum(item.length),
    width: safeNum(item.width),
    weight: safeNum(item.weight || item.Weight),
    objectID: item.objectID || '',
    price: clampPrice(item.price),
    bl: safeNum(item.bl),
    day_3_bl: safeNum(item.day_3_bl),
    day_3_price: clampPrice(item.day_3_price),
    day_7_bl: safeNum(item.day_7_bl),
    day_7_price: clampPrice(item.day_7_price),
    day_30_bl: safeNum(item.day_30_bl),
    day_30_price: clampPrice(item.day_30_price),
    price_start: clampPrice(item.price_start || item.priceStart),
    is_get_time: item.is_get_time
  };
}

function sanitizeItemArray(data, source) {
  if (!Array.isArray(data)) return [];
  var sanitizer = source === 'price' ? sanitizePriceItem : sanitizeListItem;
  return data
    .filter(function(item) { return item && (item.id || item.tid); })
    .map(sanitizer);
}
