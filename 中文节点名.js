/**
 * 中文节点名
 * 功能：将节点名称中的英文地理标识统一替换为中文名称
 * 说明：
 * 1. 兼容大小写差异、空格、下划线、短横线、斜杠、连写等命名方式
 * 2. 同时支持常见地区缩写、英文全称和部分常见城市名
 * 3. 部分城市别名会归并到所属地区中文名，便于统一节点命名
 * 4. 只替换地理名称，保留倍率、线路、编号等其余信息
 */

const SEPARATOR_PATTERN = String.raw`(?:[\s._\-/]*)`;
const LEADING_FLAG_RE = /^((?:[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]))(\s*)/;

const LOCATION_FLAGS = {
  香港: "🇭🇰",
  澳门: "🇲🇴",
  台湾: "🇹🇼",
  中国: "🇨🇳",
  日本: "🇯🇵",
  韩国: "🇰🇷",
  新加坡: "🇸🇬",
  马来西亚: "🇲🇾",
  泰国: "🇹🇭",
  菲律宾: "🇵🇭",
  越南: "🇻🇳",
  印度: "🇮🇳",
  印度尼西亚: "🇮🇩",
  阿联酋: "🇦🇪",
  沙特阿拉伯: "🇸🇦",
  卡塔尔: "🇶🇦",
  以色列: "🇮🇱",
  土耳其: "🇹🇷",
  英国: "🇬🇧",
  德国: "🇩🇪",
  法国: "🇫🇷",
  意大利: "🇮🇹",
  西班牙: "🇪🇸",
  葡萄牙: "🇵🇹",
  荷兰: "🇳🇱",
  瑞士: "🇨🇭",
  瑞典: "🇸🇪",
  冰岛: "🇮🇸",
  挪威: "🇳🇴",
  芬兰: "🇫🇮",
  丹麦: "🇩🇰",
  比利时: "🇧🇪",
  奥地利: "🇦🇹",
  爱尔兰: "🇮🇪",
  卢森堡: "🇱🇺",
  波兰: "🇵🇱",
  捷克: "🇨🇿",
  匈牙利: "🇭🇺",
  罗马尼亚: "🇷🇴",
  希腊: "🇬🇷",
  俄罗斯: "🇷🇺",
  乌克兰: "🇺🇦",
  美国: "🇺🇸",
  加拿大: "🇨🇦",
  墨西哥: "🇲🇽",
  巴西: "🇧🇷",
  阿根廷: "🇦🇷",
  智利: "🇨🇱",
  哥伦比亚: "🇨🇴",
  秘鲁: "🇵🇪",
  澳大利亚: "🇦🇺",
  新西兰: "🇳🇿",
  南非: "🇿🇦",
  埃及: "🇪🇬",
  保加利亚: "🇧🇬",
};

const LOCATION_CODES = {
  香港: ["hk", "hkg"],
  澳门: ["mo", "mac"],
  台湾: ["tw", "twn"],
  中国: ["cn", "chn"],
  日本: ["jp", "jpn"],
  韩国: ["kr", "kor"],
  新加坡: ["sg", "sgp"],
  马来西亚: ["my", "mys"],
  泰国: ["th", "tha"],
  菲律宾: ["ph", "phl"],
  越南: ["vn", "vnm"],
  印度: ["in", "ind"],
  印度尼西亚: ["id", "idn"],
  阿联酋: ["ae", "uae"],
  沙特阿拉伯: ["sa", "sau"],
  卡塔尔: ["qa", "qat"],
  以色列: ["il", "isr"],
  土耳其: ["tr", "tur"],
  英国: ["uk", "gb", "gbr"],
  德国: ["de", "deu"],
  法国: ["fr", "fra"],
  意大利: ["it", "ita"],
  西班牙: ["es", "esp"],
  葡萄牙: ["pt", "prt"],
  荷兰: ["nl", "nld"],
  瑞士: ["ch", "che", "sui"],
  瑞典: ["se", "swe"],
  冰岛: ["is", "isl"],
  挪威: ["no", "nor"],
  芬兰: ["fi", "fin"],
  丹麦: ["dk", "dnk"],
  比利时: ["be", "bel"],
  奥地利: ["at", "aut"],
  爱尔兰: ["ie", "irl"],
  卢森堡: ["lu", "lux"],
  波兰: ["pl", "pol"],
  捷克: ["cz", "cze"],
  匈牙利: ["hu", "hun"],
  罗马尼亚: ["ro", "rou"],
  希腊: ["gr", "grc"],
  俄罗斯: ["ru", "rus"],
  乌克兰: ["ua", "ukr"],
  美国: ["us", "usa"],
  加拿大: ["ca", "can"],
  墨西哥: ["mx", "mex"],
  巴西: ["br", "bra"],
  阿根廷: ["ar", "arg"],
  智利: ["cl", "chl"],
  哥伦比亚: ["co", "col"],
  秘鲁: ["pe", "per"],
  澳大利亚: ["au", "aus"],
  新西兰: ["nz", "nzl"],
  南非: ["za", "zaf"],
  埃及: ["eg", "egy"],
  保加利亚: ["bg", "bgr"],
};

