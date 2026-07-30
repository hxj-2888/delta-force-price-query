// ===== maps.js — 地图归属映射 =====
// 功能清单: 5张游戏地图定义(零号大坝/长弓溪谷/航天基地/巴克什/监狱) | 钥匙卡pic URL→地图映射(4规则)
// 收集品关键词→地图映射(40+关键词) | findItemMap(综合查询) | getKeyMapFromPic(pic URL匹配)
// 依赖: 无(纯静态数据) | 被依赖: render.js(详情页地图归属显示)
// 改动影响: 修改关键词→影响收集品/钥匙地图归属; 新增地图→需同步更新MAPS和规则

// 地图定义（无 emoji）
var MAPS = {
  zero_dam:    { key: 'zero_dam',    name: '零号大坝', order: 1 },
  longbow:     { key: 'longbow',     name: '长弓溪谷', order: 2 },
  space_base:  { key: 'space_base',  name: '航天基地', order: 3 },
  brakkesh:    { key: 'brakkesh',    name: '巴克什',   order: 4 },
  prison:      { key: 'prison',      name: '监狱',     order: 5 }
};

// ===== 钥匙卡 pic URL → 地图映射（API 真实数据提取）=====
var KEY_PIC_MAP_RULES = [
  { pattern: '/key/p_%E9%9B%B6%E5%8F%B7%E5%A4%A7%E5%9D%9D', map: 'zero_dam' },   // p_零号大坝白卡
  { pattern: '/key/p_%E9%95%BF%E5%BC%93%E6%BA%AA%E8%B0%B7', map: 'longbow' },     // p_长弓溪谷白卡
  { pattern: '/key/p_%E8%88%AA%E5%A4%A9%E5%9F%BA%E5%9C%B0', map: 'space_base' },  // p_航天基地白卡/金卡
  { pattern: '/key/p_%E5%B7%B4%E5%85%8B%E4%BB%80',         map: 'brakkesh' }      // p_巴克什白卡
];

// ===== 监狱钥匙卡关键词（pic URL 无地图信息，靠名称匹配）=====
var PRISON_KEY_KEYWORDS = [
  '监狱', '仓库区', '顶层', '水位控制室'
];

// ===== 收集品 → 地图映射（基于游戏知识，API 不提供此数据）=====
var COLLECTION_MAP_RULES = [
  // 零号大坝专属
  { kw: ['纪念奖杯','金条','黄金瞪羚','优秀雇员奖杯','渡鸦项坠','聚乙烯纤维'], map: 'zero_dam' },

  // 长弓溪谷专属
  { kw: ['绝密服务器','劳力士怀表','香槟','军用终端','重型突击背心','显卡','阵列服务器','可编程处理器','镜头','动力电池组'], map: 'longbow' },

  // 航天基地专属
  { kw: ['超算单元','军用电台','牌表','滑膛枪','高能瓦斯罐','E型滤毒罐','装甲车电池'], map: 'space_base' },

  // 巴克什专属
  { kw: ['非洲之星','留声机','三幻神','海盗弯刀','卫队金扳指','特种钢','OLIGHT','脑机'], map: 'brakkesh' },

  // 监狱专属
  { kw: ['电子脚镣','高出力粉碎钳','军用无人机','潮汐监狱','飞行员眼镜'], map: 'prison' },

  // 全地图通用（不标记具体地图）
  { kw: ['扑克牌'], map: 'all' },
  { kw: ['八宝粥','神奇八宝粥'], map: 'all' }
];

/**
 * 根据物品 pic URL 判断钥匙卡所属地图
 * @param {string} picUrl 物品图片 URL
 * @returns {string|null} 地图 key 或 null
 */
function getKeyMapFromPic(picUrl) {
  if (!picUrl) return null;
  for (var i = 0; i < KEY_PIC_MAP_RULES.length; i++) {
    if (picUrl.indexOf(KEY_PIC_MAP_RULES[i].pattern) !== -1) {
      return KEY_PIC_MAP_RULES[i].map;
    }
  }
  // pic URL 无地图前缀（object/ 路径），检查是否监狱钥匙
  if (picUrl.indexOf('/object/') !== -1) return 'prison';
  return null;
}

/**
 * 根据物品名称查找所属地图
 * @param {string} name 物品名称
 * @param {string} category 分类（'key' 或 'collection'）
 * @param {string} [picUrl] 物品图片 URL（钥匙卡优先使用）
 * @returns {object|null} 地图信息或 null
 */
function findItemMap(name, category, picUrl) {
  if (!name) return null;

  if (category === 'key') {
    // 优先使用 pic URL 匹配（100% 准确）
    var picMap = getKeyMapFromPic(picUrl);
    if (picMap) return MAPS[picMap] || null;

    // fallback: 关键词匹配
    var kw = name.toLowerCase();
    for (var i = 0; i < PRISON_KEY_KEYWORDS.length; i++) {
      if (kw.indexOf(PRISON_KEY_KEYWORDS[i].toLowerCase()) !== -1) {
        return MAPS['prison'] || null;
      }
    }
    return null;
  }

  // 收集品：关键词匹配
  if (category === 'collection') {
    var kw2 = name.toLowerCase();
    for (var i = 0; i < COLLECTION_MAP_RULES.length; i++) {
      var rule = COLLECTION_MAP_RULES[i];
      for (var j = 0; j < rule.kw.length; j++) {
        if (kw2.indexOf(rule.kw[j].toLowerCase()) !== -1) {
          if (rule.map === 'all') return null;
          return MAPS[rule.map] || null;
        }
      }
    }
    return null;
  }

  return null;
}

