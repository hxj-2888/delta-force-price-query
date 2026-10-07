#!/usr/bin/env node
// ===== server.js — Node.js 本地服务器 =====
// 功能清单: 静态文件服务(MIME映射+路径消毒+黑名单) | API中继(/api/*→Pages线上/api/*) | CORS处理
// 超时控制(15s) | 安全防护(目录遍历/敏感文件访问/来源校验/限流)
// 启动: node server.js | 访问: http://127.0.0.1:3000（仅绑定回环地址, 不对外网暴露）
// 依赖: 无(纯Node.js内置模块http/https/fs/path) | 被依赖: 无(独立运行)
// 改动影响: 修改端口→影响启动脚本; 修改黑名单→影响文件访问; 修改中继逻辑→影响桌面版用户

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { createRateLimiter, DEFAULTS } = require('./scripts/rate-limit.cjs');

const PORT = Number(process.env.PORT || 3000);
// 中继模式（2026-09-27）：本地不再持有 API_TOKEN，/api/* 统一中继到线上 Pages 部署，
// 由其 Cloudflare Functions 用 secret 中的 API_TOKEN 调用上游 orzice.com。
// 线上鉴权已核实放行 localhost 来源（functions/api/[[path]].js isAuthorizedOrigin 第77行），
// 且带 Origin 的请求按浏览器调用处理，不触发 X-Proxy-Key 校验。
const RELAY_HOST = process.env.RELAY_HOST || 'delta-force-v5.pages.dev';
const RELAY_PATH = '/api';

// 匿名客户端 ID（云端第三层限流的「同账号」桶, 见 functions/api/[[path]].js）：
// 本地浏览器带来的 X-Client-Id 优先透传（与网页版同一 localStorage ID）；
// 缺失时用装机指纹哈希（hostname|username 的 SHA-256 前 32 位, 不落盘、不含原始值）。
function getClientId(req) {
  var forwarded = req && req.headers && req.headers['x-client-id'];
  if (typeof forwarded === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(forwarded.trim())) {
    return forwarded.trim();
  }
  return INSTALL_CLIENT_ID;
}
const INSTALL_CLIENT_ID = crypto.createHash('sha256')
  .update(os.hostname() + '|' + os.userInfo().username)
  .digest('hex').slice(0, 32);

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

// ===== 来源校验：只允许本机页面调用（防止恶意网页借用本地中继代理） =====
function isAuthorizedOrigin(req) {
  // 浏览器跨站请求直接拒绝（Fetch Metadata 头 JS 不可伪造）
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  const origin = req.headers['origin'] || '';
  // 无 Origin（同源 GET / 本机 curl）放行
  if (!origin) return true;
  // 仅放行 localhost / 127.0.0.1 来源
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

// ===== 简单内存限流（单机使用, 防止本机页面/脚本刷上游配额） =====
// 逻辑见 scripts/rate-limit.cjs（规范实现），可通过环境变量覆盖阈值（测试用）
var checkRateLimit = createRateLimiter({
  windowMs: Number(process.env.RATE_WINDOW_MS || DEFAULTS.windowMs),
  maxPerIp: Number(process.env.RATE_MAX_PER_IP || DEFAULTS.maxPerIp),
  maxGlobal: Number(process.env.RATE_MAX_GLOBAL || DEFAULTS.maxGlobal)
});

function getClientIp(req) {
  // 本地服务器仅绑定 127.0.0.1，remoteAddress 恒为本机回环地址；
  // 不读取 x-forwarded-for：该头可被本机任意进程伪造（每次换 IP 绕开 per-IP 限流）
  return req.socket.remoteAddress || 'unknown';
}

// 收集请求体（前端把 { endpoint, params } 放在 POST body，见 js/api.js）
// 上限 64KB：超限按空 body 处理（后续走 endpoint 白名单 403），防止恶意大 body 撑爆内存
var MAX_BODY_BYTES = 64 * 1024;
function collectBody(req, cb) {
  var chunks = [];
  var size = 0;
  var done = false;
  var finish = function (str) { if (!done) { done = true; cb(str); } };
  req.on('data', function (c) {
    size += c.length;
    if (size > MAX_BODY_BYTES) { chunks = []; finish(''); return; }
    chunks.push(c);
  });
  req.on('end', function () { finish(Buffer.concat(chunks).toString('utf8')); });
  req.on('error', function () { finish(''); });
}

// ===== 本地端点：与 Cloudflare Functions 对齐（server.js 自行实现，不走上游代理）=====
// 背景：云端 functions/api/[[path]].js 提供 /api/metadata（KV∪静态）与 /api/history/:id（D1）。
// 本地没有 KV/D1，若不在此拦截，请求会掉进 proxyApi 的 URL path 兜底逻辑，
// 被当成上游接口转发到线上 /api/metadata → 返回错误 JSON，
// 而 index.html 的预取脚本只 r.json() 不校验 code，于是全部物品名退化为「物品#ID」。

var _metadataCache = { mtimeMs: -1, body: null };

function serveMetadata(res) {
  var file = path.join(__dirname, 'data', 'metadata.json');
  try {
    var stat = fs.statSync(file);
    if (!_metadataCache.body || _metadataCache.mtimeMs !== stat.mtimeMs) {
      _metadataCache = { mtimeMs: stat.mtimeMs, body: fs.readFileSync(file) };
    }
  } catch (e) {
    // 文件缺失时返回空对象：前端会走 item_list 补全兜底，而不是整页崩溃
    _metadataCache = { mtimeMs: -1, body: null };
  }
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache'
  });
  res.end(_metadataCache.body || Buffer.from('{}'));
}

