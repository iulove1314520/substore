const GROUP_SPECS = [
  {
    name: "Auto",
    type: "url-test",
    "include-all": true,
    filter: ".*",
    url: "http://www.gstatic.com/generate_204",
    interval: 300,
    tolerance: 50,
  },
  {
    name: "1Password",
    type: "select",
    "include-all": true,
    filter: ".*",
    proxies: ["DIRECT", "Auto", "HK", "TW", "JP", "SG", "US"],
  },
  {
    name: "OpenAI",
    type: "select",
    "include-all": true,
    filter:
      "(日(?!利亚)|日本|Japan|jp|JP|新加坡|SG|新|Singapore|美|美国|US|United States|英国|英|UK|United Kingdom|France|法国|Germany|德国|广)",
    proxies: ["REJECT", "US", "JP", "SG"],
  },
  {
    name: "Gemini",
    type: "select",
    "include-all": true,
    filter: ".*",
    proxies: ["REJECT", "HK", "TW", "JP", "SG", "US"],
  },
  {
    name: "Claude",
    type: "select",
    "include-all": true,
    filter:
      "(美|波特兰|达拉斯|俄勒冈|凤凰城|费利蒙|硅谷|拉斯维加斯|洛杉矶|圣何塞|圣克拉拉|西雅图|芝加哥|US|United States)",
    proxies: ["REJECT", "US"],
  },
  {
    name: "Perplexity",
    type: "select",
    "include-all": true,
    filter: ".*",
    proxies: ["Auto", "HK", "TW", "JP", "SG", "US"],
  },
  {
    name: "EMBY",
    type: "select",
    "include-all": true,
    filter: ".*",
    proxies: ["DIRECT", "Auto", "HK", "TW", "JP", "SG", "US"],
  },
  {
    name: "YouTube",
    type: "select",
    "include-all": true,
    filter: ".*",
    proxies: ["Auto", "HK", "TW", "JP", "SG", "US"],
  },
  {
    name: "Google",
    type: "select",
    "include-all": true,
    filter: ".*",
    proxies: ["Auto", "HK", "TW", "JP", "SG", "US"],
  },
  {
    name: "Github",
    type: "select",
    "include-all": true,
    filter: ".*",
    proxies: ["Auto", "HK", "TW", "JP", "SG", "US"],
  },
  {
    name: "Cloudflare",
    type: "select",
    "include-all": true,
    filter: ".*",
    proxies: ["DIRECT", "Auto", "HK", "TW", "JP", "SG", "US"],
  },
  {
    name: "Paypal",
    type: "select",
    "include-all": true,
    filter: ".*",
    proxies: ["DIRECT", "Auto", "HK", "TW", "JP", "SG", "US"],
  },
  {
    name: "Telegram",
    type: "select",
    "include-all": true,
    filter: ".*",
    proxies: ["DIRECT", "Auto", "HK", "TW", "JP", "SG", "US"],
  },
  {
    name: "Discord",
    type: "select",
    "include-all": true,
    filter: ".*",
    proxies: ["Auto", "HK", "TW", "JP", "SG", "US"],
  },
  {
    name: "Apple",
    type: "select",
    "include-all": true,
    filter: ".*",
    proxies: ["DIRECT", "Auto", "HK", "TW", "JP", "SG", "US"],
  },
  {
    name: "OneDrive",
    type: "select",
    "include-all": true,
    filter: ".*",
    proxies: ["DIRECT", "Auto", "HK", "TW", "JP", "SG", "US"],
  },
  {
    name: "Microsoft",
    type: "select",
    "include-all": true,
    filter: ".*",
    proxies: ["DIRECT", "Auto", "HK", "TW", "JP", "SG", "US"],
  },
  {
    name: "X",
    type: "select",
    "include-all": true,
    filter: ".*",
    proxies: ["Auto", "HK", "TW", "JP", "SG", "US"],
  },
  {
    name: "Instagram",
    type: "select",
    "include-all": true,
    filter: ".*",
    proxies: ["Auto", "HK", "TW", "JP", "SG", "US"],
  },
  {
    name: "Facebook",
    type: "select",
    "include-all": true,
    filter: ".*",
    proxies: ["Auto", "HK", "TW", "JP", "SG", "US"],
  },
  {
    name: "Xiaohongsu",
    type: "select",
    "include-all": true,
    filter: ".*",
    proxies: ["DIRECT", "HK", "TW", "JP", "SG", "US"],
  },
  {
    name: "DouYin",
    type: "select",
    "include-all": true,
    filter: ".*",
    proxies: ["DIRECT", "HK", "TW", "JP", "SG", "US"],
  },
  {
    name: "Spotify",
    type: "select",
    "include-all": true,
    filter: ".*",
    proxies: ["Auto", "HK", "TW", "JP", "SG", "US"],
  },
  {
    name: "Netflix",
    type: "select",
    "include-all": true,
    filter: ".*",
    proxies: ["Auto", "HK", "TW", "JP", "SG", "US"],
  },
  {
    name: "Disney",
    type: "select",
    "include-all": true,
    filter: ".*",
    proxies: ["Auto", "HK", "TW", "JP", "SG", "US"],
  },
  {
    name: "TikTok",
    type: "select",
    "include-all": true,
    filter: ".*",
    proxies: ["REJECT", "HK", "TW", "JP", "SG", "US"],
  },
  {
    name: "Bahamut",
    type: "select",
    "include-all": true,
    filter: "(台湾|TW|台|Taiwan)",
    proxies: ["TW"],
  },
  {
    name: "Bilibili",
    type: "select",
    "include-all": true,
    filter: "(港|HK|Hong Kong|台湾|TW|台|Taiwan|新加坡|SG|新|Singapore|狮城|澳门)",
    proxies: ["DIRECT", "HK", "TW", "SG"],
  },
  {
    name: "Steam",
    type: "select",
    "include-all": true,
    filter: ".*",
    proxies: ["DIRECT", "Auto", "HK", "TW", "JP", "SG", "US"],
  },
  {
    name: "EPIC",
    type: "select",
    "include-all": true,
    filter: ".*",
    proxies: ["DIRECT", "Auto", "HK", "TW", "JP", "SG", "US"],
  },
  {
    name: "Game",
    type: "select",
    "include-all": true,
    filter: ".*",
    proxies: ["DIRECT", "Auto", "HK", "TW", "JP", "SG", "US"],
  },
  {
    name: "Worldwide",
    type: "select",
    "include-all": true,
    filter: ".*",
    proxies: ["Auto", "HK", "TW", "JP", "SG", "US"],
  },
  {
    name: "Other",
    type: "select",
    "include-all": true,
    filter: "(?!.*(游戏|GAME|game)).*",
    proxies: ["DIRECT", "Auto", "HK", "TW", "JP", "SG", "US"],
  },
  {
    name: "China",
    type: "select",
    proxies: ["DIRECT"],
  },
  {
    name: "HK",
    type: "url-test",
    "include-all": true,
    filter: "^(?!.*(游戏|Game|game))(?i).*?(香港|HK|Hong\\s?Kong|(?<!深|珠|莞)港)",
    url: "http://www.gstatic.com/generate_204",
    interval: 120,
    tolerance: 50,
    "max-failed-times": 100,
  },
  {
    name: "TW",
    type: "url-test",
    "include-all": true,
    filter:
      "^(?!.*(游戏|Game|game))(?i).*?(台湾|Taiwan|TW|臺?灣|(?<![^ /\\n])台(?![^ /\\n]))",
    url: "http://www.gstatic.com/generate_204",
    interval: 120,
    tolerance: 50,
    "max-failed-times": 100,
  },
  {
    name: "JP",
    type: "url-test",
    "include-all": true,
    filter: "(?i)^(?!.*(?:游戏|game)).*(?:日本|JP|Japan|东京|大阪|(?:川|泉|埼玉|深)?日(?!利亚|尔))",
    url: "http://www.gstatic.com/generate_204",
    interval: 120,
    tolerance: 50,
    "max-failed-times": 100,
  },
  {
    name: "SG",
    type: "url-test",
    "include-all": true,
    filter: "(?i)^(?!.*(?:游戏|game)).*?(?:新加坡|SG|Singapore|狮城)",
    url: "http://www.gstatic.com/generate_204",
    interval: 120,
    tolerance: 50,
    "max-failed-times": 100,
  },
  {
    name: "US",
    type: "url-test",
    "include-all": true,
    filter:
      "(?i)^(?!.*(?:游戏|game)).*?(?:\\bU\\.?S\\.?A?\\.?\\b|United\\s?States|美国|波特兰|达拉斯|俄勒冈|凤凰城|硅谷|洛杉矶|休斯顿)",
    url: "http://www.gstatic.com/generate_204",
    interval: 120,
    tolerance: 50,
    "max-failed-times": 100,
  },
];

