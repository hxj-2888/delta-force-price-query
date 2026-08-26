'use strict';
// ===== 限流器（规范实现, server.js 引用） =====
// Cloudflare Pages 函数因平台打包限制保留内联副本
// （functions/api/[[path]].js），改动本文件后请同步该副本；
// test/rate-limit.test.mjs 会校验副本常量一致（server.js 直接引用本文件）。

const DEFAULTS = {
  windowMs: 60 * 1000,   // 统计窗口
  maxPerIp: 120,         // 每 IP 每分钟
  maxGlobal: 600         // 全局每分钟（单实例/单进程）
};

function createRateLimiter(opts) {
  const windowMs = opts.windowMs;
  const maxPerIp = opts.maxPerIp;
  const maxGlobal = opts.maxGlobal;
  const windows = new Map();
  let global = [];

  return function check(ip) {
    const now = Date.now();

    // 清理过期窗口
    for (const [key, entry] of windows) {
      if (now - entry.ts > windowMs) windows.delete(key);
    }
    global = global.filter(t => now - t < windowMs);

    const entry = windows.get(ip) || { ts: now, count: 0 };
    entry.count++;
    windows.set(ip, entry);

    if (entry.count > maxPerIp || global.length >= maxGlobal) return false;
    global.push(now);
    return true;
  };
}

module.exports = { createRateLimiter, DEFAULTS };
