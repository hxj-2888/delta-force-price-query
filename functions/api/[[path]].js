// ===== functions/api/[[path]].js — Cloudflare Pages API 代理 =====
// 功能清单: API代理(转发到上游orzice.com) | 元数据查询(/api/metadata,KV+静态回退) | 价格历史(/api/history/:id,D1)
// CORS处理 | 来源鉴权(isAuthorizedOrigin) | 路径校验 | 超时控制(item_price_all:25s/其他:15s)
// 依赖: Cloudflare KV(METADATA_KV) D1(price_history表) 环境变量(API_TOKEN)
// 改动影响: 修改API_TOKEN→影响所有API代理; 修改上游URL→影响数据来源; 修改缓存头→影响CDN行为

const API_HOST = 'orzice.com';
const API_PATH = '/workApi/v1/sjz_api';

// ★ 上游 API Token — 必须在 Cloudflare Dashboard 中设置 API_TOKEN 环境变量

// ========== 简单内存限流 ==========
// 说明: 模块级计数器按 isolate 生效, 各边缘节点独立统计; 对个人工具足够,
//       如需跨节点全局限流, 可改用 CF Rate Limiting 或 KV 计数。
//       规范实现见 scripts/rate-limit.cjs, 改动时请同步三处副本。
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX_PER_IP = 120;   // 每 IP 每分钟
const RATE_MAX_GLOBAL = 600;   // 每 isolate 每分钟
const rateWindows = new Map();
let rateGlobal = [];

function checkRateLimit(ip) {
  const now = Date.now();

  // 清理过期窗口
  for (const [key, entry] of rateWindows) {
    if (now - entry.ts > RATE_WINDOW_MS) rateWindows.delete(key);
  }
  rateGlobal = rateGlobal.filter(t => now - t < RATE_WINDOW_MS);

  const entry = rateWindows.get(ip) || { ts: now, count: 0 };
  entry.count++;
  rateWindows.set(ip, entry);

  if (entry.count > RATE_MAX_PER_IP || rateGlobal.length >= RATE_MAX_GLOBAL) {
    return false;
  }
  rateGlobal.push(now);
  return true;
}

// ========== HTTP 请求处理 ==========

function isAuthorizedOrigin(request) {
  const siteOrigin = new URL(request.url).origin;
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  // 浏览器跨站请求直接拒绝（Fetch Metadata 头 JS 不可伪造）
  if (fetchSite === 'cross-site') return false;
  if (!origin) return true;
  if (origin === siteOrigin) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return false;
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // CORS 预检
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // 限流（保护上游配额, 防止代理被爬虫/脚本滥用）
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  if (!checkRateLimit(ip)) {
    return new Response(JSON.stringify({ code: -1, msg: '请求过于频繁, 请稍后再试' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': '60' },
    });
  }

  // ─── 元数据查询 /api/metadata ───
  // ★ 合并策略: KV（Cron 增量更新, 含新物品）∪ 静态文件（全量基线 data/metadata.json）
  //   这样即使 KV 只有部分数据, 也由静态文件补全缺失条目, 元数据始终完整
  if (url.pathname === '/api/metadata' && request.method === 'GET') {
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
      return new Response(JSON.stringify(merged), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=1800, s-maxage=1800',
        },
      });
    }

    // 所有来源都失败，返回空对象（客户端补全兜底）
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300',
      },
    });
  }

  // ─── 价格历史查询 /api/history/:itemId ───
  const historyMatch = url.pathname.match(/^\/api\/history\/(\d+)$/);
  if (historyMatch) {
    return handleHistoryRequest(env, parseInt(historyMatch[1], 10));
  }

  // ─── 来源校验 ───
  if (!isAuthorizedOrigin(request)) {
    return new Response(JSON.stringify({ code: -1, msg: '未授权的来源' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  // ─── 解析 endpoint 和 params ───
  let endpoint = '';
  let queryParams = {};

  if (request.method === 'POST') {
    try {
      const reqBody = await request.json().catch(() => ({}));
      endpoint = reqBody.endpoint || '';
      queryParams = reqBody.params || {};
    } catch (_) { /* fallback */ }
  }

  // GET 请求：从查询参数解析
  if (!endpoint && request.method === 'GET') {
    endpoint = url.searchParams.get('endpoint') || '';
    url.searchParams.forEach((value, key) => {
      if (key !== 'endpoint') queryParams[key] = value;
    });
  }

  // Fallback：URL path
  if (!endpoint) {
    endpoint = url.pathname.replace(/^\/api\/?/, '').replace(/\/{2,}/g, '/');
  }

  // 路径校验
  if (!/^[a-zA-Z0-9_\-/]*$/.test(endpoint)) {
    return new Response(JSON.stringify({ code: -1, msg: '非法路径' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
    });
  }

  // ─── 构建上游 URL ───
  const token = (env.API_TOKEN || '').trim();
  if (!token) {
    return new Response(JSON.stringify({ code: -1, msg: '服务端 API_TOKEN 未配置' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const upstreamParams = new URLSearchParams();
  Object.keys(queryParams).forEach(key => {
    upstreamParams.set(key, queryParams[key]);
  });
  upstreamParams.set('token', token);
  const targetUrl = `https://${API_HOST}${API_PATH}/${endpoint}?${upstreamParams.toString()}`;

  console.log(`[API代理] ${request.method} ${endpoint}`);

  try {
    const controller = new AbortController();
    const timeoutMs = endpoint === 'item_price_all' ? 25000 : 15000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const upstream = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'DeltaForcePriceQuery/1.0',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!upstream.ok) {
      return new Response(JSON.stringify({ code: -1, msg: `上游 API 返回 ${upstream.status}` }), {
        status: 502,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const body = await upstream.text();
    const respHeaders = {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      // ★ 简短缓存：CDN 最多缓存 60 秒，确保用户快速收到版本更新
      'Cache-Control': 'public, max-age=60, s-maxage=60',
    };

    return new Response(body, { status: 200, headers: respHeaders });
  } catch (err) {
    console.error('[API代理错误]', err.message);
    return new Response(JSON.stringify({ code: -1, msg: '代理请求失败: ' + err.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
    });
  }
}

// ========== 价格历史查询 ==========

async function handleHistoryRequest(env, itemId) {
  if (!env || !env.DB) {
    return new Response(JSON.stringify({ code: -1, msg: 'D1 数据库未绑定' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
    });
  }

  try {
    const { results } = await env.DB.prepare(`
      SELECT item_id  AS itemId,
             name,
             price,
             recorded_date AS d
      FROM price_history
      WHERE item_id = ?
        AND recorded_date >= date('now', '+8 hours', '-30 days')
      ORDER BY recorded_date DESC
      LIMIT 31
    `).bind(itemId).all();

    const snapshots = results.map(r => ({
      d: r.d,
      p: r.price,
    }));

    return new Response(JSON.stringify({
      code: 0,
      data: { itemId, name: snapshots.length > 0 ? results[0].name : '', snapshots },
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (err) {
    console.error('[历史查询错误]', err.message);
    return new Response(JSON.stringify({ code: -1, msg: '查询失败: ' + err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