const RULE_PROVIDERS = {
  "1Password": {
    url: "https://raw.githubusercontent.com/iulove1314520/iulove/refs/heads/main/1password.list",
    path: "./ruleset/1Password.list",
    behavior: "classical",
    interval: 86400,
    format: "text",
    type: "http",
  },
  OpenAI: {
    url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/OpenAI/OpenAI.list",
    path: "./ruleset/OpenAI.list",
    behavior: "classical",
    interval: 86400,
    format: "text",
    type: "http",
  },
  Gemini: {
    url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/BardAI/BardAI.list",
    path: "./ruleset/Gemini.list",
    behavior: "classical",
    interval: 86400,
    format: "text",
    type: "http",
  },
  Claude: {
    url: "https://raw.githubusercontent.com/iulove1314520/ios_rule_script/refs/heads/master/rule/Clash/Claude/Claude.list",
    path: "./ruleset/Claude.list",
    behavior: "classical",
    interval: 86400,
    format: "text",
    type: "http",
  },
  Perplexity: {
    url: "https://raw.githubusercontent.com/iulove1314520/iulove/refs/heads/main/perplexity.list",
    path: "./ruleset/Perplexity.list",
    behavior: "classical",
    interval: 86400,
    format: "text",
    type: "http",
  },
  EMBY: {
    url: "https://raw.githubusercontent.com/iulove1314520/iulove/main/emby.list",
    path: "./ruleset/EMBY.list",
    behavior: "classical",
    interval: 86400,
    format: "text",
    type: "http",
  },
  YouTube: {
    url: "https://raw.githubusercontent.com/iulove1314520/ios_rule_script/refs/heads/master/rule/Clash/YouTube/YouTube.list",
    path: "./ruleset/YouTube.list",
    behavior: "classical",
    interval: 86400,
    format: "text",
    type: "http",
  },
  Google: {
    url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Google/Google.list",
    path: "./ruleset/Google.list",
    behavior: "classical",
    interval: 86400,
    format: "text",
    type: "http",
  },
  Github: {
    url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/GitHub/GitHub.list",
    path: "./ruleset/Github.list",
    behavior: "classical",
    interval: 86400,
    format: "text",
    type: "http",
  },
  Cloudflare: {
    url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Cloudflare/Cloudflare.list",
    path: "./ruleset/Cloudflare.list",
    behavior: "classical",
    interval: 86400,
    format: "text",
    type: "http",
  },
  Paypal: {
    url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/PayPal/PayPal.list",
    path: "./ruleset/Paypal.list",
    behavior: "classical",
    interval: 86400,
    format: "text",
    type: "http",
  },
  Telegram: {
    url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Telegram/Telegram.list",
    path: "./ruleset/Telegram.list",
    behavior: "classical",
    interval: 86400,
    format: "text",
    type: "http",
  },
  Discord: {
    url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/refs/heads/master/rule/Clash/Discord/Discord.list",
    path: "./ruleset/Discord.list",
    behavior: "classical",
    interval: 86400,
    format: "text",
    type: "http",
  },
  Apple: {
    url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Apple/Apple.list",
    path: "./ruleset/Apple.list",
    behavior: "classical",
    interval: 86400,
    format: "text",
    type: "http",
  },
  OneDrive: {
    url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/OneDrive/OneDrive.list",
    path: "./ruleset/OneDrive.list",
    behavior: "classical",
    interval: 86400,
    format: "text",
    type: "http",
  },
  Microsoft: {
    url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Microsoft/Microsoft.list",
    path: "./ruleset/Microsoft.list",
    behavior: "classical",
    interval: 86400,
    format: "text",
    type: "http",
  },
  X: {
    url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Twitter/Twitter.list",
    path: "./ruleset/X.list",
    behavior: "classical",
    interval: 86400,
    format: "text",
    type: "http",
  },
  Instagram: {
    url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Instagram/Instagram.list",
    path: "./ruleset/Instagram.list",
    behavior: "classical",
    interval: 86400,
    format: "text",
    type: "http",
  },
  Facebook: {
    url: "https://raw.githubusercontent.com/iulove1314520/ios_rule_script/refs/heads/master/rule/Clash/Facebook/Facebook.list",
    path: "./ruleset/Facebook.list",
    behavior: "classical",
    interval: 86400,
    format: "text",
    type: "http",
  },
  Xiaohongsu: {
    url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/refs/heads/master/rule/Clash/XiaoHongShu/XiaoHongShu.list",
    path: "./ruleset/Xiaohongsu.list",
    behavior: "classical",
    interval: 86400,
    format: "text",
    type: "http",
  },
  DouYin: {
    url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/refs/heads/master/rule/Clash/DouYin/DouYin.list",
    path: "./ruleset/DouYin.list",
    behavior: "classical",
    interval: 86400,
    format: "text",
    type: "http",
  },
  Spotify: {
    url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Spotify/Spotify.list",
    path: "./ruleset/Spotify.list",
    behavior: "classical",
    interval: 86400,
    format: "text",
    type: "http",
  },
  Bilibili: {
    url: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Ruleset/Bilibili.list",
    path: "./ruleset/Bilibili.list",
    behavior: "classical",
    interval: 86400,
    format: "text",
    type: "http",
  },
  Disney: {
    url: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Ruleset/DisneyPlus.list",
    path: "./ruleset/Disney.list",
    behavior: "classical",
    interval: 86400,
    format: "text",
    type: "http",
  },
  Netflix: {
    url: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Ruleset/Netflix.list",
    path: "./ruleset/Netflix.list",
    behavior: "classical",
    interval: 86400,
    format: "text",
    type: "http",
  },
  TikTok: {
    url: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Ruleset/TikTok.list",
    path: "./ruleset/TikTok.list",
    behavior: "classical",
    interval: 86400,
    format: "text",
    type: "http",
  },
  Bahamut: {
    url: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Ruleset/Bahamut.list",
    path: "./ruleset/Bahamut.list",
    behavior: "classical",
    interval: 86400,
    format: "text",
    type: "http",
  },
  EPIC: {
    url: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Ruleset/Epic.list",
    path: "./ruleset/EPIC.list",
    behavior: "classical",
    interval: 86400,
    format: "text",
    type: "http",
  },
  Steam: {
    url: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Ruleset/Steam.list",
    path: "./ruleset/Steam.list",
    behavior: "classical",
    interval: 86400,
    format: "text",
    type: "http",
  },
  Game: {
    url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Surge/Game/Game.list",
    path: "./ruleset/Game.list",
    behavior: "classical",
    interval: 86400,
    format: "text",
    type: "http",
  },
  Worldwide: {
    url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/refs/heads/master/rule/Clash/Global/Global.list",
    path: "./ruleset/Worldwide.list",
    behavior: "classical",
    interval: 86400,
    format: "text",
    type: "http",
  },
  Worldwide_2: {
    url: "https://raw.githubusercontent.com/iulove1314520/iulove/main/Global.list",
    path: "./ruleset/Worldwide_2.list",
    behavior: "classical",
    interval: 86400,
    format: "text",
    type: "http",
  },
  China: {
    url: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/LocalAreaNetwork.list",
    path: "./ruleset/China.list",
    behavior: "classical",
    interval: 86400,
    format: "text",
    type: "http",
  },
  China_2: {
    url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/China/China.list",
    path: "./ruleset/China_2.list",
    behavior: "classical",
    interval: 86400,
    format: "text",
    type: "http",
  },
  China_3: {
    url: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/ChinaDomain.list",
    path: "./ruleset/China_3.list",
    behavior: "domain",
    interval: 86400,
    format: "text",
    type: "http",
  },
  China_4: {
    url: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/ChinaCompanyIp.list",
    path: "./ruleset/China_4.list",
    behavior: "ipcidr",
    interval: 86400,
    format: "text",
    type: "http",
  },
  China_5: {
    url: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Download.list",
    path: "./ruleset/China_5.list",
    behavior: "classical",
    interval: 86400,
    format: "text",
    type: "http",
  },
  China_6: {
    url: "https://raw.githubusercontent.com/iulove1314520/iulove/refs/heads/main/china.list",
    path: "./ruleset/China_6.list",
    behavior: "classical",
    interval: 86400,
    format: "text",
    type: "http",
  },
};

