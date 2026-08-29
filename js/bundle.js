// 三角洲行动 — JS Bundle (all modules combined)
// v20260829k — 自动生成于 2026-08-29 02:02:34

// ===== config.js =====
// ===== config.js — 应用常量 =====
// 功能清单: 缓存键/TTL | 存储限制 | 分类定义 | 分页配置
// 依赖: 无（纯常量，必须第一个加载）
// 被依赖: 所有其他模块

// ===== 缓存 =====
var CACHE_KEY = 'deltaforce_cache_v10';
var CACHE_TIME_KEY = 'deltaforce_cache_time_v10';
var CACHE_DURATION = 5 * 60 * 1000; // 5分钟

// ===== 刷新冷却 =====
var REFRESH_COOLDOWN_BASE = 30 * 1000; // 基础30秒，setApiDuration动态调整

// ===== IndexedDB =====
var MAIN_DB_NAME = 'deltaforce_price_db';
var MAIN_DB_VERSION = 2;

// ===== 搜索历史 =====
var QUERY_HISTORY_KEY = 'deltaforce_search_history';
var MAX_HISTORY = 20;

// ===== 最近浏览 =====
var RECENT_VIEWS_KEY = 'deltaforce_recent_views';
var MAX_RECENT = 15;

// ===== 收藏 =====
var FAVORITES_KEY = 'deltaforce_favorites';
var MAX_FAVORITES = 50;

// ===== 价格历史 =====
var PRICE_HISTORY_KEY = 'deltaforce_price_hist';
var MAX_HIST_PER_ITEM = 14;

// ===== 浏览状态 =====
var BROWSE_STATE_KEY = 'deltaforce_browse_state';

// ===== 分类图标 =====
var CAT_ICONS_KEY = 'deltaforce_cat_icons';

// ===== 分类定义 =====
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

// ===== 分页 =====
var itemsPerPage = 20;
var HOME_PAGE_SIZE = 40;

// ===== utils.js =====
// ===== utils.js — 工具函数集 =====
// 功能清单: 价格格式化(formatPrice) | 涨跌格式化(formatChange/getChangeClass) | 时间格式化(formatTime)
// 等级文本/颜色(getGradeText/getGradeColor) | Toast提示 | URL清洗(sanitizeUrl) | HTML转义(escapeHtml)
// JS字符串转义(escapeJSStr) | 分类图标(catIconHTML) | 短价格(shortPrice) | 大数字格式化(formatLargeNum)
// 依赖: 无(纯函数) | 被依赖: render.js(渲染时格式化) main.js(提示/转义)
// 改动影响: 修改formatPrice→影响所有价格显示; 修改toast→影响所有用户提示

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

