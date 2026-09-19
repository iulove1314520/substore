// 使用 MRS 为主、classical 为辅的混合规则生成 Mihomo 策略组和分流规则。
/**
 * 自用 v2 — Sub-Store 的 mihomo 配置覆写脚本。
 * 在 mihomo 配置文件的脚本操作中使用 main(config)。
 *
 * 输入：已经展开到 config.proxies 的节点；不读取动态 proxy-providers。
 * 保留节点原有字段、TUN 及其他客户端设置，只重建策略组、规则集和规则；DNS/hosts 按 dnsMode 处理。
 *
 * v2 变化：
 * - 常用服务改用 domain / ipcidr MRS，减少 classical 文本规则的解析开销。
 * - 域名集与 IP 集分开引用，IP 规则统一使用 no-resolve。
 * - 1Password、个人 EMBY、个人全球、个人中国规则继续使用 classical。
 * - 下载器进程规则继续使用 inline classical，避免不受支持的 MRS 类型。
 * - 新增 preserve / managed DNS 模式；托管模式支持分流解析和机场私有 DNS。
 * - 托管 DNS 只保留与节点域名相关的机场 fake-ip-filter / DNS 策略条目，合并用户 hosts，不改写节点 server。
 * - 不使用 GEOIP / GEOSITE，避免内核下载 geodata；下载器进程规则前置，并保证进程识别未被关闭。
 * - 规则集统一经 fastly.jsdelivr.net 拉取；raw.githubusercontent.com 国内直连常 TLS 超时，会让内核启动失败。
 * - 默认精简服务组：仅 AI、影视、Other 展开全部节点，游戏组附加游戏专线，其余引用 Manual；
 *   并生成地区/低倍率手选组、隐藏测速子组和粘性负载均衡组。
 * - 低倍率判定与 V2/节点排序.js 一致：倍率数值小于 1，或带 EX / 低倍率 标签；不再生成高倍率组。
 * - apple@cn / microsoft@cn / category-games@cn 在服务规则前直连，切换 Apple、Microsoft、Steam 组不影响国内 CDN。
 * - 可选屏蔽非国内目标的 UDP 443（QUIC）；ChatGPT / Gemini / Claude / Grok 默认 REJECT，TikTok 默认 JP，
 *   均通过官方 default-selected 显式声明，列表首项与之保持一致以兼容旧内核。
 * - 节点域名的私有 DNS 策略按注册域折叠为 +. 形式；公共 DNS 识别名单与 MyClash 同步。
 * - 机场原有 rule-providers / sub-rules 不再输出，节点 dialer-proxy 指向已删除策略组时移除该字段，避免内核启动失败。
 * - 保留 v1 的地区识别、空组清理、节点重名和引用完整性校验。
 *
 * 官方字段参考：
 * https://wiki.metacubex.one/config/proxy-groups/
 * https://wiki.metacubex.one/config/rule-providers/
 */

const SETTINGS = {
  // false：每个服务组都展开全部普通节点；true：仅 expandNodes / regions 组展开节点，其余共用 Manual 组。
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
  // 生成低倍率节点手选组及其隐藏测速子组；判定规则见 isLowRateNode。
  enableLowRateGroup: true,
  enableLoadBalance: true,
  loadBalanceStrategy: "sticky-sessions",
  testUrl: "https://www.gstatic.com/generate_204",
  autoInterval: 300,
  countryInterval: 300,
  rateInterval: 300,
  loadBalanceInterval: 600,
  testTimeout: 5000,
  tolerance: 50,
  maxFailedTimes: 5,
  ruleUpdateInterval: 86400,
  // 留空则内核直连下载规则集；若 jsdelivr 也不可达，可填策略组名（如 "Worldwide"）改为经代理下载。
  ruleProviderProxy: "",
};

const COUNTRY_GROUP_NAMES = ["HK", "TW", "JP", "SG", "US"];
const LOW_RATE_GROUP_NAME = "低倍率节点";
const LOAD_BALANCE_GROUP_NAME = "负载均衡";
const GAME_PATTERN = /游戏|game/i;
const BUILTIN_PROXY_NAMES = ["DIRECT", "REJECT", "REJECT-DROP", "PASS", "COMPATIBLE", "GLOBAL"];

