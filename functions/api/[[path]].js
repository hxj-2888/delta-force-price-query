// Cloudflare Pages Function — API 代理
// 路由: /api/* → 转发到 orzice.com

const API_HOST = 'orzice.com';
const API_PATH = '/workApi/v1/sjz_api';

export async function onRequest(context) {
  const { request, env } = context;

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

  try {
    const url = new URL(request.url);
    let apiPath = url.pathname.replace(/^\/api/, '').replace(/\/{2,}/g, '/');

    // 路径校验
    if (!/^(\/[a-zA-Z0-9_\-/]*)?$/.test(apiPath)) {
      return new Response(JSON.stringify({ code: -1, msg: '非法路径' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const token = (env.API_TOKEN || '').trim();
    if (!token) {
      return new Response(JSON.stringify({ code: -1, msg: 'API_TOKEN 未配置' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // 构建上游 URL（token 附加到 query string）
    const params = new URLSearchParams(url.search);
    params.set('token', token);
    const targetUrl = `https://${API_HOST}${API_PATH}${apiPath}?${params.toString()}`;

    console.log(`[API代理] ${url.pathname} → upstream`);

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
