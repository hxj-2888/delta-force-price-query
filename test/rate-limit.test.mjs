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
  assert.match(cf, /from '\.\.\/\.\.\/lib\//, 'Pages 函数业务实现在 lib/（本文件只留流水线）');
  assert.match(server, /require\('\.\/scripts\/rate-limit\.cjs'\)/, 'server.js 应引用规范限流器');
  assert.doesNotMatch(cf, /RATE_MAX_PER_[A-Z_]+\s*=/, '函数内不得重定义阈值常量（唯一来源是 DEFAULTS）');
  assert.doesNotMatch(cf, /function checkRateLimit\b/, '函数内不得保留内联计数器副本');
  assert.doesNotMatch(cf, /clientWindows/, '函数内不得保留内联客户端计数器');
  assert.equal(DEFAULTS.maxPerClient, 30, '客户端阈值与限流层注释保持一致');
});

test('模块化: 客户端 ID 格式约束唯一（CLIENT_ID_RE）', () => {
  assert.equal(CLIENT_ID_RE.test('abcdefgh'), true, '8 位合法');
  assert.equal(CLIENT_ID_RE.test('a'.repeat(64)), true, '64 位合法');
  assert.equal(CLIENT_ID_RE.test('a'.repeat(7)), false, '少于 8 位不合法');
  assert.equal(CLIENT_ID_RE.test('x'.repeat(65)), false, '超过 64 位不合法');
  assert.equal(CLIENT_ID_RE.test('带 中文'), false, '非白名单字符不合法');

  const cf = readFileSync(path.join(root, 'functions', 'api', '[[path]].js'), 'utf8');
  const server = readFileSync(path.join(root, 'server.js'), 'utf8');
  const clientIdModule = readFileSync(path.join(root, 'lib', 'node', 'client-id.cjs'), 'utf8');
  assert.ok(!cf.includes('^[A-Za-z0-9_-]{8,64}$'), '函数内不得内联正则字面量副本');
  assert.ok(!clientIdModule.includes("require('../scripts/"), 'lib/node 的模块引用必须以 ../.. 起步（../scripts 不存在）');
  assert.match(cf, /CLIENT_ID_RE\.test/, '函数应使用导入的 CLIENT_ID_RE');
  assert.match(clientIdModule, /CLIENT_ID_RE\.test/, 'client-id 模块应使用导入的 CLIENT_ID_RE');
  assert.match(server, /lib\/node\/client-id\.cjs/, 'server.js 的客户端 ID 应来自 client-id 模块');
});

test('模块化: 部署白名单必须携带函数运行时模块（import 解析前提）', () => {
  const deploy = readFileSync(path.join(root, 'tools', 'deploy-pages.cjs'), 'utf8');
  assert.match(deploy, /'lib'/, '暂存白名单缺少 lib/（lib/handlers 与 lib/rate-limit-d1 是函数 import 的模块）');
  assert.match(deploy, /scripts\/rate-limit\.cjs/, '暂存白名单缺少 scripts/rate-limit.cjs（lib 与函数都 import 它）');
});

test('数据面: CF 函数客户端限流完整（表/头/D1+内存双层）', () => {
  const cf = readFileSync(path.join(root, 'functions', 'api', '[[path]].js'), 'utf8');
  const d1 = readFileSync(path.join(root, 'lib', 'rate-limit-d1.cjs'), 'utf8');
  assert.match(d1, /INSERT INTO rate_limit_client/, '客户端限流应落在 rate_limit_client 表（迁移 0003）');
  assert.match(d1, /INSERT INTO rate_limit_window/, '全局限流应落在 rate_limit_window 表（迁移 0002）');
  assert.match(d1, /DEFAULTS\.maxGlobal/, 'D1 层阈值应取自唯一实现 DEFAULTS');
  assert.match(d1, /DEFAULTS\.maxPerClient/, 'D1 层阈值应取自唯一实现 DEFAULTS');
  assert.match(cf, /'x-client-id'/i, '应从 X-Client-Id 头取客户端标识');
  assert.match(cf, /checkClientRateLimitDB/, '跨节点计数层应被流水线调用');
  assert.match(cf, /checkClientRateLimitMem/, '内存兜底层应被流水线调用');
});

test('安全: 流水线顺序守卫（限流 → 心跳豁免 → 来源鉴权 → 脚本鉴权 → 业务路由）', () => {
  const cf = readFileSync(path.join(root, 'functions', 'api', '[[path]].js'), 'utf8');
  const order = [
    ['checkRateLimit(ip)', '每 IP 内存层'],
    ['checkGlobalRateLimitDB(env.DB)', '全局 D1 层'],
    ['checkClientRateLimitMem(clientId)', '客户端内存层'],
    ['checkClientRateLimitDB(env.DB, clientId)', '客户端 D1 层'],
    ["url.pathname === '/api/cron-status'", '心跳路由（刻意豁免后续鉴权）'],
    ['isAuthorizedOrigin(request)', '来源鉴权'],
    ['checkScriptAccess(request, env)', '脚本鉴权'],
    ["url.pathname === '/api/metadata'", '元数据路由'],
    ['handleHistoryRequest(env,', '历史路由'],
  ];
  let last = -1;
  for (const [marker, label] of order) {
    const at = cf.indexOf(marker);
    assert.ok(at > last, `流水线顺序: ${label}（${marker}）应出现在前一环节之后`);
    last = at;
  }
});

test('安全: 本地静态服务黑名单覆盖新增源码目录 lib/', () => {
  const staticModule = readFileSync(path.join(root, 'lib', 'node', 'static.cjs'), 'utf8');
  assert.match(staticModule, /'lib\/'/, 'lib/ 是服务端源码，本地静态服务必须拦截');
});

