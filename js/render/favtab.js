// ===== render/favtab.js — 收藏标签页 + 价格变动提醒 =====
// 功能清单: 收藏标签页渲染(renderFavTab)含合并最新价格 | 收藏价格变动检测(checkFavoritePriceChanges)
// 依赖: config.js store/cache.js store/favorites.js utils.js
// 被依赖: render/home.js app/router.js api.js

function renderFavTab() {
  var content = document.getElementById('favtabContent');
  var favs = getFavorites();
  if (favs.length === 0) {
    content.innerHTML = '<div class="empty-container"><div class="empty-icon">-</div><div class="empty-text">暂无收藏物品，在物品详情页收藏</div></div>';
    return;
  }
  var cached = getCache();
  var allItems = cached && cached._allItems ? cached._allItems : [];
  var items = favs.map(function(fav) {
    var full = allItems.find(function(i) { return i.id === fav.id; });
    return full ? Object.assign({}, fav, full) : fav;
  });
  content.innerHTML = '\n      <div class="list-stats">\n        <span>共 ' + items.length + ' 件收藏</span>\n        <span class="history-clear" onclick="clearFavorites(); renderFavTab();" style="color:#f44336;cursor:pointer">清空收藏</span>\n      </div>\n      ' + items.map(function(item) {
        var bl = item.bl || 0;
        var picHtml = item.pic
          ? '<img src="' + sanitizeUrl(smallPicUrl(item.pic, 144)) + '" alt="" loading="lazy" decoding="async" onerror="this.parentElement.innerHTML=\'<span class=pic-placeholder>-</span>\'">'
          : '<span class="pic-placeholder">-</span>';
        return '\n        <div class="item-card fade-in" onclick="openPriceMover(' + Number(item.id) + ')" style="position:relative">\n          <div class="item-pic">\n            ' + picHtml + '\n          </div>\n          <div class="item-info">\n            <div class="item-name-row">\n              <span class="item-name">' + escapeHtml(item.name) + '</span>\n              <span style="font-size:10px;color:#667eea;margin-left:6px">' + escapeHtml(CATEGORY_MAP[item._category] || item.secondClassCN || '') + '</span>\n            </div>\n            <div class="item-price-row">\n              <span class="item-price">\xA5' + formatPrice(item.price) + '</span>\n              <span class="item-change ' + getChangeClass(bl) + '">' + formatChange(bl) + '</span>\n            </div>\n          </div>\n          <span class="item-arrow">›</span>\n        </div>';
      }).join('');
}

// ===== 收藏价格变动检测（从 main.js 移入） =====
function checkFavoritePriceChanges() {
  var alertEl = document.getElementById('priceAlert');
  var sectionEl = document.getElementById('priceChangedSection');
  var itemsEl = document.getElementById('priceChangedItems');
  if (!alertEl || !sectionEl || !itemsEl) return;
  var favs = getFavorites();
  if (favs.length === 0) { alertEl.classList.remove('show'); alertEl.innerHTML = ''; sectionEl.classList.remove('show'); itemsEl.innerHTML = ''; return; }
  var cached = getCache();
  var allItems = cached && cached._allItems;
  if (!allItems || allItems.length === 0) { alertEl.classList.remove('show'); alertEl.innerHTML = ''; sectionEl.classList.remove('show'); itemsEl.innerHTML = ''; return; }

  var changes = [];
  var anyUpdated = false;
  favs.forEach(function(fav) {
    var current = allItems.find(function(item) { return item.id === fav.id; });
    if (!current || !fav.price || fav.price <= 0) return;
    if (!current.price || current.price <= 0) return;
    var changePct = (current.price - fav.price) / fav.price * 100;
    if (Math.abs(changePct) >= 25) {
      changes.push({
        name: fav.name || '未知',
        pct: changePct,
        dir: changePct > 0 ? 'up' : 'down',
        id: fav.id,
        pic: current.pic || '',
        price: current.price
      });
      fav.price = current.price;
      fav.pic = current.pic || '';
      anyUpdated = true;
    }
  });
  if (anyUpdated) {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
  }

  if (changes.length === 0) {
    alertEl.classList.remove('show'); alertEl.innerHTML = '';
    sectionEl.classList.remove('show'); itemsEl.innerHTML = '';
    return;
  }

  var text = changes.map(function(c) {
    return '<span class="price-alert-item ' + c.dir + '">' + escapeHtml(c.name) + ' ' + (c.pct > 0 ? '+' : '') + c.pct.toFixed(1) + '%</span>';
  }).join('、');
  alertEl.innerHTML = '收藏提醒: ' + text;
  alertEl.classList.add('show');

  var cardHtml = changes.map(function(c) {
    var changeText = (c.pct > 0 ? '+' : '') + c.pct.toFixed(1) + '%';
    var picHtml = c.pic
      ? '<img src="' + sanitizeUrl(smallPicUrl(c.pic, 144)) + '" alt="" loading="lazy" onerror="this.parentElement.innerHTML=\'<span style=font-size:16px>-</span>\'">'
      : '<span style="font-size:16px">-</span>';
    return '<div class="price-changed-item" onclick="openDetail(' + Number(c.id) + ')">\n        <div class="item-pic">' + picHtml + '</div>\n        <div class="item-info">\n          <div class="item-name">' + escapeHtml(c.name) + '</div>\n          <div class="item-price-row">\n            <span class="item-cur-price">\xA5' + formatPrice(c.price) + '</span>\n            <span class="item-change-pct ' + c.dir + '">' + changeText + '</span>\n          </div>\n        </div>\n      </div>';
  }).join('');
  itemsEl.innerHTML = cardHtml;
  sectionEl.classList.add('show');
}
