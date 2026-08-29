// ===== functions/index.js — 移动端缓存破除（根路径重定向） =====
// 功能: 拦截 / 和 /index.html → 302 重定向到 /?v=VERSION
// 手机浏览器(微信/QQ/UC)无视Cache-Control头,但对新URL会重新请求
// VERSION 由 scripts/build.js 在每次构建时自动更新
// 依赖: 无 | 改动影响: 修改VERSION→强制所有客户端重新加载

export const VERSION = 'v20260829p';

export async function onRequest(context) {
  const url = new URL(context.request.url);

  // 仅处理根路径和 index.html
  if (url.pathname !== '/' && url.pathname !== '/index.html') {
    return context.next();
  }

  // 已有版本参数 → 放行到静态 index.html
  if (url.searchParams.has('v')) {
    const resp = await context.next();
    // 追加最强缓存禁用头（即使 _headers 已设，这里再确保一次）
    const headers = new Headers(resp.headers);
    headers.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    headers.set('CDN-Cache-Control', 'no-store');
    headers.set('Surrogate-Control', 'no-store');
    headers.set('Pragma', 'no-cache');
    headers.set('Expires', '0');
    return new Response(resp.body, { status: resp.status, headers });
  }

  // 无版本参数 → 302 重定向到版本化 URL
  url.searchParams.set('v', VERSION);
  return Response.redirect(url.toString(), 302);
}
