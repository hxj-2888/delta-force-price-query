import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { createRateLimiter, DEFAULTS } = require('../scripts/rate-limit.cjs');

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

test('一致性: CF 副本限流常量与规范实现一致（防漂移）', () => {
  const cf = readFileSync(path.join(root, 'functions', 'api', '[[path]].js'), 'utf8');
  const server = readFileSync(path.join(root, 'server.js'), 'utf8');

  const windowExpr = 'RATE_WINDOW_MS = ' + DEFAULTS.windowMs / 1000 + ' * 1000';
  assert.ok(cf.includes(windowExpr), 'CF windowMs 不一致');
  assert.match(cf, new RegExp('RATE_MAX_PER_IP = ' + DEFAULTS.maxPerIp), 'CF maxPerIp 不一致');
  assert.match(cf, new RegExp('RATE_MAX_GLOBAL = ' + DEFAULTS.maxGlobal), 'CF maxGlobal 不一致');
  assert.match(server, /require\('\.\/scripts\/rate-limit\.cjs'\)/, 'server.js 应引用规范限流器');
});