// 按节点名称识别地区，不代表实际出口检测。
const REGION_PATTERNS = {
  "HK": "🇭🇰|香港|Hong\\s*Kong|(?:^|[^a-z])HKG?(?=[^a-z]|$)|(?:^|[\\s/|_-])港(?=$|[\\s/|_-])",
  "TW": "🇹🇼|台[湾灣]|臺灣|Taiwan|台北|臺北|(?:^|[^a-z])TWN?(?=[^a-z]|$)|(?:^|[\\s/|_-])台(?=$|[\\s/|_-])",
  "JP": "🇯🇵|日本|Japan|东京|東京|大阪|(?:^|[^a-z])JPN?(?=[^a-z]|$)|(?:^|[\\s/|_-])日(?=$|[\\s/|_-])",
  "SG": "🇸🇬|新加坡|Singapore|狮城|獅城|(?:^|[^a-z])SGP?(?=[^a-z]|$)",
  "US": "🇺🇸|🇺🇲|美国|美國|United\\s*States|波特兰|达拉斯|俄勒冈|凤凰城|费利蒙|硅谷|拉斯维加斯|洛杉矶|圣何塞|圣克拉拉|西雅图|芝加哥|休斯顿|(?:^|[^a-z])U\\.?S\\.?A?\\.?(?=[^a-z]|$)",
  "UK": "🇬🇧|英国|英國|United\\s*Kingdom|Britain|伦敦|倫敦|(?:^|[^a-z])(?:UK|GB|GBR)(?=[^a-z]|$)",
  "FR": "🇫🇷|法国|法國|France|巴黎|(?:^|[^a-z])FRA?(?=[^a-z]|$)",
  "DE": "🇩🇪|德国|德國|Germany|法兰克福|法蘭克福|(?:^|[^a-z])DEU?(?=[^a-z]|$)",
  "MO": "🇲🇴|澳门|澳門|Macau|Macao|(?:^|[^a-z])(?:MO|MAC)(?=[^a-z]|$)",
};

const REGION_MATCHERS = {};
for (const region of Object.keys(REGION_PATTERNS)) {
  REGION_MATCHERS[region] = new RegExp(REGION_PATTERNS[region], "i");
}

// 倍率识别与 V2/节点排序.js 完全一致，保证两个脚本对同一节点的分类相同。
const MULTIPLIER_PATTERNS = [
  /(?:^|[^A-Za-z0-9.])[xX×]\s*(\d+(?:[.,]\d+)?)(?=$|[^A-Za-z0-9])/,
  /(?:^|[^A-Za-z0-9.])(\d+(?:[.,]\d+)?)\s*[xX×](?=$|[^A-Za-z0-9])/,
  /(?:^|[^A-Za-z0-9.])(\d+(?:[.,]\d+)?)\s*倍(?:率)?/,
  /倍率\s*[:：]?\s*(\d+(?:[.,]\d+)?)/,
];
// 低倍率：倍率数值小于 1，或名称带独立的 EX 代号 / “低倍率”标签。
const LOW_MULTIPLIER_MAX = 1;
const LOW_MULTIPLIER_TAG = /(?:^|[^A-Za-z0-9])EX(?=$|[^A-Za-z])|低倍率/i;

// 首项决定无历史选择时的默认出口；defaultSelected 再用官方 default-selected 字段显式声明，成员不存在时忽略。
// regions：只展开匹配地区的节点；expandNodes：精简模式下仍展开全部普通节点（AI、影视、Other）；
// gameNodes：附加名称含“游戏/game”的专线节点；noNodes：不加入订阅节点。
const SERVICE_SPECS = [
  {"name":"1Password","proxies":["DIRECT","Auto","HK","TW","JP","SG","US"]},
  // AI 服务默认 REJECT，需手动选择出口，避免误用不受支持的地区。
  {"name":"ChatGPT","proxies":["REJECT","US","JP","SG"],"defaultSelected":"REJECT","regions":["JP","SG","US","UK","FR","DE"]},
  {"name":"Gemini","proxies":["REJECT","US","HK","TW","JP","SG"],"defaultSelected":"REJECT","expandNodes":true},
  {"name":"Claude","proxies":["REJECT","US"],"defaultSelected":"REJECT","regions":["US"]},
  {"name":"Grok","proxies":["REJECT","US","JP","SG"],"defaultSelected":"REJECT","regions":["JP","SG","US","UK","FR","DE"]},
  {"name":"Perplexity","proxies":["Auto","HK","TW","JP","SG","US"],"expandNodes":true},
  {"name":"EMBY","proxies":["DIRECT","Auto","HK","TW","JP","SG","US"],"expandNodes":true},
  {"name":"YouTube","proxies":["Auto","HK","TW","JP","SG","US"],"expandNodes":true},
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
  {"name":"DouYin","proxies":["DIRECT","HK","TW","JP","SG","US"],"expandNodes":true},
  {"name":"Spotify","proxies":["Auto","HK","TW","JP","SG","US"]},
  {"name":"Netflix","proxies":["Auto","HK","TW","JP","SG","US"],"expandNodes":true},
  {"name":"Disney","proxies":["Auto","HK","TW","JP","SG","US"],"expandNodes":true},
  {"name":"TikTok","proxies":["JP","HK","TW","SG","US","REJECT"],"defaultSelected":"JP","expandNodes":true},
  {"name":"Bahamut","proxies":["TW"],"regions":["TW"]},
  {"name":"Bilibili","proxies":["DIRECT","HK","TW","SG"],"regions":["HK","TW","SG","MO"]},
  {"name":"Steam","proxies":["DIRECT","Auto","HK","TW","JP","SG","US"],"gameNodes":true},
  {"name":"EPIC","proxies":["DIRECT","Auto","HK","TW","JP","SG","US"],"gameNodes":true},
  {"name":"Game","proxies":["DIRECT","Auto","HK","TW","JP","SG","US"],"gameNodes":true},
  {"name":"Worldwide","proxies":["Auto","HK","TW","JP","SG","US"]},
  {"name":"Other","proxies":["DIRECT","Auto","HK","TW","JP","SG","US"],"expandNodes":true},
  {"name":"China","proxies":["DIRECT"],"noNodes":true},
];

