/**
 * 英文机场专属重命名脚本
 * 功能：
 * 1. 将该机场的英文国家/城市节点名转换为简体中文
 * 2. 保留城市信息，避免像美国/俄罗斯节点被过度折叠
 * 3. 归一前置旗帜，修正台湾等错误旗帜
 */

var FALLBACK_FLAG_RE = /^(?:[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF])\s*/;

var PHRASE_REPLACEMENTS = [
  { re: /\bUnited\s+Arab\s+Emirates\b/gi, zh: "阿联酋" },
  { re: /\bUnited\s+Kingdom\b/gi, zh: "英国" },
  { re: /\bHong\s+Kong\b/gi, zh: "香港" },
  { re: /\bTaiwan\b/gi, zh: "台湾" },
  { re: /\bJapan\b/gi, zh: "日本" },
  { re: /\bSingapore\b/gi, zh: "新加坡" },
  { re: /\bAustralia\s+Sydney\b/gi, zh: "澳大利亚 悉尼" },
  { re: /\bAustria\b/gi, zh: "奥地利" },
  { re: /\bRussia\s+St\.?\s+Petersburg\b/gi, zh: "俄罗斯 圣彼得堡" },
  { re: /\bRussia\s+Moscow\b/gi, zh: "俄罗斯 莫斯科" },
  { re: /\bUSA\s+Los\s+Angeles\b/gi, zh: "美国 洛杉矶" },
  { re: /\bUSA\s+San\s+Jose\b/gi, zh: "美国 圣何塞" },
  { re: /\bUSA\s+Seattle\b/gi, zh: "美国 西雅图" },
  { re: /\bUSA\b/gi, zh: "美国" },
  { re: /\bArgentina\b/gi, zh: "阿根廷" },
  { re: /\bBrazil\b/gi, zh: "巴西" },
  { re: /\bBulgaria\b/gi, zh: "保加利亚" },
  { re: /\bCanada\b/gi, zh: "加拿大" },
  { re: /\bChile\b/gi, zh: "智利" },
  { re: /\bFrance\b/gi, zh: "法国" },
  { re: /\bGermany\b/gi, zh: "德国" },
  { re: /\bHungary\b/gi, zh: "匈牙利" },
  { re: /\bIndia\b/gi, zh: "印度" },
  { re: /\bIndonesia\b/gi, zh: "印度尼西亚" },
  { re: /\bIreland\b/gi, zh: "爱尔兰" },
  { re: /\bKorea\b/gi, zh: "韩国" },
  { re: /\bNetherlands\b/gi, zh: "荷兰" },
  { re: /\bSweden\b/gi, zh: "瑞典" },
  { re: /\bSwitzerland\b/gi, zh: "瑞士" },
  { re: /\bTurkey\b/gi, zh: "土耳其" }
];

var LOCATION_FLAGS = [
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
  { zh: "英国", flag: "🇬🇧" }
];

function operator(proxies, targetPlatform, context) {
  void targetPlatform;
  void context;

  if (!Array.isArray(proxies)) {
    return [];
  }

  for (var i = 0; i < proxies.length; i += 1) {
    var proxy = proxies[i];
    if (!proxy || typeof proxy.name !== "string") {
      continue;
    }

    proxy.name = renameProxyName(proxy.name);
  }

  return proxies;
}

function renameProxyName(name) {
  var result = normalizeSpacing(name);
  var i;

  for (i = 0; i < PHRASE_REPLACEMENTS.length; i += 1) {
    result = result.replace(PHRASE_REPLACEMENTS[i].re, PHRASE_REPLACEMENTS[i].zh);
  }

  result = normalizeSpacing(result);
  result = normalizeLeadingFlag(result);
  return result;
}

function normalizeSpacing(name) {
  return String(name).replace(/\s+/g, " ").trim();
}

function normalizeLeadingFlag(name) {
  var canonicalFlag = detectCanonicalFlag(name);
  var body;

  if (!canonicalFlag) {
    return name;
  }

  body = removeLeadingFlag(name);
  return canonicalFlag + " " + body;
}

function removeLeadingFlag(name) {
  var body = String(name);

  if (
    typeof ProxyUtils !== "undefined" &&
    ProxyUtils &&
    typeof ProxyUtils.removeFlag === "function"
  ) {
    body = ProxyUtils.removeFlag(body);
  } else {
    body = body.replace(FALLBACK_FLAG_RE, "");
  }

  return normalizeSpacing(body);
}

function detectCanonicalFlag(name) {
  var i;

  for (i = 0; i < LOCATION_FLAGS.length; i += 1) {
    if (String(name).indexOf(LOCATION_FLAGS[i].zh) !== -1) {
      return LOCATION_FLAGS[i].flag;
    }
  }

  return "";
}
