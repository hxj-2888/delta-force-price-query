// ===== 网络请求层（wx.request 封装） =====
// ★ 走自建 Cloudflare Pages /api/proxy 代理，token 留在服务端，不在客户端暴露
const config = require('./config');

const app = getApp();

// ★ API_BASE 从 utils/config.js 读取（见该文件头部说明：必须为已备案 HTTPS 域名）
function getApiBase() {
  return (app && app.globalData && app.globalData.apiBase) || config.API_BASE;
}
// 代理路径: {apiBase}/api/proxy
function getProxyUrl() {
  return getApiBase() + '/api/proxy';
}

// 内存缓存 + 请求去重
var _apiMemCache = {};
var _apiMemCacheKeys = [];
var _MAX_MEM_CACHE = 10;
var _apiPending = {};

function getApiCacheKey(endpoint, params) {
  return endpoint + '?' + JSON.stringify(params);
}

function getApiFromCache(key, ttl) {
  var entry = _apiMemCache[key];
  if (entry && Date.now() - entry.time < ttl) {
    var idx = _apiMemCacheKeys.indexOf(key);
    if (idx >= 0) { _apiMemCacheKeys.splice(idx, 1); _apiMemCacheKeys.push(key); }
    return entry.data;
  }
  return null;
}

function setApiCache(key, data) {
  var idx = _apiMemCacheKeys.indexOf(key);
  if (idx >= 0) { _apiMemCacheKeys.splice(idx, 1); }
  _apiMemCacheKeys.push(key);
  if (_apiMemCacheKeys.length > _MAX_MEM_CACHE) {
    var evictKey = _apiMemCacheKeys.shift();
    delete _apiMemCache[evictKey];
  }
  _apiMemCache[key] = { data: data, time: Date.now() };
}

// ★ 使用 POST /api/proxy，与 PWA 端协议一致
function apiRequest(endpoint, params, retries, noCache) {
  if (retries === undefined || retries === null) retries = 3;
  var cacheKey = getApiCacheKey(endpoint, params || {});

  return new Promise(function(resolve, reject) {
    if (!getApiBase()) {
      reject(new Error('API_BASE 未配置：请修改 miniprogram/utils/config.js'));
      return;
    }
    if (!noCache && endpoint === 'item_price_all') {
      var cached = getApiFromCache(cacheKey, 5 * 60 * 1000);
      if (cached) return resolve(cached);
      if (_apiPending[cacheKey]) {
        _apiPending[cacheKey].push({ resolve: resolve, reject: reject });
        return;
      }
      _apiPending[cacheKey] = [{ resolve: resolve, reject: reject }];
    }

    function doRequest(attempt) {
      wx.request({
        url: getProxyUrl(),
        method: 'POST',
        header: { 'Content-Type': 'application/json' },
        data: { endpoint: endpoint, params: params || {} },
        timeout: 25000,
        success: function(res) {
          var data = res.data;
          if (data.code !== 0) {
            if (endpoint === 'item_price_all' && !noCache) {
              var pending = _apiPending[cacheKey];
              delete _apiPending[cacheKey];
              if (pending) pending.forEach(function(p) { p.reject(new Error(data.msg || 'API返回错误')); });
            }
            reject(new Error(data.msg || 'API返回错误'));
            return;
          }
          if (endpoint === 'item_price_all' && !noCache) {
            setApiCache(cacheKey, data);
            var pending = _apiPending[cacheKey];
            delete _apiPending[cacheKey];
            if (pending) pending.forEach(function(p) { p.resolve(data); });
          }
          resolve(data);
        },
        fail: function(err) {
          if (attempt < retries) {
            var delay = err.errMsg && err.errMsg.indexOf('abort') >= 0
              ? 1000 * Math.pow(2, attempt)
              : 600 * (attempt + 1);
            setTimeout(function() { doRequest(attempt + 1); }, delay);
          } else {
            // 域名未备案/未加白名单时, 给出可操作的中文提示
            var msg = err.errMsg || '请求失败';
            if (/domain|域名|不在以下 request 合法域名|url not in/i.test(msg)) {
              msg = '小程序请求域名未配置或未备案：请在微信后台添加已备案的 HTTPS 域名（详见 utils/config.js）';
            }
            if (endpoint === 'item_price_all' && !noCache) {
              var pending = _apiPending[cacheKey];
              delete _apiPending[cacheKey];
              if (pending) pending.forEach(function(p) { p.reject(new Error(msg)); });
            }
            reject(new Error(msg));
          }
        }
      });
    }

    doRequest(0);
  });
}

async function fetchCategoryAll(catKey, noCache) {
  var t0 = Date.now();
  var res1;
  try {
    res1 = await apiRequest('item_list', { types: catKey, p: 1 });
  } catch (e) {
    console.error('[fetchCategoryAll] 首页请求失败 (' + catKey + '):', e.message);
    return [];
  }
  var allItems = (res1.data || []).map(function(item) {
    item._category = catKey;
    return item;
  });
  var totalCount = res1.count || 0;
  var perPage = allItems.length > 0 ? allItems.length : 10;
  var totalPages = totalCount > 0 ? Math.ceil(totalCount / perPage) : 1;

  if (allItems.length >= totalCount || totalPages <= 1) {
    return allItems;
  }

  var remainingPages = [];
  for (var p = 2; p <= totalPages; p++) { remainingPages.push(p); }
  var pageResults = await batchAsync(remainingPages.map(function(page) {
    return function() {
      return apiRequest('item_list', { types: catKey, p: page })
        .then(function(r) { return (r.data || []).map(function(item) { item._category = catKey; return item; }); })
        .catch(function() { return []; });
    };
  }), 8);
  pageResults.forEach(function(items) { allItems = allItems.concat(items); });
  return allItems;
}

async function batchAsync(tasks, concurrency) {
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

async function loadAllItems(forceRefresh) {
  var store = require('./store');
  if (!forceRefresh) {
    var cached = store.getCache();
    if (cached && cached._allItems && cached._allItems.length > 0) {
      return cached._allItems;
    }
  }

  var util = require('./util');
  var CATEGORIES = util.CATEGORIES;

  var results = await batchAsync(CATEGORIES.map(function(cat) {
    return function() {
      return fetchCategoryAll(cat.key).catch(function(e) {
        console.error('加载' + cat.name + '失败:', e.message);
        return [];
      });
    };
  }), 8);

  var allItems = [];
  results.forEach(function(items) { allItems = allItems.concat(items); });
  store.setCache({ _allItems: allItems });
  return allItems;
}

module.exports = {
  apiRequest: apiRequest,
  fetchCategoryAll: fetchCategoryAll,
  loadAllItems: loadAllItems,
  batchAsync: batchAsync
};