const LOCATION_RULES = buildLocationRules([
  // 中国港澳台与东亚
  {
    zh: "香港",
    aliases: [
      ["hong", "kong"],
      "kowloon",
      "hk",
      "hkg",
    ],
  },
  {
    zh: "澳门",
    aliases: [
      "macau",
      "macao",
    ],
  },
  {
    zh: "台湾",
    aliases: [
      "taiwan",
      ["tai", "wan"],
      ["tai", "pei"],
      ["kaoh", "siung"],
      ["tai", "chung"],
      "taipei",
      "kaohsiung",
      "taichung",
      "hsinchu",
      "tw",
      "twn",
    ],
  },
  {
    zh: "中国",
    aliases: [
      "china",
      ["main", "land"],
      "mainland",
      "beijing",
      "shanghai",
      "guangzhou",
      "shenzhen",
      "hangzhou",
      "chengdu",
      "nanjing",
      "wuhan",
      "xiamen",
      "chn",
    ],
  },
  {
    zh: "日本",
    aliases: [
      "japan",
      "tokyo",
      "osaka",
      "yokohama",
      "nagoya",
      "kyoto",
      "fukuoka",
      "sapporo",
      "jp",
      "jpn",
    ],
  },
  {
    zh: "韩国",
    aliases: [
      ["south", "korea"],
      "southkorea",
      "korea",
      "seoul",
      "busan",
      "incheon",
      "kr",
      "kor",
    ],
  },

  // 东南亚、南亚与中东
  {
    zh: "新加坡",
    aliases: [
      "singapore",
      ["singa", "pore"],
      "sg",
      "sgp",
    ],
  },
  {
    zh: "马来西亚",
    aliases: [
      "malaysia",
      ["kuala", "lumpur"],
      "kualalumpur",
      "penang",
      "johor",
      "mys",
    ],
  },
  {
    zh: "泰国",
    aliases: [
      "thailand",
      "bangkok",
      "thai",
      "tha",
    ],
  },
  {
    zh: "菲律宾",
    aliases: [
      "philippines",
      "manila",
      "phl",
    ],
  },
  {
    zh: "越南",
    aliases: [
      "vietnam",
      ["ho", "chi", "minh"],
      "hochiminh",
      "saigon",
      "hanoi",
      "vnm",
    ],
  },
  {
    zh: "印度",
    aliases: [
      "india",
      "mumbai",
      "delhi",
      "bangalore",
      "bengaluru",
      "hyderabad",
      "chennai",
      "kolkata",
      "ind",
    ],
  },
  {
    zh: "印度尼西亚",
    aliases: [
      "indonesia",
      "jakarta",
      "surabaya",
      "idn",
    ],
  },
  {
    zh: "阿联酋",
    aliases: [
      ["united", "arab", "emirates"],
      "unitedarabemirates",
      "uae",
      "dubai",
      ["abu", "dhabi"],
      "abudhabi",
    ],
  },
  {
    zh: "沙特阿拉伯",
    aliases: [
      ["saudi", "arabia"],
      "saudiarabia",
      "riyadh",
      "jeddah",
      "sau",
    ],
  },
  {
    zh: "卡塔尔",
    aliases: [
      "qatar",
      "doha",
      "qat",
    ],
  },
  {
    zh: "以色列",
    aliases: [
      "israel",
      ["tel", "aviv"],
      "telaviv",
      "jerusalem",
      "isr",
    ],
  },
  {
    zh: "土耳其",
    aliases: [
      "turkey",
      "istanbul",
      "ankara",
      "tur",
    ],
  },

  // 欧洲
  {
    zh: "英国",
    aliases: [
      ["united", "kingdom"],
      "unitedkingdom",
      "britain",
      "england",
      "london",
      "manchester",
      "birmingham",
      "uk",
      "gb",
      "gbr",
    ],
  },
  {
    zh: "德国",
    aliases: [
      "germany",
      "frankfurt",
      "berlin",
      "munich",
      "dusseldorf",
      "hamburg",
      "de",
      "deu",
    ],
  },
  {
    zh: "法国",
    aliases: [
      "france",
      "paris",
      "marseille",
      "lyon",
      "fr",
    ],
  },
  {
    zh: "意大利",
    aliases: [
      "italy",
      "rome",
      "milan",
      "naples",
      "ita",
    ],
  },
  {
    zh: "西班牙",
    aliases: [
      "spain",
      "madrid",
      "barcelona",
      "valencia",
      "esp",
    ],
  },
  {
    zh: "葡萄牙",
    aliases: [
      "portugal",
      "lisbon",
      "porto",
      "prt",
    ],
  },
  {
    zh: "荷兰",
    aliases: [
      "netherlands",
      "holland",
      "amsterdam",
      "rotterdam",
      "nld",
    ],
  },
  {
    zh: "瑞士",
    aliases: [
      "switzerland",
      "zurich",
      "geneva",
      "sui",
      "che",
    ],
  },
  {
    zh: "瑞典",
    aliases: [
      "sweden",
      "stockholm",
      "gothenburg",
      "swe",
    ],
  },
  {
    zh: "冰岛",
    aliases: [
      "iceland",
      "reykjavik",
      "isl",
    ],
  },
  {
    zh: "挪威",
    aliases: [
      "norway",
      "oslo",
      "bergen",
      "nor",
    ],
  },
  {
    zh: "芬兰",
    aliases: [
      "finland",
      "helsinki",
      "fin",
    ],
  },
  {
    zh: "丹麦",
    aliases: [
      "denmark",
      "copenhagen",
      "dnk",
    ],
  },
  {
    zh: "比利时",
    aliases: [
      "belgium",
      "brussels",
      "bel",
    ],
  },
  {
    zh: "奥地利",
    aliases: [
      "austria",
      "vienna",
      "aut",
    ],
  },
  {
    zh: "爱尔兰",
    aliases: [
      "ireland",
      "dublin",
      "irl",
    ],
  },
  {
    zh: "卢森堡",
    aliases: [
      "luxembourg",
      "luxemburg",
      "lux",
    ],
  },
  {
    zh: "波兰",
    aliases: [
      "poland",
      "warsaw",
      "pol",
    ],
  },
  {
    zh: "捷克",
    aliases: [
      ["czech", "republic"],
      "czechrepublic",
      "czech",
      "prague",
      "cze",
    ],
  },
  {
    zh: "匈牙利",
    aliases: [
      "hungary",
      "budapest",
      "hun",
    ],
  },
  {
    zh: "罗马尼亚",
    aliases: [
      "romania",
      "bucharest",
      "rou",
    ],
  },
  {
    zh: "希腊",
    aliases: [
      "greece",
      "athens",
      "grc",
    ],
  },
  {
    zh: "保加利亚",
    aliases: [
      "bulgaria",
      "sofia",
      "bgr",
    ],
  },
  {
    zh: "俄罗斯",
    aliases: [
      "russia",
      "moscow",
      ["saint", "petersburg"],
      ["st", "petersburg"],
      "saintpetersburg",
      "stpetersburg",
      "rus",
    ],
  },
  {
    zh: "乌克兰",
    aliases: [
      "ukraine",
      "kyiv",
      "kiev",
      "ukr",
    ],
  },

  // 北美与南美
  {
    zh: "美国",
    aliases: [
      ["united", "states"],
      ["united", "states", "of", "america"],
      "america",
      "usa",
      "us",
      ["los", "angeles"],
      ["san", "jose"],
      ["new", "york"],
      ["las", "vegas"],
      ["silicon", "valley"],
      "losangeles",
      "sanjose",
      "newyork",
      "lasvegas",
      "siliconvalley",
      "seattle",
      "chicago",
      "dallas",
      "miami",
      "phoenix",
      "atlanta",
      "ashburn",
    ],
  },
  {
    zh: "加拿大",
    aliases: [
      "canada",
      "toronto",
      "vancouver",
      "montreal",
      "ottawa",
      "calgary",
      "can",
    ],
  },
  {
    zh: "墨西哥",
    aliases: [
      "mexico",
      ["mexico", "city"],
      "mexicocity",
      "guadalajara",
      "mex",
    ],
  },
  {
    zh: "巴西",
    aliases: [
      "brazil",
      ["sao", "paulo"],
      ["rio", "de", "janeiro"],
      "saopaulo",
      "riodejaneiro",
      "bra",
    ],
  },
  {
    zh: "阿根廷",
    aliases: [
      "argentina",
      ["buenos", "aires"],
      "buenosaires",
      "arg",
    ],
  },
  {
    zh: "智利",
    aliases: [
      "chile",
      "santiago",
      "chl",
    ],
  },
  {
    zh: "哥伦比亚",
    aliases: [
      "colombia",
      "bogota",
      "col",
    ],
  },
  {
    zh: "秘鲁",
    aliases: [
      "peru",
      "lima",
      "per",
    ],
  },

  // 大洋洲与非洲
  {
    zh: "澳大利亚",
    aliases: [
      "australia",
      "sydney",
      "melbourne",
      "brisbane",
      "perth",
      "au",
      "aus",
    ],
  },
  {
    zh: "新西兰",
    aliases: [
      ["new", "zealand"],
      "newzealand",
      "auckland",
      "wellington",
      "christchurch",
      "nz",
      "nzl",
    ],
  },
  {
    zh: "南非",
    aliases: [
      ["south", "africa"],
      "southafrica",
      "johannesburg",
      ["cape", "town"],
      "capetown",
      "zaf",
    ],
  },
  {
    zh: "埃及",
    aliases: [
      "egypt",
      "cairo",
      "egy",
    ],
  },

  // 区域标签
  {
    zh: "欧洲",
    aliases: [
      "europe",
      "european",
    ],
  },
  {
    zh: "亚洲",
    aliases: [
      "asia",
      ["asia", "pacific"],
      "asiapacific",
      "apac",
    ],
  },
  {
    zh: "中东",
    aliases: [
      ["middle", "east"],
      "middleeast",
    ],
  },
  {
    zh: "北美",
    aliases: [
      ["north", "america"],
      "northamerica",
    ],
  },
  {
    zh: "南美",
    aliases: [
      ["south", "america"],
      "southamerica",
      ["latin", "america"],
      "latinamerica",
      "latam",
    ],
  },
]);

