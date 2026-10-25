// ===== render/home.js — 首页渲染 =====
// 功能清单: 首页入口(renderHome) | 涨幅前二卡片(renderHomeTopMover) | 物品卡片+迷你折线
// 首页物品列表(renderHomeMovers)含筛选/排序/分页 | 底部分页栏 | 后台数据追加
// 依赖: config.js render/shared.js render/charts.js store/cache.js store/favorites.js utils.js
// 被依赖: app/router.js api.js

// ===== 首页入口 =====
function renderHome() {
  checkFavoritePriceChanges();
  renderHomeTopMover();
  renderHomeMovers();
}

// ===== 涨幅前二卡片 =====
function renderHomeTopMover() {
  var el = document.getElementById('topMover');
  if (!el) return;

  var cached = getCache();
  var all = cached && cached._allItems ? cached._allItems : getPrefetchItems();

  if (all.length === 0) {
    el.style.display = 'none';
    return;
  }

  var prefetched = window.__prefetch || {};
  _topMoverApiDone = !!(prefetched._topMoverApiDone);

  _renderTopMoverFromData(all);
}

function _renderTopMoverFromData(all) {
  var el = document.getElementById('topMover');
  if (!el) return;
  var candidates = [];
  all.forEach(function(item) {
    if (!item.price || item.price < 20000) return; // ★ 降噪：≥2万 才入榜（低价标的百分比暴涨是噪声）
    var v = item.day_7_bl;
    var isDay7 = v != null && v > 0.01;
    if (!isDay7) { v = item.bl; }
    if (v != null && v > 0.01) {
      candidates.push({ item: item, val: v, isDay7: isDay7 });
    }
  });
  if (candidates.length === 0) {
    el.style.display = 'none';
    return;
  }
  candidates.sort(function(a, b) { return b.val - a.val; });
  var top2 = candidates.slice(0, 2);
  el.style.display = 'block';
  /* 样式走 components.css 的 .topmover 体系；配色用语义 class（跟随红涨绿跌方案） */
  el.innerHTML =
    '<div class="tm-head">' +
      '<span class="tm-title">🔥 涨幅前二</span>' +
      '<span class="tm-sub">全市场 ≥2万</span>' +
    '</div>' +
    top2.map(function(t, idx) {
      var item = t.item;
      var val = t.val;
      var periodText = t.isDay7 ? '近7天' : '今日';
      var picHtml = item.pic
        ? '<img src="' + sanitizeUrl(smallPicUrl(item.pic, 144)) + '" alt="" loading="eager" decoding="sync" fetchpriority="high" style="width:34px;height:34px;border-radius:8px;object-fit:contain" onerror="this.style.display=\'none\'">'
        : '';
      return '<div class="tm-row" onclick="openTopMover(' + Number(item.id) + ')">' +
        '<span class="tm-rank">' + (idx + 1) + '</span>' +
        picHtml +
        '<span class="tm-name">' + escapeHtml(item.name) +
          '<small>' + periodText + ' · ' + escapeHtml(CATEGORY_MAP[item._category] || item.secondClassCN || '') + (item.grade && item._category !== 'gun' ? ' · ' + getGradeText(item.grade) : '') + '</small>' +
        '</span>' +
        '<span class="tm-px">¥' + formatPrice(item.price) + '</span>' +
        '<span class="tm-chg ' + getChangeClass(val) + '">' + formatChangeArrow(val) + ' +' + val.toFixed(2) + '%</span>' +
      '</div>';
    }).join('');
}

// ===== 迷你折线图（首页物品卡片内） =====
function _renderMiniSparkline(item) {
  var pts = getMergedPriceData(item);
  if (!pts || pts.length < 2) return '';
  var prices = pts.map(function(p) { return p.price; });
  var minP = Math.min.apply(null, prices);
  var maxP = Math.max.apply(null, prices);
  var range = (maxP - minP) || 1;
  var W = 60, H = 20;
  var padX = 2, padY = 4;
  var pw = W - padX * 2, ph = H - padY * 2;

  var ptsStr = pts.map(function(p) {
    var safeDay = Math.max(0, Math.min(p.day, 30));
    var x = padX + (1 - safeDay / 30) * pw;
    var y = padY + ph - ((p.price - minP) / range) * ph;
    return x.toFixed(1) + ',' + y.toFixed(1);
  }).join(' ');

  var isUp = pts[pts.length - 1].price >= pts[0].price;
  var color = isUp ? 'var(--up)' : 'var(--down)'; // 跟随红涨绿跌/绿涨红跌方案

  return '<div class="item-mini-spark" style="margin-top:4px">' +
    '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:60px;height:20px;display:block"><polyline points="' + ptsStr + '" fill="none" style="stroke:' + color + '" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
  '</div>';
}

