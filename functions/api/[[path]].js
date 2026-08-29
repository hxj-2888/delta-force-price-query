// ===== functions/api/[[path]].js — Cloudflare Pages API 代理 =====
// 功能清单: API代理(转发到上游orzice.com) | 元数据查询(/api/metadata,KV+静态回退) | 价格历史(/api/history/:id,D1)
// CORS处理 | 来源鉴权(isAuthorizedOrigin) | 路径校验 | 超时控制(item_price_all:25s/其他:15s)
// 依赖: Cloudflare KV(METADATA_KV) D1(price_history表) 环境变量(API_TOKEN)
// 改动影响: 修改API_TOKEN→影响所有API代理; 修改上游URL→影响数据来源; 修改缓存头→影响CDN行为

const API_HOST = 'orzice.com';
const API_PATH = '/workApi/v1/sjz_api';

// ★ 上游 API Token — 必须在 Cloudflare Dashboard 中设置 API_TOKEN 环境变量

// ========== 限流（双层） ==========
// 第一层: 内存计数, 每 isolate 生效, 拦截绝大多数高频滥用（快, 零额外 IO）
// 第二层: D1 原子 UPSERT 全局窗口计数, 跨边缘节点统一阈值（按分钟窗口）
//         D1 故障/未绑定时自动降级, 只靠第一层兜底, 不影响可用性。
//         规范实现见 scripts/rate-limit.cjs, 改动时请同步各副本。
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX_PER_IP = 120;   // 每 IP 每分钟
const RATE_MAX_GLOBAL = 600;   // 全局每分钟（跨节点, D1 计数）
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

// 全局限流: D1 原子计数, 返回 true=放行
// 窗口 = 'g' + 北京时间 yyyyMMddHHmm, 旧行每次检查顺带清理（概率 1/20, 控制 D1 写放大）
async function checkGlobalRateLimitDB(db) {
  if (!db) return true; // D1 未绑定 → 降级
  try {
    const bj = new Date(Date.now() + 8 * 3600 * 1000);
    const win = 'g' + bj.toISOString().replace(/[-:TZ.]/g, '').slice(0, 12);
    const { results } = await db.prepare(`
      INSERT INTO rate_limit_window (win, n) VALUES (?1, 1)
      ON CONFLICT(win) DO UPDATE SET n = n + 1
      RETURNING n
    `).bind(win).all();
    const n = results && results[0] ? results[0].n : 0;
    if (Math.random() < 0.05) {
      db.prepare("DELETE FROM rate_limit_window WHERE win < ?1").bind('g' + win.slice(1)).run().catch(() => {});
    }
    return n <= RATE_MAX_GLOBAL;
  } catch (e) {
    // 表不存在或 D1 临时故障: 不阻塞业务, 降级为仅内存限流
    console.warn('[ratelimit] D1 全局限流降级:', e.message);
    return true;
  }
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

// ========== 脚本调用鉴权（审计 M1，2026-08-29）==========
// 背景：isAuthorizedOrigin 对【无 Origin】的请求一律放行——这是刻意为之，
//   scripts/generate-metadata.js（Node）与 workers/cron 都靠无 Origin 调用。
//   但它同时意味着任何人都可写脚本循环调用本代理，持续消耗上游 API_TOKEN 配额，
//   而限流（120 次/分钟/IP）只需换 IP 即可绕过。
// 方案：引入可选环境变量 PROXY_KEY，只约束「非浏览器发起的脚本调用」：
//   - 未配置 → 放行（平滑升级，不会因漏配 Secret 导致 CI 全挂）；
//   - 已配置 → 非浏览器请求必须带 X-Proxy-Key 头且完全匹配，否则 403。
//
// ★ 关键：判断依据不能是「是否有 Origin 头」。按 Fetch 规范，浏览器**同源 GET/HEAD
//   请求不发送 Origin 头**（只有跨源请求与同源非 GET 才带）。若按有无 Origin 判断，
//   正常用户的同源 GET（如 /api/metadata）会被误当成脚本调用挡掉（实测 403）。
//   正确区分浏览器请求靠 Sec-Fetch-* 系列头：浏览器强制添加、页面 JS 无法伪造，
//   curl / Node / CI 脚本不会带。见 isBrowserRequest。
function isBrowserRequest(request) {
  if (request.headers.get('origin')) return true; // 跨源请求（CORS）
  const site = request.headers.get('sec-fetch-site');
  if (site) return site !== 'none';               // same-origin / same-site → 浏览器
  // 无 Sec-Fetch-* 的老浏览器兼容兜底：UA + Accept-Language 组合（弱证据）
  const ua = request.headers.get('user-agent') || '';
  return /^Mozilla\//i.test(ua) && !!request.headers.get('accept-language');
}

function checkScriptAccess(request, env) {
  if (isBrowserRequest(request)) return null;     // 浏览器请求：不施加脚本密钥要求
  const key = (env && env.PROXY_KEY ? env.PROXY_KEY : '').trim();
  if (!key) return null;                          // 未启用：维持原有行为
  if (request.headers.get('x-proxy-key') === key) return null;
  return new Response(JSON.stringify({ code: -1, msg: '未授权的脚本调用' }), {
    status: 403,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
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
  // 第一层内存拦截高频; 第二层 D1 全局窗口计数兜底跨节点绕过
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  if (!checkRateLimit(ip)) {
    return new Response(JSON.stringify({ code: -1, msg: '请求过于频繁, 请稍后再试' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': '60' },
    });
  }
  if (!await checkGlobalRateLimitDB(env.DB)) {
    return new Response(JSON.stringify({ code: -1, msg: '当前请求量较大, 请稍后再试' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': '60' },
    });
  }

  // ─── 来源校验 ───
  // ★ 位置很关键：必须排在 /api/metadata 与 /api/history/:id 之前。
  //   原实现把它放在这两个业务分支之后，导致它们对任意站点开放（跨站浏览器可直接读取 D1 历史）。
  //   注意语义：isAuthorizedOrigin 对【无 Origin】的服务端请求放行（curl / CI 脚本 / Cron Worker），
  //   因此本校验的作用是「拒绝跨站浏览器读取」，不能阻止脚本化调用——后者由限流与 WAF 规则兜底。
  //   也正因如此，上移校验不会影响 scripts/generate-metadata.js 与 workers/cron（它们无 Origin）。
  if (!isAuthorizedOrigin(request)) {
    return new Response(JSON.stringify({ code: -1, msg: '未授权的来源' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  // 审计 M1:脚本调用鉴权（无 Origin 请求需 X-Proxy-Key，未配置 PROXY_KEY 时不启用）
  const scriptDenied = checkScriptAccess(request, env);
  if (scriptDenied) return scriptDenied;

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

  // endpoint 枚举白名单（安全审计 2026-08-29）：host 固定后仍不希望本代理+token 可调上游任意子路径，
  // 只放行业务实际使用的接口；新增上游接口时在此登记
  const ALLOWED_ENDPOINTS = ['item_list', 'item_price_all'];
  if (!ALLOWED_ENDPOINTS.includes(endpoint)) {
    return new Response(JSON.stringify({ code: -1, msg: '不支持的 endpoint' }), {
      status: 403,
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
