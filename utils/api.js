// ===== API 请求层 =====

const app = getApp();

// 内存缓存
const memCache = {};
const memCacheKeys = [];
const MAX_MEM_CACHE = 10;
const pendingRequests = {};

/**
 * 获取内存缓存
 */
function getMemCache(key, ttl) {
  const entry = memCache[key];
  if (entry && Date.now() - entry.time < ttl) {
    const idx = memCacheKeys.indexOf(key);
    if (idx >= 0) { memCacheKeys.splice(idx, 1); memCacheKeys.push(key); }
    return entry.data;
  }
  return null;
}

/**
 * 设置内存缓存
 */
function setMemCache(key, data) {
  const idx = memCacheKeys.indexOf(key);
  if (idx >= 0) memCacheKeys.splice(idx, 1);
  memCacheKeys.push(key);
  if (memCacheKeys.length > MAX_MEM_CACHE) {
    delete memCache[memCacheKeys.shift()];
  }
  memCache[key] = { data, time: Date.now() };
}

/**
 * API请求（核心方法）
 * @param {string} endpoint - 端点名称
 * @param {object} params - 查询参数
 * @param {number} retries - 重试次数
 * @param {boolean} noCache - 是否跳过缓存
 */
function apiRequest(endpoint, params = {}, retries = 3, noCache = false) {
  return new Promise((resolve, reject) => {
    const cacheKey = endpoint + '?' + JSON.stringify(params);

    // 检查内存缓存（仅 item_price_all 端点）
    if (!noCache && endpoint === 'item_price_all') {
      const cached = getMemCache(cacheKey, 5 * 60 * 1000);
      if (cached) return resolve(cached);
      if (pendingRequests[cacheKey]) {
        return pendingRequests[cacheKey].then(resolve).catch(() => {
          // 继续走新请求
        });
      }
    }

    const doRequest = (attempt) => {
      if (app.globalData.useCloudProxy) {
        // 使用云函数代理
        wx.cloud.callFunction({
          name: 'apiProxy',
          data: { endpoint, params }
        }).then(res => {
          if (res.result && res.result.code === 0) {
            if (endpoint === 'item_price_all') {
              setMemCache(cacheKey, res.result);
              delete pendingRequests[cacheKey];
            }
            resolve(res.result);
          } else {
            throw new Error(res.result?.msg || 'API错误');
          }
        }).catch(err => {
          handleRetry(err, attempt);
        });
      } else {
        // 直连API（需要将 orzice.com 加入 request 合法域名白名单）
        const qs = Object.keys(params)
          .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k]))
          .join('&');
        const url = `${app.globalData.apiBase}/${endpoint}${qs ? '?' + qs : ''}`;

        wx.request({
          url,
          method: 'GET',
          timeout: 25000,
          success(res) {
            if (res.statusCode === 200 && res.data.code === 0) {
              if (endpoint === 'item_price_all') {
                setMemCache(cacheKey, res.data);
                delete pendingRequests[cacheKey];
              }
              resolve(res.data);
            } else {
              handleRetry(new Error(res.data.msg || `HTTP ${res.statusCode}`), attempt);
            }
          },
          fail(err) {
            handleRetry(err, attempt);
          }
        });
      }
    };

    const handleRetry = (err, attempt) => {
      if (endpoint === 'item_price_all') delete pendingRequests[cacheKey];
      if (attempt < retries) {
        const delay = err.errMsg?.includes('timeout')
          ? 1000 * Math.pow(2, attempt)
          : 600 * (attempt + 1);
        setTimeout(() => doRequest(attempt + 1), delay);
      } else {
        reject(err);
      }
    };

    // 首次请求注册pending
    if (endpoint === 'item_price_all') {
      pendingRequests[cacheKey] = new Promise((res, rej) => {
        // pending会在请求完成后被清理
      });
    }

    doRequest(0);
  });
}

/**
 * 拉取某个分类的全部物品
 */
async function fetchCategoryAll(catKey) {
  const res1 = await apiRequest('item_list', { types: catKey, p: 1, limit: 500 });
  let allItems = (res1.data || []).map(item => ({ ...item, _category: catKey }));
  const totalCount = res1.count || 0;
  const perPage = allItems.length > 0 ? allItems.length : 500;
  const totalPages = totalCount > 0 ? Math.ceil(totalCount / perPage) : 1;

  if (allItems.length >= totalCount || totalPages <= 1) {
    return allItems;
  }

  // 分批拉取剩余页
  const remainingPages = [];
  for (let p = 2; p <= totalPages; p++) remainingPages.push(p);

  // 并发限制：一次最多10个请求
  const CONCURRENCY = 10;
  for (let i = 0; i < remainingPages.length; i += CONCURRENCY) {
    const batch = remainingPages.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(page =>
        apiRequest('item_list', { types: catKey, p: page, limit: 500 })
          .then(r => (r.data || []).map(item => ({ ...item, _category: catKey })))
          .catch(() => [])
      )
    );
    results.forEach(items => { allItems = allItems.concat(items); });
  }
  return allItems;
}

/**
 * 加载全部物品
 */
async function loadAllItems(forceRefresh = false) {
  if (!forceRefresh) {
    const cached = app.getCache();
    if (cached && cached._allItems && cached._allItems.length > 0) {
      return cached._allItems;
    }
  }

  const results = await Promise.all(
    CATEGORIES.map(cat =>
      fetchCategoryAll(cat.key).catch(e => {
        console.error('加载' + cat.name + '失败:', e);
        return [];
      })
    )
  );

  const allItems = [].concat(...results);
  app.setCache({ _allItems: allItems, _timestamp: Date.now() });
  return allItems;
}

// 需要引入工具模块
const { CATEGORIES } = require('./util.js');

module.exports = {
  apiRequest,
  fetchCategoryAll,
  loadAllItems
};