function operator(proxies = [], targetPlatform, context) {
  void targetPlatform;
  void context;

  if (!Array.isArray(proxies)) {
    return [];
  }

  return proxies.map((proxy) => renameProxy(proxy));
}

function renameProxy(proxy) {
  if (!proxy || typeof proxy.name !== "string") {
    return proxy;
  }

  const renamedName = renameLocationInName(proxy.name);
  if (renamedName === proxy.name) {
    return proxy;
  }

  return {
    ...proxy,
    name: renamedName,
  };
}

function renameLocationInName(name) {
  let result = replaceStandaloneShortCode(name);

  for (const rule of LOCATION_RULES) {
    if (rule.standaloneCodeRe) {
      const collapsed = result.replace(rule.standaloneCodeRe, (_, prefix) => `${prefix}${rule.zh}`);
      if (collapsed !== result) {
        result = collapseDuplicateLocation(collapsed, rule.zh);
      }
    }

    if (rule.codeAliasRe) {
      const collapsed = result.replace(rule.codeAliasRe, (_, prefix) => `${prefix}${rule.zh}`);
      if (collapsed !== result) {
        result = collapseDuplicateLocation(collapsed, rule.zh);
      }
    }

    const next = result.replace(rule.re, (_, prefix) => `${prefix}${rule.zh}`);
    if (next === result) {
      continue;
    }

    result = collapseDuplicateLocation(next, rule.zh);
  }

  return normalizeLeadingFlag(cleanupName(result));
}

