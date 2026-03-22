/**
 * Godetia 机场专属重命名脚本
 * 命名模板：地区 + 特征 + 编号
 * 说明：
 * 1. 去掉全量重复的 IPLC 前缀
 * 2. 默认忽略低区分度的“流媒体”标签
 * 3. 保留高价值特征：家宽、原生、Abema、x 倍率
 */

const REGION_ALIASES = [
  ["澳洲", "澳大利亚"],
  ["印尼", "印度尼西亚"],
];

const FEATURE_ORDER = ["家宽", "原生", "Abema", "倍率"];

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

  const renamedName = renameProxyName(proxy.name);
  if (renamedName === proxy.name) {
    return proxy;
  }

  return {
    ...proxy,
    name: renamedName,
  };
}

function renameProxyName(name) {
  const parts = String(name)
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return String(name).trim();
  }

  const parsed = parseBase(parts[0]);
  const features = collectFeatures(parsed, parts.slice(1));
  const orderedFeatures = sortFeatures(features);
  const number = parsed.number ? formatNumber(parsed.number) : "";

  const finalParts = [parsed.region].concat(orderedFeatures);
  if (number) {
    finalParts.push(number);
  }

  return finalParts.join(" ").replace(/\s{2,}/g, " ").trim();
}

function parseBase(basePart) {
  let base = String(basePart).replace(/^IPLC\s+/i, "").trim();
  let number = "";
  let hasHome = false;

  const numberMatch = base.match(/(\d+)\s*$/);
  if (numberMatch) {
    number = numberMatch[1];
    base = base.slice(0, numberMatch.index).trim();
  }

  if (/家宽$/.test(base)) {
    hasHome = true;
    base = base.replace(/家宽$/, "").trim();
  }

  base = normalizeRegion(base);

  return {
    region: base,
    number,
    hasHome,
  };
}

function normalizeRegion(region) {
  let result = String(region).trim();

  for (const [from, to] of REGION_ALIASES) {
    if (result === from) {
      result = to;
      break;
    }
  }

  return result;
}

function collectFeatures(parsed, tags) {
  const features = [];

  if (parsed.hasHome) {
    features.push("家宽");
  }

  for (const rawTag of tags) {
    const tag = String(rawTag).trim();
    if (!tag || tag === "流媒体") {
      continue;
    }

    if (tag === "原生") {
      pushUnique(features, "原生");
      continue;
    }

    if (/^abema$/i.test(tag)) {
      pushUnique(features, "Abema");
      continue;
    }

    const rateMatch = tag.match(/(\d+(?:\.\d+)?)\s*倍率/);
    if (rateMatch) {
      pushUnique(features, normalizeRate(rateMatch[1]));
      continue;
    }

    pushUnique(features, tag);
  }

  return features;
}

function sortFeatures(features) {
  return features.slice().sort((left, right) => {
    const leftRank = getFeatureRank(left);
    const rightRank = getFeatureRank(right);

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return left.localeCompare(right, "zh-CN");
  });
}

function getFeatureRank(feature) {
  if (feature === "家宽") {
    return FEATURE_ORDER.indexOf("家宽");
  }

  if (feature === "原生") {
    return FEATURE_ORDER.indexOf("原生");
  }

  if (feature === "Abema") {
    return FEATURE_ORDER.indexOf("Abema");
  }

  if (/\dx$/i.test(feature)) {
    return FEATURE_ORDER.indexOf("倍率");
  }

  return FEATURE_ORDER.length;
}

function normalizeRate(rawRate) {
  const value = Number(rawRate);
  if (!Number.isFinite(value)) {
    return `${rawRate}x`;
  }

  if (Number.isInteger(value)) {
    return `${value}x`;
  }

  return `${value}x`;
}

function formatNumber(number) {
  return String(number).padStart(2, "0");
}

function pushUnique(list, value) {
  if (!list.includes(value)) {
    list.push(value);
  }
}
