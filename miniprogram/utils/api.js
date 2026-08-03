// ===== 网络请求层（wx.request 封装） =====
// ★ 走自建 Cloudflare Pages /api/proxy 代理，token 留在服务端，不在客户端暴露
// ★ 数据策略（v2）: 全量数据用「item_price_all(1 次) + /api/metadata(0 次上游)」合并，
//   替代原来的 10 分类全量翻页（约 143 次请求），避免触发代理限流并大幅降低上游消耗
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

// ===== 元数据拉取（/api/metadata 由 CF/Vercel 本地提供, 不消耗上游配额） =====
function getMetadata() {
  return new Promise(function(resolve) {
    if (!getApiBase()) { resolve({}); return; }
    wx.request({
      url: getApiBase() + '/api/metadata',
      method: 'GET',
      timeout: 15000,
      success: function(res) {
        try {
          var d = res.data;
          // 兼容可能存在的 { code, data } 包装
          if (d && d.code === 0 && d.data && typeof d.data === 'object') d = d.data;
          resolve(d && typeof d === 'object' ? d : {});
        } catch (e) { resolve({}); }
      },
      fail: function() { resolve({}); }
    });
  });
}

// ===== 价格 + 元数据合并（与网页端预取策略一致） =====
function mergePriceWithMetadata(prices, metadata) {
  var priceIds = {};
  var merged = (prices || [])
    .filter(function(p) { return p && (p.id || p.tid); })
    .map(function(p) {
      var id = Number(p.id) || Number(p.tid) || 0;
      var meta = metadata[String(id)] || metadata[String(p.tid)] || {};
      if (id) priceIds[String(id)] = true;
      if (p.tid) priceIds[String(p.tid)] = true;
      return Object.assign({}, p, {
        id: id,
        _category: meta._category || 'unknown',
        name: meta.name || ('物品#' + id),
        pic: meta.pic || '',
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

  // 补充 metadata 有但价格列表没有的物品（下架/稀有）
  Object.keys(metadata).forEach(function(id) {
    if (!priceIds[id]) {
      var m = metadata[id];
      merged.push(Object.assign(
        { id: Number(id), price: 0, bl: 0, day_3_bl: 0, day_7_bl: 0, tid: m.tid },
        m
      ));
    }
  });
  return merged;
}

// ===== 快速全量加载: 缓存 → 2 次请求（1 价格 + 0 上游元数据） =====
async function loadAllItemsFast(forceRefresh) {
  var store = require('./store');
  if (!forceRefresh) {
    var cached = store.getCache();
    if (cached && cached._allItems && cached._allItems.length > 0) return cached._allItems;
  }

  var priceRes = null;
  try {
    priceRes = await apiRequest('item_price_all', null, 2, true);
  } catch (e) {
    console.error('[loadAllItemsFast] 价格拉取失败:', e.message);
  }
  var metadata = await getMetadata();

  var prices = (priceRes && priceRes.data) || [];
  if (prices.length === 0 && Object.keys(metadata).length === 0) return [];

  var merged = mergePriceWithMetadata(prices, metadata);
  if (merged.length > 0) {
    try { store.setCache({ _allItems: merged }); } catch (e) { console.warn('缓存写入失败:', e); }
  }
  return merged;
}

// ===== 全量翻页加载（保留作兜底, 主流程不再使用: 约 143 次请求, 易触发限流） =====
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
  loadAllItemsFast: loadAllItemsFast,
  loadAllItems: loadAllItems,
  batchAsync: batchAsync
};