function collapseDuplicateLocation(name, location) {
  const duplicateRe = new RegExp(
    `(${escapeRegex(location)})(?:[\\s._\\-/|()\\[\\]]*\\1)+`,
    "g"
  );

  return name.replace(duplicateRe, "$1");
}

function cleanupName(name) {
  return name.replace(/\s{2,}/g, " ").trim();
}

function buildLocationRules(rules) {
  return rules.map((rule) => ({
    zh: rule.zh,
    shortCodes: (LOCATION_CODES[rule.zh] || []).filter((code) => code.length === 2),
    standaloneCodeRe: buildStandaloneCodeRegex(LOCATION_CODES[rule.zh]),
    codeAliasRe: buildCodeAliasRegex(LOCATION_CODES[rule.zh], rule.aliases),
    re: buildLocationRegex(rule.aliases),
  }));
}

function replaceStandaloneShortCode(name) {
  const flagMatch = name.match(LEADING_FLAG_RE);
  const prefix = flagMatch ? `${flagMatch[1]}${flagMatch[2]}` : "";
  const body = flagMatch ? name.slice(flagMatch[0].length) : name;
  const trimmedBody = body.trimStart();
  const leadingWhitespace = body.slice(0, body.length - trimmedBody.length);

  for (const rule of LOCATION_RULES) {
    if (!Array.isArray(rule.shortCodes) || rule.shortCodes.length === 0) {
      continue;
    }

    for (const code of rule.shortCodes) {
      const codeRe = new RegExp(`^${escapeRegex(code)}(?=$|[^A-Za-z])`, "i");
      const match = trimmedBody.match(codeRe);
      if (!match) {
        continue;
      }

      const rest = trimmedBody.slice(match[0].length);
      if (/[A-Za-z]/.test(rest)) {
        continue;
      }

      return `${prefix}${leadingWhitespace}${trimmedBody.replace(codeRe, rule.zh)}`;
    }
  }

  return name;
}