// 全部走 fastly.jsdelivr.net：内核在启动阶段直连下载规则集，raw.githubusercontent.com 在国内经常握手超时。
const METACUBEX_DOMAIN_ROOT =
  "https://fastly.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geosite/";
const METACUBEX_IP_ROOT =
  "https://fastly.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo/geoip/";
const BETT_IP_ROOT =
  "https://fastly.jsdelivr.net/gh/appshubcc/bett-rules@meta/geo/geoip/";
const BETT_DOMAIN_ROOT =
  "https://fastly.jsdelivr.net/gh/appshubcc/bett-rules@meta/geo/geosite/";
// 个人列表同样经 jsdelivr；分支引用带 CDN 缓存，仓库更新后需等缓存刷新才会生效。
const PERSONAL_LIST_ROOT = "https://fastly.jsdelivr.net/gh/iulove1314520/iulove@main/";

function mrsDomain(file, root) {
  return {
    behavior: "domain",
    format: "mrs",
    url: (root || METACUBEX_DOMAIN_ROOT) + file + ".mrs",
  };
}

function mrsIp(file, root) {
  return {
    behavior: "ipcidr",
    format: "mrs",
    url: (root || METACUBEX_IP_ROOT) + file + ".mrs",
  };
}

function classicalText(url) {
  return {
    behavior: "classical",
    format: "text",
    url: url,
  };
}

// MRS 仅用于纯域名集和纯 IP 集；混合规则继续使用 classical。
const RULE_PROVIDER_SPECS = {
  "Private_Domain": mrsDomain("private"),
  "Private_IP": mrsIp("private"),
  "FakeIP_Filter": mrsDomain("fakeip-filter", BETT_DOMAIN_ROOT),
  "China_Domain": mrsDomain("cn"),
  "China_IP": mrsIp("cn"),
  // 国内分支：在服务规则之前直连，避免切换 Apple / Microsoft / Steam 组时国内 CDN 也走代理。
  "Apple_CN": mrsDomain("apple@cn"),
  "Microsoft_CN": mrsDomain("microsoft@cn"),
  "Games_CN": mrsDomain("category-games@cn"),

  "1Password": classicalText(PERSONAL_LIST_ROOT + "1password.list"),
  "ChatGPT_Domain": mrsDomain("openai"),
  "Gemini_Domain": mrsDomain("google-gemini"),
  "Claude_Domain": mrsDomain("anthropic"),
  // xai 列表含 grok.com、grok.x.com、grokipedia.com、x.ai。
  "Grok_Domain": mrsDomain("xai"),
  "Perplexity_Domain": mrsDomain("perplexity"),
  "YouTube_Domain": mrsDomain("youtube"),
  "Google_Domain": mrsDomain("google"),
  "Google_IP": mrsIp("google"),
  "Github_Domain": mrsDomain("github"),
  "Cloudflare_Domain": mrsDomain("cloudflare"),
  "Cloudflare_IP": mrsIp("cloudflare"),
  "Paypal_Domain": mrsDomain("paypal"),
  "Telegram_Domain": mrsDomain("telegram"),
  "Telegram_IP": mrsIp("telegram"),
  "Discord_Domain": mrsDomain("discord"),
  "Apple_Domain": mrsDomain("apple"),
  "Apple_IP": mrsIp("apple", BETT_IP_ROOT),
  "OneDrive_Domain": mrsDomain("onedrive"),
  "Microsoft_Domain": mrsDomain("microsoft"),
  "Microsoft_IP": mrsIp("microsoft", BETT_IP_ROOT),
  "X_Domain": mrsDomain("twitter"),
  "X_IP": mrsIp("twitter"),
  "Instagram_Domain": mrsDomain("instagram"),
  "Facebook_Domain": mrsDomain("facebook"),
  "Facebook_IP": mrsIp("facebook"),
  "Xiaohongsu_Domain": mrsDomain("xiaohongshu"),
  "DouYin_Domain": mrsDomain("douyin"),
  "Spotify_Domain": mrsDomain("spotify"),
  "Spotify_IP": mrsIp("spotify", BETT_IP_ROOT),
  "Bilibili_Domain": mrsDomain("bilibili"),
  "Disney_Domain": mrsDomain("disney"),
  "Netflix_Domain": mrsDomain("netflix"),
  "Netflix_IP": mrsIp("netflix"),
  "TikTok_Domain": mrsDomain("tiktok"),
  "TikTok_IP": mrsIp("tiktok", BETT_IP_ROOT),
  "Bahamut_Domain": mrsDomain("bahamut"),
  "EPIC_Domain": mrsDomain("epicgames"),
  "Steam_Domain": mrsDomain("steam"),
  "Steam_IP": mrsIp("steam", BETT_IP_ROOT),
  "Game_Domain": mrsDomain("category-games-!cn"),
  "Worldwide_Domain": mrsDomain("geolocation-!cn"),

  // 个性化列表没有等价的稳定 MRS，继续使用 classical 文本。
  "EMBY_Custom": classicalText(PERSONAL_LIST_ROOT + "emby.list"),
  "Worldwide_Custom": classicalText(PERSONAL_LIST_ROOT + "Global.list"),
  "China_Custom": classicalText(PERSONAL_LIST_ROOT + "china.list"),
};

