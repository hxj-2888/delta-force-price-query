// ===== 数据持久化层 =====

const app = getApp();

// ===== 缓存键名 =====
const CACHE_KEY = 'deltaforce_cache';
const CACHE_TIME_KEY = 'deltaforce_cache_time';
const SEARCH_HISTORY_KEY = 'deltaforce_search_history';
const RECENT_VIEWS_KEY = 'deltaforce_recent_views';
const FAVORITES_KEY = 'deltaforce_favorites';
const PRICE_HISTORY_KEY = 'deltaforce_price_hist';
const CAT_ICONS_KEY = 'deltaforce_cat_icons';

const MAX_HISTORY = 20;
const MAX_RECENT = 15;
const MAX_FAVORITES = 50;
const MAX_HIST_PER_ITEM = 14;

// ===== 通用存储操作 =====
function getStorage(key, fallback = null) {
  try {
    const val = wx.getStorageSync(key);
    return val !== '' && val !== undefined ? val : fallback;
  } catch (e) { return fallback; }
}

function setStorage(key, value) {
  try {
    wx.setStorageSync(key, value);
    return true;
  } catch (e) {
    console.warn(`[存储] 写入失败 (${key}):`, e);
    return false;
  }
}

function removeStorage(key) {
  try {
    wx.removeStorageSync(key);
  } catch (e) {}
}

// ===== 缓存管理 =====
function getCache() {
  const t = getStorage(CACHE_TIME_KEY);
  if (t && (Date.now() - t < 2 * 60 * 60 * 1000)) {
    return getStorage(CACHE_KEY);
  }
  if (!t) {
    const raw = getStorage(CACHE_KEY);
    if (raw) return raw;
  }
  return null;
}

function setCache(data) {
  setStorage(CACHE_KEY, data);
  setStorage(CACHE_TIME_KEY, Date.now());
}

function clearCache() {
  removeStorage(CACHE_KEY);
  removeStorage(CACHE_TIME_KEY);
}

// ===== 搜索历史 =====
function getSearchHistory() {
  return getStorage(SEARCH_HISTORY_KEY, []);
}

function saveSearchQuery(keyword) {
  if (!keyword.trim()) return;
  let history = getSearchHistory();
  history = history.filter(h => h !== keyword);
  history.unshift(keyword);
  if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY);
  setStorage(SEARCH_HISTORY_KEY, history);
}

function clearSearchHistory() {
  removeStorage(SEARCH_HISTORY_KEY);
}

// ===== 最近浏览 =====
function getRecentViews() {
  return getStorage(RECENT_VIEWS_KEY, []);
}

function saveRecentView(item) {
  if (!item || !item.id) return;
  let views = getRecentViews();
  views = views.filter(v => v.id !== item.id);
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
  setStorage(RECENT_VIEWS_KEY, views);
}

function clearRecentViews() {
  removeStorage(RECENT_VIEWS_KEY);
}

// ===== 收藏系统 =====
function getFavorites() {
  return getStorage(FAVORITES_KEY, []);
}

function isFavorited(itemId) {
  return getFavorites().some(f => f.id === itemId);
}

function saveFavorite(item) {
  if (!item || !item.id) return false;
  const favs = getFavorites();
  if (favs.some(f => f.id === item.id)) return false;
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
  setStorage(FAVORITES_KEY, favs);
  return true;
}

function removeFavorite(itemId) {
  const favs = getFavorites();
  const before = favs.length;
  const filtered = favs.filter(f => f.id !== itemId);
  if (filtered.length === before) return false;
  setStorage(FAVORITES_KEY, filtered);
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
  removeStorage(FAVORITES_KEY);
}

// ===== 价格历史 =====
function getPriceHistory() {
  return getStorage(PRICE_HISTORY_KEY, {});
}

