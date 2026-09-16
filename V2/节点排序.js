// 按节点类型、倍率、优先地区和自然名称生成稳定且无副作用的排序结果。
/**
 * 节点排序规则脚本
 * 功能：按照统一排序键对节点进行排序
 * 版本：3.0.0
 * 排序逻辑：
 * 1. 有效名称排在无名称节点之前
 * 2. 游戏/加速节点最高优先级，随后是活动、直连等特殊节点
 * 3. 低倍率节点优先：数值低倍率 -> EX/低倍率 -> 实验性 -> 普通节点
 * 4. 地区优先级保持为香港、台湾、日本、新加坡、美国
 * 5. 同类同地区内，无倍率节点先于普通倍率节点，倍率从低到高
 * 6. 最后按名称自然排序，并以原始位置保证稳定性
 */

const NAME_COLLATOR =
  typeof Intl !== "undefined"
    ? new Intl.Collator("zh-CN", {
        numeric: true,
        sensitivity: "base",
      })
    : null;

const FLAG_RE = /(?:[\uD83C][\uDDE6-\uDDFF]){2}/g;
const GAME_RULE = /(?:^|[^A-Za-z])Game(?=$|[^A-Za-z])|游戏|遊戲|加速/i;

const SPECIAL_RULES = [
  { id: "promo", label: "活动/优惠", re: /活动|活動|优惠|優惠|限时|限時/i },
  { id: "direct", label: "直连/直通", re: /直连|直連|直通/i },
  { id: "official", label: "官网", re: /官网|官網/i },
  { id: "package", label: "套餐", re: /套餐/i },
  { id: "traffic", label: "流量", re: /流量/i },
  { id: "reset", label: "重置", re: /重置|重設/i },
];

const LOW_MULTIPLIER_TAG_RE = combineRegex([
  createCodeTokenRegex(["EX"]),
  /低倍率/i,
]);

const EXPERIMENTAL_TAG_RE = /实验性|實驗性/i;

const REGION_RULES = [
  {
    id: "hk",
    label: "香港",
    re: combineRegex([
      /🇭🇰/,
      /香港/,
      /Hong[\s._\-/]*Kong/i,
      createAsciiTokenRegex(["HK", "HKG"]),
      /(?<!深|珠|莞)港(?=$|[\s丨|_/\-\d])/,
    ]),
  },
  {
    id: "tw",
    label: "台湾",
    re: combineRegex([
      /🇹🇼/,
      /台湾|台灣|臺灣|台北|臺北|高雄|台中|臺中|新竹|台南|新北/,
      /Taiwan|Taipei|Kaohsiung|Taichung|Hsinchu|Tainan/i,
      createAsciiTokenRegex(["TW", "TWN"]),
      /(?:^|[\s丨|_/\-])台(?=$|[\s丨|_/\-\d])/,
    ]),
  },
  {
    id: "jp",
    label: "日本",
    re: combineRegex([
      /🇯🇵/,
      /日本|东京|東京|大阪|横滨|橫濱|名古屋|京都|福冈|福岡|札幌|川崎|埼玉/,
      /Japan|Tokyo|Osaka|Yokohama|Nagoya|Kyoto|Fukuoka|Sapporo/i,
      createAsciiTokenRegex(["JP", "JPN"]),
      /(?:^|[\s丨|_/\-])日(?=$|[\s丨|_/\-\d])/,
    ]),
  },
  {
    id: "sg",
    label: "新加坡",
    re: combineRegex([
      /🇸🇬/,
      /新加坡|狮城|獅城/,
      /Singapore/i,
      createAsciiTokenRegex(["SG", "SGP"]),
    ]),
  },
  {
    id: "us",
    label: "美国",
    re: combineRegex([
      /🇺🇸|🇺🇲/,
      /美国|美國|美利坚|美利堅|美帝/,
      /United[\s._\-/]*States(?:[\s._\-/]*of[\s._\-/]*America)?/i,
      createAsciiTokenRegex(["US", "USA"]),
      /(?:洛杉矶|洛杉磯)(?!郡)|圣何塞|聖何塞|纽约|紐約|拉斯维加斯|拉斯維加斯|硅谷|西雅图|西雅圖|芝加哥|达拉斯|達拉斯|迈阿密|邁阿密|凤凰城|鳳凰城|亚特兰大|亞特蘭大|阿什本|旧金山|舊金山|华盛顿|華盛頓|波特兰|波特蘭|休斯顿|休斯頓|丹佛|费利蒙|費利蒙|圣克拉拉|聖克拉拉|波士顿|波士頓/,
      /Los[\s._\-/]*Angeles|San[\s._\-/]*Jose|New[\s._\-/]*York|Las[\s._\-/]*Vegas|Silicon[\s._\-/]*Valley|Seattle|Chicago|Dallas|Miami|Phoenix|Atlanta|Ashburn|San[\s._\-/]*Francisco|Washington|Portland|Houston|Denver|Fremont|Santa[\s._\-/]*Clara|Boston/i,
    ]),
  },
];

const MULTIPLIER_PATTERNS = [
  /(?:^|[^A-Za-z0-9.])[xX×]\s*(\d+(?:[.,]\d+)?)(?=$|[^A-Za-z0-9])/,
  /(?:^|[^A-Za-z0-9.])(\d+(?:[.,]\d+)?)\s*[xX×](?=$|[^A-Za-z0-9])/,
  /(?:^|[^A-Za-z0-9.])(\d+(?:[.,]\d+)?)\s*倍(?:率)?/,
  /倍率\s*[:：]?\s*(\d+(?:[.,]\d+)?)/,
];

