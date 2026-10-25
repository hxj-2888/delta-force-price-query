/**
 * 滚动条回归测试（Playwright + 系统 Chrome）
 * 目的: 锁住 2026-10-25 修的「桌面双栏下滑钮全消失」回归——
 *       滑钮必须绑在真实滚动容器上，而不是 window/document。
 * 用法: node server.js  另开一个终端后  node tools/scrollbar-smoke.cjs
 * 依赖: NODE_PATH 指向装有 playwright-core 的目录
 */
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3000/';

const MOCK = [];
const CATS = ['gun', 'ammo', 'acc', 'helmet', 'armor', 'chest', 'bag', 'key', 'collection', 'consume'];
for (let i = 0; i < 400; i++) {
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

const results = [];
function check(name, ok, extra) {
  results.push({ name, ok });
  console.log((ok ? '  OK   ' : '  FAIL ') + name + (extra !== undefined ? '  → ' + extra : ''));
}

// 注入假数据（绕开上游 API），走与线上一致的渲染入口
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
  await page.waitForTimeout(900);
}

// 取某个 pane 对应的滑钮（按 x 坐标贴近该 pane 右缘 12px 判定）
function barOfPane(page, paneId) {
  return page.evaluate((id) => {
    const p = document.getElementById(id);
    const r = p.getBoundingClientRect();
    const bar = Array.from(document.querySelectorAll('.custom-scrollbar')).find(b => {
      const br = b.getBoundingClientRect();
      return getComputedStyle(b).display !== 'none' &&
             Math.abs(br.x - (r.right - 12)) < 6 && br.height > 50;
    });
    if (!bar) return null;
    const t = bar.querySelector('.cs-thumb');
    const tr = t.getBoundingClientRect();
    return {
      thumbH: Math.round(tr.height),
      thumbW: Math.round(tr.width),
      thumbTop: Math.round(tr.y),
      cx: tr.x + tr.width / 2,
      cy: tr.y + tr.height / 2,
      scrollTop: p.scrollTop
    };
  }, paneId);
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

  // ================= 桌面 ≥1024px：双栏各自滚动 =================
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e.message)));
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    await seed(page);

    const home = await barOfPane(page, 'page-home');
    check('桌面：左栏首页有滑钮', !!home && home.thumbH >= 30, home && home.thumbH);
    check('桌面：滑钮宽度 8-12px', !!home && home.thumbW >= 8 && home.thumbW <= 12, home && home.thumbW);

    // 拖动滑钮 → 左栏滚动，右栏不动
    if (home) {
      await page.mouse.move(home.cx, home.cy);
      await page.mouse.down();
      await page.mouse.move(home.cx, home.cy + 200, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(300);
      const after = await page.evaluate(() => ({
        home: document.getElementById('page-home').scrollTop,
        dash: document.getElementById('page-dash').scrollTop
      }));
      check('桌面：拖动滑钮使左栏滚动', after.home > home.scrollTop + 100,
        home.scrollTop + ' → ' + after.home);
      check('桌面：右栏未被误滚', after.dash === 0, after.dash);
    }

    // 滚动容器 → 滑钮跟随
    const follow = await page.evaluate(() => new Promise(res => {
      const p = document.getElementById('page-home');
      p.scrollTop = 0;
      setTimeout(() => {
        const r = p.getBoundingClientRect();
        const bar = Array.from(document.querySelectorAll('.custom-scrollbar')).find(b => {
          const br = b.getBoundingClientRect();
          return getComputedStyle(b).display !== 'none' && Math.abs(br.x - (r.right - 12)) < 6;
        });
        const t0 = parseFloat(bar.querySelector('.cs-thumb').style.top) || 0;
        p.scrollTop = 1500;
        setTimeout(() => res({ t0, t1: parseFloat(bar.querySelector('.cs-thumb').style.top) || 0 }), 250);
      }, 200);
    }));
    check('桌面：滚动后滑钮跟随', follow.t1 > follow.t0, follow.t0 + ' → ' + follow.t1);

    // 右栏列表页（内容溢出）也有独立滑钮
    await page.evaluate(() => { if (typeof openCategory === 'function') openCategory('gun', '枪械'); });
    await page.waitForTimeout(1200);
    const list = await barOfPane(page, 'page-list');
    check('桌面：右栏列表有独立滑钮', !!list && list.thumbH >= 30, list && list.thumbH);

    const both = await page.evaluate(() => {
      const vis = Array.from(document.querySelectorAll('.custom-scrollbar')).filter(b => {
        const t = b.querySelector('.cs-thumb');
        return getComputedStyle(b).display !== 'none' && getComputedStyle(t).display !== 'none' &&
               b.getBoundingClientRect().height > 50;
      });
      return vis.length;
    });
    check('桌面：双栏同时两条滑钮', both === 2, both);

    // 详情页滑钮
    await page.evaluate(() => { if (typeof openDetail === 'function') openDetail(10000); });
    await page.waitForTimeout(1000);
    const detail = await barOfPane(page, 'page-detail');
    check('桌面：详情页有滑钮', !!detail && detail.thumbH >= 30, detail && detail.thumbH);

    check('桌面：无 JS 错误', errors.length === 0, errors.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ================= 窄屏 <1024px：整页滚动，只一条 =================
  {
    const ctx = await browser.newContext({ viewport: { width: 900, height: 1000 } });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    await seed(page);
    const r = await page.evaluate(() => Array.from(document.querySelectorAll('.custom-scrollbar')).filter(b => {
      const t = b.querySelector('.cs-thumb');
      return getComputedStyle(b).display !== 'none' && getComputedStyle(t).display !== 'none' &&
             b.getBoundingClientRect().height > 50;
    }).length);
    check('窄屏：恰好一条滑钮（整页滚动）', r === 1, r + ' 条');
    await ctx.close();
  }

  // ================= 移动端：不创建滑钮，保持单列 =================
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    await seed(page);
    const r = await page.evaluate(() => ({
      barCount: document.querySelectorAll('.custom-scrollbar').length,
      dashVisible: (function () {
        const d = document.getElementById('page-dash');
        if (!d) return false;
        const b = d.getBoundingClientRect();
        return b.width > 0 && b.height > 0;
      })(),
      homeW: Math.round(document.getElementById('page-home').getBoundingClientRect().width),
      viewportW: window.innerWidth,
      navVisible: (function () {
        const n = document.getElementById('bottomNav');
        return !!n && getComputedStyle(n).display !== 'none';
      })()
    }));
    check('手机：不创建滑钮 DOM', r.barCount === 0, r.barCount);
    check('手机：单列（总览隐藏）', !r.dashVisible);
    check('手机：首页占满视口宽', r.homeW === r.viewportW, r.homeW + '/' + r.viewportW);
    check('手机：底部导航可见', r.navVisible);
    await ctx.close();
  }

  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log('\n' + (failed.length ? '✗ ' + failed.length + ' / ' + results.length + ' 项失败' : '✓ ' + results.length + ' / ' + results.length + ' 项通过'));
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('滚动条冒烟异常:', e); process.exit(1); });
