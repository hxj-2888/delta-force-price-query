'use strict';
// ===== API 代理（桌面版）：/api/* 转发到线上 Pages 部署 =====
// 本地不持有上游 API_TOKEN：token 由中继目标（Pages Functions secret）注入。
// 解析顺序对齐云端 lib/handlers/proxy.cjs：POST body → GET 查询参数 → URL path 兜底。

const https = require('https');
const { isAuthorizedOrigin, getClientIp } = require('./security.cjs');
const { getClientId } = require('./client-id.cjs');

// 收集请求体（前端把 { endpoint, params } 放在 POST body，见 js/api.js）
// 上限 64KB：超限按空 body 处理（后续走 endpoint 白名单 403），防止恶意大 body 撑爆内存
const MAX_BODY_BYTES = 64 * 1024;

// 中继请求的上限（毫秒）。取值 22s 的依据：页侧 js/api.js 的 fetch 预算是 25s，
// 本地中继必须先于页面超时返回，才能把「上游慢」变成页面能识别并重试的 504，
// 而不是双方都耗到超时、连接被白白占住。
// ⚠️ 上游 orzice.com 单次实测 9~14s（item_price_all 270KB、item_list 仅 4.6KB 也要 11s，
//    慢在 Pages Functions → 上游这一跳而非传输），故不宜再收紧到 15s 以下。
const RELAY_TIMEOUT_MS = Number(process.env.RELAY_TIMEOUT_MS || 22000);

function collectBody(req, cb) {
  const chunks = [];
  let size = 0;
  let done = false;
  const finish = function (str) { if (!done) { done = true; cb(str); } };
  req.on('data', function (c) {
    size += c.length;
    if (size > MAX_BODY_BYTES) { chunks.length = 0; finish(''); return; }
    chunks.push(c);
  });
  req.on('end', function () { finish(Buffer.concat(chunks).toString('utf8')); });
  req.on('error', function () { finish(''); });
}

// opts: { relayHost, relayPath, checkRateLimit } —— checkRateLimit 是 server.js
// 按环境变量装配好的限流实例（阈值来源 scripts/rate-limit.cjs DEFAULTS）
function createProxyApi(opts) {
  const { relayHost, relayPath, checkRateLimit } = opts;

  return function proxyApi(req, res) {
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
    function forward(body) {
      let endpoint = '';
      let queryParams = {};

      if (req.method === 'POST' && body) {
        let parsed = null;
        try { parsed = JSON.parse(body); } catch (e) { parsed = null; }
        endpoint = (parsed && parsed.endpoint) || '';
        queryParams = (parsed && parsed.params) || {};
      } else {
        const searchIndex = req.url.indexOf('?');
        const rawSearch = searchIndex >= 0 ? req.url.substring(searchIndex + 1) : '';
        const qs = new URLSearchParams(rawSearch);
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

      // endpoint 枚举白名单（安全审计 2026-08-29）：与云端 lib/handlers/proxy.cjs 保持一致，
      // 防止本代理+token 被用来调用上游任意子路径；新增上游接口时两处同步登记
      const ALLOWED_ENDPOINTS = ['item_list', 'item_price_all'];
      if (ALLOWED_ENDPOINTS.indexOf(endpoint) < 0) {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ code: -1, msg: '不支持的 endpoint' }));
        return;
      }

      // 使用 URLSearchParams 正确处理查询参数编码（token 由中继目标的 Functions secret 注入，本地不经手）
      const params = new URLSearchParams();
      Object.keys(queryParams).forEach(function (k) {
        if (queryParams[k] != null) params.set(k, String(queryParams[k]));
      });
      const baseUrl = relayPath + '/' + endpoint + '?' + params.toString();

      const options = {
        hostname: relayHost,
        port: 443,
        path: baseUrl,
        method: 'GET',   // 上游接口均为 GET
        headers: {
          'User-Agent': 'DeltaForcePriceQuery/1.0',
          'Accept': 'application/json',
          // 声明 localhost 来源：线上 isAuthorizedOrigin 放行本机来源，
          // 且带 Origin 的请求按浏览器跨源调用处理，不触及 X-Proxy-Key 校验
          'Origin': `http://localhost:${opts.port}`,
          'X-Client-Id': getClientId(req)
        }
      };

      console.log(`[API代理] ${req.url} → https://${relayHost}${baseUrl}`);

      let responded = false;
      // ★ signal 必须挂到 request options 上，否则 abort() 只是个空操作：
      //   上游悬挂时请求永不返回，页面侧 fetch 又只能等到自身 25s 超时，
      //   中间这几十秒连接被占住，表现为「一直转圈不出数据」。
      // socket.setTimeout 只覆盖拿到 socket 之后的空闲期，DNS/connect 悬挂阶段不生效，
      // 所以以 AbortSignal 为主、socket 超时为辅。
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), RELAY_TIMEOUT_MS);
      options.signal = controller.signal;
      const proxyReq = https.request(options, (proxyRes) => {
        let body = '';
        proxyRes.on('data', chunk => body += chunk);
        proxyRes.on('end', () => {
          clearTimeout(timeoutId);
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
        clearTimeout(timeoutId);
        if (responded) return;
        responded = true;
        if (controller.signal.aborted) {
          console.error(`[API代理] 超时(${RELAY_TIMEOUT_MS / 1000}s)`);
          res.writeHead(504);
          res.end(JSON.stringify({ code: -1, msg: '代理请求超时' }));
          return;
        }
        console.error(`[API代理] 错误: ${err.message}`);
        res.writeHead(502);
        res.end(JSON.stringify({ code: -1, msg: '代理请求失败: ' + err.message }));
      });

      // 兜底：已建立连接后长时间无数据也主动断开（AbortSignal 已覆盖整体上限，
      // 这里防止「首字节到了但 body 卡住」时白等满 22s）
      proxyReq.setTimeout(RELAY_TIMEOUT_MS, () => {
        proxyReq.destroy(new Error('socket timeout'));
      });

      proxyReq.end();
    }

    if (req.method === 'POST') {
      collectBody(req, forward);
    } else {
      forward('');
    }
  };
}

module.exports = { createProxyApi };
