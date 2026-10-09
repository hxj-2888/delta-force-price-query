// ===== 小程序统一配置 =====
// ★ 发布前必读（重要）:
//   1. 微信要求 request 合法域名必须为 HTTPS 且完成 ICP 备案。
//      *.pages.dev 等海外域名无法备案, 不能加入白名单, 真机正式版无法请求。
//   2. 请把下方 API_BASE 改成你自己的已备案 HTTPS 域名,
//      例如: 将已备案域名 CNAME 到 Cloudflare Pages, 或用国内服务器/CDN 反向代理 /api/*。
//   3. 然后在微信公众平台「开发 → 开发设置 → 服务器域名 → request 合法域名」添加该域名。
//   4. 开发阶段可在微信开发者工具勾选「不校验合法域名...」, 或真机打开调试模式临时联调。

module.exports = {
  // ★ 生产 API 域名（指向该域名的 /api/proxy）
  API_BASE: 'https://delta-force-v5.pages.dev',
  // 请求超时（毫秒）
  REQUEST_TIMEOUT: 25000
};
