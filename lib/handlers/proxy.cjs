'use strict';
// ===== /api/* 兜底 —— 上游代理（item_list / item_price_all） =====
// 上游 API Token 只存在于 Cloudflare 环境变量 API_TOKEN，本代理是它唯一的消费方。

const { jsonResponse } = require('../api-response.cjs');

const API_HOST = 'orzice.com';
const API_PATH = '/workApi/v1/sjz_api';

// endpoint 枚举白名单（安全审计 2026-08-29）：host 固定后仍不希望本代理+token 可调上游任意子路径，
// 只放行业务实际使用的接口；新增上游接口时在此登记
const ALLOWED_ENDPOINTS = ['item_list', 'item_price_all'];

async function handleProxy(request, env, url) {
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
    return jsonResponse({ code: -1, msg: '非法路径' }, 400, { 'Access-Control-Allow-Origin': '*' });
  }

  if (!ALLOWED_ENDPOINTS.includes(endpoint)) {
    return jsonResponse({ code: -1, msg: '不支持的 endpoint' }, 403, { 'Access-Control-Allow-Origin': '*' });
  }

  // ─── 构建上游 URL ───
  const token = (env.API_TOKEN || '').trim();
  if (!token) {
    return jsonResponse({ code: -1, msg: '服务端 API_TOKEN 未配置' }, 500, { 'Access-Control-Allow-Origin': '*' });
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
      return jsonResponse({ code: -1, msg: `上游 API 返回 ${upstream.status}` }, 502, { 'Access-Control-Allow-Origin': '*' });
    }

    const body = await upstream.text();
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        // ★ 简短缓存：CDN 最多缓存 60 秒，确保用户快速收到版本更新
        'Cache-Control': 'public, max-age=60, s-maxage=60',
      },
    });
  } catch (err) {
    console.error('[API代理错误]', err.message);
    return jsonResponse({ code: -1, msg: '代理请求失败: ' + err.message }, 502, { 'Access-Control-Allow-Origin': '*' });
  }
}

module.exports = { handleProxy };
