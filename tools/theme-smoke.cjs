/**
 * 双主题（浅色/深色）× 双涨跌配色（红涨/绿涨）守卫测试
 * 目的: 4 种组合下，文字/涨跌色/卡面都必须可读；切换按钮可用且持久化；图表网格跟随主题。
 * 用法: node server.js  另开一个终端后  node tools/theme-smoke.cjs
 * 依赖: NODE_PATH 指向装有 playwright-core 的目录
 */
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3000/';

const MOCK = [];
const CATS = ['gun', 'ammo', 'acc', 'helmet', 'armor', 'chest', 'bag', 'key', 'collection', 'consume'];
for (let i = 0; i < 120; i++) {
  const price = 3000 + ((i * 7919) % 900000);
  MOCK.push({
    id: 10000 + i, tid: 20000 + i, name: '测试物品 ' + i,
    price: price, bl: ((i % 21) - 10) * 1.5,
    day_3_bl: ((i % 17) - 8) * 2, day_7_bl: ((i % 13) - 6) * 2.4, day_30_bl: ((i % 11) - 5) * 3,
    price_start: Math.round(price * 0.94), day_3_price: Math.round(price * 0.9),
    day_7_price: Math.round(price * 0.86), day_30_price: Math.round(price * 0.8),
    is_get_time: Math.floor(Date.now() / 1000), _category: CATS[i % CATS.length],
    grade: (i % 6) + 1, pic: '', secondClassCN: '测试子类',
    length: 2, width: 1, weight: 0.5, objectID: 30000 + i
  });
}

// ---- WCAG 对比度 ----
function lum(rgb) {
  const [r, g, b] = rgb.map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
  const la = lum(a), lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
function parseRGB(s) {
  if (!s) return null;
  const m = String(s).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return m ? [+m[1], +m[2], +m[3]] : null;
}
// 把带 alpha 的前景叠到背景上，得到实际可见色
function flatten(fg, fgA, bg) {
  return fg.map((c, i) => Math.round(c * fgA + bg[i] * (1 - fgA)));
}

const results = [];
function check(name, ok, extra) {
  results.push({ name, ok });
  console.log((ok ? '  OK   ' : '  FAIL ') + name + (extra !== undefined ? '  → ' + extra : ''));
}

async function seed(page) {
  await page.evaluate((items) => {
    const ls = window.localStorage;
    ls.setItem('deltaforce_cache_v10', JSON.stringify({ _allItems: items }));
    ls.setItem('deltaforce_cache_time_v10', String(Date.now()));
    if (typeof setCache === 'function') setCache({ _allItems: items });
    if (typeof buildSearchIndex === 'function') buildSearchIndex(items);
    if (typeof resetAllFilters === 'function') resetAllFilters();
    const el = document.getElementById('loadingScreen');
    if (el) { el.classList.add('fade-out'); el.classList.add('removed'); }
    if (typeof renderHomeMovers === 'function') renderHomeMovers();
  }, MOCK);
  await page.waitForTimeout(600);
}

async function readColors(page) {
  return page.evaluate(() => {
    const g = (sel, prop) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el)[prop || 'color'] : null;
    };
    const card = document.querySelector('.item-card');
    return {
      theme: document.documentElement.dataset.theme,
      scheme: document.documentElement.dataset.scheme,
      bodyBg: g('body', 'backgroundColor'),
      bodyFg: g('body', 'color'),
      cardBg: card ? getComputedStyle(card).backgroundColor : null,
      cardFg: g('.item-name', 'color'),
      priceFg: g('.item-price', 'color'),
      text3: g('.item-range-row', 'color'),
      up: g('.item-change.up', 'color'),
      down: g('.item-change.down', 'color'),
      navBg: g('.bottom-nav', 'backgroundColor'),
      themeLabel: (document.getElementById('themeLabel') || {}).textContent,
      chartGrid: getComputedStyle(document.documentElement).getPropertyValue('--chart-grid').trim(),
      chartLabel: getComputedStyle(document.documentElement).getPropertyValue('--chart-label').trim()
    };
  });
}

