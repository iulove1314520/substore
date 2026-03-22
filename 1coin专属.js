/**
 * 1coin 节点重命名脚本
 * 功能：
 * 1. 将 1coin 常见日文节点名称转换为简体中文
 * 2. 清理专线/运营商后缀
 * 3. 将圈号数字改为阿拉伯数字
 * 4. 清理多余的 V 标识并统一名称格式
 */

const NAME_REPLACEMENTS = [
  // 套餐类型
  [/共用プレ版/g, "日本 标准"],
  [/共用通常版/g, "日本 高级"],

  // 亚洲地区
  [/シンガポール/g, "新加坡"],
  [/韓国/g, "韩国"],
  [/マレーシア/g, "马来西亚"],
  [/インドネシア/g, "印度尼西亚"],
  [/タイ/g, "泰国"],
  [/インド/g, "印度"],

  // 美洲地区
  [/シリコンバレー/g, "硅谷"],
  [/シカゴ/g, "芝加哥"],
  [/ロス/g, "洛杉矶"],
  [/カナダ/g, "加拿大"],
  [/ブラジル/g, "巴西"],
  [/メキシコ/g, "墨西哥"],
  [/チリ/g, "智利"],

  // 欧洲地区
  [/イギリス|英国/g, "英国"],
  [/ドイツ/g, "德国"],
  [/イタリア/g, "意大利"],
  [/フランス/g, "法国"],
  [/オランダ/g, "荷兰"],
  [/スペイン/g, "西班牙"],
  [/ポーランド/g, "波兰"],
  [/ギリシャ/g, "希腊"],
  [/スウェーデン/g, "瑞典"],
  [/ベルギー/g, "比利时"],
  [/フィンランド/g, "芬兰"],
  [/ウクライナ/g, "乌克兰"],
  [/ロシア/g, "俄罗斯"],
  [/アルバニア/g, "阿尔巴尼亚"],
  [/カザフスタン/g, "哈萨克斯坦"],

  // 中东地区
  [/イスラエル/g, "以色列"],
  [/トルコ/g, "土耳其"],

  // 大洋洲地区
  [/オーストラリア/g, "澳大利亚"],

  // 非洲地区
  [/南アフリカ/g, "南非"],
];

const CARRIER_REPLACEMENTS = [
  [/\s*\|\s*専\/電信\[(?:2(?:\.0+)?)x\]\s*\|\s*中国大陸専用線?\s*$/i, " | 电信"],
  [/\s*\|\s*専\/移動\[(?:2(?:\.0+)?)x\]\s*\|\s*中国大陸専用線?\s*$/i, " | 移动"],
  [/\s*\|\s*専\/聯通\[(?:2(?:\.0+)?)x\]\s*\|\s*中国大陸専用線?\s*$/i, " | 联通"],
  [/\s*\|\s*専\[(?:2(?:\.0+)?)x\]\s*\|\s*中国大陸専用線?\s*$/i, ""],
];

const CIRCLED_NUMBER_MAP = {
  "①": "1", "②": "2", "③": "3", "④": "4", "⑤": "5",
  "⑥": "6", "⑦": "7", "⑧": "8", "⑨": "9", "⑩": "10",
  "⑪": "11", "⑫": "12", "⑬": "13", "⑭": "14", "⑮": "15",
  "⑯": "16", "⑰": "17", "⑱": "18", "⑲": "19", "⑳": "20",
  "㉑": "21", "㉒": "22", "㉓": "23", "㉔": "24", "㉕": "25",
  "㉖": "26", "㉗": "27", "㉘": "28", "㉙": "29", "㉚": "30",
  "㉛": "31", "㉜": "32", "㉝": "33", "㉞": "34", "㉟": "35",
  "㊱": "36", "㊲": "37", "㊳": "38", "㊴": "39", "㊵": "40",
  "㊶": "41", "㊷": "42", "㊸": "43", "㊹": "44", "㊺": "45",
  "㊻": "46", "㊼": "47", "㊽": "48", "㊾": "49", "㊿": "50",
};

function operator(proxies = [], targetPlatform, context) {
  void targetPlatform;
  void context;

  if (!Array.isArray(proxies)) {
    return [];
  }

  let changedCount = 0;

  const renamedProxies = proxies.map((proxy) => {
    if (!proxy || typeof proxy.name !== "string") {
      return proxy;
    }

    const renamedName = renameProxyName(proxy.name);
    if (renamedName === proxy.name) {
      return proxy;
    }

    changedCount += 1;
    console.log(`节点重命名: "${proxy.name}" => "${renamedName}"`);

    return {
      ...proxy,
      name: renamedName,
    };
  });

  console.log(`1coin 节点重命名脚本执行完成，处理 ${proxies.length} 个节点，修改 ${changedCount} 个节点`);
  return renamedProxies;
}

function renameProxyName(name) {
  let result = name;

  for (const [pattern, replacement] of NAME_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }

  for (const [pattern, replacement] of CARRIER_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }

  result = replaceCircledNumbers(result);
  result = removeVersionMarkers(result);
  result = cleanupName(result);

  return result;
}

function replaceCircledNumbers(name) {
  let result = name;

  for (const [circled, arabic] of Object.entries(CIRCLED_NUMBER_MAP)) {
    result = result.replace(new RegExp(circled, "g"), arabic);
  }

  return result;
}

function removeVersionMarkers(name) {
  return name
    .replace(/(\d+)[Vv](?=\s|$|\|)/g, "$1")
    .replace(/[Vv](?=\s|$|\|)/g, "");
}

function cleanupName(name) {
  return name
    .replace(/\s*\|\s*/g, " | ")
    .replace(/\s{2,}/g, " ")
    .trim();
}
