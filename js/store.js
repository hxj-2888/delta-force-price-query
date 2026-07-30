// ===== store.js — 数据持久化层 =====
// 功能清单: 物品缓存(内存+localStorage双级,5分钟TTL) | 搜索历史(最多20条) | 最近浏览(最多15条)
// 收藏系统(最多50条) | 价格历史本地快照(每物品14天) | SW后台记录合并(mergeSWPriceHistory)
// 云端快照缓存(5分钟TTL) | 浏览状态恢复 | 分类图标缓存 | 搜索索引(字符级倒排索引) | 刷新冷却控制
// 依赖: utils.js(无,纯数据层) | 被依赖: api.js(loadAllItems/setCache/getCache) main.js(初始化/用户操作)
// 改动影响: 修改缓存键或TTL→影响api.js的缓存命中率; 修改用户数据键→影响main.js/search页功能

// ===== 缓存（内存 + LocalStorage 双级） =====

var CACHE_KEY = 'deltaforce_cache_v10';
var CACHE_TIME_KEY = 'deltaforce_cache_time_v10';
var CACHE_DURATION = 5 * 60 * 1000; // 5分钟，确保版本更新后用户能及时获取新数据

var REFRESH_COOLDOWN = 30 * 1000;
var lastRefreshTime = 0;
var _lastApiDuration = 3000;

var _memoryCache = null;

// IndexedDB（SW 后台价格记录存储，用于 mergeSWPriceHistory）
var MAIN_DB_NAME = 'deltaforce_price_db';
var MAIN_DB_VERSION = 2;

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

// 从内存缓存读取（5分钟TTL内有效）
function getCache() {
  if (_memoryCache && _memoryCache.data) {
    if (Date.now() - _memoryCache.time < CACHE_DURATION) return _memoryCache.data;
  }
  // 降级到 localStorage（用于页面刷新后快速恢复，无需等待网络）
  var t = localStorage.getItem(CACHE_TIME_KEY);
  if (t && (Date.now() - parseInt(t) < CACHE_DURATION)) {
    try {
      var data = JSON.parse(localStorage.getItem(CACHE_KEY));
      if (data) { _memoryCache = { data: data, time: parseInt(t) }; }
      return data;
    } catch(e) {}
  }
  // 即使过期也返回缓存数据作为初始渲染（避免白屏），后续网络请求会更新
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

// 写入缓存（双级：内存 + localStorage）
function setCache(data) {
  _memoryCache = { data: data, time: Date.now() };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
  } catch(e) {
    // ★ localStorage 配额满：清除非关键数据后重试一次
    console.warn('LocalStorage 缓存写入失败（可能配额满），尝试清理...');
    try { localStorage.removeItem(CACHE_KEY); } catch(e2) {}
    try { localStorage.removeItem(CACHE_TIME_KEY); } catch(e2) {}
    // 清理价格历史（通常是最大的非关键数据）
    try { localStorage.removeItem('deltaforce_price_hist'); } catch(e2) {}
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
      // ★ 通知用户部分历史数据已被清理
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

// ===== 搜索历史 =====
var QUERY_HISTORY_KEY = 'deltaforce_search_history';
var MAX_HISTORY = 20;

function getSearchHistory() {
  try { return JSON.parse(localStorage.getItem(QUERY_HISTORY_KEY)) || []; }
  catch(e) { return []; }
}

function saveSearchQuery(keyword) {
  if (!keyword.trim()) return;
  var history = getSearchHistory();
  history = history.filter(function(h) { return h !== keyword; });
  history.unshift(keyword);
  if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY);
  localStorage.setItem(QUERY_HISTORY_KEY, JSON.stringify(history));
}

function clearSearchHistory() {
  localStorage.removeItem(QUERY_HISTORY_KEY);
  var el = document.getElementById('searchHistory');
  if (el) el.style.display = 'none';
  toast('搜索历史已清除');
}

// ===== 最近浏览 =====
var RECENT_VIEWS_KEY = 'deltaforce_recent_views';
var MAX_RECENT = 15;

function getRecentViews() {
  try { return JSON.parse(localStorage.getItem(RECENT_VIEWS_KEY)) || []; }
  catch(e) { return []; }
}

function saveRecentView(item) {
  if (!item || !item.id) return;
  var views = getRecentViews();
  views = views.filter(function(v) { return v.id !== item.id; });
  views.unshift({
    id: item.id,
    name: item.name,
    price: item.price,
    bl: item.bl || 0,
    pic: item.pic || '',
    secondClassCN: item.secondClassCN || '',
    grade: item.grade || 0,
    _category: item._category || ''
  });
  if (views.length > MAX_RECENT) views = views.slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_VIEWS_KEY, JSON.stringify(views));
}

