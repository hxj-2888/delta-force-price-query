// ===== 数据持久化层（微信小程序 Storage） =====

const CACHE_KEY = 'deltaforce_cache_v9';
const CACHE_TIME_KEY = 'deltaforce_cache_time_v9';
const CACHE_DURATION = 2 * 60 * 60 * 1000; // 整体缓存2小时

const QUERY_HISTORY_KEY = 'deltaforce_search_history';
const MAX_HISTORY = 20;

const RECENT_VIEWS_KEY = 'deltaforce_recent_views';
const MAX_RECENT = 15;

const FAVORITES_KEY = 'deltaforce_favorites';
const MAX_FAVORITES = 50;

const PRICE_HISTORY_KEY = 'deltaforce_price_hist';
const MAX_HIST_PER_ITEM = 14;

const CAT_ICONS_KEY = 'deltaforce_cat_icons';

const BROWSE_STATE_KEY = 'deltaforce_browse_state';

// ===== 缓存 =====
function getCache() {
  try {
    const t = wx.getStorageSync(CACHE_TIME_KEY);
    if (t && (Date.now() - parseInt(t) < CACHE_DURATION)) {
      return wx.getStorageSync(CACHE_KEY) || null;
    }
    // 降级：时间戳缺失但数据存在
    if (!t) {
      const raw = wx.getStorageSync(CACHE_KEY);
      if (raw) return raw;
    }
  } catch (e) { }
  return null;
}

function setCache(data) {
  try {
    wx.setStorageSync(CACHE_KEY, data);
    wx.setStorageSync(CACHE_TIME_KEY, Date.now().toString());
  } catch (e) {
    console.warn('缓存写入失败:', e.message);
    try { wx.removeStorageSync(CACHE_KEY); } catch (e2) { }
    try { wx.removeStorageSync(CACHE_TIME_KEY); } catch (e2) { }
  }
}

function clearCache() {
  try {
    wx.removeStorageSync(CACHE_KEY);
    wx.removeStorageSync(CACHE_TIME_KEY);
  } catch (e) { }
}

// ===== 搜索历史 =====
function getSearchHistory() {
  try {
    return wx.getStorageSync(QUERY_HISTORY_KEY) || [];
  } catch (e) { return []; }
}

function saveSearchQuery(keyword) {
  if (!keyword.trim()) return;
  let history = getSearchHistory();
  history = history.filter(h => h !== keyword);
  history.unshift(keyword);
  if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY);
  wx.setStorageSync(QUERY_HISTORY_KEY, history);
}

function clearSearchHistory() {
  wx.removeStorageSync(QUERY_HISTORY_KEY);
}

// ===== 最近浏览 =====
function getRecentViews() {
  try { return wx.getStorageSync(RECENT_VIEWS_KEY) || []; } catch (e) { return []; }
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
  wx.setStorageSync(RECENT_VIEWS_KEY, views);
}

function clearRecentViews() {
  wx.removeStorageSync(RECENT_VIEWS_KEY);
}

// ===== 收藏系统 =====
function getFavorites() {
  try { return wx.getStorageSync(FAVORITES_KEY) || []; } catch (e) { return []; }
}

function isFavorited(itemId) {
  return getFavorites().some(f => f.id === itemId);
}

function saveFavorite(item) {
  if (!item || !item.id) return false;
  let favs = getFavorites();
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
  wx.setStorageSync(FAVORITES_KEY, favs);
  return true;
}

function removeFavorite(itemId) {
  let favs = getFavorites();
  const before = favs.length;
  favs = favs.filter(f => f.id !== itemId);
  if (favs.length === before) return false;
  wx.setStorageSync(FAVORITES_KEY, favs);
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
  wx.removeStorageSync(FAVORITES_KEY);
}

// ===== 价格历史 =====
function getPriceHistory() {
  try { return wx.getStorageSync(PRICE_HISTORY_KEY) || {}; } catch (e) { return {}; }
}

