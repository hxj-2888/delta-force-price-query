// ===== api/[...path].js — Vercel Serverless API 代理 =====
// 功能清单: POST /api/proxy(转发到orzice.com,含重试+超时) | GET /api/history/:id(降级,无D1)
// /api/metadata(静态文件读取) | 来源鉴权(同源+localhost) | CORS处理 | 路径校验
// 依赖: Vercel环境变量(API_TOKEN) fs模块(metadata读取) | 与Cloudflare版本协议一致
// 改动影响: 修改API_TOKEN→影响所有代理; 修改重试策略→影响Vercel部署用户

const https = require('https');

const API_HOST = 'orzice.com';
const API_PATH = '/workApi/v1/sjz_api';

/** ★ 同源校验：阻止第三方站点通过浏览器 fetch 盗用 API_TOKEN */
function isAuthorizedOrigin(req) {
  const origin = req.headers['origin'] || '';
  const fetchSite = req.headers['sec-fetch-site'] || '';
  // 浏览器跨站请求直接拒绝（Fetch Metadata 头 JS 不可伪造）
  if (fetchSite === 'cross-site') return false;
  // 无 Origin（Service Worker / 服务端）放行
  if (!origin) return true;
  // 同源：Origin 的 host 需与请求 Host 一致
  const host = req.headers['host'] || '';
  try {
    const o = new URL(origin);
    if (o.host === host) return true;
  } catch (e) {}
  // 本地开发环境
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return false;
}

module.exports = async function handler(req, res) {
  // CORS 预检
  if (req.method === 'OPTIONS') {
    res
      .status(204)
      .setHeader('Access-Control-Allow-Origin', '*')
      .setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      .setHeader('Access-Control-Allow-Headers', '*')
      .setHeader('Access-Control-Max-Age', '86400')
      .send('');
    return;
  }

  // ─── /api/metadata — 返回打包的静态 metadata.json ───
  if ((req.url || '').split('?')[0] === '/api/metadata' && req.method === 'GET') {
    try {
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join(__dirname, '..', 'data', 'metadata.json');
      const raw = fs.readFileSync(filePath, 'utf8');
      res
        .status(200)
        .setHeader('Content-Type', 'application/json; charset=utf-8')
        .setHeader('Access-Control-Allow-Origin', '*')
        .setHeader('Cache-Control', 'public, max-age=1800, s-maxage=1800')
        .send(raw);
      return;
    } catch (err) {
      console.error('[metadata] 读取静态文件失败:', err.message);
      res
        .status(200)
        .setHeader('Content-Type', 'application/json; charset=utf-8')
        .setHeader('Access-Control-Allow-Origin', '*')
        .json({});
      return;
    }
  }

  // ─── /api/history/:id — Vercel 无 D1，优雅降级 ───
  const historyMatch = (req.url || '').split('?')[0].match(/^\/api\/history\/(\d+)$/);
  if (historyMatch) {
    res
      .status(200)
      .setHeader('Content-Type', 'application/json; charset=utf-8')
      .setHeader('Access-Control-Allow-Origin', '*')
      .json({
        code: -1,
        msg: 'Vercel 部署不支持历史查询（无 D1），已降级到本地快照',
        data: { itemId: parseInt(historyMatch[1], 10), name: '', snapshots: [] },
      });
    return;
  }

  // ★ 防开放代理：仅允许同源请求
  if (!isAuthorizedOrigin(req)) {
    res
      .status(403)
      .setHeader('Content-Type', 'application/json; charset=utf-8')
      .json({ code: -1, msg: '未授权的来源' });
    return;
  }

  const API_TOKEN = (process.env.API_TOKEN || '').trim();
  if (!API_TOKEN) {
    res
      .status(500)
      .setHeader('Access-Control-Allow-Origin', '*')
      .json({ code: -1, msg: 'API_TOKEN 未配置，请在 Vercel Dashboard 设置环境变量' });
    return;
  }

  // ★ 解析 POST body { endpoint, params }
  let endpoint = '';
  let queryParams = {};

  if (req.method === 'POST' && req.body && typeof req.body === 'object') {
    endpoint = req.body.endpoint || '';
    queryParams = req.body.params || {};
  }

  // ★ GET 请求：从查询参数解析 endpoint（对齐 Cloudflare Functions 行为）
  if (!endpoint && req.method === 'GET') {
    const parsedUrl = new URL(req.url, 'http://localhost');
    endpoint = parsedUrl.searchParams.get('endpoint') || '';
    parsedUrl.searchParams.forEach((value, key) => {
      if (key !== 'endpoint') queryParams[key] = value;
    });
  }

  // Fallback：从 URL path 推导 endpoint
  if (!endpoint) {
    const urlPath = (req.url || '').split('?')[0];
    endpoint = urlPath.replace(/^\/api\/?/, '').replace(/\/{2,}/g, '/');
  }

  // 路径校验
  if (!/^[a-zA-Z0-9_\-/]*$/.test(endpoint)) {
    res
      .status(400)
      .setHeader('Access-Control-Allow-Origin', '*')
      .json({ code: -1, msg: '非法路径' });
    return;
  }

  const params = new URLSearchParams();
  Object.keys(queryParams).forEach((key) => params.set(key, queryParams[key]));
  params.set('token', API_TOKEN);
  const targetPath = API_PATH + '/' + endpoint + '?' + params.toString();

  console.log('[API代理]', req.url, '→', endpoint, '(params:', Object.keys(queryParams).join(','), ')');

  try {
    const timeoutMs = endpoint === 'item_price_all' ? 25000 : 15000;
    const data = await proxyRequest(targetPath, timeoutMs);
    res
      .status(200)
      .setHeader('Content-Type', 'application/json; charset=utf-8')
      .setHeader('Access-Control-Allow-Origin', '*')
      .setHeader('Cache-Control', 'public, max-age=60, s-maxage=60')
      .send(data);
  } catch (err) {
    console.error('[API代理错误]', err.message);
    res
      .status(err.statusCode || 502)
      .setHeader('Content-Type', 'application/json; charset=utf-8')
      .setHeader('Access-Control-Allow-Origin', '*')
      .json({ code: -1, msg: '代理请求失败: ' + err.message });
  }
};

function proxyRequest(targetPath, timeoutMs) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: API_HOST,
      port: 443,
      path: targetPath,
      method: 'GET',
      headers: {
        'User-Agent': 'DeltaForcePriceQuery/1.0',
        'Accept': 'application/json',
      },
      timeout: timeoutMs,
    };

    const proxyReq = https.request(options, (proxyRes) => {
      if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
        reject(Object.assign(new Error('上游重定向 ' + proxyRes.statusCode), { statusCode: 502 }));
        return;
      }
      let body = '';
      proxyRes.on('data', (chunk) => (body += chunk));
      proxyRes.on('end', () => {
        if (proxyRes.statusCode !== 200) {
          reject(Object.assign(new Error('上游返回 ' + proxyRes.statusCode), { statusCode: 502 }));
          return;
        }
        resolve(body);
      });
    });

    proxyReq.on('error', (err) => {
      reject(Object.assign(new Error(err.message), { statusCode: 502 }));
    });

    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      reject(Object.assign(new Error('代理请求超时'), { statusCode: 504 }));
    });

    proxyReq.end();
  });
}
