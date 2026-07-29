// 三角洲行动 — 元数据生成脚本
// 翻完 10 分类全部 item_list 页面，提取非价格元数据，输出 data/metadata.json
// 用法: node scripts/generate-metadata.js
// 通过已部署的代理拉取数据（无需本地 API_TOKEN）

const https = require('https');
const fs = require('fs');
const path = require('path');

// 走已部署的代理（CF Function 内置 API_TOKEN，边缘缓存 GET）
const PROXY_HOST = 'main.delta-force-miniprogram.pages.dev';
const PROXY_PATH = '/api/proxy';

const CATS = ['gun', 'ammo', 'acc', 'helmet', 'armor', 'chest', 'bag', 'key', 'collection', 'consume'];

// 元数据字段 — 从 item_list 提取并存入 metadata
const META_FIELDS = [
  'name', 'pic', 'grade', 'ShopSellType', 'desc',
  'secondClassCN', 'length', 'width', 'weight', 'Weight',
  'objectID', 'tid'
];

// ===== HTTP 请求（走代理） =====
function fetchViaProxy(cat, page) {
  return new Promise((resolve, reject) => {
    const params = `endpoint=item_list&types=${cat}&p=${page}`;
    const url = `https://${PROXY_HOST}${PROXY_PATH}?${params}`;

    const req = https.get(url, {
      headers: {
        'User-Agent': 'DeltaForceMetadataGen/1.0',
        'Accept': 'application/json'
      },
      timeout: 30000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        // 代理可能返回 502 等错误
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${body.substring(0, 100)}`));
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

  for (const cat of CATS) {
    process.stdout.write(`[${cat}] 获取 page1...`);

    let page1;
    try {
      page1 = await fetchViaProxy(cat, 1);
    } catch (e) {
      console.log(` 失败: ${e.message}`);
      continue;
    }

    if (!page1 || page1.code !== 0 || !Array.isArray(page1.data)) {
      console.log(` 返回异常 (code=${page1 && page1.code})`);
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

      const pageResults = await batchAsync(remainingTasks, 6);
      let catPagesLoaded = 1;
      pageResults.forEach((res, idx) => {
        const p = idx + 2;
        if (res.error) {
          process.stdout.write(`  [${cat}] p${p} 失败: ${res.error}\r`);
          return;
        }
        if (!res || res.code !== 0 || !Array.isArray(res.data)) {
          process.stdout.write(`  [${cat}] p${p} 数据异常\r`);
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

  console.log('');
  console.log('========================');
  console.log(`完成! ${totalPages} 页, ${Object.keys(metadata).length} 件物品元数据`);

  // 写入文件
  const outputDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputFile = path.join(outputDir, 'metadata.json');
  fs.writeFileSync(outputFile, JSON.stringify(metadata), 'utf8');
  console.log(`已写入: ${outputFile}`);

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