// ===== 首页物品卡片 =====
function _renderHomeItemCard(item, field, maxAbsBl, isEager) {
  var bl = getFieldByPeriod(item, field) || 0;
  var gradeBg = (item._category !== 'gun' && item.grade) ? 'background:' + getGradeColor(item.grade) + '15;border-color:' + getGradeColor(item.grade) + '30;' : '';
  var gradeDiamond = (item._category !== 'gun' && item.grade) ? '<div class="grade-diamond" style="background:' + getGradeColor(item.grade) + '"></div>' : '';
  var loadingAttr = isEager ? 'loading="eager" decoding="sync"' : 'loading="lazy" decoding="async"';
  var picHtml = item.pic ? '<img src="' + sanitizeUrl(smallPicUrl(item.pic, 144)) + '" alt="" ' + loadingAttr + ' onerror="this.parentElement.innerHTML=\'<span class=pic-placeholder>-</span>\'">' : '<span class="pic-placeholder">-</span>';
  var gradeTag = (item._category !== 'gun' && item.grade) ? '<span class="item-grade" style="color:' + getGradeColor(item.grade) + '">' + getGradeText(item.grade) + '</span>' : '';
  // 品类标签：只在分类不唯一（全部/多选）时显示，单分类视图下它是冗余信息
  var catTag = homeCategoryFilter.length === 1 ? '' :
    '<span class="item-cat-tag">' + escapeHtml(CATEGORY_MAP[item._category] || item.secondClassCN || '') + '</span>';
  var sparkHtml = _renderMiniSparkline(item);
  return '<div class="item-card fade-in" data-item-id="' + Number(item.id) + '" onclick="openPriceMover(' + Number(item.id) + ')" style="position:relative;' + gradeBg + '">' +
    gradeDiamond +
    '<div class="item-pic">' + picHtml + '</div>' +
    '<div class="item-info">' +
      '<div class="item-name-row">' +
        '<span class="item-name">' + escapeHtml(item.name) + '</span>' +
        catTag + gradeTag +
      '</div>' +
      '<div class="item-price-row">' +
        '<span class="item-price">\xA5' + formatPrice(item.price) + '</span>' +
        '<span class="item-change ' + getChangeClass(bl) + '">' +
          '<span class="chg-arrow">' + formatChangeArrow(bl) + '</span>' + formatChange(bl) +
        '</span>' +
      '</div>' +
      renderItemRangeRow(item) +
      sparkHtml +
    '</div>' +
    '<span class="item-arrow">›</span>' +
  '</div>';
}

// ★ 首页默认视图（分类=全部）专属排序：把「已加载的数据 + 有图」的物品优先放进首屏。
// 规则（严格限定首页默认视图；分类 / 涨跌幅 / 价格排序逻辑一概不动）：
//   1) 有实时价格(price>0) 优先于 价格缺失(0/缺) 的
//   2) 有图片(pic 存在) 优先于 无图（占位符）的
//   3) 同分时再按原综合热度 getItemSignificance 降序，保证原有默认体验不被破坏
function _homeDefaultAllSort(a, b) {
  var na = (a.price || 0) > 0 ? 0 : 1;
  var nb = (b.price || 0) > 0 ? 0 : 1;
  if (na !== nb) return na - nb;
  var pa = a.pic ? 0 : 1;
  var pb = b.pic ? 0 : 1;
  if (pa !== pb) return pa - pb;
  return getItemSignificance(b) - getItemSignificance(a);
}

