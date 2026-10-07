'use strict';
// ===== 限流器（唯一实现） =====
// 桌面版 server.js require、云端 Pages 函数（functions/api/[[path]].js）import，
// 共用同一模块：改阈值或逻辑只改这里，不存在需要手工同步的内联副本。
// （2026-10-07 前云端持有内联副本靠测试钉常量防漂移，已模块化删除。）
// test/rate-limit.test.mjs 校验行为与引用关系（server.js 直接引用本文件）。

// 匿名客户端 ID 的格式约束：网页端 localStorage UUID、桌面版装机指纹哈希都须满足
const CLIENT_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

const DEFAULTS = {
  windowMs: 60 * 1000,   // 统计窗口
  maxPerIp: 120,         // 每 IP 每分钟
  maxGlobal: 600,        // 全局每分钟（单实例/单进程）
  maxPerClient: 30       // 每客户端（X-Client-Id）每分钟——「同账号」限流维度
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

// 按任意键（如客户端 ID）的内存计数器。
// 云端副本因打包限制将同语义逻辑内联在 functions/api/[[path]].js，改这里请同步。
function createPerKeyLimiter(opts) {
  const windowMs = opts.windowMs;
  const maxPerKey = opts.maxPerKey;
  const windows = new Map();

  return function check(key) {
    const now = Date.now();

    for (const [k, entry] of windows) {
      if (now - entry.ts > windowMs) windows.delete(k);
    }

    const entry = windows.get(key) || { ts: now, count: 0 };
    entry.count++;
    windows.set(key, entry);
    return entry.count <= maxPerKey;
  };
}

module.exports = { createRateLimiter, createPerKeyLimiter, DEFAULTS, CLIENT_ID_RE };