const RULES = [
  "RULE-SET,1Password,1Password",
  "RULE-SET,OpenAI,OpenAI",
  "RULE-SET,Gemini,Gemini",
  "RULE-SET,Claude,Claude",
  "RULE-SET,Perplexity,Perplexity",
  "RULE-SET,EMBY,EMBY",
  "RULE-SET,YouTube,YouTube",
  "RULE-SET,Google,Google",
  "RULE-SET,Github,Github",
  "RULE-SET,Cloudflare,Cloudflare",
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
  "RULE-SET,Worldwide,Worldwide",
  "RULE-SET,Worldwide_2,Worldwide",
  "RULE-SET,China,China",
  "RULE-SET,China_2,China",
  "RULE-SET,China_3,China",
  "RULE-SET,China_4,China",
  "RULE-SET,China_5,China",
  "RULE-SET,China_6,China",
  "GEOIP,CN,China",
  "MATCH,Other",
];

function main(config) {
  const proxyNames = getProxyNames(config);
  config["proxy-groups"] = GROUP_SPECS.map((spec) => buildGroup(spec, proxyNames));
  config["rule-providers"] = Object.assign({}, config["rule-providers"] || {}, RULE_PROVIDERS);
  config.rules = RULES.slice();
  return config;
}

function getProxyNames(config) {
  if (!config || !Array.isArray(config.proxies)) {
    return [];
  }

  return config.proxies
    .map((proxy) => {
      if (typeof proxy === "string") {
        return proxy;
      }

      return typeof proxy?.name === "string" ? proxy.name : "";
    })
    .filter(Boolean);
}