// ===== 首页物品列表（分页） =====
var _homeDataArriveListener = null;
function renderHomeMovers(resetPage) {
  if (resetPage !== false) homeCurrentPage = 1;
  var listEl = document.getElementById('homeMoversList');
  if (!listEl) return;

  var cached = getCache();
  var all = cached && cached._allItems ? cached._allItems : [];
  if (all.length === 0) {
    all = getPrefetchItems();
  }
  if (all.length === 0) {
    listEl.innerHTML = '<div class="empty-container" style="padding:20px"><div class="empty-text" style="font-size:12px">数据加载中...</div></div>';
    _homeAllFiltered = [];
    if (!_homeDataArriveListener) {
      _homeDataArriveListener = true;
      var _arriveTimeout = setTimeout(function() {
        if (_homeDataArriveListener) {
          _homeDataArriveListener = null;
        }
      }, 15000);
      var prefetched = window.__prefetch || {};
      if (typeof prefetched.onItemsArrive === 'function') {
        prefetched.onItemsArrive(function() {
          clearTimeout(_arriveTimeout);
          _homeDataArriveListener = null;
          var homePage = document.getElementById('page-home');
          if (homePage && homePage.classList.contains('active')) {
            renderHomeMovers();
            checkFavoritePriceChanges();
            renderHomeTopMover();
          }
        });
      }
    }
    return;
  }

  // ★ 筛选/排序统一走 shared 的 getHomeFilteredItems，与「查看 N 件」预估同源，避免两处口径漂移
  var field = homePeriod;
  var filtered = getHomeFilteredItems(all);
  _homeAllFiltered = filtered;

  renderHomeStatBar(filtered, field);
  renderHomeChips();

  var totalPages = Math.ceil(filtered.length / HOME_PAGE_SIZE) || 1;
  if (homeCurrentPage > totalPages) homeCurrentPage = totalPages;
  var offset = (homeCurrentPage - 1) * HOME_PAGE_SIZE;
  var items = filtered.slice(offset, offset + HOME_PAGE_SIZE);

  if (items.length === 0) {
    listEl.innerHTML = '<div class="empty-container" style="padding:20px"><div class="empty-icon" style="font-size:24px">-</div><div class="empty-text" style="font-size:12px">\u6682\u65E0\u6570\u636E\uFF0C\u8BD5\u8BD5\u653E\u5BBD\u7B5B\u9009\u6761\u4EF6</div></div>';
    return;
  }

  var maxAbsBl = 0;
  items.forEach(function(item) { var a = Math.abs(getFieldByPeriod(item, field) || 0); if (a > maxAbsBl) maxAbsBl = a; });

  var html = items.map(function(item) {
    return _renderHomeItemCard(item, field, maxAbsBl);
  }).join('');

  html += _renderPagination(totalPages, homeCurrentPage, filtered.length);

  listEl.innerHTML = html;
}

// ===== 市场宽度卡（2026-10-24：上涨/平盘/下跌家数 + 涨跌分布条，替代「均价」伪指标） =====
function renderHomeStatBar(filtered, field) {
  var bar = document.getElementById('homeStatBar');
  if (!bar) return;
  var set = function(id, txt) { var el = document.getElementById(id); if (el) el.textContent = txt; };

  var total = filtered.length;
  var up = 0, down = 0, latestTs = 0;
  for (var i = 0; i < filtered.length; i++) {
    var it = filtered[i];
    var v = getFieldByPeriod(it, field) || 0;
    if (v > 0) up++; else if (v < 0) down++;
    if (it.is_get_time > latestTs) latestTs = it.is_get_time;
  }
  var flat = total - up - down;

  set('hsUp', String(up));
  set('hsFlat', String(flat));
  set('hsDn', String(down));
  set('hsCount', formatLargeNum(total));

  /* 涨跌分布条：红/灰/绿 占比宽度（跟随 data-scheme 令牌） */
  var T = total || 1;
  var bw = function(id, n) { var el = document.getElementById(id); if (el) el.style.width = (n / T * 100).toFixed(1) + '%'; };
  bw('hsBUp', up); bw('hsBFlat', flat); bw('hsBDn', down);

  var updEl = document.getElementById('hsUpd');
  if (updEl) {
    var ft = latestTs ? formatTime(latestTs) : '--';
    if (ft === '--') {
      var ar = document.getElementById('autoRefreshTime');
      ft = ar ? ar.textContent.replace('自动刷新 ', '') : '--';
    }
    updEl.textContent = ft;
  }
  // 全跌/全涨时给个方向色，便于一眼判断今天整体行情
  var mood = document.getElementById('hsMood');
  if (mood) {
    mood.textContent = up > down ? '普涨' : down > up ? '普跌' : '持平';
    mood.className = 'hs-mood ' + (up > down ? 'up' : down > up ? 'down' : 'flat');
  }

  renderDashboard(filtered, field, up, flat, down);
}

