// ===== 工具函数 =====

/**
 * 格式化价格
 */
function formatPrice(p) {
  if (p == null || p === undefined) return '--';
  return Number(p).toLocaleString('zh-CN');
}

/**
 * 格式化涨跌幅
 */
function formatChange(bl) {
  if (bl == null || bl === undefined) return '--';
  return (bl >= 0 ? '+' : '') + bl.toFixed(2) + '%';
}

/**
 * 获取涨跌样式类名
 */
function getChangeClass(bl) {
  if (bl == null || bl === undefined) return 'flat';
  return bl > 0 ? 'up' : bl < 0 ? 'down' : 'flat';
}

/**
 * 格式化时间戳
 */
function formatTime(ts) {
  if (!ts) return '--';
  const d = new Date(ts * 1000);
  const pad2 = n => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * 获取等级文本
 */
function getGradeText(g) {
  const grades = ['', '一级', '二级', '三级', '四级', '五级', '六级'];
  return grades[g] || (g ? g + '级' : '');
}

/**
 * 获取等级颜色
 */
function getGradeColor(g) {
  const colors = ['', '#8b8b8b', '#4CAF50', '#2196F3', '#9C27B0', '#FF9800', '#f44336'];
  return colors[g] || '#8b8b8b';
}

/**
 * 安全清洗图片URL
 */
function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const safeRegex = /^(https?:\/\/|\/)/i;
  if (safeRegex.test(url)) {
    return url.replace(/["'<>]/g, '');
  }
  return '';
}

/**
 * HTML转义
 */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 短格式价格
 */
function shortPrice(p) {
  if (p >= 10000) return (p / 10000).toFixed(1) + 'w';
  if (p >= 1000) return (p / 1000).toFixed(1) + 'k';
  return Math.round(p).toString();
}

/**
 * 显示Toast
 */
let toastTimer = null;
function showToast(msg, duration = 1500) {
  if (toastTimer) clearTimeout(toastTimer);
  wx.showToast({
    title: msg,
    icon: 'none',
    duration: duration
  });
}

/**
 * 防抖
 */
function debounce(fn, delay) {
  let timer = null;
  return function(...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * 节流
 */
function throttle(fn, interval) {
  let last = 0;
  return function(...args) {
    const now = Date.now();
    if (now - last >= interval) {
      last = now;
      fn.apply(this, args);
    }
  };
}

/**
 * 分类常量
 */
const CATEGORIES = [
  { key: 'gun', name: '枪械', icon: '🔫' },
  { key: 'ammo', name: '子弹', icon: '🔸' },
  { key: 'acc', name: '配件', icon: '🔧' },
  { key: 'helmet', name: '头盔', icon: '🪖' },
  { key: 'armor', name: '护甲', icon: '🛡️' },
  { key: 'chest', name: '胸挂', icon: '🎒' },
  { key: 'bag', name: '背包', icon: '💼' },
  { key: 'key', name: '钥匙卡', icon: '🔑' },
  { key: 'collection', name: '收集品', icon: '💎' },
  { key: 'consume', name: '消耗品', icon: '🧪' }
];

const CATEGORY_MAP = {};
CATEGORIES.forEach(c => { CATEGORY_MAP[c.key] = c.name; });

module.exports = {
  formatPrice,
  formatChange,
  getChangeClass,
  formatTime,
  getGradeText,
  getGradeColor,
  sanitizeUrl,
  escapeHtml,
  shortPrice,
  showToast,
  debounce,
  throttle,
  CATEGORIES,
  CATEGORY_MAP
};
