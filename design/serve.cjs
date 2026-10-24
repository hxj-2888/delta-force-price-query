// serve.cjs — demo 本地服务：design/ 静态文件 + 上游转发（带同源 Origin + 自动重试）
'use strict';
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = 8931;
const ROOT = __dirname;
const UPSTREAM = 'https://delta-force-v5.pages.dev';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon' };

// 转发上游（同源 Origin 头 + 超时 + 最多 3 次重试：该网络到 pages.dev 常见 ECONNRESET）
function proxyFetch(pathname, res, attempt = 1) {
  const up = UPSTREAM + pathname;
  const req = https.get(up, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36',
      'Accept': 'application/json',
      'Origin': UPSTREAM, 'Referer': UPSTREAM + '/',
    }, timeout: 28000,
  }, ur => {
    let b = '';
    ur.on('data', c => b += c);
    ur.on('end', () => {
      // 5xx / 空体视为可重试错误
      if (ur.statusCode >= 500 && attempt < 3) { setTimeout(() => proxyFetch(pathname, res, attempt + 1), 1200); return; }
      res.writeHead(ur.statusCode === 200 ? 200 : 502, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(b);
    });
  });
  req.on('error', e => {
    if (attempt < 3) { setTimeout(() => proxyFetch(pathname, res, attempt + 1), 1200); return; }
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ code: -1, msg: '上游请求失败: ' + e.message }));
  });
  req.on('timeout', () => req.destroy(new Error('timeout')));
}

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  const pathname = decodeURIComponent(u.pathname);

  if (pathname === '/api/refresh') { proxyFetch('/api/proxy?endpoint=item_price_all', res); return; }
  const hm = pathname.match(/^\/api\/history\/(\d+)$/);
  if (hm) { proxyFetch('/api/history/' + hm[1], res); return; }

  const p = path.join(ROOT, pathname === '/' ? 'finance-demo.html' : pathname);
  fs.readFile(p, (e, d) => {
    if (e) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(d);
  });
}).listen(PORT, () => console.log('design demo serving on http://127.0.0.1:' + PORT));
