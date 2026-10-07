'use strict';
// ===== 本地端点：与 Cloudflare Functions 对齐（本地自行实现，不走上游代理） =====
// 背景：云端提供 /api/metadata（KV∪静态）与 /api/history/:id（D1）。
// 本地没有 KV/D1，/api/metadata 若不在此本地实现，请求会掉进 proxyApi 的 URL path
// 兜底逻辑，被当成上游接口转发到线上 /api/metadata → 返回错误 JSON，
// 而 index.html 的预取脚本只 r.json() 不校验 code，于是全部物品名退化为「物品#ID」。

const fs = require('fs');
const path = require('path');

const _metadataCache = { mtimeMs: -1, body: null };

// rootDir = 仓库根（data/metadata.json 所在），由 server.js 传入而非模块内推导
function serveMetadata(res, rootDir) {
  const file = path.join(rootDir, 'data', 'metadata.json');
  try {
    const stat = fs.statSync(file);
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

module.exports = { serveMetadata };
