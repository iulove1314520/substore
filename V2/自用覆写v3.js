// 以 SERVICE_SPECS 为唯一配置面生成 mihomo 策略组、规则集、规则和托管 DNS。
/**
 * 自用 v3 — Sub-Store 的 mihomo 配置覆写脚本，在 mihomo 配置文件的脚本操作中使用 main(config)。
 *
 * 设计要点：
 * - 输入为已展开到 config.proxies 的节点；保留节点字段、TUN 等客户端设置，只重建策略组、规则集和规则，DNS/hosts 按 dnsMode 处理。
 * - SERVICE_SPECS 是唯一的平台配置面：出口、地区组、节点范围、低倍率、规则来源写在同一条规格里，规则集名与规则由规格生成。
 * - 规则顺序由 RULE_ORDER 显式给出：前置直连 → QUIC → 广告 → 零散规则 → 域名规则 → IP 规则 → MATCH。
 * - 节点先做一次索引（地区集合、低倍率、游戏专线），之后所有分组只做集合查询。
 * - 地区识别表与 V2/节点中文化.js 同源；倍率识别与 V2/节点排序.js 一致。
 * - AI 组按各家官方支持范围过滤节点，未识别地区不进入 AI 组，范围见 AI_UNSUPPORTED_REGIONS。
 * - 托管 DNS 以白名单继承机场字段，只保留与节点域名相关的策略条目并按注册域折叠；机场 rule-providers / sub-rules 不输出。
 * - 生成期校验：组成员、规则出口、规则集、DNS 中的 #策略组、下载代理、循环引用、无引用规则集，全部大小写敏感。
 * - 变更历史见 记录.md。
 *
 * 官方字段参考：
 * https://wiki.metacubex.one/config/proxy-groups/
 * https://wiki.metacubex.one/config/rule-providers/
 */

const SETTINGS = {
  // true：未声明 nodes 的服务组引用 Manual；false：这些组直接展开全部普通节点，且不生成 Manual。
  compactServiceGroups: true,
  // preserve：完全保留原 DNS/hosts；managed：启用本脚本的分流 DNS。
  dnsMode: "managed",
  // managed 模式下，将机场的非公共 DNS 限定用于解析节点服务器域名。
  preservePrivateDns: true,
  // 默认 hosts 仅用于固定 DoH 入口和兼容 Google Play；用户 hosts 拥有更高优先级。
  addDefaultHosts: true,
  // 可选屏蔽哔哩哔哩 PCDN，不默认改变用户访问行为。
  blockBilibiliPcdn: false,
  // 屏蔽非国内目标的 UDP 443（QUIC），让浏览器和 YouTube 回落 TCP；多数代理协议对 UDP 支持不佳。
  blockForeignQuic: true,
  // 生成“低倍率”手选组及其隐藏测速子组；判定规则见 isLowRateNode。
  enableLowRateGroup: true,
  // 生成 AdBlock 组和广告域名规则；关闭后分组、规则集、规则一起不输出。
  enableAdBlock: true,
  enableLoadBalance: true,
  loadBalanceStrategy: "sticky-sessions",
  testUrl: "https://www.gstatic.com/generate_204",
  // Auto、地区子组、低倍率子组共用；同一节点会被多个组探测，600 秒足够。
  urlTestInterval: 600,
  loadBalanceInterval: 600,
  testTimeout: 5000,
  tolerance: 50,
  maxFailedTimes: 5,
  ruleUpdateInterval: 86400,
  // 留空则内核直连下载规则集；若 jsdelivr 也不可达，可填策略组名（如 "Worldwide"）改为经代理下载。
  ruleProviderProxy: "",
};

// ---------------------------------------------------------------------------
// 名称常量：所有内部引用都走这里，避免字面量散落。
// ---------------------------------------------------------------------------

const AUTO_GROUP_NAME = "Auto";
const MANUAL_GROUP_NAME = "Manual";
const LOAD_BALANCE_GROUP_NAME = "负载均衡";
const LOW_RATE_GROUP_NAME = "低倍率";
const AD_BLOCK_GROUP_NAME = "AdBlock";
const CHINA_GROUP_NAME = "China";
const WORLDWIDE_GROUP_NAME = "Worldwide";
const OTHER_GROUP_NAME = "Other";
// 国外 DNS 的出口策略组，同时受引用校验保护。
const DNS_PROXY_GROUP_NAME = WORLDWIDE_GROUP_NAME;

// 地区手选组；这五个地区的 ISO 代号允许小写匹配（v1 行为）。
const COUNTRY_GROUP_NAMES = ["HK", "TW", "JP", "SG", "US"];
const BUILTIN_PROXY_NAMES = ["DIRECT", "REJECT", "REJECT-DROP", "PASS", "COMPATIBLE", "GLOBAL"];
const GAME_PATTERN = /游戏|game/i;

function autoNameOf(name) {
  return name + "-Auto";
}

// ---------------------------------------------------------------------------
// 规则集来源根地址：全部走 fastly.jsdelivr.net，raw.githubusercontent.com 在国内启动阶段常握手超时。
// ---------------------------------------------------------------------------

const ROOTS = {
  metaDomain: "https://fastly.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/",
  metaIp: "https://fastly.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geoip/",
  bettDomain: "https://fastly.jsdelivr.net/gh/appshubcc/bett-rules@meta/geo/geosite/",
  bettIp: "https://fastly.jsdelivr.net/gh/appshubcc/bett-rules@meta/geo/geoip/",
  // 个人列表：分支引用带 CDN 缓存，仓库更新后需等缓存刷新才会生效。
  personal: "https://fastly.jsdelivr.net/gh/iulove1314520/iulove@main/",
  emby666: "https://fastly.jsdelivr.net/gh/666OS/rules@release/mihomo/domain/",
  emos: "https://fastly.jsdelivr.net/gh/binaryu/emos-proxy-rule@main/rules/",
  adblock: "https://fastly.jsdelivr.net/gh/217heidai/adblockfilters@main/rules/",
};

// ---------------------------------------------------------------------------
// 地区识别表：与 V2/节点中文化.js 的别名表同源。按节点名称识别，不代表实际出口。
// flag / zh 直接匹配，zh 可配 exclude 排除更长的同前缀词；en 忽略大小写、前后不能是字母，多词允许空格、点、下划线、
// 短横线、斜杠或连写；iso 默认只匹配大写（避免 IN、IT、AT、BE 与英文单词撞车），COUNTRY_GROUP_NAMES 允许小写。
// ---------------------------------------------------------------------------

