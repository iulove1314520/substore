/**
 * 自用 v1 — Sub-Store 的 mihomo 配置覆写脚本。
 * 在 mihomo 配置文件的脚本操作中使用 main(config)。
 *
 * 输入：已经展开到 config.proxies 的节点；不读取动态 proxy-providers。
 * 保留节点原有字段（包括 skip-cert-verify）、DNS、TUN 等客户端设置。
 * 策略组和规则由本脚本统一生成；保留原服务名称和默认选项顺序。
 *
 * v1 修正：
 * - 统一地区识别，避免“广 / 新 / 美”误收节点。
 * - Auto、地区组、Other 排除游戏节点；Game 等仍可手选游戏节点。
 * - China_3 / China_4 使用 classical；China_5 内置兼容的下载规则。
 * - 局域网规则提前，Cloudflare 放在具体应用之后。
 * - 测速使用 HTTPS + 204 校验，失败触发阈值为 5。
 * - 空地区组清理、重名和引用检查；可选精简服务列表。
 *
 * 官方字段参考：
 * https://wiki.metacubex.one/config/proxy-groups/
 * https://wiki.metacubex.one/config/rule-providers/
 */

const SETTINGS = {
  // 默认保留各服务独立手选节点的能力。
  // 改为 true 后，普通服务通过新增的 Manual 组共用一份手选列表。
  // 选择 Manual 的服务共享其当前节点；有地区限制的服务及游戏组仍独立展开。
  compactServiceGroups: false,
  testUrl: "https://www.gstatic.com/generate_204",
  autoInterval: 300,
  countryInterval: 300,
  testTimeout: 5000,
  tolerance: 50,
  maxFailedTimes: 5,
  ruleUpdateInterval: 86400,
};

const COUNTRY_GROUP_NAMES = ["HK", "TW", "JP", "SG", "US"];
const GAME_PATTERN = /游戏|game/i;
const BUILTIN_PROXY_NAMES = ["DIRECT", "REJECT", "REJECT-DROP", "PASS", "COMPATIBLE", "GLOBAL"];

// 按节点名称识别地区，不代表实际出口检测。
// 英文代码使用字母边界，兼容 US01 等编号，避免 AUS / Austria 等误匹配。
// 中文使用完整地区名称；单字港、台、日仅匹配独立标签。
const REGION_PATTERNS = {
  "HK": "🇭🇰|香港|Hong\\s*Kong|(?:^|[^a-z])HKG?(?=[^a-z]|$)|(?:^|[\\s/|_-])港(?=$|[\\s/|_-])",
  "TW": "🇹🇼|台[湾灣]|臺灣|Taiwan|台北|臺北|(?:^|[^a-z])TWN?(?=[^a-z]|$)|(?:^|[\\s/|_-])台(?=$|[\\s/|_-])",
  "JP": "🇯🇵|日本|Japan|东京|東京|大阪|(?:^|[^a-z])JPN?(?=[^a-z]|$)|(?:^|[\\s/|_-])日(?=$|[\\s/|_-])",
  "SG": "🇸🇬|新加坡|Singapore|狮城|獅城|(?:^|[^a-z])SGP?(?=[^a-z]|$)",
  "US": "🇺🇸|🇺🇲|美国|美國|United\\s*States|波特兰|达拉斯|俄勒冈|凤凰城|费利蒙|硅谷|拉斯维加斯|洛杉矶|圣何塞|圣克拉拉|西雅图|芝加哥|休斯顿|(?:^|[^a-z])U\\.?S\\.?A?\\.?(?=[^a-z]|$)",
  "UK": "🇬🇧|英国|英國|United\\s*Kingdom|Britain|伦敦|倫敦|(?:^|[^a-z])(?:UK|GB|GBR)(?=[^a-z]|$)",
  "FR": "🇫🇷|法国|法國|France|巴黎|(?:^|[^a-z])FRA?(?=[^a-z]|$)",
  "DE": "🇩🇪|德国|德國|Germany|法兰克福|法蘭克福|(?:^|[^a-z])DEU?(?=[^a-z]|$)",
  "MO": "🇲🇴|澳门|澳門|Macau|Macao|(?:^|[^a-z])(?:MO|MAC)(?=[^a-z]|$)"
};