// 公共 EMBY 域名使用 MRS；个人列表作为补充而不是替代。
RULE_PROVIDER_SPECS.EMBY_Domain = mrsDomain(
  "Emby",
  "https://fastly.jsdelivr.net/gh/666OS/rules@release/mihomo/domain/"
);
// emos 维护的公开 EMBY 服务器列表，覆盖 666OS 未收录的站点。
RULE_PROVIDER_SPECS.EMBY_Emos = mrsDomain(
  "emos-mihomo",
  "https://fastly.jsdelivr.net/gh/binaryu/emos-proxy-rule@main/rules/"
);

const CHINA_DNS = ["223.5.5.5#DIRECT", "119.29.29.29#DIRECT"];
const FOREIGN_DNS = [
  "https://cloudflare-dns.com/dns-query#Worldwide",
  "https://dns.google/dns-query#Worldwide",
];
const DEFAULT_DNS = [
  "114.114.114.114#DIRECT",
  "tls://223.5.5.5#DIRECT",
  "https://1.12.12.12/dns-query#DIRECT",
];
const PROXY_SERVER_DNS = [
  "114.114.114.114#DIRECT",
  "tls://223.5.5.5#DIRECT",
  "https://doh.pub/dns-query#DIRECT",
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
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (/^\d+(?:\.\d+){3}$/.test(marker)) return "(?:^|[^\\d.])" + escaped + "(?=$|[^\\d.])";
  if (marker.includes(":")) return "(?:^|[^0-9a-f:])" + escaped + "(?=$|[^0-9a-f:])";
  return escaped;
}

const COMMON_DNS_REGEX = new RegExp(COMMON_DNS_MARKERS.map(dnsMarkerSource).join("|"), "i");

// 下载规则包含进程名和 DOMAIN-KEYWORD，不能转换为 MRS。
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

// 前置直连：私有网络、下载器进程（前置避免国外 tracker 域名先被服务或全球规则截走，代价是每条连接多一次进程查询）、
// 国内分支和个人国内列表。
const PREFIX_RULES = [
  "RULE-SET,Private_Domain,China",
  "RULE-SET,Private_IP,China,no-resolve",
  "RULE-SET,China_Download,China",
  "RULE-SET,Apple_CN,China",
  "RULE-SET,Microsoft_CN,China",
  "RULE-SET,Games_CN,China",
  "RULE-SET,China_Custom,China",
];

// 屏蔽非国内目标的 UDP 443；放在前置直连之后，内层直接复用 China_Domain / China_IP 规则集。
const FOREIGN_QUIC_RULE =
  "AND,((NETWORK,UDP),(DST-PORT,443),(NOT,((OR,((RULE-SET,China_Domain),(RULE-SET,China_IP,no-resolve)))))),REJECT";

// 域名规则优先于 IP 规则；具体服务优先于通用平台和全球兜底。
const SERVICE_RULES = [
  "RULE-SET,1Password,1Password",
  "DOMAIN-SUFFIX,disney.my.sentry.io,Disney",
  "DOMAIN-SUFFIX,sub.texon.io,Worldwide",
  // Emby Premiere 授权校验服务器，公共列表未必收录。
  "DOMAIN-SUFFIX,mb3admin.com,EMBY",

  "RULE-SET,ChatGPT_Domain,ChatGPT",
  "RULE-SET,Gemini_Domain,Gemini",
  "RULE-SET,Claude_Domain,Claude",
  "RULE-SET,Grok_Domain,Grok",
  "RULE-SET,Perplexity_Domain,Perplexity",
  "RULE-SET,Discord_Domain,Discord",
  "RULE-SET,YouTube_Domain,YouTube",
  "RULE-SET,Github_Domain,Github",
  "RULE-SET,Paypal_Domain,Paypal",
  "RULE-SET,Telegram_Domain,Telegram",
  "RULE-SET,X_Domain,X",
  "RULE-SET,Instagram_Domain,Instagram",
  "RULE-SET,Facebook_Domain,Facebook",
  "RULE-SET,Xiaohongsu_Domain,Xiaohongsu",
  "RULE-SET,DouYin_Domain,DouYin",
  "RULE-SET,Spotify_Domain,Spotify",
  "RULE-SET,Bilibili_Domain,Bilibili",
  "RULE-SET,Disney_Domain,Disney",
  "RULE-SET,Netflix_Domain,Netflix",
  "RULE-SET,TikTok_Domain,TikTok",
  "RULE-SET,Bahamut_Domain,Bahamut",
  "RULE-SET,EPIC_Domain,EPIC",
  "RULE-SET,Steam_Domain,Steam",

  "RULE-SET,Google_Domain,Google",
  "RULE-SET,Apple_Domain,Apple",
  "RULE-SET,OneDrive_Domain,OneDrive",
  "RULE-SET,Microsoft_Domain,Microsoft",
  "RULE-SET,Game_Domain,Game",
  "RULE-SET,EMBY_Domain,EMBY",
  "RULE-SET,EMBY_Emos,EMBY",
  "RULE-SET,EMBY_Custom,EMBY",
  "RULE-SET,Cloudflare_Domain,Cloudflare",
  "RULE-SET,Worldwide_Domain,Worldwide",
  "RULE-SET,Worldwide_Custom,Worldwide",
  "RULE-SET,China_Domain,China",

  "RULE-SET,Google_IP,Google,no-resolve",
  "RULE-SET,Telegram_IP,Telegram,no-resolve",
  "RULE-SET,Apple_IP,Apple,no-resolve",
  "RULE-SET,Microsoft_IP,Microsoft,no-resolve",
  "RULE-SET,X_IP,X,no-resolve",
  "RULE-SET,Facebook_IP,Facebook,no-resolve",
  "RULE-SET,Spotify_IP,Spotify,no-resolve",
  "RULE-SET,Netflix_IP,Netflix,no-resolve",
  "RULE-SET,TikTok_IP,TikTok,no-resolve",
  "RULE-SET,Steam_IP,Steam,no-resolve",
  "RULE-SET,Cloudflare_IP,Cloudflare,no-resolve",
  "RULE-SET,China_IP,China,no-resolve",
  "MATCH,Other",
];

