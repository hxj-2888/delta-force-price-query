// ===== 数据持久化层（LocalStorage, IndexedDB 操作） =====

// ===== 缓存 =====
var CACHE_KEY = 'deltaforce_cache_v9';
var CACHE_TIME_KEY = 'deltaforce_cache_time_v9';
var CACHE_DURATION = 2 * 60 * 60 * 1000; // 整体缓存2小时

var REFRESH_COOLDOWN = 30 * 1000; // 刷新冷却初始值
var lastRefreshTime = 0;
var _lastApiDuration = 3000; // 上次API实际耗时(ms)，默认3秒

// 根据API实际耗时动态调整冷却时间
function setApiDuration(ms) {
  _lastApiDuration = ms > 0 ? ms : 3000;
  // 冷却 = API耗时 + 1秒缓冲，最低3秒
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
  var t = localStorage.getItem(CACHE_TIME_KEY);
  // 时间戳有效 → 直接返回数据
  if (t && (Date.now() - parseInt(t) < CACHE_DURATION)) {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch(e) {}
  }
  // 降级：时间戳缺失但数据存在 → 仍返回，同时补写时间戳（防止永久降级）
  if (!t) {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
        return JSON.parse(raw);
      }
    } catch(e) {}
  }
  return null;
}

function setCache(data) {
  try {
    // 先写数据，再写时间戳（顺序保证：即使时间戳写入失败，getCache 降级仍能读取数据）
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
  } catch(e) {
    console.warn('缓存写入失败（可能存储空间已满）:', e.message);
    // 写入失败时尝试清理旧数据，避免后面读到一个已损坏的缓存
    try { localStorage.removeItem(CACHE_KEY); } catch(e2) {}
    try { localStorage.removeItem(CACHE_TIME_KEY); } catch(e2) {}
  }
}

function clearCache() {
  localStorage.removeItem(CACHE_KEY);
  localStorage.removeItem(CACHE_TIME_KEY);
  if (typeof _topMoverFirstRetryDone !== 'undefined') _topMoverFirstRetryDone = false;
}

// 清除旧版缓存（v0-v8）
setTimeout(function migrateCache() {
  for (var i = 0; i <= 8; i++) {
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

// 云端快照内存缓存（避免重复请求 Worker）
var _cloudSnapCache = {};  // itemId -> { snapshots, fetchedAt }

function getPriceHistory() {
  try { return JSON.parse(localStorage.getItem(PRICE_HISTORY_KEY)) || {}; }
  catch(e) { return {}; }
}

// 从 localStorage 快照数据计算指定天数前的涨跌幅
function getLocalPriceChange(itemId, daysAgo) {
  var hist = getPriceHistory();
  var snaps = hist[String(itemId)] || [];
  if (snaps.length < 2) return null;
  var latest = snaps[0];
  if (!latest) return null;
  var now = Math.floor(Date.now() / 1000);
  var targetTs = now - daysAgo * 86400;
  var closest = null;
  var closestDiff = Infinity;
  for (var i = 0; i < snaps.length; i++) {
    var diff = Math.abs(snaps[i].ts - targetTs);
    if (diff < closestDiff) { closestDiff = diff; closest = snaps[i]; }
  }
  if (!closest || closest.ts === latest.ts || !closest.price || closest.price <= 0) return null;
  var change = (latest.price - closest.price) / closest.price * 100;
  return Math.abs(change) > 0.001 ? change : 0;
}

function openPriceDB() {
  return new Promise(function(resolve, reject) {
    if (!('indexedDB' in window)) { reject(new Error('no indexedDB')); return; }
    var req = indexedDB.open('deltaforce_price_db', 1);
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
 * 合并获取价格数据点（API锚点 + 云端快照 + 本地快照）
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
