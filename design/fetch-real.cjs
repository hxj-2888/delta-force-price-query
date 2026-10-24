// fetch-real.cjs — 拉取真实 item_price_all 存到 design/real-prices.json（demo 数据源）
'use strict';
const https = require('https');
const fs = require('fs');
const path = require('path');

const url = 'https://delta-force-v5.pages.dev/api/proxy?endpoint=item_price_all';
const OUT = path.join(__dirname, 'real-prices.json');

const req = https.get(url, { headers: { 'User-Agent': 'DeltaForceMetadataGen/1.0', 'Accept': 'application/json' }, timeout: 50000 }, res => {
  let b = '';
  res.on('data', c => b += c);
  res.on('end', () => {
    console.log('HTTP', res.statusCode, '长度', b.length);
    try {
      const j = JSON.parse(b);
      if (j.code === 0 && Array.isArray(j.data)) {
        console.log('真实条目数:', j.data.length);
        const sorted = [...j.data].sort((a, b) => (b.bl || 0) - (a.bl || 0));
        console.log('真实涨幅前5:', sorted.slice(0, 5).map(x => x.bl + '%').join(' | '));
        console.log('真实跌幅前3:', sorted.slice(-3).map(x => x.bl + '%').join(' | '));
        fs.writeFileSync(OUT, b);
        console.log('已写入', OUT);
      } else {
        console.log('非预期响应:', b.slice(0, 300));
      }
    } catch (e) { console.log('解析失败:', b.slice(0, 300)); }
    process.exit(0);
  });
});
req.on('error', e => { console.log('ERR', e.message); process.exit(1); });
req.on('timeout', () => { console.log('TIMEOUT'); req.destroy(); process.exit(1); });