function buildRules() {
  return PREFIX_RULES.concat(SETTINGS.blockForeignQuic ? [FOREIGN_QUIC_RULE] : [], SERVICE_RULES);
}

function main(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("自用v2：输入必须是 mihomo 配置对象。");
  }
  if (SETTINGS.dnsMode !== "preserve" && SETTINGS.dnsMode !== "managed") {
    throw new Error("自用v2：dnsMode 只能是 preserve 或 managed。");
  }
  if (
    SETTINGS.enableLoadBalance &&
    !["round-robin", "consistent-hashing", "sticky-sessions"].includes(SETTINGS.loadBalanceStrategy)
  ) {
    throw new Error("自用v2：不支持的负载均衡策略：" + SETTINGS.loadBalanceStrategy);
  }
  if (config["proxy-providers"] && Object.keys(config["proxy-providers"]).length > 0) {
    throw new Error("自用v2：请先在 Sub-Store 中将 proxy-providers 展开为 proxies，再执行本脚本。");
  }

  const proxyNames = getProxyNames(config);
  const groups = buildGroups(proxyNames);
  // 规则已全部重建，机场原有 rule-providers 没有任何规则引用却仍会被内核下载，不再并入。
  const providers = buildRuleProviders();
  const rules = buildRules();
  const outlets = collectOutletNames(groups, proxyNames);
  validateReferences(groups, outlets, providers, rules);

  const result = Object.assign({}, config, {
    proxies: sanitizeDialerProxies(config.proxies, outlets),
    "proxy-groups": groups,
    "rule-providers": providers,
    rules: rules,
    "find-process-mode": ensureProcessMode(config["find-process-mode"]),
  });
  // 机场 sub-rules 只能被已重建的 rules 引用，残留下来可能指向不存在的策略组，导致内核启动失败。
  delete result["sub-rules"];

  if (SETTINGS.dnsMode === "managed") {
    if (!providers.FakeIP_Filter) {
      throw new Error("自用v2：managed DNS 缺少 FakeIP_Filter 规则集。");
    }
    const managedDns = buildManagedDnsAndHosts(config);
    result.dns = managedDns.dns;
    result.hosts = managedDns.hosts;
  }

  return result;
}

// China_Download 里的 PROCESS-NAME 规则依赖进程识别；机场配置为 off 或缺省时补为 strict，always 保持不变。
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
    if (!isPlainObject(proxy) || typeof proxy["dialer-proxy"] !== "string") return proxy;
    if (outlets.has(proxy["dialer-proxy"])) return proxy;
    const copy = Object.assign({}, proxy);
    delete copy["dialer-proxy"];
    return copy;
  });
}

function getProxyNames(config) {
  if (!Array.isArray(config.proxies) || config.proxies.length === 0) {
    throw new Error("自用v2：没有读取到节点，请确认前一步已生成非空的 config.proxies。");
  }

  const reservedNames = new Set(
    BUILTIN_PROXY_NAMES.concat(
      ["Auto", "Manual", LOAD_BALANCE_GROUP_NAME],
      COUNTRY_GROUP_NAMES,
      COUNTRY_GROUP_NAMES.map((name) => name + "-Auto"),
      [LOW_RATE_GROUP_NAME, LOW_RATE_GROUP_NAME + "-Auto"],
      SERVICE_SPECS.map((spec) => spec.name)
    )
  );
  const seen = new Set();

  return config.proxies.map((proxy, index) => {
    const name = typeof proxy === "string" ? proxy : proxy && proxy.name;
    if (typeof name !== "string" || !name.trim()) {
      throw new Error("自用v2：第 " + (index + 1) + " 个节点缺少有效名称。");
    }
    if (seen.has(name)) {
      throw new Error("自用v2：节点重名，请先在 Sub-Store 中去重或重命名：" + name);
    }
    if (reservedNames.has(name)) {
      throw new Error("自用v2：节点名与策略组或内置策略冲突，请重命名：" + name);
    }
    seen.add(name);
    return name;
  });
}

