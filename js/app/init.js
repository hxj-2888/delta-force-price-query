// ===== app/init.js — 初始化 + 定时器 + 事件绑定 + 滚动条 =====
// 功能清单: 自动刷新定时器(startHomeAutoRefresh) | 每日价格记录(globalDailyRecord)
// DOMContentLoaded事件绑定(搜索输入/键盘) | 页面可见性处理(visibilitychange)
// 启动初始化(图标缓存提取/renderHome/元数据降级检测) | 预加载流程(preload含loading动画)
// 自定义滚动条(桌面端)
// 依赖: 所有 config/store/render/api/app 模块
// 被依赖: 无（入口文件，最后加载）

// ===== 自动刷新定时器 =====
var homeRefreshTimer = null;

function startHomeAutoRefresh() {
  stopHomeAutoRefresh();
  function doAutoRefresh() {
    var homePage = document.getElementById('page-home');
    if (!homePage || !homePage.classList.contains('active') || pageStack[pageStack.length - 1] !== 'home') return;
    var cached = getCache();
    if (cached && cached._allItems && cached._allItems.length > 0) {
      recordAllItemsPrices(cached._allItems);
      mergeSWPriceHistory();
    }
    var alertEl = document.getElementById('priceAlert');
    var hadAlert = alertEl && alertEl.classList.contains('show');
    checkFavoritePriceChanges();
    renderHomeTopMover();
    if (alertEl && alertEl.classList.contains('show') && !hadAlert) {
      toast('收藏物品价格发生变动，点击查看', 3000);
    }
    var refreshIndicator = document.getElementById('autoRefreshTime');
    if (refreshIndicator) {
      var now = new Date();
      refreshIndicator.textContent = '自动刷新 ' +
        String(now.getHours()).padStart(2,'0') + ':' +
        String(now.getMinutes()).padStart(2,'0') + ':' +
        String(now.getSeconds()).padStart(2,'0');
    }
  }
  doAutoRefresh();
  // 自动刷新降频: 5 分钟 → 1 小时（减少后台活动与本地写入）
  homeRefreshTimer = setInterval(doAutoRefresh, 3600000);
}

function stopHomeAutoRefresh() {
  if (homeRefreshTimer) {
    clearInterval(homeRefreshTimer);
    homeRefreshTimer = null;
  }
}

// ===== 每日价格记录定时器 =====
var globalDailyRecordTimer = null;

function doRecordDaily() {
  var cached = getCache();
  if (cached && cached._allItems && cached._allItems.length > 0) {
    mergeSWPriceHistory().then(function() { recordAllItemsPrices(cached._allItems); });
  }
}

function startGlobalDailyRecord() {
  stopGlobalDailyRecord();
  doRecordDaily();
  // 价格记录降频: 30 分钟 → 1 小时
  globalDailyRecordTimer = setInterval(doRecordDaily, 3600000);
}

function stopGlobalDailyRecord() {
  if (globalDailyRecordTimer) {
    clearInterval(globalDailyRecordTimer);
    globalDailyRecordTimer = null;
  }
}

// ===== DOMContentLoaded 事件绑定 =====
document.addEventListener('DOMContentLoaded', function() {
  if (typeof moveDropdownsToBody === 'function') moveDropdownsToBody();

  document.getElementById('searchInput').addEventListener('input', function(e) {
    var kw = e.target.value;
    var clearBtn = document.getElementById('searchClear');
    clearBtn.classList.toggle('visible', kw.length > 0);

    if (searchTimer) clearTimeout(searchTimer);
    if (!kw.trim()) {
      document.getElementById('searchHint').style.display = 'block';
      document.getElementById('searchResults').innerHTML = '';
      return;
    }
    searchTimer = setTimeout(function() { doSearch(kw); }, 300);
  });

  document.getElementById('searchInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      if (searchTimer) clearTimeout(searchTimer);
      doSearch(e.target.value);
    }
  });

  // 点击首页搜索框之外 → 收起联想下拉
  document.addEventListener('click', function(e) {
    var bar = document.getElementById('homeSearchBar');
    if (bar && !bar.contains(e.target) && typeof hideHomeSugg === 'function') hideHomeSugg();
  });
});

