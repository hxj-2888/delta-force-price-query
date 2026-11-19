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