(async () => {
  let chromium;
  try { chromium = require('playwright-core').chromium; }
  catch (e) { console.error('缺少 playwright-core，请用 NODE_PATH 指向含该模块的目录'); process.exit(1); }

  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message)));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await seed(page);

  // ===== 四种组合逐一校验 =====
  for (const theme of ['light', 'dark']) {
    for (const scheme of ['cn', 'intl']) {
      await page.evaluate(([t, s]) => {
        document.documentElement.dataset.theme = t;
        document.documentElement.dataset.scheme = s;
      }, [theme, scheme]);
      await page.waitForTimeout(250);
      const c = await readColors(page);
      const tag = theme + '/' + scheme;
      const bodyBg = parseRGB(c.bodyBg);
      const cardBg = parseRGB(c.cardBg);

      // 底色方向对不对
      const wantLight = theme === 'light';
      check(`[${tag}] 底色方向正确`, bodyBg && (lum(bodyBg) > 0.8) === wantLight,
        c.bodyBg + ' L=' + (bodyBg ? lum(bodyBg).toFixed(3) : '?'));

      // 卡面与页面底色必须能区分：用对比度比值（绝对亮度差在深色下会误判），
      // 并辅以边框可见性——浅色主题下白卡配浅灰底本来只靠 1px 描边分隔（GitHub 式）。
      const surfRatio = (bodyBg && cardBg) ? ratio(cardBg, bodyBg) : 0;
      const borderOk = await page.evaluate(() => {
        const el = document.querySelector('.item-card');
        if (!el) return false;
        const cs = getComputedStyle(el);
        const w = parseFloat(cs.borderTopWidth) || 0;
        const m = cs.borderTopColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
        const a = m && m[4] !== undefined ? parseFloat(m[4]) : 1;
        return w > 0 && a >= 0.05;
      });
      check(`[${tag}] 卡面与页面底可区分`, surfRatio >= 1.05 && borderOk,
        'ratio=' + surfRatio.toFixed(2) + ' border=' + borderOk);

      // 正文
      const fg = parseRGB(c.cardFg);
      check(`[${tag}] 卡片标题 ≥ 7:1`, cardBg && fg && ratio(fg, cardBg) >= 7,
        cardBg && fg ? ratio(fg, cardBg).toFixed(2) : '?');

      const pf = parseRGB(c.priceFg);
      check(`[${tag}] 价格 ≥ 7:1`, cardBg && pf && ratio(pf, cardBg) >= 7,
        cardBg && pf ? ratio(pf, cardBg).toFixed(2) : '?');

      const t3 = parseRGB(c.text3);
      check(`[${tag}] 次要小字 ≥ 4.5:1`, cardBg && t3 && ratio(t3, cardBg) >= 4.5,
        cardBg && t3 ? ratio(t3, cardBg).toFixed(2) : '?');

      // 涨跌色（语义方向也要对：cn=红涨、intl=绿涨）
      const up = parseRGB(c.up), down = parseRGB(c.down);
      check(`[${tag}] 涨色 ≥ 4.5:1`, cardBg && up && ratio(up, cardBg) >= 4.5,
        up ? ratio(up, cardBg).toFixed(2) : '?');
      check(`[${tag}] 跌色 ≥ 4.5:1`, cardBg && down && ratio(down, cardBg) >= 4.5,
        down ? ratio(down, cardBg).toFixed(2) : '?');

      const upIsRed = up && up[0] > up[1];
      const wantRedUp = scheme === 'cn';
      check(`[${tag}] 涨跌语义方向正确`, upIsRed === wantRedUp,
        'up=' + c.up + ' down=' + c.down);

      // 图表令牌跟随主题
      const gridLum = c.chartGrid.includes('255,255,255') ? 'light-line' : 'dark-line';
      check(`[${tag}] 图表网格线随主题`, wantLight ? gridLum === 'dark-line' : gridLum === 'light-line',
        c.chartGrid);
    }
  }

  // ===== 恢复默认，测按钮交互 =====
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'light';
    document.documentElement.dataset.scheme = 'cn';
    try { localStorage.removeItem('df_theme'); localStorage.removeItem('df_scheme'); } catch (e) {}
  });
  await page.waitForTimeout(200);

  // 按钮存在且可点
  const btn = await page.evaluate(() => {
    const b = document.getElementById('themeToggle');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { exists: true, w: Math.round(r.width), h: Math.round(r.height), text: b.textContent.trim() };
  });
  check('切换按钮存在', !!btn);
  check('切换按钮可点击（尺寸足够）', btn && btn.w >= 40 && btn.h >= 16, btn && btn.w + 'x' + btn.h);

  // 点击 → 切深色
  await page.click('#themeToggle');
  await page.waitForTimeout(400);
  const afterClick = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    label: (document.getElementById('themeLabel') || {}).textContent,
    stored: localStorage.getItem('df_theme'),
    bodyBg: getComputedStyle(document.body).backgroundColor,
    metaTheme: (document.querySelector('meta[name="theme-color"]') || {}).content
  }));
  check('点击后切到深色', afterClick.theme === 'dark', afterClick.theme);
  check('按钮文案变为「深色」', afterClick.label === '深色', afterClick.label);
  check('深色已持久化', afterClick.stored === 'dark', afterClick.stored);
  check('theme-color 跟随变深', afterClick.metaTheme === '#090c12', afterClick.metaTheme);
  const darkBg = parseRGB(afterClick.bodyBg);
  check('深色底确实是深色', darkBg && lum(darkBg) < 0.1, afterClick.bodyBg);

  // 再点 → 回浅色
  await page.click('#themeToggle');
  await page.waitForTimeout(400);
  const back = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    stored: localStorage.getItem('df_theme'),
    metaTheme: (document.querySelector('meta[name="theme-color"]') || {}).content
  }));
  check('再点回到浅色', back.theme === 'light', back.theme);
  check('浅色已持久化', back.stored === 'light', back.stored);
  check('theme-color 回到浅色', back.metaTheme === '#f5f7fa', back.metaTheme);

  // 刷新后保持选择
  await page.click('#themeToggle'); // 切到 dark
  await page.waitForTimeout(300);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const persisted = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    label: (document.getElementById('themeLabel') || {}).textContent
  }));
  check('刷新后保持深色', persisted.theme === 'dark', persisted.theme);
  check('刷新后按钮文案正确', persisted.label === '深色', persisted.label);

  // 两根轴互不干扰
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; document.documentElement.dataset.scheme = 'cn'; });
  await page.waitForTimeout(200);
  await page.click('#schemeToggle');
  await page.waitForTimeout(300);
  const orth = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    scheme: document.documentElement.dataset.scheme
  }));
  check('切涨跌配色不影响主题', orth.theme === 'light' && orth.scheme === 'intl',
    orth.theme + '/' + orth.scheme);

  // 深色下无残留浅色硬编码（抽查若干元素）
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  await page.waitForTimeout(300);
  const stray = await page.evaluate(() => {
    // evaluate 内部拿不到 Node 作用域的函数，这里自带一份亮度实现
    const L = (rgb) => {
      const [r, g, b] = rgb.map(v => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const bad = [];
    ['body', '.header', '.filter-toolbar', '.search-bar', '.item-card', '.bottom-nav', '.home-statbar'].forEach(sel => {
      const el = document.querySelector(sel);
      if (!el) return;
      const bg = getComputedStyle(el).backgroundColor;
      const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
      if (!m) return;
      const a = m[4] === undefined ? 1 : parseFloat(m[4]);
      if (a < 0.5) return; // 半透明的不算
      if (L([+m[1], +m[2], +m[3]]) > 0.6) bad.push(sel + '=' + bg);
    });
    return bad;
  });
  check('深色下无浅色残留块', stray.length === 0, stray.join(' | ') || 'clean');

  check('无 JS 错误', errs.length === 0, errs.slice(0, 3).join(' | '));

  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log('\n' + (failed.length ? '✗ ' + failed.length + ' / ' + results.length + ' 项失败' : '✓ ' + results.length + ' / ' + results.length + ' 项通过'));
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('主题冒烟异常:', e); process.exit(1); });