function clearRecentViews() {
  localStorage.removeItem(RECENT_VIEWS_KEY);
  var el = document.getElementById('recentViewSection');
  if (el) el.style.display = 'none';
  toast('最近浏览已清除');
}

// ===== 收藏系统 =====
var FAVORITES_KEY = 'deltaforce_favorites';
var MAX_FAVORITES = 50;

function getFavorites() {
  try { return JSON.parse(localStorage.getItem(FAVORITES_KEY)) || []; }
  catch(e) { return []; }
}

function isFavorited(itemId) {
  return getFavorites().some(function(f) { return f.id === itemId; });
}

function saveFavorite(item) {
  if (!item || !item.id) return false;
  var favs = getFavorites();
  if (favs.some(function(f) { return f.id === item.id; })) return false;
  favs.unshift({
    id: item.id,
    name: item.name,
    price: item.price,
    bl: item.bl || 0,
    pic: item.pic || '',
    secondClassCN: item.secondClassCN || '',
    grade: item.grade || 0,
    _category: item._category || ''
  });
  if (favs.length > MAX_FAVORITES) favs = favs.slice(0, MAX_FAVORITES);
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
  return true;
}

function removeFavorite(itemId) {
  var favs = getFavorites();
  var before = favs.length;
  favs = favs.filter(function(f) { return f.id !== itemId; });
  if (favs.length === before) return false;
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
  return true;
}

function toggleFavorite(item) {
  if (!item || !item.id) return false;
  if (isFavorited(item.id)) {
    removeFavorite(item.id);
    return false;
  } else {
    saveFavorite(item);
    return true;
  }
}

function clearFavorites() {
  localStorage.removeItem(FAVORITES_KEY);
  var el = document.getElementById('favoritesSection');
  if (el) el.style.display = 'none';
  toast('收藏已清空');
}

// ===== 价格历史（本地快照） =====
var PRICE_HISTORY_KEY = 'deltaforce_price_hist';
var MAX_HIST_PER_ITEM = 14; // 保留近14天

// 线上快照内存缓存（避免重复请求后端）
var _cloudSnapCache = {};  // itemId -> { snapshots, fetchedAt }

function getPriceHistory() {
  try { return JSON.parse(localStorage.getItem(PRICE_HISTORY_KEY)) || {}; }
  catch(e) { return {}; }
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
  try { localStorage.setItem(PRICE_HISTORY_KEY, JSON.stringify(hist)); } catch(e) {}
}

// 记录所有物品当日价格（页面打开时调用，用于价格历史图表）
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
  // 清理 35 天前的过期数据
  var staleCutoff = Math.floor(Date.now() / 1000) - 35 * 86400;
  var hadStale = false;
  Object.keys(hist).forEach(function(k) {
    var before = hist[k].length;
    hist[k] = hist[k].filter(function(s) { return s.ts >= staleCutoff; });
    if (hist[k].length === 0) { delete hist[k]; hadStale = true; }
    else if (hist[k].length < before) { hadStale = true; }
  });
  if (added > 0 || hadStale) {
    try { localStorage.setItem(PRICE_HISTORY_KEY, JSON.stringify(hist)); } catch(e) {
      // ★ 配额满：清理超过 7 天的旧记录后重试
      console.warn('价格历史写入失败（可能配额满），裁剪旧数据...');
      var weekCutoff = Math.floor(Date.now() / 1000) - 7 * 86400;
      Object.keys(hist).forEach(function(k) {
        hist[k] = hist[k].filter(function(s) { return s.ts >= weekCutoff; });
        if (hist[k].length === 0) delete hist[k];
      });
      try { localStorage.setItem(PRICE_HISTORY_KEY, JSON.stringify(hist)); } catch(e2) {
        // 仍失败则放弃本次写入
        console.error('价格历史写入彻底失败:', e2.message);
      }
    }
  }
  return added;
}

// 合并 SW 后台记录的每日价格到本地快照
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

/**
 * 合并获取价格数据点（API锚点 + 线上快照 + 本地快照）
 * @param {object} item - 物品对象
 * @param {Array} [cloudSnapshots] - 可选，云端快照 [{d, p, b, s}, ...]
 */