// ===== 通用中继：GET 请求转发到线上 Pages 部署 =====
// 带 localhost Origin 通过其来源鉴权，且按浏览器调用处理（不触发 X-Proxy-Key）。
// onError：中继失败时的降级回调（如历史端点降级为本地快照提示），不传则返回 502/504。
function relayGet(req, res, targetPath, onError) {
  var options = {
    hostname: RELAY_HOST,
    port: 443,
    path: targetPath,
    method: 'GET',
    headers: {
      'User-Agent': 'DeltaForcePriceQuery/1.0',
      'Accept': 'application/json',
      'Origin': `http://localhost:${PORT}`,
      'X-Client-Id': getClientId(req)
    }
  };
  console.log(`[API中继] ${req.url} → https://${RELAY_HOST}${targetPath}`);
  let responded = false;
  const proxyReq = https.request(options, (proxyRes) => {
    let body = '';
    proxyRes.on('data', chunk => body += chunk);
    proxyRes.on('end', () => {
      if (responded) return;
      responded = true;
      res.writeHead(proxyRes.statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store'
      });
      res.end(body);
      console.log(`[API中继] 响应 ${proxyRes.statusCode}, ${body.length} 字节`);
    });
  });
  proxyReq.on('error', (err) => {
    if (responded) return;
    responded = true;
    console.error(`[API中继] 错误: ${err.message}`);
    if (onError) { onError(err); return; }
    res.writeHead(502);
    res.end(JSON.stringify({ code: -1, msg: '中继请求失败: ' + err.message }));
  });
  proxyReq.setTimeout(15000, () => {
    if (responded) return;
    responded = true;
    proxyReq.destroy();
    console.error('[API中继] 超时(15s)');
    if (onError) { onError(new Error('timeout')); return; }
    res.writeHead(504);
    res.end(JSON.stringify({ code: -1, msg: '中继请求超时' }));
  });
  proxyReq.end();
}

// 线上不可用时的降级：让 js/store/cache.js 的 getOrFetchCloudSnapshots 降级到本地快照
function serveHistoryUnavailable(res) {
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify({ code: -1, msg: '云端价格历史暂不可达，已使用本地快照' }));
}