const REGION_MATCHERS = {};
for (const region of Object.keys(REGION_PATTERNS)) {
  REGION_MATCHERS[region] = new RegExp(REGION_PATTERNS[region], "i");
}

// 首项决定无历史选择时的默认出口，保留原来的 DIRECT / REJECT / Auto 选择。
// noNodes：仅保留固定策略；keepNodes：精简模式下仍保留独立的完整节点列表。
const SERVICE_SPECS = [
  {"name":"1Password","proxies":["DIRECT","Auto","HK","TW","JP","SG","US"]},
  {"name":"OpenAI","proxies":["REJECT","US","JP","SG"],"regions":["JP","SG","US","UK","FR","DE"]},
  {"name":"Gemini","proxies":["REJECT","HK","TW","JP","SG","US"]},
  {"name":"Claude","proxies":["REJECT","US"],"regions":["US"]},
  {"name":"Perplexity","proxies":["Auto","HK","TW","JP","SG","US"]},
  {"name":"EMBY","proxies":["DIRECT","Auto","HK","TW","JP","SG","US"]},
  {"name":"YouTube","proxies":["Auto","HK","TW","JP","SG","US"]},
  {"name":"Google","proxies":["Auto","HK","TW","JP","SG","US"]},
  {"name":"Github","proxies":["Auto","HK","TW","JP","SG","US"]},
  {"name":"Cloudflare","proxies":["DIRECT","Auto","HK","TW","JP","SG","US"]},
  {"name":"Paypal","proxies":["DIRECT","Auto","HK","TW","JP","SG","US"]},
  {"name":"Telegram","proxies":["DIRECT","Auto","HK","TW","JP","SG","US"]},
  {"name":"Discord","proxies":["Auto","HK","TW","JP","SG","US"]},
  {"name":"Apple","proxies":["DIRECT","Auto","HK","TW","JP","SG","US"]},
  {"name":"OneDrive","proxies":["DIRECT","Auto","HK","TW","JP","SG","US"]},
  {"name":"Microsoft","proxies":["DIRECT","Auto","HK","TW","JP","SG","US"]},
  {"name":"X","proxies":["Auto","HK","TW","JP","SG","US"]},
  {"name":"Instagram","proxies":["Auto","HK","TW","JP","SG","US"]},
  {"name":"Facebook","proxies":["Auto","HK","TW","JP","SG","US"]},
  {"name":"Xiaohongsu","proxies":["DIRECT","HK","TW","JP","SG","US"]},
  {"name":"DouYin","proxies":["DIRECT","HK","TW","JP","SG","US"]},
  {"name":"Spotify","proxies":["Auto","HK","TW","JP","SG","US"]},
  {"name":"Netflix","proxies":["Auto","HK","TW","JP","SG","US"]},
  {"name":"Disney","proxies":["Auto","HK","TW","JP","SG","US"]},
  {"name":"TikTok","proxies":["REJECT","HK","TW","JP","SG","US"]},
  {"name":"Bahamut","proxies":["TW"],"regions":["TW"]},
  {"name":"Bilibili","proxies":["DIRECT","HK","TW","SG"],"regions":["HK","TW","SG","MO"]},
  {"name":"Steam","proxies":["DIRECT","Auto","HK","TW","JP","SG","US"],"keepNodes":true},
  {"name":"EPIC","proxies":["DIRECT","Auto","HK","TW","JP","SG","US"],"keepNodes":true},
  {"name":"Game","proxies":["DIRECT","Auto","HK","TW","JP","SG","US"],"keepNodes":true},
  {"name":"Worldwide","proxies":["Auto","HK","TW","JP","SG","US"]},
  {"name":"Other","proxies":["DIRECT","Auto","HK","TW","JP","SG","US"],"excludeGame":true},
  {"name":"China","proxies":["DIRECT"],"noNodes":true},
];