function savePriceSnapshot(itemId, item) {
  if (!itemId || !item.price) return;
  const hist = getPriceHistory();
  const k = String(itemId);
  if (!hist[k]) hist[k] = [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTs = Math.floor(today.getTime() / 1000);

  hist[k] = hist[k].filter(s => {
    const sd = new Date(s.ts * 1000);
    sd.setHours(0, 0, 0, 0);
    return Math.floor(sd.getTime() / 1000) !== todayTs;
  });
  hist[k].push({ ts: Math.floor(Date.now() / 1000), price: item.price });
  hist[k].sort((a, b) => b.ts - a.ts);
  if (hist[k].length > MAX_HIST_PER_ITEM) hist[k] = hist[k].slice(0, MAX_HIST_PER_ITEM);
  setStorage(PRICE_HISTORY_KEY, hist);
}

/**
 * 记录全部物品今日价格快照
 */
function recordAllItemsPrices(allItems) {
  if (!allItems || allItems.length === 0) return;
  const hist = getPriceHistory();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTs = Math.floor(today.getTime() / 1000);
  const now = Math.floor(Date.now() / 1000);
  let added = 0;

  allItems.forEach(item => {
    if (!item.id || !item.price || item.price <= 0) return;
    const k = String(item.id);
    if (!hist[k]) hist[k] = [];
    const hasToday = hist[k].some(s => {
      const sd = new Date(s.ts * 1000);
      sd.setHours(0, 0, 0, 0);
      return Math.floor(sd.getTime() / 1000) === todayTs;
    });
    if (!hasToday) {
      hist[k].push({ ts: now, price: item.price });
      added++;
      hist[k].sort((a, b) => b.ts - a.ts);
      if (hist[k].length > MAX_HIST_PER_ITEM) hist[k] = hist[k].slice(0, MAX_HIST_PER_ITEM);
    }
  });

  // 清理过期数据
  const staleCutoff = Math.floor(Date.now() / 1000) - 35 * 86400;
  Object.keys(hist).forEach(k => {
    hist[k] = hist[k].filter(s => s.ts >= staleCutoff);
    if (hist[k].length === 0) delete hist[k];
  });

  if (added > 0) setStorage(PRICE_HISTORY_KEY, hist);
}

/**
 * 从本地快照计算指定天数前的涨跌幅
 */
function getLocalPriceChange(itemId, daysAgo) {
  const hist = getPriceHistory();
  const snaps = hist[String(itemId)] || [];
  if (snaps.length < 2) return null;
  const latest = snaps[0];
  if (!latest) return null;
  const now = Math.floor(Date.now() / 1000);
  const targetTs = now - daysAgo * 86400;

  let closest = null, closestDiff = Infinity;
  snaps.forEach(s => {
    const diff = Math.abs(s.ts - targetTs);
    if (diff < closestDiff) { closestDiff = diff; closest = s; }
  });

  if (!closest || closest.ts === latest.ts || !closest.price || closest.price <= 0) return null;
  const change = (latest.price - closest.price) / closest.price * 100;
  return Math.abs(change) > 0.001 ? change : 0;
}

/**
 * 合并获取价格数据点
 */
function getMergedPriceData(item) {
  const pts = [];
  const now = Math.floor(Date.now() / 1000);
  const SPD = 86400;

  if (item.day_30_price > 0) pts.push({ day: 30, price: item.day_30_price });
  if (item.day_7_price > 0) pts.push({ day: 7, price: item.day_7_price });
  if (item.day_3_price > 0) pts.push({ day: 3, price: item.day_3_price });
  if (item.price > 0) pts.push({ day: 0, price: item.price });

  const hist = getPriceHistory();
  const snaps = hist[String(item.id)] || [];
  const usedDays = {};
  pts.forEach(p => { usedDays[p.day] = true; });

  snaps.forEach(s => {
    const d = Math.round((now - s.ts) / SPD);
    if (d >= 1 && d <= 30 && !usedDays[d]) {
      pts.push({ day: d, price: s.price, hist: true });
      usedDays[d] = true;
    }
  });

  pts.sort((a, b) => b.day - a.day);
  return pts;
}

// ===== 分类图标缓存 =====
function getCatIconsCache() {
  return getStorage(CAT_ICONS_KEY, null);
}

function setCatIconsCache(picks) {
  setStorage(CAT_ICONS_KEY, picks);
}

module.exports = {
  getStorage, setStorage, removeStorage,
  getCache, setCache, clearCache,
  getSearchHistory, saveSearchQuery, clearSearchHistory,
  getRecentViews, saveRecentView, clearRecentViews,
  getFavorites, isFavorited, saveFavorite, removeFavorite, toggleFavorite, clearFavorites,
  getPriceHistory, savePriceSnapshot, recordAllItemsPrices,
  getLocalPriceChange, getMergedPriceData,
  getCatIconsCache, setCatIconsCache
};