const COUNTRY_TABLE = {
  HK: { flag: "🇭🇰", zh: ["香港"], en: ["hong kong", "kowloon"], iso: ["HK", "HKG"] },
  MO: { flag: "🇲🇴", zh: ["澳门", "澳門"], en: ["macau", "macao"], iso: ["MO", "MAC"] },
  TW: { flag: "🇹🇼", zh: ["台湾", "臺灣", "台灣"], en: ["taiwan", "tai wan", "tai pei", "kaoh siung", "tai chung", "taipei", "kaohsiung", "taichung", "hsinchu"], iso: ["TW", "TWN"] },
  CN: { flag: "🇨🇳", zh: ["中国", "中國"], en: ["china", "main land", "mainland", "beijing", "shanghai", "guangzhou", "shenzhen", "hangzhou", "chengdu", "nanjing", "wuhan", "xiamen"], iso: ["CHN"] },
  JP: { flag: "🇯🇵", zh: ["日本"], en: ["japan", "tokyo", "osaka", "yokohama", "nagoya", "kyoto", "fukuoka", "sapporo"], iso: ["JP", "JPN"] },
  KR: { flag: "🇰🇷", zh: ["韩国", "韓國"], en: ["south korea", "republic of korea", "korea republic", "southkorea", "korea", "seoul", "busan", "incheon"], iso: ["KR", "KOR"] },
  SG: { flag: "🇸🇬", zh: ["新加坡", "狮城", "獅城"], en: ["singapore", "singa pore"], iso: ["SG", "SGP"] },
  MY: { flag: "🇲🇾", zh: ["马来西亚", "馬來西亞"], en: ["malaysia", "kuala lumpur", "kualalumpur", "penang", "johor"], iso: ["MY", "MYS"] },
  TH: { flag: "🇹🇭", zh: ["泰国", "泰國"], en: ["thailand", "bangkok", "thai"], iso: ["TH", "THA"] },
  PH: { flag: "🇵🇭", zh: ["菲律宾", "菲律賓"], en: ["philippines", "manila"], iso: ["PH", "PHL"] },
  VN: { flag: "🇻🇳", zh: ["越南"], en: ["vietnam", "ho chi minh", "hochiminh", "saigon", "hanoi"], iso: ["VN", "VNM"] },
  IN: { flag: "🇮🇳", zh: ["印度"], exclude: ["印度尼西亚", "印度尼西亞"], en: ["india", "mumbai", "delhi", "bangalore", "bengaluru", "hyderabad", "chennai", "kolkata"], iso: ["IN", "IND"] },
  BD: { flag: "🇧🇩", zh: ["孟加拉国", "孟加拉國"], en: ["bangladesh", "dhaka"], iso: ["BD", "BGD"] },
  ID: { flag: "🇮🇩", zh: ["印度尼西亚", "印度尼西亞", "印尼"], en: ["indonesia", "jakarta", "surabaya"], iso: ["ID", "IDN"] },
  MM: { flag: "🇲🇲", zh: ["缅甸", "緬甸"], en: ["myanmar", "burma", "yangon"], iso: ["MM", "MMR"] },
  AE: { flag: "🇦🇪", zh: ["阿联酋", "阿聯酋"], en: ["united arab emirates", "unitedarabemirates", "dubai", "abu dhabi", "abudhabi"], iso: ["AE", "UAE"] },
  SA: { flag: "🇸🇦", zh: ["沙特阿拉伯", "沙特"], en: ["saudi arabia", "saudiarabia", "riyadh", "jeddah"], iso: ["SA", "SAU"] },
  QA: { flag: "🇶🇦", zh: ["卡塔尔"], en: ["qatar", "doha"], iso: ["QA", "QAT"] },
  KZ: { flag: "🇰🇿", zh: ["哈萨克斯坦", "哈薩克斯坦"], en: ["kazakhstan", "astana", "almaty", "nur sultan", "nursultan"], iso: ["KZ", "KAZ"] },
  IL: { flag: "🇮🇱", zh: ["以色列"], en: ["israel", "tel aviv", "telaviv", "jerusalem"], iso: ["IL", "ISR"] },
  TR: { flag: "🇹🇷", zh: ["土耳其"], en: ["turkey", "turkiye", "istanbul", "ankara"], iso: ["TR", "TUR"] },
  UK: { flag: "🇬🇧", zh: ["英国", "英國"], en: ["united kingdom", "u k", "unitedkingdom", "britain", "england", "london", "manchester", "birmingham"], iso: ["UK", "GB", "GBR"] },
  DE: { flag: "🇩🇪", zh: ["德国", "德國"], en: ["germany", "frankfurt", "berlin", "munich", "dusseldorf", "hamburg"], iso: ["DE", "DEU"] },
  FR: { flag: "🇫🇷", zh: ["法国", "法國"], en: ["france", "paris", "marseille", "lyon"], iso: ["FR", "FRA"] },
  IT: { flag: "🇮🇹", zh: ["意大利", "義大利"], en: ["italy", "rome", "milan", "naples"], iso: ["IT", "ITA"] },
  ES: { flag: "🇪🇸", zh: ["西班牙"], en: ["spain", "madrid", "barcelona", "valencia"], iso: ["ES", "ESP"] },
  PT: { flag: "🇵🇹", zh: ["葡萄牙"], en: ["portugal", "lisbon", "porto"], iso: ["PT", "PRT"] },
  NL: { flag: "🇳🇱", zh: ["荷兰", "荷蘭"], en: ["netherlands", "holland", "amsterdam", "rotterdam"], iso: ["NL", "NLD"] },
  CH: { flag: "🇨🇭", zh: ["瑞士"], en: ["switzerland", "zurich", "geneva"], iso: ["CH", "CHE", "SUI"] },
  SE: { flag: "🇸🇪", zh: ["瑞典"], en: ["sweden", "stockholm", "gothenburg"], iso: ["SE", "SWE"] },
  IS: { flag: "🇮🇸", zh: ["冰岛", "冰島"], en: ["iceland", "reykjavik"], iso: ["IS", "ISL"] },
  NO: { flag: "🇳🇴", zh: ["挪威"], en: ["norway", "oslo", "bergen"], iso: ["NOR"] },
  FI: { flag: "🇫🇮", zh: ["芬兰", "芬蘭"], en: ["finland", "helsinki"], iso: ["FI", "FIN"] },
  DK: { flag: "🇩🇰", zh: ["丹麦", "丹麥"], en: ["denmark", "copenhagen"], iso: ["DK", "DNK"] },
  BE: { flag: "🇧🇪", zh: ["比利时", "比利時"], en: ["belgium", "brussels"], iso: ["BE", "BEL"] },
  AT: { flag: "🇦🇹", zh: ["奥地利", "奧地利"], en: ["austria", "vienna"], iso: ["AT", "AUT"] },
  IE: { flag: "🇮🇪", zh: ["爱尔兰", "愛爾蘭"], en: ["ireland", "dublin"], iso: ["IE", "IRL"] },
  LU: { flag: "🇱🇺", zh: ["卢森堡", "盧森堡"], en: ["luxembourg", "luxemburg"], iso: ["LU", "LUX"] },
  PL: { flag: "🇵🇱", zh: ["波兰", "波蘭"], en: ["poland", "warsaw"], iso: ["PL", "POL"] },
  CZ: { flag: "🇨🇿", zh: ["捷克"], en: ["czech republic", "czechrepublic", "czechia", "czech", "prague"], iso: ["CZ", "CZE"] },
  HU: { flag: "🇭🇺", zh: ["匈牙利"], en: ["hungary", "budapest"], iso: ["HU", "HUN"] },
  RO: { flag: "🇷🇴", zh: ["罗马尼亚", "羅馬尼亞"], en: ["romania", "bucharest"], iso: ["RO", "ROU"] },
  GR: { flag: "🇬🇷", zh: ["希腊", "希臘"], en: ["greece", "athens"], iso: ["GR", "GRC"] },
  BG: { flag: "🇧🇬", zh: ["保加利亚", "保加利亞"], en: ["bulgaria", "sofia"], iso: ["BG", "BGR"] },
  RU: { flag: "🇷🇺", zh: ["俄罗斯", "俄羅斯"], en: ["russia", "moscow", "saint petersburg", "st petersburg", "saintpetersburg", "stpetersburg"], iso: ["RU", "RUS"] },
  UA: { flag: "🇺🇦", zh: ["乌克兰", "烏克蘭"], en: ["ukraine", "kyiv", "kiev"], iso: ["UA", "UKR"] },
  US: { flag: "🇺🇸", zh: ["美国", "美國"], en: ["united states", "united states of america", "u s a", "u s", "los angeles", "san jose", "new york", "las vegas", "silicon valley", "losangeles", "sanjose", "newyork", "lasvegas", "siliconvalley", "seattle", "chicago", "dallas", "miami", "phoenix", "atlanta", "ashburn"], iso: ["US", "USA"] },
  CA: { flag: "🇨🇦", zh: ["加拿大"], en: ["canada", "toronto", "vancouver", "montreal", "ottawa", "calgary"], iso: ["CA", "CAN"] },
  MX: { flag: "🇲🇽", zh: ["墨西哥"], en: ["mexico", "mexico city", "mexicocity", "guadalajara"], iso: ["MX", "MEX"] },
  BR: { flag: "🇧🇷", zh: ["巴西"], en: ["brazil", "sao paulo", "rio de janeiro", "saopaulo", "riodejaneiro"], iso: ["BR", "BRA"] },
  AR: { flag: "🇦🇷", zh: ["阿根廷"], en: ["argentina", "buenos aires", "buenosaires"], iso: ["AR", "ARG"] },
  CL: { flag: "🇨🇱", zh: ["智利"], en: ["chile", "santiago"], iso: ["CL", "CHL"] },
  CO: { flag: "🇨🇴", zh: ["哥伦比亚", "哥倫比亞"], en: ["colombia", "bogota"], iso: ["CO", "COL"] },
  PE: { flag: "🇵🇪", zh: ["秘鲁", "秘魯"], en: ["peru", "lima"], iso: ["PE", "PER"] },
  AU: { flag: "🇦🇺", zh: ["澳大利亚", "澳大利亞", "澳洲"], en: ["australia", "sydney", "melbourne", "brisbane", "perth"], iso: ["AU", "AUS"] },
  NZ: { flag: "🇳🇿", zh: ["新西兰", "紐西蘭"], en: ["new zealand", "newzealand", "auckland", "wellington", "christchurch"], iso: ["NZ", "NZL"] },
  ZA: { flag: "🇿🇦", zh: ["南非"], en: ["south africa", "southafrica", "johannesburg", "cape town", "capetown"], iso: ["ZA", "ZAF"] },
  NG: { flag: "🇳🇬", zh: ["尼日利亚", "奈及利亞"], en: ["nigeria", "lagos", "abuja"], iso: ["NG", "NGA"] },
  EG: { flag: "🇪🇬", zh: ["埃及"], en: ["egypt", "cairo"], iso: ["EG", "EGY"] },
};

