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
  const safeRegex = /^(https?:\/\/|\/)/i;
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
  return '<img src="' + sanitizeUrl(url) + '" alt="" style="width:36px;height:36px;object-fit:contain;border-radius:6px" onerror="this.parentElement.innerHTML=this.parentElement.getAttribute(\'data-fallback\')||\'\'">';
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
