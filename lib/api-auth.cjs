'use strict';
// ===== 来源 / 脚本调用鉴权（Pages 函数专用，Request/Headers API） =====
// 桌面版 server.js 有自己的 Node 版校验（lib/node/security.cjs）——两者策略**有意不同**：
// 云端放行「站点自身 origin」，本地只放行 localhost。不要为"去重"合并它们。

// 来源校验：拒绝跨站浏览器读取（Fetch Metadata 头 JS 不可伪造）。
// 对【无 Origin】的服务端请求放行（curl / CI 脚本 / Cron Worker）——
// 因此它挡不住脚本化调用，后者由限流与 PROXY_KEY（checkScriptAccess）兜底。
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

module.exports = { isAuthorizedOrigin, isBrowserRequest, checkScriptAccess };
