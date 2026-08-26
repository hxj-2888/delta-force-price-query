#!/usr/bin/env node
// ===== server.js — Node.js 本地服务器 =====
// 功能清单: 静态文件服务(MIME映射+路径消毒+黑名单) | API代理(/api/*→orzice.com) | CORS处理
// .env文件读取(API_TOKEN) | 超时控制(15s) | 安全防护(目录遍历/敏感文件访问/来源校验/限流)
// 启动: node server.js | 访问: http://127.0.0.1:3000（仅绑定回环地址, 不对外网暴露）
// 依赖: 无(纯Node.js内置模块http/https/fs/path) | 被依赖: 无(独立运行)
// 改动影响: 修改端口→影响启动脚本; 修改黑名单→影响文件访问; 修改代理逻辑→影响桌面版用户

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { createRateLimiter, DEFAULTS } = require('./scripts/rate-limit.cjs');

const PORT = Number(process.env.PORT || 3000);
const API_HOST = 'orzice.com';
const API_PATH = '/workApi/v1/sjz_api';

let API_TOKEN = process.env.API_TOKEN;

if (!API_TOKEN) {
  const envFile = path.join(__dirname, '.env');
  if (fs.existsSync(envFile)) {
    try {
      const envContent = fs.readFileSync(envFile, 'utf8');
      const lines = envContent.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            const key = trimmed.substring(0, eqIdx).trim();
            const value = trimmed.substring(eqIdx + 1).trim();
            if (key === 'API_TOKEN') {
              API_TOKEN = value;
              console.log('[OK] 已从 .env 文件读取 API_TOKEN');
              break;
            }
          }
        }
      }
    } catch (e) {
      console.error('读取 .env 文件失败:', e.message);
    }
  }
}

if (!API_TOKEN) {
  console.error('错误: API_TOKEN 未设置');
  console.error('');
  console.error('创建项目根目录下的 .env 文件并写入:');
  console.error('  API_TOKEN=your_token_here');
  console.error('');
  console.error('或设置环境变量后重试: set API_TOKEN=your_token');
  process.exit(1);
}

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

function serveFile(res, filePath) {
  const ext = path.extname(filePath);
  const mime = MIME[ext] || 'application/octet-stream';
  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': mime, 'Access-Control-Allow-Origin': '*' });
    res.end(content);
  } catch (e) {
    res.writeHead(404);
    res.end('Not Found');
  }
}

// ===== 来源校验：只允许本机页面调用（防止恶意网页借用本地代理和 API_TOKEN） =====
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
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
         req.socket.remoteAddress || 'unknown';
}

// 收集请求体（前端把 { endpoint, params } 放在 POST body，见 js/api.js）
function collectBody(req, cb) {
  var chunks = [];
  req.on('data', function (c) { chunks.push(c); });
  req.on('end', function () { cb(Buffer.concat(chunks).toString('utf8')); });
  req.on('error', function () { cb(''); });
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

    // 使用 URLSearchParams 正确处理查询参数编码，附加 token
    var params = new URLSearchParams();
    Object.keys(queryParams).forEach(function (k) {
      if (queryParams[k] != null) params.set(k, String(queryParams[k]));
    });
    params.set('token', API_TOKEN);
    var baseUrl = API_PATH + '/' + endpoint + '?' + params.toString();

    var options = {
      hostname: API_HOST,
      port: 443,
      path: baseUrl,
      method: 'GET',   // 上游接口均为 GET
      headers: {
        'User-Agent': 'DeltaForcePriceQuery/1.0',
        'Accept': 'application/json'
      }
    };

    // 掩码 token，防止泄露到日志
    var logUrl = baseUrl.replace(API_TOKEN, '***');
    console.log(`[API代理] ${req.url} → https://${API_HOST}${logUrl}`);

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

  // API 代理: /api/* → https://orzice.com/workApi/v1/sjz_api/*
  if (req.url.startsWith('/api')) {
    return proxyApi(req, res);
  }

  // 根路径 → index.html
  if (req.url === '/' || req.url === '/index.html') {
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
  var PATH_PREFIX_BLACKLIST = ['migrations/', 'functions/', 'workers/', 'miniprogram/', '.wrangler/', '.vercel/'];
  if (BLACKLIST.indexOf(basename) >= 0 || basename.startsWith('.env')) {
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
  console.log('  三角洲行动 - 变卖物价格查询');
  console.log('  本地服务器已启动');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('  浏览器访问:');
  console.log(`     http://localhost:${PORT}`);
  console.log(`     http://127.0.0.1:${PORT}`);
  console.log('');
  console.log('  API 代理: /api/* → https://orzice.com/workApi/v1/sjz_api/*');
  console.log('');
  console.log('  按 Ctrl+C 停止服务器');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});
