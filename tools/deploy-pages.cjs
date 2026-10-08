/* ============================================================
 * tools/deploy-pages.cjs — 部署到 Cloudflare Pages（落幕查 · delta-force-v5）
 *
 * 为什么需要「白名单暂存」：`wrangler pages deploy` 会把目录内容整体上传，
 * 而 .assetsignore 对它无效（2026-08-29 实测）——仓库根还有 .env（签名密码）、
 * android/release.keystore（签名私钥）、miniprogram/、test/、workers/ 等
 * 非站点内容。CI 的 checkout 里没有 gitignore 文件，但本地磁盘有；
 * 两边都只上传白名单内的文件，行为才一致。
 *
 * ★ scripts/rate-limit.cjs 必须在白名单内：functions/api/[[path]].js
 *   import 该模块，暂存目录缺了它函数打包直接失败。
 *
 * 随站点分发的安装包（delta-force.apk / delta-force-portable.zip）不进 git，
 * CI 从 GitHub Release 拉回仓库根后随本次部署上传；本地磁盘没有时警告并跳过。
 *
 * 前置：本机已安装 wrangler 并 `wrangler login`（部署读 CWD 的 wrangler.toml 获取 D1/KV 绑定）。
 * CI：设 CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID 环境变量（wrangler 自动识别，免登录），
 *     并用 WRANGLER_CMD 指定启动命令（如 "npx wrangler@4"）——见 .github/workflows/deploy.yml。
 * 用法：node tools/deploy-pages.cjs
 * ============================================================ */
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PROJECT = 'delta-force-v5';
const BRANCH = 'main';
const ROOT = path.join(__dirname, '..');
// CI 注入的启动命令（如 "npx wrangler@4"）；本地默认用 PATH 里的 wrangler
const WRANGLER = process.env.WRANGLER_CMD || 'wrangler';
// 站点必需文件：缺任何一个都视为源码不完整，拒绝部署
const SITE_ENTRIES = [
  'index.html', 'download.html',
  'delta-force-logo.png', 'delta-force-logo.webp',
  'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'icon.ico',
  'manifest.json', 'sw.js',
  // ★ css 必须显式列出：曾漏掉它，线上 /css/*.css 命中 Pages 的 SPA 兜底，
  //   返回 index.html 且 Content-Type: text/html、状态码 200。浏览器会静默丢弃
  //   非 CSS 内容的样式表 → 页面零样式（JS 与 /api 正常，所以表现为「有数据、格式烂掉」）。
    'css',
  'js', 'data', 'functions', '_headers',
  // 函数运行时依赖的模块：functions/api/[[path]].js 与 lib/ 内部都 import 它们，
  // 暂存目录缺了任何一个，函数打包直接失败（test/rate-limit.test.mjs 有白名单断言）
  'lib', 'scripts/rate-limit.cjs',
];
// 可选文件：存在才带上（安装包走 GitHub Release 分发，本地磁盘通常没有）
const OPTIONAL_ENTRIES = ['delta-force.apk', 'delta-force-portable.zip'];

const stage = path.join(os.tmpdir(), 'delta-force-pages-deploy');
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });

for (const entry of SITE_ENTRIES) {
  const src = path.join(ROOT, entry);
  if (!fs.existsSync(src)) {
    console.error('缺少站点资源: ' + entry);
    process.exit(1);
  }
  fs.cpSync(src, path.join(stage, entry), { recursive: true });
}
for (const entry of OPTIONAL_ENTRIES) {
  const src = path.join(ROOT, entry);
  if (!fs.existsSync(src)) {
    console.warn('⚠ 可选资源不存在，本次部署不包含（安装包下载将走 Release 兜底）: ' + entry);
    continue;
  }
  fs.cpSync(src, path.join(stage, entry), { recursive: true });
}

// 打印暂存内容，便于确认没有多余文件被上传
const walk = (dir, base, out) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? base + '/' + e.name : e.name;
    if (e.isDirectory()) walk(path.join(dir, e.name), rel, out);
    else out.push(rel);
  }
  return out;
};
const files = walk(stage, '', []);
console.log('暂存目录: ' + stage);
console.log('待上传文件数: ' + files.length + '（仅站点资源与限流模块，不含 miniprogram/test/workers/.env/keystore）');
const total = files.reduce((s, f) => s + fs.statSync(path.join(stage, f)).size, 0);
console.log('总体积: ' + (total / 1048576).toFixed(2) + ' MB');

// ★ 部署前核对 index.html 引用的每个站内资源都真的进了暂存目录。
//   白名单是手工维护的，漏一个目录不会有任何报错：Pages 的 SPA 兜底会把
//   /css/layout.css 这类缺失资源变成「200 + index.html(text/html)」，
//   样式表被浏览器静默丢弃，线上表现为「有数据但格式烂掉」，极难定位。
//   这里把「引用了但没上传」变成部署前的硬失败。
const stagedIndex = fs.readFileSync(path.join(stage, 'index.html'), 'utf8');
const refs = new Set();
for (const m of stagedIndex.matchAll(/(?:href|src)="([^"]+)"/g)) {
  let ref = m[1].trim();
  if (!ref || ref.startsWith('#')) continue;
  if (/^(https?:)?\/\//i.test(ref)) continue;                 // 外链
  if (/^(data:|mailto:|tel:|javascript:|blob:)/i.test(ref)) continue;
  ref = ref.split(/[?#]/)[0];
  if (!ref) continue;
  ref = ref.replace(/^\.?\//, '');                             // 兼容 'css/a.css' 与 '/css/a.css'
  if (ref) refs.add(ref);
}
const missing = [...refs].filter((r) => !fs.existsSync(path.join(stage, r)));
if (missing.length > 0) {
  console.error('\n✗ index.html 引用了未进入暂存目录的资源，拒绝部署:');
  missing.forEach((m) => console.error('  - /' + m + (fs.existsSync(path.join(ROOT, m)) ? '（本地存在，漏加进 SITE_ENTRIES）' : '（本地也不存在）')));
  process.exit(1);
}
console.log('资源引用核对通过: index.html 的 ' + refs.size + ' 个站内引用均已就位');

console.log('\n创建 Pages 项目（已存在则忽略报错）...');
spawnSync(WRANGLER, ['pages', 'project', 'create', PROJECT, '--production-branch', BRANCH],
  { cwd: ROOT, stdio: 'inherit', shell: true });

console.log('\n部署中（D1/KV 绑定来自 CWD 的 wrangler.toml）...');
const r = spawnSync(WRANGLER,
  ['pages', 'deploy', stage, '--project-name', PROJECT, '--branch', BRANCH],
  { cwd: ROOT, stdio: 'inherit', shell: true });

fs.rmSync(stage, { recursive: true, force: true });
process.exit(r.status === null ? 1 : r.status);
