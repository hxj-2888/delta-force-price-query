// 三角洲行动 - 变卖物价格查询 本地服务器
// 启动方式: node server.js
// 访问地址: http://localhost:3000

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
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
  '.ico': 'image/x-icon'
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

function proxyApi(req, res) {
  // 路径校验：防止路径遍历（/api/../admin）
  var pathPart = req.url.split('?')[0].replace(/^\/api/, '').replace(/\/{2,}/g, '/');
  if (!/^(\/[a-zA-Z0-9_\-/]*)?$/.test(pathPart)) {
    res.writeHead(400);
    res.end(JSON.stringify({ code: -1, msg: '非法路径' }));
    return;
  }

  // 使用 URLSearchParams 正确处理查询参数编码
  // 转发原始请求的查询参数并附加 token
  var searchIndex = req.url.indexOf('?');
  var rawSearch = searchIndex >= 0 ? req.url.substring(searchIndex) : '';
  var params = new URLSearchParams(rawSearch);
  params.set('token', API_TOKEN);
  var baseUrl = API_PATH + pathPart + '?' + params.toString();

  const options = {
    hostname: API_HOST,
    port: 443,
    path: baseUrl,
    method: req.method,
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
        'Cache-Control': 'public, max-age=300'
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
  const resolvedPath = path.resolve(__dirname, requestedPath.replace(/^\/+/, ''));
  // 确保解析后的路径仍在项目目录下
  if (!resolvedPath.startsWith(path.resolve(__dirname))) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  // 文件名黑名单：禁止访问敏感文件
  var basename = path.basename(resolvedPath).toLowerCase();
  var BLACKLIST = ['.env', '.git', '.gitignore', '.gitattributes', '.vercelignore',
                    'server.js', 'package.json', 'package-lock.json',
                    'wrangler.toml', 'vercel.json'];
  if (BLACKLIST.indexOf(basename) >= 0 || basename.startsWith('.env')) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  serveFile(res, resolvedPath);
});

server.listen(PORT, () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  三角洲行动 - 变卖物价格查询');
  console.log('  本地服务器已启动');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('  🌐 浏览器访问:');
  console.log(`     http://localhost:${PORT}`);
  console.log(`     http://127.0.0.1:${PORT}`);
  console.log('');
  console.log('  📡 API 代理: /api/* → https://orzice.com/workApi/v1/sjz_api/*');
  console.log('');
  console.log('  按 Ctrl+C 停止服务器');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});
