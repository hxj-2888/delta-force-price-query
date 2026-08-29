// ===== render/detail.js — 详情页渲染 =====
// 功能清单: 物品详情全页渲染(renderDetail)含价格卡片/30天曲线/属性网格/来源说明
// 轻量价格更新(updateDetailPrices)重建价格+图表不闪烁 | 收藏按钮状态同步
// 依赖: config.js store/cache.js store/favorites.js utils.js maps.js render/charts.js
// 被依赖: app/router.js

function renderDetail(item) {
  var bl = item.bl || 0;
  var d3bl = item.day_3_bl || 0;
  var d7bl = item.day_7_bl || 0;
  var d30bl = item.day_30_bl || 0;
  var d3p = item.day_3_price || 0;
  var d7p = item.day_7_price || 0;
  var d30p = item.day_30_price || 0;
  var price = item.price || 0;
  var pricePoints = getMergedPriceData(item);

  var picHtml = item.pic
    ? '<img src="' + sanitizeUrl(item.pic) + '" alt="" decoding="async" fetchpriority="high" onerror="this.parentElement.innerHTML=\'<span style=font-size:36px>-</span>\'">'
    : '<span style="font-size:36px">-</span>';
  var metaHtml = '';
  if (item.secondClassCN) metaHtml += '<span class="meta-tag">' + escapeHtml(item.secondClassCN) + '</span>';
  if (item.grade) metaHtml += '<span class="meta-tag" style="color:' + getGradeColor(item.grade) + '">' + getGradeText(item.grade) + '</span>';
  var descHtml = item.desc ? '<div style="font-size:11px;color:#666;margin-top:6px;line-height:1.5">' + escapeHtml(item.desc) + '</div>' : '';

  var propsHtml = '';
  if (item.length || item.width || item.weight || item.Weight) {
    var propItems = '';
    if (item.secondClassCN) propItems += '<div class="info-item"><span class="info-label">分类</span><span class="info-value">' + escapeHtml(item.secondClassCN) + '</span></div>';
    // ★ 这些字段直接来自上游 API。预取路径（index.html）不经过 js/api.js 的 sanitizeItemArray，
    //   必须转义后再拼进 innerHTML，否则异常字符串会破坏 DOM 结构。
    if (item.length && item.width) propItems += '<div class="info-item"><span class="info-label">占格</span><span class="info-value">' + escapeHtml(item.length) + '\xD7' + escapeHtml(item.width) + '</span></div>';
    if (item.weight || item.Weight) propItems += '<div class="info-item"><span class="info-label">重量</span><span class="info-value">' + escapeHtml(item.weight || item.Weight) + ' kg</span></div>';
    if (item.grade) propItems += '<div class="info-item"><span class="info-label">等级</span><span class="info-value" style="color:' + getGradeColor(item.grade) + '">' + getGradeText(item.grade) + '</span></div>';
    if (item.objectID) propItems += '<div class="info-item"><span class="info-label">ID</span><span class="info-value" style="font-size:13px">' + escapeHtml(item.objectID) + '</span></div>';
    propsHtml = '\n      <div class="section">\n        <div class="section-title">物品属性</div>\n        <div class="info-grid">' + propItems + '</div>\n      </div>';
  }

  var detailContent = document.getElementById('detailContent');
  detailContent.innerHTML = '\n      <div class="detail-header">\n        <div class="detail-pic">\n          ' + picHtml + '\n        </div>\n        <div class="detail-basic">\n          <div class="detail-name">' + escapeHtml(item.name) + '</div>\n          <div class="detail-meta">\n            ' + metaHtml + '\n          </div>\n          ' + descHtml + '\n        </div>\n      </div>\n\n      <div class="price-card">\n        <div class="price-card-header">\n          <span class="price-card-title">当前价格</span>\n          <span class="price-card-time">更新于 ' + formatTime(item.is_get_time) + '</span>\n        </div>\n        <div class="price-main">\n          <span class="price-currency">\xA5</span>\n          <span class="price-value">' + formatPrice(price) + '</span>\n        </div>\n        <div class="price-sub">\n          <div class="sub-item">\n            <span class="sub-label">今日开盘</span>\n            <span class="sub-value">\xA5' + formatPrice(item.price_start || item.priceStart || 0) + '</span>\n          </div>\n          <div class="sub-item">\n            <span class="sub-label">今日涨跌</span>\n            <span class="sub-value ' + getChangeClass(bl) + '">' + formatChange(bl) + '</span>\n          </div>\n        </div>\n      </div>\n\n      <div class="section">\n        <div class="section-title">近30天价格趋势</div>\n        <div class="price-curve-box">\n          ' + generatePriceCurveSVG(pricePoints) + '\n          <div class="curve-legend">\n            <div class="curve-legend-item"><span class="curve-legend-dot" style="background:#888"></span>30天前 \xA5' + formatPrice(d30p) + ' <span class="' + getChangeClass(d30bl) + '" style="font-size:10px">' + formatChange(d30bl) + '</span></div>\n            <div class="curve-legend-item"><span class="curve-legend-dot" style="background:#667eea"></span>7天前 \xA5' + formatPrice(d7p) + ' <span class="' + getChangeClass(d7bl) + '" style="font-size:10px">' + formatChange(d7bl) + '</span></div>\n            <div class="curve-legend-item"><span class="curve-legend-dot" style="background:#4caf50"></span>3天前 \xA5' + formatPrice(d3p) + ' <span class="' + getChangeClass(d3bl) + '" style="font-size:10px">' + formatChange(d3bl) + '</span></div>\n            <div class="curve-legend-item"><span class="curve-legend-dot" style="background:#ffd700"></span>当前 \xA5' + formatPrice(price) + '</div>\n          </div>\n        </div>\n      </div>\n\n      ' + propsHtml + '\n\n      <div class="source-note">\n        <span>数据来源：三角洲数据帝 orzice.com 开放平台</span>\n        <span>禁止编造或篡改任何价格信息</span>\n      </div>\n    ';
  updateFavoriteButton(item.id);

  getOrFetchCloudSnapshots(item.id).then(function(cloudSnaps) {
    if (!cloudSnaps || cloudSnaps.length === 0) return;
    var cloudPricePoints = getMergedPriceData(item, cloudSnaps);
    var svgContainer = document.querySelector('.price-curve-box');
    if (!svgContainer || cloudPricePoints.length < 2) return;
    if (pageStack[pageStack.length - 1] !== 'detail') return;
    var newSvg = generatePriceCurveSVG(cloudPricePoints);
    var oldSvg = svgContainer.querySelector('svg');
    if (oldSvg) {
      oldSvg.insertAdjacentHTML('afterend', newSvg);
      oldSvg.remove();
    } else {
      svgContainer.insertAdjacentHTML('afterbegin', newSvg);
    }
  }).catch(function(e) {
    console.log('[详情] 云端历史获取失败，使用本地数据');
  });
}

