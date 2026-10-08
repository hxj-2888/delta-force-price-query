import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3210;

function request(pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: options.port || PORT,
        path: pathname,
        method: options.method || 'GET',
        headers: options.headers || {}
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', c => (body += c));
        res.on('end', () => resolve({ status: res.statusCode, body }));
      }
    );
    // 30s：放行路径会真实中继到线上 Pages → 上游 orzice.com，后者单次可达 ~25s
    // （functions 侧超时 25s），8s 级超时会把「上游慢」误判为「服务器挂起」
    req.setTimeout(30000, () => req.destroy(new Error('request timeout')));
    req.on('error', reject);
    req.end();
  });
}

async function waitReady() {
  for (let i = 0; i < 40; i++) {
    try {
      await request('/');
      return;
    } catch {
      await new Promise(r => setTimeout(r, 150));
    }
  }
  throw new Error('本地服务器未就绪');
}

test('server.js 冒烟: 静态服务 / 敏感文件 / 来源校验 / 限流', async (t) => {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: {
      ...process.env,
      API_TOKEN: 'test-token',
      PORT: String(PORT),
      RATE_MAX_PER_IP: '3',
      RATE_MAX_GLOBAL: '100',
      // 窗口拉长到 10 分钟：放行路径会真实中继到慢上游（单次可达 ~25s），
      // 4 次串行请求可能超过默认 60s 窗口导致计数重置，第 4 次就拿不到 429。
      RATE_WINDOW_MS: String(10 * 60 * 1000)
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.logs = '';
  child.stdout.on('data', d => (child.logs += d));
  child.stderr.on('data', d => (child.logs += d));
  t.after(() => {
    try { child.kill(); } catch { /* 已退出 */ }
  });

  await waitReady();

  // 静态首页（应用名：落幕查，2026-08-29 由「三角洲行动」更名）
  const home = await request('/');
  assert.equal(home.status, 200);
  assert.match(home.body, /落幕查/);

  // 敏感文件
  const envFile = await request('/.env');
  assert.equal(envFile.status, 403);

  // 跨站请求
  const crossSite = await request('/api/proxy?endpoint=item_price_all', {
    method: 'POST',
    headers: { Origin: 'https://evil.example.com', 'Sec-Fetch-Site': 'cross-site' }
  });
  assert.equal(crossSite.status, 403);
  assert.match(crossSite.body, /未授权/);

  // 限流: 前 3 次放行（结果取决于本机是否可访问上游，仅断言“放行”），第 4 次 429
  const allowed = [200, 404, 500, 502, 504];
  const statuses = [];
  for (let i = 0; i < 4; i++) {
    const r = await request('/api/proxy?endpoint=item_price_all');
    statuses.push(r.status);
  }
  assert.ok(allowed.includes(statuses[0]), '第 1 次应放行, 实际 ' + statuses[0]);
  assert.ok(allowed.includes(statuses[1]), '第 2 次应放行, 实际 ' + statuses[1]);
  assert.ok(allowed.includes(statuses[2]), '第 3 次应放行, 实际 ' + statuses[2]);
  assert.equal(statuses[3], 429, '第 4 次应被限流: ' + JSON.stringify(statuses));
});

test('/api/metadata 回归: 缓存重建不得杀掉 server 进程', async (t) => {
  // 背景（2026-10-08）：serveMetadata 的缓存刷新分支把 const 变量整体重新赋值，
  // 抛 TypeError: Assignment to constant variable 并直接杀掉 server 进程。
  // 页面首屏必定请求 /api/metadata，进程一死，后续请求全部连接被拒，
  // 用户看到的就是「快捷方式启动了、页面打开了、但没有任何数据」。
  //
  // 单独起一个实例并放宽限流：/api/metadata 同样走 authorizeAndLimit，
  // 若并入上面的冒烟用例会先吃掉 RATE_MAX_PER_IP=3 的配额，挤掉限流断言。
  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(PORT + 1),
      RATE_MAX_PER_IP: '50',
      RATE_MAX_GLOBAL: '1000'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.logs = '';
  child.stdout.on('data', d => (child.logs += d));
  child.stderr.on('data', d => (child.logs += d));
  t.after(() => {
    try { child.kill(); } catch { /* 已退出 */ }
  });

  for (let i = 0; i < 40; i++) {
    try {
      await request('/', { port: PORT + 1 });
      break;
    } catch {
      await new Promise(r => setTimeout(r, 150));
    }
  }

  // 必须连打两次：崩溃只在第二次（命中缓存重建分支）才暴露，单次通过是假阴性
  for (const pass of [1, 2]) {
    const res = await request('/api/metadata', { port: PORT + 1 });
    assert.equal(res.status, 200, `第 ${pass} 次 /api/metadata 应返回 200`);
    assert.doesNotThrow(() => JSON.parse(res.body), `第 ${pass} 次响应应为合法 JSON`);
    assert.doesNotMatch(child.logs, /Assignment to constant variable/, '不应出现 const 赋值异常');
  }

  // 崩溃守卫：两次请求之后进程必须仍存活并继续服务静态页面
  const alive = await request('/', { port: PORT + 1 });
  assert.equal(alive.status, 200, 'server 必须在 /api/metadata 之后继续存活');
  assert.equal(child.exitCode, null, 'server 进程不应已退出');
});