// ===== 页面可见性处理 =====
document.addEventListener('visibilitychange', function() {
  if (document.hidden) {
    stopHomeAutoRefresh();
    stopGlobalDailyRecord();
  } else {
    startHomeAutoRefresh();
    startGlobalDailyRecord();
    var cached = getCache();
    if (!cached || !cached._allItems || cached._allItems.length < 50) {
      loadAllItems(false).then(function() {
        if (pageStack[pageStack.length - 1] === 'home') {
          checkFavoritePriceChanges();
          renderHomeTopMover();
          renderHomeMovers(false);
        }
        preWarmFavTab();
      }).catch(function(){});
    } else {
      loadAllItems(true).catch(function(){});
    }
  }
});

// ===== 启动初始化 =====
if (!getCatIconsCache()) {
  try {
    var raw = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (raw && raw._allItems && raw._allItems.length > 0) {
      var picks = {};
      raw._allItems.forEach(function(item) {
        var cat = item._category;
        if (cat && !picks[cat] && item.pic) picks[cat] = item.pic;
      });
      var logisticsItem = raw._allItems.find(function(i) { return i.name === '物流信息单' && i.pic; });
      if (logisticsItem) picks['all'] = logisticsItem.pic;
      if (Object.keys(picks).length > 0) setCatIconsCache(picks);
    }
  } catch(e) { console.warn('图标缓存提取失败:', e); }
}
renderHome();

// 检测元数据降级
(function checkMetadataDegraded() {
  var prefetched = window.__prefetch || {};
  if (typeof prefetched.isMetadataDegraded === 'function' && prefetched.isMetadataDegraded()) {
    var alertEl = document.getElementById('priceAlert');
    if (alertEl) {
      alertEl.innerHTML = '⚠️ 物品元数据加载失败，部分物品名称可能显示为"物品#ID"。请刷新重试。';
      alertEl.classList.add('show');
    }
  }
})();