function getLocalPriceChange(itemId, daysAgo) {
  const hist = getPriceHistory();
  const snaps = hist[String(itemId)] || [];
  if (snaps.length < 2) return null;
  const latest = snaps[0];
  if (!latest) return null;
  const now = Math.floor(Date.now() / 1000);
  const targetTs = now - daysAgo * 86400;
  let closest = null;
  let closestDiff = Infinity;
  for (let i = 0; i < snaps.length; i++) {
    const diff = Math.abs(snaps[i].ts - targetTs);
    if (diff < closestDiff) { closestDiff = diff; closest = snaps[i]; }
  }
  if (!closest || closest.ts === latest.ts || !closest.price || closest.price <= 0) return null;
  const change = (latest.price - closest.price) / closest.price * 100;
  return Math.abs(change) > 0.001 ? change : 0;
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
  wx.setStorageSync(PRICE_HISTORY_KEY, hist);
}

function recordAllItemsPrices(allItems) {
  if (!allItems || allItems.length === 0) return 0;
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
    let hasToday = false;
    for (let i = 0; i < hist[k].length; i++) {
      const sd = new Date(hist[k][i].ts * 1000);
      sd.setHours(0, 0, 0, 0);
      if (Math.floor(sd.getTime() / 1000) === todayTs) { hasToday = true; break; }
    }
    if (hasToday) return;
    hist[k].push({ ts: now, price: item.price });
    added++;
    if (hist[k].length > 1) {
      hist[k].sort((a, b) => b.ts - a.ts);
    }
    if (hist[k].length > MAX_HIST_PER_ITEM) hist[k] = hist[k].slice(0, MAX_HIST_PER_ITEM);
  });
  const staleCutoff = Math.floor(Date.now() / 1000) - 35 * 86400;
  let hadStale = false;
  Object.keys(hist).forEach(k => {
    const before = hist[k].length;
    hist[k] = hist[k].filter(s => s.ts >= staleCutoff);
    if (hist[k].length === 0) { delete hist[k]; hadStale = true; }
    else if (hist[k].length < before) { hadStale = true; }
  });
  if (added > 0 || hadStale) {
    wx.setStorageSync(PRICE_HISTORY_KEY, hist);
  }
  return added;
}

function getMergedPriceData(item) {
  const pts = [];
  if (item.day_30_price > 0) pts.push({ day: 30, price: item.day_30_price });
  if (item.day_7_price > 0) pts.push({ day: 7, price: item.day_7_price });
  if (item.day_3_price > 0) pts.push({ day: 3, price: item.day_3_price });
  if (item.price > 0) pts.push({ day: 0, price: item.price });
  const hist = getPriceHistory();
  const snaps = hist[String(item.id)] || [];
  const usedDays = {};
  pts.forEach(p => { usedDays[p.day] = true; });
  const now = Math.floor(Date.now() / 1000);
  const SPD = 86400;
  snaps.forEach(s => {
    const d = Math.round((now - s.ts) / SPD);
    if (d >= 1 && d <= 30 && !usedDays[d]) {
      let dup = false;
      pts.forEach(p => { if (p.day === d) dup = true; });
      if (!dup) { pts.push({ day: d, price: s.price, hist: true }); usedDays[d] = true; }
    }
  });
  pts.sort((a, b) => b.day - a.day);
  return pts;
}

// ===== 分类图标缓存 =====
function getCatIconsCache() {
  try { return wx.getStorageSync(CAT_ICONS_KEY); } catch (e) { return null; }
}

function setCatIconsCache(picks) {
  wx.setStorageSync(CAT_ICONS_KEY, picks);
}

// ===== 浏览状态 =====
function saveBrowseState(page, category, isAllMode) {
  const state = {
    page: page || 'home',
    category: category || null,
    isAllMode: !!isAllMode
  };
  wx.setStorageSync(BROWSE_STATE_KEY, state);
}

function restoreBrowseState() {
  try {
    return wx.getStorageSync(BROWSE_STATE_KEY);
  } catch (e) { return null; }
}

module.exports = {
  getCache,
  setCache,
  clearCache,
  getSearchHistory,
  saveSearchQuery,
  clearSearchHistory,
  getRecentViews,
  saveRecentView,
  clearRecentViews,
  getFavorites,
  isFavorited,
  saveFavorite,
  removeFavorite,
  toggleFavorite,
  clearFavorites,
  getPriceHistory,
  getLocalPriceChange,
  savePriceSnapshot,
  recordAllItemsPrices,
  getMergedPriceData,
  getCatIconsCache,
  setCatIconsCache,
  saveBrowseState,
  restoreBrowseState,
  CACHE_KEY,
  CACHE_TIME_KEY
};