function buildLocationRegex(aliases) {
  const sources = aliases
    .map(buildAliasPattern)
    .sort((left, right) => right.length - left.length);

  return new RegExp(`(^|[^A-Za-z])(${sources.join("|")})(?=$|[^A-Za-z])`, "gi");
}

function buildCodeAliasRegex(codes, aliases) {
  if (!Array.isArray(codes) || codes.length === 0) {
    return null;
  }

  const codeSources = codes
    .map(escapeRegex)
    .sort((left, right) => right.length - left.length);

  const aliasSources = aliases
    .map(buildAliasPattern)
    .sort((left, right) => right.length - left.length);

  return new RegExp(
    `(^|[^A-Za-z])(?:${codeSources.join("|")})${SEPARATOR_PATTERN}(?:${aliasSources.join("|")})(?=$|[^A-Za-z])`,
    "gi"
  );
}

function buildStandaloneCodeRegex(codes) {
  if (!Array.isArray(codes) || codes.length === 0) {
    return null;
  }

  const codeSources = codes
    .filter((code) => code.length >= 3)
    .map(escapeRegex)
    .sort((left, right) => right.length - left.length);

  if (codeSources.length === 0) {
    return null;
  }

  return new RegExp(`(^|[^A-Za-z])(?:${codeSources.join("|")})(?=$|[^A-Za-z])`, "gi");
}

function normalizeLeadingFlag(name) {
  const flagMatch = name.match(LEADING_FLAG_RE);
  if (!flagMatch) {
    return name;
  }

  const canonicalFlag = findCanonicalFlag(name);
  if (!canonicalFlag) {
    return name;
  }

  return `${canonicalFlag}${flagMatch[2]}${name.slice(flagMatch[0].length)}`;
}

function findCanonicalFlag(name) {
  for (const rule of LOCATION_RULES) {
    if (name.includes(rule.zh) && LOCATION_FLAGS[rule.zh]) {
      return LOCATION_FLAGS[rule.zh];
    }
  }

  return null;
}

function buildAliasPattern(alias) {
  if (Array.isArray(alias)) {
    return createTokenSequencePattern(alias);
  }

  return createSingleTokenPattern(alias);
}

function createTokenSequencePattern(tokens) {
  const escapedTokens = tokens.map(escapeRegex);
  return `${escapedTokens.join(SEPARATOR_PATTERN)}`;
}

function createSingleTokenPattern(token) {
  const escapedToken = escapeRegex(token);
  return escapedToken;
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
