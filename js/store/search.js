// ===== store/search.js — 搜索历史 + 搜索索引 =====
// 功能清单: 搜索历史(最多20条,去重) | 字符级倒排索引 | 索引搜索 | ID映射
// 依赖: config.js(QUERY_HISTORY_KEY/MAX_HISTORY) utils.js(toast-运行时)
// 被依赖: api.js render/search.js app/

// ===== 搜索历史 =====
function getSearchHistory() {
  try { return JSON.parse(localStorage.getItem(QUERY_HISTORY_KEY)) || []; }
  catch(e) { return []; }
}

function saveSearchQuery(keyword) {
  if (!keyword.trim()) return;
  var history = getSearchHistory();
  history = history.filter(function(h) { return h !== keyword; });
  history.unshift(keyword);
  if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY);
  localStorage.setItem(QUERY_HISTORY_KEY, JSON.stringify(history));
}

function clearSearchHistory() {
  localStorage.removeItem(QUERY_HISTORY_KEY);
  var el = document.getElementById('searchHistory');
  if (el) el.style.display = 'none';
  toast('搜索历史已清除');
}

// ===== 搜索索引（字符级倒排索引） =====
var _searchIndex = null;
var _idMapCache = null;

function buildSearchIndex(allItems) {
  if (!allItems || allItems.length === 0) { _searchIndex = null; return; }
  var index = {};
  for (var i = 0; i < allItems.length; i++) {
    var item = allItems[i];
    if (!item.name || !item.id) continue;
    var name = item.name.toLowerCase();
    var seen = {};
    for (var j = 0; j < name.length; j++) {
      var ch = name[j];
      if (seen[ch]) continue;
      seen[ch] = true;
      if (!index[ch]) index[ch] = [];
      index[ch].push(item.id);
    }
  }
  _searchIndex = index;
  _idMapCache = {};
  for (var k = 0; k < allItems.length; k++) {
    if (allItems[k].id) _idMapCache[allItems[k].id] = allItems[k];
  }
}

function searchByIndex(allItems, keyword) {
  var kw = keyword.toLowerCase().trim();
  if (!kw) return [];
  if (!_searchIndex) {
    return allItems.filter(function(item) {
      return item.name && item.name.toLowerCase().indexOf(kw) !== -1;
    });
  }
  var charSets = [];
  for (var i = 0; i < kw.length; i++) {
    var ids = _searchIndex[kw[i]];
    if (!ids) return [];
    var set = {};
    for (var j = 0; j < ids.length; j++) { set[ids[j]] = true; }
    charSets.push(set);
  }
  charSets.sort(function(a, b) { return Object.keys(a).length - Object.keys(b).length; });
  var candidates = charSets[0];
  for (var k = 1; k < charSets.length; k++) {
    var filtered = {};
    for (var id in candidates) { if (charSets[k][id]) filtered[id] = true; }
    candidates = filtered;
    if (Object.keys(candidates).length === 0) return [];
  }
  if (!_idMapCache) _buildIdMap(allItems);
  var results = [];
  for (var id in candidates) {
    var item = _idMapCache[id];
    if (item && item.name && item.name.toLowerCase().indexOf(kw) !== -1) {
      results.push(item);
    }
  }
  return results;
}

function _buildIdMap(allItems) {
  _idMapCache = {};
  for (var i = 0; i < allItems.length; i++) {
    if (allItems[i].id) _idMapCache[allItems[i].id] = allItems[i];
  }
}

function hasSearchIndex() {
  return _searchIndex !== null;
}