// 保留原规则源和缓存名称；China 对应局域网列表，China_2～China_6 对应国内补充规则。
// 这些 URL 都是带 DOMAIN-SUFFIX / IP-CIDR 等类型的 classical 文本列表。
const RULE_PROVIDER_URLS = {
  "1Password": "https://raw.githubusercontent.com/iulove1314520/iulove/refs/heads/main/1password.list",
  "OpenAI": "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/OpenAI/OpenAI.list",
  "Gemini": "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/BardAI/BardAI.list",
  "Claude": "https://raw.githubusercontent.com/iulove1314520/ios_rule_script/refs/heads/master/rule/Clash/Claude/Claude.list",
  "Perplexity": "https://raw.githubusercontent.com/iulove1314520/iulove/refs/heads/main/perplexity.list",
  "EMBY": "https://raw.githubusercontent.com/iulove1314520/iulove/main/emby.list",
  "YouTube": "https://raw.githubusercontent.com/iulove1314520/ios_rule_script/refs/heads/master/rule/Clash/YouTube/YouTube.list",
  "Google": "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Google/Google.list",
  "Github": "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/GitHub/GitHub.list",
  "Cloudflare": "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Cloudflare/Cloudflare.list",
  "Paypal": "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/PayPal/PayPal.list",
  "Telegram": "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Telegram/Telegram.list",
  "Discord": "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/refs/heads/master/rule/Clash/Discord/Discord.list",
  "Apple": "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Apple/Apple.list",
  "OneDrive": "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/OneDrive/OneDrive.list",
  "Microsoft": "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Microsoft/Microsoft.list",
  "X": "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Twitter/Twitter.list",
  "Instagram": "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Instagram/Instagram.list",
  "Facebook": "https://raw.githubusercontent.com/iulove1314520/ios_rule_script/refs/heads/master/rule/Clash/Facebook/Facebook.list",
  "Xiaohongsu": "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/refs/heads/master/rule/Clash/XiaoHongShu/XiaoHongShu.list",
  "DouYin": "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/refs/heads/master/rule/Clash/DouYin/DouYin.list",
  "Spotify": "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Spotify/Spotify.list",
  "Bilibili": "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Ruleset/Bilibili.list",
  "Disney": "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Ruleset/DisneyPlus.list",
  "Netflix": "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Ruleset/Netflix.list",
  "TikTok": "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Ruleset/TikTok.list",
  "Bahamut": "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Ruleset/Bahamut.list",
  "EPIC": "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Ruleset/Epic.list",
  "Steam": "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Ruleset/Steam.list",
  "Game": "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/Game/Game.list",
  "Worldwide": "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/refs/heads/master/rule/Clash/Global/Global.list",
  "Worldwide_2": "https://raw.githubusercontent.com/iulove1314520/iulove/main/Global.list",
  "China": "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/LocalAreaNetwork.list",
  "China_2": "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/China/China.list",
  "China_3": "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/ChinaDomain.list",
  "China_4": "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/ChinaCompanyIp.list",
  "China_6": "https://raw.githubusercontent.com/iulove1314520/iulove/refs/heads/main/china.list"
};

// ACL4SSR Download.list 的兼容条目快照（2026-09-10）。
// 已去掉 mihomo 不支持的 7 条 URL-REGEX；此内置列表需手动维护。
// 来源：https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Download.list
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
  "PROCESS-NAME,baidunetdisk.exe"
];

