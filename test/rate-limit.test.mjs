import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { createRateLimiter, createPerKeyLimiter, DEFAULTS } = require('../scripts/rate-limit.cjs');

test('限流器: 同一 IP 超过阈值后被拒绝', () => {
  const check = createRateLimiter({ windowMs: 60000, maxPerIp: 3, maxGlobal: 100 });
  assert.equal(check('1.2.3.4'), true);
  assert.equal(check('1.2.3.4'), true);
  assert.equal(check('1.2.3.4'), true);
  assert.equal(check('1.2.3.4'), false, '第 4 次应被限流');
});

test('限流器: 不同 IP 独立计数', () => {
  const check = createRateLimiter({ windowMs: 60000, maxPerIp: 2, maxGlobal: 100 });
  check('a');
  check('a');
  assert.equal(check('b'), true);
  assert.equal(check('a'), false);
});

test('限流器: 窗口过期后恢复', async () => {
  const check = createRateLimiter({ windowMs: 30, maxPerIp: 1, maxGlobal: 100 });
  assert.equal(check('x'), true);
  assert.equal(check('x'), false);
  await new Promise(r => setTimeout(r, 40));
  assert.equal(check('x'), true);
});

test('限流器: 全局预算生效', () => {
  const check = createRateLimiter({ windowMs: 60000, maxPerIp: 100, maxGlobal: 2 });
  assert.equal(check('a'), true);
  assert.equal(check('b'), true);
  assert.equal(check('c'), false);
});

test('限流器·按客户端: 同一 ID 超过阈值后被拒绝', () => {
  const check = createPerKeyLimiter({ windowMs: 60000, maxPerKey: 3 });
  assert.equal(check('client-a'), true);
  assert.equal(check('client-a'), true);
  assert.equal(check('client-a'), true);
  assert.equal(check('client-a'), false, '第 4 次应被限流');
});

test('限流器·按客户端: 不同 ID 独立计数, 换 ID 不清空原桶', () => {
  const check = createPerKeyLimiter({ windowMs: 60000, maxPerKey: 2 });
  check('client-a');
  check('client-a');
  assert.equal(check('client-b'), true, '另一客户端不受影响');
  assert.equal(check('client-a'), false, '原客户端仍受限');
});

test('限流器·按客户端: 窗口过期后恢复', async () => {
  const check = createPerKeyLimiter({ windowMs: 30, maxPerKey: 1 });
  assert.equal(check('client-a'), true);
  assert.equal(check('client-a'), false);
  await new Promise(r => setTimeout(r, 40));
  assert.equal(check('client-a'), true);
});

test('一致性: CF 副本限流常量与规范实现一致（防漂移）', () => {
  const cf = readFileSync(path.join(root, 'functions', 'api', '[[path]].js'), 'utf8');
  const server = readFileSync(path.join(root, 'server.js'), 'utf8');

  const windowExpr = 'RATE_WINDOW_MS = ' + DEFAULTS.windowMs / 1000 + ' * 1000';
  assert.ok(cf.includes(windowExpr), 'CF windowMs 不一致');
  assert.match(cf, new RegExp('RATE_MAX_PER_IP = ' + DEFAULTS.maxPerIp), 'CF maxPerIp 不一致');
  assert.match(cf, new RegExp('RATE_MAX_GLOBAL = ' + DEFAULTS.maxGlobal), 'CF maxGlobal 不一致');
  assert.match(cf, new RegExp('RATE_MAX_PER_CLIENT = ' + DEFAULTS.maxPerClient), 'CF maxPerClient 不一致');
  assert.match(server, /require\('\.\/scripts\/rate-limit\.cjs'\)/, 'server.js 应引用规范限流器');
});

test('一致性: CF 副本客户端限流的数据面完整（表/头/校验）', () => {
  const cf = readFileSync(path.join(root, 'functions', 'api', '[[path]].js'), 'utf8');
  assert.match(cf, /INSERT INTO rate_limit_client/, '客户端限流应落在 rate_limit_client 表（迁移 0003）');
  assert.match(cf, /'x-client-id'/i, '应从 X-Client-Id 头取客户端标识');
  assert.match(cf, /CLIENT_ID_RE/, '客户端 ID 必须先过格式校验再计数');
  assert.match(cf, /checkClientRateLimitDB/, '跨节点计数层应存在');
  assert.match(cf, /checkClientRateLimitMem/, '内存兜底层应存在');
});

