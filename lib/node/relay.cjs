'use strict';
// ===== 通用中继（桌面版）：GET 请求转发到线上 Pages 部署 =====
// 带 localhost Origin 通过其来源鉴权，且按浏览器调用处理（不触发 X-Proxy-Key）。

const https = require('https');
const { getClientId } = require('./client-id.cjs');

// onError：中继失败时的降级回调（如历史端点降级为本地快照提示），不传则返回 502/504。
function createRelay({ relayHost, port }) {
  function relayGet(req, res, targetPath, onError) {
    const options = {
      hostname: relayHost,
      port: 443,
      path: targetPath,
      method: 'GET',
      headers: {
        'User-Agent': 'DeltaForcePriceQuery/1.0',
        'Accept': 'application/json',
        'Origin': `http://localhost:${port}`,
        'X-Client-Id': getClientId(req)
      }
    };
    console.log(`[API中继] ${req.url} → https://${relayHost}${targetPath}`);
    let responded = false;
    // 用 AbortSignal 而非 socket setTimeout：后者在 DNS/connect 悬挂阶段不生效，
    // 会让请求永远等不到回调（测试与桌面版都被此坑过）
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
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
          'Cache-Control': 'no-store'
        });
        res.end(body);
        console.log(`[API中继] 响应 ${proxyRes.statusCode}, ${body.length} 字节`);
      });
    });
    proxyReq.on('error', (err) => {
      clearTimeout(timeoutId);
      if (responded) return;
      responded = true;
      if (controller.signal.aborted) {
        console.error('[API中继] 超时(15s)');
        if (onError) { onError(new Error('timeout')); return; }
        res.writeHead(504);
        res.end(JSON.stringify({ code: -1, msg: '中继请求超时' }));
        return;
      }
      console.error(`[API中继] 错误: ${err.message}`);
      if (onError) { onError(err); return; }
      res.writeHead(502);
      res.end(JSON.stringify({ code: -1, msg: '中继请求失败: ' + err.message }));
    });
    proxyReq.end();
  }

  return { relayGet };
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

module.exports = { createRelay, serveHistoryUnavailable };
