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
  let result = name;

  for (const rule of LOCATION_RULES) {
    const next = result.replace(rule.re, (_, prefix) => `${prefix}${rule.zh}`);
    if (next === result) {
      continue;
    }

    result = collapseDuplicateLocation(next, rule.zh);
  }

  return cleanupName(result);
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
    re: buildLocationRegex(rule.aliases),
  }));
}

function buildLocationRegex(aliases) {
  const sources = aliases
    .map(buildAliasPattern)
    .sort((left, right) => right.length - left.length);

  return new RegExp(`(^|[^A-Za-z])(${sources.join("|")})(?=$|[^A-Za-z])`, "gi");
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
