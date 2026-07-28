// API 代理 + 价格历史
// 路由:
//   /api/proxy       → 解析 POST body { endpoint, params } 转发到 orzice.com
//   /api/history/:id → 从 D1 读取该物品的历史价格
// Cron:
//   每天 6:00 (UTC 22:00) 自动拉取全量价格写入 D1

const API_HOST = 'orzice.com';
const API_PATH = '/workApi/v1/sjz_api';

// ========== HTTP 请求处理 ==========

/**
 * ★ 来源校验：仅允许同源（部署站点自身）与本地开发环境调用代理
 * 阻止第三方站点通过浏览器 fetch 盗用 API_TOKEN
 * 浏览器跨站请求由 Sec-Fetch-Site / Origin 拦截（Fetch Metadata 头 JS 不可伪造）；
 * 针对 curl/脚本类滥用，建议在 Cloudflare 后台叠加 Rate Limiting 规则。
 */
function isAuthorizedOrigin(request) {
  const siteOrigin = new URL(request.url).origin;
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  // 浏览器跨站请求直接拒绝
  if (fetchSite === 'cross-site') return false;
  // 同源 / 用户直接发起 / 无 Origin（Service Worker / 服务端）放行
  if (!origin) return true;
  if (origin === siteOrigin) return true;
  // 本地开发环境
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

  // ─── 价格历史查询 /api/history/:itemId ───
  const historyMatch = url.pathname.match(/^\/api\/history\/(\d+)$/);
  if (historyMatch) {
    return handleHistoryRequest(env, parseInt(historyMatch[1], 10));
  }

  // ─── API 代理：解析 POST body { endpoint, params } → 转发上游 ───
  // ★ 防开放代理：仅允许同源请求，阻止第三方站点盗用 API_TOKEN
  if (!isAuthorizedOrigin(request)) {
    return new Response(JSON.stringify({ code: -1, msg: '未授权的来源' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  try {
    const token = (env.API_TOKEN || '').trim();
    if (!token) {
      return new Response(JSON.stringify({ code: -1, msg: 'API_TOKEN 未配置' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // ★ 解析客户端 POST body，提取 endpoint 和 params
    let endpoint = '';
    let queryParams = {};
    if (request.method === 'POST') {
      try {
        const reqBody = await request.json().catch(() => ({}));
        endpoint = reqBody.endpoint || '';
        queryParams = reqBody.params || {};
      } catch (_) { /* body 解析失败，fallback 到 URL path */ }
    }

    // Fallback：如果 POST body 没有 endpoint，从 URL path 推导
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

    // ★ 构建上游 URL：/workApi/v1/sjz_api/{endpoint}?{params}&token=...
    const params = new URLSearchParams();
    Object.keys(queryParams).forEach(key => {
      params.set(key, queryParams[key]);
    });
    // 也传递原始 URL 上的查询参数（如果有）
    url.searchParams.forEach((value, key) => {
      if (!params.has(key)) params.set(key, value);
    });
    params.set('token', token);
    const targetUrl = `https://${API_HOST}${API_PATH}/${endpoint}?${params.toString()}`;

    console.log(`[API代理] /api/proxy → ${endpoint} (params: ${Object.keys(queryParams).join(',')})`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const upstream = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'DeltaForcePriceQuery/1.0',
        'Accept': 'application/json',
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
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=120, s-maxage=600',
      },
    });
  } catch (err) {
    console.error('[API代理错误]', err.message, err.stack);
    return new Response(JSON.stringify({ code: -1, msg: '代理请求失败: ' + err.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
    });
  }
}

// ========== 价格历史查询 ==========

async function handleHistoryRequest(env, itemId) {
  if (!env.DB) {
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
      ORDER BY recorded_date DESC
      LIMIT 30
    `).bind(itemId).all();

    const snapshots = results.map(r => ({
      d: r.d,
      p: r.price,
    }));

    return new Response(JSON.stringify({
      code: 0,
      data: {
        itemId: itemId,
        name: snapshots.length > 0 ? results[0].name : '',
        snapshots: snapshots,
      },
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
