import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { createRateLimiter, createPerKeyLimiter, DEFAULTS, CLIENT_ID_RE } = require('../scripts/rate-limit.cjs');

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

test('模块化: Pages 函数直接引用唯一实现，无内联副本', () => {
  const cf = readFileSync(path.join(root, 'functions', 'api', '[[path]].js'), 'utf8');
  const server = readFileSync(path.join(root, 'server.js'), 'utf8');

  assert.match(cf, /from '\.\.\/\.\.\/scripts\/rate-limit\.cjs'/, 'Pages 函数应 import 规范实现');
  assert.match(server, /require\('\.\/scripts\/rate-limit\.cjs'\)/, 'server.js 应引用规范限流器');
  assert.doesNotMatch(cf, /RATE_MAX_PER_[A-Z_]+\s*=/, '函数内不得重定义阈值常量（唯一来源是 DEFAULTS）');
  assert.doesNotMatch(cf, /function checkRateLimit\b/, '函数内不得保留内联计数器副本');
  assert.doesNotMatch(cf, /clientWindows/, '函数内不得保留内联客户端计数器');
  assert.equal(DEFAULTS.maxPerClient, 30, '客户端阈值与限流层注释保持一致');
});

test('模块化: 客户端 ID 格式约束唯一（CLIENT_ID_RE）', () => {
  assert.doesNotMatch(CLIENT_ID_RE.source, /\^?\[A-Za-z0-9_\-\]\{8,64\}\$?\[A-Za-z0-9_\-\]/);
  assert.equal(CLIENT_ID_RE.test('abcdefgh'), true, '8 位合法');
  assert.equal(CLIENT_ID_RE.test('a'.repeat(64)), true, '64 位合法');
  assert.equal(CLIENT_ID_RE.test('a'.repeat(7)), false, '少于 8 位不合法');
  assert.equal(CLIENT_ID_RE.test('x'.repeat(65)), false, '超过 64 位不合法');
  assert.equal(CLIENT_ID_RE.test('带 中文'), false, '非白名单字符不合法');

  const cf = readFileSync(path.join(root, 'functions', 'api', '[[path]].js'), 'utf8');
  const server = readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.ok(!cf.includes('^[A-Za-z0-9_-]{8,64}$'), '函数内不得内联正则字面量副本');
  assert.match(cf, /CLIENT_ID_RE\.test/, '函数应使用导入的 CLIENT_ID_RE');
  assert.match(server, /CLIENT_ID_RE\.test/, 'server.js 应使用导入的 CLIENT_ID_RE');
});

test('模块化: 部署白名单必须携带限流模块（函数 import 的解析前提）', () => {
  const deploy = readFileSync(path.join(root, 'tools', 'deploy-pages.cjs'), 'utf8');
  assert.match(deploy, /scripts\/rate-limit\.cjs/, '暂存白名单缺少 scripts/rate-limit.cjs 会导致函数打包失败');
});

test('数据面: CF 函数客户端限流完整（表/头/D1+内存双层）', () => {
  const cf = readFileSync(path.join(root, 'functions', 'api', '[[path]].js'), 'utf8');
  assert.match(cf, /INSERT INTO rate_limit_client/, '客户端限流应落在 rate_limit_client 表（迁移 0003）');
  assert.match(cf, /'x-client-id'/i, '应从 X-Client-Id 头取客户端标识');
  assert.match(cf, /checkClientRateLimitDB/, '跨节点计数层应存在');
  assert.match(cf, /checkClientRateLimitMem/, '内存兜底层应存在');
});