function proxyApi(req, res) {
  if (!isAuthorizedOrigin(req)) {
    res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ code: -1, msg: '未授权的来源' }));
    return;
  }
  if (!checkRateLimit(getClientIp(req))) {
    res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': '60' });
    res.end(JSON.stringify({ code: -1, msg: '请求过于频繁, 请稍后再试' }));
    return;
  }

  // 必须解析 POST body 才能拿到真实 endpoint，否则只会转发到字面 /sjz_api/proxy（上游 404）。
  // 解析顺序对齐 Cloudflare functions/api/[[path]].js：POST body → GET 查询参数 → URL path 兜底。
  function forward(body) {
    var endpoint = '';
    var queryParams = {};

    if (req.method === 'POST' && body) {
      var parsed = null;
      try { parsed = JSON.parse(body); } catch (e) { parsed = null; }
      endpoint = (parsed && parsed.endpoint) || '';
      queryParams = (parsed && parsed.params) || {};
    } else {
      var searchIndex = req.url.indexOf('?');
      var rawSearch = searchIndex >= 0 ? req.url.substring(searchIndex + 1) : '';
      var qs = new URLSearchParams(rawSearch);
      endpoint = qs.get('endpoint') || '';
      qs.forEach(function (v, k) { if (k !== 'endpoint') queryParams[k] = v; });
    }

    // 兜底：从 URL path 推导（如 GET /api/item_price_all）
    if (!endpoint) {
      endpoint = req.url.split('?')[0].replace(/^\/api/, '').replace(/^\/+/, '').replace(/\/{2,}/g, '/');
    }

    // 路径校验：防止路径遍历（/api/../admin）
    if (!/^[a-zA-Z0-9_\-\/]*$/.test(endpoint)) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ code: -1, msg: '非法路径' }));
      return;
    }

    // endpoint 枚举白名单（安全审计 2026-08-29）：与 functions/api/[[path]].js 保持一致，
    // 防止本代理+token 被用来调用上游任意子路径；新增上游接口时两处同步登记
    var ALLOWED_ENDPOINTS = ['item_list', 'item_price_all'];
    if (ALLOWED_ENDPOINTS.indexOf(endpoint) < 0) {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ code: -1, msg: '不支持的 endpoint' }));
      return;
    }

    // 使用 URLSearchParams 正确处理查询参数编码（token 由中继目标的 Functions secret 注入，本地不经手）
    var params = new URLSearchParams();
    Object.keys(queryParams).forEach(function (k) {
      if (queryParams[k] != null) params.set(k, String(queryParams[k]));
    });
    var baseUrl = RELAY_PATH + '/' + endpoint + '?' + params.toString();

    var options = {
      hostname: RELAY_HOST,
      port: 443,
      path: baseUrl,
      method: 'GET',   // 上游接口均为 GET
      headers: {
        'User-Agent': 'DeltaForcePriceQuery/1.0',
        'Accept': 'application/json',
        // 声明 localhost 来源：线上 isAuthorizedOrigin 放行本机来源（第77行正则），
        // 且带 Origin 的请求按浏览器跨源调用处理，不触及 X-Proxy-Key 校验
        'Origin': `http://localhost:${PORT}`,
        'X-Client-Id': getClientId(req)
      }
    };

    console.log(`[API中继] ${req.url} → https://${RELAY_HOST}${baseUrl}`);

    let responded = false;

    const proxyReq = https.request(options, (proxyRes) => {
      let body = '';
      proxyRes.on('data', chunk => body += chunk);
      proxyRes.on('end', () => {
        if (responded) return;
        responded = true;
        res.writeHead(proxyRes.statusCode, {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=60'
        });
        res.end(body);
        console.log(`[API代理] 响应 ${proxyRes.statusCode}, ${body.length} 字节`);
      });
    });

    proxyReq.on('error', (err) => {
      if (responded) return;
      responded = true;
      console.error(`[API代理] 错误: ${err.message}`);
      res.writeHead(502);
      res.end(JSON.stringify({ code: -1, msg: '代理请求失败: ' + err.message }));
    });

    proxyReq.setTimeout(15000, () => {
      if (responded) return;
      responded = true;
      proxyReq.destroy();
      res.writeHead(504);
      res.end(JSON.stringify({ code: -1, msg: '代理请求超时' }));
    });

    proxyReq.end();
  }

  if (req.method === 'POST') {
    collectBody(req, forward);
  } else {
    forward('');
  }
}

