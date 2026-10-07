'use strict';
// ===== 来源校验 / 客户端 IP（桌面版，Node IncomingMessage API） =====
// 与云端 lib/api-auth.cjs 策略**有意不同**：本地只放行 localhost 来源（本机中继
// 不对局域网/外网开放），云端放行「站点自身 origin」。不要为"去重"合并它们。

// 来源校验：只允许本机页面调用（防止恶意网页借用本地中继代理）
function isAuthorizedOrigin(req) {
  // 浏览器跨站请求直接拒绝（Fetch Metadata 头 JS 不可伪造）
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  const origin = req.headers['origin'] || '';
  // 无 Origin（同源 GET / 本机 curl）放行
  if (!origin) return true;
  // 仅放行 localhost / 127.0.0.1 来源
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function getClientIp(req) {
  // 本地服务器仅绑定 127.0.0.1，remoteAddress 恒为本机回环地址；
  // 不读取 x-forwarded-for：该头可被本机任意进程伪造（每次换 IP 绕开 per-IP 限流）
  return req.socket.remoteAddress || 'unknown';
}

module.exports = { isAuthorizedOrigin, getClientIp };
