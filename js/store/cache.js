// ===== store/cache.js — 缓存 + 价格历史 + 浏览状态 =====
// 功能清单: 双级缓存(内存+localStorage) | 价格本地快照 + SW后台合并 + 云端快照
// 浏览状态保存/恢复 | 分类图标缓存 | IndexedDB | 刷新冷却控制
// 依赖: config.js(CACHE_KEY等) utils.js(toast) api.js(fetchItemHistory-运行时)
// 被依赖: api.js render/shared.js render/home.js app/

// ===== 状态变量 =====
var REFRESH_COOLDOWN = REFRESH_COOLDOWN_BASE;
var lastRefreshTime = 0;
var _lastApiDuration = 3000;
var _memoryCache = null;
var _cloudSnapCache = {};  // itemId -> { snapshots, fetchedAt }

// ===== IndexedDB =====
function _openMainDB() {
  if (!('indexedDB' in window)) return Promise.reject(new Error('no indexedDB'));
  return new Promise(function(resolve, reject) {
    var req = indexedDB.open(MAIN_DB_NAME, MAIN_DB_VERSION);
    req.onupgradeneeded = function(e) {
      var db = e.target.result;
      if (!db.objectStoreNames.contains('daily_prices')) {
        db.createObjectStore('daily_prices', { keyPath: 'key' });
      }
    };
    req.onsuccess = function(e) { resolve(e.target.result); };
    req.onerror = function(e) { reject(e.target.error); };
  });
}

function openPriceDB() {
  return _openMainDB();
}

// ===== 刷新冷却 =====
function setApiDuration(ms) {
  _lastApiDuration = ms > 0 ? ms : 3000;
  REFRESH_COOLDOWN = Math.max(3000, _lastApiDuration + 1000);
}

function checkRefreshCooldown() {
  if (lastRefreshTime === 0) return true;
  var elapsed = Date.now() - lastRefreshTime;
  if (elapsed < REFRESH_COOLDOWN) {
    var remainSec = Math.ceil((REFRESH_COOLDOWN - elapsed) / 1000);
    var remainMin = Math.floor(remainSec / 60);
    var remainS = remainSec % 60;
    var msg = remainMin > 0
      ? '刷新冷却中，请 ' + remainMin + ' 分 ' + remainS + ' 秒后重试'
      : '刷新冷却中，请 ' + remainS + ' 秒后重试';
    toast(msg, 2000);
    return false;
  }
  return true;
}

function markRefreshed() {
  lastRefreshTime = Date.now();
}

// ===== 双级缓存 =====
function getCache() {
  if (_memoryCache && _memoryCache.data) {
    if (Date.now() - _memoryCache.time < CACHE_DURATION) return _memoryCache.data;
  }
  var t = localStorage.getItem(CACHE_TIME_KEY);
  if (t && (Date.now() - parseInt(t) < CACHE_DURATION)) {
    try {
      var data = JSON.parse(localStorage.getItem(CACHE_KEY));
      if (data) { _memoryCache = { data: data, time: parseInt(t) }; }
      return data;
    } catch(e) {}
  }
  if (!t) {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
        var fallback = JSON.parse(raw);
        _memoryCache = { data: fallback, time: Date.now() };
        return fallback;
      }
    } catch(e) {}
  }
  return null;
}

function setCache(data) {
  _memoryCache = { data: data, time: Date.now() };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
  } catch(e) {
    console.warn('LocalStorage 缓存写入失败（可能配额满），尝试清理...');
    try { localStorage.removeItem(CACHE_KEY); } catch(e2) {}
    try { localStorage.removeItem(CACHE_TIME_KEY); } catch(e2) {}
    try { localStorage.removeItem('deltaforce_price_hist'); } catch(e2) {}
    _histCache = null;
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
      if (typeof toast === 'function') toast('存储空间不足，已清理历史价格数据', 3000);
    } catch(e3) {
      console.error('LocalStorage 缓存写入彻底失败:', e3.message);
      if (typeof toast === 'function') toast('存储空间已满，部分功能可能异常', 3000);
    }
  }
}

function clearCache() {
  _memoryCache = null;
  localStorage.removeItem(CACHE_KEY);
  localStorage.removeItem(CACHE_TIME_KEY);
  _searchIndex = null;
}