// 安全清洗图片URL（仅允许 http/https 绝对 URL 和绝对路径，拒绝 protocol-relative URL）
function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  // ★ 仅允许 https?:// 开头的绝对 URL 或以 / 开头的站点相对路径
  var safeRegex = /^(https?:\/\/|\/)/i;
  if (safeRegex.test(url)) {
    return url.replace(/["'<>]/g, '');
  }
  return '';
}

// 列表小图专用：playerhub 的原图是 304x336（约 65KB），而列表/首页只用 36x36 展示，
// 首屏 40 张就要拉约 2.6MB，这是"图标迟迟不显示"的直接原因——不是加载失败，而是加载慢。
// 腾讯云 CI 支持 imageMogr2 缩略参数，实测 72x/format/webp 单张仅 1.3KB（体积降到 2%）。
// 只对已知支持该参数的域名生效，其他 CDN 原样返回，避免拼出不存在的参数导致 404。
function smallPicUrl(url, size) {
  if (!url || typeof url !== 'string') return '';
  if (url.indexOf('playerhub.df.qq.com/') < 0) return url;
  var s = (size || 72);
  var sep = url.indexOf('?') >= 0 ? '&' : '?';
  return url + sep + 'imageMogr2/thumbnail/' + s + 'x/format/webp';
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

// ===== maps.js =====
// ===== maps.js — 地图归属映射 =====
// 功能清单: 5张游戏地图定义(零号大坝/长弓溪谷/航天基地/巴克什/监狱) | 钥匙卡pic URL→地图映射(4规则)
// 收集品关键词→地图映射(40+关键词) | findItemMap(综合查询) | getKeyMapFromPic(pic URL匹配)
// 依赖: 无(纯静态数据) | 被依赖: render.js(详情页地图归属显示)
// 改动影响: 修改关键词→影响收集品/钥匙地图归属; 新增地图→需同步更新MAPS和规则

// 地图定义（无 emoji）
var MAPS = {
  zero_dam:    { key: 'zero_dam',    name: '零号大坝', order: 1 },
  longbow:     { key: 'longbow',     name: '长弓溪谷', order: 2 },
  space_base:  { key: 'space_base',  name: '航天基地', order: 3 },
  brakkesh:    { key: 'brakkesh',    name: '巴克什',   order: 4 },
  prison:      { key: 'prison',      name: '监狱',     order: 5 }
};

// ===== 钥匙卡 pic URL → 地图映射（API 真实数据提取）=====
var KEY_PIC_MAP_RULES = [
  { pattern: '/key/p_%E9%9B%B6%E5%8F%B7%E5%A4%A7%E5%9D%9D', map: 'zero_dam' },   // p_零号大坝白卡
  { pattern: '/key/p_%E9%95%BF%E5%BC%93%E6%BA%AA%E8%B0%B7', map: 'longbow' },     // p_长弓溪谷白卡
  { pattern: '/key/p_%E8%88%AA%E5%A4%A9%E5%9F%BA%E5%9C%B0', map: 'space_base' },  // p_航天基地白卡/金卡
  { pattern: '/key/p_%E5%B7%B4%E5%85%8B%E4%BB%80',         map: 'brakkesh' }      // p_巴克什白卡
];

// ===== 监狱钥匙卡关键词（pic URL 无地图信息，靠名称匹配）=====
var PRISON_KEY_KEYWORDS = [
  '监狱', '仓库区', '顶层', '水位控制室'
];

// ===== 收集品 → 地图映射（基于游戏知识，API 不提供此数据）=====
var COLLECTION_MAP_RULES = [
  // 零号大坝专属
  { kw: ['纪念奖杯','金条','黄金瞪羚','优秀雇员奖杯','渡鸦项坠','聚乙烯纤维'], map: 'zero_dam' },

  // 长弓溪谷专属
  { kw: ['绝密服务器','劳力士怀表','香槟','军用终端','重型突击背心','显卡','阵列服务器','可编程处理器','镜头','动力电池组'], map: 'longbow' },

  // 航天基地专属
  { kw: ['超算单元','军用电台','牌表','滑膛枪','高能瓦斯罐','E型滤毒罐','装甲车电池'], map: 'space_base' },

  // 巴克什专属
  { kw: ['非洲之星','留声机','三幻神','海盗弯刀','卫队金扳指','特种钢','OLIGHT','脑机'], map: 'brakkesh' },

  // 监狱专属
  { kw: ['电子脚镣','高出力粉碎钳','军用无人机','潮汐监狱','飞行员眼镜'], map: 'prison' },

  // 全地图通用（不标记具体地图）
  { kw: ['扑克牌'], map: 'all' },
  { kw: ['八宝粥','神奇八宝粥'], map: 'all' }
];

/**
 * 根据物品 pic URL 判断钥匙卡所属地图
 * @param {string} picUrl 物品图片 URL
 * @returns {string|null} 地图 key 或 null
 */
function getKeyMapFromPic(picUrl) {
  if (!picUrl) return null;
  for (var i = 0; i < KEY_PIC_MAP_RULES.length; i++) {
    if (picUrl.indexOf(KEY_PIC_MAP_RULES[i].pattern) !== -1) {
      return KEY_PIC_MAP_RULES[i].map;
    }
  }
  // pic URL 无地图前缀（object/ 路径），检查是否监狱钥匙
  if (picUrl.indexOf('/object/') !== -1) return 'prison';
  return null;
}

/**
 * 根据物品名称查找所属地图
 * @param {string} name 物品名称
 * @param {string} category 分类（'key' 或 'collection'）
 * @param {string} [picUrl] 物品图片 URL（钥匙卡优先使用）
 * @returns {object|null} 地图信息或 null
 */
function findItemMap(name, category, picUrl) {
  if (!name) return null;

  if (category === 'key') {
    // 优先使用 pic URL 匹配（100% 准确）
    var picMap = getKeyMapFromPic(picUrl);
    if (picMap) return MAPS[picMap] || null;

    // fallback: 关键词匹配
    var kw = name.toLowerCase();
    for (var i = 0; i < PRISON_KEY_KEYWORDS.length; i++) {
      if (kw.indexOf(PRISON_KEY_KEYWORDS[i].toLowerCase()) !== -1) {
        return MAPS['prison'] || null;
      }
    }
    return null;
  }

  // 收集品：关键词匹配
  if (category === 'collection') {
    var kw2 = name.toLowerCase();
    for (var i = 0; i < COLLECTION_MAP_RULES.length; i++) {
      var rule = COLLECTION_MAP_RULES[i];
      for (var j = 0; j < rule.kw.length; j++) {
        if (kw2.indexOf(rule.kw[j].toLowerCase()) !== -1) {
          if (rule.map === 'all') return null;
          return MAPS[rule.map] || null;
        }
      }
    }
    return null;
  }

  return null;
}

// ===== store/cache.js =====
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

// ===== 浏览状态 =====
function saveBrowseState() {
  var state = {
    page: pageStack[pageStack.length - 1] || 'home',
    category: typeof currentCategory !== 'undefined' ? currentCategory : null,
    isAllMode: typeof isAllMode !== 'undefined' ? isAllMode : false,
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
function getCatIconsCache() {
  try { return JSON.parse(localStorage.getItem(CAT_ICONS_KEY)); } catch(e) { return null; }
}

function setCatIconsCache(picks) {
  localStorage.setItem(CAT_ICONS_KEY, JSON.stringify(picks));
}

// ===== store/favorites.js =====
// ===== store/favorites.js — 收藏 + 最近浏览 =====
// 功能清单: 收藏(增删查改,上限50) | 最近浏览(上限15) | 收藏状态判断
// 依赖: config.js(FAVORITES_KEY/MAX_FAVORITES/RECENT_VIEWS_KEY/MAX_RECENT) utils.js(toast-运行时)
// 被依赖: render/ app/

// ===== 最近浏览 =====
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

// ===== 收藏 =====
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

// ===== store/search.js =====
// ===== store/search.js — 搜索历史 + 搜索索引 =====
// 功能清单: 搜索历史(最多20条,去重) | 字符级倒排索引 | 索引搜索 | ID映射
// 依赖: config.js(QUERY_HISTORY_KEY/MAX_HISTORY) utils.js(toast-运行时)
// 被依赖: api.js render/search.js app/

// ===== 搜索历史 =====
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
// ===== api.js — 网络请求层 =====
// 功能清单: API代理请求(带重试+超时) | 请求去重(同端点并发合并) | 分类全量拉取(fetchCategoryAll)
// 预取数据收集(loadAllItemsQuick) | 首批物品获取(getFirstBatchItems) | 后台静默加载(warmAllDataBackground)
// 预取完成等待(loadAllItemsBackground) | 全局统计(getGlobalStats) | 价格历史API(fetchItemHistory)
// 数据净化(sanitizeItemArray/canonicalId/clampPrice) | 并发控制(batchAsync)
// 依赖: config.js(CATEGORIES) store/cache.js(setCache/getCache/setApiDuration) store/search.js(buildSearchIndex)
// 被依赖: render/ app/

var WORKER_BASE = (typeof window !== 'undefined' && window.__WORKER_BASE) || '';
var PROXY_URL = WORKER_BASE + '/api/proxy';

var _isWeChat = false;
if (typeof navigator !== 'undefined' && navigator.userAgent) {
  _isWeChat = /MicroMessenger/i.test(navigator.userAgent);
}

var _apiPending = {};
var _apiTtlCache = {};   // item_price_all 5 分钟内存缓存（v3 修复: 详情页/收藏刷新不再每次都打上游）
var API_TTL_MS = 5 * 60 * 1000;

function getApiCacheKey(endpoint, params) {
  return endpoint + '?' + JSON.stringify(params);
}

async function apiRequest(endpoint, params, retries, noCache) {
  if (retries === undefined || retries === null) retries = 3;
  params = params || {};
  if (_isWeChat) { params._wc = Math.floor(Date.now() / 60000); }
  var cacheKey = getApiCacheKey(endpoint, params);
  var lastErr;

  // ★ v3: item_price_all 5 分钟 TTL 缓存（刷新类操作传 noCache=true 绕过）
  if (!noCache && endpoint === 'item_price_all') {
    var ttlHit = _apiTtlCache[endpoint];
    if (ttlHit && Date.now() - ttlHit.ts < API_TTL_MS) return ttlHit.data;
  }

  var canDedup = endpoint === 'item_price_all' || endpoint === 'item_list';
  if (!noCache && canDedup && _apiPending[cacheKey]) {
    try { return await _apiPending[cacheKey]; } catch(e) { /* fall through to fresh request */ }
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
            delete _apiPending[cacheKey];
            if (!noCache && endpoint === 'item_price_all') {
              _apiTtlCache[endpoint] = { ts: Date.now(), data: data };
            }
            resolve(data);
          })
          .catch(function(err) {
            clearTimeout(timeoutId);
            if (canDedup) { delete _apiPending[cacheKey]; }
            reject(err);
          });

        if (canDedup && attemptN === 0) {
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

async function fetchCategoryAll(catKey) {
  var t0 = Date.now();
  try {
    var res1 = await apiRequest('item_list', { types: catKey, p: 1 });
    var allItems = sanitizeItemArray(res1.data, 'list').map(function(item) {
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

    var remainingPages = [];
    for (var p = 2; p <= totalPages; p++) remainingPages.push(p);
    var pageResults = await batchAsync(remainingPages.map(function(page) {
      return function() {
        return apiRequest('item_list', { types: catKey, p: page })
          .then(function(r) { return sanitizeItemArray(r.data, 'list').map(function(item) { item._category = catKey; return item; }); })
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

async function loadAllItemsQuick() {
  var prefetched = window.__prefetch || {};
  for (var i = 0; i < CATEGORIES.length; i++) {
    var p = prefetched[CATEGORIES[i].key];
    if (p && p._quick) {
      try {
        await p._quick;
        break;
      } catch(e) { /* continue */ }
    }
  }
  var allItems = [];
  CATEGORIES.forEach(function(cat) {
    var p = prefetched[cat.key];
    if (p && p._resolvedData && p._resolvedData.length > 0) {
      allItems = allItems.concat(p._resolvedData);
    }
  });
  if (allItems.length === 0) {
    try {
      var fallbackAll = [];
      var catResults = await Promise.all(CATEGORIES.map(function(cat) {
        return apiRequest('item_list', { types: cat.key, p: 1 }).then(function(r) {
          return sanitizeItemArray(r.data, 'list').map(function(item) {
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

async function getFirstBatchItems(targetCount) {
  if (targetCount === undefined || targetCount === null) targetCount = 50;
  var prefetched = window.__prefetch || {};

  if (prefetched._allPage1Ready) {
    try {
      var sortedItems = await prefetched._allPage1Ready;
      if (sortedItems && sortedItems.length > 0) {
        return sortedItems.slice(0, targetCount);
      }
    } catch(e) { /* 降级 */ }
  }

  var all = [];
  try {
    all = await loadAllItemsQuick();
  } catch(e) { all = []; }

  function score(item) {
    var bl = Math.abs(item.bl || item.day_3_bl || item.day_7_bl || 0);
    var p = item.price || 0;
    var pf = p >= 1000000 ? 4 : p >= 100000 ? 3 : p >= 10000 ? 2 : 1;
    return bl * pf;
  }
  all.sort(function(a, b) { return score(b) - score(a); });
  return all.slice(0, targetCount);
}

function warmAllDataBackground(onProgress) {
  var prefetched = window.__prefetch || {};
  var catsLoaded = 0;
  var totalCats = CATEGORIES.length;

  return Promise.all(CATEGORIES.map(function(cat) {
    var p = prefetched[cat.key];
    if (p && p._quick) {
      return p._quick.then(function() {
        return new Promise(function(resolve) {
          if (p._complete) { catsLoaded++; if (onProgress) onProgress(catsLoaded, totalCats); resolve(true); return; }
          var checkTimer;
          var timeout = setTimeout(function() {
            clearInterval(checkTimer);
            catsLoaded++;
            if (onProgress) onProgress(catsLoaded, totalCats);
            resolve(false);
          }, 15000);
          checkTimer = setInterval(function() {
            if (p._complete) {
              clearTimeout(timeout);
              clearInterval(checkTimer);
              catsLoaded++;
              if (onProgress) onProgress(catsLoaded, totalCats);
              resolve(true);
            }
          }, 200);
        });
      }).catch(function() { catsLoaded++; if (onProgress) onProgress(catsLoaded, totalCats); return false; });
    }
    return fetchCategoryAll(cat.key).then(function() {
      catsLoaded++;
      if (onProgress) onProgress(catsLoaded, totalCats);
      return true;
    }).catch(function() {
      catsLoaded++;
      if (onProgress) onProgress(catsLoaded, totalCats);
      return false;
    });
  }));
}

function isPrefetchComplete() {
  var prefetched = window.__prefetch || {};
  for (var i = 0; i < CATEGORIES.length; i++) {
    var p = prefetched[CATEGORIES[i].key];
    if (!p || !p._complete) return false;
  }
  return true;
}

function loadAllItemsBackground(currentItems) {
  var prefetched = window.__prefetch || {};

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

function getCategoryTotalCount(catKey) {
  var prefetched = window.__prefetch || {};
  var p = prefetched[catKey];
  if (p && typeof p._totalCount === 'number' && p._totalCount > 0) return p._totalCount;
  return 0;
}

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

// ===== 历史数据 API =====
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

// ===== 数据净化层 =====
var _idMismatchWarned = {};
function _warnIdMismatch(rawItem) {
  if (rawItem.id && rawItem.tid && String(rawItem.id) !== String(rawItem.tid)) {
    var key = rawItem.id + '|' + rawItem.tid;
    if (!_idMismatchWarned[key]) {
      _idMismatchWarned[key] = true;
      console.warn('[canonicalId] id/tid 不一致:',
        { id: rawItem.id, tid: rawItem.tid, name: rawItem.name || '(未知)' },
        '已使用 id=' + canonicalId(rawItem));
    }
  }
}

function canonicalId(rawItem) {
  var id = Number(rawItem.id) || Number(rawItem.tid) || 0;
  return id || 0;
}

function safeNum(v) {
  var n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function clampPrice(v) {
  var n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function sanitizePriceItem(p) {
  _warnIdMismatch(p);
  return {
    id: canonicalId(p),
    tid: p.tid != null ? Number(p.tid) : null,
    price: clampPrice(p.price),
    bl: safeNum(p.bl),
    day_3_bl: safeNum(p.day_3_bl),
    day_3_price: clampPrice(p.day_3_price),
    day_7_bl: safeNum(p.day_7_bl),
    day_7_price: clampPrice(p.day_7_price),
    day_30_bl: safeNum(p.day_30_bl),
    day_30_price: clampPrice(p.day_30_price),
    price_start: clampPrice(p.price_start || p.priceStart),
    is_get_time: p.is_get_time
  };
}

function sanitizeListItem(item) {
  _warnIdMismatch(item);
  return {
    id: canonicalId(item),
    tid: item.tid != null ? Number(item.tid) : null,
    name: item.name || '',
    pic: item.pic || '',
    grade: safeNum(item.grade),
    ShopSellType: item.ShopSellType || '',
    desc: item.desc || '',
    secondClassCN: item.secondClassCN || '',
    length: safeNum(item.length),
    width: safeNum(item.width),
    weight: safeNum(item.weight || item.Weight),
    objectID: item.objectID || '',
    price: clampPrice(item.price),
    bl: safeNum(item.bl),
    day_3_bl: safeNum(item.day_3_bl),
    day_3_price: clampPrice(item.day_3_price),
    day_7_bl: safeNum(item.day_7_bl),
    day_7_price: clampPrice(item.day_7_price),
    day_30_bl: safeNum(item.day_30_bl),
    day_30_price: clampPrice(item.day_30_price),
    price_start: clampPrice(item.price_start || item.priceStart),
    is_get_time: item.is_get_time
  };
}

function sanitizeItemArray(data, source) {
  if (!Array.isArray(data)) return [];
  var sanitizer = source === 'price' ? sanitizePriceItem : sanitizeListItem;
  return data
    .filter(function(item) { return item && (item.id || item.tid); })
    .map(sanitizer);
}

// ===== render/shared.js =====
// ===== render/shared.js — 共享状态 + 下拉面板 + 筛选器 + 分类图标 =====
// 功能清单: 首页筛选/排序状态变量 | 物品显著性评分 | 时间段/价格字段读取
// 预取数据收集 | 下拉面板管理(10个函数) | 首页筛选设置器(6个函数)
// 浏览状态恢复(applyHomeBrowseState) | 分类图标提取(updateCategoryIcons)
// 依赖: config.js(CATEGORIES/HOME_PAGE_SIZE) utils.js store/cache.js
// 被依赖: render/home.js render/list.js api.js app/

// ===== 首页筛选/排序状态 =====
var homeCategoryFilter = 'all';
var homePeriod = 'bl';
var homePriceRange = 'all';
var homeSortBy = 'default';
var homeSortDir = 'desc';
var homeCurrentPage = 1;
var _homeAllFiltered = [];
var _topMoverApiDone = false;

// ===== 物品显著性评分 =====
function getItemSignificance(item) {
  var bl = Math.abs(item.bl || item.day_3_bl || item.day_7_bl || 0);
  var p = item.price || 0;
  var pf = p >= 1000000 ? 4 : p >= 100000 ? 3 : p >= 10000 ? 2 : 1;
  return bl * pf;
}

// ===== 工具函数 =====
function getFieldByPeriod(item, field) {
  if (field === 'bl') return (item.bl != null) ? item.bl : 0;
  if (field === 'day_3_bl') return (item.day_3_bl != null) ? item.day_3_bl : 0;
  if (field === 'day_7_bl') return (item.day_7_bl != null) ? item.day_7_bl : 0;
  return (item.bl != null) ? item.bl : 0;
}

function getPrefetchItems() {
  var prefetched = window.__prefetch;
  if (!prefetched) return [];
  var all = [];
  for (var i = 0; i < CATEGORIES.length; i++) {
    var p = prefetched[CATEGORIES[i].key];
    if (p && p._resolvedData && p._resolvedData.length > 0) {
      all = all.concat(p._resolvedData);
    }
  }
  return all;
}

// ===== 下拉面板管理 =====
function closeAllDropdowns() {
  ['timeDropdown','priceDropdown','filterDropdown','sortDropdown'].forEach(function(id) {
    var el = document.getElementById(id); if (el) el.style.display = 'none';
  });
  var toolbar = document.getElementById('filterToolbar');
  if (toolbar) toolbar.classList.remove('dropdown-open');
}

function toggleTimeDropdown() { toggleDropdown('timeDropdown', 'btnTime'); }
function closeTimeDropdown() { document.getElementById('timeDropdown').style.display = 'none'; }
function togglePriceDropdown() { toggleDropdown('priceDropdown', 'btnPrice'); }
function closePriceDropdown() { document.getElementById('priceDropdown').style.display = 'none'; }
function toggleFilterDropdown() { toggleDropdown('filterDropdown', 'btnFilter'); }
function closeFilterDropdown() { document.getElementById('filterDropdown').style.display = 'none'; }
function toggleSortDropdown() { toggleDropdown('sortDropdown', 'btnSort'); }
function closeSortDropdown() { document.getElementById('sortDropdown').style.display = 'none'; }

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
  if (panel.parentNode !== document.body) {
    document.body.appendChild(panel);
  }
  panel.style.visibility = 'hidden';
  panel.style.display = 'block';
  var panelW = panel.offsetWidth;
  var btn = document.getElementById(btnId);
  var rect = btn.getBoundingClientRect();
  var left = rect.left;
  var vw = window.innerWidth;
  if (left + panelW > vw - 8) left = vw - panelW - 8;
  if (left < 8) left = 8;
  panel.style.top = (rect.bottom + 4) + 'px';
  panel.style.left = left + 'px';
  panel.style.right = 'auto';
  panel.style.visibility = 'visible';

  var toolbar = document.getElementById('filterToolbar');
  if (toolbar) toolbar.classList.add('dropdown-open');
}

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

// ===== 首页筛选设置器 =====
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

function setHomeSort(sortBy, sortDir) {
  homeSortBy = sortBy;
  homeSortDir = sortDir;
  var labelText;
  if (sortBy === 'default') {
    labelText = '综合↓';
  } else if (sortBy === 'change') {
    labelText = '涨跌幅';
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

function applyHomeBrowseState(state) {
  if (!state) return;
  if (state.homeCategoryFilter !== undefined) homeCategoryFilter = state.homeCategoryFilter;
  if (state.homePeriod !== undefined) homePeriod = state.homePeriod;
  if (state.homePriceRange !== undefined) homePriceRange = state.homePriceRange;
  if (state.homeSortBy !== undefined) homeSortBy = state.homeSortBy;
  if (state.homeSortDir !== undefined) homeSortDir = state.homeSortDir;
  if (state.homeCurrentPage !== undefined) homeCurrentPage = state.homeCurrentPage;

  var timeLabels = { bl: '近1天', day_3_bl: '近3天', day_7_bl: '近7天' };
  var timeEl = document.getElementById('timeLabel');
  if (timeEl) timeEl.textContent = timeLabels[homePeriod] || '近1天';

  var priceLabels = { all: '全部价格', lt1w: '< 1万', '1-10w': '1万~10万', '10-100w': '10万~100万', gt100w: '> 100万' };
  var priceEl = document.getElementById('priceLabel');
  if (priceEl) priceEl.textContent = priceLabels[homePriceRange] || '全部价格';

  var filterEl = document.getElementById('filterLabel');
  if (filterEl) filterEl.textContent = homeCategoryFilter === 'all' ? '筛选' : (CATEGORY_MAP[homeCategoryFilter] || homeCategoryFilter);

  var sortLabelText;
  if (homeSortBy === 'default') sortLabelText = '综合↓';
  else if (homeSortBy === 'change') sortLabelText = '涨跌幅';
  else sortLabelText = '价格' + (homeSortDir === 'desc' ? '↓' : '↑');
  var sortEl = document.getElementById('sortLabel');
  if (sortEl) sortEl.textContent = sortLabelText;

  document.querySelectorAll('#timeDropdown .dropdown-item').forEach(function(item) {
    item.classList.toggle('active', item.dataset.period === homePeriod);
  });
  document.querySelectorAll('#priceDropdown .dropdown-item').forEach(function(item) {
    item.classList.toggle('active', item.dataset.range === homePriceRange);
  });
  document.querySelectorAll('.filter-cat-chip').forEach(function(chip) {
    chip.classList.toggle('active', chip.dataset.cat === homeCategoryFilter);
  });
  document.querySelectorAll('#sortDropdown .dropdown-item').forEach(function(item) {
    item.classList.toggle('active', item.dataset.sort === homeSortBy && (homeSortBy === 'default' || item.dataset.dir === homeSortDir));
  });
}

// ===== 分类图标 =====
function updateCategoryIcons(allItems) {
  if (!allItems || allItems.length === 0) return;
  var existing = getCatIconsCache() || {};
  var picks = {};
  Object.keys(existing).forEach(function(k) { picks[k] = existing[k]; });
  allItems.forEach(function(item) {
    var cat = item._category;
    if (cat && !picks[cat] && item.pic) {
      picks[cat] = item.pic;
    }
  });
  var logisticsItem = allItems.find(function(i) { return i.name === '物流信息单' && i.pic; });
  if (logisticsItem) picks['all'] = logisticsItem.pic;

  setCatIconsCache(picks);
  document.querySelectorAll('.cat-icon[data-cat]').forEach(function(el) {
    var cat = el.dataset.cat;
    if (picks[cat]) {
      el.innerHTML = catIconHTML(picks[cat]);
    }
  });
}

// ===== render/charts.js =====
// ===== render/charts.js — SVG 价格图表 =====
// 功能清单: 详情页30天价格曲线SVG(带Catmull-Rom插值+Y轴刻度+渐变填充) | 列表页迷你折线SVG
// 依赖: utils.js(shortPrice/formatPrice)
// 被依赖: render/detail.js render/home.js render/list.js

function generatePriceCurveSVG(pricePoints) {
  if (!pricePoints || pricePoints.length < 2) return '<div style="text-align:center;color:#666;padding:30px">数据不足，无法生成曲线</div>';
  var _gradId = 'grad_' + (generatePriceCurveSVG._seq = (generatePriceCurveSVG._seq || 0) + 1);
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
  var paddedMax = yMax;
  paddedMin = yMin;
  var paddedRange = paddedMax - paddedMin || 1;

  var dataPoints = pts.map(function(p) {
    return {
      x: PAD.left + (1 - p.day / 30) * plotW,
      y: PAD.top + plotH - ((p.price - paddedMin) / paddedRange) * plotH,
      day: p.day, price: p.price, hist: !!p.hist, cloud: !!p.cloud
    };
  });

  // 保单调三次 Hermite 插值(Fritsch–Carlson), 替代 Catmull-Rom。
  // Catmull-Rom 在相邻两日价格落差大时会产生过冲: 曲线在两个数据点之间越过下界再折返,
  // 造成图线"往回折"以及自交叠。保单调插值保证每段曲线单调、且取值不越出两端点范围。
  function monotoneSmooth(dataPoints) {
    var n = dataPoints.length;
    var h = [], d = [], m = [];
    var i;
    for (i = 0; i < n - 1; i++) {
      h[i] = (dataPoints[i + 1].x - dataPoints[i].x) || 1e-6;
      d[i] = (dataPoints[i + 1].y - dataPoints[i].y) / h[i];
    }
    m[0] = d[0];
    m[n - 1] = d[n - 2];
    for (i = 1; i < n - 1; i++) {
      m[i] = (d[i - 1] * d[i] <= 0) ? 0 : (d[i - 1] + d[i]) / 2;
    }
    for (i = 0; i < n - 1; i++) {
      if (d[i] !== 0) {
        var alpha = m[i] / d[i], beta = m[i + 1] / d[i];
        var ab2 = alpha * alpha + beta * beta;
        if (ab2 > 9) {
          var tau = 3 / Math.sqrt(ab2);
          m[i] = tau * alpha * d[i];
          m[i + 1] = tau * beta * d[i];
        }
      }
    }
    function h00(t) { return 2 * t * t * t - 3 * t * t + 1; }
    function h10(t) { return t * t * t - 2 * t * t + t; }
    function h01(t) { return -2 * t * t * t + 3 * t * t; }
    function h11(t) { return t * t * t - t * t; }
    var out = [];
    for (i = 0; i < n - 1; i++) {
      var x0 = dataPoints[i].x, y0 = dataPoints[i].y;
      var x1 = dataPoints[i + 1].x, y1 = dataPoints[i + 1].y;
      var dx = x1 - x0;
      var steps = Math.max(8, Math.round(dx / 0.8));
      for (var s = 0; s < steps; s++) {
        var t = s / steps;
        var y = h00(t) * y0 + h10(t) * dx * m[i] + h01(t) * y1 + h11(t) * dx * m[i + 1];
        out.push({ x: x0 + dx * t, y: y });
      }
    }
    out.push({ x: dataPoints[n - 1].x, y: dataPoints[n - 1].y });
    return out;
  }

  var smoothPts = monotoneSmooth(dataPoints);

  var pathD = '';
  smoothPts.forEach(function(p, idx) {
    pathD += (idx === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1) + ' ';
  });
  var firstX = smoothPts[0].x.toFixed(1);
  var lastX = smoothPts[smoothPts.length - 1].x.toFixed(1);
  var bottomY = (PAD.top + plotH).toFixed(1);
  var areaD = pathD + 'L' + lastX + ',' + bottomY + ' L' + firstX + ',' + bottomY + ' Z';

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
    var safeDay = Math.max(0, Math.min(p.day, 30));
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

// ===== render/home.js =====
// ===== render/home.js — 首页渲染 =====
// 功能清单: 首页入口(renderHome) | 涨幅前二卡片(renderHomeTopMover) | 物品卡片+迷你折线
// 首页物品列表(renderHomeMovers)含筛选/排序/分页 | 底部分页栏 | 后台数据追加
// 依赖: config.js render/shared.js render/charts.js store/cache.js store/favorites.js utils.js
// 被依赖: app/router.js api.js

// ===== 首页入口 =====
function renderHome() {
  checkFavoritePriceChanges();
  renderHomeTopMover();
  renderHomeMovers();
}

// ===== 涨幅前二卡片 =====
function renderHomeTopMover() {
  var el = document.getElementById('topMover');
  if (!el) return;

  var cached = getCache();
  var all = cached && cached._allItems ? cached._allItems : getPrefetchItems();

  if (all.length === 0) {
    el.style.display = 'none';
    return;
  }

  var prefetched = window.__prefetch || {};
  _topMoverApiDone = !!(prefetched._topMoverApiDone);

  _renderTopMoverFromData(all);
}

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
        ? '<img src="' + sanitizeUrl(smallPicUrl(item.pic, 72)) + '" alt="" loading="eager" decoding="sync" fetchpriority="high" style="width:36px;height:36px;border-radius:6px;object-fit:contain;margin-right:10px" onerror="this.style.display=\'none\'">'
        : '';
      return '<div class="tm-row" onclick="openTopMover(' + Number(item.id) + ')" style="display:flex;align-items:center;padding:6px 16px;cursor:pointer;transition:all 0.15s">' +
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

// ===== 迷你折线图（首页物品卡片内） =====
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

// ===== 首页物品卡片 =====
function _renderHomeItemCard(item, field, maxAbsBl, isEager) {
  var bl = getFieldByPeriod(item, field) || 0;
  var gradeBg = (item._category !== 'gun' && item.grade) ? 'background:' + getGradeColor(item.grade) + '15;border-color:' + getGradeColor(item.grade) + '30;' : '';
  var gradeDiamond = (item._category !== 'gun' && item.grade) ? '<div class="grade-diamond" style="background:' + getGradeColor(item.grade) + '"></div>' : '';
  var loadingAttr = isEager ? 'loading="eager" decoding="sync"' : 'loading="lazy" decoding="async"';
  var picHtml = item.pic ? '<img src="' + sanitizeUrl(smallPicUrl(item.pic, 72)) + '" alt="" ' + loadingAttr + ' onerror="this.parentElement.innerHTML=\'<span class=pic-placeholder>-</span>\'">' : '<span class="pic-placeholder">-</span>';
  var gradeTag = (item._category !== 'gun' && item.grade) ? '<span class="item-grade" style="color:' + getGradeColor(item.grade) + '">' + getGradeText(item.grade) + '</span>' : '';
  var sparkHtml = _renderMiniSparkline(item);
  return '<div class="item-card fade-in" data-item-id="' + Number(item.id) + '" onclick="openPriceMover(' + Number(item.id) + ')" style="position:relative;' + gradeBg + '">' +
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

// ★ 首页默认视图（分类=全部）专属排序：把「已加载的数据 + 有图」的物品优先放进首屏。
// 规则（严格限定首页默认视图；分类 / 涨跌幅 / 价格排序逻辑一概不动）：
//   1) 有实时价格(price>0) 优先于 价格缺失(0/缺) 的
//   2) 有图片(pic 存在) 优先于 无图（占位符）的
//   3) 同分时再按原综合热度 getItemSignificance 降序，保证原有默认体验不被破坏
function _homeDefaultAllSort(a, b) {
  var na = (a.price || 0) > 0 ? 0 : 1;
  var nb = (b.price || 0) > 0 ? 0 : 1;
  if (na !== nb) return na - nb;
  var pa = a.pic ? 0 : 1;
  var pb = b.pic ? 0 : 1;
  if (pa !== pb) return pa - pb;
  return getItemSignificance(b) - getItemSignificance(a);
}

// ===== 首页物品列表（分页） =====
var _homeDataArriveListener = null;
function renderHomeMovers(resetPage) {
  if (resetPage !== false) homeCurrentPage = 1;
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
    if (!_homeDataArriveListener) {
      _homeDataArriveListener = true;
      var _arriveTimeout = setTimeout(function() {
        if (_homeDataArriveListener) {
          _homeDataArriveListener = null;
        }
      }, 15000);
      var prefetched = window.__prefetch || {};
      if (typeof prefetched.onItemsArrive === 'function') {
        prefetched.onItemsArrive(function() {
          clearTimeout(_arriveTimeout);
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

  var dirMul = homeSortDir === 'desc' ? -1 : 1;
  if (homeSortBy === 'default') {
    if (homeCategoryFilter !== 'all') {
      // 分类视图：保持原有分类排序逻辑，绝不动
      filtered.sort(function(a, b) { return (getItemSignificance(b) - getItemSignificance(a)); });
    } else {
      // 全部视图：已加载的数据与图片优先进首屏（见 _homeDefaultAllSort）
      filtered.sort(_homeDefaultAllSort);
    }
  } else if (homeSortBy === 'change') {
    filtered.sort(function(a, b) {
      return ((getFieldByPeriod(a, field) || 0) - (getFieldByPeriod(b, field) || 0)) * dirMul;
    });
  } else {
    filtered.sort(function(a, b) { return ((a.price || 0) - (b.price || 0)) * dirMul; });
  }

  _homeAllFiltered = filtered;

  var totalPages = Math.ceil(filtered.length / HOME_PAGE_SIZE) || 1;
  if (homeCurrentPage > totalPages) homeCurrentPage = totalPages;
  var offset = (homeCurrentPage - 1) * HOME_PAGE_SIZE;
  var items = filtered.slice(offset, offset + HOME_PAGE_SIZE);

  if (items.length === 0) {
    listEl.innerHTML = '<div class="empty-container" style="padding:20px"><div class="empty-icon" style="font-size:24px">-</div><div class="empty-text" style="font-size:12px">暂无数据</div></div>';
    return;
  }

  var maxAbsBl = 0;
  items.forEach(function(item) { var a = Math.abs(getFieldByPeriod(item, field) || 0); if (a > maxAbsBl) maxAbsBl = a; });

  var html = items.map(function(item) {
    return _renderHomeItemCard(item, field, maxAbsBl);
  }).join('');

  html += _renderPagination(totalPages, homeCurrentPage, filtered.length);

  listEl.innerHTML = html;
}

function renderHomeMoversWithData(items) {
  var listEl = document.getElementById('homeMoversList');
  if (!listEl || !items || items.length === 0) {
    if (listEl) listEl.innerHTML = '<div class="empty-container" style="padding:20px"><div class="empty-text" style="font-size:12px">数据加载中...</div></div>';
    return;
  }
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
  filtered = filtered.filter(function(item) { var v = getFieldByPeriod(item, field); return v != null && !isNaN(v); });
  if (homeSortBy === 'default') {
    if (homeCategoryFilter !== 'all') filtered.sort(function(a,b) { return getItemSignificance(b) - getItemSignificance(a); });
    else filtered.sort(_homeDefaultAllSort);
  } else if (homeSortBy === 'change') {
    var dm = homeSortDir === 'desc' ? -1 : 1;
    filtered.sort(function(a,b) { return ((getFieldByPeriod(a,field)||0) - (getFieldByPeriod(b,field)||0)) * dm; });
  } else {
    var dm2 = homeSortDir === 'desc' ? -1 : 1;
    filtered.sort(function(a,b) { return ((a.price||0) - (b.price||0)) * dm2; });
  }
  _homeAllFiltered = filtered;
  homeCurrentPage = 1;
  var pItems = filtered.slice(0, HOME_PAGE_SIZE);
  if (pItems.length === 0) { listEl.innerHTML = '<div class="empty-container" style="padding:20px"><div class="empty-text" style="font-size:12px">暂无数据</div></div>'; return; }
  var maxAbsBl = 0;
  pItems.forEach(function(item) { var a = Math.abs(getFieldByPeriod(item, field)||0); if (a > maxAbsBl) maxAbsBl = a; });
  var html = pItems.map(function(item, idx) { return _renderHomeItemCard(item, field, maxAbsBl, idx < 4); }).join('');
  var totalPages = Math.ceil(filtered.length / HOME_PAGE_SIZE) || 1;
  html += _renderPagination(totalPages, 1, filtered.length);
  listEl.innerHTML = html;
}

// ===== 分页 =====
function goToHomePage(n) {
  homeCurrentPage = n;
  var listEl = document.getElementById('homeMoversList');
  if (!listEl) return;
  var totalPages = Math.ceil(_homeAllFiltered.length / HOME_PAGE_SIZE) || 1;
  if (n < 1) n = 1;
  if (n > totalPages) n = totalPages;
  homeCurrentPage = n;
  var offset = (n - 1) * HOME_PAGE_SIZE;
  var items = _homeAllFiltered.slice(offset, offset + HOME_PAGE_SIZE);
  var field = homePeriod;
  var maxAbsBl = 0;
  items.forEach(function(item) { var a = Math.abs(getFieldByPeriod(item, field) || 0); if (a > maxAbsBl) maxAbsBl = a; });
  var html = items.map(function(item) {
    return _renderHomeItemCard(item, field, maxAbsBl);
  }).join('');
  html += _renderPagination(totalPages, n, _homeAllFiltered.length);
  listEl.innerHTML = html;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function _renderPagination(totalPages, current, totalItems) {
  if (totalPages <= 1) {
    return '<div class="home-pagination" style="text-align:center;padding:14px 12px;color:#666;font-size:12px">共 ' + totalItems + ' 件</div>';
  }
  var html = '<div class="home-pagination" style="display:flex;align-items:center;justify-content:center;gap:6px;padding:14px 8px;flex-wrap:wrap">';
  if (current > 1) {
    html += '<button class="page-btn" onclick="goToHomePage(' + (current - 1) + ')" style="font-size:12px">‹</button>';
  } else {
    html += '<span style="width:34px"></span>';
  }
  for (var i = 1; i <= totalPages; i++) {
    if (totalPages <= 7 || i === 1 || i === totalPages || (i >= current - 1 && i <= current + 1)) {
      if (i === current) {
        html += '<button class="page-btn active" style="background:rgba(102,126,234,0.3);color:#aab8ff;font-weight:600">' + i + '</button>';
      } else {
        html += '<button class="page-btn" onclick="goToHomePage(' + i + ')" style="font-size:12px">' + i + '</button>';
      }
    } else if (i === current - 2 || i === current + 2) {
      html += '<span style="color:#555;width:34px;text-align:center">...</span>';
    }
  }
  if (current < totalPages) {
    html += '<button class="page-btn" onclick="goToHomePage(' + (current + 1) + ')" style="font-size:12px">›</button>';
  } else {
    html += '<span style="width:34px"></span>';
  }
  html += '<span style="color:#555;font-size:11px;margin-left:8px">共 ' + totalItems + ' 件</span>';
  html += '</div>';
  return html;
}

function appendHomeItems(newItems) {
  if (!newItems || newItems.length === 0) return;
  renderHomeMovers(false);
}

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
    if (all.length > _homeAllFiltered.length) {
      renderHomeMovers(false);
      checkFavoritePriceChanges();
      renderHomeTopMover();
    }
  }, 500);
}

// ===== render/list.js =====
// ===== render/list.js — 列表页渲染 =====
// 功能清单: 物品排序(sortItems) | 分类列表渲染(renderList)含统计+卡片+分页
// 依赖: config.js(CATEGORY_MAP/itemsPerPage) store/cache.js store/favorites.js utils.js api.js(gGCS/gGS)
// 被依赖: app/router.js

function sortItems(items) {
  var sorted = items.slice();
  var dir = sortDir === 'asc' ? 1 : -1;
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

  var effectiveTotal = realTotal > loadedCount ? realTotal : loadedCount;
  var totalPages = Math.ceil(effectiveTotal / itemsPerPage) || 1;
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;
  var start = (currentPage - 1) * itemsPerPage;
  var pageItems = sorted.slice(start, start + itemsPerPage);

  var statsHtml = '<span>共 ' + (realTotal > 0 ? formatLargeNum(realTotal) : loadedCount) + ' 件';
  if (realTotal > 0 && realTotal > loadedCount) {
    statsHtml += ' <span style="font-size:10px;color:#888">(已加载 ' + formatLargeNum(loadedCount) + ')</span>';
  }
  if (isLoadingMore) {
    statsHtml += ' <span style="font-size:10px;color:#6366f1">加载中...</span>';
  }
  statsHtml += ' · 第 ' + currentPage + '/' + totalPages + ' 页</span>';
  if (sorted.length > 0) {
    statsHtml += '<span>更新于 ' + formatTime(sorted[0].is_get_time) + '</span>';
  }
  document.getElementById('listStats').innerHTML = statsHtml;

  var content = document.getElementById('listContent');
  if (sorted.length === 0) {
    var emptyMsg = isLoadingMore ? '正在加载数据，请稍候...' : '暂无物品数据';
    content.innerHTML = '<div class="empty-container"><div class="empty-icon">' + (isLoadingMore ? '' : '-') + '</div><div class="empty-text">' + emptyMsg + '</div></div>';
    document.getElementById('pagination').innerHTML = '';
    return;
  }
  content.innerHTML = pageItems.map(function(item) {
    var bl = item.bl || 0;
    var d30bl = item.day_30_bl || 0;
    var d30p = item.day_30_price || 0;
    var catName = CATEGORY_MAP[item._category] || escapeHtml(item.secondClassCN || '');
    var gradeBg = (item._category !== 'gun' && item.grade) ? 'background:' + getGradeColor(item.grade) + '15;border-color:' + getGradeColor(item.grade) + '30;' : '';
    var gradeDiamond = (item._category !== 'gun' && item.grade) ? '<div class="grade-diamond" style="background:' + getGradeColor(item.grade) + '"></div>' : '';
    var picHtml = item.pic
      ? '<img src="' + sanitizeUrl(smallPicUrl(item.pic, 72)) + '" alt="" loading="lazy" decoding="async" onerror="this.parentElement.innerHTML=\'<span class=pic-placeholder>-</span>\'">'
      : '<span class="pic-placeholder">-</span>';
    var catGradeTag = (item._category !== 'gun' && item.grade) ? '<span class="item-grade" style="color:' + getGradeColor(item.grade) + '">' + getGradeText(item.grade) + '</span>' : '';
    var attrs = [];
    if (showCategory && catName) attrs.push(catName);
    if (item.length && item.width) attrs.push(item.length + '\xD7' + item.width);
    if (item._category !== 'gun' && item.grade) attrs.push(getGradeText(item.grade));
    var attrHtml = attrs.length ? '<div class="item-attrs"><span class="item-attrs-text">' + attrs.join(' · ') + '</span></div>' : '';
    var trendHtml = d30p ? '\n            <div class="item-trend-mini">\n              <span class="trend-mini-label">30天前:</span>\n              <span class="trend-mini-price">\xA5' + formatPrice(d30p) + '</span>\n              <span class="trend-mini-change ' + getChangeClass(d30bl) + '">' + formatChange(d30bl) + '</span>\n            </div>' : '';
    var pts = getMergedPriceData(item);
    var sparkHtml = pts.length >= 2 ? '<div class="item-sparkline">' + generateSparklineSVG(pts) + '</div>' : '';
    var favIndicator = isFavorited(item.id) ? '<span class="item-fav-indicator"></span>' : '';

    return '<div class="item-card fade-in" style="position:relative;' + gradeBg + '" onclick="openDetail(' + Number(item.id) + ')">\n          ' + gradeDiamond + '\n          <div class="item-pic">\n            ' + picHtml + '\n          </div>\n          <div class="item-info">\n            <div class="item-name-row">\n              <span class="item-name">' + escapeHtml(item.name) + '</span>\n              ' + catGradeTag + '\n            </div>\n            <div class="item-price-row">\n              <span class="item-price">\xA5' + formatPrice(item.price) + '</span>\n              <span class="item-change ' + getChangeClass(bl) + '">' + formatChange(bl) + '</span>\n            </div>\n            ' + attrHtml + '\n            ' + trendHtml + '\n          </div>\n          ' + sparkHtml + '\n          <span class="item-arrow">›</span>\n          ' + favIndicator + '\n        </div>';
  }).join('');
  renderPagination(totalPages);
}

function renderPagination(totalPages) {
  var pagination = document.getElementById('pagination');
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

// ===== render/detail.js =====
// ===== render/detail.js — 详情页渲染 =====
// 功能清单: 物品详情全页渲染(renderDetail)含价格卡片/30天曲线/属性网格/来源说明
// 轻量价格更新(updateDetailPrices)重建价格+图表不闪烁 | 收藏按钮状态同步
// 依赖: config.js store/cache.js store/favorites.js utils.js maps.js render/charts.js
// 被依赖: app/router.js

function renderDetail(item) {
  var bl = item.bl || 0;
  var d3bl = item.day_3_bl || 0;
  var d7bl = item.day_7_bl || 0;
  var d30bl = item.day_30_bl || 0;
  var d3p = item.day_3_price || 0;
  var d7p = item.day_7_price || 0;
  var d30p = item.day_30_price || 0;
  var price = item.price || 0;
  var pricePoints = getMergedPriceData(item);

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
    // ★ 这些字段直接来自上游 API。预取路径（index.html）不经过 js/api.js 的 sanitizeItemArray，
    //   必须转义后再拼进 innerHTML，否则异常字符串会破坏 DOM 结构。
    if (item.length && item.width) propItems += '<div class="info-item"><span class="info-label">占格</span><span class="info-value">' + escapeHtml(item.length) + '\xD7' + escapeHtml(item.width) + '</span></div>';
    if (item.weight || item.Weight) propItems += '<div class="info-item"><span class="info-label">重量</span><span class="info-value">' + escapeHtml(item.weight || item.Weight) + ' kg</span></div>';
    if (item.grade) propItems += '<div class="info-item"><span class="info-label">等级</span><span class="info-value" style="color:' + getGradeColor(item.grade) + '">' + getGradeText(item.grade) + '</span></div>';
    if (item.objectID) propItems += '<div class="info-item"><span class="info-label">ID</span><span class="info-value" style="font-size:13px">' + escapeHtml(item.objectID) + '</span></div>';
    propsHtml = '\n      <div class="section">\n        <div class="section-title">物品属性</div>\n        <div class="info-grid">' + propItems + '</div>\n      </div>';
  }

  var detailContent = document.getElementById('detailContent');
  detailContent.innerHTML = '\n      <div class="detail-header">\n        <div class="detail-pic">\n          ' + picHtml + '\n        </div>\n        <div class="detail-basic">\n          <div class="detail-name">' + escapeHtml(item.name) + '</div>\n          <div class="detail-meta">\n            ' + metaHtml + '\n          </div>\n          ' + descHtml + '\n        </div>\n      </div>\n\n      <div class="price-card">\n        <div class="price-card-header">\n          <span class="price-card-title">当前价格</span>\n          <span class="price-card-time">更新于 ' + formatTime(item.is_get_time) + '</span>\n        </div>\n        <div class="price-main">\n          <span class="price-currency">\xA5</span>\n          <span class="price-value">' + formatPrice(price) + '</span>\n        </div>\n        <div class="price-sub">\n          <div class="sub-item">\n            <span class="sub-label">今日开盘</span>\n            <span class="sub-value">\xA5' + formatPrice(item.price_start || item.priceStart || 0) + '</span>\n          </div>\n          <div class="sub-item">\n            <span class="sub-label">今日涨跌</span>\n            <span class="sub-value ' + getChangeClass(bl) + '">' + formatChange(bl) + '</span>\n          </div>\n        </div>\n      </div>\n\n      <div class="section">\n        <div class="section-title">近30天价格趋势</div>\n        <div class="price-curve-box">\n          ' + generatePriceCurveSVG(pricePoints) + '\n          <div class="curve-legend">\n            <div class="curve-legend-item"><span class="curve-legend-dot" style="background:#888"></span>30天前 \xA5' + formatPrice(d30p) + ' <span class="' + getChangeClass(d30bl) + '" style="font-size:10px">' + formatChange(d30bl) + '</span></div>\n            <div class="curve-legend-item"><span class="curve-legend-dot" style="background:#667eea"></span>7天前 \xA5' + formatPrice(d7p) + ' <span class="' + getChangeClass(d7bl) + '" style="font-size:10px">' + formatChange(d7bl) + '</span></div>\n            <div class="curve-legend-item"><span class="curve-legend-dot" style="background:#4caf50"></span>3天前 \xA5' + formatPrice(d3p) + ' <span class="' + getChangeClass(d3bl) + '" style="font-size:10px">' + formatChange(d3bl) + '</span></div>\n            <div class="curve-legend-item"><span class="curve-legend-dot" style="background:#ffd700"></span>当前 \xA5' + formatPrice(price) + '</div>\n          </div>\n        </div>\n      </div>\n\n      ' + propsHtml + '\n\n      <div class="source-note">\n        <span>数据来源：三角洲数据帝 orzice.com 开放平台</span>\n        <span>禁止编造或篡改任何价格信息</span>\n      </div>\n    ';
  updateFavoriteButton(item.id);

  getOrFetchCloudSnapshots(item.id).then(function(cloudSnaps) {
    if (!cloudSnaps || cloudSnaps.length === 0) return;
    var cloudPricePoints = getMergedPriceData(item, cloudSnaps);
    var svgContainer = document.querySelector('.price-curve-box');
    if (!svgContainer || cloudPricePoints.length < 2) return;
    if (pageStack[pageStack.length - 1] !== 'detail') return;
    var newSvg = generatePriceCurveSVG(cloudPricePoints);
    var oldSvg = svgContainer.querySelector('svg');
    if (oldSvg) {
      oldSvg.insertAdjacentHTML('afterend', newSvg);
      oldSvg.remove();
    } else {
      svgContainer.insertAdjacentHTML('afterbegin', newSvg);
    }
  }).catch(function(e) {
    console.log('[详情] 云端历史获取失败，使用本地数据');
  });
}

function updateDetailPrices(item) {
  var container = document.getElementById('detailContent');
  if (!container) return;

  var price = item.price || 0;
  var bl = item.bl || 0;

  var priceVal = container.querySelector('.price-value');
  if (priceVal) priceVal.textContent = formatPrice(price);

  var priceTime = container.querySelector('.price-card-time');
  if (priceTime) priceTime.textContent = '更新于 ' + formatTime(item.is_get_time);

  var subValues = container.querySelectorAll('.sub-value');
  if (subValues.length >= 2) {
    subValues[0].textContent = '\xA5' + formatPrice(item.price_start || item.priceStart || 0);
    subValues[1].textContent = formatChange(bl);
    subValues[1].className = 'sub-value ' + getChangeClass(bl);
  }

  var pricePoints = getMergedPriceData(item);
  var svgContainer = container.querySelector('.price-curve-box');
  if (svgContainer && pricePoints.length >= 2) {
    var newSvg = generatePriceCurveSVG(pricePoints);
    var oldSvg = svgContainer.querySelector('svg');
    if (oldSvg) {
      oldSvg.insertAdjacentHTML('afterend', newSvg);
      oldSvg.remove();
    }
  }

  var legendItems = container.querySelectorAll('.curve-legend-item');
  if (legendItems.length >= 4) {
    var d30bl = item.day_30_bl || 0;
    var d7bl = item.day_7_bl || 0;
    var d3bl = item.day_3_bl || 0;
    var changeSpans = container.querySelectorAll('.curve-legend-item [class*="change"]');
    if (changeSpans.length >= 3) {
      if (changeSpans[0]) { changeSpans[0].textContent = formatChange(d30bl); changeSpans[0].className = getChangeClass(d30bl); }
      if (changeSpans[1]) { changeSpans[1].textContent = formatChange(d7bl); changeSpans[1].className = getChangeClass(d7bl); }
      if (changeSpans[2]) { changeSpans[2].textContent = formatChange(d3bl); changeSpans[2].className = getChangeClass(d3bl); }
    }
  }

  getOrFetchCloudSnapshots(item.id).then(function(cloudSnaps) {
    if (!cloudSnaps || cloudSnaps.length === 0) return;
    if (pageStack[pageStack.length - 1] !== 'detail') return;
    var cloudPoints = getMergedPriceData(item, cloudSnaps);
    var svgBox = container.querySelector('.price-curve-box');
    if (!svgBox || cloudPoints.length < 2) return;
    var svg = svgBox.querySelector('svg');
    var newSvgHtml = generatePriceCurveSVG(cloudPoints);
    if (svg) {
      svg.insertAdjacentHTML('afterend', newSvgHtml);
      svg.remove();
    }
  }).catch(function() {});
}

function updateFavoriteButton(itemId) {
  var btn = document.getElementById('detailFavBtn');
  if (!btn) return;
  if (isFavorited(itemId)) {
    btn.classList.add('favorited');
  } else {
    btn.classList.remove('favorited');
  }
}

// ===== render/search.js =====
// ===== render/search.js — 搜索页渲染 =====
// 功能清单: 搜索历史标签(renderSearchHistory) | 最近浏览列表(renderRecentViews)
// 收藏列表(renderFavorites) | 搜索结果(renderSearchResults)
// 依赖: config.js store/search.js store/favorites.js utils.js
// 被依赖: app/router.js

function renderSearchHistory() {
  var history = getSearchHistory();
  var section = document.getElementById('searchHistory');
  var tags = document.getElementById('historyTags');
  if (history.length === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';
  tags.innerHTML = history.map(function(kw) {
    return '<span class="history-tag" onclick="searchFromHistory(\'' + escapeJSStr(kw) + '\')">' + escapeHtml(kw) + '</span>';
  }).join('');
}

function renderRecentViews() {
  var views = getRecentViews();
  var section = document.getElementById('recentViewSection');
  var container = document.getElementById('recentViewItems');
  if (views.length === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';
  container.innerHTML = views.map(function(item) {
    var bl = item.bl || 0;
    var picHtml = item.pic
      ? '<img src="' + sanitizeUrl(smallPicUrl(item.pic, 72)) + '" alt="" loading="lazy" decoding="async" onerror="this.parentElement.innerHTML=\'<span class=pic-placeholder style=font-size:20px>-</span>\'">'
      : '<span class="pic-placeholder" style="font-size:20px">-</span>';
    return '\n        <div class="result-item fade-in" onclick="openDetailFromRecent(' + Number(item.id) + ')">\n          <div class="item-pic" style="width:40px;height:40px;margin-right:10px">\n            ' + picHtml + '\n          </div>\n          <div class="item-info">\n            <div class="item-name-row">\n              <span class="item-name">' + escapeHtml(item.name) + '</span>\n              <span style="font-size:10px;color:#667eea;margin-left:6px">' + escapeHtml(CATEGORY_MAP[item._category] || item.secondClassCN || '') + '</span>\n            </div>\n            <div class="item-price-row">\n              <span class="item-price">\xA5' + formatPrice(item.price) + '</span>\n              <span class="item-change ' + getChangeClass(bl) + '">' + formatChange(bl) + '</span>\n            </div>\n          </div>\n          <span class="item-arrow">›</span>\n        </div>';
  }).join('');
}

function renderFavorites() {
  var favs = getFavorites();
  var section = document.getElementById('favoritesSection');
  var container = document.getElementById('favoritesItems');
  if (favs.length === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';
  container.innerHTML = favs.map(function(item) {
    var bl = item.bl || 0;
    var picHtml = item.pic
      ? '<img src="' + sanitizeUrl(smallPicUrl(item.pic, 72)) + '" alt="" loading="lazy" decoding="async" onerror="this.parentElement.innerHTML=\'<span class=pic-placeholder style=font-size:20px>-</span>\'">'
      : '<span class="pic-placeholder" style="font-size:20px">-</span>';
    return '\n        <div class="result-item fade-in" onclick="openDetailFromFavorite(' + Number(item.id) + ')">\n          <div class="item-pic" style="width:40px;height:40px;margin-right:10px">\n            ' + picHtml + '\n          </div>\n          <div class="item-info">\n            <div class="item-name-row">\n              <span class="item-name">' + escapeHtml(item.name) + '</span>\n              <span style="font-size:10px;color:#667eea;margin-left:6px">' + escapeHtml(CATEGORY_MAP[item._category] || item.secondClassCN || '') + '</span>\n            </div>\n            <div class="item-price-row">\n              <span class="item-price">\xA5' + formatPrice(item.price) + '</span>\n              <span class="item-change ' + getChangeClass(bl) + '">' + formatChange(bl) + '</span>\n            </div>\n          </div>\n          <span class="item-arrow">›</span>\n        </div>';
  }).join('');
}

function renderSearchResults(results, keyword) {
  var container = document.getElementById('searchResults');
  if (results.length === 0) {
    container.innerHTML = '<div class="empty-container"><div class="empty-icon">-</div><div class="empty-text">未找到 "' + escapeHtml(keyword) + '" 相关物品</div></div>';
    return;
  }
  container.innerHTML = '<div style="padding:10px 16px;font-size:12px;color:#888">找到 ' + results.length + ' 个结果</div>' +
    results.map(function(item) {
      var bl = item.bl || 0;
      var picHtml = item.pic
        ? '<img src="' + sanitizeUrl(smallPicUrl(item.pic, 72)) + '" alt="" loading="lazy" decoding="async" onerror="this.parentElement.innerHTML=\'<span class=pic-placeholder style=font-size:20px>-</span>\'">'
        : '<span class="pic-placeholder" style="font-size:20px">-</span>';
      return '\n          <div class="result-item fade-in" onclick="openDetailFromSearch(' + Number(item.id) + ')">\n            <div class="item-pic" style="width:40px;height:40px;margin-right:10px">\n              ' + picHtml + '\n            </div>\n            <div class="item-info">\n              <div class="item-name-row">\n                <span class="item-name">' + escapeHtml(item.name) + '</span>\n                <span class="item-grade" style="background:rgba(102,126,234,0.15);color:#667eea;font-size:10px;padding:2px 8px;border-radius:8px;margin-left:8px">' + escapeHtml(CATEGORY_MAP[item._category] || item.secondClassCN || '') + '</span>\n              </div>\n              <div class="item-price-row">\n                <span class="item-price">\xA5' + formatPrice(item.price) + '</span>\n                <span class="item-change ' + getChangeClass(bl) + '">' + formatChange(bl) + '</span>\n              </div>\n            </div>\n            <span class="item-arrow">›</span>\n          </div>';
    }).join('');
}

// ===== render/favtab.js =====
// ===== render/favtab.js — 收藏标签页 + 价格变动提醒 =====
// 功能清单: 收藏标签页渲染(renderFavTab)含合并最新价格 | 收藏价格变动检测(checkFavoritePriceChanges)
// 依赖: config.js store/cache.js store/favorites.js utils.js
// 被依赖: render/home.js app/router.js api.js

function renderFavTab() {
  var content = document.getElementById('favtabContent');
  var favs = getFavorites();
  if (favs.length === 0) {
    content.innerHTML = '<div class="empty-container"><div class="empty-icon">-</div><div class="empty-text">暂无收藏物品，在物品详情页收藏</div></div>';
    return;
  }
  var cached = getCache();
  var allItems = cached && cached._allItems ? cached._allItems : [];
  var items = favs.map(function(fav) {
    var full = allItems.find(function(i) { return i.id === fav.id; });
    return full ? Object.assign({}, fav, full) : fav;
  });
  content.innerHTML = '\n      <div class="list-stats">\n        <span>共 ' + items.length + ' 件收藏</span>\n        <span class="history-clear" onclick="clearFavorites(); renderFavTab();" style="color:#f44336;cursor:pointer">清空收藏</span>\n      </div>\n      ' + items.map(function(item) {
        var bl = item.bl || 0;
        var picHtml = item.pic
          ? '<img src="' + sanitizeUrl(smallPicUrl(item.pic, 72)) + '" alt="" loading="lazy" decoding="async" onerror="this.parentElement.innerHTML=\'<span class=pic-placeholder>-</span>\'">'
          : '<span class="pic-placeholder">-</span>';
        return '\n        <div class="item-card fade-in" onclick="openPriceMover(' + Number(item.id) + ')" style="position:relative">\n          <div class="item-pic">\n            ' + picHtml + '\n          </div>\n          <div class="item-info">\n            <div class="item-name-row">\n              <span class="item-name">' + escapeHtml(item.name) + '</span>\n              <span style="font-size:10px;color:#667eea;margin-left:6px">' + escapeHtml(CATEGORY_MAP[item._category] || item.secondClassCN || '') + '</span>\n            </div>\n            <div class="item-price-row">\n              <span class="item-price">\xA5' + formatPrice(item.price) + '</span>\n              <span class="item-change ' + getChangeClass(bl) + '">' + formatChange(bl) + '</span>\n            </div>\n          </div>\n          <span class="item-arrow">›</span>\n        </div>';
      }).join('');
}

// ===== 收藏价格变动检测（从 main.js 移入） =====
function checkFavoritePriceChanges() {
  var alertEl = document.getElementById('priceAlert');
  var sectionEl = document.getElementById('priceChangedSection');
  var itemsEl = document.getElementById('priceChangedItems');
  if (!alertEl || !sectionEl || !itemsEl) return;
  var favs = getFavorites();
  if (favs.length === 0) { alertEl.classList.remove('show'); alertEl.innerHTML = ''; sectionEl.classList.remove('show'); itemsEl.innerHTML = ''; return; }
  var cached = getCache();
  var allItems = cached && cached._allItems;
  if (!allItems || allItems.length === 0) { alertEl.classList.remove('show'); alertEl.innerHTML = ''; sectionEl.classList.remove('show'); itemsEl.innerHTML = ''; return; }

  var changes = [];
  var anyUpdated = false;
  favs.forEach(function(fav) {
    var current = allItems.find(function(item) { return item.id === fav.id; });
    if (!current || !fav.price || fav.price <= 0) return;
    if (!current.price || current.price <= 0) return;
    var changePct = (current.price - fav.price) / fav.price * 100;
    if (Math.abs(changePct) >= 25) {
      changes.push({
        name: fav.name || '未知',
        pct: changePct,
        dir: changePct > 0 ? 'up' : 'down',
        id: fav.id,
        pic: current.pic || '',
        price: current.price
      });
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

  var text = changes.map(function(c) {
    return '<span class="price-alert-item ' + c.dir + '">' + escapeHtml(c.name) + ' ' + (c.pct > 0 ? '+' : '') + c.pct.toFixed(1) + '%</span>';
  }).join('、');
  alertEl.innerHTML = '收藏提醒: ' + text;
  alertEl.classList.add('show');

  var cardHtml = changes.map(function(c) {
    var changeText = (c.pct > 0 ? '+' : '') + c.pct.toFixed(1) + '%';
    var picHtml = c.pic
      ? '<img src="' + sanitizeUrl(smallPicUrl(c.pic, 72)) + '" alt="" loading="lazy" onerror="this.parentElement.innerHTML=\'<span style=font-size:16px>-</span>\'">'
      : '<span style="font-size:16px">-</span>';
    return '<div class="price-changed-item" onclick="openDetail(' + Number(c.id) + ')">\n        <div class="item-pic">' + picHtml + '</div>\n        <div class="item-info">\n          <div class="item-name">' + escapeHtml(c.name) + '</div>\n          <div class="item-price-row">\n            <span class="item-cur-price">\xA5' + formatPrice(c.price) + '</span>\n            <span class="item-change-pct ' + c.dir + '">' + changeText + '</span>\n          </div>\n        </div>\n      </div>';
  }).join('');
  itemsEl.innerHTML = cardHtml;
  sectionEl.classList.add('show');
}

// ===== app/router.js =====
// ===== app/router.js — 路由 + 导航 + 详情 + 搜索 + 刷新 =====
// 功能清单: 页面路由(showPage/pushPage/goBack) | 底部Tab切换(switchTab) | 分类导航(openCategory/openAllItems)
// 物品查找(findItemAnywhere) | 详情页(openDetail/openDetailFromSource等) | 收藏按钮(toggleCurrentFavorite)
// 搜索(showSearch/hideSearch/doSearch/searchFromHistory) | 刷新(refreshCurrentList/refreshCurrentItem/refreshAllData/refreshFavTab)
// 依赖: 所有 config/store/render/api/utils 模块
// 被依赖: app/init.js

// ===== 状态变量 =====
var pages = {};
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
  var page = pages[name];
  if (page) {
    page.classList.add('active');
    if (name !== 'search') page.classList.add('fade-in');
  }
  window.scrollTo(0, 0);
}

function goBack() {
  if (pageStack.length > 1) {
    pageStack.pop();
    var prev = pageStack[pageStack.length - 1];
    showPage(prev);
    if (prev === 'home') {
      var saved = restoreBrowseState();
      if (saved && typeof applyHomeBrowseState === 'function') {
        applyHomeBrowseState(saved);
      }
      checkFavoritePriceChanges();
      renderHomeTopMover();
      renderHomeMovers(false);
      if (saved && saved.homeScrollTop) {
        setTimeout(function() { window.scrollTo(0, saved.homeScrollTop); }, 100);
      }
    } else if (prev === 'list') {
      var cached = getCache();
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
  saveBrowseState();
  pageStack.push(name);
  showPage(name);
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
    var field = btn.dataset.sort;
    btn.classList.toggle('active', field === sortBy);
  });
}

function resetSort() {
  sortBy = 'price';
  sortDir = 'desc';
  currentPage = 1;
  updateSortBar();
}

// ===== Tab 切换 =====
var _favTabDataReady = false;
var _favTabPreWarmed = false;

function preWarmFavTab() {
  if (_favTabPreWarmed) return;
  _favTabPreWarmed = true;
  var cached = getCache();
  if (cached && cached._allItems && cached._allItems.length > 0) {
    _favTabDataReady = true;
  }
}

function switchTab(tabName) {
  var leavingPage = pageStack[pageStack.length - 1];
  if (leavingPage === 'home' || leavingPage === 'list') {
    saveBrowseState();
  }

  document.querySelectorAll('.bottom-nav .tab').forEach(function(t) { t.classList.remove('active'); });
  var tab = document.querySelector('.bottom-nav .tab[data-tab="' + tabName + '"]');
  if (tab) tab.classList.add('active');
  Object.values(pages).forEach(function(p) { p.classList.remove('active'); });
  var target = document.getElementById('page-' + tabName);
  if (target) {
    target.classList.add('active');
    pageStack = [tabName];
    if (tabName === 'home') {
      var saved = restoreBrowseState();
      if (saved && typeof applyHomeBrowseState === 'function') {
        applyHomeBrowseState(saved);
      }
      checkFavoritePriceChanges();
      renderHomeTopMover();
      renderHomeMovers(false);
      if (saved && saved.homeScrollTop) {
        setTimeout(function() { window.scrollTo(0, saved.homeScrollTop); }, 100);
      }
      setTimeout(function() { preWarmFavTab(); }, 300);
      return;
    }
    if (tabName === 'favtab') {
      if (!_favTabDataReady) {
        var cached = getCache();
        if (cached && cached._allItems && cached._allItems.length > 0) {
          _favTabDataReady = true;
        }
      }
      renderFavTab();
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

    var prefetched = window.__prefetch || {};
    var pCat = prefetched[key];
    if (pCat && pCat._resolvedData && pCat._resolvedData.length > 0) {
      items = pCat._resolvedData.slice();
      fromCache = true;
      if (!pCat._complete && typeof pCat._onComplete !== 'function') {
        pCat._onComplete = function(fullItems) {
          if (currentCategory && currentCategory.key !== key) return;
          if (fullItems && fullItems.length > listItems.length) {
            listItems = fullItems;
            renderList(fullItems, false);
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
    // ★ v3 修复: 移除"缓存命中后仍自动全量翻页刷新"的请求。
    //   预取 v3 已用 item_price_all + metadata 拿到全量最新数据,
    //   此处再翻页只会重复消耗上游(acc 类一次约 56 次), 数据会在下次页面加载时自动更新。
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

  if (!items || items.length === 0) {
    try {
      var cached = getCache();
      if (cached && cached._allItems && cached._allItems.length > 0) {
        items = cached._allItems;
      }
    } catch(e) { console.error('openAllItems getCache 失败:', e); }
  }

  if (!items || items.length === 0) {
    try { items = await loadAllItems(); } catch(e) { console.error('loadAllItems error:', e); }
  }

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
  var locals = (getFavorites()).concat(getRecentViews());
  for (var li = 0; li < locals.length; li++) {
    if (locals[li].id === itemId) return locals[li];
  }
  return null;
}

// ===== 详情页 =====
async function openDetail(itemId) {
  var item = listItems.find(function(i) { return i.id === itemId; });
  if (!item) {
    var cached = getCache();
    var found = cached && cached._allItems ? cached._allItems.find(function(i) { return i.id === itemId; }) : null;
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
    var res = await apiRequest('item_price_all');
    if (pageStack[pageStack.length - 1] !== 'detail') return;
    var cleanData = sanitizeItemArray(res.data, 'price');
    var latest = cleanData.find(function(i) { return i.id === currentItem.id; });
    if (latest) {
      currentItem = Object.assign({}, currentItem, latest);
      savePriceSnapshot(currentItem.id, currentItem);
      var cached = getCache();
      if (cached && cached._allItems) {
        var cacheIdx = cached._allItems.findIndex(function(i) { return i.id === currentItem.id; });
        if (cacheIdx >= 0) {
          cached._allItems[cacheIdx] = currentItem;
          setCache(cached);
        }
      }
      updateDetailPrices(currentItem);
    }
  } catch (err) {}
}

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

// ===== 收藏按钮 =====
function toggleCurrentFavorite() {
  if (!currentItem || !currentItem.id) return;
  var isNowFav = toggleFavorite(currentItem);
  var btn = document.getElementById('detailFavBtn');
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
  var resultsEl = document.getElementById('searchResults');
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
  var input = document.getElementById('searchInput');
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
    try {
      var prefetched = window.__prefetch || {};
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
        var quickResults = await Promise.all(CATEGORIES.map(function(cat) {
          var p = prefetched[cat.key];
          if (!p || !p._quick) return Promise.resolve([]);
          return p._quick.then(function(r) {
            if (r && r.data) return sanitizeItemArray(r.data, 'list').map(function(item) { return Object.assign({}, item, { _category: cat.key }); });
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
  var content = document.getElementById('listContent');
  content.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><div class="loading-text">刷新中...</div></div>';
  document.getElementById('listStats').innerHTML = '';

  try {
    var refreshFailed = false;
    if (currentCategory.key === 'fav') {
      var favs = getFavorites();
      var cached = getCache();
      var allItems = cached && cached._allItems ? cached._allItems : [];
      listItems = favs.map(function(fav) {
        var full = allItems.find(function(i) { return i.id === fav.id; });
        return full ? Object.assign({}, fav, full) : fav;
      });
      renderList(listItems, false);
    } else if (isAllMode) {
      var backupCache = getCache();
      clearCache();
      try {
        var oldItems2 = (backupCache && backupCache._allItems) || [];
        var metaMap2 = {};
        oldItems2.forEach(function(item) {
          if (item.name && item.name.indexOf('#') !== 0) {
            metaMap2[canonicalId(item)] = { name: item.name, pic: item.pic, _category: item._category, grade: item.grade, ShopSellType: item.ShopSellType, desc: item.desc, secondClassCN: item.secondClassCN, length: item.length, width: item.width, weight: item.weight, objectID: item.objectID, tid: item.tid };
          }
        });
        var priceRes2 = await apiRequest('item_price_all', null, 3, true);
        var cleanPrices = sanitizeItemArray(priceRes2 && priceRes2.data, 'price');
        if (cleanPrices.length > 0) {
          var items = cleanPrices.map(function(p) {
            var meta = metaMap2[p.id] || {};
            return Object.assign({}, p, {
              name: meta.name || ('物品#' + p.id), pic: meta.pic || '',
              _category: meta._category || 'unknown', grade: meta.grade || 0,
              ShopSellType: meta.ShopSellType || '', desc: meta.desc || '',
              secondClassCN: meta.secondClassCN || '', length: meta.length || 0,
              width: meta.width || 0, weight: meta.weight || 0, objectID: meta.objectID || ''
            });
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
      var items = await fetchCategoryAll(currentCategory.key);
      listItems = items;
      var cached = getCache();
      if (cached && cached._allItems) {
        var otherItems = cached._allItems.filter(function(i) { return i._category !== currentCategory.key; });
        cached._allItems = [].concat(otherItems).concat(items);
        setCache(cached);
      }
      renderList(items, false);
    }
    if (!refreshFailed) {
      markRefreshed();
      toast('刷新完成');
    }
    if (document.getElementById('page-home').classList.contains('active')) {
      checkFavoritePriceChanges();
      renderHomeTopMover();
      renderHomeMovers(false);
    }
  } catch (err) {
    console.error('刷新失败:', err);
    content.innerHTML = '<div class="error-container"><div class="error-text">刷新失败，请检查网络后重试</div><button class="retry-btn" onclick="refreshCurrentList()">重新刷新</button></div>';
  }
}

async function refreshCurrentItem() {
  if (!checkRefreshCooldown()) return;
  if (!currentItem) return;
  var content = document.getElementById('detailContent');
  content.innerHTML = '<div class="loading-container"><div class="loading-spinner"></div><div class="loading-text">正在向API请求最新数据...</div></div>';

  try {
    var res = await apiRequest('item_price_all', null, 3, true);
    var cleanData = sanitizeItemArray(res.data, 'price');
    var latest = cleanData.find(function(i) { return i.id === currentItem.id; });
    if (latest) {
      currentItem = Object.assign({}, currentItem, latest);
      savePriceSnapshot(currentItem.id, currentItem);
      var idx = listItems.findIndex(function(i) { return i.id === currentItem.id; });
      if (idx >= 0) listItems[idx] = currentItem;
      var cached = getCache();
      if (cached && cached._allItems) {
        var cacheIdx = cached._allItems.findIndex(function(i) { return i.id === currentItem.id; });
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

  var oldCache = getCache();
  var oldItems = (oldCache && oldCache._allItems) || [];
  var metaMap = {};
  oldItems.forEach(function(item) {
    if (item.name && item.name.indexOf('#') !== 0) {
      metaMap[canonicalId(item)] = { name: item.name, pic: item.pic, _category: item._category, grade: item.grade, ShopSellType: item.ShopSellType, desc: item.desc, secondClassCN: item.secondClassCN, length: item.length, width: item.width, weight: item.weight, objectID: item.objectID, tid: item.tid };
    }
  });
  var prefetched = window.__prefetch || {};
  if (Object.keys(metaMap).length < 100 && prefetched._resolvedData) {
    CATEGORIES.forEach(function(cat) {
      var p = prefetched[cat.key];
      if (p && p._resolvedData) {
        p._resolvedData.forEach(function(item) {
          var cid = canonicalId(item);
          if (item.name && item.name.indexOf('#') !== 0 && !metaMap[cid]) {
            metaMap[cid] = { name: item.name, pic: item.pic, _category: item._category, grade: item.grade, ShopSellType: item.ShopSellType, desc: item.desc, secondClassCN: item.secondClassCN, length: item.length, width: item.width, weight: item.weight, objectID: item.objectID, tid: item.tid };
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
    var priceRes = await apiRequest('item_price_all', null, 3, true);
    var cleanPrices = sanitizeItemArray(priceRes && priceRes.data, 'price');
    if (cleanPrices.length === 0) {
      throw new Error('API 返回空数据');
    }

    var merged = cleanPrices.map(function(p) {
      var meta = metaMap[p.id] || {};
      return Object.assign({}, p, {
        name: meta.name || ('物品#' + p.id),
        pic: meta.pic || '',
        _category: meta._category || 'unknown',
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

    setCache({ _allItems: merged });
    if (typeof buildSearchIndex === 'function') buildSearchIndex(merged);
    if (typeof updateCategoryIcons === 'function') updateCategoryIcons(merged);
    markRefreshed();

    if (prevPage === 'home') {
      renderHomeMovers(false);
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
    var currentCache = getCache();
    if (oldCache && oldCache._allItems && oldCache._allItems.length > 0 &&
        (!currentCache || !currentCache._allItems || currentCache._allItems.length === 0)) {
      setCache(oldCache);
      if (prevPage === 'home') renderHomeMovers();
    }
  }
}

function refreshFavTab() {
  if (!checkRefreshCooldown()) return;
  toast('正在刷新收藏价格...');
  apiRequest('item_price_all', null, 3, true).then(function(res) {
    if (res && res.data && res.data.length > 0) {
      var cached = getCache();
      if (cached && cached._allItems) {
        var priceMap = {};
        var cleanPrices = sanitizeItemArray(res.data, 'price');
        cleanPrices.forEach(function(p) { priceMap[p.id] = p; });
        cached._allItems = cached._allItems.map(function(item) {
          var latest = priceMap[canonicalId(item)];
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

// ===== app/init.js =====
// ===== app/init.js — 初始化 + 定时器 + 事件绑定 + 滚动条 =====
// 功能清单: 自动刷新定时器(startHomeAutoRefresh) | 每日价格记录(globalDailyRecord)
// DOMContentLoaded事件绑定(搜索输入/键盘) | 页面可见性处理(visibilitychange)
// 启动初始化(图标缓存提取/renderHome/元数据降级检测) | 预加载流程(preload含loading动画)
// 自定义滚动条(桌面端)
// 依赖: 所有 config/store/render/api/app 模块
// 被依赖: 无（入口文件，最后加载）

// ===== 自动刷新定时器 =====
var homeRefreshTimer = null;

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
  // 自动刷新降频: 5 分钟 → 1 小时（减少后台活动与本地写入）
  homeRefreshTimer = setInterval(doAutoRefresh, 3600000);
}

function stopHomeAutoRefresh() {
  if (homeRefreshTimer) {
    clearInterval(homeRefreshTimer);
    homeRefreshTimer = null;
  }
}

// ===== 每日价格记录定时器 =====
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
  // 价格记录降频: 30 分钟 → 1 小时
  globalDailyRecordTimer = setInterval(doRecordDaily, 3600000);
}

function stopGlobalDailyRecord() {
  if (globalDailyRecordTimer) {
    clearInterval(globalDailyRecordTimer);
    globalDailyRecordTimer = null;
  }
}

// ===== DOMContentLoaded 事件绑定 =====
document.addEventListener('DOMContentLoaded', function() {
  if (typeof moveDropdownsToBody === 'function') moveDropdownsToBody();

  document.getElementById('searchInput').addEventListener('input', function(e) {
    var kw = e.target.value;
    var clearBtn = document.getElementById('searchClear');
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

// ===== 页面可见性处理 =====
document.addEventListener('visibilitychange', function() {
  if (document.hidden) {
    stopHomeAutoRefresh();
    stopGlobalDailyRecord();
  } else {
    startHomeAutoRefresh();
    startGlobalDailyRecord();
    var cached = getCache();
    if (!cached || !cached._allItems || cached._allItems.length < 50) {
      loadAllItems(false).then(function() {
        if (pageStack[pageStack.length - 1] === 'home') {
          checkFavoritePriceChanges();
          renderHomeTopMover();
          renderHomeMovers(false);
        }
        preWarmFavTab();
      }).catch(function(){});
    } else {
      loadAllItems(true).catch(function(){});
    }
  }
});

// ===== 启动初始化 =====
if (!getCatIconsCache()) {
  try {
    var raw = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (raw && raw._allItems && raw._allItems.length > 0) {
      var picks = {};
      raw._allItems.forEach(function(item) {
        var cat = item._category;
        if (cat && !picks[cat] && item.pic) picks[cat] = item.pic;
      });
      var logisticsItem = raw._allItems.find(function(i) { return i.name === '物流信息单' && i.pic; });
      if (logisticsItem) picks['all'] = logisticsItem.pic;
      if (Object.keys(picks).length > 0) setCatIconsCache(picks);
    }
  } catch(e) { console.warn('图标缓存提取失败:', e); }
}
renderHome();

// 检测元数据降级
(function checkMetadataDegraded() {
  var prefetched = window.__prefetch || {};
  if (typeof prefetched.isMetadataDegraded === 'function' && prefetched.isMetadataDegraded()) {
    var alertEl = document.getElementById('priceAlert');
    if (alertEl) {
      alertEl.innerHTML = '⚠️ 物品元数据加载失败，部分物品名称可能显示为"物品#ID"。请刷新重试。';
      alertEl.classList.add('show');
    }
  }
})();

// ===== 预加载 =====
(function preload() {
  var cached = getCache();
  var loadingScreen = document.getElementById('loadingScreen');
  var loadingLogo = document.getElementById('loadingLogo');
  var loadingGlow = document.getElementById('loadingGlow');
  var loadingProgressBar = document.getElementById('loadingProgressBar');
  var loadingStatus = document.getElementById('loadingStatus');
  var loadStart = Date.now();
  var LOADING_TIMEOUT = 10000;
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

  function showAndContinueLoading(allItems, skipCache) {
    if (!allItems || allItems.length === 0) {
      hideLoading();
      return;
    }
    if (!skipCache) setCache({ _allItems: allItems });
    if (typeof buildSearchIndex === 'function') buildSearchIndex(allItems);
    updateCategoryIcons(allItems);
    checkFavoritePriceChanges();
    renderHomeTopMover();
    renderHomeMoversWithData(allItems);
    setProgress(0.55, '已展示 ' + allItems.length + ' 件，继续加载更多...');

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
      var displayProgress = 0.55 + realProgress * 0.43;
      if (displayProgress > 0.98) displayProgress = 0.98;
      setProgress(displayProgress, '已加载 ' + arrived + (expected > 0 ? '/' + expected : '') + ' 件...');
      if (arrived >= expected && expected > 0 && arrived > 100) {
        clearInterval(_pollTimer);
        hideLoading();
      }
      if (typeof prefetched.isPaginationDone === 'function' && prefetched.isPaginationDone() && arrived > 100) {
        clearInterval(_pollTimer);
        hideLoading();
      }
    }, 400);

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
    var homeList = document.getElementById('homeMoversList');
    if (homeList) homeList.innerHTML = '';
    var topMover = document.getElementById('topMover');
    if (topMover) topMover.style.display = 'none';

    updateCategoryIcons(cached._allItems);
    buildSearchIndex(cached._allItems);
    mergeSWPriceHistory().then(function() { recordAllItemsPrices(cached._allItems); });
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
    setTimeout(function() { loadAllItems(true).catch(function(){}); }, 800);
    registerPeriodicSync();
    startHomeAutoRefresh();
    startGlobalDailyRecord();
    return;
  }

  // ===== 无缓存：v3 双请求合并 =====
  var prefetched = window.__prefetch || {};
  setProgress(0.05, '正在连接数据源...');

  var _noCacheAllItems = [];
  var _noCacheDone = false;
  var _progressTimer = null;

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
        renderHomeMoversWithData(_noCacheAllItems);
        setProgress(1, '已加载 ' + totalArrived + ' 件');
        setTimeout(function() { hideLoading(); }, 300);
      }
    });
  }

  setProgress(0.08, '正在请求数据...');
  var _progressStage = 0;
  _progressTimer = setInterval(function() {
    _progressStage++;
    if (_loadingHidden || _noCacheDone) { clearInterval(_progressTimer); return; }
    var fakeRatio = Math.min(0.08 + _progressStage * 0.06, 0.9);
    setProgress(fakeRatio, '正在拉取实时价格...');
  }, 200);

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
      renderHomeMoversWithData(sortedAll);
      setProgress(1, '已加载 ' + sortedAll.length + ' 件');
      setTimeout(function() { hideLoading(); }, 300);
    }).catch(function() {});
  }

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
        renderHomeMoversWithData(items);
        hideLoading();
      } else {
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
})();

// ===== 自定义滚动条（桌面端） =====
(function initCustomScrollbar() {
  // PC 滚动条适配: 只要主指针是鼠标就显示（触屏笔记本接鼠标也能看到滑钮），
  // 纯触屏设备（手机/平板/触屏模式）交给系统滚动条
  if (!window.matchMedia || !window.matchMedia('(pointer: fine)').matches) {
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
  observer.observe(body, { childList: true, subtree: true });

  thumb.addEventListener('mousedown', onStart);
  thumb.addEventListener('touchstart', onStart, { passive: false });
  function onStart(e) {
    e.preventDefault();
    dragging = true;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: false });
    thumb.style.background = '#ffaa00';
    thumb.style.boxShadow = '0 0 10px rgba(255,170,0,0.7)';
    var ev = e.touches ? e.touches[0] : e;
    startY = ev.clientY;
    startTop = parseFloat(thumb.style.top) || 0;
  }
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
  }

  document.addEventListener('mouseup', onEnd);
  document.addEventListener('touchend', onEnd);
  function onEnd() {
    if (!dragging) return;
    dragging = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('touchmove', onMove);
    thumb.style.background = '#ffd700';
    thumb.style.boxShadow = '0 0 6px rgba(255,215,0,0.5)';
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

