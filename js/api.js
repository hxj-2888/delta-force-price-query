// ===== 网络请求层（fetch 封装、API 代理请求） =====

// Cloudflare Worker 后端（API 代理 + 价格历史记录）
// 优先读取 index.html 中定义的全局常量，避免域名散落多处
var WORKER_BASE = (typeof window !== 'undefined' && window.__WORKER_BASE) || 'https://delta-force-api.hexiangjie694.workers.dev';
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

async function fetchCategoryAll(catKey) {
  var t0 = Date.now();
  var PAGE_LIMIT = 5000;
  var res1;
  try {
    res1 = await apiRequest('item_list', { types: catKey, p: 1, limit: PAGE_LIMIT });
  } catch (e) {
    console.error('[fetchCategoryAll] 首页请求失败 (' + catKey + '):', e.message);
    return [];
  }
  var allItems = (res1.data || []).map(function(item) { return Object.assign({}, item, { _category: catKey }); });
  var totalCount = res1.count || 0;
  // 修复：第一页返回0条时（API异常），不按0计算perPage，避免除零或极大翻页数
  var perPage = allItems.length > 0 ? allItems.length : PAGE_LIMIT;
  var totalPages = totalCount > 0 ? Math.ceil(totalCount / perPage) : 1;
  // 安全兜底：如果首页恰好返回了 limit 数量，count 可能不可靠，至少再翻一页
  if (totalPages <= 1 && allItems.length >= PAGE_LIMIT) {
    totalPages = 2;
  }

  if (allItems.length >= totalCount || totalPages <= 1) {
    if (typeof setApiDuration === 'function') setApiDuration(Date.now() - t0);
    return allItems;
  }

  var remainingPages = [];
  for (var p = 2; p <= totalPages; p++) { remainingPages.push(p); }

  // 逐页翻取直到返回空或不足一页（替代一次性计算 totalPages，防止 count 不准确）
  var pageIdx = 0;
  while (pageIdx < remainingPages.length) {
    var batchPages = remainingPages.slice(pageIdx, pageIdx + 8);
    var pageResults = await batchAsync(batchPages.map(function(page) {
      return function() {
        return apiRequest('item_list', { types: catKey, p: page, limit: PAGE_LIMIT })
          .then(function(r) { return (r.data || []).map(function(item) { return Object.assign({}, item, { _category: catKey }); }); })
          .catch(function() { return []; });
      };
    }), 8);
    var gotMore = false;
    pageResults.forEach(function(items) {
      if (items.length > 0) {
        allItems = allItems.concat(items);
        gotMore = true;
      }
    });
    pageIdx += batchPages.length;
    // 如果某一整批都没返回数据，说明已到末尾，停止翻页
    if (!gotMore) break;
    // 如果最后一批不足一整页，继续翻一页确认是否还有
    if (batchPages.length < 8 && gotMore && pageIdx < remainingPages.length) {
      // 扩展 remainingPages，动态追加新页码
      var nextP = remainingPages[remainingPages.length - 1] + 1;
      // 最多再翻 20 页（安全上限，防止无限循环）
      for (var extra = 0; extra < 20 && pageIdx < 200; extra++) {
        remainingPages.push(nextP + extra);
      }
    }
    // 安全上限：最多翻 200 页
    if (pageIdx >= 200) break;
  }
  if (typeof setApiDuration === 'function') setApiDuration(Date.now() - t0);
  return allItems;
}

// 并发限制：同时最多 N 个请求
async function batchAsync(tasks, concurrency) {
  if (concurrency === undefined || concurrency === null) concurrency = 5;
  const results = [];
  const queue = [...tasks];
  async function worker() {
    while (queue.length) {
      const task = queue.shift();
      if (task) results.push(await task());
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, function() { return worker(); }));
  return results;
}

async function loadAllItems(forceRefresh) {
  if (!forceRefresh) {
    var cached = getCache();
    if (cached && cached._allItems && cached._allItems.length > 0) {
      return cached._allItems;
    }
  }

  // forceRefresh 只跳过 localStorage 缓存，prefetch 数据仍然有效（避免浪费已拉取的数据）
  var prefetched = window.__prefetch || {};
  var taskFns = CATEGORIES.map(function(cat) {
    var p = prefetched[cat.key];
    if (p) {
      return function() {
        return p.then(function(res) {
          if (res && res.code === 0 && res.data && res.data.length > 0) {
            var items = res.data.map(function(item) { return Object.assign({}, item, { _category: cat.key }); });
            var total = res.count || 0;
            if (res._complete || items.length >= total) {
              return items;
            }
          }
          return fetchCategoryAll(cat.key).catch(function(e) {
            console.error('加载' + cat.name + '失败:', e.message);
            return [];
          });
        }).catch(function() {
          return fetchCategoryAll(cat.key).catch(function(e) {
            console.error('加载' + cat.name + '失败:', e.message);
            return [];
          });
        });
      };
    }
    return function() {
      return fetchCategoryAll(cat.key).catch(function(e) {
        console.error('加载' + cat.name + '失败:', e.message);
        return [];
      });
    };
  });
  var results = await batchAsync(taskFns, 8);
  var allItems = Array.prototype.concat.apply([], results);

  setCache({ _allItems: allItems });

  setTimeout(function() {
    if (typeof updateCategoryIcons === 'function') updateCategoryIcons(allItems);
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

// ===== Cloudflare Worker 历史数据 =====

/**
 * 从 Cloudflare Worker D1 数据库获取物品的云端价格历史快照
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