// ===== 价格历史（本地快照） =====
var _histCache = null;      // 内存缓存：避免列表/首页每张卡片渲染都 JSON.parse 大对象
var _histCacheTime = 0;

function getPriceHistory() {
  var now = Date.now();
  if (_histCache && now - _histCacheTime < 2000) return _histCache;
  try { _histCache = JSON.parse(localStorage.getItem(PRICE_HISTORY_KEY)) || {}; }
  catch(e) { _histCache = {}; }
  _histCacheTime = now;
  return _histCache;
}

function savePriceSnapshot(itemId, item) {
  if (!itemId || !item.price) return;
  var hist = getPriceHistory();
  var k = String(itemId);
  if (!hist[k]) hist[k] = [];
  var today = new Date(); today.setHours(0,0,0,0);
  var todayTs = Math.floor(today.getTime()/1000);
  hist[k] = hist[k].filter(function(s) {
    var sd = new Date(s.ts*1000); sd.setHours(0,0,0,0);
    return Math.floor(sd.getTime()/1000) !== todayTs;
  });
  hist[k].push({ ts: Math.floor(Date.now() / 1000), price: item.price });
  hist[k].sort(function(a,b) { return b.ts - a.ts; });
  if (hist[k].length > MAX_HIST_PER_ITEM) hist[k] = hist[k].slice(0, MAX_HIST_PER_ITEM);
  _histCache = null;
  try { localStorage.setItem(PRICE_HISTORY_KEY, JSON.stringify(hist)); } catch(e) {}
}

function recordAllItemsPrices(allItems) {
  if (!allItems || allItems.length === 0) return 0;
  var hist = getPriceHistory();
  var today = new Date(); today.setHours(0,0,0,0);
  var todayTs = Math.floor(today.getTime()/1000);
  var now = Math.floor(Date.now()/1000);
  var added = 0;
  allItems.forEach(function(item) {
    if (!item.id || !item.price || item.price <= 0) return;
    var k = String(item.id);
    if (!hist[k]) hist[k] = [];
    var hasToday = false;
    for (var i = 0; i < hist[k].length; i++) {
      var sd = new Date(hist[k][i].ts * 1000); sd.setHours(0,0,0,0);
      if (Math.floor(sd.getTime()/1000) === todayTs) { hasToday = true; break; }
    }
    if (hasToday) return;
    hist[k].push({ ts: now, price: item.price });
    added++;
    if (hist[k].length > 1) {
      hist[k].sort(function(a,b) { return b.ts - a.ts; });
    }
    if (hist[k].length > MAX_HIST_PER_ITEM) hist[k] = hist[k].slice(0, MAX_HIST_PER_ITEM);
  });
  var staleCutoff = Math.floor(Date.now() / 1000) - 35 * 86400;
  var hadStale = false;
  Object.keys(hist).forEach(function(k) {
    var before = hist[k].length;
    hist[k] = hist[k].filter(function(s) { return s.ts >= staleCutoff; });
    if (hist[k].length === 0) { delete hist[k]; hadStale = true; }
    else if (hist[k].length < before) { hadStale = true; }
  });
  if (added > 0 || hadStale) {
    _histCache = null;
    try { localStorage.setItem(PRICE_HISTORY_KEY, JSON.stringify(hist)); } catch(e) {
      console.warn('价格历史写入失败（可能配额满），裁剪旧数据...');
      var weekCutoff = Math.floor(Date.now() / 1000) - 7 * 86400;
      Object.keys(hist).forEach(function(k) {
        hist[k] = hist[k].filter(function(s) { return s.ts >= weekCutoff; });
        if (hist[k].length === 0) delete hist[k];
      });
      _histCache = null;
      try { localStorage.setItem(PRICE_HISTORY_KEY, JSON.stringify(hist)); } catch(e2) {
        console.error('价格历史写入彻底失败:', e2.message);
      }
    }
  }
  return added;
}