function buildGroup(spec, proxyNames) {
  const group = Object.assign({}, spec);
  const baseProxies = Array.isArray(spec.proxies) ? spec.proxies : [];
  const matchedNames = spec["include-all"] ? filterProxyNames(proxyNames, spec.filter, spec["exclude-filter"]) : [];

  if (baseProxies.length || matchedNames.length) {
    group.proxies = uniqueNames(baseProxies.concat(matchedNames));
  }

  delete group["include-all"];
  delete group.filter;
  delete group["exclude-filter"];

  return group;
}

function filterProxyNames(proxyNames, pattern, excludePattern) {
  const includeRe = compilePattern(pattern, false);
  const excludeRe = compilePattern(excludePattern, true);

  return proxyNames.filter((name) => {
    if (includeRe && !includeRe.test(name)) {
      return false;
    }

    if (excludeRe && excludeRe.test(name)) {
      return false;
    }

    return true;
  });
}

function compilePattern(pattern, allowAllWhenEmpty) {
  if (!pattern) {
    return allowAllWhenEmpty ? null : /.*/;
  }

  let source = String(pattern);
  let flags = "";

  if (source.includes("(?i)")) {
    source = source.replace(/\(\?i\)/g, "");
    flags += "i";
  }

  try {
    return new RegExp(source, flags);
  } catch (error) {
    console.log(`Invalid filter pattern: ${pattern}`);
    return allowAllWhenEmpty ? null : /$^/;
  }
}

function uniqueNames(names) {
  const result = [];
  const seen = new Set();

  for (const name of names) {
    if (!name || seen.has(name)) {
      continue;
    }

    seen.add(name);
    result.push(name);
  }

  return result;
}
