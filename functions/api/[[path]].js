// ===== functions/api/[[path]].js — Cloudflare Pages API 代理（路由派发层） =====
// 功能清单: API代理(转发到上游orzice.com) | 元数据查询(/api/metadata,KV+静态回退) | 价格历史(/api/history/:id,D1)
//           心跳(/api/cron-status) | CORS处理 | 来源鉴权 | 超时控制(item_price_all:25s/其他:15s)
// 限流三层: 每 IP(内存) + 全局(D1) + 每客户端 X-Client-Id(内存+D1)
// 依赖: Cloudflare KV(METADATA_KV) D1(price_history/rate_limit_window/rate_limit_client表) 环境变量(API_TOKEN)
// 改动影响: 修改API_TOKEN→影响所有API代理; 修改上游URL→影响数据来源; 修改缓存头→影响CDN行为
//
// ★ 本文件只保留「限流 + 鉴权 + 路由派发」流水线，业务实现在 lib/（与桌面版共享的部分）
//   与 lib/handlers/（云端专属）。流水线顺序有安全语义，调整前先读 test/rate-limit.test.mjs
//   的流水线顺序守卫与下方各步骤注释。

// 限流阈值与内存计数器来自唯一实现 scripts/rate-limit.cjs（与桌面版 server.js 共用，
// 改阈值只改该文件 DEFAULTS）。部署白名单（tools/deploy-pages.cjs）必须携带
// scripts/rate-limit.cjs 与 lib/ ——暂存目录缺它们函数打包直接失败。
import {
  CLIENT_ID_RE,
  DEFAULTS,
  createPerKeyLimiter,
  createRateLimiter,
} from '../../scripts/rate-limit.cjs';
import { isAuthorizedOrigin, checkScriptAccess } from '../../lib/api-auth.cjs';
import { jsonResponse } from '../../lib/api-response.cjs';
import { checkGlobalRateLimitDB, checkClientRateLimitDB } from '../../lib/rate-limit-d1.cjs';
import { handleCronStatus } from '../../lib/handlers/cron-status.cjs';
import { handleMetadata } from '../../lib/handlers/metadata.cjs';
import { handleHistoryRequest } from '../../lib/handlers/history.cjs';
import { handleProxy } from '../../lib/handlers/proxy.cjs';

// ========== 限流（三层） ==========
// 第一层: 每 IP 内存计数, 每 isolate 生效, 拦截绝大多数高频滥用（快, 零额外 IO）
// 第二层: D1 原子 UPSERT 全局窗口计数, 跨边缘节点统一阈值（按分钟窗口）
// 第三层: 每客户端 X-Client-Id 内存 + D1 计数（「同账号」维度, 防脚本刷）
// D1 层故障/未绑定时自动降级为仅内存, 不影响可用性。
const checkRateLimit = createRateLimiter(DEFAULTS);
const checkClientRateLimitMem = createPerKeyLimiter({
  windowMs: DEFAULTS.windowMs,
  maxPerKey: DEFAULTS.maxPerClient,
});

function normalizeClientId(raw) {
  const id = (raw || '').trim();
  return CLIENT_ID_RE.test(id) ? id : null;
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
    return jsonResponse({ code: -1, msg: '请求过于频繁, 请稍后再试' }, 429, { 'Retry-After': '60' });
  }
  if (!await checkGlobalRateLimitDB(env.DB)) {
    return jsonResponse({ code: -1, msg: '当前请求量较大, 请稍后再试' }, 429, { 'Retry-After': '60' });
  }

  // 第三层: 按客户端跨节点计数（带合法 X-Client-Id 的请求才进入; 防单客户端刷量）
  const clientId = normalizeClientId(request.headers.get('x-client-id'));
  if (clientId && !checkClientRateLimitMem(clientId)) {
    return jsonResponse({ code: -1, msg: '当前客户端请求过于频繁, 请稍后再试' }, 429, { 'Retry-After': '60' });
  }
  if (clientId && !await checkClientRateLimitDB(env.DB, clientId)) {
    return jsonResponse({ code: -1, msg: '当前客户端请求过于频繁, 请稍后再试' }, 429, { 'Retry-After': '60' });
  }

  // ─── Cron 采集心跳 /api/cron-status ───
  // ★ 刻意放在来源鉴权与脚本鉴权之前：需允许 curl / Uptime 监控（无 Origin、无 X-Proxy-Key）直接探测。
  //   仅暴露采集时间戳与物品数，无敏感数据。仅读 KV，一次 GET 不触上游。
  // 背景：2026-08-30~09-23 Cron 因上游 token 失效静默失败 25 天无人察觉（backfill 仅 3 天）。
  if (url.pathname === '/api/cron-status' && request.method === 'GET') {
    return handleCronStatus(env);
  }

  // ─── 来源校验 ───
  // ★ 位置很关键：必须排在 /api/metadata 与 /api/history/:id 之前。
  //   原实现把它放在这两个业务分支之后，导致它们对任意站点开放（跨站浏览器可直接读取 D1 历史）。
  //   注意语义：isAuthorizedOrigin 对【无 Origin】的服务端请求放行（curl / CI 脚本 / Cron Worker），
  //   因此本校验的作用是「拒绝跨站浏览器读取」，不能阻止脚本化调用——后者由限流与 WAF 规则兜底。
  //   也正因如此，上移校验不会影响 scripts/generate-metadata.js 与 workers/cron（它们无 Origin）。
  if (!isAuthorizedOrigin(request)) {
    return jsonResponse({ code: -1, msg: '未授权的来源' }, 403);
  }

  // 审计 M1:脚本调用鉴权（无 Origin 请求需 X-Proxy-Key，未配置 PROXY_KEY 时不启用）
  const scriptDenied = checkScriptAccess(request, env);
  if (scriptDenied) return scriptDenied;

  // ─── 元数据查询 /api/metadata ───
  if (url.pathname === '/api/metadata' && request.method === 'GET') {
    return handleMetadata(request, env);
  }

  // ─── 价格历史查询 /api/history/:itemId ───
  const historyMatch = url.pathname.match(/^\/api\/history\/(\d+)$/);
  if (historyMatch) {
    return handleHistoryRequest(env, parseInt(historyMatch[1], 10));
  }

  // ─── 其余 /api/* → 上游代理（endpoint 解析与白名单在 handler 内） ───
  return handleProxy(request, env, url);
}