// 补充模式：v1 沿用的中文城市名、单字简称；CN 代号后不能接数字，避免 CN2 线路被当成中国。
const REGION_EXTRA_PATTERNS = {
  HK: "(?:^|[\\s/|_-])港(?=$|[\\s/|_-])",
  TW: "台北|臺北|高雄|台中|臺中|(?:^|[\\s/|_-])台(?=$|[\\s/|_-])",
  JP: "东京|東京|大阪|(?:^|[\\s/|_-])日(?=$|[\\s/|_-])",
  US: "波特兰|达拉斯|俄勒冈|凤凰城|费利蒙|硅谷|拉斯维加斯|洛杉矶|圣何塞|圣克拉拉|西雅图|芝加哥|休斯顿",
  UK: "伦敦|倫敦",
  FR: "巴黎",
  DE: "法兰克福|法蘭克福",
  CN: "(?:^|[^A-Za-z])CN(?=$|[^A-Za-z0-9])",
};

const REGION_CODES = Object.keys(COUNTRY_TABLE);
const REGION_MATCHERS = buildRegionMatchers();

function buildRegionMatchers() {
  const matchers = {};
  for (const code of REGION_CODES) {
    const entry = COUNTRY_TABLE[code];
    const loose = COUNTRY_GROUP_NAMES.includes(code);
    const isoPatterns = entry.iso.map(tokenPattern);
    const parts = [escapeRegex(entry.flag)].concat(
      entry.zh.map((alias) => zhPattern(alias, entry.exclude || [])),
      entry.en.map(aliasPattern),
      loose ? isoPatterns : []
    );
    if (REGION_EXTRA_PATTERNS[code]) parts.push(REGION_EXTRA_PATTERNS[code]);
    matchers[code] = {
      ci: new RegExp(parts.join("|"), "i"),
      cs: loose || isoPatterns.length === 0 ? null : new RegExp(isoPatterns.join("|")),
    };
  }
  return matchers;
}

// 中文别名：exclude 里以该别名开头的更长词会被排除，例如 印度 不匹配 印度尼西亚。
function zhPattern(alias, exclude) {
  const tails = exclude.filter((word) => word.startsWith(alias) && word.length > alias.length)
    .map((word) => escapeRegex(word.slice(alias.length)));
  return escapeRegex(alias) + (tails.length > 0 ? "(?!" + tails.join("|") + ")" : "");
}

// 英文别名：前后不能是字母；多词之间允许空格、点、下划线、短横线、斜杠或直接连写。
function aliasPattern(alias) {
  return "(?:^|[^A-Za-z])" + alias.split(" ").map(escapeRegex).join("[\\s._/-]*") + "(?=$|[^A-Za-z])";
}