const server = http.createServer((req, res) => {
  console.log(`[请求] ${req.method} ${req.url}`);

  // CORS 预检请求
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age': '86400'
    });
    res.end();
    return;
  }

  // 去掉查询串后的路径（用于精确匹配，避免 /api-xxx 之类被误判成 /api/*）
  const pathname = req.url.split('?')[0].split('#')[0];

  // 本地元数据（必须早于 /api 代理，否则会被当成上游接口转发）
  if (pathname === '/api/metadata' && req.method === 'GET') {
    if (!isAuthorizedOrigin(req)) {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ code: -1, msg: '未授权的来源' }));
      return;
    }
    if (!checkRateLimit(getClientIp(req))) {
      res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': '60' });
      res.end(JSON.stringify({ code: -1, msg: '请求过于频繁, 请稍后再试' }));
      return;
    }
    return serveMetadata(res);
  }

  // 价格历史（后端 D1 记录）：中继到线上 /api/history/:id；线上不可用时降级本地快照
  var historyMatch = pathname.match(/^\/api\/history\/(\d+)$/);
  if (historyMatch && req.method === 'GET') {
    if (!isAuthorizedOrigin(req)) {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ code: -1, msg: '未授权的来源' }));
      return;
    }
    if (!checkRateLimit(getClientIp(req))) {
      res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': '60' });
      res.end(JSON.stringify({ code: -1, msg: '请求过于频繁, 请稍后再试' }));
      return;
    }
    return relayGet(req, res, '/api/history/' + historyMatch[1], function () {
      serveHistoryUnavailable(res);
    });
  }

  // API 中继: /api/* → https://delta-force-v5.pages.dev/api/*
  if (pathname === '/api' || pathname.indexOf('/api/') === 0) {
    return proxyApi(req, res);
  }

  // 根路径 → index.html
  if (pathname === '/' || pathname === '/index.html') {
    return serveFile(res, path.join(__dirname, 'index.html'));
  }

  // 其他静态文件（路径消毒，防止目录遍历）
  const requestedPath = req.url.split('?')[0].split('#')[0].replace(/\\/g, '/');
  const rootDir = path.resolve(__dirname);
  const resolvedPath = path.resolve(rootDir, requestedPath.replace(/^\/+/, ''));
  // 确保解析后的路径仍在项目目录下
  if (resolvedPath !== rootDir && !resolvedPath.startsWith(rootDir + path.sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  // 文件名黑名单：禁止访问敏感文件
  var basename = path.basename(resolvedPath).toLowerCase();
  var BLACKLIST = ['.env', '.git', '.gitignore', '.gitattributes',
                    'server.js', 'package.json', 'package-lock.json',
                    'wrangler.toml', '_headers',
                    'installer.iss', 'setup.bat', 'start.bat',
                    'miniprogram.zip', 'DEPLOY.md', 'README.md'];
  // 审计 2026-08-29（M6 修复）：原路径前缀黑名单漏了 android/ 等目录，本地服务器可被匿名下载
  //   http://127.0.0.1:3000/android/release.keystore —— 安卓签名密钥直接泄露。
  //   密码在 .env（已列文件黑名单），但密钥文件泄露后仍可被离线暴力破解。
  //   现按「目录前缀 + 扩展名」双重拦截，任何位置的签名/私钥文件一律 403。
  var PATH_PREFIX_BLACKLIST = ['.git/', '.github/', 'migrations/', 'functions/', 'workers/',
                               'miniprogram/', '.wrangler/', '.vercel/', 'android/',
                               'scripts/', 'test/', 'installer/', 'dist/'];
  var BLOCKED_EXT = ['.keystore', '.jks', '.p12', '.pem', '.key', '.pfx'];
  if (BLACKLIST.indexOf(basename) >= 0 || basename.startsWith('.env')
      || BLOCKED_EXT.some(function (ext) { return basename.endsWith(ext); })) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  // 路径前缀黑名单：禁止访问敏感目录
  var normalizedPath = resolvedPath.replace(/\\/g, '/') + '/';
  for (var i = 0; i < PATH_PREFIX_BLACKLIST.length; i++) {
    if (normalizedPath.indexOf('/' + PATH_PREFIX_BLACKLIST[i]) >= 0) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
  }
  serveFile(res, resolvedPath);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  落幕查 - 变卖物价格查询');
  console.log('  本地服务器已启动');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('  浏览器访问:');
  console.log(`     http://localhost:${PORT}`);
  console.log(`     http://127.0.0.1:${PORT}`);
  console.log('');
  console.log('  API 中继: /api/* → https://delta-force-v5.pages.dev/api/*');
  console.log('');
  console.log('  按 Ctrl+C 停止服务器');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});
