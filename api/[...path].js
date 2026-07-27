// Vercel Serverless Function - API 代理
// 将 /api/* 请求转发到 orzice.com

const https = require('https');

const API_HOST = 'orzice.com';
const API_PATH = '/workApi/v1/sjz_api';

module.exports = async function handler(req, res) {
  // CORS 预检请求
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

  const API_TOKEN = (process.env.API_TOKEN || '').trim();
  if (!API_TOKEN) {
    res
      .status(500)
      .setHeader('Access-Control-Allow-Origin', '*')
      .json({ code: -1, msg: 'API_TOKEN 未配置，请在 Vercel Dashboard 设置环境变量' });
    return;
  }

  const urlPath = req.url.split('?')[0] || '';
  const apiPath = urlPath.replace(/^\/api/, '').replace(/\/{2,}/g, '/');

  if (!/^(\/[a-zA-Z0-9_\-/]*)?$/.test(apiPath)) {
    res
      .status(400)
      .setHeader('Access-Control-Allow-Origin', '*')
      .json({ code: -1, msg: '非法路径' });
    return;
  }

  // 使用 URLSearchParams 正确处理查询参数编码
  // 避免 "Request path contains unescaped characters" 错误
  const searchIndex = req.url.indexOf('?');
  const rawSearch = searchIndex >= 0 ? req.url.substring(searchIndex) : '';
  const params = new URLSearchParams(rawSearch);
  params.delete('path'); // 移除 Vercel 路由参数
  params.set('token', API_TOKEN);
  const query = params.toString();
  const targetPath = API_PATH + apiPath + '?' + query;

  console.log(`[API代理] ${req.url} → https://${API_HOST}${targetPath.replace(API_TOKEN, '***')}`);

  try {
    const data = await proxyRequest(targetPath);
    res
      .status(200)
      .setHeader('Content-Type', 'application/json; charset=utf-8')
      .setHeader('Access-Control-Allow-Origin', '*')
      .setHeader('Cache-Control', 'no-cache, s-maxage=600')
      .send(data);
  } catch (err) {
    console.error(`[API代理错误] ${err.message}`);
    res
      .status(err.statusCode || 502)
      .setHeader('Content-Type', 'application/json; charset=utf-8')
      .setHeader('Access-Control-Allow-Origin', '*')
      .json({ code: -1, msg: '代理请求失败: ' + err.message });
  }
}

function proxyRequest(targetPath) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: API_HOST,
      port: 443,
      path: targetPath,
      method: 'GET',
      headers: {
        'User-Agent': 'DeltaForcePriceQuery/1.0',
        'Accept': 'application/json'
      },
      timeout: 15000
    };

    const proxyReq = https.request(options, (proxyRes) => {
      if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
        reject(new Error(`上游API返回重定向 ${proxyRes.statusCode}: ${proxyRes.headers.location}`));
        return;
      }

      let body = '';
      proxyRes.on('data', chunk => body += chunk);
      proxyRes.on('end', () => {
        if (proxyRes.statusCode !== 200) {
          reject(Object.assign(new Error(`上游API返回 ${proxyRes.statusCode}`), { statusCode: 502 }));
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