async function mergeSWPriceHistory() {
  if (!('indexedDB' in window)) return 0;
  try {
    var db = await openPriceDB();
    var tx = db.transaction('daily_prices', 'readonly');
    var store = tx.objectStore('daily_prices');
    var allRecords = await new Promise(function(resolve, reject) {
      var req = store.getAll();
      req.onsuccess = function() { resolve(req.result || []); };
      req.onerror = function() { reject(req.error); };
    });
    if (!allRecords || allRecords.length === 0) return 0;
    var hist = getPriceHistory();
    var added = 0;
    var now = Math.floor(Date.now() / 1000);
    var staleCutoff = now - 35 * 86400;
    var staleKeys = [];
    allRecords.forEach(function(record) {
      if (!record.itemId || !record.price) return;
      if (record.dayTs && record.dayTs < staleCutoff) {
        staleKeys.push(record.key);
        return;
      }
      var k = String(record.itemId);
      if (!hist[k]) hist[k] = [];
      var exists = false;
      for (var i = 0; i < hist[k].length; i++) {
        var sd = new Date(hist[k][i].ts * 1000);
        sd.setHours(0, 0, 0, 0);
        if (Math.floor(sd.getTime() / 1000) === record.dayTs) { exists = true; break; }
      }
      if (!exists) {
        hist[k].push({ ts: record.dayTs, price: record.price });
        hist[k].sort(function(a, b) { return b.ts - a.ts; });
        if (hist[k].length > MAX_HIST_PER_ITEM) hist[k] = hist[k].slice(0, MAX_HIST_PER_ITEM);
        added++;
      }
    });
    if (added > 0) {
      _histCache = null;
      try { localStorage.setItem(PRICE_HISTORY_KEY, JSON.stringify(hist)); } catch(e) {}
    }
    if (staleKeys.length > 0) {
      var delTx = db.transaction('daily_prices', 'readwrite');
      var delStore = delTx.objectStore('daily_prices');
      staleKeys.forEach(function(key) { try { delStore.delete(key); } catch(e) {} });
      await new Promise(function(resolve) { delTx.oncomplete = resolve; });
    }
    return added;
  } catch (e) {
    console.warn('mergeSWPriceHistory 失败:', e.message);
    return 0;
  }
}

function getMergedPriceData(item, cloudSnapshots) {
  var pts = [];
  var now = Math.floor(Date.now()/1000);
  var SPD = 86400;
  var usedDays = {};
  if (item.day_30_price > 0) { pts.push({ day: 30, price: item.day_30_price }); usedDays[30] = true; }
  if (item.day_7_price > 0)  { pts.push({ day: 7,  price: item.day_7_price });  usedDays[7] = true; }
  if (item.day_3_price > 0)  { pts.push({ day: 3,  price: item.day_3_price });  usedDays[3] = true; }
  if (item.price > 0)        { pts.push({ day: 0,  price: item.price });         usedDays[0] = true; }
  if (cloudSnapshots && cloudSnapshots.length > 0) {
    cloudSnapshots.forEach(function(s) {
      var snapDate = new Date(s.d + 'T00:00:00+08:00');
      var dayAgo = Math.round((now - snapDate.getTime() / 1000) / SPD);
      if (dayAgo >= 1 && dayAgo <= 30 && !usedDays[dayAgo] && s.p > 0) {
        pts.push({ day: dayAgo, price: s.p, cloud: true });
        usedDays[dayAgo] = true;
      }
    });
  }
  var hist = getPriceHistory();
  var snaps = hist[String(item.id)] || [];
  snaps.forEach(function(s) {
    var d = Math.round((now - s.ts) / SPD);
    if (d >= 1 && d <= 30 && !usedDays[d]) {
      pts.push({ day: d, price: s.price, hist: true });
      usedDays[d] = true;
    }
  });
  pts.sort(function(a,b) { return b.day - a.day; });
  return pts;
}

async function getOrFetchCloudSnapshots(itemId) {
  var cacheKey = String(itemId);
  var cached = _cloudSnapCache[cacheKey];
  if (cached && (Date.now() - cached.fetchedAt < 5 * 60 * 1000)) {
    return cached.snapshots;
  }
  try {
    var res = await fetchItemHistory(itemId);
    var snapshots = (res && res.code === 0 && res.data && res.data.snapshots) || [];
    _cloudSnapCache[cacheKey] = { snapshots: snapshots, fetchedAt: Date.now() };
    return snapshots;
  } catch (e) {
    console.warn('[getOrFetchCloudSnapshots] 失败:', e.message);
    return [];
  }
}

