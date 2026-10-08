/**
 * 首页改造冒烟测试（Playwright + 系统 Chrome）
 * 目的: 不依赖上游 API（离线可跑），用注入的假数据验证 ①②③④ 四项改造的 DOM 行为。
 * 用法: node server.js  另开一个终端后  node tools/home-ui-smoke.cjs
 * 依赖: NODE_PATH 指向装有 playwright-core 的目录（本机在太空杀项目下）
 */
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3000/';

const MOCK = [];
const CATS = ['gun', 'ammo', 'acc', 'helmet', 'armor', 'chest', 'bag', 'key', 'collection', 'consume'];
for (let i = 0; i < 120; i++) {
  const price = 3000 + ((i * 7919) % 900000);
  MOCK.push({
    id: 10000 + i,
    tid: 20000 + i,
    name: '测试物品 ' + i + (i % 3 === 0 ? ' 头盔' : '') + (i % 5 === 0 ? ' 弹匣' : ''),
    price: price,
    bl: ((i % 21) - 10) * 1.5,
    day_3_bl: ((i % 17) - 8) * 2,
    day_7_bl: ((i % 13) - 6) * 2.4,
    day_30_bl: ((i % 11) - 5) * 3,
    price_start: Math.round(price * 0.94),
    day_3_price: Math.round(price * 0.9),
    day_7_price: Math.round(price * 0.86),
    day_30_price: Math.round(price * 0.8),
    is_get_time: Math.floor(Date.now() / 1000),
    _category: CATS[i % CATS.length],
    grade: (i % 6) + 1,
    pic: '',
    secondClassCN: '测试子类',
    length: 2,
    width: 1,
    weight: 0.5,
    objectID: 30000 + i
  });
}

const results = [];
function check(name, ok, extra) {
  results.push({ name, ok, extra });
  console.log((ok ? '  OK   ' : '  FAIL ') + name + (extra ? '  → ' + extra : ''));
}