function getMergedPriceData(item, cloudSnapshots) {
  var pts = [];
  var now = Math.floor(Date.now()/1000);
  var SPD = 86400;
  var usedDays = {};

  // 优先级1: API 锚点（30天/7天/3天/当前）
  if (item.day_30_price > 0) { pts.push({ day: 30, price: item.day_30_price }); usedDays[30] = true; }
  if (item.day_7_price > 0)  { pts.push({ day: 7,  price: item.day_7_price });  usedDays[7] = true; }
  if (item.day_3_price > 0)  { pts.push({ day: 3,  price: item.day_3_price });  usedDays[3] = true; }
  if (item.price > 0)        { pts.push({ day: 0,  price: item.price });         usedDays[0] = true; }

  // 优先级2: 云端快照（D1 数据库每日记录）
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

  // 优先级3: 本地快照（兜底）
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

// 云端快照内存缓存（5分钟 TTL）
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

// ===== 浏览状态 =====
var BROWSE_STATE_KEY = 'deltaforce_browse_state';

function saveBrowseState() {
  var state = {
    page: pageStack[pageStack.length - 1] || 'home',
    category: typeof currentCategory !== 'undefined' ? currentCategory : null,
    isAllMode: typeof isAllMode !== 'undefined' ? isAllMode : false,
    // ★ 首页状态完整保存：筛选/排序/分页/滚动位置
    homeCategoryFilter: typeof homeCategoryFilter !== 'undefined' ? homeCategoryFilter : 'all',
    homePeriod: typeof homePeriod !== 'undefined' ? homePeriod : 'bl',
    homePriceRange: typeof homePriceRange !== 'undefined' ? homePriceRange : 'all',
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
var CAT_ICONS_KEY = 'deltaforce_cat_icons';

function getCatIconsCache() {
  try { return JSON.parse(localStorage.getItem(CAT_ICONS_KEY)); } catch(e) { return null; }
}

function setCatIconsCache(picks) {
  localStorage.setItem(CAT_ICONS_KEY, JSON.stringify(picks));
}

// ===== 搜索索引（字符级倒排索引） =====

var _searchIndex = null;
var _idMapCache = null;

function buildSearchIndex(allItems) {
  if (!allItems || allItems.length === 0) { _searchIndex = null; return; }
  var index = {};
  for (var i = 0; i < allItems.length; i++) {
    var item = allItems[i];
    if (!item.name || !item.id) continue;
    var name = item.name.toLowerCase();
    var seen = {};
    for (var j = 0; j < name.length; j++) {
      var ch = name[j];
      if (seen[ch]) continue;
      seen[ch] = true;
      if (!index[ch]) index[ch] = [];
      index[ch].push(item.id);
    }
  }
  _searchIndex = index;
  _idMapCache = {};
  for (var k = 0; k < allItems.length; k++) {
    if (allItems[k].id) _idMapCache[allItems[k].id] = allItems[k];
  }
}

function searchByIndex(allItems, keyword) {
  var kw = keyword.toLowerCase().trim();
  if (!kw) return [];
  if (!_searchIndex) {
    return allItems.filter(function(item) {
      return item.name && item.name.toLowerCase().indexOf(kw) !== -1;
    });
  }
  var charSets = [];
  for (var i = 0; i < kw.length; i++) {
    var ids = _searchIndex[kw[i]];
    if (!ids) return [];
    var set = {};
    for (var j = 0; j < ids.length; j++) { set[ids[j]] = true; }
    charSets.push(set);
  }
  charSets.sort(function(a, b) { return Object.keys(a).length - Object.keys(b).length; });
  var candidates = charSets[0];
  for (var k = 1; k < charSets.length; k++) {
    var filtered = {};
    for (var id in candidates) { if (charSets[k][id]) filtered[id] = true; }
    candidates = filtered;
    if (Object.keys(candidates).length === 0) return [];
  }
  if (!_idMapCache) _buildIdMap(allItems);
  var results = [];
  for (var id in candidates) {
    var item = _idMapCache[id];
    if (item && item.name && item.name.toLowerCase().indexOf(kw) !== -1) {
      results.push(item);
    }
  }
  return results;
}

function _buildIdMap(allItems) {
  _idMapCache = {};
  for (var i = 0; i < allItems.length; i++) {
    if (allItems[i].id) _idMapCache[allItems[i].id] = allItems[i];
  }
}

function hasSearchIndex() {
  return _searchIndex !== null;
}