// ===== 价格曲线：预加载渲染（2026-10-09） =====
/* 旧行为：详情页先按 API 的 day_30/7/3 + 当前价画一版曲线，云端历史（Cloudflare 侧记录）
   到达后**再替换一次** —— 用户看到曲线先跳一下再变样（先 API 数据、后后端数据）。
   现改为：渲染时只放骨架占位，等云端快照到达（3 秒未回则本地数据兜底）后**一次性**画出
   最终曲线，中途不出现「API 版」曲线。
   依赖 render/charts.js 的 generatePriceCurveSVG（同一 bundle 作用域，函数调用时已可用）。 */
function curvePlaceholderHTML() {
  return '<div class="curve-loading" style="height:120px;display:flex;align-items:center;justify-content:center;color:#8a8aa0;font-size:12px">走势加载中…</div>';
}

function paintPriceCurve(item, box, fallbackPts) {
  if (!box) return;
  /* 已画出最终图 / 正在加载 ⇒ 不再重画：价格刷新（updateDetailPrices）也会调用本函数，
     这里保证一个盒子只落一次最终态，杜绝第二次跳变。 */
  if (box.getAttribute('data-curve-done') === '1' || box.getAttribute('data-curve-busy') === '1') return;
  box.setAttribute('data-curve-busy', '1');

  var paint = function (pts) {
    if (!box || box.getAttribute('data-curve-done') === '1') return;
    var svgHtml = '';
    try { svgHtml = (pts && pts.length >= 2) ? generatePriceCurveSVG(pts) : ''; } catch (e) { svgHtml = ''; }
    if (!svgHtml) { box.setAttribute('data-curve-busy', ''); return; }
    var ph = box.querySelector('.curve-loading');
    if (ph) { ph.insertAdjacentHTML('afterend', svgHtml); ph.remove(); }
    else {
      var oldSvg = box.querySelector('svg');
      if (oldSvg) { oldSvg.insertAdjacentHTML('afterend', svgHtml); oldSvg.remove(); }
      else box.insertAdjacentHTML('afterbegin', svgHtml);
    }
    box.setAttribute('data-curve-done', '1');
    box.setAttribute('data-curve-busy', '');
  };

  var fb = fallbackPts || getMergedPriceData(item);
  var timer = setTimeout(function () { paint(fb); }, 3000);   // 兜底：不能让用户一直看骨架
  getOrFetchCloudSnapshots(item.id).then(function (snaps) {
    clearTimeout(timer);
    paint((snaps && snaps.length) ? getMergedPriceData(item, snaps) : fb);
  }).catch(function () { clearTimeout(timer); paint(fb); });
}

// ===== 浏览状态 =====
function saveBrowseState() {
  var state = {
    page: pageStack[pageStack.length - 1] || 'home',
    category: typeof currentCategory !== 'undefined' ? currentCategory : null,
    isAllMode: typeof isAllMode !== 'undefined' ? isAllMode : false,
    // homeCategoryFilter 是数组（多选分类），空数组 = 全部类型
    homeCategoryFilter: typeof homeCategoryFilter !== 'undefined' ? homeCategoryFilter : [],
    homePeriod: typeof homePeriod !== 'undefined' ? homePeriod : 'bl',
    homePriceRange: typeof homePriceRange !== 'undefined' ? homePriceRange : 'all',
    homePriceMin: typeof homePriceMin !== 'undefined' ? homePriceMin : '',
    homePriceMax: typeof homePriceMax !== 'undefined' ? homePriceMax : '',
    homeSortBy: typeof homeSortBy !== 'undefined' ? homeSortBy : 'default',
    homeSortDir: typeof homeSortDir !== 'undefined' ? homeSortDir : 'desc',
    homeCurrentPage: typeof homeCurrentPage !== 'undefined' ? homeCurrentPage : 1,
    homeScrollTop: (function() {
      try { return window.pageYOffset || document.documentElement.scrollTop || 0; } catch(e) { return 0; }
    })()
  };
  localStorage.setItem(BROWSE_STATE_KEY, JSON.stringify(state));
}

function restoreBrowseState() {
  try {
    var saved = JSON.parse(localStorage.getItem(BROWSE_STATE_KEY));
    if (!saved) return;
    return saved;
  } catch(e) { return null; }
}

// ===== 分类图标缓存 =====
function getCatIconsCache() {
  try { return JSON.parse(localStorage.getItem(CAT_ICONS_KEY)); } catch(e) { return null; }
}

function setCatIconsCache(picks) {
  localStorage.setItem(CAT_ICONS_KEY, JSON.stringify(picks));
}
