#!/usr/bin/env node
// ===== server.js — Node.js 本地服务器（组装根：配置 + 路由 + 启动） =====
// 功能清单: 静态文件服务(lib/node/static) | API中继(lib/node/relay) | API代理(lib/node/proxy)
//           本地端点(lib/node/endpoints) | 客户端ID(lib/node/client-id) | 来源校验/限流(security+rate-limit)
// 启动: node server.js | 访问: http://127.0.0.1:3000（仅绑定回环地址, 不对外网暴露）
// 依赖: Node.js 内置模块 + lib/node/* + scripts/rate-limit.cjs（限流唯一实现）
// 被依赖: 无(独立运行) | 测试: test/server.test.mjs（spawn 本文件）
// 改动影响: 修改端口→影响启动脚本; 修改路由顺序→影响端点语义; 修改中继逻辑→影响桌面版用户

const http = require('http');
const path = require('path');
const { createRateLimiter, DEFAULTS } = require('./scripts/rate-limit.cjs');
const { getClientId } = require('./lib/node/client-id.cjs');
const { isAuthorizedOrigin, getClientIp } = require('./lib/node/security.cjs');
const { createRelay, serveHistoryUnavailable } = require('./lib/node/relay.cjs');
const { createProxyApi } = require('./lib/node/proxy.cjs');
const { serveMetadata } = require('./lib/node/endpoints.cjs');
const { serveFile, serveStatic } = require('./lib/node/static.cjs');

const PORT = Number(process.env.PORT || 3000);
// 中继模式（2026-09-27）：本地不再持有 API_TOKEN，/api/* 统一中继到线上 Pages 部署，
// 由其 Cloudflare Functions 用 secret 中的 API_TOKEN 调用上游 orzice.com。
// 线上鉴权已核实放行 localhost 来源（lib/api-auth.cjs isAuthorizedOrigin），
// 且带 Origin 的请求按浏览器调用处理，不触发 X-Proxy-Key 校验。
const RELAY_HOST = process.env.RELAY_HOST || 'delta-force-v5.pages.dev';
const RELAY_PATH = '/api';
const ROOT = __dirname;

// ===== 简单内存限流（单机使用, 防止本机页面/脚本刷上游配额） =====
// 逻辑见 scripts/rate-limit.cjs（唯一实现），可通过环境变量覆盖阈值（测试用）
const checkRateLimit = createRateLimiter({
  windowMs: Number(process.env.RATE_WINDOW_MS || DEFAULTS.windowMs),
  maxPerIp: Number(process.env.RATE_MAX_PER_IP || DEFAULTS.maxPerIp),
  maxGlobal: Number(process.env.RATE_MAX_GLOBAL || DEFAULTS.maxGlobal)
});

const { relayGet } = createRelay({ relayHost: RELAY_HOST, port: PORT });
const proxyApi = createProxyApi({ relayHost: RELAY_HOST, relayPath: RELAY_PATH, port: PORT, checkRateLimit });

// 来源校验通过 + 未超限 → 放行；否则写 403/429（本地端点共用的前置检查）
function authorizeAndLimit(req, res) {
  if (!isAuthorizedOrigin(req)) {
    res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ code: -1, msg: '未授权的来源' }));
    return false;
  }
  if (!checkRateLimit(getClientIp(req))) {
    res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': '60' });
    res.end(JSON.stringify({ code: -1, msg: '请求过于频繁, 请稍后再试' }));
    return false;
  }
  return true;
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
    if (!authorizeAndLimit(req, res)) return;
    return serveMetadata(res, ROOT);
  }

  // 价格历史（后端 D1 记录）：中继到线上 /api/history/:id；线上不可用时降级本地快照
  const historyMatch = pathname.match(/^\/api\/history\/(\d+)$/);
  if (historyMatch && req.method === 'GET') {
    if (!authorizeAndLimit(req, res)) return;
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
    return serveFile(res, path.join(ROOT, 'index.html'));
  }

  // 其他静态文件（路径消毒 + 敏感文件黑名单，见 lib/node/static.cjs）
  return serveStatic(res, req.url, ROOT);
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
  console.log(`  API 中继: /api/* → https://${RELAY_HOST}/api/*`);
  console.log('');
  console.log('  按 Ctrl+C 停止服务器');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});
