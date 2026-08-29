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
// 腾讯云 CI 支持 imageMogr2 缩略参数，144x/format/webp 单张约 3KB，可覆盖 36px 展示 × 3~4 倍屏（DPR）。
// 曾用过 72x（1.3KB/张），在高分屏（DPR≥2）上发糊，2026-08-29 提升到 144x。
// 只对已知支持该参数的域名生效，其他 CDN 原样返回，避免拼出不存在的参数导致 404。
function smallPicUrl(url, size) {
  if (!url || typeof url !== 'string') return '';
  if (url.indexOf('playerhub.df.qq.com/') < 0) return url;
  var s = (size || 144);
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
