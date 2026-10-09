// ===== 工具函数 =====

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
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function getGradeText(g) {
  const grades = ['', '一级', '二级', '三级', '四级', '五级', '六级'];
  return grades[g] || (g ? g + '级' : '');
}

function getGradeColor(g) {
  const colors = ['', '#8b8b8b', '#4CAF50', '#2196F3', '#9C27B0', '#FF9800', '#f44336'];
  return colors[g] || '#8b8b8b';
}

function shortPrice(p) {
  if (p >= 10000) return (p / 10000).toFixed(1) + 'w';
  if (p >= 1000) return (p / 1000).toFixed(1) + 'k';
  return Math.round(p).toString();
}

// ===== 分类常量 =====
const CATEGORIES = [
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

const CATEGORY_MAP = {};
CATEGORIES.forEach(function (c) { CATEGORY_MAP[c.key] = c.name; });

const PERIOD_LABELS = {
  bl: '今日',
  day_3_bl: '近3天',
  day_7_bl: '近7天',
  local_1d: '本地1天',
  local_3d: '本地3天',
  local_7d: '本地7天'
};

module.exports = {
  formatPrice,
  formatChange,
  getChangeClass,
  formatTime,
  getGradeText,
  getGradeColor,
  shortPrice,
  CATEGORIES,
  CATEGORY_MAP,
  PERIOD_LABELS
};