function operator(proxies = [], targetPlatform) {
  void targetPlatform;

  if (!Array.isArray(proxies)) {
    return [];
  }

  return proxies
    .map((proxy, index) => buildSortMeta(proxy, index))
    .sort(compareEntries)
    .map((entry) => entry.proxy);
}

function buildSortMeta(proxy, index) {
  const name = normalizeName(proxy);
  const multiplier = name ? getMultiplierMeta(name) : getDefaultMultiplierMeta();

  return {
    proxy,
    index,
    hasName: name ? 0 : 1,
    name,
    sortableName: name ? normalizeSortableName(name) : "",
    gameRank: name && GAME_RULE.test(name) ? 0 : 1,
    specialRank: name ? getFirstMatchIndex(SPECIAL_RULES, name) : SPECIAL_RULES.length,
    lowMultiplierRank: multiplier.lowRank,
    lowMultiplierValue: multiplier.lowValue,
    genericMultiplierRank: multiplier.genericRank,
    genericMultiplierValue: multiplier.genericValue,
    regionRank: name ? getFirstMatchIndex(REGION_RULES, name) : REGION_RULES.length,
  };
}

function compareEntries(a, b) {
  return (
    compareNumber(a.hasName, b.hasName) ||
    compareNumber(a.gameRank, b.gameRank) ||
    compareNumber(a.specialRank, b.specialRank) ||
    compareNumber(a.lowMultiplierRank, b.lowMultiplierRank) ||
    compareNumber(a.regionRank, b.regionRank) ||
    compareNumber(a.lowMultiplierValue, b.lowMultiplierValue) ||
    compareNumber(a.genericMultiplierRank, b.genericMultiplierRank) ||
    compareNumber(a.genericMultiplierValue, b.genericMultiplierValue) ||
    compareName(a.sortableName, b.sortableName) ||
    compareNumber(a.index, b.index)
  );
}

function normalizeName(proxy) {
  const rawName = typeof proxy?.name === "string" ? proxy.name.trim() : "";
  if (!rawName) {
    return "";
  }

  const name =
    typeof rawName.normalize === "function"
      ? rawName.normalize("NFKC")
      : rawName;

  return name.replace(/\s+/g, " ").trim();
}

function normalizeSortableName(name) {
  let result = name;

  if (
    typeof ProxyUtils !== "undefined" &&
    ProxyUtils &&
    typeof ProxyUtils.removeFlag === "function"
  ) {
    result = ProxyUtils.removeFlag(result);
  }

  return result.replace(FLAG_RE, "").replace(/\s+/g, " ").trim();
}

function getMultiplierMeta(name) {
  const numericMultiplier = extractMultiplier(name);
  if (numericMultiplier !== null && numericMultiplier < 1) {
    return {
      lowRank: 0,
      lowValue: numericMultiplier,
      genericRank: 1,
      genericValue: numericMultiplier,
    };
  }

  if (LOW_MULTIPLIER_TAG_RE.test(name)) {
    return {
      lowRank: 1,
      lowValue: Infinity,
      genericRank: 1,
      genericValue: Infinity,
    };
  }

  if (EXPERIMENTAL_TAG_RE.test(name)) {
    return {
      lowRank: 2,
      lowValue: Infinity,
      genericRank: 1,
      genericValue: Infinity,
    };
  }

  if (numericMultiplier !== null) {
    return {
      lowRank: 3,
      lowValue: Infinity,
      genericRank: 1,
      genericValue: numericMultiplier,
    };
  }

  return getDefaultMultiplierMeta();
}

function getDefaultMultiplierMeta() {
  return {
    lowRank: 3,
    lowValue: Infinity,
    genericRank: 0,
    genericValue: Infinity,
  };
}

function extractMultiplier(name) {
  for (const pattern of MULTIPLIER_PATTERNS) {
    const match = pattern.exec(name);
    if (!match) {
      continue;
    }

    const value = Number.parseFloat(match[1].replace(",", "."));
    if (Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function getFirstMatchIndex(rules, name) {
  for (let i = 0; i < rules.length; i += 1) {
    if (rules[i].re.test(name)) {
      return i;
    }
  }

  return rules.length;
}

function compareName(a, b) {
  if (NAME_COLLATOR) {
    return NAME_COLLATOR.compare(a, b);
  }

  return a.localeCompare(b, "zh-CN");
}

function compareNumber(a, b) {
  if (a === b) {
    return 0;
  }

  return a < b ? -1 : 1;
}

function combineRegex(patterns) {
  return new RegExp(patterns.map((pattern) => pattern.source).join("|"), "i");
}

function createCodeTokenRegex(codes) {
  const source = codes.map(escapeRegex).join("|");
  return new RegExp(
    String.raw`(?:^|[^A-Za-z0-9])(?:${source})(?=$|[^A-Za-z])`,
    "i"
  );
}

function createAsciiTokenRegex(codes) {
  const source = codes.map(escapeRegex).join("|");
  return new RegExp(
    String.raw`(?:^|[^A-Za-z])(?:${source})(?=$|[^A-Za-z])`,
    "i"
  );
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
