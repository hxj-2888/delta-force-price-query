// ===== 网络请求层（wx.request 封装） =====

const app = getApp();
const API_BASE = 'https://api.orzice.com';

// 内存缓存 + 请求去重
let _apiMemCache = {};
let _apiMemCacheKeys = [];
const _MAX_MEM_CACHE = 10;
let _apiPending = {};

function getApiCacheKey(endpoint, params) {
  return endpoint + '?' + JSON.stringify(params);
}

function getApiFromCache(key, ttl) {
  const entry = _apiMemCache[key];
  if (entry && Date.now() - entry.time < ttl) {
    const idx = _apiMemCacheKeys.indexOf(key);
    if (idx >= 0) { _apiMemCacheKeys.splice(idx, 1); _apiMemCacheKeys.push(key); }
    return entry.data;
  }
  return null;
}

function setApiCache(key, data) {
  const idx = _apiMemCacheKeys.indexOf(key);
  if (idx >= 0) { _apiMemCacheKeys.splice(idx, 1); }
  _apiMemCacheKeys.push(key);
  if (_apiMemCacheKeys.length > _MAX_MEM_CACHE) {
    const evictKey = _apiMemCacheKeys.shift();
    delete _apiMemCache[evictKey];
  }
  _apiMemCache[key] = { data: data, time: Date.now() };
}

function apiRequest(endpoint, params, retries, noCache) {
  if (retries === undefined || retries === null) retries = 3;
  const qs = params ? Object.keys(params).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&') : '';
  const url = API_BASE + '/api/' + endpoint + (qs ? '?' + qs : '');
  const cacheKey = getApiCacheKey(endpoint, params || {});

  return new Promise((resolve, reject) => {
    if (!noCache && endpoint === 'item_price_all') {
      const cached = getApiFromCache(cacheKey, 5 * 60 * 1000);
      if (cached) return resolve(cached);
      if (_apiPending[cacheKey]) {
        return _apiPending[cacheKey].then(resolve).catch(() => { });
      }
    }

    function doRequest(attempt) {
      wx.request({
        url: url,
        method: 'GET',
        timeout: 25000,
        success: (res) => {
          const data = res.data;
          if (data.code !== 0) {
            reject(new Error(data.msg || 'API返回错误'));
            return;
          }
          if (endpoint === 'item_price_all') {
            setApiCache(cacheKey, data);
            delete _apiPending[cacheKey];
          }
          resolve(data);
        },
        fail: (err) => {
          delete _apiPending[cacheKey];
          if (attempt < retries) {
            const delay = err.errMsg && err.errMsg.indexOf('abort') >= 0
              ? 1000 * Math.pow(2, attempt)
              : 600 * (attempt + 1);
            setTimeout(() => doRequest(attempt + 1), delay);
          } else {
            reject(new Error(err.errMsg || '请求失败'));
          }
        }
      });
    }

    if (endpoint === 'item_price_all' && !noCache) {
      _apiPending[cacheKey] = new Promise((res, rej) => {
        const origResolve = res;
        const origReject = rej;
        doRequest(0);
        // Override resolve/reject for the pending
        _apiPending[cacheKey] = { then: (fn) => origResolve, catch: (fn) => origReject };
      });
      // Simple approach: just do the request
      delete _apiPending[cacheKey];
    }

    doRequest(0);
  });
}

async function fetchCategoryAll(catKey) {
  const t0 = Date.now();
  let res1;
  try {
    res1 = await apiRequest('item_list', { types: catKey, p: 1, limit: 500 });
  } catch (e) {
    console.error('[fetchCategoryAll] 首页请求失败 (' + catKey + '):', e.message);
    return [];
  }
  let allItems = (res1.data || []).map(item => ({ ...item, _category: catKey }));
  const totalCount = res1.count || 0;
  const perPage = allItems.length > 0 ? allItems.length : 500;
  const totalPages = totalCount > 0 ? Math.ceil(totalCount / perPage) : 1;

  if (allItems.length >= totalCount || totalPages <= 1) {
    return allItems;
  }

  const remainingPages = [];
  for (let p = 2; p <= totalPages; p++) { remainingPages.push(p); }
  const pageResults = await batchAsync(remainingPages.map(page => {
    return () => apiRequest('item_list', { types: catKey, p: page, limit: 500 })
      .then(r => (r.data || []).map(item => ({ ...item, _category: catKey })))
      .catch(() => []);
  }), 10);
  pageResults.forEach(items => { allItems = allItems.concat(items); });
  return allItems;
}

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
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
  return results;
}

async function loadAllItems(forceRefresh) {
  const store = require('./store');
  if (!forceRefresh) {
    const cached = store.getCache();
    if (cached && cached._allItems && cached._allItems.length > 0) {
      return cached._allItems;
    }
  }

  const util = require('./util');
  const CATEGORIES = util.CATEGORIES;

  const taskFns = CATEGORIES.map(cat => {
    return () => fetchCategoryAll(cat.key).catch(e => {
      console.error('加载' + cat.name + '失败:', e.message);
      return [];
    });
  });

  const results = await batchAsync(taskFns, 8);
  const allItems = Array.prototype.concat.apply([], results);
  store.setCache({ _allItems: allItems });
  return allItems;
}

module.exports = {
  API_BASE,
  apiRequest,
  fetchCategoryAll,
  loadAllItems,
  batchAsync
};