function matchesRegions(name, regions) {
  return regions.some((region) => {
    if (!REGION_MATCHERS[region]) {
      throw new Error("自用v2：未定义的地区：" + region);
    }
    return REGION_MATCHERS[region].test(name);
  });
}

function withFallback(names) {
  const unique = Array.from(new Set(names));
  return unique.length > 0 ? unique : ["REJECT"];
}

function makeUrlTest(name, proxies, interval, hidden) {
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
    "empty-fallback": "REJECT",
    ...(hidden ? { hidden: true } : {}),
    proxies: withFallback(proxies),
  };
}

function makeSelectableAutoGroups(name, proxies, interval) {
  const autoName = name + "-Auto";
  return [
    makeUrlTest(autoName, proxies, interval, true),
    { name: name, type: "select", proxies: withFallback([autoName, ...proxies]) },
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
    proxies: withFallback(proxies),
  };
}

function extractMultiplier(name) {
  for (const pattern of MULTIPLIER_PATTERNS) {
    const match = pattern.exec(name);
    if (!match) continue;
    const value = Number.parseFloat(match[1].replace(",", "."));
    if (Number.isFinite(value)) return value;
  }
  return null;
}

// 数值与标签任一命中即为低倍率；带 EX 标签但标注 x1.5 的节点同样归入，与排序脚本行为一致。
function isLowRateNode(name) {
  const multiplier = extractMultiplier(name);
  return (multiplier !== null && multiplier < LOW_MULTIPLIER_MAX) || LOW_MULTIPLIER_TAG.test(name);
}

function buildGroups(proxyNames) {
  const normalNodes = proxyNames.filter((name) => !GAME_PATTERN.test(name));
  const countryGroups = [];
  const rateGroups = [];
  const validCountries = new Set();

  for (const country of COUNTRY_GROUP_NAMES) {
    const members = normalNodes.filter((name) => matchesRegions(name, [country]));
    if (members.length > 0) {
      validCountries.add(country);
      countryGroups.push(...makeSelectableAutoGroups(country, members, SETTINGS.countryInterval));
    }
  }

  if (SETTINGS.enableLowRateGroup) {
    const lowRateNodes = normalNodes.filter(isLowRateNode);
    if (lowRateNodes.length > 0) {
      rateGroups.push(
        ...makeSelectableAutoGroups(LOW_RATE_GROUP_NAME, lowRateNodes, SETTINGS.rateInterval)
      );
    }
  }

  const baseGroups = [makeUrlTest("Auto", normalNodes, SETTINGS.autoInterval, false)];
  if (SETTINGS.compactServiceGroups) {
    baseGroups.push({ name: "Manual", type: "select", proxies: withFallback(normalNodes) });
  }

  const utilityGroupNames = [];
  if (SETTINGS.enableLoadBalance && normalNodes.length > 1) {
    baseGroups.push(makeLoadBalance(normalNodes));
    utilityGroupNames.push(LOAD_BALANCE_GROUP_NAME);
  }
  if (rateGroups.length > 0) utilityGroupNames.push(LOW_RATE_GROUP_NAME);

  // 游戏专线不进入 Auto / Manual / 普通服务组，只附加到声明了 gameNodes 的组。
  const gameNodes = proxyNames.filter((name) => GAME_PATTERN.test(name));

  const serviceGroups = [];
  for (const spec of SERVICE_SPECS) {
    const members = spec.proxies.filter(
      (name) => !COUNTRY_GROUP_NAMES.includes(name) || validCountries.has(name)
    );
    if (!spec.noNodes) {
      if (!spec.regions) members.push(...utilityGroupNames);
      if (spec.regions) {
        members.push(...normalNodes.filter((name) => matchesRegions(name, spec.regions)));
      } else if (spec.expandNodes || !SETTINGS.compactServiceGroups) {
        members.push(...normalNodes);
      } else {
        members.push("Manual");
      }
      if (spec.gameNodes) members.push(...gameNodes);
    }
    const group = { name: spec.name, type: "select", proxies: withFallback(members) };
    if (spec.defaultSelected && group.proxies.includes(spec.defaultSelected)) {
      group["default-selected"] = spec.defaultSelected;
    }
    serviceGroups.push(group);
  }

  return baseGroups.concat(serviceGroups, countryGroups, rateGroups);
}

