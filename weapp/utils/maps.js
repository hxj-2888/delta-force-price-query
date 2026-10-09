// ===== 地图数据 & 钥匙/收集品归属映射 =====

const MAPS = {
  zero_dam: { key: 'zero_dam', name: '零号大坝', order: 1 },
  longbow: { key: 'longbow', name: '长弓溪谷', order: 2 },
  space_base: { key: 'space_base', name: '航天基地', order: 3 },
  brakkesh: { key: 'brakkesh', name: '巴克什', order: 4 },
  prison: { key: 'prison', name: '监狱', order: 5 }
};

const KEY_PIC_MAP_RULES = [
  { pattern: '/key/p_%E9%9B%B6%E5%8F%B7%E5%A4%A7%E5%9D%9D', map: 'zero_dam' },
  { pattern: '/key/p_%E9%95%BF%E5%BC%93%E6%BA%AA%E8%B0%B7', map: 'longbow' },
  { pattern: '/key/p_%E8%88%AA%E5%A4%A9%E5%9F%BA%E5%9C%B0', map: 'space_base' },
  { pattern: '/key/p_%E5%B7%B4%E5%85%8B%E4%BB%80', map: 'brakkesh' }
];

const PRISON_KEY_KEYWORDS = ['监狱', '仓库区', '顶层', '水位控制室'];

const COLLECTION_MAP_RULES = [
  { kw: ['纪念奖杯', '金条', '黄金瞪羚', '优秀雇员奖杯', '渡鸦项坠', '聚乙烯纤维'], map: 'zero_dam' },
  { kw: ['绝密服务器', '劳力士怀表', '香槟', '军用终端', '重型突击背心', '显卡', '阵列服务器', '可编程处理器', '镜头', '动力电池组'], map: 'longbow' },
  { kw: ['超算单元', '军用电台', '牌表', '滑膛枪', '高能瓦斯罐', 'E型滤毒罐', '装甲车电池'], map: 'space_base' },
  { kw: ['非洲之星', '留声机', '三幻神', '海盗弯刀', '卫队金扳指', '特种钢', 'OLIGHT', '脑机'], map: 'brakkesh' },
  { kw: ['电子脚镣', '高出力粉碎钳', '军用无人机', '潮汐监狱', '飞行员眼镜'], map: 'prison' },
  { kw: ['扑克牌'], map: 'all' },
  { kw: ['八宝粥', '神奇八宝粥'], map: 'all' }
];

function getKeyMapFromPic(picUrl) {
  if (!picUrl) return null;
  for (let i = 0; i < KEY_PIC_MAP_RULES.length; i++) {
    if (picUrl.indexOf(KEY_PIC_MAP_RULES[i].pattern) !== -1) {
      return KEY_PIC_MAP_RULES[i].map;
    }
  }
  if (picUrl.indexOf('/object/') !== -1) return 'prison';
  return null;
}

function findItemMap(name, category, picUrl) {
  if (!name) return null;
  if (category === 'key') {
    const picMap = getKeyMapFromPic(picUrl);
    if (picMap) return MAPS[picMap] || null;
    const kw = name.toLowerCase();
    for (let i = 0; i < PRISON_KEY_KEYWORDS.length; i++) {
      if (kw.indexOf(PRISON_KEY_KEYWORDS[i].toLowerCase()) !== -1) {
        return MAPS['prison'] || null;
      }
    }
    return null;
  }
  if (category === 'collection') {
    const kw2 = name.toLowerCase();
    for (let i = 0; i < COLLECTION_MAP_RULES.length; i++) {
      const rule = COLLECTION_MAP_RULES[i];
      for (let j = 0; j < rule.kw.length; j++) {
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

module.exports = {
  MAPS,
  findItemMap
};