// ===== 市场总览仪表盘（桌面双栏右栏默认视图；数据与宽度卡同源） =====
function renderDashboard(filtered, field, up, flat, down) {
  var grid = document.getElementById('dashSectorGrid');
  if (!grid) return; // 移动端没有该页 DOM，直接跳过
  var set = function(id, txt) { var el = document.getElementById(id); if (el) el.textContent = txt; };
  var T = filtered.length || 1;

  set('dashUp', String(up)); set('dashFlat', String(flat)); set('dashDown', String(down));
  var moodWord = up > down ? '普涨' : down > up ? '普跌' : '持平';
  var netPct = ((up - down) / T * 100);
  var moodEl = document.getElementById('dashMood');
  if (moodEl) moodEl.innerHTML = '市场情绪 <b class="' + (netPct > 0 ? 'up' : netPct < 0 ? 'down' : 'flat') + '">' + moodWord +
    '</b> · 净上涨 <b class="' + (netPct > 0 ? 'up' : netPct < 0 ? 'down' : 'flat') + '">' + (netPct > 0 ? '+' : '') + netPct.toFixed(1) + '%</b>';
  ['dashBUp:up', 'dashBFlat:flat', 'dashBDn:down'].forEach(function(pair) {
    var kv = pair.split(':');
    var el = document.getElementById(kv[0]);
    if (el) el.style.width = ((kv[1] === 'up' ? up : kv[1] === 'flat' ? flat : down) / T * 100).toFixed(1) + '%';
  });
  set('dashSecNote', '近' + ({ bl: '1', day_3_bl: '3', day_7_bl: '7' }[field] || '1') + '日均涨幅 · 点击进入板块');
  set('dashFoot', '共 ' + formatLargeNum(filtered.length) + ' 件标的 · 数据更新 ' + (document.getElementById('hsUpd') ? document.getElementById('hsUpd').textContent : '--'));

  // 板块表现磁贴：均涨幅（涨跌幅的算术平均，非价格均价）+ 上涨占比
  grid.innerHTML = CATEGORIES.map(function(cat) {
    var arr = filtered.filter(function(i) { return i._category === cat.key; });
    if (!arr.length) return '';
    var cUp = 0, sum = 0;
    arr.forEach(function(i) { var v = getFieldByPeriod(i, field) || 0; if (v > 0) cUp++; sum += v; });
    var avg = sum / arr.length;
    var upRatio = cUp / arr.length * 100;
    return '<button class="dash-tile" onclick="openCategory(\'' + cat.key + '\',\'' + cat.name + '\')">' +
      '<span class="sn">' + cat.name + '</span>' +
      '<span class="sv ' + getChangeClass(avg) + '" style="display:block">' + formatChangeArrow(avg) + ' ' + (avg > 0 ? '+' : '') + avg.toFixed(2) + '%</span>' +
      '<span class="sb" style="display:flex"><i style="width:' + upRatio.toFixed(0) + '%;background:var(--up)"></i><i style="flex:1;background:var(--surface-3)"></i></span>' +
      '<span class="sk" style="display:flex"><span>上涨 ' + cUp + '</span><span>共 ' + arr.length + ' 件</span></span>' +
    '</button>';
  }).join('');

  // 涨跌幅榜 TOP5（真实排序，无过滤——降噪口径只约束「涨幅前二」卡）
  var byField = filtered.slice().sort(function(a, b) { return (getFieldByPeriod(b, field) || 0) - (getFieldByPeriod(a, field) || 0); });
  var rankRow = function(it, k) {
    var v = getFieldByPeriod(it, field) || 0;
    return '<div class="dash-rank-row" onclick="openPriceMover(' + Number(it.id) + ')">' +
      '<span class="rk">' + (k + 1) + '</span>' +
      '<span class="rn" title="' + escapeHtml(it.name) + '">' + escapeHtml(it.name) + '</span>' +
      '<span class="rc num ' + getChangeClass(v) + '">' + (v > 0 ? '+' : '') + v.toFixed(2) + '%</span>' +
    '</div>';
  };
  var rankUp = document.getElementById('dashRankUp');
  var rankDn = document.getElementById('dashRankDown');
  if (rankUp) rankUp.innerHTML = byField.slice(0, 5).map(rankRow).join('');
  if (rankDn) rankDn.innerHTML = byField.slice(-5).reverse().map(rankRow).join('');
}