function buildRuleProviders() {
  const providers = {};
  for (const name of Object.keys(RULE_PROVIDER_SPECS)) {
    if (name === "FakeIP_Filter" && SETTINGS.dnsMode !== "managed") continue;

    const spec = RULE_PROVIDER_SPECS[name];
    if (spec.format === "mrs" && spec.behavior !== "domain" && spec.behavior !== "ipcidr") {
      throw new Error("自用v2：MRS 规则集只允许 domain 或 ipcidr：" + name);
    }

    providers[name] = {
      type: "http",
      behavior: spec.behavior,
      format: spec.format,
      url: spec.url,
      path: "./ruleset/" + name + (spec.format === "mrs" ? ".mrs" : ".list"),
      interval: SETTINGS.ruleUpdateInterval,
    };
    if (SETTINGS.ruleProviderProxy) {
      providers[name].proxy = SETTINGS.ruleProviderProxy;
    }
  }

  providers.China_Download = {
    type: "inline",
    behavior: "classical",
    payload: DOWNLOAD_RULES.slice(),
  };
  return providers;
}

function buildManagedDnsAndHosts(config) {
  const originalDns = isPlainObject(config.dns) ? config.dns : {};
  const originalHosts = isPlainObject(config.hosts) ? config.hosts : {};
  const proxyDomains = collectProxyServerDomains(config.proxies);
  const privateDns = SETTINGS.preservePrivateDns
    ? collectPrivateDns(originalDns)
    : [];
  const proxyServerPolicy = SETTINGS.preservePrivateDns
    ? buildProxyServerPolicy(originalDns, proxyDomains, privateDns)
    : {};

  // 机场 fake-ip-filter 只保留能匹配节点域名的条目；geosite:、rule-set: 等其他条目全部丢弃。
  const proxyFakeIpFilter = toArray(originalDns["fake-ip-filter"])
    .filter((value) => typeof value === "string" && value.length > 0)
    .filter((value) => matchDomainPattern(value, proxyDomains));
  const fakeIpFilter = uniqueStrings([
    "rule-set:Private_Domain",
    "rule-set:FakeIP_Filter",
    "rule-set:China_Domain",
    ...proxyFakeIpFilter,
  ]);

  // 机场 nameserver-policy 可能引用已删除的策略组或 geosite 数据，不再合并；
  // 其中与节点域名相关的条目已由 buildProxyServerPolicy 收入 proxy-server-nameserver-policy。
  const nameserverPolicy = { "rule-set:China_Domain": CHINA_DNS.slice() };

  const dns = Object.assign({}, originalDns, {
    enable: true,
    ipv6: originalDns.ipv6 === true,
    "use-hosts": true,
    "use-system-hosts": true,
    "cache-algorithm": "arc",
    "enhanced-mode": "fake-ip",
    "fake-ip-range": originalDns["fake-ip-range"] || "198.18.0.1/15",
    "fake-ip-range6": originalDns["fake-ip-range6"] || "2001:2::1/48",
    // 过滤列表按黑名单语义生成，机场若设为 whitelist 会反转含义，这里强制回黑名单。
    "fake-ip-filter-mode": "blacklist",
    "fake-ip-filter": fakeIpFilter,
    "default-nameserver": DEFAULT_DNS.slice(),
    "proxy-server-nameserver": PROXY_SERVER_DNS.slice(),
    nameserver: FOREIGN_DNS.slice(),
    "nameserver-policy": nameserverPolicy,
    "direct-nameserver": CHINA_DNS.slice(),
  });

  if (Object.keys(proxyServerPolicy).length > 0) {
    dns["proxy-server-nameserver-policy"] = proxyServerPolicy;
  } else {
    delete dns["proxy-server-nameserver-policy"];
  }

  // 机场 fallback 同样可能带 #已删除策略组 后缀，fallback-filter 的 geoip/geosite 会触发 geodata 下载；
  // 托管模式已用 nameserver-policy + direct-nameserver 完成分流解析，二者一并移除。
  delete dns.fallback;
  delete dns["fallback-filter"];

  const managedHosts = {};
  if (SETTINGS.addDefaultHosts) Object.assign(managedHosts, DEFAULT_HOSTS);
  if (SETTINGS.blockBilibiliPcdn) Object.assign(managedHosts, BILIBILI_PCDN_HOSTS);
  // 用户 hosts 最后合并，允许覆盖脚本默认值。
  Object.assign(managedHosts, originalHosts);

  return { dns: dns, hosts: managedHosts };
}

function collectProxyServerDomains(proxies) {
  const domains = new Set();
  for (const proxy of Array.isArray(proxies) ? proxies : []) {
    if (!proxy || typeof proxy.server !== "string") continue;
    const server = proxy.server.trim().replace(/\.$/, "").toLowerCase();
    if (server && !isIpAddress(server)) domains.add(server);
  }
  return domains;
}

function collectPrivateDns(originalDns) {
  const candidates = [
    ...toArray(originalDns.nameserver),
    ...toArray(originalDns["proxy-server-nameserver"]),
  ];
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
      const alreadyCovered = Object.keys(policy).some((pattern) => matchDomainPattern(pattern, domain));
      if (!alreadyCovered) policy[domain] = privateDns.slice();
    }
  }

  return simplifyDomainPolicy(policy);
}

