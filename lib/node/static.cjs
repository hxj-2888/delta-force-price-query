'use strict';
// ===== 静态文件服务（桌面版）：MIME + CSP + 路径消毒 + 敏感文件黑名单 =====

const fs = require('fs');
const path = require('path');

// MIME 类型映射
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp'
};

// ===== 本地版 CSP =====
// _headers 里的 CSP 只对 Cloudflare Pages 生效，桌面版（server.js）此前完全没有 CSP。
// 本地场景的差异：所有请求都走同源 /api，connect-src 只需 'self'；
// script-src 仍需 'unsafe-inline'，因为 index.html 的预取脚本是内联的（已知妥协）。
const CSP_LOCAL = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'none'"
].join('; ');

function serveFile(res, filePath) {
  const ext = path.extname(filePath);
  const mime = MIME[ext] || 'application/octet-stream';
  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Security-Policy': CSP_LOCAL,
      // 入口与资源一律禁用缓存，避免更新后桌面版仍加载旧页面（云端靠 ?v= 版本号，本地没有）
      'Cache-Control': 'no-cache'
    });
    res.end(content);
  } catch (e) {
    res.writeHead(404);
    res.end('Not Found');
  }
}

// 文件名黑名单：禁止访问敏感文件
const BLACKLIST = ['.env', '.git', '.gitignore', '.gitattributes',
  'server.js', 'package.json', 'package-lock.json',
  'wrangler.toml', '_headers',
  'installer.iss', 'setup.bat', 'start.bat',
  'miniprogram.zip', 'DEPLOY.md', 'README.md'];

// 审计 2026-08-29（M6 修复）：原路径前缀黑名单漏了 android/ 等目录，本地服务器可被匿名下载
//   http://127.0.0.1:3000/android/release.keystore —— 安卓签名密钥直接泄露。
//   密码在 .env（已列文件黑名单），但密钥文件泄露后仍可被离线暴力破解。
//   现按「目录前缀 + 扩展名」双重拦截，任何位置的签名/私钥文件一律 403。
const PATH_PREFIX_BLACKLIST = ['.git/', '.github/', 'migrations/', 'functions/', 'workers/',
  'miniprogram/', '.wrangler/', '.vercel/', 'android/',
  'scripts/', 'lib/', 'test/', 'installer/', 'dist/'];

const BLOCKED_EXT = ['.keystore', '.jks', '.p12', '.pem', '.key', '.pfx'];

// 其余静态请求：路径消毒（目录遍历）+ 黑名单拦截，通过后读文件返回。
// 写 403/404 或 200 均在本函数内完成。
function serveStatic(res, url, rootDir) {
  const requestedPath = url.split('?')[0].split('#')[0].replace(/\\/g, '/');
  const resolvedRoot = path.resolve(rootDir);
  const resolvedPath = path.resolve(resolvedRoot, requestedPath.replace(/^\/+/, ''));
  // 确保解析后的路径仍在项目目录下
  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(resolvedRoot + path.sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  const basename = path.basename(resolvedPath).toLowerCase();
  if (BLACKLIST.indexOf(basename) >= 0 || basename.startsWith('.env')
      || BLOCKED_EXT.some(function (ext) { return basename.endsWith(ext); })) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  // 路径前缀黑名单：禁止访问敏感目录
  const normalizedPath = resolvedPath.replace(/\\/g, '/') + '/';
  for (let i = 0; i < PATH_PREFIX_BLACKLIST.length; i++) {
    if (normalizedPath.indexOf('/' + PATH_PREFIX_BLACKLIST[i]) >= 0) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
  }
  serveFile(res, resolvedPath);
}

module.exports = { serveFile, serveStatic, MIME, CSP_LOCAL };
