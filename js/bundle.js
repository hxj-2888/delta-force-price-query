// 三角洲行动 — JS Bundle (all modules combined)
// v20260729o — 自动生成于 2026-07-29 06:42:07

// ===== utils.js =====
// ===== 工具函数 =====

var _toastTimer = null;

function formatPrice(p) {
  if (p == null || p === undefined) return '--';
  return Number(p).toLocaleString('zh-CN');
}

function formatChange(bl) {
  if (bl == null || bl === undefined) return '--';
  return (bl >= 0 ? '+' : '') + bl.toFixed(2) + '%';
}

function getChangeClass(bl) {
  if (bl == null || bl === undefined) return 'flat';
  return bl > 0 ? 'up' : bl < 0 ? 'down' : 'flat';
}

function formatTime(ts) {
  if (!ts) return '--';
  const d = new Date(ts * 1000);
  return `${d.getMonth()+1}月${d.getDate()}日 ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function getGradeText(g) {
  const grades = ['', '一级', '二级', '三级', '四级', '五级', '六级'];
  return grades[g] || (g ? g + '级' : '');
}

function getGradeColor(g) {
  const colors = ['', '#8b8b8b', '#4CAF50', '#2196F3', '#9C27B0', '#FF9800', '#f44336'];
  return colors[g] || '#8b8b8b';
}

function toast(msg, duration) {
  if (duration === undefined || duration === null) duration = 1500;
  const t = document.getElementById('toast');
  if (_toastTimer) clearTimeout(_toastTimer);
  t.textContent = msg;
  t.classList.add('show');
  _toastTimer = setTimeout(function() { t.classList.remove('show'); }, duration);
}

// 安全清洗图片URL
function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const safeRegex = /^(https?:\/\/|\/\/|\/)/i;
  if (safeRegex.test(url)) {
    return url.replace(/["'<>]/g, '');
  }
  return '';
}

// HTML 转义（用于文本内容）
function escapeHtml(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

// JS 字符串转义（用于 onclick 等事件属性中的字符串参数）
function escapeJSStr(str) {
  if (str == null) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

// 分类图标 HTML
function catIconHTML(url) {
  return '<img src="' + sanitizeUrl(url) + '" alt="" style="width:36px;height:36px;object-fit:contain;border-radius:6px" referrerpolicy="no-referrer" onerror="this.parentElement.innerHTML=this.parentElement.getAttribute(\'data-fallback\')||\'\'">';
}

// 短格式价格（用于图表标签）
function shortPrice(p) {
  if (p >= 10000) return (p / 10000).toFixed(1) + 'w';
  if (p >= 1000) return (p / 1000).toFixed(1) + 'k';
  return Math.round(p).toString();
}

// ★ 大数字格式化（用于物品总数显示）
function formatLargeNum(n) {
  if (n == null || n === undefined) return '0';
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  return Number(n).toLocaleString('zh-CN');
}

// ===== store.js =====
// ===== 数据持久化层（LocalStorage, IndexedDB 操作） =====

// ===== 缓存（IndexedDB + 内存 + LocalStorage 三级） =====

var CACHE_KEY = 'deltaforce_cache_v10';
var CACHE_TIME_KEY = 'deltaforce_cache_time_v10';
var CACHE_DURATION = 2 * 60 * 60 * 1000;

var REFRESH_COOLDOWN = 30 * 1000;
var lastRefreshTime = 0;
var _lastApiDuration = 3000;

var _memoryCache = null;
var MAIN_DB_NAME = 'deltaforce_price_db';
var MAIN_DB_VERSION = 2;
var MAIN_STORE_NAME = 'main_cache';

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
  _writeCacheToIDB(data);
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
  } catch(e) {
    console.warn('LocalStorage 缓存写入失败:', e.message);
    try { localStorage.removeItem(CACHE_KEY); } catch(e2) {}
    try { localStorage.removeItem(CACHE_TIME_KEY); } catch(e2) {}
  }
}

function clearCache() {
  _memoryCache = null;
  _clearIDBCache();
  localStorage.removeItem(CACHE_KEY);
  localStorage.removeItem(CACHE_TIME_KEY);
  _searchIndex = null;
  if (typeof _topMoverFirstRetryDone !== 'undefined') _topMoverFirstRetryDone = false;
}

function _openMainDB() {
  if (!('indexedDB' in window)) return Promise.reject(new Error('no indexedDB'));
  return new Promise(function(resolve, reject) {
    var req = indexedDB.open(MAIN_DB_NAME, MAIN_DB_VERSION);
    req.onupgradeneeded = function(e) {
      var db = e.target.result;
      if (!db.objectStoreNames.contains(MAIN_STORE_NAME)) {
        db.createObjectStore(MAIN_STORE_NAME, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('daily_prices')) {
        db.createObjectStore('daily_prices', { keyPath: 'key' });
      }
    };
    req.onsuccess = function(e) { resolve(e.target.result); };
    req.onerror = function(e) { reject(e.target.error); };
  });
}

function _writeCacheToIDB(data) {
  if (!('indexedDB' in window)) return;
  _openMainDB().then(function(db) {
    try {
      var tx = db.transaction(MAIN_STORE_NAME, 'readwrite');
      tx.objectStore(MAIN_STORE_NAME).put({ key: 'all_items', data: data, time: Date.now() });
      tx.oncomplete = function() { db.close(); };
      tx.onerror = function() { db.close(); };
    } catch(e) { db.close(); }
  }).catch(function() {});
}

function _clearIDBCache() {
  if (!('indexedDB' in window)) return;
  _openMainDB().then(function(db) {
    try {
      var tx = db.transaction(MAIN_STORE_NAME, 'readwrite');
      tx.objectStore(MAIN_STORE_NAME).delete('all_items');
      tx.oncomplete = function() { db.close(); };
    } catch(e) { db.close(); }
  }).catch(function() {});
}

async function initMainCache() {
  if (!('indexedDB' in window)) return null;
  try {
    var db = await _openMainDB();
    return new Promise(function(resolve) {
      try {
        var tx = db.transaction(MAIN_STORE_NAME, 'readonly');
        var req = tx.objectStore(MAIN_STORE_NAME).get('all_items');
        req.onsuccess = function() {
          db.close();
          if (req.result && req.result.data) {
            if (Date.now() - req.result.time < CACHE_DURATION) {
              _memoryCache = { data: req.result.data, time: req.result.time };
              resolve(req.result.data);
              return;
            }
          }
          resolve(null);
        };
        req.onerror = function() { db.close(); resolve(null); };
      } catch(e) { db.close(); resolve(null); }
    });
  } catch(e) { return null; }
}

// 清除旧版缓存（v0-v9）
setTimeout(function migrateCache() {
  for (var i = 0; i <= 9; i++) {
    var k = i === 0 ? 'deltaforce_cache' : 'deltaforce_cache_v' + i;
    var tk = i === 0 ? 'deltaforce_cache_time' : 'deltaforce_cache_time_v' + i;
    if (localStorage.getItem(k)) { localStorage.removeItem(k); localStorage.removeItem(tk); }
  }
}, 0);

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
var MAX_HIST_PER_ITEM = 14; // 保留近14天，减少存储配额压力

// 线上快照内存缓存（避免重复请求后端）
var _cloudSnapCache = {};  // itemId -> { snapshots, fetchedAt }

function getPriceHistory() {
  try { return JSON.parse(localStorage.getItem(PRICE_HISTORY_KEY)) || {}; }
  catch(e) { return {}; }
}

function openPriceDB() {
  return _openMainDB();
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
  // 清理 35 天前的过期数据（无论是否新增都执行，防止过期数据长期堆积）
  var staleCutoff = Math.floor(Date.now() / 1000) - 35 * 86400;
  var hadStale = false;
  Object.keys(hist).forEach(function(k) {
    var before = hist[k].length;
    hist[k] = hist[k].filter(function(s) { return s.ts >= staleCutoff; });
    if (hist[k].length === 0) { delete hist[k]; hadStale = true; }
    else if (hist[k].length < before) { hadStale = true; }
  });
  if (added > 0 || hadStale) {
    try { localStorage.setItem(PRICE_HISTORY_KEY, JSON.stringify(hist)); } catch(e) {}
  }
  return added;
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

  // 优先级2: 云端快照（D1 数据库每日记录，标记 cloud 以在图表中区分）
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
    isAllMode: typeof isAllMode !== 'undefined' ? isAllMode : false
  };
  localStorage.setItem(BROWSE_STATE_KEY, JSON.stringify(state));
}

function restoreBrowseState() {
  try {
    var saved = JSON.parse(localStorage.getItem(BROWSE_STATE_KEY));
    if (!saved) return;
    // 恢复浏览状态由 main.js 在加载完成后调用
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

// ===== api.js =====
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

// ===== render.js =====
// ===== 视图渲染层（所有生成 innerHTML 的函数） =====

// ===== 分类常量 =====
var CATEGORIES = [
  { key: 'gun', name: '枪械', icon: '' },
  { key: 'ammo', name: '子弹', icon: '' },
  { key: 'acc', name: '配件', icon: '' },
  { key: 'helmet', name: '头盔', icon: '' },
  { key: 'armor', name: '护甲', icon: '' },
  { key: 'chest', name: '胸挂', icon: '' },
  { key: 'bag', name: '背包', icon: '' },
  { key: 'key', name: '钥匙卡', icon: '' },
  { key: 'collection', name: '收集品', icon: '' },
  { key: 'consume', name: '消耗品', icon: '' }
];

var CATEGORY_MAP = {};
CATEGORIES.forEach(function(c) { CATEGORY_MAP[c.key] = c.name; });

var itemsPerPage = 20;

// ★ 首页筛选/排序状态
var homeCategoryFilter = 'all';    // 'all' 或分类 key
var homePeriod = 'bl';            // 'bl', 'day_3_bl', 'day_7_bl'
var homePriceRange = 'all';       // 'all', 'lt1w', '1-10w', '10-100w', 'gt100w'
var homeSortBy = 'default';       // 'default' | 'change' | 'price'
var homeSortDir = 'desc';         // 'desc' | 'asc'
var homeMoversCount = 50;         // 首页初始显示条数
var HOME_LOAD_MORE = 30;         // 每次懒加载追加条数
var homeDisplayCount = 50;       // 当前已显示条数
var homeIsLoadingMore = false;   // 懒加载锁
var _homeAllFiltered = [];       // 当前筛选排序后的全量数据
var _homeRenderVersion = 0;      // ★ 渲染版本号：筛选变更时递增，防止旧 rAF 污染新状态
var _homeLoadMoreObserver = null; // IntersectionObserver：监听 #homeLoadMore 提前触发加载

// ★ 重新绑定 #homeLoadMore 的 IntersectionObserver（rootMargin 400px 提前预判）
function _reobserveHomeLoadMore() {
  if (_homeLoadMoreObserver) { _homeLoadMoreObserver.disconnect(); }
  var tip = document.getElementById('homeLoadMore');
  if (!tip) return;
  if (!_homeLoadMoreObserver) {
    _homeLoadMoreObserver = new IntersectionObserver(function(entries) {
      if (entries[0].isIntersecting) {
        loadMoreHomeItems();
      }
    }, { rootMargin: '400px' });
  }
  _homeLoadMoreObserver.observe(tip);
}

// ★ 物品显著性评分：|涨跌幅| × 价格档位
function getItemSignificance(item) {
  var bl = Math.abs(item.bl || item.day_3_bl || item.day_7_bl || 0);
  var p = item.price || 0;
  var pf = p >= 1000000 ? 4 : p >= 100000 ? 3 : p >= 10000 ? 2 : 1;
  return bl * pf;
}

var _topMoverFirstRetryDone = false;

// ===== 首页 =====
function renderHome() {
  checkFavoritePriceChanges();
  renderHomeTopMover();
  renderHomeMovers();
}

// ★ 通用：关闭所有下拉
function closeAllDropdowns() {
  ['timeDropdown','priceDropdown','filterDropdown','sortDropdown'].forEach(function(id) {
    var el = document.getElementById(id); if (el) el.style.display = 'none';
  });
}

// ★ 时间下拉
function toggleTimeDropdown() { toggleDropdown('timeDropdown', 'btnTime'); }
function closeTimeDropdown() { document.getElementById('timeDropdown').style.display = 'none'; }

// ★ 价格下拉
function togglePriceDropdown() { toggleDropdown('priceDropdown', 'btnPrice'); }
function closePriceDropdown() { document.getElementById('priceDropdown').style.display = 'none'; }

// ★ 筛选下拉
function toggleFilterDropdown() { toggleDropdown('filterDropdown', 'btnFilter'); }
function closeFilterDropdown() { document.getElementById('filterDropdown').style.display = 'none'; }

// ★ 排序下拉
function toggleSortDropdown() { toggleDropdown('sortDropdown', 'btnSort'); }
function closeSortDropdown() { document.getElementById('sortDropdown').style.display = 'none'; }

// ★ 启动时将下拉面板移到 body，解决移动端 fixed 定位被父容器裁剪的问题
function moveDropdownsToBody() {
  ['timeDropdown','priceDropdown','filterDropdown','sortDropdown'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el && el.parentNode !== document.body) {
      document.body.appendChild(el);
    }
  });
}

function toggleDropdown(panelId, btnId) {
  var panel = document.getElementById(panelId);
  var isOpen = panel.style.display === 'block';
  closeAllDropdowns();
  if (isOpen) return;
  // 确保面板在 body 下（解决移动端 fixed 定位失效）
  if (panel.parentNode !== document.body) {
    document.body.appendChild(panel);
  }
  // 先显示（不可见）以测量真实宽度
  panel.style.visibility = 'hidden';
  panel.style.display = 'block';
  var panelW = panel.offsetWidth;
  var btn = document.getElementById(btnId);
  var rect = btn.getBoundingClientRect();
  var left = rect.left;
  var vw = window.innerWidth;
  // 夹持到视口内（留 8px 边距），防止窄屏手机面板跑出屏幕
  if (left + panelW > vw - 8) left = vw - panelW - 8;
  if (left < 8) left = 8;
  panel.style.top = (rect.bottom + 4) + 'px';
  panel.style.left = left + 'px';
  panel.style.right = 'auto';
  panel.style.visibility = 'visible';
}

// ★ 点击页面其他地方关闭所有下拉
document.addEventListener('click', function(e) {
  var ids = ['timeDropdown','priceDropdown','filterDropdown','sortDropdown'];
  var btns = ['btnTime','btnPrice','btnFilter','btnSort'];
  var anyOpen = ids.some(function(id) { var el = document.getElementById(id); return el && el.style.display === 'block'; });
  if (!anyOpen) return;
  var target = e.target;
  var inside = ids.some(function(id) { var el = document.getElementById(id); return el && el.contains(target); }) ||
               btns.some(function(id) { var el = document.getElementById(id); return el && el.contains(target); });
  if (!inside) closeAllDropdowns();
});

// ★ 首页筛选：设置时间段
function setHomePeriod(period) {
  homePeriod = period;
  var labels = { bl: '近1天', day_3_bl: '近3天', day_7_bl: '近7天' };
  document.getElementById('timeLabel').textContent = labels[period] || '近1天';
  document.querySelectorAll('#timeDropdown .dropdown-item').forEach(function(item) {
    item.classList.toggle('active', item.dataset.period === period);
  });
  closeAllDropdowns();
  renderHomeMovers();
}

// ★ 首页筛选：设置价格区间
function setHomePriceRange(range) {
  homePriceRange = range;
  var labels = { all: '全部价格', lt1w: '< 1万', '1-10w': '1万~10万', '10-100w': '10万~100万', gt100w: '> 100万' };
  document.getElementById('priceLabel').textContent = labels[range] || '全部价格';
  document.querySelectorAll('#priceDropdown .dropdown-item').forEach(function(item) {
    item.classList.toggle('active', item.dataset.range === range);
  });
  closeAllDropdowns();
  renderHomeMovers();
}

// ★ 首页筛选：设置分类（v3：非 all 时确保全量数据就绪）
function setHomeCategory(cat) {
  homeCategoryFilter = cat;
  var label = cat === 'all' ? '筛选' : (CATEGORY_MAP[cat] || cat);
  document.getElementById('filterLabel').textContent = label;
  document.querySelectorAll('.filter-cat-chip').forEach(function(chip) {
    chip.classList.toggle('active', chip.dataset.cat === cat);
  });
  closeAllDropdowns();

  if (cat !== 'all') {
    var prefetched = window.__prefetch || {};
    if (typeof prefetched.isCategoryComplete === 'function' && prefetched.isCategoryComplete(cat)) {
      renderHomeMovers();
    } else {
      var listEl = document.getElementById('homeMoversList');
      if (listEl) {
        listEl.innerHTML = '<div class="loading-container" style="padding:40px"><div class="loading-spinner"></div><div class="loading-text">正在加载 ' + (CATEGORY_MAP[cat] || cat) + ' 完整数据...</div></div>';
      }
      if (typeof prefetched.prioritizeCategory === 'function') prefetched.prioritizeCategory(cat);
      var _catCheckTimer = setInterval(function() {
        if (typeof prefetched.isCategoryComplete === 'function' && prefetched.isCategoryComplete(cat)) {
          clearInterval(_catCheckTimer);
          if (homeCategoryFilter === cat) renderHomeMovers();
        }
      }, 300);
      setTimeout(function() { clearInterval(_catCheckTimer); if (homeCategoryFilter === cat) renderHomeMovers(); }, 10000);
    }
  } else {
    renderHomeMovers();
  }
}

// ★ 首页排序
function setHomeSort(sortBy, sortDir) {
  homeSortBy = sortBy;
  homeSortDir = sortDir;
  var labelText;
  if (sortBy === 'default') {
    labelText = '综合↓';
  } else if (sortBy === 'change') {
    labelText = '涨跌幅' + (sortDir === 'desc' ? '↓' : '↑');
  } else {
    labelText = '价格' + (sortDir === 'desc' ? '↓' : '↑');
  }
  document.getElementById('sortLabel').textContent = labelText;
  document.querySelectorAll('#sortDropdown .dropdown-item').forEach(function(item) {
    item.classList.toggle('active', item.dataset.sort === sortBy && (sortBy === 'default' || item.dataset.dir === sortDir));
  });
  closeAllDropdowns();
  renderHomeMovers();
}

// ★ 重置所有筛选
function resetAllFilters() {
  homeCategoryFilter = 'all';
  homePeriod = 'bl';
  homePriceRange = 'all';
  homeSortBy = 'default';
  homeSortDir = 'desc';

  document.getElementById('timeLabel').textContent = '近1天';
  document.getElementById('priceLabel').textContent = '全部价格';
  document.getElementById('filterLabel').textContent = '筛选';
  document.getElementById('sortLabel').textContent = '综合↓';
  document.querySelectorAll('#timeDropdown .dropdown-item').forEach(function(c) { c.classList.toggle('active', c.dataset.period === 'bl'); });
  document.querySelectorAll('#priceDropdown .dropdown-item').forEach(function(c) { c.classList.toggle('active', c.dataset.range === 'all'); });
  document.querySelectorAll('.filter-cat-chip').forEach(function(c) { c.classList.toggle('active', c.dataset.cat === 'all'); });
  document.querySelectorAll('#sortDropdown .dropdown-item').forEach(function(c) { c.classList.toggle('active', c.dataset.sort === 'default'); });

  closeAllDropdowns();
  renderHomeMovers();
}

// ★ 首页物品列表（懒加载：初始显示 homeMoversCount 条，滚动到底部加载更多）
var _homeDataArriveListener = null;  // 数据就绪后自动重渲染的回调
function renderHomeMovers(resetCount) {
  if (resetCount !== false) homeDisplayCount = homeMoversCount;
  _homeRenderVersion++;              // ★ 递增版本号，使进行中的旧 loadMoreHomeItems rAF 失效
  homeIsLoadingMore = false;         // ★ 解锁：筛选切换后允许新的懒加载
  var listEl = document.getElementById('homeMoversList');
  if (!listEl) return;

  var cached = getCache();
  var all = cached && cached._allItems ? cached._allItems : [];
  if (all.length === 0) {
    all = getPrefetchItems();
  }
  if (all.length === 0) {
    listEl.innerHTML = '<div class="empty-container" style="padding:20px"><div class="empty-text" style="font-size:12px">数据加载中...</div></div>';
    _homeAllFiltered = [];
    // ★ 数据还未到达：注册一次性监听，数据到达后自动重渲染
    if (!_homeDataArriveListener) {
      _homeDataArriveListener = true;
      var prefetched = window.__prefetch || {};
      if (typeof prefetched.onItemsArrive === 'function') {
        prefetched.onItemsArrive(function() {
          _homeDataArriveListener = null;
          var homePage = document.getElementById('page-home');
          if (homePage && homePage.classList.contains('active')) {
            renderHomeMovers();
            checkFavoritePriceChanges();
            renderHomeTopMover();
          }
        });
      }
    }
    return;
  }

  // 筛选
  var filtered = all;
  if (homeCategoryFilter !== 'all') {
    filtered = all.filter(function(item) { return item._category === homeCategoryFilter; });
  }
  if (homePriceRange !== 'all') {
    filtered = filtered.filter(function(item) {
      var p = item.price || 0;
      if (homePriceRange === 'lt1w') return p < 10000;
      if (homePriceRange === '1-10w') return p >= 10000 && p < 100000;
      if (homePriceRange === '10-100w') return p >= 100000 && p < 1000000;
      if (homePriceRange === 'gt100w') return p >= 1000000;
      return true;
    });
  }
  var field = homePeriod;
  filtered = filtered.filter(function(item) {
    var val = getFieldByPeriod(item, field);
    return val != null && !isNaN(val);
  });

  // 排序
  var dirMul = homeSortDir === 'desc' ? -1 : 1;
  if (homeSortBy === 'default') {
    // ★ v3：默认栏目（全部分类）不排序，物品按到达顺序持续填充
    if (homeCategoryFilter !== 'all') {
      filtered.sort(function(a, b) { return (getItemSignificance(b) - getItemSignificance(a)); });
    }
  } else if (homeSortBy === 'change') {
    filtered.sort(function(a, b) {
      return ((getFieldByPeriod(a, field) || 0) - (getFieldByPeriod(b, field) || 0)) * dirMul;
    });
  } else {
    filtered.sort(function(a, b) { return ((a.price || 0) - (b.price || 0)) * dirMul; });
  }

  // ★ 存储全量数据供懒加载使用
  _homeAllFiltered = filtered;

  // 截取当前应显示的数量
  var items = filtered.slice(0, homeDisplayCount);

  if (items.length === 0) {
    listEl.innerHTML = '<div class="empty-container" style="padding:20px"><div class="empty-icon" style="font-size:24px">-</div><div class="empty-text" style="font-size:12px">暂无数据</div></div>';
    return;
  }

  var maxAbsBl = 0;
  items.forEach(function(item) { var a = Math.abs(getFieldByPeriod(item, field) || 0); if (a > maxAbsBl) maxAbsBl = a; });

  var html = items.map(function(item) {
    return _renderHomeItemCard(item, field, maxAbsBl);
  }).join('');

  // ★ 底部加载提示（显示剩余数量）
  if (homeDisplayCount < filtered.length) {
    var remaining = filtered.length - homeDisplayCount;
    html += '<div class="home-load-more" id="homeLoadMore" style="text-align:center;padding:16px;color:#888;font-size:12px">上拉加载更多（剩余 ' + remaining + ' 件）</div>';
  }

  listEl.innerHTML = html;
  _reobserveHomeLoadMore();
}

// ★ 懒加载：追加更多物品
function loadMoreHomeItems() {
  if (homeIsLoadingMore) return;
  if (_homeAllFiltered.length === 0) return;
  // ★ 已全部展示：更新提示文字，不再加载
  if (homeDisplayCount >= _homeAllFiltered.length) {
    var doneTip = document.getElementById('homeLoadMore');
    if (doneTip) doneTip.textContent = '已加载全部 ' + _homeAllFiltered.length + ' 件';
    return;
  }

  homeIsLoadingMore = true;
  var loadMoreEl = document.getElementById('homeLoadMore');
  if (loadMoreEl) loadMoreEl.textContent = '加载中...';

  // ★ 捕获当前版本号，rAF 回调中检验：若筛选已变更则放弃本次追加
  var captureVersion = _homeRenderVersion;

  // 使用 requestAnimationFrame 避免阻塞
  requestAnimationFrame(function() {
    // ★ 筛选已切换 → 放弃本次追加，避免污染新状态
    if (_homeRenderVersion !== captureVersion) {
      homeIsLoadingMore = false;
      return;
    }
    homeDisplayCount = Math.min(homeDisplayCount + HOME_LOAD_MORE, _homeAllFiltered.length);
    var field = homePeriod;

    var existingCards = document.querySelectorAll('#homeMoversList .item-card');
    var existingIds = {};
    for (var i = 0; i < existingCards.length; i++) {
      if (existingCards[i].dataset.itemId) existingIds[existingCards[i].dataset.itemId] = true;
    }

    var newItems = _homeAllFiltered.filter(function(item) {
      return !existingIds[item.id];
    }).slice(0, HOME_LOAD_MORE);

    if (newItems.length === 0) { homeIsLoadingMore = false; return; }

    var maxAbsBl = 0;
    _homeAllFiltered.slice(0, homeDisplayCount).forEach(function(item) {
      var a = Math.abs(getFieldByPeriod(item, field) || 0);
      if (a > maxAbsBl) maxAbsBl = a;
    });

    var fragment = document.createDocumentFragment();
    var div = document.createElement('div');
    div.innerHTML = newItems.map(function(item) {
      return _renderHomeItemCard(item, field, maxAbsBl);
    }).join('');

    // 移除旧的加载提示
    if (loadMoreEl && loadMoreEl.parentNode) loadMoreEl.parentNode.removeChild(loadMoreEl);

    while (div.firstChild) { fragment.appendChild(div.firstChild); }
    var listEl = document.getElementById('homeMoversList');
    if (listEl) listEl.appendChild(fragment);

    // 追加加载提示
    var remaining = _homeAllFiltered.length - homeDisplayCount;
    if (remaining > 0) {
      var tip = document.createElement('div');
      tip.id = 'homeLoadMore';
      tip.style.cssText = 'text-align:center;padding:16px;color:#888;font-size:12px';
      tip.textContent = '上拉加载更多（剩余 ' + remaining + ' 件）';
      if (listEl) listEl.appendChild(tip);
      _reobserveHomeLoadMore();
    } else {
      // 全部加载完成：加入完成提示，1.5s 后自动消失
      var doneTip = document.createElement('div');
      doneTip.id = 'homeLoadMore';
      doneTip.style.cssText = 'text-align:center;padding:16px;color:#4caf50;font-size:12px';
      doneTip.textContent = '已加载全部 ' + _homeAllFiltered.length + ' 件';
      if (listEl) listEl.appendChild(doneTip);
      // ★ 全部加载后断开 observer，避免无效触发
      if (_homeLoadMoreObserver) { _homeLoadMoreObserver.disconnect(); }
      setTimeout(function() {
        var el = document.getElementById('homeLoadMore');
        if (el && el.textContent.indexOf('已加载全部') >= 0) {
          el.textContent = '共 ' + _homeAllFiltered.length + ' 件物品';
        }
      }, 2000);
    }

    homeIsLoadingMore = false;
  });
}

// ★ 使用已排序数据渲染首页（用于首批快速展示，不读缓存）
function renderHomeMoversWithData(items, append) {
  var listEl = document.getElementById('homeMoversList');
  if (!listEl) return;
  if (!items || items.length === 0) {
    if (!append) listEl.innerHTML = '<div class="empty-container" style="padding:20px"><div class="empty-text" style="font-size:12px">数据加载中...</div></div>';
    return;
  }

  // 筛选
  var filtered = items;
  if (homeCategoryFilter !== 'all') {
    filtered = items.filter(function(item) { return item._category === homeCategoryFilter; });
  }
  if (homePriceRange !== 'all') {
    filtered = filtered.filter(function(item) {
      var p = item.price || 0;
      if (homePriceRange === 'lt1w') return p < 10000;
      if (homePriceRange === '1-10w') return p >= 10000 && p < 100000;
      if (homePriceRange === '10-100w') return p >= 100000 && p < 1000000;
      if (homePriceRange === 'gt100w') return p >= 1000000;
      return true;
    });
  }
  var field = homePeriod;
  filtered = filtered.filter(function(item) {
    var val = getFieldByPeriod(item, field);
    return val != null && !isNaN(val);
  });

  if (homeSortBy === 'default') {
    // ★ v3：默认栏目（全部分类）不排序，物品按到达顺序持续填充
    if (homeCategoryFilter !== 'all') {
      filtered.sort(function(a, b) { return (getItemSignificance(b) - getItemSignificance(a)); });
    }
  } else if (homeSortBy === 'change') {
    var dirMul = homeSortDir === 'desc' ? -1 : 1;
    filtered.sort(function(a, b) { return ((getFieldByPeriod(a, field) || 0) - (getFieldByPeriod(b, field) || 0)) * dirMul; });
  } else {
    var dm = homeSortDir === 'desc' ? -1 : 1;
    filtered.sort(function(a, b) { return ((a.price || 0) - (b.price || 0)) * dm; });
  }

  // ★ 存储全量数据
  _homeAllFiltered = filtered;
  homeDisplayCount = homeMoversCount;
  var displayItems = filtered.slice(0, homeDisplayCount);

  if (!append) {
    if (displayItems.length === 0) {
      listEl.innerHTML = '<div class="empty-container" style="padding:20px"><div class="empty-text" style="font-size:12px">暂无数据</div></div>';
      return;
    }
    var maxAbsBl = 0;
    displayItems.forEach(function(item) { var a = Math.abs(getFieldByPeriod(item, field) || 0); if (a > maxAbsBl) maxAbsBl = a; });

    var html = displayItems.map(function(item) {
      return _renderHomeItemCard(item, field, maxAbsBl);
    }).join('');
    if (homeDisplayCount < filtered.length) {
      var remaining = filtered.length - homeDisplayCount;
      html += '<div class="home-load-more" id="homeLoadMore" style="text-align:center;padding:16px;color:#888;font-size:12px">上拉加载更多（剩余 ' + remaining + ' 件）</div>';
    }
    listEl.innerHTML = html;
    _reobserveHomeLoadMore();
  } else {
    var existingIds = {};
    var existingCards = listEl.querySelectorAll('.item-card');
    for (var i = 0; i < existingCards.length; i++) {
      if (existingCards[i].dataset.itemId) existingIds[existingCards[i].dataset.itemId] = true;
    }
    var newItems = displayItems.filter(function(item) { return !existingIds[item.id]; });
    if (newItems.length === 0) return;

    var maxAbsBl2 = 0;
    displayItems.forEach(function(item) { var a = Math.abs(getFieldByPeriod(item, field) || 0); if (a > maxAbsBl2) maxAbsBl2 = a; });

    var fragment = document.createDocumentFragment();
    var tempDiv = document.createElement('div');
    tempDiv.innerHTML = newItems.map(function(item) {
      return _renderHomeItemCard(item, field, maxAbsBl2);
    }).join('');
    while (tempDiv.firstChild) { fragment.appendChild(tempDiv.firstChild); }
    // 移除旧的加载提示
    var oldTip = document.getElementById('homeLoadMore');
    if (oldTip) oldTip.parentNode.removeChild(oldTip);
    listEl.appendChild(fragment);
    if (homeDisplayCount < filtered.length) {
      var tip = document.createElement('div');
      tip.id = 'homeLoadMore';
      tip.style.cssText = 'text-align:center;padding:16px;color:#888;font-size:12px';
      tip.textContent = '上拉加载更多';
      listEl.appendChild(tip);
      _reobserveHomeLoadMore();
    }
  }
}

// ★ 渲染单个首页物品卡片（复用逻辑）
function _renderHomeItemCard(item, field, maxAbsBl) {
  var bl = getFieldByPeriod(item, field) || 0;
  var absBl = Math.abs(bl);
  var gradeBg = (item._category !== 'gun' && item.grade) ? 'background:' + getGradeColor(item.grade) + '15;border-color:' + getGradeColor(item.grade) + '30;' : '';
  var gradeDiamond = (item._category !== 'gun' && item.grade) ? '<div class="grade-diamond" style="background:' + getGradeColor(item.grade) + '"></div>' : '';
  var picHtml = item.pic ? '<img src="' + sanitizeUrl(item.pic) + '" alt="" loading="lazy" decoding="async" onerror="this.parentElement.innerHTML=\'<span class=pic-placeholder>-</span>\'">' : '<span class="pic-placeholder">-</span>';
  var gradeTag = (item._category !== 'gun' && item.grade) ? '<span class="item-grade" style="color:' + getGradeColor(item.grade) + '">' + getGradeText(item.grade) + '</span>' : '';
  // ★ 迷你折线图：用 API 锚点（30d/7d/3d/当前）画趋势，无 localStorage 开销
  var sparkHtml = _renderMiniSparkline(item);
  return '<div class="item-card fade-in" data-item-id="' + item.id + '" onclick="openPriceMover(' + JSON.stringify(item.id) + ')" style="position:relative;' + gradeBg + '">' +
    gradeDiamond +
    '<div class="item-pic">' + picHtml + '</div>' +
    '<div class="item-info">' +
      '<div class="item-name-row">' +
        '<span class="item-name">' + escapeHtml(item.name) + '</span>' +
        gradeTag +
      '</div>' +
      '<div class="item-price-row">' +
        '<span class="item-price">\xA5' + formatPrice(item.price) + '</span>' +
        '<span class="item-change ' + getChangeClass(bl) + '">' + formatChange(bl) + '</span>' +
      '</div>' +
      sparkHtml +
    '</div>' +
    '<span class="item-arrow">›</span>' +
  '</div>';
}

// ★ 迷你折线图（统一使用 getMergedPriceData，整合 API 锚点 + 本地历史 + 云端快照）
function _renderMiniSparkline(item) {
  var pts = getMergedPriceData(item);
  if (!pts || pts.length < 2) return '';
  var prices = pts.map(function(p) { return p.price; });
  var minP = Math.min.apply(null, prices);
  var maxP = Math.max.apply(null, prices);
  var range = (maxP - minP) || 1;
  var W = 60, H = 20;
  var padX = 2, padY = 4;
  var pw = W - padX * 2, ph = H - padY * 2;

  var ptsStr = pts.map(function(p) {
    var safeDay = Math.max(0, Math.min(p.day, 30));
    var x = padX + (1 - safeDay / 30) * pw;
    var y = padY + ph - ((p.price - minP) / range) * ph;
    return x.toFixed(1) + ',' + y.toFixed(1);
  }).join(' ');

  var isUp = pts[pts.length - 1].price >= pts[0].price;
  var color = isUp ? '#4caf50' : '#f44336';

  return '<div class="item-mini-spark" style="margin-top:4px">' +
    '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:60px;height:20px;display:block"><polyline points="' + ptsStr + '" fill="none" stroke="' + color + '" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
  '</div>';
}

// ★ 后台渐进式追加物品到首页（静默更新，不阻塞交互）
function appendHomeItems(newItems) {
  if (!newItems || newItems.length === 0) return;
  renderHomeMoversWithData(newItems, true);
}

// ★ 静默更新首页数据（后台加载完成后更新，保留滚动位置）
var _homeSilentUpdateTimer = null;
function scheduleHomeSilentUpdate() {
  if (_homeSilentUpdateTimer) clearTimeout(_homeSilentUpdateTimer);
  _homeSilentUpdateTimer = setTimeout(function() {
    _homeSilentUpdateTimer = null;
    var homePage = document.getElementById('page-home');
    if (!homePage || !homePage.classList.contains('active')) return;
    var cached = getCache();
    var all = cached && cached._allItems ? cached._allItems : [];
    if (all.length === 0) all = getPrefetchItems();
    if (all.length === 0) return;
    // ★ 如果数据量增加了，用 renderHomeMovers 完整更新（应用当前筛选）
    if (all.length > _homeAllFiltered.length) {
      renderHomeMovers(false);
      checkFavoritePriceChanges();
      renderHomeTopMover();
    }
  }, 500);
}

// ===== 分类图标 =====
function updateCategoryIcons(allItems) {
  if (!allItems || allItems.length === 0) return;
  const existing = getCatIconsCache() || {};
  const picks = {};
  // 浅拷贝 existing 到 picks
  Object.keys(existing).forEach(function(k) { picks[k] = existing[k]; });
  allItems.forEach(function(item) {
    const cat = item._category;
    if (cat && !picks[cat] && item.pic) {
      picks[cat] = item.pic;
    }
  });
  const logisticsItem = allItems.find(function(i) { return i.name === '物流信息单' && i.pic; });
  if (logisticsItem) picks['all'] = logisticsItem.pic;

  setCatIconsCache(picks);
  document.querySelectorAll('.cat-icon[data-cat]').forEach(function(el) {
    const cat = el.dataset.cat;
    if (picks[cat]) {
      el.innerHTML = catIconHTML(picks[cat]);
    }
  });
}

// ===== 列表渲染 =====
function sortItems(items) {
  const sorted = [...items];
  const dir = sortDir === 'asc' ? 1 : -1;
  if (sortBy === 'price') {
    sorted.sort(function(a, b) { return ((a.price || 0) - (b.price || 0)) * dir; });
  } else if (sortBy === 'change') {
    sorted.sort(function(a, b) { return ((a.bl || 0) - (b.bl || 0)) * dir; });
  }
  return sorted;
}

function renderList(items, showCategory) {
  if (showCategory === undefined || showCategory === null) showCategory = false;
  var sorted = sortItems(items);
  var loadedCount = sorted.length;

  // ★ 从预取数据获取 API 真实总数（用于显示准确分页信息）
  var realTotal = 0;
  var isLoadingMore = false;
  if (currentCategory && currentCategory.key && currentCategory.key !== 'fav' && currentCategory.key !== 'all') {
    realTotal = typeof getCategoryTotalCount === 'function' ? getCategoryTotalCount(currentCategory.key) : 0;
    var prefetched = window.__prefetch || {};
    var pCat = prefetched[currentCategory.key];
    isLoadingMore = pCat && pCat._loadingMore === true;
  } else if (currentCategory && currentCategory.key === 'all') {
    var stats = typeof getGlobalStats === 'function' ? getGlobalStats() : null;
    realTotal = stats ? stats.totalItems : 0;
    isLoadingMore = stats ? !stats.allComplete : false;
  }

  // 用真实总数计算分页
  var effectiveTotal = realTotal > loadedCount ? realTotal : loadedCount;
  var totalPages = Math.ceil(effectiveTotal / itemsPerPage) || 1;
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;
  var start = (currentPage - 1) * itemsPerPage;
  var pageItems = sorted.slice(start, start + itemsPerPage);

  // ★ 列表统计：显示真实总数 + 加载状态
  var statsHtml = '<span>共 ' + (realTotal > 0 ? formatLargeNum(realTotal) : loadedCount) + ' 件';
  if (realTotal > 0 && realTotal > loadedCount) {
    statsHtml += ' <span style="font-size:10px;color:#888">(已加载 ' + formatLargeNum(loadedCount) + ')</span>';
  }
  if (isLoadingMore) {
    statsHtml += ' <span style="font-size:10px;color:#6366f1">加载中...</span>';
  }
  statsHtml += ' \xB7 第 ' + currentPage + '/' + totalPages + ' 页</span>';
  if (sorted.length > 0) {
    statsHtml += '<span>更新于 ' + formatTime(sorted[0].is_get_time) + '</span>';
  }
  document.getElementById('listStats').innerHTML = statsHtml;

  const content = document.getElementById('listContent');
  if (sorted.length === 0) {
    var emptyMsg = isLoadingMore ? '正在加载数据，请稍候...' : '暂无物品数据';
    content.innerHTML = '<div class="empty-container"><div class="empty-icon">' + (isLoadingMore ? '' : '-') + '</div><div class="empty-text">' + emptyMsg + '</div></div>';
    document.getElementById('pagination').innerHTML = '';
    return;
  }
  content.innerHTML = pageItems.map(function(item) {
    const bl = item.bl || 0;
    const d30bl = item.day_30_bl || 0;
    const d30p = item.day_30_price || 0;
    const catName = CATEGORY_MAP[item._category] || escapeHtml(item.secondClassCN || '');
    var gradeBg = (item._category !== 'gun' && item.grade) ? 'background:' + getGradeColor(item.grade) + '15;border-color:' + getGradeColor(item.grade) + '30;' : '';
    var gradeDiamond = (item._category !== 'gun' && item.grade) ? '<div class="grade-diamond" style="background:' + getGradeColor(item.grade) + '"></div>' : '';
    var picHtml = item.pic
      ? '<img src="' + sanitizeUrl(item.pic) + '" alt="" loading="lazy" decoding="async" onerror="this.parentElement.innerHTML=\'<span class=pic-placeholder>-</span>\'">'
      : '<span class="pic-placeholder">-</span>';
    var catGradeTag = (item._category !== 'gun' && item.grade) ? '<span class="item-grade" style="color:' + getGradeColor(item.grade) + '">' + getGradeText(item.grade) + '</span>' : '';
    var attrs = [];
    if (showCategory && catName) attrs.push(catName);
    if (item.length && item.width) attrs.push(item.length + '\xD7' + item.width);
    if (item._category !== 'gun' && item.grade) attrs.push(getGradeText(item.grade));
    var attrHtml = attrs.length ? '<div class="item-attrs"><span class="item-attrs-text">' + attrs.join(' \xB7 ') + '</span></div>' : '';
    var trendHtml = d30p ? '\n            <div class="item-trend-mini">\n              <span class="trend-mini-label">30天前:</span>\n              <span class="trend-mini-price">\xA5' + formatPrice(d30p) + '</span>\n              <span class="trend-mini-change ' + getChangeClass(d30bl) + '">' + formatChange(d30bl) + '</span>\n            </div>' : '';
    var pts = getMergedPriceData(item);
    var sparkHtml = pts.length >= 2 ? '<div class="item-sparkline">' + generateSparklineSVG(pts) + '</div>' : '';
    var favIndicator = isFavorited(item.id) ? '<span class="item-fav-indicator"></span>' : '';

    return '<div class="item-card fade-in" style="position:relative;' + gradeBg + '" onclick="openDetail(' + JSON.stringify(item.id) + ')">\n          ' + gradeDiamond + '\n          <div class="item-pic">\n            ' + picHtml + '\n          </div>\n          <div class="item-info">\n            <div class="item-name-row">\n              <span class="item-name">' + escapeHtml(item.name) + '</span>\n              ' + catGradeTag + '\n            </div>\n            <div class="item-price-row">\n              <span class="item-price">\xA5' + formatPrice(item.price) + '</span>\n              <span class="item-change ' + getChangeClass(bl) + '">' + formatChange(bl) + '</span>\n            </div>\n            ' + attrHtml + '\n            ' + trendHtml + '\n          </div>\n          ' + sparkHtml + '\n          <span class="item-arrow">›</span>\n          ' + favIndicator + '\n        </div>';
  }).join('');
  renderPagination(totalPages);
}

function renderPagination(totalPages) {
  const pagination = document.getElementById('pagination');
  if (totalPages <= 1) {
    pagination.innerHTML = '';
    return;
  }
  var startPage = Math.max(1, currentPage - 3);
  var endPage = Math.min(totalPages, currentPage + 3);
  if (endPage - startPage < 6) {
    if (startPage === 1) endPage = Math.min(totalPages, startPage + 6);
    else startPage = Math.max(1, endPage - 6);
  }
  var html = '<div class="pagination">';
  html += '<button class="page-btn arrow ' + (currentPage <= 1 ? 'disabled' : '') + '" onclick="goToPage(' + (currentPage - 1) + ')">◀</button>';
  if (startPage > 1) {
    html += '<button class="page-btn" onclick="goToPage(1)">1</button>';
    if (startPage > 2) html += '<span style="color:#666;padding:0 2px">…</span>';
  }
  for (var i = startPage; i <= endPage; i++) {
    html += '<button class="page-btn' + (i === currentPage ? ' active' : '') + '" onclick="goToPage(' + i + ')">' + i + '</button>';
  }
  if (endPage < totalPages) {
    if (endPage < totalPages - 1) html += '<span style="color:#666;padding:0 2px">…</span>';
    html += '<button class="page-btn" onclick="goToPage(' + totalPages + ')">' + totalPages + '</button>';
  }
  html += '<button class="page-btn arrow ' + (currentPage >= totalPages ? 'disabled' : '') + '" onclick="goToPage(' + (currentPage + 1) + ')">▶</button>';
  html += '</div>';
  pagination.innerHTML = html;
}

// ===== 搜索历史 =====
function renderSearchHistory() {
  const history = getSearchHistory();
  const section = document.getElementById('searchHistory');
  const tags = document.getElementById('historyTags');
  if (history.length === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';
  tags.innerHTML = history.map(function(kw) {
    return '<span class="history-tag" onclick="searchFromHistory(\'' + escapeJSStr(kw) + '\')">' + escapeHtml(kw) + '</span>';
  }).join('');
}

// ===== 最近浏览 =====
function renderRecentViews() {
  const views = getRecentViews();
  const section = document.getElementById('recentViewSection');
  const container = document.getElementById('recentViewItems');
  if (views.length === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';
  container.innerHTML = views.map(function(item) {
    const bl = item.bl || 0;
    var picHtml = item.pic
      ? '<img src="' + sanitizeUrl(item.pic) + '" alt="" loading="lazy" decoding="async" onerror="this.parentElement.innerHTML=\'<span class=pic-placeholder style=font-size:20px>-</span>\'">'
      : '<span class="pic-placeholder" style="font-size:20px">-</span>';
    return '\n        <div class="result-item fade-in" onclick="openDetailFromRecent(' + JSON.stringify(item.id) + ')">\n          <div class="item-pic" style="width:40px;height:40px;margin-right:10px">\n            ' + picHtml + '\n          </div>\n          <div class="item-info">\n            <div class="item-name-row">\n              <span class="item-name">' + escapeHtml(item.name) + '</span>\n              <span style="font-size:10px;color:#667eea;margin-left:6px">' + escapeHtml(CATEGORY_MAP[item._category] || item.secondClassCN || '') + '</span>\n            </div>\n            <div class="item-price-row">\n              <span class="item-price">\xA5' + formatPrice(item.price) + '</span>\n              <span class="item-change ' + getChangeClass(bl) + '">' + formatChange(bl) + '</span>\n            </div>\n          </div>\n          <span class="item-arrow">›</span>\n        </div>';
  }).join('');
}

// ===== 收藏列表 =====
function renderFavorites() {
  const favs = getFavorites();
  const section = document.getElementById('favoritesSection');
  const container = document.getElementById('favoritesItems');
  if (favs.length === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';
  container.innerHTML = favs.map(function(item) {
    const bl = item.bl || 0;
    var picHtml = item.pic
      ? '<img src="' + sanitizeUrl(item.pic) + '" alt="" loading="lazy" decoding="async" onerror="this.parentElement.innerHTML=\'<span class=pic-placeholder style=font-size:20px>-</span>\'">'
      : '<span class="pic-placeholder" style="font-size:20px">-</span>';
    return '\n        <div class="result-item fade-in" onclick="openDetailFromFavorite(' + JSON.stringify(item.id) + ')">\n          <div class="item-pic" style="width:40px;height:40px;margin-right:10px">\n            ' + picHtml + '\n          </div>\n          <div class="item-info">\n            <div class="item-name-row">\n              <span class="item-name">' + escapeHtml(item.name) + '</span>\n              <span style="font-size:10px;color:#667eea;margin-left:6px">' + escapeHtml(CATEGORY_MAP[item._category] || item.secondClassCN || '') + '</span>\n            </div>\n            <div class="item-price-row">\n              <span class="item-price">\xA5' + formatPrice(item.price) + '</span>\n              <span class="item-change ' + getChangeClass(bl) + '">' + formatChange(bl) + '</span>\n            </div>\n          </div>\n          <span class="item-arrow">›</span>\n        </div>';
  }).join('');
}

// ===== 详情页 =====
function renderDetail(item) {
  const bl = item.bl || 0;
  const d3bl = item.day_3_bl || 0;
  const d7bl = item.day_7_bl || 0;
  const d30bl = item.day_30_bl || 0;
  const d3p = item.day_3_price || 0;
  const d7p = item.day_7_price || 0;
  const d30p = item.day_30_price || 0;
  const price = item.price || 0;
  const pricePoints = getMergedPriceData(item);

  var picHtml = item.pic
    ? '<img src="' + sanitizeUrl(item.pic) + '" alt="" decoding="async" fetchpriority="high" onerror="this.parentElement.innerHTML=\'<span style=font-size:36px>-</span>\'">'
    : '<span style="font-size:36px">-</span>';
  var metaHtml = '';
  if (item.secondClassCN) metaHtml += '<span class="meta-tag">' + escapeHtml(item.secondClassCN) + '</span>';
  if (item.grade) metaHtml += '<span class="meta-tag" style="color:' + getGradeColor(item.grade) + '">' + getGradeText(item.grade) + '</span>';
  var descHtml = item.desc ? '<div style="font-size:11px;color:#666;margin-top:6px;line-height:1.5">' + escapeHtml(item.desc) + '</div>' : '';

  var propsHtml = '';
  if (item.length || item.width || item.weight || item.Weight) {
    var propItems = '';
    if (item.secondClassCN) propItems += '<div class="info-item"><span class="info-label">分类</span><span class="info-value">' + escapeHtml(item.secondClassCN) + '</span></div>';
    if (item.length && item.width) propItems += '<div class="info-item"><span class="info-label">占格</span><span class="info-value">' + item.length + '\xD7' + item.width + '</span></div>';
    if (item.weight || item.Weight) propItems += '<div class="info-item"><span class="info-label">重量</span><span class="info-value">' + (item.weight || item.Weight) + ' kg</span></div>';
    if (item.grade) propItems += '<div class="info-item"><span class="info-label">等级</span><span class="info-value" style="color:' + getGradeColor(item.grade) + '">' + getGradeText(item.grade) + '</span></div>';
    if (item.objectID) propItems += '<div class="info-item"><span class="info-label">ID</span><span class="info-value" style="font-size:13px">' + escapeHtml(item.objectID) + '</span></div>';
    propsHtml = '\n      <div class="section">\n        <div class="section-title">物品属性</div>\n        <div class="info-grid">' + propItems + '</div>\n      </div>';
  }

  const detailContent = document.getElementById('detailContent');
  detailContent.innerHTML = '\n      <div class="detail-header">\n        <div class="detail-pic">\n          ' + picHtml + '\n        </div>\n        <div class="detail-basic">\n          <div class="detail-name">' + escapeHtml(item.name) + '</div>\n          <div class="detail-meta">\n            ' + metaHtml + '\n          </div>\n          ' + descHtml + '\n        </div>\n      </div>\n\n      <div class="price-card">\n        <div class="price-card-header">\n          <span class="price-card-title">当前价格</span>\n          <span class="price-card-time">更新于 ' + formatTime(item.is_get_time) + '</span>\n        </div>\n        <div class="price-main">\n          <span class="price-currency">\xA5</span>\n          <span class="price-value">' + formatPrice(price) + '</span>\n        </div>\n        <div class="price-sub">\n          <div class="sub-item">\n            <span class="sub-label">今日开盘</span>\n            <span class="sub-value">\xA5' + formatPrice(item.price_start || item.priceStart || 0) + '</span>\n          </div>\n          <div class="sub-item">\n            <span class="sub-label">今日涨跌</span>\n            <span class="sub-value ' + getChangeClass(bl) + '">' + formatChange(bl) + '</span>\n          </div>\n        </div>\n      </div>\n\n      <div class="section">\n        <div class="section-title">近30天价格趋势</div>\n        <div class="price-curve-box">\n          ' + generatePriceCurveSVG(pricePoints) + '\n          <div class="curve-legend">\n            <div class="curve-legend-item"><span class="curve-legend-dot" style="background:#888"></span>30天前 \xA5' + formatPrice(d30p) + ' <span class="' + getChangeClass(d30bl) + '" style="font-size:10px">' + formatChange(d30bl) + '</span></div>\n            <div class="curve-legend-item"><span class="curve-legend-dot" style="background:#667eea"></span>7天前 \xA5' + formatPrice(d7p) + ' <span class="' + getChangeClass(d7bl) + '" style="font-size:10px">' + formatChange(d7bl) + '</span></div>\n            <div class="curve-legend-item"><span class="curve-legend-dot" style="background:#4caf50"></span>3天前 \xA5' + formatPrice(d3p) + ' <span class="' + getChangeClass(d3bl) + '" style="font-size:10px">' + formatChange(d3bl) + '</span></div>\n            <div class="curve-legend-item"><span class="curve-legend-dot" style="background:#ffd700"></span>当前 \xA5' + formatPrice(price) + '</div>\n          </div>\n        </div>\n      </div>\n\n      ' + propsHtml + '\n\n      <div class="source-note">\n        <span>数据来源：三角洲数据帝 orzice.com 开放平台</span>\n        <span>禁止编造或篡改任何价格信息</span>\n      </div>\n    ';
  updateFavoriteButton(item.id);

  // 异步拉取云端历史数据，渐入更新图表
  getOrFetchCloudSnapshots(item.id).then(function(cloudSnaps) {
    if (!cloudSnaps || cloudSnaps.length === 0) return;

    var cloudPricePoints = getMergedPriceData(item, cloudSnaps);
    var svgContainer = document.querySelector('.price-curve-box');
    if (!svgContainer || cloudPricePoints.length < 2) return;

    var oldSvg = svgContainer.querySelector('svg');
    var legendEl = svgContainer.querySelector('.curve-legend');
    var newSvg = generatePriceCurveSVG(cloudPricePoints);

    // 渐入过渡：先淡出旧图，替换后淡入新图
    if (oldSvg) {
      oldSvg.style.opacity = '0';
      setTimeout(function() {
        svgContainer.innerHTML = newSvg + (legendEl ? legendEl.outerHTML : '');
        var newSvgEl = svgContainer.querySelector('svg');
        if (newSvgEl) newSvgEl.style.opacity = '1';
      }, 260);
    } else {
      svgContainer.innerHTML = newSvg + (legendEl ? legendEl.outerHTML : '');
    }
  }).catch(function(e) {
    console.log('[详情] 云端历史获取失败，使用本地数据');
  });
}

function updateFavoriteButton(itemId) {
  const btn = document.getElementById('detailFavBtn');
  if (!btn) return;
  if (isFavorited(itemId)) {
    btn.classList.add('favorited');
  } else {
    btn.classList.remove('favorited');
  }
}

// ===== 搜索结果 =====
function renderSearchResults(results, keyword) {
  const container = document.getElementById('searchResults');
  if (results.length === 0) {
    container.innerHTML = '<div class="empty-container"><div class="empty-icon">-</div><div class="empty-text">未找到 "' + escapeHtml(keyword) + '" 相关物品</div></div>';
    return;
  }
  container.innerHTML = '<div style="padding:10px 16px;font-size:12px;color:#888">找到 ' + results.length + ' 个结果</div>' +
    results.map(function(item) {
      const bl = item.bl || 0;
      var picHtml = item.pic
        ? '<img src="' + sanitizeUrl(item.pic) + '" alt="" loading="lazy" decoding="async" onerror="this.parentElement.innerHTML=\'<span class=pic-placeholder style=font-size:20px>-</span>\'">'
        : '<span class="pic-placeholder" style="font-size:20px">-</span>';
      return '\n          <div class="result-item fade-in" onclick="openDetailFromSearch(' + JSON.stringify(item.id) + ')">\n            <div class="item-pic" style="width:40px;height:40px;margin-right:10px">\n              ' + picHtml + '\n            </div>\n            <div class="item-info">\n              <div class="item-name-row">\n                <span class="item-name">' + escapeHtml(item.name) + '</span>\n                <span class="item-grade" style="background:rgba(102,126,234,0.15);color:#667eea;font-size:10px;padding:2px 8px;border-radius:8px;margin-left:8px">' + escapeHtml(CATEGORY_MAP[item._category] || item.secondClassCN || '') + '</span>\n              </div>\n              <div class="item-price-row">\n                <span class="item-price">\xA5' + formatPrice(item.price) + '</span>\n                <span class="item-change ' + getChangeClass(bl) + '">' + formatChange(bl) + '</span>\n              </div>\n            </div>\n            <span class="item-arrow">›</span>\n          </div>';
    }).join('');
}

// ===== 价格异动页 =====
function getFieldByPeriod(item, field) {
  // ★ 容错：字段不存在或为 null/undefined 时返回 0，防止筛选把旧缓存数据全部滤掉
  if (field === 'bl') return (item.bl != null) ? item.bl : 0;
  if (field === 'day_3_bl') return (item.day_3_bl != null) ? item.day_3_bl : 0;
  if (field === 'day_7_bl') return (item.day_7_bl != null) ? item.day_7_bl : 0;
  return (item.bl != null) ? item.bl : 0;
}

function getPrefetchItems() {
  var prefetched = window.__prefetch;
  if (!prefetched) return [];
  var cats = Object.keys(prefetched);
  var all = [];
  for (var i = 0; i < cats.length; i++) {
    var p = prefetched[cats[i]];
    if (p && p._resolvedData) {
      all = all.concat(p._resolvedData);
    }
  }
  return all;
}

// ===== 获取分类图标 =====
var _topMoverApiDone = false;
function renderHomeTopMover() {
  var el = document.getElementById('topMover');
  if (!el) return;

  var cached = getCache();
  var all = cached && cached._allItems ? cached._allItems : getPrefetchItems();

  if (all.length === 0) {
    if (!_topMoverFirstRetryDone) {
      _topMoverFirstRetryDone = true;
      setTimeout(function() { renderHomeTopMover(); }, 100);
    }
    if (!el.innerHTML || el.innerHTML.trim() === '') { el.style.display = 'none'; }
    return;
  }

  // ★ v3：prefetch 已将 item_price_all 真实价格注入所有物品
  var prefetched = window.__prefetch || {};
  _topMoverApiDone = !!(prefetched._topMoverApiDone);

  _renderTopMoverFromData(all);
}

/** 从给定数据中提取涨幅前二并渲染 */
function _renderTopMoverFromData(all) {
  var el = document.getElementById('topMover');
  if (!el) return;
  var candidates = [];
  all.forEach(function(item) {
    if (!item.price || item.price < 20000) return;
    var v = item.day_7_bl;
    var isDay7 = v != null && v > 0.01;
    if (!isDay7) { v = item.bl; }
    if (v != null && v > 0.01) {
      candidates.push({ item: item, val: v, isDay7: isDay7 });
    }
  });
  if (candidates.length === 0) {
    el.style.display = 'none';
    return;
  }
  candidates.sort(function(a, b) { return b.val - a.val; });
  var top2 = candidates.slice(0, 2);
  el.style.display = 'block';
  el.innerHTML = '<div style="padding:8px 0">' +
    top2.map(function(t, idx) {
      var item = t.item;
      var val = t.val;
      var label = idx === 0 ? '涨幅第一' : '涨幅第二';
      var periodText = t.isDay7 ? '近7天' : '今日';
      var freshness = _topMoverApiDone ? ' <span style="font-size:9px;color:#4fc3f7;font-weight:normal">●实时</span>' : '';
      var picHtml = item.pic
        ? '<img src="' + sanitizeUrl(item.pic) + '" alt="" style="width:36px;height:36px;border-radius:6px;object-fit:contain;margin-right:10px" onerror="this.style.display=\'none\'">'
        : '';
      return '<div class="tm-row" onclick="openTopMover(' + JSON.stringify(item.id) + ')" style="display:flex;align-items:center;padding:6px 16px;cursor:pointer;transition:all 0.15s">' +
        picHtml +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:10px;color:#8890b0;line-height:1.3">' + periodText + ' ' + label + freshness + '</div>' +
          '<div style="font-size:13px;font-weight:bold;color:#e0e0e0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escapeHtml(item.name) + '</div>' +
        '</div>' +
        '<div style="text-align:right;margin-left:8px;flex-shrink:0">' +
          '<div style="font-size:13px;color:#ffd700;font-weight:500">\xA5' + formatPrice(item.price) + '</div>' +
          '<div style="font-size:12px;font-weight:bold;color:#4caf50">' + (val > 0 ? '+' : '') + val.toFixed(2) + '%</div>' +
        '</div>' +
      '</div>';
    }).join('') +
  '</div>';
}

// ===== 收藏标签页 =====
function renderFavTab() {
  const content = document.getElementById('favtabContent');
  const favs = getFavorites();
  if (favs.length === 0) {
    content.innerHTML = '<div class="empty-container"><div class="empty-icon">-</div><div class="empty-text">暂无收藏物品，在物品详情页收藏</div></div>';
    return;
  }
  const cached = getCache();
  const allItems = cached && cached._allItems ? cached._allItems : [];
  const items = favs.map(function(fav) {
    const full = allItems.find(function(i) { return i.id === fav.id; });
    return full ? Object.assign({}, fav, full) : fav;
  });
  content.innerHTML = '\n      <div class="list-stats">\n        <span>共 ' + items.length + ' 件收藏</span>\n        <span class="history-clear" onclick="clearFavorites(); renderFavTab();" style="color:#f44336;cursor:pointer">清空收藏</span>\n      </div>\n      ' + items.map(function(item) {
        const bl = item.bl || 0;
        var picHtml = item.pic
          ? '<img src="' + sanitizeUrl(item.pic) + '" alt="" loading="lazy" decoding="async" onerror="this.parentElement.innerHTML=\'<span class=pic-placeholder>-</span>\'">'
          : '<span class="pic-placeholder">-</span>';
        return '\n        <div class="item-card fade-in" onclick="openPriceMover(' + JSON.stringify(item.id) + ')" style="position:relative">\n          <div class="item-pic">\n            ' + picHtml + '\n          </div>\n          <div class="item-info">\n            <div class="item-name-row">\n              <span class="item-name">' + escapeHtml(item.name) + '</span>\n              <span style="font-size:10px;color:#667eea;margin-left:6px">' + escapeHtml(CATEGORY_MAP[item._category] || item.secondClassCN || '') + '</span>\n            </div>\n            <div class="item-price-row">\n              <span class="item-price">\xA5' + formatPrice(item.price) + '</span>\n              <span class="item-change ' + getChangeClass(bl) + '">' + formatChange(bl) + '</span>\n            </div>\n          </div>\n          <span class="item-arrow">›</span>\n        </div>';
      }).join('');
}

// ===== SVG 图表 =====
function generatePriceCurveSVG(pricePoints) {
  if (!pricePoints || pricePoints.length < 2) return '<div style="text-align:center;color:#666;padding:30px">数据不足，无法生成曲线</div>';
  var _gradId = 'grad_' + (generatePriceCurveSVG._seq = (generatePriceCurveSVG._seq || 0) + 1); // 自增计数器，防止同时存在多个 SVG 时 ID 冲突
  var pts = pricePoints.slice().sort(function(a, b) { return b.day - a.day; });
  var allPrices = pts.map(function(p) { return p.price; });
  var minPrice = Math.min.apply(null, allPrices);
  var maxPrice = Math.max.apply(null, allPrices);
  var priceRange = (maxPrice - minPrice) || 1;
  var paddedMin = minPrice - priceRange * 0.08;

  var W = 320, H = 170;
  var PAD = { top: 22, right: 14, bottom: 28, left: 52 };
  var plotW = W - PAD.left - PAD.right;
  var plotH = H - PAD.top - PAD.bottom;

  // 先计算均匀 Y 轴刻度，再将上限对齐到刻度线
  function niceStepSize(range, targetSteps) {
    var rough = range / targetSteps;
    var exp = Math.pow(10, Math.floor(Math.log10(rough)));
    var f = rough / exp;
    var nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 5 ? 5 : 10;
    return nf * exp;
  }
  var roughRange = maxPrice - paddedMin;
  var yStep = niceStepSize(roughRange, 4);
  var yMin = Math.floor(paddedMin / yStep) * yStep;
  var yMax = Math.ceil(maxPrice / yStep) * yStep;
  var paddedMax = yMax;         // 上限对齐刻度线
  paddedMin = yMin;             // 下限也对齐
  var paddedRange = paddedMax - paddedMin || 1;

  var dataPoints = pts.map(function(p) {
    return {
      x: PAD.left + (1 - p.day / 30) * plotW,
      y: PAD.top + plotH - ((p.price - paddedMin) / paddedRange) * plotH,
      day: p.day, price: p.price, hist: !!p.hist, cloud: !!p.cloud
    };
  });

  function catmullRom(p0, p1, p2, p3, t) {
    var t2 = t * t, t3 = t2 * t;
    return 0.5 * (
      (2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3
    );
  }

  var smoothPts = [];
  for (var i = 0; i < dataPoints.length; i++) {
    if (i === 0) {
      smoothPts.push({ x: dataPoints[0].x, y: dataPoints[0].y });
      continue;
    }
    var p0 = dataPoints[Math.max(0, i - 2)];
    var p1 = dataPoints[i - 1];
    var p2 = dataPoints[i];
    var p3 = dataPoints[Math.min(dataPoints.length - 1, i + 1)];
    var steps = Math.max(8, Math.round((p2.x - p1.x) / 0.8));
    for (var s = 1; s <= steps; s++) {
      var t = s / steps;
      var cx = catmullRom(p0.x, p1.x, p2.x, p3.x, t);
      var cy = catmullRom(p0.y, p1.y, p2.y, p3.y, t);
      smoothPts.push({ x: cx, y: cy });
    }
  }

  var pathD = '';
  smoothPts.forEach(function(p, idx) {
    pathD += (idx === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1) + ' ';
  });
  var firstX = smoothPts[0].x.toFixed(1);
  var lastX = smoothPts[smoothPts.length - 1].x.toFixed(1);
  var bottomY = (PAD.top + plotH).toFixed(1);
  var areaD = pathD + 'L' + lastX + ',' + bottomY + ' L' + firstX + ',' + bottomY + ' Z';

  // 生成均匀 Y 轴刻度标签
  var yTicks = [];
  for (var p = yMin; p <= yMax + yStep * 0.01; p += yStep) {
    yTicks.push({
      price: p,
      y: PAD.top + plotH - ((p - paddedMin) / paddedRange) * plotH
    });
  }

  var xTicks = [30, 25, 20, 15, 10, 5, 0];
  var nowDate = new Date();
  var xTickLabels = {};
  xTicks.forEach(function(d) {
    var dt = new Date(nowDate.getTime() - d * 86400000);
    xTickLabels[d] = (dt.getMonth() + 1) + '/' + dt.getDate();
  });

  var markers = dataPoints.map(function(dp) {
    return { x: dp.x, y: dp.y, price: dp.price, day: dp.day, isCurrent: dp.day === 0, isHist: dp.hist, isCloud: dp.cloud };
  });

  return '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg">' +
    '<defs>' +
      '<linearGradient id="' + _gradId + '" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="#667eea" stop-opacity="0.28"/>' +
        '<stop offset="100%" stop-color="#667eea" stop-opacity="0.03"/>' +
      '</linearGradient>' +
    '</defs>' +
    yTicks.map(function(tk) {
      return '<line x1="' + PAD.left + '" y1="' + tk.y.toFixed(1) + '" x2="' + (W - PAD.right) + '" y2="' + tk.y.toFixed(1) + '" stroke="rgba(255,255,255,0.08)" stroke-dasharray="3,4"/>' +
        '<text x="' + (PAD.left - 6) + '" y="' + tk.y.toFixed(1) + '" text-anchor="end" fill="#888" font-size="9" dominant-baseline="middle">\xA5' + shortPrice(tk.price) + '</text>';
    }).join('') +
    xTicks.map(function(d) {
      var xx = PAD.left + (1 - d / 30) * plotW;
      var label = xTickLabels[d] || '';
      return '<line x1="' + xx.toFixed(1) + '" y1="' + PAD.top + '" x2="' + xx.toFixed(1) + '" y2="' + (PAD.top + plotH) + '" stroke="rgba(255,255,255,0.05)" stroke-dasharray="2,5"/>' +
        '<line x1="' + xx.toFixed(1) + '" y1="' + (PAD.top + plotH) + '" x2="' + xx.toFixed(1) + '" y2="' + (PAD.top + plotH + 4) + '" stroke="rgba(255,255,255,0.3)"/>' +
        '<text x="' + xx.toFixed(1) + '" y="' + (H - 4) + '" text-anchor="middle" fill="#888" font-size="8">' + label + '</text>';
    }).join('') +
    '<path d="' + areaD + '" fill="url(#' + _gradId + ')"/>' +
    '<path d="' + pathD + '" fill="none" stroke="#667eea" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
    markers.map(function(m) {
      var dotColor = m.isCurrent ? '#ffd700' : '#667eea';
      // 微小点标注（当前日稍大，其余统一小点，无描边）
      var r = m.isCurrent ? 2.5 : 1.5;
      return '<circle cx="' + m.x.toFixed(1) + '" cy="' + m.y.toFixed(1) + '" r="' + r + '" fill="' + dotColor + '"/>';
    }).join('') +
  '</svg>';
}

function generateSparklineSVG(pricePoints) {
  if (!pricePoints || pricePoints.length < 2) return '';
  var prices = pricePoints.map(function(p) { return p.price; });
  var minP = Math.min.apply(null, prices);
  var maxP = Math.max.apply(null, prices);
  var range = (maxP - minP) || 1;
  var W = 68, H = 24;
  var padX = 3, padY = 3;
  var pw = W - padX * 2, ph = H - padY * 2;

  var ptsStr = pricePoints.map(function(p) {
    var safeDay = Math.max(0, Math.min(p.day, 30)); // 修复：防止day越界导致x坐标为负
    var x = padX + (1 - safeDay / 30) * pw;
    var y = padY + ph - ((p.price - minP) / range) * ph;
    return x.toFixed(1) + ',' + y.toFixed(1);
  }).join(' ');

  var firstPrice = pricePoints[0].price;
  var lastPrice = pricePoints[pricePoints.length - 1].price;
  var isUp = lastPrice >= firstPrice;
  var color = isUp ? '#4caf50' : '#f44336';

  return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="item-sparkline-svg"><polyline points="' + ptsStr + '" fill="none" stroke="' + color + '" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

// ===== main.js =====
// ===== 入口文件（初始化路由、绑定全局事件） =====

// ===== 状态变量 =====
const pages = {};
['home', 'list', 'detail', 'search', 'favtab'].forEach(function(id) {
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

// ===== Tab 切换（★ 预暖：切换标签瞬间响应） =====
var _favTabDataReady = false;
var _favTabPreWarmed = false;

function preWarmFavTab() {
  if (_favTabPreWarmed) return;
  _favTabPreWarmed = true;
  // 确保收藏数据与缓存数据合并完成
  var cached = getCache();
  if (cached && cached._allItems && cached._allItems.length > 0) {
    // 数据已就绪，标记收藏页可用
    _favTabDataReady = true;
  }
}

function switchTab(tabName) {
  document.querySelectorAll('.bottom-nav .tab').forEach(function(t) { t.classList.remove('active'); });
  var tab = document.querySelector('.bottom-nav .tab[data-tab="' + tabName + '"]');
  if (tab) tab.classList.add('active');
  Object.values(pages).forEach(function(p) { p.classList.remove('active'); });
  const target = document.getElementById('page-' + tabName);
  if (target) {
    target.classList.add('active');
    pageStack = [tabName];
    if (tabName === 'home') {
      checkFavoritePriceChanges();
      renderHomeTopMover();
      renderHomeMovers();
      // ★ 后台预暖收藏页数据
      setTimeout(function() { preWarmFavTab(); }, 300);
    }
    if (tabName === 'favtab') {
      // ★ 如果缓存未就绪，异步加载后渲染
      if (!_favTabDataReady) {
        var cached = getCache();
        if (cached && cached._allItems && cached._allItems.length > 0) {
          _favTabDataReady = true;
        }
      }
      renderFavTab();
      // 后台确保数据最新
      if (!_favTabDataReady) {
        loadAllItems(false).then(function() {
          _favTabDataReady = true;
          if (pageStack[pageStack.length - 1] === 'favtab') renderFavTab();
        });
      }
    }
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

  var content = document.getElementById('listContent');
  content.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><div class="loading-text">加载' + name + '...</div></div>';
  document.getElementById('listStats').innerHTML = '';

  try {
    var cached = getCache();
    var items;
    var fromCache = false;

    // ★ 优先使用预取数据（即使不完整也先展示出来）
    var prefetched = window.__prefetch || {};
    var pCat = prefetched[key];
    if (pCat && pCat._resolvedData && pCat._resolvedData.length > 0) {
      items = pCat._resolvedData.slice();
      fromCache = true;
      // 如果数据不完整，监听完成回调
      if (!pCat._complete && typeof pCat._onComplete !== 'function') {
        pCat._onComplete = function(fullItems) {
          if (currentCategory && currentCategory.key !== key) return;
          if (fullItems && fullItems.length > listItems.length) {
            listItems = fullItems;
            renderList(fullItems, false);
            // 更新缓存
            var c3 = getCache();
            if (c3 && c3._allItems) {
              var others = c3._allItems.filter(function(i) { return i._category !== key; });
              c3._allItems = others.concat(fullItems);
              setCache(c3);
            }
          }
        };
      }
    } else if (cached && cached._allItems) {
      items = cached._allItems.filter(function(i) { return i._category === key; });
      fromCache = items && items.length > 0;
    }

    if (!fromCache) {
      items = await fetchCategoryAll(key);
      if (items && items.length > 0) {
        var c2 = getCache();
        if (c2 && c2._allItems) {
          var otherItems = c2._allItems.filter(function(i) { return i._category !== key; });
          c2._allItems = otherItems.concat(items);
          setCache(c2);
        }
      }
    }
    if (currentCategory && currentCategory.key !== key) return;
    listItems = items;
    renderList(items, false);

    // ★ 如果用的是首页不完整数据，后台加载完整数据
    if (fromCache && pCat && pCat._loadingMore) {
      // _onComplete 已注册，会在后台加载完成后自动更新列表
    } else if (fromCache) {
      // 缓存数据存在时后台静默刷新
      fetchCategoryAll(key).then(function(freshItems) {
        if (currentCategory && currentCategory.key !== key) return;
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
    if (currentCategory && currentCategory.key !== key) return;
    console.error('加载失败:', err);
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

  // ★ 优先用预取首页数据快速展示
  var prefetched = window.__prefetch || {};
  var hasAnyPage1 = false;
  var page1All = [];
  CATEGORIES.forEach(function(cat) {
    var p = prefetched[cat.key];
    if (p && p._resolvedData && p._resolvedData.length > 0) {
      page1All = page1All.concat(p._resolvedData);
      hasAnyPage1 = true;
    }
  });
  if (hasAnyPage1) {
    items = page1All;
  }

  // 检查缓存
  if (!items || items.length === 0) {
    try {
      var cached = getCache();
      if (cached && cached._allItems && cached._allItems.length > 0) {
        items = cached._allItems;
      }
    } catch(e) { console.error('openAllItems getCache 失败:', e); }
  }

  // 如果没有预取也没有缓存，等待完整加载
  if (!items || items.length === 0) {
    try { items = await loadAllItems(); } catch(e) { console.error('loadAllItems error:', e); }
  }

  // 最后兜底
  if (!items || items.length === 0) {
    try {
      var allResults = await Promise.all(CATEGORIES.map(function(cat) {
        return fetchCategoryAll(cat.key).catch(function() { return []; });
      }));
      items = Array.prototype.concat.apply([], allResults);
      if (items && items.length > 0) { setCache({ _allItems: items }); }
    } catch(e) { console.error('fetchCategoryAll error:', e); }
  }

  if (!items || items.length === 0) {
    content.innerHTML = '<div class="error-container"><div class="error-text">暂无数据，请检查网络后刷新重试</div><button class="retry-btn" onclick="openAllItems()">重试</button></div>';
    return;
  }
  if (currentCategory && currentCategory.key !== 'all') return;
  listItems = items;
  renderList(items, true);

  // ★ 后台静默加载完整数据
  if (!isPrefetchComplete() && typeof loadAllItemsBackground === 'function') {
    loadAllItemsBackground(items).then(function(fullItems) {
      if (currentCategory && currentCategory.key !== 'all') return;
      if (fullItems && fullItems.length > listItems.length) {
        listItems = fullItems;
        renderList(fullItems, true);
      }
    });
  }
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
  // ★ 兜底：从收藏/最近浏览中恢复已从 API 删除的物品数据
  var locals = (getFavorites()).concat(getRecentViews());
  for (var li = 0; li < locals.length; li++) {
    if (locals[li].id === itemId) return locals[li];
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

// ★ 统一入口：从任意来源打开物品详情
function openDetailFromSource(itemId, notFoundMsg) {
  var item = findItemAnywhere(itemId);
  if (!item) {
    toast(notFoundMsg || '未找到该物品');
    return;
  }
  listItems = [item];
  currentItem = item;
  currentCategory = { key: item._category, name: CATEGORY_MAP[item._category] || '物品' };
  openDetail(itemId);
}

function openDetailFromRecent(itemId) { openDetailFromSource(itemId, '该物品数据已过期，请刷新后重试'); }
function openDetailFromFavorite(itemId) { openDetailFromSource(itemId, '该物品数据已过期，请刷新后重试'); }
function openDetailFromSearch(itemId) { openDetailFromSource(itemId, '未找到该物品数据'); }
function openPriceMover(itemId) { openDetailFromSource(itemId, '未找到该物品'); }
function openTopMover(itemId) { if (itemId) openDetailFromSource(itemId, '未找到该物品'); }

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
    // ★ 优先用 _quick 首页数据快速搜索
    try {
      var prefetched = window.__prefetch || {};
      // 先用已就绪的 _resolvedData
      var fallbackItems = [];
      CATEGORIES.forEach(function(cat) {
        var p = prefetched[cat.key];
        if (p && p._resolvedData && p._resolvedData.length > 0) {
          fallbackItems = fallbackItems.concat(p._resolvedData);
        }
      });
      if (fallbackItems.length > 0) {
        allItems = fallbackItems;
      } else {
        // fallback: 等待 _quick promises
        var quickResults = await Promise.all(CATEGORIES.map(function(cat) {
          var p = prefetched[cat.key];
          if (!p || !p._quick) return Promise.resolve([]);
          return p._quick.then(function(r) {
            if (r && r.data) return r.data.map(function(item) { return Object.assign({}, item, { _category: cat.key }); });
            return [];
          }).catch(function() { return []; });
        }));
        allItems = Array.prototype.concat.apply([], quickResults);
      }
    } catch(e) { allItems = []; }
    if (!allItems || allItems.length === 0) {
      document.getElementById('searchResults').innerHTML = '<div class="error-container"><div class="error-text">数据加载中，请稍后重试</div><button class="retry-btn" onclick="doSearch(document.getElementById(\'searchInput\').value)">重试</button></div>';
      return;
    }
  }

  var results = searchByIndex(allItems, kw);
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
        // ★ 保存元数据用于合并
        var oldItems2 = (backupCache && backupCache._allItems) || [];
        var metaMap2 = {};
        oldItems2.forEach(function(item) {
          if (item.name && item.name.indexOf('#') !== 0) {
            metaMap2[item.id] = { name: item.name, pic: item.pic, _category: item._category, grade: item.grade, ShopSellType: item.ShopSellType, desc: item.desc, secondClassCN: item.secondClassCN, length: item.length, width: item.width, weight: item.weight, objectID: item.objectID, tid: item.tid };
          }
        });
        // ★ 直接从 API 拉取最新价格
        var priceRes2 = await apiRequest('item_price_all', null, 3, true);
        if (priceRes2 && priceRes2.data && priceRes2.data.length > 0) {
          var items = priceRes2.data.map(function(p) {
            var id = p.id || p.tid;
            var meta = metaMap2[id] || {};
            return {
              id: id, tid: p.tid || id,
              name: meta.name || ('物品#' + id), pic: meta.pic || '',
              _category: meta._category || 'unknown', grade: meta.grade || 0,
              ShopSellType: meta.ShopSellType || '', desc: meta.desc || '',
              secondClassCN: meta.secondClassCN || '', length: meta.length || 0,
              width: meta.width || 0, weight: meta.weight || 0, objectID: meta.objectID || '',
              price: p.price, bl: p.bl, day_3_bl: p.day_3_bl, day_3_price: p.day_3_price,
              day_7_bl: p.day_7_bl, day_7_price: p.day_7_price, day_30_bl: p.day_30_bl,
              day_30_price: p.day_30_price, price_start: p.price_start, is_get_time: p.is_get_time
            };
          });
          setCache({ _allItems: items });
          if (typeof buildSearchIndex === 'function') buildSearchIndex(items);
          if (typeof updateCategoryIcons === 'function') updateCategoryIcons(items);
          listItems = items;
          renderList(items, true);
        } else {
          throw new Error('API 返回空');
        }
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
      renderHomeMovers();
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

  // ★ 保存旧缓存中的元数据（名称/图标/分类），刷新只更新价格
  var oldCache = getCache();
  var oldItems = (oldCache && oldCache._allItems) || [];
  var metaMap = {};
  oldItems.forEach(function(item) {
    if (item.name && item.name.indexOf('#') !== 0) {
      metaMap[item.id] = { name: item.name, pic: item.pic, _category: item._category, grade: item.grade, ShopSellType: item.ShopSellType, desc: item.desc, secondClassCN: item.secondClassCN, length: item.length, width: item.width, weight: item.weight, objectID: item.objectID, tid: item.tid };
    }
  });
  // ★ 如果缓存没有完整元数据，从 prefetch 中补充
  var prefetched = window.__prefetch || {};
  if (Object.keys(metaMap).length < 100 && prefetched._resolvedData) {
    CATEGORIES.forEach(function(cat) {
      var p = prefetched[cat.key];
      if (p && p._resolvedData) {
        p._resolvedData.forEach(function(item) {
          if (item.name && item.name.indexOf('#') !== 0 && !metaMap[item.id]) {
            metaMap[item.id] = { name: item.name, pic: item.pic, _category: item._category, grade: item.grade, ShopSellType: item.ShopSellType, desc: item.desc, secondClassCN: item.secondClassCN, length: item.length, width: item.width, weight: item.weight, objectID: item.objectID, tid: item.tid };
          }
        });
      }
    });
  }

  clearCache();
  listItems = [];
  currentItem = null;

  toast('正在刷新全部数据...');
  try {
    // ★ 直接从 API 拉取最新价格（强制刷新，跳过缓存）
    var priceRes = await apiRequest('item_price_all', null, 3, true);
    if (!priceRes || !priceRes.data || priceRes.data.length === 0) {
      throw new Error('API 返回空数据');
    }

    // ★ 合并：API 价格 + 元数据
    var merged = priceRes.data.map(function(p) {
      var id = p.id || p.tid;
      var meta = metaMap[id] || {};
      return {
        id: id,
        tid: p.tid || id,
        name: meta.name || ('物品#' + id),
        pic: meta.pic || '',
        _category: meta._category || 'unknown',
        grade: meta.grade || 0,
        ShopSellType: meta.ShopSellType || '',
        desc: meta.desc || '',
        secondClassCN: meta.secondClassCN || '',
        length: meta.length || 0,
        width: meta.width || 0,
        weight: meta.weight || 0,
        objectID: meta.objectID || '',
        price: p.price,
        bl: p.bl,
        day_3_bl: p.day_3_bl,
        day_3_price: p.day_3_price,
        day_7_bl: p.day_7_bl,
        day_7_price: p.day_7_price,
        day_30_bl: p.day_30_bl,
        day_30_price: p.day_30_price,
        price_start: p.price_start,
        is_get_time: p.is_get_time
      };
    });

    setCache({ _allItems: merged });
    if (typeof buildSearchIndex === 'function') buildSearchIndex(merged);
    if (typeof updateCategoryIcons === 'function') updateCategoryIcons(merged);
    markRefreshed();

    if (prevPage === 'home') {
      renderHomeMovers();
      checkFavoritePriceChanges();
      renderHomeTopMover();
      toast('全部数据已刷新！（' + merged.length + ' 件）');
    } else if (prevPage === 'list') {
      if (isAllMode) {
        listItems = merged;
        renderList(listItems, true);
      } else if (currentCategory) {
        listItems = merged.filter(function(i) { return i._category === currentCategory.key; });
        renderList(listItems, false);
      }
      toast('全部数据已刷新！（' + merged.length + ' 件）');
    } else if (prevPage === 'detail' && prevItemId) {
      currentItem = merged.find(function(i) { return i.id === prevItemId; });
      if (currentItem) renderDetail(currentItem);
      toast('全部数据已刷新！（' + merged.length + ' 件）');
    }
  } catch (err) {
    console.error('刷新全部数据失败:', err);
    toast('刷新失败，请检查网络');
    // ★ 恢复旧缓存数据
    if (oldCache && oldCache._allItems && oldCache._allItems.length > 0) {
      setCache(oldCache);
      if (prevPage === 'home') renderHomeMovers();
    }
  }
}

function refreshFavTab() {
  if (!checkRefreshCooldown()) return;
  toast('正在刷新收藏价格...');
  // ★ 直接从 API 拉取最新价格，不再依赖缓存
  apiRequest('item_price_all', null, 3, true).then(function(res) {
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
            item.is_get_time = latest.is_get_time;
          }
          return item;
        });
        setCache(cached);
        mergeSWPriceHistory().then(function() { recordAllItemsPrices(cached._allItems); });
      }
    }
    markRefreshed();
    renderFavTab();
    toast('收藏价格已刷新');
  }).catch(function(err) {
    console.error('刷新收藏失败:', err);
    renderFavTab();
    toast('刷新失败，显示已有数据');
  });
}

// ===== 自动刷新定时器（5 分钟间隔，仅记录价格 + 检测收藏变动，不重新渲染列表） =====
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
    // ★ 不再每次重新渲染整个列表，只更新涨跌幅数据提示
    if (alertEl && alertEl.classList.contains('show') && !hadAlert) {
      toast('收藏物品价格发生变动，点击查看', 3000);
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
  homeRefreshTimer = setInterval(doAutoRefresh, 300000); // 5 分钟
}

function stopHomeAutoRefresh() {
  if (homeRefreshTimer) {
    clearInterval(homeRefreshTimer);
    homeRefreshTimer = null;
  }
}

// ===== 懒加载：滚动监听（滚动条拉到底即加载） =====
var _lastScrollLoadCall = 0;
function onHomeScroll() {
  var homePage = document.getElementById('page-home');
  if (!homePage || !homePage.classList.contains('active')) return;

  var scrollBottom = window.pageYOffset + window.innerHeight;
  var docHeight = document.body.scrollHeight;
  // 滚动条拉到底部 300px 内即触发，带 300ms 防抖
  if (docHeight - scrollBottom < 300) {
    var now = Date.now();
    if (now - _lastScrollLoadCall > 300) {
      _lastScrollLoadCall = now;
      loadMoreHomeItems();
    }
  }
}

// ===== 下拉刷新 =====
var _pullStartY = 0;
var _pullDist = 0;
var _pullIndicator = null;
var _pullRefreshing = false;

function _hidePullIndicator() {
  if (_pullIndicator) {
    _pullIndicator.style.transition = 'opacity 0.15s';
    _pullIndicator.style.opacity = '0';
    var el = _pullIndicator;
    _pullIndicator = null;
    setTimeout(function() { if (el && el.parentNode) el.parentNode.removeChild(el); }, 200);
  }
}

function initPullToRefresh() {
  // ★ 关键：touchmove 监听挂在 .container 上（而非 document），
  // 因为 Chrome 会拦截 document 级的 passive:false，导致 preventDefault 无效
  var container = document.querySelector('.container');
  if (!container) return;

  container.addEventListener('touchmove', function(e) {
    if (_pullStartY === 0 || _pullRefreshing) return;
    var homePage = document.getElementById('page-home');
    if (!homePage || !homePage.classList.contains('active')) {
      _pullStartY = 0;
      return;
    }
    var dist = e.touches[0].clientY - _pullStartY;
    if (dist > 5 && window.pageYOffset <= 1) {
      e.preventDefault();
      _pullDist = dist;
      if (!_pullIndicator) {
        _pullIndicator = document.createElement('div');
        _pullIndicator.id = 'pullIndicator';
        _pullIndicator.style.cssText = 'text-align:center;padding:14px 12px;color:#ffd700;font-size:13px;position:fixed;top:0;left:0;right:0;z-index:9999;pointer-events:none;background:linear-gradient(180deg,rgba(0,0,0,0.85),rgba(0,0,0,0));font-weight:500;letter-spacing:1px;';
        document.body.appendChild(_pullIndicator);
      }
      _pullIndicator.textContent = dist > 60 ? '✓ 释放刷新' : '↓ 下拉刷新';
    } else if (dist <= -5) {
      _pullStartY = 0;
      _pullDist = 0;
      _hidePullIndicator();
    }
  }, { passive: false });  // ← 在 container 上 passive:false 不会被浏览器拦截

  document.addEventListener('touchstart', function(e) {
    if (_pullRefreshing) return;
    if (window.pageYOffset > 3) return;
    var homePage = document.getElementById('page-home');
    if (!homePage || !homePage.classList.contains('active')) return;
    _pullStartY = e.touches[0].clientY;
    _pullDist = 0;
  }, { passive: true });

  document.addEventListener('touchend', function() {
    if (_pullDist > 60 && !_pullRefreshing && window.pageYOffset <= 1) {
      _pullRefreshing = true;
      if (_pullIndicator) _pullIndicator.textContent = '⟳ 刷新中...';
      refreshCurrentPageData().then(function() {
        if (_pullIndicator) _pullIndicator.textContent = '✓ 刷新完成';
      }).catch(function() {
        if (_pullIndicator) _pullIndicator.textContent = '✗ 刷新失败';
      }).finally(function() {
        setTimeout(function() {
          _hidePullIndicator();
          _pullRefreshing = false;
        }, 800);
      });
    } else if (!_pullRefreshing) {
      _hidePullIndicator();
    }
    _pullStartY = 0;
    _pullDist = 0;
  }, { passive: true });
}

// ★ 刷新当前页面数据（下拉触发：重新拉取最新价格，更新列表）
async function refreshCurrentPageData() {
  try {
    var res = await apiRequest('item_price_all', null, 2, true);
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
      mergeSWPriceHistory().then(function() {
        if (cached && cached._allItems) recordAllItemsPrices(cached._allItems);
      });
      markRefreshed();
    }
  } catch(e) {
    console.error('下拉刷新失败:', e.message);
  }
  // 重新渲染
  if (pageStack[pageStack.length - 1] === 'home') {
    renderHomeMovers(true);
    checkFavoritePriceChanges();
    renderHomeTopMover();
  } else {
    refreshCurrentList();
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
  // ★ 移动端修复：将下拉面板移到 body 下，确保 fixed 定位可靠
  if (typeof moveDropdownsToBody === 'function') moveDropdownsToBody();

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
    // ★ 页面恢复可见：刷新数据、恢复自动刷新、确保数据持续加载
    startHomeAutoRefresh();
    startGlobalDailyRecord();
    // 如果缓存数据不足，后台继续加载
    var cached = getCache();
    if (!cached || !cached._allItems || cached._allItems.length < 50) {
      loadAllItems(false).then(function() {
        if (pageStack[pageStack.length - 1] === 'home') {
          checkFavoritePriceChanges();
          renderHomeTopMover();
          renderHomeMovers();
        }
        preWarmFavTab();
      }).catch(function(){});
    } else {
      // 后台静默刷新
      loadAllItems(true).catch(function(){});
    }
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

// ===== 预加载（★ loading 期内全力拉取，10 秒硬超时，真实进度） =====
(async function preload() {
  // 从 IndexedDB 恢复缓存到内存（异步，不阻塞后续逻辑）
  var idbRestored = initMainCache().catch(function() { return null; });

  var cached = getCache();
  var loadingScreen = document.getElementById('loadingScreen');
  var loadingLogo = document.getElementById('loadingLogo');
  var loadingGlow = document.getElementById('loadingGlow');
  var loadingProgressBar = document.getElementById('loadingProgressBar');
  var loadingStatus = document.getElementById('loadingStatus');
  var loadStart = Date.now();
  var minDisplayMs = 300;
  var LOADING_TIMEOUT = 10000; // ★ 10 秒硬超时
  var _loadingHidden = false;

  function setProgress(ratio, statusText) {
    if (_loadingHidden) return;
    var pct = Math.round(ratio * 100);
    loadingProgressBar.style.width = pct + '%';
    loadingLogo.style.filter = 'blur(' + ((20 * (1 - ratio)).toFixed(1)) + 'px)';
    loadingGlow.style.opacity = ratio.toFixed(2);
    if (statusText) loadingStatus.textContent = statusText;
  }

  function hideLoading() {
    if (_loadingHidden || loadingScreen.classList.contains('fade-out')) return;
    _loadingHidden = true;
    setProgress(1, '数据就绪');
    setTimeout(function() {
      loadingScreen.classList.add('fade-out');
      setTimeout(function() { loadingScreen.classList.add('removed'); }, 400);
    }, 200);
  }

  // ★ 渲染首屏 + 持续更新 loading 进度条
  function showAndContinueLoading(allItems, skipCache) {
    if (!allItems || allItems.length === 0) {
      hideLoading();
      return;
    }
    // 写入缓存 + 渲染（但不隐藏 loading）
    if (!skipCache) setCache({ _allItems: allItems });
    if (typeof buildSearchIndex === 'function') buildSearchIndex(allItems);
    updateCategoryIcons(allItems);
    checkFavoritePriceChanges();
    renderHomeTopMover();
    renderHomeMoversWithData(allItems, false);
    setProgress(0.55, '已展示 ' + allItems.length + ' 件，继续加载更多...');

    // ★ loading 期内实时追踪预取进度
    var _pollTimer = setInterval(function() {
      if (_loadingHidden) { clearInterval(_pollTimer); return; }
      var prefetched = window.__prefetch || {};
      var realProgress = (typeof prefetched.getProgress === 'function')
        ? prefetched.getProgress()
        : 0;
      var expected = (typeof prefetched.getExpectedTotal === 'function')
        ? prefetched.getExpectedTotal()
        : 0;
      var arrived = (typeof prefetched.getTotalArrived === 'function')
        ? prefetched.getTotalArrived()
        : allItems.length;
      // 进度：首屏 50% + 翻页进度 50%
      var displayProgress = 0.55 + realProgress * 0.43;
      if (displayProgress > 0.98) displayProgress = 0.98;
      setProgress(displayProgress, '已加载 ' + arrived + (expected > 0 ? '/' + expected : '') + ' 件...');
      // ★ 数据量足够或翻页完成 → 提前结束 loading
      if (arrived >= expected && expected > 0 && arrived > 100) {
        clearInterval(_pollTimer);
        hideLoading();
      }
      if (typeof prefetched.isPaginationDone === 'function' && prefetched.isPaginationDone() && arrived > 100) {
        clearInterval(_pollTimer);
        hideLoading();
      }
    }, 400);

    // ★ 后台监听翻页完成 → 更新缓存 + 搜索结果
    if (!skipCache) {
      setTimeout(function() {
        loadAllItemsBackground(allItems).then(function(fullItems) {
          if (fullItems && fullItems.length > allItems.length) {
            if (typeof buildSearchIndex === 'function') buildSearchIndex(fullItems);
            updateCategoryIcons(fullItems);
            scheduleHomeSilentUpdate();
          }
        });
      }, 100);
    }
  }

  // ===== 有缓存：快速展示，后台刷新 =====
  if (cached && cached._allItems && cached._allItems.length > 0) {
    // ★ 先清空首页内容，防止旧数据闪现
    var homeList = document.getElementById('homeMoversList');
    if (homeList) homeList.innerHTML = '';
    var topMover = document.getElementById('topMover');
    if (topMover) topMover.style.display = 'none';

    updateCategoryIcons(cached._allItems);
    buildSearchIndex(cached._allItems);
    mergeSWPriceHistory().then(function() { recordAllItemsPrices(cached._allItems); });
    // 加速动画：缓存命中时快速展示
    var steps = [0, 0.2, 0.45, 0.7, 0.9, 1];
    steps.forEach(function(ratio, i) {
      setTimeout(function() {
        setProgress(ratio, ratio < 0.3 ? '正在准备...' : ratio < 0.7 ? '正在同步最新价格' : ratio < 1 ? '即将就绪' : '数据就绪');
        if (ratio === 1) {
          setTimeout(function() { renderHomeMovers(); renderHomeTopMover(); }, 50);
          setTimeout(function() { hideLoading(); }, 150);
        }
      }, i * 80);
    });
    // 后台刷新最新数据（缩短延迟，优先拉取）
    setTimeout(function() { loadAllItems(true).catch(function(){}); }, 800);
    registerPeriodicSync();
    startHomeAutoRefresh();
    startGlobalDailyRecord();
    return;
  }

  // ===== 无缓存：★ v3 双请求合并，2-3s 全量 1350 件一次到齐 =====
  var prefetched = window.__prefetch || {};
  setProgress(0.05, '正在连接数据源...');

  var _noCacheAllItems = [];
  var _noCacheDone = false;
  var _progressTimer = null;

  // ★ 监听数据到达（v3: metadata+price 合并后一次性通知全部物品）
  if (typeof prefetched.onItemsArrive === 'function') {
    prefetched.onItemsArrive(function(newItems, totalArrived) {
      _noCacheAllItems = _noCacheAllItems.concat(newItems);
      if (!_noCacheDone && _noCacheAllItems.length >= 30) {
        _noCacheDone = true;
        if (_progressTimer) clearInterval(_progressTimer);
        setCache({ _allItems: _noCacheAllItems });
        if (typeof buildSearchIndex === 'function') buildSearchIndex(_noCacheAllItems);
        updateCategoryIcons(_noCacheAllItems);
        checkFavoritePriceChanges();
        renderHomeTopMover();
        renderHomeMoversWithData(_noCacheAllItems, false);
        setProgress(1, '已加载 ' + totalArrived + ' 件');
        setTimeout(function() { hideLoading(); }, 300);
      }
    });
  }

  // 进度条：~3 秒平滑动画
  setProgress(0.08, '正在请求数据...');
  var _progressStage = 0;
  _progressTimer = setInterval(function() {
    _progressStage++;
    if (_loadingHidden || _noCacheDone) { clearInterval(_progressTimer); return; }
    // 0-3s: 线性提升到 90%，给用户"在加载"的感觉
    var fakeRatio = Math.min(0.08 + _progressStage * 0.06, 0.9);
    setProgress(fakeRatio, '正在拉取实时价格...');
  }, 200);

  // ★ 全部数据到齐
  if (prefetched._allPage1Ready) {
    prefetched._allPage1Ready.then(function(sortedAll) {
      if (!sortedAll || sortedAll.length === 0 || _noCacheDone) return;
      _noCacheDone = true;
      if (_progressTimer) clearInterval(_progressTimer);
      setCache({ _allItems: sortedAll });
      if (typeof buildSearchIndex === 'function') buildSearchIndex(sortedAll);
      updateCategoryIcons(sortedAll);
      checkFavoritePriceChanges();
      renderHomeTopMover();
      renderHomeMoversWithData(sortedAll, false);
      setProgress(1, '已加载 ' + sortedAll.length + ' 件');
      setTimeout(function() { hideLoading(); }, 300);
    }).catch(function() {});
  }

  // ★ 8 秒硬超时（v3 数据量小，2-3s 正常完成；8s 兜底足够）
  setTimeout(function() {
    if (_loadingHidden || (loadingScreen && loadingScreen.classList.contains('fade-out'))) return;
    if (_progressTimer) clearInterval(_progressTimer);
    if (!_noCacheDone) {
      _noCacheDone = true;
      var items = (typeof prefetched.getAllPage1Items === 'function')
        ? prefetched.getAllPage1Items()
        : _noCacheAllItems;
      if (items.length > 0) {
        setCache({ _allItems: items });
        if (typeof buildSearchIndex === 'function') buildSearchIndex(items);
        updateCategoryIcons(items);
        renderHomeTopMover();
        renderHomeMoversWithData(items, false);
        hideLoading();
      } else {
        // ★ 数据为空 → 显示重试按钮，不隐藏 loading
        var errWrap = document.getElementById('loadingRetryWrap');
        var errText = document.getElementById('loadingErrorText');
        var statusEl = document.getElementById('loadingStatus');
        if (errWrap) errWrap.style.display = 'flex';
        if (errText) errText.textContent = '数据加载超时，请检查网络后重试';
        if (statusEl) statusEl.textContent = '连接超时';
        setProgress((prefetched && prefetched.getProgress) ? prefetched.getProgress() : 0.2, '');
      }
    } else {
      hideLoading();
    }
  }, LOADING_TIMEOUT);

  registerPeriodicSync();
  startHomeAutoRefresh();
  startGlobalDailyRecord();
  window.addEventListener('scroll', onHomeScroll, { passive: true });
  initPullToRefresh();
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
    // ★ 拖拽中不重置滑钮位置（由 onMove 控制），仅更新高度适配内容变化
    if (dragging) return;
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
  var _lastLoadMoreCall = 0;
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

    // ★ 滑钮拖到底部：直接触发加载更多（不依赖 scroll 事件）
    if (maxTop > 0 && newTop >= maxTop - 8) {
      var now = Date.now();
      if (now - _lastLoadMoreCall > 120 && typeof loadMoreHomeItems === 'function') {
        _lastLoadMoreCall = now;
        loadMoreHomeItems();
      }
    }
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

    // ★ 松手时如果停在底部，也触发一次加载
    var sh2 = getScrollHeight();
    var vh2 = getViewHeight();
    var scrollY2 = window.pageYOffset || document.documentElement.scrollTop;
    if (sh2 - (scrollY2 + vh2) < 50 && typeof loadMoreHomeItems === 'function') {
      loadMoreHomeItems();
    }
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

