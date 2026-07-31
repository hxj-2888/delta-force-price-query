// ===== functions/api/[[path]].js — Cloudflare Pages API 代理 =====
// 功能清单: API代理(转发到上游orzice.com) | 元数据查询(/api/metadata,KV+静态回退) | 价格历史(/api/history/:id,D1)
// CORS处理 | 来源鉴权(isAuthorizedOrigin) | 路径校验 | 超时控制(item_price_all:25s/其他:15s)
// 依赖: Cloudflare KV(METADATA_KV) D1(price_history表) 环境变量(API_TOKEN)
// 改动影响: 修改API_TOKEN→影响所有API代理; 修改上游URL→影响数据来源; 修改缓存头→影响CDN行为

const API_HOST = 'orzice.com';
const API_PATH = '/workApi/v1/sjz_api';

// ★ 上游 API Token — 必须在 Cloudflare Dashboard 中设置 API_TOKEN 环境变量

// ========== HTTP 请求处理 ==========

function isAuthorizedOrigin(request) {
  const siteOrigin = new URL(request.url).origin;
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
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

  // ─── 元数据查询 /api/metadata ───
  if (url.pathname === '/api/metadata' && request.method === 'GET') {
    try {
      // 优先从 KV 读取（Cron Worker 每周更新）
      if (env && env.METADATA_KV) {
        const kvData = await env.METADATA_KV.get('metadata', 'json');
        if (kvData && Object.keys(kvData).length > 0) {
          return new Response(JSON.stringify(kvData), {
            status: 200,
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'public, max-age=1800, s-maxage=1800',
            },
          });
        }
      }
    } catch (e) {
      console.warn('[metadata] KV 读取失败:', e.message);
    }

    // KV 为空或不可用：回退读取打包的静态文件
    try {
      const staticUrl = new URL('/data/metadata.json', request.url);
      const staticResp = await fetch(staticUrl);
      if (staticResp.ok) {
        const body = await staticResp.text();
        return new Response(body, {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=1800, s-maxage=1800',
          },
        });
      }
    } catch (e) {
      console.warn('[metadata] 静态文件回退失败:', e.message);
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
        AND recorded_date >= date('now', '-30 days')
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