function tokenPattern(code) {
  return "(?:^|[^A-Za-z])" + escapeRegex(code) + "(?=$|[^A-Za-z])";
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesRegion(name, code) {
  const matcher = REGION_MATCHERS[code];
  if (!matcher) throw new Error("自用v3：未定义的地区：" + code);
  return matcher.ci.test(name) || (matcher.cs !== null && matcher.cs.test(name));
}

// ---------------------------------------------------------------------------
// 倍率识别：与 V2/节点排序.js 完全一致。低倍率 = 倍率数值小于 1，或带独立 EX 代号 / “低倍率”标签。
// ---------------------------------------------------------------------------

const MULTIPLIER_PATTERNS = [
  /(?:^|[^A-Za-z0-9.])[xX×]\s*(\d+(?:[.,]\d+)?)(?=$|[^A-Za-z0-9])/,
  /(?:^|[^A-Za-z0-9.])(\d+(?:[.,]\d+)?)\s*[xX×](?=$|[^A-Za-z0-9])/,
  /(?:^|[^A-Za-z0-9.])(\d+(?:[.,]\d+)?)\s*倍(?:率)?/,
  /倍率\s*[:：]?\s*(\d+(?:[.,]\d+)?)/,
];
const LOW_MULTIPLIER_MAX = 1;
const LOW_MULTIPLIER_TAG = /(?:^|[^A-Za-z0-9])EX(?=$|[^A-Za-z])|低倍率/i;

function extractMultiplier(name) {
  for (const pattern of MULTIPLIER_PATTERNS) {
    const match = pattern.exec(name);
    if (!match) continue;
    const value = Number.parseFloat(match[1].replace(",", "."));
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function isLowRateNode(name) {
  const multiplier = extractMultiplier(name);
  return (multiplier !== null && multiplier < LOW_MULTIPLIER_MAX) || LOW_MULTIPLIER_TAG.test(name);
}

// ---------------------------------------------------------------------------
// AI 服务官方支持范围，核对日期 2026-09-19，逐家独立核对，以“识别表内地区 − 官方未列出的地区”表达：
// ChatGPT：OpenAI 支持列表未含中国大陆、香港、澳门、俄罗斯。
// Gemini：Google 列表含香港、澳门；中国大陆仅 Workspace 账号，俄罗斯未列。
// Claude：Anthropic 列表未含中国大陆、香港、澳门、俄罗斯、缅甸。
// Grok：xAI 未公布国家列表，官方口径为“X 可用的地区”并排除美国全面制裁地区；X 在中国大陆与俄罗斯被封锁，按此排除。
// 键名必须与 SERVICE_SPECS 中 nodes: "ai" 的组名一致。
// ---------------------------------------------------------------------------

const AI_UNSUPPORTED_REGIONS = {
  ChatGPT: ["CN", "HK", "MO", "RU"],
  Gemini: ["CN", "RU"],
  Claude: ["CN", "HK", "MO", "RU", "MM"],
  Grok: ["CN", "RU"],
};

function aiSupportedRegions(service) {
  const unsupported = AI_UNSUPPORTED_REGIONS[service];
  if (!unsupported) throw new Error("自用v3：AI_UNSUPPORTED_REGIONS 缺少 " + service + " 的支持范围。");
  return REGION_CODES.filter((code) => !unsupported.includes(code));
}

// ---------------------------------------------------------------------------
// 服务规格：唯一的平台配置面。字段全部可选，未写即取默认值。
//
// 出口与成员（最终顺序：defaultSelected → DIRECT/head → Auto → 负载均衡 → 低倍率 → 地区组 → 节点 → 游戏专线）：
//   direct: true            首位加入 DIRECT
//   head: [...]             紧随 DIRECT 的内置出口，如 REJECT / REJECT-DROP / PASS
//   auto: false             不加入 Auto（默认加入）
//   countries: false | [..] 地区组，默认 COUNTRY_GROUP_NAMES 全部；false 不带；数组按给定顺序
//   loadBalance: false      不加入负载均衡（默认加入）
//   lowRate: true           加入低倍率（默认不加）
//   nodes                   "manual"（默认，精简模式下引用 Manual）| "all" 全部普通节点 | "none" |
//                           ["HK", ...] 仅这些地区的节点 | "ai" 按 AI_UNSUPPORTED_REGIONS[name] 过滤
//   locked: true            地区锁定组：不带负载均衡、低倍率和 Manual，nodes 必须是地区数组或 "ai"
//   gameNodes: true         末尾附加名称含“游戏/game”的专线节点
//   defaultSelected         默认出口，提到首位并写入 default-selected；成员不存在时忽略
//   emptyFallback           成员为空时的兜底出口，默认 REJECT
//   enabledBy               受 SETTINGS 中对应布尔开关控制
//
// 规则来源 rules（生成的规则集名为 <组名>_Domain / <组名>_IP / <组名>_Custom / <组名>_<key>）：
//   domain: "file" | ["file", root] | {file, root, key, stage}   域名 MRS，默认 MetaCubeX geosite
//   ip:     同上                                                 IP MRS，默认 MetaCubeX geoip，规则带 no-resolve
//   list:   "file" | {file, stage}                               个人 classical 文本，默认 ROOTS.personal
//   more:   [{kind, file, root, key}]                            额外来源，key 必填
//   extra:  ["DOMAIN-SUFFIX,xxx", ...]                            不带出口的零散规则，出口为本组
//   stage 取值 prefix / block / extra / domain / ip，决定规则位置，默认按类型：domain、list → domain，ip → ip。
// ---------------------------------------------------------------------------

const AI_HEAD = ["REJECT"];
const AI_COUNTRIES = ["TW", "JP", "SG", "US"];
const DOMESTIC_ONLY = { direct: true, auto: false, countries: false, loadBalance: false, nodes: "all" };
const GAME_STORE = { direct: true, auto: false, countries: false, loadBalance: false, lowRate: true, nodes: COUNTRY_GROUP_NAMES };

const SERVICE_SPECS = [
  // 广告拦截：默认 REJECT，PASS 用于临时放行；不加入任何节点。规则排在所有服务规则之前。
  { name: AD_BLOCK_GROUP_NAME, head: ["REJECT", "REJECT-DROP", "PASS"], auto: false, countries: false, loadBalance: false, nodes: "none",
    enabledBy: "enableAdBlock", rules: { domain: { file: "adblockmihomolite", root: ROOTS.adblock, stage: "block" } } },
  { name: "1Password", direct: true, rules: { list: "1password.list" } },

  // AI 服务：默认 REJECT；可选 TW / JP / SG / US 地区组；节点按各家官方支持范围过滤。
  { name: "ChatGPT", head: AI_HEAD, auto: false, countries: AI_COUNTRIES, nodes: "ai", locked: true, defaultSelected: "REJECT", rules: { domain: "openai" } },
  { name: "Gemini", head: AI_HEAD, auto: false, countries: AI_COUNTRIES, nodes: "ai", locked: true, defaultSelected: "REJECT", rules: { domain: "google-gemini" } },
  { name: "Claude", head: AI_HEAD, auto: false, countries: AI_COUNTRIES, nodes: "ai", locked: true, defaultSelected: "REJECT", rules: { domain: "anthropic" } },
  // xai 列表含 grok.com、grok.x.com、grokipedia.com、x.ai。
  { name: "Grok", head: AI_HEAD, auto: false, countries: AI_COUNTRIES, nodes: "ai", locked: true, defaultSelected: "REJECT", rules: { domain: "xai" } },
  { name: "Perplexity", nodes: "all", rules: { domain: "perplexity" } },

  // 影视：EMBY / YouTube 默认走低倍率，没有低倍率节点时自动退到下一项。
  { name: "EMBY", direct: true, nodes: "all", lowRate: true, defaultSelected: LOW_RATE_GROUP_NAME,
    rules: { domain: ["Emby", ROOTS.emby666], more: [{ kind: "domain", key: "Emos", file: "emos-mihomo", root: ROOTS.emos }],
             list: "emby.list", extra: ["DOMAIN-SUFFIX,mb3admin.com"] } },
  { name: "YouTube", nodes: "all", lowRate: true, defaultSelected: LOW_RATE_GROUP_NAME, rules: { domain: "youtube" } },
  { name: "Google", rules: { domain: "google", ip: "google" } },
  { name: "Github", rules: { domain: "github" } },
  { name: "Cloudflare", direct: true, rules: { domain: "cloudflare", ip: "cloudflare" } },
  { name: "Paypal", direct: true, rules: { domain: "paypal" } },
  // Telegram 在中国大陆无法直连，不提供 DIRECT。
  { name: "Telegram", lowRate: true, rules: { domain: "telegram", ip: "telegram" } },
  { name: "Discord", lowRate: true, rules: { domain: "discord" } },
  { name: "Apple", direct: true, rules: { domain: "apple", ip: ["apple", ROOTS.bettIp] } },
  { name: "OneDrive", direct: true, lowRate: true, rules: { domain: "onedrive" } },
  { name: "Microsoft", direct: true, rules: { domain: "microsoft", ip: ["microsoft", ROOTS.bettIp] } },
  { name: "X", lowRate: true, rules: { domain: "twitter", ip: "twitter" } },
  { name: "Instagram", lowRate: true, rules: { domain: "instagram" } },
  { name: "Facebook", rules: { domain: "facebook", ip: "facebook" } },
  // 国内平台：只有 DIRECT 和全部节点。
  Object.assign({ name: "Xiaohongsu", rules: { domain: "xiaohongshu" } }, DOMESTIC_ONLY),
  Object.assign({ name: "DouYin", rules: { domain: "douyin" } }, DOMESTIC_ONLY),
  { name: "Spotify", rules: { domain: "spotify", ip: ["spotify", ROOTS.bettIp] } },
  { name: "Netflix", nodes: "all", rules: { domain: "netflix", ip: "netflix" } },
  { name: "Disney", nodes: "all", rules: { domain: "disney", extra: ["DOMAIN-SUFFIX,disney.my.sentry.io"] } },
  { name: "TikTok", auto: false, countries: ["JP", "HK", "TW", "SG", "US"], nodes: "all", lowRate: true, defaultSelected: "JP",
    rules: { domain: "tiktok", ip: ["tiktok", ROOTS.bettIp] } },
  // 巴哈姆特动画疯：台湾主站授权最全，另有授权范围较窄的港澳版；没有对应节点时退回 Auto 而不是 REJECT。
  { name: "Bahamut", auto: false, countries: ["TW", "HK"], nodes: ["TW", "HK", "MO"], locked: true, emptyFallback: AUTO_GROUP_NAME,
    rules: { domain: "bahamut" } },
  // 哔哩哔哩：港澳台限定内容对应 HK / MO / TW；规则集含 bilibili.tv、biliintl.com，Bstation 授权区为印尼、马来西亚、
  // 新加坡、越南、泰国，菲律宾亦有发行。
  { name: "Bilibili", direct: true, auto: false, countries: ["HK", "TW", "SG"], nodes: ["HK", "MO", "TW", "SG", "MY", "TH", "VN", "ID", "PH"],
    locked: true, rules: { domain: "bilibili" } },
  // 游戏商店：只有 DIRECT、低倍率和五地节点；游戏专线由 Game 组承载。
  Object.assign({ name: "Steam", rules: { domain: "steam", ip: ["steam", ROOTS.bettIp] } }, GAME_STORE),
  Object.assign({ name: "EPIC", rules: { domain: "epicgames" } }, GAME_STORE),
  { name: "Game", direct: true, gameNodes: true, rules: { domain: "category-games-!cn" } },
  { name: WORLDWIDE_GROUP_NAME, rules: { domain: "geolocation-!cn", list: "Global.list", extra: ["DOMAIN-SUFFIX,sub.texon.io"] } },
  // MATCH 兜底组，没有自己的规则。
  { name: OTHER_GROUP_NAME, direct: true, nodes: "all" },
  // 国内：个人列表在前置直连阶段，域名集在全球规则之后，IP 集最后。
  { name: CHINA_GROUP_NAME, direct: true, auto: false, countries: false, loadBalance: false, nodes: "none",
    rules: { domain: "cn", ip: "cn", list: { file: "china.list", stage: "prefix" } } },
];

// 规则顺序：具体服务优先于通用平台（Google / Apple / Microsoft）和全球兜底，China 最后；AdBlock 不在此列，走 block 阶段。
const RULE_ORDER = [
  "1Password", "ChatGPT", "Gemini", "Claude", "Grok", "Perplexity", "Discord", "YouTube", "Github", "Paypal",
  "Telegram", "X", "Instagram", "Facebook", "Xiaohongsu", "DouYin", "Spotify", "Bilibili", "Disney", "Netflix",
  "TikTok", "Bahamut", "EPIC", "Steam", "Google", "Apple", "OneDrive", "Microsoft", "Game", "EMBY", "Cloudflare",
  WORLDWIDE_GROUP_NAME, CHINA_GROUP_NAME,
];
const RULE_STAGES = ["prefix", "block", "extra", "domain", "ip"];

const SOURCE_PRESETS = {
  domain: { key: "Domain", behavior: "domain", format: "mrs", root: ROOTS.metaDomain, ext: ".mrs", stage: "domain" },
  ip: { key: "IP", behavior: "ipcidr", format: "mrs", root: ROOTS.metaIp, ext: ".mrs", stage: "ip" },
  list: { key: "Custom", behavior: "classical", format: "text", root: ROOTS.personal, ext: "", stage: "domain" },
};

// ---------------------------------------------------------------------------
// 系统规则集与前置规则：不属于任何服务，直接直连。
// ---------------------------------------------------------------------------

const SYSTEM_PROVIDERS = {
  Private_Domain: mrsSource("private", ROOTS.metaDomain, "domain"),
  Private_IP: mrsSource("private", ROOTS.metaIp, "ipcidr"),
  // 仅托管 DNS 使用，用于 fake-ip-filter。
  FakeIP_Filter: Object.assign(mrsSource("fakeip-filter", ROOTS.bettDomain, "domain"), { managedOnly: true }),
  // 国内分支在服务规则之前直连，避免切换 Apple / Microsoft / Steam 组时国内 CDN 也走代理。
  Apple_CN: mrsSource("apple@cn", ROOTS.metaDomain, "domain"),
  Microsoft_CN: mrsSource("microsoft@cn", ROOTS.metaDomain, "domain"),
  Games_CN: mrsSource("category-games@cn", ROOTS.metaDomain, "domain"),
};

function mrsSource(file, root, behavior) {
  return { behavior: behavior, format: "mrs", url: root + file + ".mrs" };
}

// 下载器规则含进程名和 DOMAIN-KEYWORD，不能转 MRS；前置避免国外 tracker 域名先被服务或全球规则截走。
const DOWNLOAD_RULES = [
  "PROCESS-NAME,aria2c.exe",
  "PROCESS-NAME,fdm.exe",
  "PROCESS-NAME,Folx.exe",
  "PROCESS-NAME,NetTransport.exe",
  "PROCESS-NAME,Thunder.exe",
  "PROCESS-NAME,Transmission.exe",
  "PROCESS-NAME,uTorrent.exe",
  "PROCESS-NAME,WebTorrent.exe",
  "PROCESS-NAME,WebTorrent Helper.exe",
  "PROCESS-NAME,qbittorrent.exe",
  "DOMAIN-SUFFIX,smtp",
  "DOMAIN-KEYWORD,aria2",
  "PROCESS-NAME,DownloadService.exe",
  "PROCESS-NAME,Weiyun.exe",
  "PROCESS-NAME,baidunetdisk.exe",
];

const PREFIX_RULES = [
  ruleSetRule("Private_Domain", CHINA_GROUP_NAME, false),
  ruleSetRule("Private_IP", CHINA_GROUP_NAME, true),
  ruleSetRule("China_Download", CHINA_GROUP_NAME, false),
  ruleSetRule("Apple_CN", CHINA_GROUP_NAME, false),
  ruleSetRule("Microsoft_CN", CHINA_GROUP_NAME, false),
  ruleSetRule("Games_CN", CHINA_GROUP_NAME, false),
];

// 屏蔽非国内目标的 UDP 443；内层复用 China 组的域名集与 IP 集。
const FOREIGN_QUIC_RULE =
  "AND,((NETWORK,UDP),(DST-PORT,443),(NOT,((OR,((RULE-SET,China_Domain),(RULE-SET,China_IP,no-resolve)))))),REJECT";

function ruleSetRule(provider, group, noResolve) {
  return "RULE-SET," + provider + "," + group + (noResolve ? ",no-resolve" : "");
}

// ---------------------------------------------------------------------------
// DNS 常量
// ---------------------------------------------------------------------------

const CHINA_DNS = ["223.5.5.5#DIRECT", "119.29.29.29#DIRECT"];
const FOREIGN_DNS = [
  "https://cloudflare-dns.com/dns-query#" + DNS_PROXY_GROUP_NAME,
  "https://dns.google/dns-query#" + DNS_PROXY_GROUP_NAME,
];
const DEFAULT_DNS = ["114.114.114.114#DIRECT", "tls://223.5.5.5#DIRECT", "https://1.12.12.12/dns-query#DIRECT"];
const PROXY_SERVER_DNS = ["114.114.114.114#DIRECT", "tls://223.5.5.5#DIRECT", "https://doh.pub/dns-query#DIRECT"];

// 托管模式下从机场 dns 原样继承的字段；其余字段一律由脚本决定，避免未知字段改变分流语义。
const PRESERVED_DNS_KEYS = [
  "listen", "prefer-h3", "respect-rules", "ipv6-timeout", "cache-max-size", "direct-nameserver-follow-policy",
];

const DEFAULT_HOSTS = {
  "doh.pub": ["1.12.12.12", "120.53.53.53"],
  "cloudflare-dns.com": ["1.1.1.1", "1.0.0.1"],
  "dns.google": ["8.8.8.8", "8.8.4.4"],
  "services.googleapis.cn": "services.googleapis.com",
};

const BILIBILI_PCDN_HOSTS = {
  "+.mcdn.bilivideo.com": ["0.0.0.0"],
  "+.mcdn.bilivideo.cn": ["0.0.0.0"],
  "+.edge.mountaintoys.cn": ["0.0.0.0"],
  "+.h2.smtcdns.net": ["0.0.0.0"],
};

// 用于从机场原配置中排除常见公共 DNS，剩余解析器只服务于节点域名。
const COMMON_DNS_MARKERS = [
  // 国内 IPv4
  "223.5.5.5", "223.6.6.6", "119.29.29.29", "1.12.12.12", "120.53.53.53",
  "114.114.114.114", "180.76.76.76", "1.2.4.8", "116.116.116.116", "101.226.4.6",
  "123.125.81.6", "180.184.1.1", "180.184.2.2",
  // 国内 IPv6
  "2400:3200::1", "2400:3200:baba::1", "2402:4e00::", "2400:da00::6666",
  // 国外 IPv4
  "1.1.1.1", "1.0.0.1", "8.8.8.8", "8.8.4.4", "9.9.9.9", "149.112.112.112",
  "208.67.222.222", "208.67.220.220", "94.140.14.14", "94.140.15.15",
  "76.76.2.0", "76.76.10.0", "185.228.168.9", "185.228.169.9", "77.88.8.8", "77.88.8.1",
  "156.154.70.1", "156.154.71.1",
  // 国外 IPv6
  "2606:4700:4700::1111", "2606:4700:4700::1001", "2001:4860:4860::8888", "2001:4860:4860::8844",
  "2620:fe::fe", "2620:fe::9", "2620:119:35::35", "2620:119:53::53",
  "2a10:50c0::bad1:ff", "2a10:50c0::bad2:ff", "2a10:50c0::ad1:ff", "2a10:50c0::ad2:ff",
  "2a0d:2a00:1::2", "2a0d:2a00:2::2", "2a02:6b8::feed:0ff", "2a02:6b8:0:1::feed:0ff",
  "2610:a1:1018::1", "2610:a1:1019::1",
  // 关键词
  "alidns", "doh.pub", "dot.pub", "dns.pub", "dnspod", "dns.baidu",
  "dns.google", "dns.cloudflare", "dns.apple", "cloudflare-dns", "quad9", "opendns", "nextdns",
  "adguard", "one.one.one.one",
];

// IP 类条目加前后边界，避免 1.1.1.1 命中 11.1.1.1、1.2.4.8 命中 10.1.2.4.8；关键词仍按子串匹配。
function dnsMarkerSource(marker) {
  const escaped = escapeRegex(marker);
  if (/^\d+(?:\.\d+){3}$/.test(marker)) return "(?:^|[^\\d.])" + escaped + "(?=$|[^\\d.])";
  if (marker.includes(":")) return "(?:^|[^0-9a-f:])" + escaped + "(?=$|[^0-9a-f:])";
  return escaped;
}

const COMMON_DNS_REGEX = new RegExp(COMMON_DNS_MARKERS.map(dnsMarkerSource).join("|"), "i");

// ===========================================================================
// 主流程
// ===========================================================================

function main(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("自用v3：输入必须是 mihomo 配置对象。");
  }
  if (SETTINGS.dnsMode !== "preserve" && SETTINGS.dnsMode !== "managed") {
    throw new Error("自用v3：dnsMode 只能是 preserve 或 managed。");
  }
  if (
    SETTINGS.enableLoadBalance &&
    !["round-robin", "consistent-hashing", "sticky-sessions"].includes(SETTINGS.loadBalanceStrategy)
  ) {
    throw new Error("自用v3：不支持的负载均衡策略：" + SETTINGS.loadBalanceStrategy);
  }
  if (config["proxy-providers"] && Object.keys(config["proxy-providers"]).length > 0) {
    throw new Error("自用v3：请先在 Sub-Store 中将 proxy-providers 展开为 proxies，再执行本脚本。");
  }

  const specs = SERVICE_SPECS.filter((spec) => !spec.enabledBy || SETTINGS[spec.enabledBy]);
  specs.forEach(validateSpec);

  const proxyNames = getProxyNames(config);
  const nodes = indexNodes(proxyNames);
  const groups = buildGroups(nodes, specs);
  const providers = buildRuleProviders(specs);
  const rules = buildRules(specs);
  const outlets = collectOutletNames(groups, proxyNames);

  const result = Object.assign({}, config, {
    proxies: sanitizeDialerProxies(config.proxies, outlets),
    "proxy-groups": groups,
    "rule-providers": providers,
    rules: rules,
    // China_Download 里的 PROCESS-NAME 规则依赖进程识别；机场配置为 off 或缺省时补为 strict。
    "find-process-mode": ensureProcessMode(config["find-process-mode"]),
  });
  // 机场 sub-rules 只能被已重建的 rules 引用，残留下来可能指向不存在的策略组，导致内核启动失败。
  delete result["sub-rules"];

  if (SETTINGS.dnsMode === "managed") {
    const managed = buildManagedDnsAndHosts(config);
    result.dns = managed.dns;
    result.hosts = managed.hosts;
  }

  validateReferences({
    groups: groups,
    outlets: outlets,
    providers: providers,
    rules: rules,
    dns: SETTINGS.dnsMode === "managed" ? result.dns : null,
    serviceNames: specs.map((spec) => spec.name),
  });

  return result;
}

function ensureProcessMode(value) {
  return value === "always" || value === "strict" ? value : "strict";
}

// 可作为出口的全部名称：节点、内置策略和策略组。
function collectOutletNames(groups, proxyNames) {
  return new Set(proxyNames.concat(BUILTIN_PROXY_NAMES, groups.map((group) => group.name)));
}

// 节点的 dialer-proxy 若指向已被重建掉的机场策略组，内核启动会报错；目标不存在时移除该字段，其余字段不动。
function sanitizeDialerProxies(proxies, outlets) {
  return proxies.map((proxy) => {
    if (typeof proxy["dialer-proxy"] !== "string" || outlets.has(proxy["dialer-proxy"])) return proxy;
    const copy = Object.assign({}, proxy);
    delete copy["dialer-proxy"];
    return copy;
  });
}

function getProxyNames(config) {
  if (!Array.isArray(config.proxies) || config.proxies.length === 0) {
    throw new Error("自用v3：没有读取到节点，请确认前一步已生成非空的 config.proxies。");
  }

  const reservedNames = new Set(
    BUILTIN_PROXY_NAMES.concat(
      [AUTO_GROUP_NAME, MANUAL_GROUP_NAME, LOAD_BALANCE_GROUP_NAME, LOW_RATE_GROUP_NAME, autoNameOf(LOW_RATE_GROUP_NAME)],
      COUNTRY_GROUP_NAMES,
      COUNTRY_GROUP_NAMES.map(autoNameOf),
      SERVICE_SPECS.map((spec) => spec.name)
    )
  );
  const seen = new Set();

  return config.proxies.map((proxy, index) => {
    const name = isPlainObject(proxy) ? proxy.name : undefined;
    if (typeof name !== "string" || !name.trim()) {
      throw new Error("自用v3：第 " + (index + 1) + " 个节点缺少有效名称。");
    }
    if (seen.has(name)) {
      throw new Error("自用v3：节点重名，请先在 Sub-Store 中去重或重命名：" + name);
    }
    if (reservedNames.has(name)) {
      throw new Error("自用v3：节点名与策略组或内置策略冲突，请重命名：" + name);
    }
    seen.add(name);
    return name;
  });
}

// ===========================================================================
// 节点索引：每个节点只做一次地区、倍率、游戏专线判定，后续分组全部是集合查询。
// ===========================================================================

function indexNodes(proxyNames) {
  return proxyNames.map((name) => ({
    name: name,
    game: GAME_PATTERN.test(name),
    lowRate: isLowRateNode(name),
    regions: new Set(REGION_CODES.filter((code) => matchesRegion(name, code))),
  }));
}

function namesIn(nodes, regions) {
  return nodes.filter((node) => regions.some((code) => node.regions.has(code))).map((node) => node.name);
}

// ===========================================================================
// 策略组
// ===========================================================================

const NODE_MODES = ["manual", "all", "none", "ai"];

function validateSpec(spec) {
  const fail = (message) => {
    throw new Error("自用v3：服务组 " + spec.name + " 配置错误：" + message);
  };
  if (typeof spec.name !== "string" || !spec.name) fail("缺少 name。");
  for (const name of spec.head || []) {
    if (!BUILTIN_PROXY_NAMES.includes(name)) fail("head 只能是内置出口：" + name);
  }
  if (spec.countries !== undefined && spec.countries !== false) {
    for (const code of spec.countries) {
      if (!COUNTRY_GROUP_NAMES.includes(code)) fail("countries 含未定义的地区组：" + code);
    }
  }
  if (spec.nodes !== undefined && !Array.isArray(spec.nodes) && !NODE_MODES.includes(spec.nodes)) {
    fail("nodes 取值无效：" + String(spec.nodes));
  }
  if (spec.locked) {
    if (!Array.isArray(spec.nodes) && spec.nodes !== "ai") fail("locked 组的 nodes 必须是地区数组或 \"ai\"。");
    if (spec.lowRate) fail("locked 组不能同时带低倍率。");
  }
  if (spec.nodes === "ai" && !AI_UNSUPPORTED_REGIONS[spec.name]) fail("nodes 为 ai 但 AI_UNSUPPORTED_REGIONS 里没有该组。");
  for (const code of Array.isArray(spec.nodes) ? spec.nodes : []) {
    if (!COUNTRY_TABLE[code]) fail("nodes 含识别表外的地区：" + code);
  }
  for (const source of (spec.rules && spec.rules.more) || []) {
    if (!source.key) fail("rules.more 的每一项都需要 key。");
  }
}

function buildGroups(nodes, specs) {
  const normal = nodes.filter((node) => !node.game);
  const normalNames = normal.map((node) => node.name);
  const gameNames = nodes.filter((node) => node.game).map((node) => node.name);

  const countryGroups = [];
  const validCountries = new Set();
  for (const country of COUNTRY_GROUP_NAMES) {
    const members = namesIn(normal, [country]);
    if (members.length > 0) {
      validCountries.add(country);
      countryGroups.push(...makeSelectableAutoGroups(country, members));
    }
  }

  const lowRateNames = SETTINGS.enableLowRateGroup ? normal.filter((node) => node.lowRate).map((node) => node.name) : [];
  const rateGroups = lowRateNames.length > 0 ? makeSelectableAutoGroups(LOW_RATE_GROUP_NAME, lowRateNames) : [];

  const autoGroup = makeUrlTest(AUTO_GROUP_NAME, normalNames, false);
  const manualGroups = SETTINGS.compactServiceGroups
    ? [{ name: MANUAL_GROUP_NAME, type: "select", proxies: withFallback(normalNames, "REJECT") }]
    : [];
  const hasLoadBalance = SETTINGS.enableLoadBalance && normalNames.length > 1;
  const loadBalanceGroups = hasLoadBalance ? [makeLoadBalance(normalNames)] : [];

  const context = {
    normal: normal,
    normalNames: normalNames,
    gameNames: gameNames,
    validCountries: validCountries,
    hasLoadBalance: hasLoadBalance,
    hasLowRate: rateGroups.length > 0,
    hasManual: manualGroups.length > 0,
  };
  const serviceGroups = specs.map((spec) => buildServiceGroup(spec, context));

  // 面板顺序：负载均衡 → AdBlock → Auto → Manual → 低倍率（含隐藏测速子组）→ 其余服务组 → 地区组。
  const adBlockGroups = serviceGroups.filter((group) => group.name === AD_BLOCK_GROUP_NAME);
  const otherServiceGroups = serviceGroups.filter((group) => group.name !== AD_BLOCK_GROUP_NAME);
  return loadBalanceGroups.concat(adBlockGroups, [autoGroup], manualGroups, rateGroups, otherServiceGroups, countryGroups);
}

// 成员顺序：DIRECT / head → Auto → 负载均衡 → 低倍率 → 地区组 → 节点 → 游戏专线；defaultSelected 最后提到首位。
function buildServiceGroup(spec, context) {
  const members = [];
  if (spec.direct) members.push("DIRECT");
  members.push(...(spec.head || []));
  if (spec.auto !== false) members.push(AUTO_GROUP_NAME);
  if (!spec.locked) {
    if (context.hasLoadBalance && spec.loadBalance !== false) members.push(LOAD_BALANCE_GROUP_NAME);
    if (context.hasLowRate && spec.lowRate) members.push(LOW_RATE_GROUP_NAME);
  }
  const countries = spec.countries === false ? [] : spec.countries || COUNTRY_GROUP_NAMES;
  members.push(...countries.filter((code) => context.validCountries.has(code)));
  members.push(...resolveNodes(spec, context));
  if (spec.gameNodes) members.push(...context.gameNames);

  const group = { name: spec.name, type: "select", proxies: withFallback(members, spec.emptyFallback || "REJECT") };
  if (spec.defaultSelected && group.proxies.includes(spec.defaultSelected)) {
    // 提到首位以兼容不支持 default-selected 的旧内核。
    group.proxies = [spec.defaultSelected].concat(group.proxies.filter((name) => name !== spec.defaultSelected));
    group["default-selected"] = spec.defaultSelected;
  }
  return group;
}

function resolveNodes(spec, context) {
  const mode = spec.nodes === undefined ? "manual" : spec.nodes;
  if (mode === "none") return [];
  if (mode === "all") return context.normalNames;
  if (mode === "manual") return context.hasManual && !spec.locked ? [MANUAL_GROUP_NAME] : context.normalNames;
  if (mode === "ai") return namesIn(context.normal, aiSupportedRegions(spec.name));
  return namesIn(context.normal, mode);
}

function withFallback(names, fallback) {
  const unique = Array.from(new Set(names));
  return unique.length > 0 ? unique : [fallback];
}

function makeUrlTest(name, proxies, hidden) {
  return Object.assign(
    {
      name: name,
      type: "url-test",
      url: SETTINGS.testUrl,
      interval: SETTINGS.urlTestInterval,
      timeout: SETTINGS.testTimeout,
      tolerance: SETTINGS.tolerance,
      lazy: true,
      "expected-status": 204,
      "max-failed-times": SETTINGS.maxFailedTimes,
      "empty-fallback": "REJECT",
    },
    hidden ? { hidden: true } : {},
    { proxies: withFallback(proxies, "REJECT") }
  );
}

// 手选组 + 隐藏的自动测速子组，子组排在手选组首位作为默认。
function makeSelectableAutoGroups(name, proxies) {
  const autoName = autoNameOf(name);
  return [
    makeUrlTest(autoName, proxies, true),
    { name: name, type: "select", proxies: withFallback([autoName].concat(proxies), "REJECT") },
  ];
}

function makeLoadBalance(proxies) {
  return {
    name: LOAD_BALANCE_GROUP_NAME,
    type: "load-balance",
    strategy: SETTINGS.loadBalanceStrategy,
    url: SETTINGS.testUrl,
    interval: SETTINGS.loadBalanceInterval,
    timeout: SETTINGS.testTimeout,
    lazy: true,
    "expected-status": 204,
    "max-failed-times": SETTINGS.maxFailedTimes,
    "empty-fallback": "REJECT",
    proxies: withFallback(proxies, "REJECT"),
  };
}

// ===========================================================================
// 规则集与规则：由规格里的 rules 生成，名字不可能与组名失配。
// ===========================================================================

// 把规格里的 rules 展开为统一的来源描述：{ provider, behavior, format, url, stage, group }。
// 同一组内顺序：主域名集 → 补充来源 → 个人列表 → IP 集；个人列表作为公共列表的补充排在其后。
function collectRuleSources(spec) {
  const rules = spec.rules || {};
  const sources = [];
  if (rules.domain !== undefined) sources.push(normalizeSource(spec.name, "domain", rules.domain));
  for (const more of rules.more || []) sources.push(normalizeSource(spec.name, more.kind || "domain", more));
  if (rules.list !== undefined) sources.push(normalizeSource(spec.name, "list", rules.list));
  if (rules.ip !== undefined) sources.push(normalizeSource(spec.name, "ip", rules.ip));
  return sources;
}

function normalizeSource(groupName, kind, value) {
  const preset = SOURCE_PRESETS[kind];
  if (!preset) throw new Error("自用v3：服务组 " + groupName + " 的规则来源类型无效：" + kind);
  const options = typeof value === "string"
    ? { file: value }
    : Array.isArray(value)
      ? { file: value[0], root: value[1] }
      : Object.assign({}, value);
  if (typeof options.file !== "string" || !options.file) {
    throw new Error("自用v3：服务组 " + groupName + " 的规则来源缺少 file。");
  }
  if (options.stage && !RULE_STAGES.includes(options.stage)) {
    throw new Error("自用v3：服务组 " + groupName + " 的规则阶段无效：" + options.stage);
  }
  return {
    provider: groupName + "_" + (options.key || preset.key),
    behavior: preset.behavior,
    format: preset.format,
    url: (options.root || preset.root) + options.file + preset.ext,
    stage: options.stage || preset.stage,
    group: groupName,
  };
}

function buildRuleProviders(specs) {
  const providers = {};
  const define = (name, source) => {
    if (providers[name]) throw new Error("自用v3：规则集名称重复：" + name);
    providers[name] = {
      type: "http",
      behavior: source.behavior,
      format: source.format,
      url: source.url,
      path: "./ruleset/" + name + (source.format === "mrs" ? ".mrs" : ".list"),
      interval: SETTINGS.ruleUpdateInterval,
    };
    if (SETTINGS.ruleProviderProxy) providers[name].proxy = SETTINGS.ruleProviderProxy;
  };

  for (const name of Object.keys(SYSTEM_PROVIDERS)) {
    const source = SYSTEM_PROVIDERS[name];
    if (source.managedOnly && SETTINGS.dnsMode !== "managed") continue;
    define(name, source);
  }
  for (const spec of specs) {
    for (const source of collectRuleSources(spec)) define(source.provider, source);
  }

  providers.China_Download = { type: "inline", behavior: "classical", payload: DOWNLOAD_RULES.slice() };
  return providers;
}

function buildRules(specs) {
  const byName = new Map(specs.map((spec) => [spec.name, spec]));
  const ordered = RULE_ORDER.map((name) => byName.get(name)).filter(Boolean);
  const staged = { prefix: [], block: [], extra: [], domain: [], ip: [] };

  // AdBlock 不在 RULE_ORDER 里，但它的 block 阶段规则要先于所有服务规则。
  const adBlock = byName.get(AD_BLOCK_GROUP_NAME);
  const emitters = adBlock ? [adBlock].concat(ordered) : ordered;

  for (const spec of emitters) {
    for (const body of (spec.rules && spec.rules.extra) || []) staged.extra.push(body + "," + spec.name);
    for (const source of collectRuleSources(spec)) {
      staged[source.stage].push(ruleSetRule(source.provider, spec.name, source.behavior === "ipcidr"));
    }
  }

  return PREFIX_RULES.concat(
    staged.prefix,
    SETTINGS.blockForeignQuic ? [FOREIGN_QUIC_RULE] : [],
    staged.block,
    staged.extra,
    staged.domain,
    staged.ip,
    ["MATCH," + OTHER_GROUP_NAME]
  );
}

// ===========================================================================
// 托管 DNS 与 hosts
// ===========================================================================

function buildManagedDnsAndHosts(config) {
  const originalDns = isPlainObject(config.dns) ? config.dns : {};
  const originalHosts = isPlainObject(config.hosts) ? config.hosts : {};
  const proxyDomains = collectProxyServerDomains(config.proxies);
  const privateDns = SETTINGS.preservePrivateDns ? collectPrivateDns(originalDns) : [];
  const proxyServerPolicy = SETTINGS.preservePrivateDns
    ? buildProxyServerPolicy(originalDns, proxyDomains, privateDns)
    : {};

  // 机场 fake-ip-filter 只保留能匹配节点域名的条目；geosite:、rule-set: 等其他条目全部丢弃。
  const proxyFakeIpFilter = toArray(originalDns["fake-ip-filter"])
    .filter((value) => typeof value === "string" && value.length > 0)
    .filter((value) => matchDomainPattern(value, proxyDomains));

  const dns = {};
  for (const key of PRESERVED_DNS_KEYS) {
    if (originalDns[key] !== undefined) dns[key] = originalDns[key];
  }
  Object.assign(dns, {
    enable: true,
    ipv6: originalDns.ipv6 === true,
    "use-hosts": true,
    "use-system-hosts": true,
    "cache-algorithm": "arc",
    "enhanced-mode": "fake-ip",
    "fake-ip-range": originalDns["fake-ip-range"] || "198.18.0.1/15",
    "fake-ip-range6": originalDns["fake-ip-range6"] || "2001:2::1/48",
    // 过滤列表按黑名单语义生成，固定为 blacklist。
    "fake-ip-filter-mode": "blacklist",
    "fake-ip-filter": uniqueStrings(["rule-set:Private_Domain", "rule-set:FakeIP_Filter", "rule-set:China_Domain"].concat(proxyFakeIpFilter)),
    "default-nameserver": DEFAULT_DNS.slice(),
    "proxy-server-nameserver": PROXY_SERVER_DNS.slice(),
    nameserver: FOREIGN_DNS.slice(),
    // 机场 nameserver-policy 不再合并；与节点域名相关的条目已收入 proxy-server-nameserver-policy。
    "nameserver-policy": { "rule-set:China_Domain": CHINA_DNS.slice() },
    "direct-nameserver": CHINA_DNS.slice(),
  });
  if (Object.keys(proxyServerPolicy).length > 0) dns["proxy-server-nameserver-policy"] = proxyServerPolicy;

  const hosts = {};
  if (SETTINGS.addDefaultHosts) Object.assign(hosts, DEFAULT_HOSTS);
  if (SETTINGS.blockBilibiliPcdn) Object.assign(hosts, BILIBILI_PCDN_HOSTS);
  // 用户 hosts 最后合并，允许覆盖脚本默认值。
  Object.assign(hosts, originalHosts);

  return { dns: dns, hosts: hosts };
}

function collectProxyServerDomains(proxies) {
  const domains = new Set();
  for (const proxy of proxies) {
    if (typeof proxy.server !== "string") continue;
    const server = proxy.server.trim().replace(/\.$/, "").toLowerCase();
    if (server && !isIpAddress(server)) domains.add(server);
  }
  return domains;
}

function collectPrivateDns(originalDns) {
  const candidates = toArray(originalDns.nameserver).concat(toArray(originalDns["proxy-server-nameserver"]));
  const listen = typeof originalDns.listen === "string" ? originalDns.listen : "";
  return uniqueStrings(
    candidates
      .filter((value) => typeof value === "string")
      .filter((value) => !isSelfDnsResolver(value, listen))
      .map(stripDnsSuffix)
      .filter((value) => value && !isCommonDns(value))
  );
}

function buildProxyServerPolicy(originalDns, proxyDomains, privateDns) {
  const policy = {};
  const originalPolicy = Object.assign(
    {},
    originalDns["nameserver-policy"] || {},
    originalDns["proxy-server-nameserver-policy"] || {}
  );

  for (const pattern of Object.keys(originalPolicy)) {
    if (!matchDomainPattern(pattern, proxyDomains)) continue;
    const value = normalizeDnsPolicyValue(originalPolicy[pattern]);
    if (value !== null) policy[pattern] = value;
  }

  if (privateDns.length > 0) {
    for (const domain of proxyDomains) {
      const covered = Object.keys(policy).some((pattern) => matchDomainPattern(pattern, domain));
      if (!covered) policy[domain] = privateDns.slice();
    }
  }

  return simplifyDomainPolicy(policy);
}

// com.cn、co.jp 这类二级公共后缀多取一级，避免折叠出 +.com.cn。
const SECOND_LEVEL_SUFFIX = /^(?:com|net|org|gov|edu|co|ne|or|ac|me|info|biz|idv)\.[a-z]{2}$/;

// 相同 DNS 的精确节点域名折叠到组内最长公共后缀的 +. 形式；通配、逗号多域名键和已存在的 +. 键原样保留。
function simplifyDomainPolicy(policy) {
  const result = {};
  const groups = new Map();

  for (const domain of Object.keys(policy)) {
    const labels = domain.split(".");
    const isWildcard =
      domain.startsWith("+.") || domain.startsWith(".") || domain.includes("*") || domain.includes(",");
    const depth = !isWildcard && labels.length >= 3 && SECOND_LEVEL_SUFFIX.test(labels.slice(-2).join(".")) ? 3 : 2;
    if (isWildcard || labels.length <= depth) {
      result[domain] = policy[domain];
      continue;
    }
    const suffix = labels.slice(-depth).join(".");
    if (!groups.has(suffix)) groups.set(suffix, []);
    groups.get(suffix).push(domain);
  }

  for (const domains of groups.values()) {
    const folded = "+." + commonDomainSuffix(domains);
    const key = dnsPolicyKey(policy[domains[0]]);
    const mergeable =
      domains.length >= 2 &&
      !Object.prototype.hasOwnProperty.call(result, folded) &&
      domains.every((domain) => dnsPolicyKey(policy[domain]) === key);
    if (mergeable) {
      result[folded] = policy[domains[0]];
    } else {
      for (const domain of domains) result[domain] = policy[domain];
    }
  }

  return result;
}

function commonDomainSuffix(domains) {
  const reversed = domains.map((domain) => domain.split(".").reverse());
  const shared = [];
  for (let index = 0; index < reversed[0].length; index += 1) {
    const label = reversed[0][index];
    if (!reversed.every((labels) => labels[index] === label)) break;
    shared.push(label);
  }
  return shared.reverse().join(".");
}

function dnsPolicyKey(value) {
  return JSON.stringify(Array.isArray(value) ? value.slice().sort() : value);
}

function normalizeDnsPolicyValue(value) {
  if (typeof value === "string") return stripDnsSuffix(value) || null;
  if (Array.isArray(value)) {
    const normalized = uniqueStrings(value.filter((item) => typeof item === "string").map(stripDnsSuffix).filter(Boolean));
    return normalized.length > 0 ? normalized : null;
  }
  return null;
}

function matchDomainPattern(pattern, domains) {
  if (typeof pattern !== "string") return false;
  const normalizedPattern = pattern.toLowerCase();
  // mihomo 允许用逗号在一个键里写多个域名，任一匹配即算命中。
  if (normalizedPattern.includes(",")) {
    return normalizedPattern.split(",").map((part) => part.trim()).some((part) => part && matchDomainPattern(part, domains));
  }
  const domainList = typeof domains === "string" ? [domains.toLowerCase()] : Array.from(domains);

  if (normalizedPattern.startsWith("+.")) {
    const suffix = normalizedPattern.slice(2);
    return domainList.some((domain) => domain === suffix || domain.endsWith("." + suffix));
  }
  if (normalizedPattern.startsWith(".")) {
    const suffix = normalizedPattern.slice(1);
    return domainList.some((domain) => domain !== suffix && domain.endsWith("." + suffix));
  }
  if (normalizedPattern.includes("*")) {
    const patternParts = normalizedPattern.split(".");
    return domainList.some((domain) => {
      const domainParts = domain.split(".");
      return patternParts.length === domainParts.length &&
        patternParts.every((part, index) => part === "*" || part === domainParts[index]);
    });
  }
  return domainList.some((domain) => domain === normalizedPattern);
}

// 剥离 DNS 地址的 #策略组 后缀；后缀含 direct / 直连 时统一改为 #DIRECT。
function stripDnsSuffix(value) {
  const text = String(value).trim();
  const hashIndex = text.indexOf("#");
  if (hashIndex === -1) return text;
  const address = text.slice(0, hashIndex).trim();
  const suffix = text.slice(hashIndex + 1).toLowerCase();
  return suffix.includes("direct") || suffix.includes("直连") ? address + "#DIRECT" : address;
}

function isCommonDns(value) {
  const normalized = String(value).trim().toLowerCase();
  return normalized === "system" || normalized === "system://" ||
    normalized.startsWith("dhcp://") || normalized.startsWith("rcode://") ||
    COMMON_DNS_REGEX.test(normalized);
}

function isSelfDnsResolver(value, listen) {
  if (!listen) return false;
  const resolver = String(value).toLowerCase();
  if (resolver.includes(String(listen).toLowerCase())) return true;
  return resolver.includes("127.0.0.1") || resolver.includes("localhost") || resolver.includes("[::1]");
}

function isIpAddress(value) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value) || value.includes(":");
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null ? [] : [value];
}

