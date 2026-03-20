/**
 * 节点排序规则脚本（优化版）
 * 功能：按照统一排序键对节点进行排序
 * 版本：2.1.0
 * 排序逻辑：
 * 1. 游戏/加速节点最高优先级
 * 2. 其他特殊类型优先级
 * 3. 低倍率节点次优先
 * 4. 地区优先级（仅港、台、日、新、美）
 * 5. 通用倍率排序（同地区内：无倍率 -> 普通倍率，倍率越低越靠前）
 * 6. 名称自然排序（中英文混排，数字按数值比较）
 */

const NAME_COLLATOR =
  typeof Intl !== "undefined"
    ? new Intl.Collator("zh-CN", {
        numeric: true,
        sensitivity: "base",
      })
    : null;

const GAME_RULE = /Game|游戏|加速/i;

const SPECIAL_RULES = [
  { id: "promo", label: "活动/优惠", re: /活动|优惠|限时/i },
  { id: "direct", label: "直连/直通", re: /直连|直通/i },
  { id: "official", label: "官网", re: /官网/i },
  { id: "package", label: "套餐", re: /套餐/i },
  { id: "traffic", label: "流量", re: /流量/i },
  { id: "reset", label: "重置", re: /重置/i },
];

const LOW_MULTIPLIER_TAG_RE = combineRegex([
  createCodeTokenRegex(["EX"]),
  /低倍率/i,
]);

const EXPERIMENTAL_TAG_RE = /实验性/i;

const REGION_RULES = [
  {
    id: "hk",
    label: "香港",
    re: combineRegex([
      /香港/i,
      /\bHong Kong\b/i,
      /港(?!澳)/i,
      createCodeTokenRegex(["HK", "HKG", "HKBN", "HKIX", "HGC", "WTT", "CMI"]),
    ]),
  },
  {
    id: "tw",
    label: "台湾",
    re: combineRegex([
      /台湾/i,
      /\bTaiwan\b/i,
      /台(?!风)/i,
      createCodeTokenRegex(["TW", "Hinet", "TWN", "CHT", "TFN"]),
    ]),
  },
  {
    id: "jp",
    label: "日本",
    re: combineRegex([
      /日本/i,
      /\bTokyo\b/i,
      /\bOsaka\b/i,
      /\bJapan\b/i,
      /日(?!利亚)/i,
      createCodeTokenRegex(["JP", "JPN", "NTT", "IIJ", "KDDI"]),
    ]),
  },
  {
    id: "sg",
    label: "新加坡",
    re: combineRegex([
      /新加坡/i,
      /\bSingapore\b/i,
      /狮城/i,
      /新(?!西兰)/i,
      createCodeTokenRegex(["SG", "SGP", "SingTel", "M1", "StarHub"]),
    ]),
  },
  {
    id: "us",
    label: "美国",
    re: combineRegex([
      /美国/i,
      /\bUnited States\b/i,
      /美(?!洲)/i,
      createCodeTokenRegex(["US", "USA", "AWS", "GIA"]),
    ]),
  },
];

const MULTIPLIER_PATTERNS = [
  /(\d+(?:\.\d+)?)\s*[xX](?=$|[^A-Za-z0-9])/,
  /(?:^|[^A-Za-z0-9])[xX]\s*(\d+(?:\.\d+)?)(?=$|[^A-Za-z0-9])/,
  /(\d+(?:\.\d+)?)\s*倍/,
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
    compareName(a.name, b.name) ||
    compareNumber(a.index, b.index)
  );
}

function normalizeName(proxy) {
  const rawName = typeof proxy?.name === "string" ? proxy.name.trim() : "";
  if (!rawName) {
    return "";
  }

  let name = rawName;
  if (typeof ProxyUtils !== "undefined" && typeof ProxyUtils.removeFlag === "function") {
    name = ProxyUtils.removeFlag(name);
  }

  return name.replace(/\s+/g, " ").trim();
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

    const value = Number.parseFloat(match[1]);
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

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