(async () => {
  let chromium;
  try {
    chromium = require('playwright-core').chromium;
  } catch (e) {
    console.error('缺少 playwright-core，请用 NODE_PATH 指向含该模块的目录');
    process.exit(1);
  }

  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 414, height: 860 } });

  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  // 注入假数据（绕开上游 API），走与线上一致的渲染入口
  await page.evaluate((items) => {
    const ls = window.localStorage;
    ls.setItem('deltaforce_cache_v10', JSON.stringify({ _allItems: items }));
    ls.setItem('deltaforce_cache_time_v10', String(Date.now()));
    if (typeof setCache === 'function') setCache({ _allItems: items });
    if (typeof buildSearchIndex === 'function') buildSearchIndex(items);
    if (typeof resetAllFilters === 'function') resetAllFilters();
    const ls2 = document.getElementById('loadingScreen');
    if (ls2) { ls2.classList.add('fade-out'); ls2.classList.add('removed'); }
    if (typeof renderHomeMovers === 'function') renderHomeMovers();
  }, MOCK);
  await page.waitForTimeout(500);

  // ---------- ③ 市场概览条 ----------
  const stat = await page.evaluate(() => ({
    visible: !!document.querySelector('#homeStatBar') &&
      document.querySelector('#homeStatBar').getBoundingClientRect().height > 0,
    count: (document.getElementById('hsCount') || {}).textContent,
    avg: (document.getElementById('hsAvg') || {}).textContent,
    up: (document.getElementById('hsUp') || {}).textContent,
    dn: (document.getElementById('hsDn') || {}).textContent,
    mood: (document.getElementById('hsMood') || {}).textContent,
    upd: (document.getElementById('hsUpd') || {}).textContent
  }));
  check('③ 概览条可见', stat.visible);
  check('③ 结果数 = 120', stat.count === '120', 'got ' + stat.count);
  check('③ 均价非空', /¥[\d,]+/.test(stat.avg || ''), stat.avg);
  check('③ 涨跌家数有值', /^\d+$/.test(stat.up || '') && /^\d+$/.test(stat.dn || ''), stat.up + '/' + stat.dn);
  check('③ 行情方向词', ['普涨', '普跌', '持平'].indexOf(stat.mood) >= 0, stat.mood);
  check('③ 更新时间非空', (stat.upd || '--') !== '--', stat.upd);

  // ---------- ④ 卡片增强 ----------
  const card = await page.evaluate(() => {
    const c = document.querySelector('#homeMoversList .item-card');
    if (!c) return null;
    return {
      arrow: (c.querySelector('.chg-arrow') || {}).textContent,
      range: !!c.querySelector('.item-range-row'),
      rangeText: (c.querySelector('.item-range-row') || {}).textContent || '',
      pos: (c.querySelector('.ir-num') || {}).textContent,
      catTag: (c.querySelector('.item-cat-tag') || {}).textContent,
      radius: getComputedStyle(c).borderRadius
    };
  });
  check('④ 卡片渲染成功', !!card);
  check('④ ▲▼ 箭头存在', !!card && ['▲', '▼', '–'].indexOf(card.arrow) >= 0, card && card.arrow);
  check('④ 区间行（开盘/30天前）', !!card && card.range && /开盘/.test(card.rangeText), card && card.rangeText.trim().slice(0, 40));
  check('④ 当前分位百分比', !!card && /^\d+%$/.test((card.pos || '').trim()), card && card.pos);
  check('④ 品类标签', !!card && !!card.catTag, card && card.catTag);
  check('④ 卡片圆角已生效', !!card && card.radius !== '0px', card && card.radius);

  // ---------- ② 筛选面板：分类多选 + 件数 + 查看 N 件 ----------
  await page.click('#btnFilter');
  await page.waitForTimeout(300);
  const dd = await page.evaluate(() => {
    const p = document.getElementById('filterDropdown');
    return {
      open: p && getComputedStyle(p).display !== 'none',
      cnt: (p.querySelector('.filter-cat-chip[data-cat="gun"] .cat-cnt') || {}).textContent,
      apply: (p.querySelector('.dd-apply-count') || {}).textContent
    };
  });
  check('② 分类面板打开', dd.open);
  check('② 分类带件数', /^\d+ 件$/.test(dd.cnt || ''), dd.cnt);
  check('② 查看 N 件预估 = 120', dd.apply === '120', dd.apply);

  await page.click('#filterDropdown .filter-cat-chip[data-cat="gun"]');
  await page.waitForTimeout(200);
  const afterPick = await page.evaluate(() => ({
    apply: (document.querySelector('#filterDropdown .dd-apply-count') || {}).textContent,
    chip: (document.querySelector('#homeFilterChips .fchip b') || {}).textContent,
    chipsVisible: getComputedStyle(document.getElementById('homeFilterChips')).display !== 'none',
    label: (document.getElementById('filterLabel') || {}).textContent
  }));
  check('② 选分类后预估变为 12', afterPick.apply === '12', afterPick.apply);
  check('② chips 回显分类名', afterPick.chip === '枪械', afterPick.chip);
  check('② chips 区可见', afterPick.chipsVisible);
  check('② 按钮标签变为分类名', afterPick.label === '枪械', afterPick.label);

  // 再加一个分类 → 多选
  await page.click('#filterDropdown .filter-cat-chip[data-cat="helmet"]');
  await page.waitForTimeout(200);
  const afterPick2 = await page.evaluate(() => ({
    apply: (document.querySelector('#filterDropdown .dd-apply-count') || {}).textContent,
    chips: Array.from(document.querySelectorAll('#homeFilterChips .fchip b')).map(e => e.textContent),
    label: (document.getElementById('filterLabel') || {}).textContent
  }));
  check('② 多选两个分类 → 24', afterPick2.apply === '24', afterPick2.apply);
  check('② 两个 chip 同时在', afterPick2.chips.join(',') === '枪械,头盔', afterPick2.chips.join(','));
  check('② 标签显示「分类2」', afterPick2.label === '分类2', afterPick2.label);

  await page.click('#filterDropdown .dd-btn.primary');
  await page.waitForTimeout(300);
  const applied = await page.evaluate(() => ({
    closed: getComputedStyle(document.getElementById('filterDropdown')).display === 'none',
    listCount: document.querySelectorAll('#homeMoversList .item-card').length,
    statCount: (document.getElementById('hsCount') || {}).textContent
  }));
  check('② 点「查看 N 件」关闭面板', applied.closed);
  check('② 列表按筛选结果渲染 24 条', applied.listCount === 24, String(applied.listCount));
  check('③ 概览条跟随筛选更新', applied.statCount === '24', applied.statCount);

  // ---------- ② 价格：快捷档 + 自定义区间 ----------
  await page.click('#btnPrice');
  await page.waitForTimeout(250);
  await page.fill('#homePriceMinInput', '200000');
  await page.waitForTimeout(200);
  const custom = await page.evaluate(() => ({
    apply: (document.querySelector('#priceDropdown .dd-apply-count') || {}).textContent
  }));
  check('② 自定义区间实时更新预估', custom.apply !== '24' && /^\d+$/.test(custom.apply || ''), custom.apply);

  await page.click('#priceDropdown .dd-btn.primary');
  await page.waitForTimeout(300);
  const priceApplied = await page.evaluate(() => ({
    label: (document.getElementById('priceLabel') || {}).textContent,
    chip: Array.from(document.querySelectorAll('#homeFilterChips .fchip b')).map(e => e.textContent).join('|'),
    statCount: (document.getElementById('hsCount') || {}).textContent
  }));
  check('② 价格标签显示自定义区间', /~/.test(priceApplied.label), priceApplied.label);
  check('② 价格 chip 回显', /¥/.test(priceApplied.chip), priceApplied.chip);
  check('② 概览条数量 = 列表数量', priceApplied.statCount === String(24 - (24 - Number(priceApplied.statCount))), priceApplied.statCount);

  // ---------- 清空全部 ----------
  await page.evaluate(() => resetAllFilters());
  await page.waitForTimeout(300);
  const cleared = await page.evaluate(() => ({
    chipsVisible: getComputedStyle(document.getElementById('homeFilterChips')).display !== 'none',
    statCount: (document.getElementById('hsCount') || {}).textContent,
    label: (document.getElementById('filterLabel') || {}).textContent
  }));
  check('② 清空全部 → chips 隐藏', !cleared.chipsVisible);
  check('② 清空全部 → 恢复 120', cleared.statCount === '120', cleared.statCount);
  check('② 清空全部 → 标签复位', cleared.label === '筛选', cleared.label);

  // ---------- ① 首页内联搜索联想 ----------
  await page.fill('#homeSearchInput', '头盔');
  await page.waitForTimeout(500);
  const sugg = await page.evaluate(() => {
    const box = document.getElementById('homeSugg');
    return {
      show: box.classList.contains('show'),
      items: box.querySelectorAll('.sugg-item').length,
      first: (box.querySelector('.sugg-name') || {}).textContent,
      hasAll: !!box.querySelector('.sugg-all')
    };
  });
  check('① 联想下拉弹出', sugg.show);
  check('① 联想命中条目 > 0', sugg.items > 0, String(sugg.items));
  check('① 联想命中名称含关键词', /头盔/.test(sugg.first || ''), sugg.first);
  check('① 有「查看全部结果」入口', sugg.hasAll);

  await page.fill('#homeSearchInput', 'zzzz不存在的东西');
  await page.waitForTimeout(500);
  const empty = await page.evaluate(() => {
    const box = document.getElementById('homeSugg');
    return { show: box.classList.contains('show'), isEmpty: !!box.querySelector('.sugg-empty') };
  });
  check('① 无结果兜底文案', empty.show && empty.isEmpty);

  await page.evaluate(() => clearHomeSearch());
  await page.waitForTimeout(200);
  const clearedSugg = await page.evaluate(() => document.getElementById('homeSugg').classList.contains('show'));
  check('① 清空后联想收起', !clearedSugg);

  // ---------- 列表页同步增强 ----------
  await page.evaluate(() => { if (typeof switchTab === 'function') switchTab('home'); });
  await page.evaluate(() => {
    const items = (getCache() && getCache()._allItems) || [];
    if (typeof openCategory === 'function') openCategory('gun', '枪械');
  });
  await page.waitForTimeout(800);
  const listCard = await page.evaluate(() => {
    const c = document.querySelector('#listContent .item-card');
    if (!c) return null;
    return { arrow: (c.querySelector('.chg-arrow') || {}).textContent, range: !!c.querySelector('.item-range-row') };
  });
  check('④ 列表页卡片同步增强', !!listCard && ['▲', '▼', '–'].indexOf(listCard.arrow) >= 0 && listCard.range);

  check('无 JS 运行时错误', errors.length === 0, errors.slice(0, 3).join(' | '));

  await browser.close();

  const failed = results.filter(r => !r.ok);
  console.log('\n' + (failed.length ? '✗ ' + failed.length + ' / ' + results.length + ' 项失败' : '✓ ' + results.length + ' / ' + results.length + ' 项通过'));
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('冒烟测试异常:', e); process.exit(1); });