function uniqueStrings(values) {
  return Array.from(new Set(values));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// ===========================================================================
// 生成期校验：任何名字失配都在这里终止，不会输出带病配置。
// ===========================================================================

function validateReferences(input) {
  const groups = input.groups;
  const outlets = input.outlets;
  const providers = input.providers;
  const rules = input.rules;

  const groupsByName = new Map(groups.map((group) => [group.name, group]));
  if (groupsByName.size !== groups.length) throw new Error("自用v3：策略组名称重复。");

  for (const group of groups) {
    for (const name of group.proxies) {
      if (!outlets.has(name)) {
        throw new Error("自用v3：策略组 " + group.name + " 引用了不存在的节点或分组：" + name);
      }
    }
  }

  const visited = new Set();
  const visiting = new Set();
  const visit = (name) => {
    if (visiting.has(name)) throw new Error("自用v3：策略组存在循环引用：" + name);
    if (visited.has(name)) return;
    visiting.add(name);
    for (const member of groupsByName.get(name).proxies) {
      if (groupsByName.has(member)) visit(member);
    }
    visiting.delete(name);
    visited.add(name);
  };
  for (const group of groups) visit(group.name);

  for (const name of Object.keys(providers)) {
    const proxy = providers[name].proxy;
    if (proxy && !outlets.has(proxy)) throw new Error("自用v3：规则集 " + name + " 的下载代理不存在：" + proxy);
  }

  const referencedProviders = new Set();
  const ruleSetPattern = /RULE-SET,([^,)]+)/g;
  const ruleTargets = new Set();
  for (const rule of rules) {
    for (const match of rule.matchAll(ruleSetPattern)) {
      if (!Object.prototype.hasOwnProperty.call(providers, match[1])) {
        throw new Error("自用v3：规则引用了不存在的规则集：" + match[1]);
      }
      referencedProviders.add(match[1]);
    }
    const target = ruleTarget(rule);
    if (!outlets.has(target)) throw new Error("自用v3：规则引用了不存在的出口：" + target);
    ruleTargets.add(target);
  }

  // 每个服务组都必须被至少一条规则指向，否则它只是面板上的摆设。
  for (const name of input.serviceNames) {
    if (!ruleTargets.has(name)) throw new Error("自用v3：服务组 " + name + " 没有任何规则指向。");
  }

  if (input.dns) {
    for (const value of collectDnsStrings(input.dns)) {
      const match = /^rule-set:(.+)$/.exec(value);
      if (match) {
        if (!Object.prototype.hasOwnProperty.call(providers, match[1])) {
          throw new Error("自用v3：DNS 引用了不存在的规则集：" + match[1]);
        }
        referencedProviders.add(match[1]);
      }
      const group = dnsPolicyGroup(value);
      if (group && !outlets.has(group)) throw new Error("自用v3：DNS 引用了不存在的策略组：" + group);
    }
  }

  // 没有任何引用的规则集只会浪费启动时间，且和机场残留规则集一样可能拖垮启动。
  for (const name of Object.keys(providers)) {
    if (!referencedProviders.has(name)) throw new Error("自用v3：规则集 " + name + " 没有被任何规则或 DNS 引用。");
  }
}