function renderHomeMoversWithData(items) {
  var listEl = document.getElementById('homeMoversList');
  if (!listEl || !items || items.length === 0) {
    if (listEl) listEl.innerHTML = '<div class="empty-container" style="padding:20px"><div class="empty-text" style="font-size:12px">数据加载中...</div></div>';
    return;
  }
  var field = homePeriod;
  var filtered = getHomeFilteredItems(items);
  _homeAllFiltered = filtered;
  renderHomeStatBar(filtered, field);
  renderHomeChips();
  homeCurrentPage = 1;
  var pItems = filtered.slice(0, HOME_PAGE_SIZE);
  if (pItems.length === 0) { listEl.innerHTML = '<div class="empty-container" style="padding:20px"><div class="empty-text" style="font-size:12px">暂无数据，试试放宽筛选条件</div></div>'; return; }
  var maxAbsBl = 0;
  pItems.forEach(function(item) { var a = Math.abs(getFieldByPeriod(item, field)||0); if (a > maxAbsBl) maxAbsBl = a; });
  var html = pItems.map(function(item, idx) { return _renderHomeItemCard(item, field, maxAbsBl, idx < 4); }).join('');
  var totalPages = Math.ceil(filtered.length / HOME_PAGE_SIZE) || 1;
  html += _renderPagination(totalPages, 1, filtered.length);
  listEl.innerHTML = html;
}