// ===== 预加载 =====
(function preload() {
  var cached = getCache();
  var loadingScreen = document.getElementById('loadingScreen');
  var loadingLogo = document.getElementById('loadingLogo');
  var loadingGlow = document.getElementById('loadingGlow');
  var loadingProgressBar = document.getElementById('loadingProgressBar');
  var loadingStatus = document.getElementById('loadingStatus');
  var loadStart = Date.now();
  // ★ 必须大于服务端中继上限（本地 22s / 线上 Functions 25s）。这里原本是 10000，
//   而上游 orzice.com 经 Cloudflare 转发单次就要 10~15s：加载层会在数据还在路上时
//   就判定超时，弹出「连接超时 / 重新加载」，而数据随后正常到达并渲染——
//   用户看到的是「页面像坏了」，与真实故障无法区分。
var LOADING_TIMEOUT = 40000;
  var _loadingHidden = false;

  function setProgress(ratio, statusText) {
    if (_loadingHidden) return;
    var pct = Math.round(ratio * 100);
    loadingProgressBar.style.width = pct + '%';
    loadingLogo.style.filter = 'blur(' + ((20 * (1 - ratio)).toFixed(1)) + 'px)';
    loadingGlow.style.opacity = ratio.toFixed(2);
    if (statusText) loadingStatus.textContent = statusText;
  }

  function hideLoading() {
    if (_loadingHidden || loadingScreen.classList.contains('fade-out')) return;
    _loadingHidden = true;
    // 数据迟到时收起加载层会顺带带上错误横幅，必须一并清掉：
    // 否则「连接超时 / 重新加载」会一直压在已经渲染出价格的页面上。
    var errWrap = document.getElementById('loadingRetryWrap');
    if (errWrap) errWrap.style.display = 'none';
    setProgress(1, '数据就绪');
    setTimeout(function() {
      loadingScreen.classList.add('fade-out');
      setTimeout(function() { loadingScreen.classList.add('removed'); }, 400);
    }, 200);
  }

  function showAndContinueLoading(allItems, skipCache) {
    if (!allItems || allItems.length === 0) {
      hideLoading();
      return;
    }
    if (!skipCache) setCache({ _allItems: allItems });
    if (typeof buildSearchIndex === 'function') buildSearchIndex(allItems);
    updateCategoryIcons(allItems);
    checkFavoritePriceChanges();
    renderHomeTopMover();
    renderHomeMoversWithData(allItems);
    setProgress(0.55, '已展示 ' + allItems.length + ' 件，继续加载更多...');

    var _pollTimer = setInterval(function() {
      if (_loadingHidden) { clearInterval(_pollTimer); return; }
      var prefetched = window.__prefetch || {};
      var realProgress = (typeof prefetched.getProgress === 'function')
        ? prefetched.getProgress()
        : 0;
      var expected = (typeof prefetched.getExpectedTotal === 'function')
        ? prefetched.getExpectedTotal()
        : 0;
      var arrived = (typeof prefetched.getTotalArrived === 'function')
        ? prefetched.getTotalArrived()
        : allItems.length;
      var displayProgress = 0.55 + realProgress * 0.43;
      if (displayProgress > 0.98) displayProgress = 0.98;
      setProgress(displayProgress, '已加载 ' + arrived + (expected > 0 ? '/' + expected : '') + ' 件...');
      if (arrived >= expected && expected > 0 && arrived > 100) {
        clearInterval(_pollTimer);
        hideLoading();
      }
      if (typeof prefetched.isPaginationDone === 'function' && prefetched.isPaginationDone() && arrived > 100) {
        clearInterval(_pollTimer);
        hideLoading();
      }
    }, 400);

    if (!skipCache) {
      setTimeout(function() {
        loadAllItemsBackground(allItems).then(function(fullItems) {
          if (fullItems && fullItems.length > allItems.length) {
            if (typeof buildSearchIndex === 'function') buildSearchIndex(fullItems);
            updateCategoryIcons(fullItems);
            scheduleHomeSilentUpdate();
          }
        });
      }, 100);
    }
  }

  // ===== 有缓存：快速展示，后台刷新 =====
  if (cached && cached._allItems && cached._allItems.length > 0) {
    var homeList = document.getElementById('homeMoversList');
    if (homeList) homeList.innerHTML = '';
    var topMover = document.getElementById('topMover');
    if (topMover) topMover.style.display = 'none';

    updateCategoryIcons(cached._allItems);
    buildSearchIndex(cached._allItems);
    mergeSWPriceHistory().then(function() { recordAllItemsPrices(cached._allItems); });
    var steps = [0, 0.2, 0.45, 0.7, 0.9, 1];
    steps.forEach(function(ratio, i) {
      setTimeout(function() {
        setProgress(ratio, ratio < 0.3 ? '正在准备...' : ratio < 0.7 ? '正在同步最新价格' : ratio < 1 ? '即将就绪' : '数据就绪');
        if (ratio === 1) {
          setTimeout(function() { renderHomeMovers(); renderHomeTopMover(); }, 50);
          setTimeout(function() { hideLoading(); }, 150);
        }
      }, i * 80);
    });
    setTimeout(function() { loadAllItems(true).catch(function(){}); }, 800);
    registerPeriodicSync();
    startHomeAutoRefresh();
    startGlobalDailyRecord();
    return;
  }

  // ===== 无缓存：v3 双请求合并 =====
  var prefetched = window.__prefetch || {};
  setProgress(0.05, '正在连接数据源...');

  var _noCacheAllItems = [];
  var _noCacheDone = false;
  var _progressTimer = null;

  if (typeof prefetched.onItemsArrive === 'function') {
    prefetched.onItemsArrive(function(newItems, totalArrived) {
      _noCacheAllItems = _noCacheAllItems.concat(newItems);
      if (!_noCacheDone && _noCacheAllItems.length >= 30) {
        _noCacheDone = true;
        if (_progressTimer) clearInterval(_progressTimer);
        setCache({ _allItems: _noCacheAllItems });
        if (typeof buildSearchIndex === 'function') buildSearchIndex(_noCacheAllItems);
        updateCategoryIcons(_noCacheAllItems);
        checkFavoritePriceChanges();
        renderHomeTopMover();
        renderHomeMoversWithData(_noCacheAllItems);
        setProgress(1, '已加载 ' + totalArrived + ' 件');
        setTimeout(function() { hideLoading(); }, 300);
      }
    });
  }

  setProgress(0.08, '正在请求数据...');
  var _progressStage = 0;
  _progressTimer = setInterval(function() {
    _progressStage++;
    if (_loadingHidden || _noCacheDone) { clearInterval(_progressTimer); return; }
    var fakeRatio = Math.min(0.08 + _progressStage * 0.06, 0.9);
    setProgress(fakeRatio, '正在拉取实时价格...');
  }, 200);

  if (prefetched._allPage1Ready) {
    prefetched._allPage1Ready.then(function(sortedAll) {
      if (!sortedAll || sortedAll.length === 0 || _noCacheDone) return;
      _noCacheDone = true;
      if (_progressTimer) clearInterval(_progressTimer);
      setCache({ _allItems: sortedAll });
      if (typeof buildSearchIndex === 'function') buildSearchIndex(sortedAll);
      updateCategoryIcons(sortedAll);
      checkFavoritePriceChanges();
      renderHomeTopMover();
      renderHomeMoversWithData(sortedAll);
      setProgress(1, '已加载 ' + sortedAll.length + ' 件');
      setTimeout(function() { hideLoading(); }, 300);
    }).catch(function() {});
  }

  setTimeout(function() {
    if (_loadingHidden || (loadingScreen && loadingScreen.classList.contains('fade-out'))) return;
    if (_progressTimer) clearInterval(_progressTimer);
    if (!_noCacheDone) {
      _noCacheDone = true;
      var items = (typeof prefetched.getAllPage1Items === 'function')
        ? prefetched.getAllPage1Items()
        : _noCacheAllItems;
      if (items.length > 0) {
        setCache({ _allItems: items });
        if (typeof buildSearchIndex === 'function') buildSearchIndex(items);
        updateCategoryIcons(items);
        renderHomeTopMover();
        renderHomeMoversWithData(items);
        hideLoading();
      } else {
        var errWrap = document.getElementById('loadingRetryWrap');
        var errText = document.getElementById('loadingErrorText');
        var statusEl = document.getElementById('loadingStatus');
        if (errWrap) errWrap.style.display = 'flex';
        if (errText) errText.textContent = '数据加载超时，请检查网络后重试';
        if (statusEl) statusEl.textContent = '连接超时';
        setProgress((prefetched && prefetched.getProgress) ? prefetched.getProgress() : 0.2, '');
      }
    } else {
      hideLoading();
    }
  }, LOADING_TIMEOUT);

  registerPeriodicSync();
  startHomeAutoRefresh();
  startGlobalDailyRecord();
})();