// com.cn、co.jp 这类二级公共后缀多取一级，避免折叠出 +.com.cn。
const SECOND_LEVEL_SUFFIX = /^(?:com|net|org|gov|edu|co|ne|or|ac|me|info|biz|idv)\.[a-z]{2}$/;

// 相同 DNS 的精确节点域名按注册域折叠为 +. 形式；通配条目和已存在的 +. 键原样保留。
function simplifyDomainPolicy(policy) {
  const result = {};
  const groups = new Map();

  for (const domain of Object.keys(policy)) {
    const labels = domain.split(".");
    // 通配、逗号多域名键都不参与折叠，原样保留。
    const isWildcard =
      domain.startsWith("+.") || domain.startsWith(".") || domain.includes("*") || domain.includes(",");
    const depth = !isWildcard && labels.length >= 3 && SECOND_LEVEL_SUFFIX.test(labels.slice(-2).join("."))
      ? 3
      : 2;
    if (isWildcard || labels.length <= depth) {
      result[domain] = policy[domain];
      continue;
    }
    const suffix = labels.slice(-depth).join(".");
    if (!groups.has(suffix)) groups.set(suffix, []);
    groups.get(suffix).push(domain);
  }

  for (const domains of groups.values()) {
    // 折叠到组内最长公共后缀，例如 hk1/hk2.node.airport.com 得到 +.node.airport.com 而不是 +.airport.com。
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
  if (typeof value === "string") {
    const normalized = stripDnsSuffix(value);
    return normalized || null;
  }
  if (Array.isArray(value)) {
    const normalized = uniqueStrings(
      value.filter((item) => typeof item === "string").map(stripDnsSuffix).filter(Boolean)
    );
    return normalized.length > 0 ? normalized : null;
  }
  return null;
}

function matchDomainPattern(pattern, domains) {
  if (typeof pattern !== "string") return false;
  const normalizedPattern = pattern.toLowerCase();
  // mihomo 允许用逗号在一个键里写多个域名，任一匹配即算命中。
  if (normalizedPattern.includes(",")) {
    return normalizedPattern
      .split(",")
      .map((part) => part.trim())
      .some((part) => part && matchDomainPattern(part, domains));
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

function stripDnsSuffix(value) {
  const text = String(value).trim();
  const hashIndex = text.indexOf("#");
  if (hashIndex === -1) return text;

  const address = text.slice(0, hashIndex).trim();
  const suffix = text.slice(hashIndex + 1).toLowerCase();
  return suffix.includes("direct") || suffix.includes("直连")
    ? address + "#DIRECT"
    : address;
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
  const normalizedListen = String(listen).toLowerCase();
  if (resolver.includes(normalizedListen)) return true;
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

function validateReferences(groups, validNames, providers, rules) {
  const groupsByName = new Map(groups.map((group) => [group.name, group]));
  if (groupsByName.size !== groups.length) {
    throw new Error("自用v2：策略组名称重复。");
  }

  for (const group of groups) {
    for (const name of group.proxies) {
      if (!validNames.has(name)) {
        throw new Error("自用v2：策略组 " + group.name + " 引用了不存在的节点或分组：" + name);
      }
    }
  }

  const visited = new Set();
  const visiting = new Set();
  function visit(name) {
    if (visiting.has(name)) throw new Error("自用v2：策略组存在循环引用：" + name);
    if (visited.has(name)) return;
    visiting.add(name);
    for (const member of groupsByName.get(name).proxies) {
      if (groupsByName.has(member)) visit(member);
    }
    visiting.delete(name);
    visited.add(name);
  }
  for (const group of groups) visit(group.name);

  for (const name of Object.keys(providers)) {
    const proxy = providers[name].proxy;
    if (proxy && !validNames.has(proxy)) {
      throw new Error("自用v2：规则集 " + name + " 的下载代理不存在：" + proxy);
    }
  }

  const ruleSetPattern = /RULE-SET,([^,)]+)/g;
  for (const rule of rules) {
    // 逻辑规则（AND/OR/NOT）内部可能嵌套多个 RULE-SET，统一用正则提取。
    for (const match of rule.matchAll(ruleSetPattern)) {
      if (!Object.prototype.hasOwnProperty.call(providers, match[1])) {
        throw new Error("自用v2：规则引用了不存在的规则集：" + match[1]);
      }
    }
    const target = ruleTarget(rule);
    if (!validNames.has(target)) {
      throw new Error("自用v2：规则引用了不存在的出口：" + target);
    }
  }
}

// MATCH 只有出口；逻辑规则的出口在末尾；其余规则的出口固定在第三段，后面可能跟 no-resolve 等选项。
function ruleTarget(rule) {
  const parts = rule.split(",");
  if (parts[0] === "MATCH") return parts[1];
  if (parts[0] === "AND" || parts[0] === "OR" || parts[0] === "NOT") return parts[parts.length - 1];
  return parts[2];
}