// China（局域网）优先；具体应用优先于 Cloudflare 及全局列表。
// 国内网站和下载规则保持原有的相对优先级，末尾仍由 Other 兜底。
const RULES = [
  "RULE-SET,China,China",
  "RULE-SET,1Password,1Password",
  "RULE-SET,OpenAI,OpenAI",
  "RULE-SET,Gemini,Gemini",
  "RULE-SET,Claude,Claude",
  "RULE-SET,Perplexity,Perplexity",
  "RULE-SET,EMBY,EMBY",
  "RULE-SET,YouTube,YouTube",
  "RULE-SET,Google,Google",
  "RULE-SET,Github,Github",
  "RULE-SET,Paypal,Paypal",
  "RULE-SET,Telegram,Telegram",
  "RULE-SET,Discord,Discord",
  "RULE-SET,Apple,Apple",
  "RULE-SET,OneDrive,OneDrive",
  "RULE-SET,Microsoft,Microsoft",
  "RULE-SET,X,X",
  "RULE-SET,Instagram,Instagram",
  "RULE-SET,Facebook,Facebook",
  "RULE-SET,Xiaohongsu,Xiaohongsu",
  "RULE-SET,DouYin,DouYin",
  "RULE-SET,Spotify,Spotify",
  "RULE-SET,Bilibili,Bilibili",
  "RULE-SET,Disney,Disney",
  "RULE-SET,Netflix,Netflix",
  "RULE-SET,TikTok,TikTok",
  "RULE-SET,Bahamut,Bahamut",
  "RULE-SET,EPIC,EPIC",
  "RULE-SET,Steam,Steam",
  "RULE-SET,Game,Game",
  "RULE-SET,Cloudflare,Cloudflare",
  "RULE-SET,Worldwide,Worldwide",
  "RULE-SET,Worldwide_2,Worldwide",
  "RULE-SET,China_2,China",
  "RULE-SET,China_3,China",
  "RULE-SET,China_4,China",
  "RULE-SET,China_5,China",
  "RULE-SET,China_6,China",
  "GEOIP,CN,China",
  "MATCH,Other"
];

function main(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("自用v1：输入必须是 mihomo 配置对象。");
  }
  if (config["proxy-providers"] && Object.keys(config["proxy-providers"]).length > 0) {
    throw new Error("自用v1：请先在 Sub-Store 中将 proxy-providers 展开为 proxies，再执行本脚本。");
  }

  const proxyNames = getProxyNames(config);
  const groups = buildGroups(proxyNames);
  const providers = Object.assign({}, config["rule-providers"] || {}, buildRuleProviders());
  const rules = RULES.slice();
  validateReferences(groups, proxyNames, providers, rules);

  // 不改写 config.proxies 或节点字段，也不原地修改输入配置。
  return Object.assign({}, config, {
    "proxy-groups": groups,
    "rule-providers": providers,
    rules: rules,
  });
}

function getProxyNames(config) {
  if (!Array.isArray(config.proxies) || config.proxies.length === 0) {
    throw new Error("自用v1：没有读取到节点，请确认前一步已生成非空的 config.proxies。");
  }

  const reservedNames = new Set(
    BUILTIN_PROXY_NAMES.concat(["Auto"], COUNTRY_GROUP_NAMES, SERVICE_SPECS.map((s) => s.name))
  );
  if (SETTINGS.compactServiceGroups) reservedNames.add("Manual");
  const seen = new Set();

  return config.proxies.map((proxy, index) => {
    const name = typeof proxy === "string" ? proxy : proxy && proxy.name;
    if (typeof name !== "string" || !name.trim()) {
      throw new Error("自用v1：第 " + (index + 1) + " 个节点缺少有效名称。");
    }
    if (seen.has(name)) {
      throw new Error("自用v1：节点重名，请先在 Sub-Store 中去重或重命名：" + name);
    }
    if (reservedNames.has(name)) {
      throw new Error("自用v1：节点名与策略组或内置策略冲突，请重命名：" + name);
    }
    seen.add(name);
    return name;
  });
}

function matchesRegions(name, regions) {
  return regions.some((region) => {
    if (!REGION_MATCHERS[region]) {
      throw new Error("自用v1：未定义的地区：" + region);
    }
    return REGION_MATCHERS[region].test(name);
  });
}

function withFallback(names) {
  const unique = Array.from(new Set(names));
  return unique.length > 0 ? unique : ["REJECT"];
}