// ===== 自定义滚动条（仅鼠标设备） =====
// 2026-10-25 重写：原实现只绑定 window/document 的滚动高度。桌面 ≥1024px 双栏布局下
// document 本身不滚动（左右两栏各自 overflow-y:auto），于是 getScrollHeight() 恒等于
// window.innerHeight → sh <= vh → 滑钮被判定"无需滚动"而 display:none，全站滑钮消失。
// 新实现：为每个真实滚动容器各挂一条滚动条，按容器自身的 scrollTop/scrollHeight/clientHeight
// 计算；容器不可滚动或不可见时自动隐藏。移动端（pointer: coarse）整块不初始化，交给系统滑动。
(function initCustomScrollbar() {
  if (!window.matchMedia || !window.matchMedia('(pointer: fine)').matches) {
    return;
  }

  var MIN_THUMB = 32;
  var GUTTER = 12;          // 滚动条距容器右边缘的距离
  var EDGE_PAD = 8;         // 上下留白
  var instances = [];
  var pending = false;

  // 桌面双栏下每个 .page 各自滚动；窄屏下整页滚动（scroller 为 null 时代表 document）
  var PANE_IDS = ['page-home', 'page-dash', 'page-list', 'page-detail', 'page-search', 'page-favtab'];

  function docScroller() {
    return {
      scrollTop: function() { return window.pageYOffset || document.documentElement.scrollTop || 0; },
      scrollHeight: function() { return Math.max(document.body.scrollHeight, document.documentElement.scrollHeight); },
      clientHeight: function() { return window.innerHeight; },
      scrollTo: function(y) { window.scrollTo(0, y); }
    };
  }

  function elScroller(el) {
    return {
      scrollTop: function() { return el.scrollTop; },
      scrollHeight: function() { return el.scrollHeight; },
      clientHeight: function() { return el.clientHeight; },
      scrollTo: function(y) { el.scrollTop = y; }
    };
  }

  function createInstance(getScroller, anchorEl) {
    var bar = document.createElement('div');
    bar.className = 'custom-scrollbar';
    bar.innerHTML = '<div class="cs-track"><div class="cs-thumb"></div></div>';
    document.body.appendChild(bar);

    var track = bar.querySelector('.cs-track');
    var thumb = bar.querySelector('.cs-thumb');
    var dragging = false;
    var startY = 0;
    var startTop = 0;

    var inst = {
      bar: bar,
      track: track,
      thumb: thumb,
      getScroller: getScroller,
      anchorEl: anchorEl,
      update: update
    };

    // ★ 必须先让 bar 可见再量 track.clientHeight：隐藏元素的 clientHeight 为 0，
    //   否则会"量不到 → 隐藏 → 更量不到"死锁。
    function metrics() {
      var sc = getScroller();
      var sh = sc.scrollHeight();
      var ch = sc.clientHeight();
      if (!sh || !ch || sh <= ch + 1) return null;      // 容器本身不可滚动
      var trackH = track.clientHeight;
      if (trackH <= 0) return null;
      var thumbH = Math.max((ch / sh) * trackH, MIN_THUMB);
      if (thumbH >= trackH) return null;
      return { sc: sc, ch: ch, trackH: trackH, thumbH: thumbH,
               maxScroll: sh - ch, maxTop: trackH - thumbH };
    }

    function update() {
      bar.style.display = 'block';
      var m = metrics();
      if (!m) { bar.style.display = 'none'; return; }
      thumb.style.display = 'block';
      thumb.style.height = m.thumbH + 'px';
      if (dragging) return;
      var top = m.maxScroll > 0 ? (m.sc.scrollTop() / m.maxScroll) * m.maxTop : 0;
      thumb.style.top = Math.max(0, Math.min(top, m.maxTop)) + 'px';
    }

    function onStart(e) {
      var m = metrics();
      if (!m) return;
      e.preventDefault();
      e.stopPropagation();
      dragging = true;
      bar.classList.add('cs-dragging');
      startY = e.touches ? e.touches[0].clientY : e.clientY;
      startTop = parseFloat(thumb.style.top) || 0;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('mouseup', onEnd);
      document.addEventListener('touchend', onEnd);
    }

    function onMove(e) {
      if (!dragging) return;
      var m = metrics();
      if (!m) return;
      e.preventDefault();
      var y = e.touches ? e.touches[0].clientY : e.clientY;
      var newTop = Math.max(0, Math.min(startTop + (y - startY), m.maxTop));
      thumb.style.top = newTop + 'px';
      m.sc.scrollTo(m.maxTop > 0 ? (newTop / m.maxTop) * m.maxScroll : 0);
    }

    function onEnd() {
      if (!dragging) return;
      dragging = false;
      bar.classList.remove('cs-dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchend', onEnd);
    }

    thumb.addEventListener('mousedown', onStart);
    thumb.addEventListener('touchstart', onStart, { passive: false });

    // 点轨道空白处 → 按一屏翻页（不直接跳到鼠标处，避免误触丢失阅读位置）
    track.addEventListener('mousedown', function(e) {
      if (e.target === thumb) return;
      var m = metrics();
      if (!m) return;
      e.preventDefault();
      var rect = track.getBoundingClientRect();
      var clickY = e.clientY - rect.top;
      var thumbTop = parseFloat(thumb.style.top) || 0;
      var page = m.ch * 0.9;
      var target = m.sc.scrollTop() + (clickY < thumbTop ? -page : page);
      m.sc.scrollTo(Math.max(0, Math.min(target, m.maxScroll)));
      update();
    });

    instances.push(inst);
    return inst;
  }

  // 文档级（窄屏单列整页滚动）
  createInstance(docScroller, null);
  // 每个页面容器各一条
  PANE_IDS.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) createInstance(function() { return elScroller(el); }, el);
  });

  // ===== 定位：贴容器可视区右边缘内侧，竖直范围与容器可视高度对齐 =====
  function layout() {
    var vh = window.innerHeight;
    var docW = document.documentElement.clientWidth;
    // 底部导航可见时，滚动条不要压到它上面
    var nav = document.getElementById('bottomNav');
    var navH = 0;
    if (nav && getComputedStyle(nav).display !== 'none') {
      var nr = nav.getBoundingClientRect();
      if (nr.height > 0 && nr.top < vh) navH = vh - nr.top;
    }
    instances.forEach(function(inst) {
      var rect;
      if (inst.anchorEl) {
        var r = inst.anchorEl.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) { inst.bar.style.display = 'none'; return; }
        rect = r;
      } else {
        rect = { top: 0, left: 0, width: docW, height: vh };
      }
      var barTop = Math.max(rect.top, 0) + EDGE_PAD;
      var barBottom = Math.min(rect.top + rect.height, vh - navH) - EDGE_PAD;
      var barH = barBottom - barTop;
      if (barH < 80) { inst.bar.style.display = 'none'; return; }
      inst.bar.style.top = barTop + 'px';
      inst.bar.style.height = barH + 'px';
      inst.bar.style.left = (rect.left + rect.width - GUTTER) + 'px';
      inst.bar.style.right = 'auto';
      inst.update();
    });
  }

  function refresh() {
    if (pending) return;
    pending = true;
    var raf = window.requestAnimationFrame || function(fn) { return setTimeout(fn, 16); };
    raf(function() { pending = false; layout(); });
  }

  // ===== 滚动位置持久化：桌面双栏下 .page 是滚动容器，原 window.scrollTo 失效 =====
  // 原实现 saveBrowseState 存 window.pageYOffset（双栏下恒为 0），返回首页时滚动位置丢失。
  // 这里把当前可见 pane 的 scrollTop 补记进去，并支持按容器还原。
  function activePaneEl() {
    for (var i = 0; i < PANE_IDS.length; i++) {
      var el = document.getElementById(PANE_IDS[i]);
      if (el && el.classList.contains('active')) {
        var r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return el;
      }
    }
    return null;
  }

  window.__dfGetScrollTop = function() {
    var el = activePaneEl();
    if (el && el.scrollHeight > el.clientHeight + 1) return el.scrollTop;
    return window.pageYOffset || document.documentElement.scrollTop || 0;
  };

  window.__dfRestoreScrollTop = function(y) {
    if (!y) return;
    var el = activePaneEl();
    if (el && el.scrollHeight > el.clientHeight + 1) {
      el.scrollTop = y;
    } else {
      window.scrollTo(0, y);
    }
    refresh();
  };

  // 各容器滚动事件不冒泡到 window，用 capture 统一收集
  window.addEventListener('scroll', refresh, { passive: true, capture: true });
  window.addEventListener('resize', refresh);
  window.addEventListener('load', refresh);

  // 容器显隐（切页）/ 内容高度变化 → 重算
  if (window.ResizeObserver) {
    var ro = new ResizeObserver(refresh);
    instances.forEach(function(inst) { if (inst.anchorEl) ro.observe(inst.anchorEl); });
    ro.observe(document.body);
  }
  // 列表重渲染 / 筛选面板展开 → 重算
  if (window.MutationObserver) {
    var mo = new MutationObserver(refresh);
    mo.observe(document.body, { childList: true, subtree: true });
  }

  layout();
  setTimeout(refresh, 300);
  setTimeout(refresh, 1200);
})();