// ===== 分页 =====
function goToHomePage(n) {
  homeCurrentPage = n;
  var listEl = document.getElementById('homeMoversList');
  if (!listEl) return;
  var totalPages = Math.ceil(_homeAllFiltered.length / HOME_PAGE_SIZE) || 1;
  if (n < 1) n = 1;
  if (n > totalPages) n = totalPages;
  homeCurrentPage = n;
  var offset = (n - 1) * HOME_PAGE_SIZE;
  var items = _homeAllFiltered.slice(offset, offset + HOME_PAGE_SIZE);
  var field = homePeriod;
  var maxAbsBl = 0;
  items.forEach(function(item) { var a = Math.abs(getFieldByPeriod(item, field) || 0); if (a > maxAbsBl) maxAbsBl = a; });
  var html = items.map(function(item) {
    return _renderHomeItemCard(item, field, maxAbsBl);
  }).join('');
  html += _renderPagination(totalPages, n, _homeAllFiltered.length);
  listEl.innerHTML = html;
  // 翻页后回到列表顶部：桌面双栏下滚动容器是 #page-home，window 不滚动
  var pane = document.getElementById('page-home');
  if (pane && pane.scrollHeight > pane.clientHeight + 1) {
    pane.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function _renderPagination(totalPages, current, totalItems) {
  if (totalPages <= 1) {
    return '<div class="home-pagination" style="text-align:center;padding:14px 12px;color:#666;font-size:12px">共 ' + totalItems + ' 件</div>';
  }
  var html = '<div class="home-pagination" style="display:flex;align-items:center;justify-content:center;gap:6px;padding:14px 8px;flex-wrap:wrap">';
  if (current > 1) {
    html += '<button class="page-btn" onclick="goToHomePage(' + (current - 1) + ')" style="font-size:12px">‹</button>';
  } else {
    html += '<span style="width:34px"></span>';
  }
  for (var i = 1; i <= totalPages; i++) {
    if (totalPages <= 7 || i === 1 || i === totalPages || (i >= current - 1 && i <= current + 1)) {
      if (i === current) {
        html += '<button class="page-btn active">' + i + '</button>';
      } else {
        html += '<button class="page-btn" onclick="goToHomePage(' + i + ')" style="font-size:12px">' + i + '</button>';
      }
    } else if (i === current - 2 || i === current + 2) {
      html += '<span style="color:#555;width:34px;text-align:center">...</span>';
    }
  }
  if (current < totalPages) {
    html += '<button class="page-btn" onclick="goToHomePage(' + (current + 1) + ')" style="font-size:12px">›</button>';
  } else {
    html += '<span style="width:34px"></span>';
  }
  html += '<span style="color:#555;font-size:11px;margin-left:8px">共 ' + totalItems + ' 件</span>';
  html += '</div>';
  return html;
}

function appendHomeItems(newItems) {
  if (!newItems || newItems.length === 0) return;
  renderHomeMovers(false);
}

var _homeSilentUpdateTimer = null;
function scheduleHomeSilentUpdate() {
  if (_homeSilentUpdateTimer) clearTimeout(_homeSilentUpdateTimer);
  _homeSilentUpdateTimer = setTimeout(function() {
    _homeSilentUpdateTimer = null;
    var homePage = document.getElementById('page-home');
    if (!homePage || !homePage.classList.contains('active')) return;
    var cached = getCache();
    var all = cached && cached._allItems ? cached._allItems : [];
    if (all.length === 0) all = getPrefetchItems();
    if (all.length === 0) return;
    if (all.length > _homeAllFiltered.length) {
      renderHomeMovers(false);
      checkFavoritePriceChanges();
      renderHomeTopMover();
    }
  }, 500);
}

/* ================= 首页内联搜索联想 =================
   与搜索页（page-search）并存：这里只做「边输边给」的前 6 条快速跳转，
   完整结果、历史、最近浏览仍走搜索页。两者共用 searchByIndex 索引。 */
var _homeSuggTimer = null;

function onHomeSearchInput(kw) {
  var clr = document.getElementById('homeSearchClear');
  if (clr) clr.classList.toggle('visible', !!kw);
  if (_homeSuggTimer) clearTimeout(_homeSuggTimer);
  if (!kw || !kw.trim()) { hideHomeSugg(); return; }
  _homeSuggTimer = setTimeout(function() { renderHomeSugg(kw); }, 180);
}

function renderHomeSugg(kw) {
  var box = document.getElementById('homeSugg');
  if (!box) return;
  var all = getHomeAllItems();
  if (all.length === 0) { hideHomeSugg(); return; }

  var hits = searchByIndex(all, kw.trim());
  hits.sort(function(a, b) { return (b.price || 0) - (a.price || 0); });
  var top = hits.slice(0, 6);

  if (top.length === 0) {
    box.innerHTML = '<div class="sugg-empty">\u672A\u627E\u5230\u201C' + escapeHtml(kw) +
      '\u201D\u76F8\u5173\u7269\u54C1<br><span style="font-size:11px">\u6362\u4E2A\u5173\u952E\u8BCD\u6216\u6E05\u7A7A\u7B5B\u9009\u8BD5\u8BD5</span></div>';
    box.classList.add('show');
    return;
  }

  box.innerHTML = top.map(function(item) {
    var bl = getFieldByPeriod(item, homePeriod) || 0;
    var pic = item.pic
      ? '<img src="' + sanitizeUrl(smallPicUrl(item.pic, 144)) + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">'
      : '';
    return '<div class="sugg-item" onclick="openPriceMover(' + Number(item.id) + ')">' +
        '<span class="sugg-pic">' + pic + '</span>' +
        '<span class="sugg-name">' + escapeHtml(item.name) + '</span>' +
        '<span class="sugg-price">\xA5' + formatPrice(item.price) + '</span>' +
        '<span class="sugg-chg ' + getChangeClass(bl) + '">' + formatChangeArrow(bl) + formatChange(bl) + '</span>' +
      '</div>';
  }).join('') +
  '<div class="sugg-all" onclick="showSearchWith(document.getElementById(\'homeSearchInput\').value)">\u67E5\u770B\u5168\u90E8 ' +
    hits.length + ' \u4E2A\u7ED3\u679C \u203A</div>';
  box.classList.add('show');
}

function hideHomeSugg() {
  var box = document.getElementById('homeSugg');
  if (box) box.classList.remove('show');
}

function clearHomeSearch() {
  var el = document.getElementById('homeSearchInput');
  if (el) { el.value = ''; el.focus(); }
  var clr = document.getElementById('homeSearchClear');
  if (clr) clr.classList.remove('visible');
  hideHomeSugg();
}

// 带词进搜索页（回车 / 联想底部「查看全部结果」）
function showSearchWith(kw) {
  hideHomeSugg();
  showSearch();
  if (kw && kw.trim()) {
    var el = document.getElementById('searchInput');
    if (el) el.value = kw;
    var clr = document.getElementById('searchClear');
    if (clr) clr.classList.add('visible');
    var hint = document.getElementById('searchHint');
    if (hint) hint.style.display = 'none';
    doSearch(kw);
  }
}