// MATCH 只有出口；逻辑规则的出口在末尾；其余规则的出口固定在第三段，后面可能跟 no-resolve 等选项。
function ruleTarget(rule) {
  const parts = rule.split(",");
  if (parts[0] === "MATCH") return parts[1];
  if (parts[0] === "AND" || parts[0] === "OR" || parts[0] === "NOT") return parts[parts.length - 1];
  return parts[2];
}

// 收集 dns 配置里所有可能带 #策略组 或 rule-set: 前缀的字符串：服务器列表、fake-ip-filter、各 policy 的键和值。
function collectDnsStrings(dns) {
  const values = [];
  for (const key of ["nameserver", "default-nameserver", "proxy-server-nameserver", "direct-nameserver", "fallback", "fake-ip-filter"]) {
    values.push(...toArray(dns[key]));
  }
  for (const key of ["nameserver-policy", "proxy-server-nameserver-policy"]) {
    const policy = isPlainObject(dns[key]) ? dns[key] : {};
    for (const pattern of Object.keys(policy)) {
      values.push(pattern);
      values.push(...toArray(policy[pattern]));
    }
  }
  return values.filter((value) => typeof value === "string");
}

// "https://dns.google/dns-query#Worldwide&h3=true" → "Worldwide"；没有 # 时返回 null。
function dnsPolicyGroup(value) {
  const hashIndex = value.indexOf("#");
  if (hashIndex === -1) return null;
  const group = value.slice(hashIndex + 1).split("&")[0].trim();
  return group || null;
}
