// 三角洲行动 — 元数据生成脚本
// 翻完 10 分类全部 item_list 页面，提取非价格元数据，输出 data/metadata.json
// 用法: node scripts/generate-metadata.js
// 通过已部署的代理拉取数据（无需本地 API_TOKEN）

const https = require('https');
const fs = require('fs');
const path = require('path');

// 走已部署的代理（CF Function 内置 API_TOKEN，边缘缓存 GET）
// ★ 与 CI 部署项目保持一致（.github/workflows/deploy.yml → delta-force-v5）
const PROXY_HOST = 'delta-force-v5.pages.dev';
const PROXY_PATH = '/api/proxy';

const CATS = ['gun', 'ammo', 'acc', 'helmet', 'armor', 'chest', 'bag', 'key', 'collection', 'consume'];

// 元数据字段 — 从 item_list 提取并存入 metadata
const META_FIELDS = [
  'name', 'pic', 'grade', 'ShopSellType', 'desc',
  'secondClassCN', 'length', 'width', 'weight', 'Weight',
  'objectID', 'tid'
];

// ===== HTTP 请求（走代理） =====

// 单次请求（不重试）。reject 的 Error 在 HTTP 错误时带 status 字段，供重试层判断是否可重试。
function fetchOnce(cat, page) {
  return new Promise((resolve, reject) => {
    const params = `endpoint=item_list&types=${cat}&p=${page}`;
    const url = `https://${PROXY_HOST}${PROXY_PATH}?${params}`;

    // 审计 M1(2026-08-29):代理端可启用 PROXY_KEY 来校验无 Origin 的脚本调用，
    // 启用后本脚本必须带上 X-Proxy-Key，否则 403；未启用时该头会被忽略（向后兼容）。
    // ★ trim 兜底：若 Secret 在设置时被工具带入换行/空白（如 PowerShell 管道），
    //   不清理会触发 Node "Invalid character in header content" 直接报错（实测踩过）。
    const headers = {
      'User-Agent': 'DeltaForceMetadataGen/1.0',
      'Accept': 'application/json'
    };
    const proxyKey = (process.env.PROXY_KEY || '').trim();
    if (proxyKey) headers['X-Proxy-Key'] = proxyKey;

    const req = https.get(url, {
      headers,
      timeout: 30000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        // 代理可能返回 429（限流）/ 502 等错误
        if (res.statusCode !== 200) {
          const err = new Error(`HTTP ${res.statusCode}: ${body.substring(0, 100)}`);
          err.status = res.statusCode;
          reject(err);
          return;
        }
        try {
          const data = JSON.parse(body);
          resolve(data);
        } catch (e) {
          reject(new Error('JSON parse error: ' + body.substring(0, 100)));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// ★ 带指数退避的重试包装
// 必须重试的原因：Pages 端 /api/proxy 限流为 120 次/分钟/IP，而 GitHub Actions 是单一出口 IP。
// 1350 件物品按每页 10 条需 ~135 页，必然撞上 429；若不重试，整页数据会被静默丢弃，
// 最终写出一份残缺的 metadata.json，并被 metadata-refresh.yml 自动提交 + 全量发布。
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_RETRY = 4;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchViaProxy(cat, page) {
  let lastErr = null;

  for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
    if (attempt > 0) {
      // 指数退避 2s → 4s → 8s → 16s；429 再额外等 20s，让 60s 限流窗口滑过
      const extra = (lastErr && lastErr.status === 429) ? 20000 : 0;
      await sleep(Math.pow(2, attempt) * 1000 + extra);
    }
    try {
      return await fetchOnce(cat, page);
    } catch (e) {
      lastErr = e;
      const retryable = e.status
        ? RETRYABLE_STATUS.has(e.status)
        : /timeout|ECONN|ETIMEDOUT|socket|network/i.test(e.message);
      if (!retryable) throw e;   // 4xx（除 429）与 JSON 解析错误重试无意义
    }
  }

  throw lastErr;
}

// ===== 并发控制 =====
function batchAsync(tasks, concurrency) {
  const results = [];
  const queue = tasks.slice();
  return new Promise((resolve) => {
    let running = 0;
    function next() {
      if (queue.length === 0 && running === 0) { resolve(results); return; }
      while (running < concurrency && queue.length > 0) {
        const task = queue.shift();
        running++;
        task().then(r => results.push(r)).catch(e => results.push({ error: e.message })).finally(() => {
          running--;
          next();
        });
      }
    }
    next();
  });
}

// ===== 主流程 =====
async function main() {
  console.log('三角洲行动 — 元数据生成');
  console.log(`代理: ${PROXY_HOST}${PROXY_PATH}`);
  console.log('========================');
  console.log('');

  const metadata = {};    // { itemId: { name, pic, _category, ... } }
  let totalItems = 0;
  let totalPages = 0;
  let failedPages = 0;    // 失败页数（写入前校验用）

  for (const cat of CATS) {
    process.stdout.write(`[${cat}] 获取 page1...`);

    let page1;
    try {
      page1 = await fetchViaProxy(cat, 1);
    } catch (e) {
      console.log(` 失败: ${e.message}`);
      failedPages++;
      continue;
    }

    if (!page1 || page1.code !== 0 || !Array.isArray(page1.data)) {
      console.log(` 返回异常 (code=${page1 && page1.code})`);
      failedPages++;
      continue;
    }

    const perPage = page1.data.length || 10;
    const totalCount = page1.count || page1.data.length;
    const pages = Math.ceil(totalCount / perPage);

    // 提取 page1 元数据
    page1.data.forEach(item => {
      if (!item.id) return;
      const meta = { _category: cat };
      META_FIELDS.forEach(f => {
        if (item[f] !== undefined && item[f] !== null && item[f] !== '') {
          meta[f] = item[f];
        }
      });
      metadata[item.id] = meta;
    });

    totalItems += page1.data.length;
    totalPages++;
    console.log(` ${page1.data.length} 件, 共 ${pages} 页, 总计 ${totalCount} 件`);

    // 剩余页并行拉取
    if (pages > 1) {
      const remainingTasks = [];
      for (let p = 2; p <= pages; p++) {
        remainingTasks.push(() => fetchViaProxy(cat, p));
      }

      // 并发压到 3：CI 出口 IP 是单点，并发越高越容易在 60s 窗口内撞满 120 次限流
      const pageResults = await batchAsync(remainingTasks, 3);
      let catPagesLoaded = 1;
      pageResults.forEach((res, idx) => {
        const p = idx + 2;
        if (res.error) {
          process.stdout.write(`  [${cat}] p${p} 失败: ${res.error}\r`);
          failedPages++;
          return;
        }
        if (!res || res.code !== 0 || !Array.isArray(res.data)) {
          process.stdout.write(`  [${cat}] p${p} 数据异常\r`);
          failedPages++;
          return;
        }
        res.data.forEach(item => {
          if (!item.id) return;
          if (metadata[item.id]) return; // 首页优先
          const meta = { _category: cat };
          META_FIELDS.forEach(f => {
            if (item[f] !== undefined && item[f] !== null && item[f] !== '') {
              meta[f] = item[f];
            }
          });
          metadata[item.id] = meta;
        });
        totalItems += res.data.length;
        catPagesLoaded++;
        totalPages++;
        process.stdout.write(`  [${cat}] p${p}/${pages} (${catPagesLoaded}/${pages} 页, 累计 ${totalItems} 件)    \r`);
      });
      console.log('');
    }
  }

  const newCount = Object.keys(metadata).length;

  console.log('');
  console.log('========================');
  console.log(`完成! ${totalPages} 页成功, ${failedPages} 页失败, ${newCount} 件物品元数据`);

  // 写入文件
  const outputDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputFile = path.join(outputDir, 'metadata.json');

  // ★ 写入前校验（最后一道闸）
  // 本脚本由 .github/workflows/metadata-refresh.yml 自动执行，产物一旦提交就会触发全量部署。
  // 若因限流/网络丢页导致条目大幅缺失，线上所有物品会立刻退化为「物品#ID」且无人确认。
  // 因此宁可本次不更新，也绝不能写出残缺文件。
  const MIN_ITEMS = 1000;          // 当前全量约 1350 件
  const DROP_RATIO_LIMIT = 0.9;    // 相对旧文件最多允许下降 10%
  let oldCount = 0;
  if (fs.existsSync(outputFile)) {
    try {
      oldCount = Object.keys(JSON.parse(fs.readFileSync(outputFile, 'utf8'))).length;
    } catch (e) {
      console.warn(`警告: 旧 metadata.json 解析失败 (${e.message})，跳过条数对比`);
    }
  }

  if (newCount < MIN_ITEMS || (oldCount > 0 && newCount < oldCount * DROP_RATIO_LIMIT)) {
    console.error('');
    console.error(`✗ 拒绝写入: 本次采集到 ${newCount} 件，旧文件 ${oldCount} 件，失败 ${failedPages} 页`);
    console.error(`  要求: 绝对数 ≥ ${MIN_ITEMS} 且不低于旧文件的 ${DROP_RATIO_LIMIT * 100}%`);
    console.error('  常见原因: 代理限流(429)或网络抖动导致整页丢失。已保留旧文件，本次不会提交。');
    process.exit(1);
  }

  fs.writeFileSync(outputFile, JSON.stringify(metadata), 'utf8');
  console.log(`已写入: ${outputFile}（旧 ${oldCount} 件 → 新 ${newCount} 件）`);

  // 统计
  const catCounts = {};
  Object.values(metadata).forEach(m => {
    catCounts[m._category] = (catCounts[m._category] || 0) + 1;
  });
  console.log('');
  console.log('分类统计:');
  Object.keys(catCounts).sort().forEach(c => {
    console.log(`  ${c}: ${catCounts[c]} 件`);
  });

  const fileSize = fs.statSync(outputFile).size;
  console.log('');
  console.log(`文件大小: ${(fileSize / 1024).toFixed(1)} KB${fileSize > 100000 ? ' (建议开启 gzip)' : ''}`);
}

main().catch(err => {
  console.error('执行失败:', err);
  process.exit(1);
});
