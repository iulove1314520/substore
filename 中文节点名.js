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
  {
    zh: "香港",
    aliases: [
      ["hong", "kong"],
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
      "taipei",
      ["kaoh", "siung"],
      "kaohsiung",
      ["tai", "chung"],
      "taichung",
      "tw",
      "twn",
    ],
  },
  {
    zh: "日本",
    aliases: [
      "japan",
      ["tokyo"],
      ["osaka"],
      "jp",
      "jpn",
    ],
  },
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
    zh: "美国",
    aliases: [
      ["united", "states"],
      ["united", "states", "of", "america"],
      "america",
      "usa",
      "us",
      ["los", "angeles"],
      "losangeles",
      ["san", "jose"],
      "sanjose",
      ["new", "york"],
      "newyork",
      ["seattle"],
      ["silicon", "valley"],
      "siliconvalley",
    ],
  },
  {
    zh: "韩国",
    aliases: [
      ["south", "korea"],
      "southkorea",
      "korea",
      "seoul",
      "kr",
      "kor",
    ],
  },
  {
    zh: "英国",
    aliases: [
      ["united", "kingdom"],
      "unitedkingdom",
      "britain",
      "england",
      "london",
      "manchester",
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
      "fr",
    ],
  },
  {
    zh: "加拿大",
    aliases: [
      "canada",
      "toronto",
      "vancouver",
      "montreal",
      "can",
    ],
  },
  {
    zh: "澳大利亚",
    aliases: [
      "australia",
      "sydney",
      "melbourne",
      "brisbane",
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
      "nz",
      "nzl",
    ],
  },
  {
    zh: "马来西亚",
    aliases: [
      "malaysia",
      ["kuala", "lumpur"],
      "kualalumpur",
      "mys",
    ],
  },
  {
    zh: "泰国",
    aliases: [
      "thailand",
      "bangkok",
    ],
  },
  {
    zh: "菲律宾",
    aliases: [
      "philippines",
      "manila",
    ],
  },
  {
    zh: "印度",
    aliases: [
      "india",
      "mumbai",
      "delhi",
    ],
  },
  {
    zh: "印度尼西亚",
    aliases: [
      "indonesia",
      "jakarta",
    ],
  },
  {
    zh: "越南",
    aliases: [
      "vietnam",
      ["ho", "chi", "minh"],
      "hochiminh",
      "hanoi",
    ],
  },
  {
    zh: "荷兰",
    aliases: [
      "netherlands",
      "holland",
      "amsterdam",
    ],
  },
  {
    zh: "土耳其",
    aliases: [
      "turkey",
      "istanbul",
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
