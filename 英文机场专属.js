/**
 * 英文机场专属重命名脚本
 * 功能：
 * 1. 将该机场的英文国家/城市节点名转换为简体中文
 * 2. 保留城市信息，避免像美国/俄罗斯节点被过度折叠
 * 3. 归一前置旗帜，修正台湾等错误旗帜
 */

const LEADING_FLAG_RE = /^((?:[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]))(\s*)/;

const PHRASE_REPLACEMENTS = [
  [/\bUnited\s+Arab\s+Emirates\b/gi, "阿联酋"],
  [/\bUnited\s+Kingdom\b/gi, "英国"],
  [/\bHong\s+Kong\b/gi, "香港"],
  [/\bTaiwan\b/gi, "台湾"],
  [/\bJapan\b/gi, "日本"],
  [/\bSingapore\b/gi, "新加坡"],
  [/\bAustralia\s+Sydney\b/gi, "澳大利亚 悉尼"],
  [/\bAustria\b/gi, "奥地利"],
  [/\bRussia\s+St\.?\s+Petersburg\b/gi, "俄罗斯 圣彼得堡"],
  [/\bRussia\s+Moscow\b/gi, "俄罗斯 莫斯科"],
  [/\bUSA\s+Los\s+Angeles\b/gi, "美国 洛杉矶"],
  [/\bUSA\s+San\s+Jose\b/gi, "美国 圣何塞"],
  [/\bUSA\s+Seattle\b/gi, "美国 西雅图"],
  [/\bUSA\b/gi, "美国"],
  [/\bArgentina\b/gi, "阿根廷"],
  [/\bBrazil\b/gi, "巴西"],
  [/\bBulgaria\b/gi, "保加利亚"],
  [/\bCanada\b/gi, "加拿大"],
  [/\bChile\b/gi, "智利"],
  [/\bFrance\b/gi, "法国"],
  [/\bGermany\b/gi, "德国"],
  [/\bHungary\b/gi, "匈牙利"],
  [/\bIndia\b/gi, "印度"],
  [/\bIndonesia\b/gi, "印度尼西亚"],
  [/\bIreland\b/gi, "爱尔兰"],
  [/\bKorea\b/gi, "韩国"],
  [/\bNetherlands\b/gi, "荷兰"],
  [/\bSweden\b/gi, "瑞典"],
  [/\bSwitzerland\b/gi, "瑞士"],
  [/\bTurkey\b/gi, "土耳其"],
];

const LOCATION_FLAGS = [
  { zh: "香港", flag: "🇭🇰" },
  { zh: "台湾", flag: "🇹🇼" },
  { zh: "日本", flag: "🇯🇵" },
  { zh: "新加坡", flag: "🇸🇬" },
  { zh: "澳大利亚", flag: "🇦🇺" },
  { zh: "奥地利", flag: "🇦🇹" },
  { zh: "俄罗斯", flag: "🇷🇺" },
  { zh: "美国", flag: "🇺🇸" },
  { zh: "阿根廷", flag: "🇦🇷" },
  { zh: "巴西", flag: "🇧🇷" },
  { zh: "保加利亚", flag: "🇧🇬" },
  { zh: "加拿大", flag: "🇨🇦" },
  { zh: "智利", flag: "🇨🇱" },
  { zh: "法国", flag: "🇫🇷" },
  { zh: "德国", flag: "🇩🇪" },
  { zh: "匈牙利", flag: "🇭🇺" },
  { zh: "印度", flag: "🇮🇳" },
  { zh: "印度尼西亚", flag: "🇮🇩" },
  { zh: "爱尔兰", flag: "🇮🇪" },
  { zh: "韩国", flag: "🇰🇷" },
  { zh: "荷兰", flag: "🇳🇱" },
  { zh: "瑞典", flag: "🇸🇪" },
  { zh: "瑞士", flag: "🇨🇭" },
  { zh: "土耳其", flag: "🇹🇷" },
  { zh: "阿联酋", flag: "🇦🇪" },
  { zh: "英国", flag: "🇬🇧" },
];

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
  let result = normalizeSpacing(name);

  for (const [pattern, replacement] of PHRASE_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }

  result = normalizeSpacing(result);
  result = normalizeLeadingFlag(result);
  return result;
}

function normalizeSpacing(name) {
  return name.replace(/\s+/g, " ").trim();
}

function normalizeLeadingFlag(name) {
  const canonicalFlag = detectCanonicalFlag(name);
  if (!canonicalFlag) {
    return name;
  }

  const match = name.match(LEADING_FLAG_RE);
  if (!match) {
    return `${canonicalFlag} ${name}`;
  }

  return `${canonicalFlag}${match[2]}${name.slice(match[0].length)}`;
}

function detectCanonicalFlag(name) {
  for (const item of LOCATION_FLAGS) {
    if (name.includes(item.zh)) {
      return item.flag;
    }
  }

  return null;
}
