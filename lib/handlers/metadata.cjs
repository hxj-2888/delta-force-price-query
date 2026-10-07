'use strict';
// ===== GET /api/metadata —— 元数据查询 =====
// ★ 合并策略: KV（Cron 增量更新, 含新物品）∪ 静态文件（全量基线 data/metadata.json）
//   这样即使 KV 只有部分数据, 也由静态文件补全缺失条目, 元数据始终完整

const { jsonResponse } = require('../api-response.cjs');

async function handleMetadata(request, env) {
  let kvData = null;
  try {
    // 优先从 KV 读取（Cron Worker 更新）
    if (env && env.METADATA_KV) {
      const kvRaw = await env.METADATA_KV.get('metadata', 'json');
      if (kvRaw && typeof kvRaw === 'object' && Object.keys(kvRaw).length > 0) kvData = kvRaw;
    }
  } catch (e) {
    console.warn('[metadata] KV 读取失败:', e.message);
  }

  // 读取打包的静态全量元数据
  let staticData = null;
  try {
    const staticUrl = new URL('/data/metadata.json', request.url);
    const staticResp = await fetch(staticUrl);
    if (staticResp.ok) {
      const body = await staticResp.text();
      try { staticData = JSON.parse(body); } catch (e) { console.warn('[metadata] 静态文件 JSON 解析失败'); }
    }
  } catch (e) {
    console.warn('[metadata] 静态文件读取失败:', e.message);
  }

  // 合并：静态作基线，KV 覆盖同名 key 并补充新 key
  const merged = Object.assign({}, staticData || {}, kvData || {});

  if (Object.keys(merged).length > 0) {
    return jsonResponse(merged, 200, { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=1800, s-maxage=1800' });
  }

  // 所有来源都失败，返回空对象（客户端补全兜底）
  return jsonResponse({}, 200, { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=300' });
}

module.exports = { handleMetadata };
