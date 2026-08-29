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
        port: PORT,
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
    req.setTimeout(8000, () => req.destroy(new Error('request timeout')));
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
      RATE_MAX_GLOBAL: '100'
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
