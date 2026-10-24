// gen-demo-data.cjs — 用「真实行情快照」生成 demo 数据（v3：零模拟）
// 前置：node design/fetch-real.cjs（或 curl）拉取 item_price_all → design/real-prices.json
// 用法：node design/gen-demo-data.cjs  → 输出 design/demo-data.js
// 价格/涨跌幅/今开/30日前全部来自上游真实数据；名称/图片/等级/分类来自 data/metadata.json。
'use strict';
const fs = require('fs');
const path = require('path');

const REAL = path.join(__dirname, 'real-prices.json');
const META = path.join(__dirname, '..', 'data', 'metadata.json');
const OUT = path.join(__dirname, 'demo-data.js');

if (!fs.existsSync(REAL)) {
  console.error('缺少 design/real-prices.json，请先运行: node design/fetch-real.cjs');
  process.exit(1);
}
const priceRows = JSON.parse(fs.readFileSync(REAL, 'utf8')).data;
const meta = JSON.parse(fs.readFileSync(META, 'utf8'));

// 与正式版 prefetch 同口径：先按 id 匹配，再按 tid 兜底
const items = priceRows.map(r => {
  const m = meta[r.id] || meta[r.tid] || {};
  return {
    i: r.id, n: m.name || ('物品#' + r.id), p: m.pic || '',
    g: (m.grade >= 1 && m.grade <= 6) ? m.grade : 0,
    c: m._category || 'unknown', s: m.secondClassCN || '',
    pr: r.price || 0, b1: r.bl || 0, b3: r.day_3_bl || 0, b7: r.day_7_bl || 0,
    b30: r.day_30_bl || 0, ps: r.price_start || r.price || 0, d30: r.day_30_price || 0,
    d3p: r.day_3_price || 0, d7p: r.day_7_price || 0,
    l: m.length || 0, w: m.width || 0, wt: (m.weight ?? m.Weight) || 0,
    t: r.is_get_time || 0,
  };
});

const fetchAt = new Date();
fs.writeFileSync(OUT,
  '// 自动生成：node design/gen-demo-data.cjs（勿手改）\n' +
  '// ★ 真实行情快照：' + items.length + ' 件，拉取于 ' + fetchAt.toISOString().slice(0, 16).replace('T', ' ') + ' UTC\n' +
  '// 价格/涨跌幅/今开/30日前均为上游真实数据；名称/图片/等级/分类来自 metadata\n' +
  'window.__DEMO_ITEMS=' + JSON.stringify(items) + ';\n' +
  'window.__DEMO_FETCH_AT=' + JSON.stringify(fetchAt.toISOString()) + ';\n', 'utf8');

const byCat = {}; items.forEach(i => byCat[i.c] = (byCat[i.c] || 0) + 1);
const s = [...items].sort((a, b) => b.b1 - a.b1);
console.log('生成 ' + items.length + ' 件 → ' + OUT);
console.log(Object.keys(byCat).map(c => c + ':' + byCat[c]).join(' '));
console.log('真实涨幅前3:', s.slice(0, 3).map(x => x.n + ' ' + x.b1 + '%').join(' | '));
console.log('真实跌幅前3:', s.slice(-3).map(x => x.n + ' ' + x.b1 + '%').join(' | '));