function updateDetailPrices(item) {
  var container = document.getElementById('detailContent');
  if (!container) return;

  var price = item.price || 0;
  var bl = item.bl || 0;

  var priceVal = container.querySelector('.price-value');
  if (priceVal) priceVal.textContent = formatPrice(price);

  var priceTime = container.querySelector('.price-card-time');
  if (priceTime) priceTime.textContent = '更新于 ' + formatTime(item.is_get_time);

  var subValues = container.querySelectorAll('.sub-value');
  if (subValues.length >= 2) {
    subValues[0].textContent = '\xA5' + formatPrice(item.price_start || item.priceStart || 0);
    subValues[1].textContent = formatChange(bl);
    subValues[1].className = 'sub-value ' + getChangeClass(bl);
  }

  var pricePoints = getMergedPriceData(item);
  var svgContainer = container.querySelector('.price-curve-box');
  if (svgContainer && pricePoints.length >= 2) {
    var newSvg = generatePriceCurveSVG(pricePoints);
    var oldSvg = svgContainer.querySelector('svg');
    if (oldSvg) {
      oldSvg.insertAdjacentHTML('afterend', newSvg);
      oldSvg.remove();
    }
  }

  var legendItems = container.querySelectorAll('.curve-legend-item');
  if (legendItems.length >= 4) {
    var d30bl = item.day_30_bl || 0;
    var d7bl = item.day_7_bl || 0;
    var d3bl = item.day_3_bl || 0;
    var changeSpans = container.querySelectorAll('.curve-legend-item [class*="change"]');
    if (changeSpans.length >= 3) {
      if (changeSpans[0]) { changeSpans[0].textContent = formatChange(d30bl); changeSpans[0].className = getChangeClass(d30bl); }
      if (changeSpans[1]) { changeSpans[1].textContent = formatChange(d7bl); changeSpans[1].className = getChangeClass(d7bl); }
      if (changeSpans[2]) { changeSpans[2].textContent = formatChange(d3bl); changeSpans[2].className = getChangeClass(d3bl); }
    }
  }

  getOrFetchCloudSnapshots(item.id).then(function(cloudSnaps) {
    if (!cloudSnaps || cloudSnaps.length === 0) return;
    if (pageStack[pageStack.length - 1] !== 'detail') return;
    var cloudPoints = getMergedPriceData(item, cloudSnaps);
    var svgBox = container.querySelector('.price-curve-box');
    if (!svgBox || cloudPoints.length < 2) return;
    var svg = svgBox.querySelector('svg');
    var newSvgHtml = generatePriceCurveSVG(cloudPoints);
    if (svg) {
      svg.insertAdjacentHTML('afterend', newSvgHtml);
      svg.remove();
    }
  }).catch(function() {});
}

function updateFavoriteButton(itemId) {
  var btn = document.getElementById('detailFavBtn');
  if (!btn) return;
  if (isFavorited(itemId)) {
    btn.classList.add('favorited');
  } else {
    btn.classList.remove('favorited');
  }
}