function makeUrlTest(name, proxies, interval) {
  return {
    name: name,
    type: "url-test",
    url: SETTINGS.testUrl,
    interval: interval,
    timeout: SETTINGS.testTimeout,
    tolerance: SETTINGS.tolerance,
    lazy: true,
    "expected-status": 204,
    "max-failed-times": SETTINGS.maxFailedTimes,
    proxies: withFallback(proxies),
  };
}

function buildGroups(proxyNames) {
  const normalNodes = proxyNames.filter((name) => !GAME_PATTERN.test(name));
  const countryGroups = [];
  const validCountries = new Set();
  for (const country of COUNTRY_GROUP_NAMES) {
    const members = normalNodes.filter((name) => matchesRegions(name, [country]));
    if (members.length > 0) {
      validCountries.add(country);
      countryGroups.push(makeUrlTest(country, members, SETTINGS.countryInterval));
    }
  }

  const groups = [makeUrlTest("Auto", normalNodes, SETTINGS.autoInterval)];
  for (const spec of SERVICE_SPECS) {
    const members = spec.proxies.filter(
      (name) => !COUNTRY_GROUP_NAMES.includes(name) || validCountries.has(name)
    );
    if (!spec.noNodes) {
      const candidates = spec.excludeGame || spec.regions ? normalNodes : proxyNames;
      if (SETTINGS.compactServiceGroups && !spec.regions && !spec.keepNodes) {
        members.push("Manual");
      } else {
        const matched = spec.regions
          ? candidates.filter((name) => matchesRegions(name, spec.regions))
          : candidates;
        members.push(...matched);
      }
    }
    groups.push({ name: spec.name, type: "select", proxies: withFallback(members) });
  }

  if (SETTINGS.compactServiceGroups) {
    groups.push({ name: "Manual", type: "select", proxies: withFallback(normalNodes) });
  }
  return groups.concat(countryGroups);
}

function buildRuleProviders() {
  const providers = {};
  for (const name of Object.keys(RULE_PROVIDER_URLS)) {
    providers[name] = {
      type: "http",
      behavior: "classical",
      format: "text",
      url: RULE_PROVIDER_URLS[name],
      path: "./ruleset/" + name + ".list",
      interval: SETTINGS.ruleUpdateInterval,
    };
  }
  providers.China_5 = {
    type: "inline",
    behavior: "classical",
    payload: DOWNLOAD_RULES.slice(),
  };
  return providers;
}

function validateReferences(groups, proxyNames, providers, rules) {
  const groupsByName = new Map(groups.map((group) => [group.name, group]));
  if (groupsByName.size !== groups.length) {
    throw new Error("自用v1：策略组名称重复。");
  }
  const validNames = new Set(proxyNames.concat(BUILTIN_PROXY_NAMES, groups.map((g) => g.name)));
  for (const group of groups) {
    for (const name of group.proxies) {
      if (!validNames.has(name)) {
        throw new Error("自用v1：策略组 " + group.name + " 引用了不存在的节点或分组：" + name);
      }
    }
  }

  const visited = new Set();
  const visiting = new Set();
  function visit(name) {
    if (visiting.has(name)) throw new Error("自用v1：策略组存在循环引用：" + name);
    if (visited.has(name)) return;
    visiting.add(name);
    for (const member of groupsByName.get(name).proxies) {
      if (groupsByName.has(member)) visit(member);
    }
    visiting.delete(name);
    visited.add(name);
  }
  for (const group of groups) visit(group.name);

  for (const rule of rules) {
    const parts = rule.split(",");
    const target = parts[0] === "MATCH" ? parts[1] : parts[2];
    if (parts[0] === "RULE-SET" && !Object.prototype.hasOwnProperty.call(providers, parts[1])) {
      throw new Error("自用v1：规则引用了不存在的规则集：" + parts[1]);
    }
    if (!validNames.has(target)) {
      throw new Error("自用v1：规则引用了不存在的出口：" + target);
    }
  }
}

