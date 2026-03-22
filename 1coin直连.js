/**
 * 1coin 直连节点重命名脚本
 * 功能：
 * 1. 清理 1coin 直连线路后缀
 * 2. 将常见日文地区名转换为简体中文
 * 3. 清理圈号、原始编号和 H/V/V 版本标记
 * 4. 保持原节点顺序，仅对重名节点补充顺序编号
 */

const NAME_REPLACEMENTS = [
  // 套餐类型
  [/共用プレ版/g, "日本 标准"],
  [/共用通常版/g, "日本 高级"],

  // 先处理长词，避免部分替换
  [/シリコンバレー/g, "美国"],
  [/インドネシア/g, "印度尼西亚"],
  [/ニュージーランド/g, "新西兰"],
  [/サウジアラビア/g, "沙特阿拉伯"],
  [/アラブ首長国連邦/g, "阿联酋"],
  [/南アフリカ/g, "南非"],
  [/カザフスタン/g, "哈萨克斯坦"],
  [/アルバニア/g, "阿尔巴尼亚"],

  // 亚洲
  [/シンガポール/g, "新加坡"],
  [/韓国/g, "韩国"],
  [/マレーシア/g, "马来西亚"],
  [/インド/g, "印度"],
  [/タイ/g, "泰国"],
  [/ベトナム/g, "越南"],
  [/フィリピン/g, "菲律宾"],
  [/香港/g, "香港"],
  [/台湾/g, "台湾"],
  [/日本/g, "日本"],

  // 美洲
  [/アメリカ/g, "美国"],
  [/ロス/g, "美国"],
  [/シカゴ/g, "美国"],
  [/カナダ/g, "加拿大"],
  [/ブラジル/g, "巴西"],
  [/メキシコ/g, "墨西哥"],
  [/チリ/g, "智利"],
  [/アルゼンチン/g, "阿根廷"],

  // 欧洲
  [/イギリス|英国/g, "英国"],
  [/ドイツ/g, "德国"],
  [/フランス/g, "法国"],
  [/イタリア/g, "意大利"],
  [/オランダ/g, "荷兰"],
  [/スペイン/g, "西班牙"],
  [/ポーランド/g, "波兰"],
  [/ギリシャ/g, "希腊"],
  [/スウェーデン/g, "瑞典"],
  [/ベルギー/g, "比利时"],
  [/フィンランド/g, "芬兰"],
  [/ウクライナ/g, "乌克兰"],
  [/ロシア/g, "俄罗斯"],
  [/オーストラリア/g, "澳大利亚"],

  // 中东
  [/イスラエル/g, "以色列"],
  [/トルコ/g, "土耳其"],
];

const SUFFIX_REPLACEMENTS = [
  [/\s*\|\s*専\[(?:2(?:\.0+)?)x\]\s*\|\s*中国大陸専用線?\s*$/i, ""],
  [/\s*\|\s*直\[(?:1(?:\.0+)?)x\]\s*\|\s*中国内外接続兼用\s*$/i, ""],
  [/\s*\|\s*直\[(?:1(?:\.0+)?)x\]\s*\|\s*中国大陸内外兼用\s*$/i, ""],
  [/\s*\|\s*直\[(?:1(?:\.0+)?)x\]\s*\|\s*中国外接続用\s*$/i, ""],
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

  const renamed = proxies.map((proxy) => renameProxy(proxy));
  return assignSequenceNumbers(renamed);
}

function renameProxy(proxy) {
  if (!proxy || typeof proxy.name !== "string") {
    return proxy;
  }

  const nextName = renameProxyName(proxy.name);
  if (nextName === proxy.name) {
    return proxy;
  }

  console.log(`节点重命名: "${proxy.name}" => "${nextName}"`);
  return {
    ...proxy,
    name: nextName,
  };
}

function renameProxyName(name) {
  let result = name;

  for (const [pattern, replacement] of SUFFIX_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }

  for (const [pattern, replacement] of NAME_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }

  result = replaceCircledNumbers(result);
  result = removeVersionMarkers(result);
  result = stripTrailingSequence(result);
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
    .replace(/([0-9\u4E00-\u9FFF\u3040-\u30FF])\s*[VvHh](?=\s|$|\|)/g, "$1")
    .replace(/[VvHh](?=\s|$|\|)/g, "");
}

function stripTrailingSequence(name) {
  return name.replace(/\s*\d+\s*$/g, "");
}

function cleanupName(name) {
  return name
    .replace(/\s*\|\s*/g, " | ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function assignSequenceNumbers(proxies) {
  const totalByName = Object.create(null);
  const currentByName = Object.create(null);

  for (const proxy of proxies) {
    if (!proxy || typeof proxy.name !== "string") {
      continue;
    }

    totalByName[proxy.name] = (totalByName[proxy.name] || 0) + 1;
  }

  return proxies.map((proxy) => {
    if (!proxy || typeof proxy.name !== "string") {
      return proxy;
    }

    const total = totalByName[proxy.name] || 0;
    if (total <= 1) {
      return proxy;
    }

    currentByName[proxy.name] = (currentByName[proxy.name] || 0) + 1;
    return {
      ...proxy,
      name: `${proxy.name} ${currentByName[proxy.name]}`,
    };
  });
}
