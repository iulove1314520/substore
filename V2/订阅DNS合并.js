/**
 * Sub-Store 文件前置脚本：从原始订阅恢复各家节点的专属 DNS。
 * 文件来源继续选择单条订阅或组合订阅，本脚本放在「自用覆写v3」之前。
 * 只补充精确节点域名的 proxy-server-nameserver-policy，不重新执行节点脚本。
 * 依赖 Sub-Store 的 $file、$substore.read 和 produceArtifact({ includeRaw: true })。
 */
const DNS_MERGE_SETTINGS = {
  // 通常留空，自动读取文件所选来源；手动指定时填写单条订阅的内部名称。
  subscriptions: [],
};

// 与自用覆写v3保持一致：公共 DNS 不作为机场专属 DNS 继承。
const DNS_MERGE_PUBLIC_MARKERS = [
  "223.5.5.5", "223.6.6.6", "119.29.29.29", "1.12.12.12", "120.53.53.53",
  "114.114.114.114", "180.76.76.76", "1.2.4.8", "116.116.116.116", "101.226.4.6",
  "123.125.81.6", "180.184.1.1", "180.184.2.2",
  "2400:3200::1", "2400:3200:baba::1", "2402:4e00::", "2400:da00::6666",
  "1.1.1.1", "1.0.0.1", "8.8.8.8", "8.8.4.4", "9.9.9.9", "149.112.112.112",
  "208.67.222.222", "208.67.220.220", "94.140.14.14", "94.140.15.15",
  "76.76.2.0", "76.76.10.0", "185.228.168.9", "185.228.169.9", "77.88.8.8", "77.88.8.1",
  "156.154.70.1", "156.154.71.1", "2606:4700:4700::1111", "2606:4700:4700::1001",
  "2001:4860:4860::8888", "2001:4860:4860::8844", "2620:fe::fe", "2620:fe::9",
  "2620:119:35::35", "2620:119:53::53", "2a10:50c0::bad1:ff", "2a10:50c0::ad1:ff",
  "2a10:50c0::bad2:ff", "2a10:50c0::ad2:ff", "2a0d:2a00:1::2", "2a0d:2a00:2::2",
  "2a02:6b8::feed:0ff", "2a02:6b8:0:1::feed:0ff", "2610:a1:1018::1", "2610:a1:1019::1",
  "alidns", "doh.pub", "dot.pub", "dns.pub", "dnspod", "dns.baidu", "dns.google",
  "dns.cloudflare", "dns.apple", "cloudflare-dns", "quad9", "opendns", "nextdns",
  "adguard", "one.one.one.one",
];
const DNS_MERGE_PUBLIC_REGEX = new RegExp(DNS_MERGE_PUBLIC_MARKERS.map((marker) => {
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (/^\d+(?:\.\d+){3}$/.test(marker)) return "(?:^|[^\\d.])" + escaped + "(?=$|[^\\d.])";
  if (marker.includes(":")) return "(?:^|[^0-9a-f:])" + escaped + "(?=$|[^0-9a-f:])";
  return escaped;
}).join("|"), "i");

async function main(config) {
  if (!dnsMergeIsObject(config) || !Array.isArray(config.proxies)) {
    throw new Error("DNS合并：请在已有节点的 mihomo 配置文件中使用。");
  }
  const file = typeof $file === "object" && $file ? $file : {};
  const source = dnsMergeSources(file);
  const finalDomains = dnsMergeDomains(config.proxies);
  const tracedDomains = new Set();
  const assignments = new Map();

  for (const name of source.names) {
    let artifact;
    try {
      artifact = await produceArtifact({
        type: "subscription", name: name, platform: "mihomo", produceType: "raw",
        includeRaw: true, noFlow: true, ignoreFailedRemoteSub: "disabled",
        proxy: file.proxy || source.proxy,
      });
    } catch (error) {
      // 底层异常可能包含带令牌的 URL，向外只报告订阅名称。
      throw new Error("DNS合并：读取单条订阅「" + name + "」的原始内容失败，请检查来源和后端日志。");
    }
    if (!dnsMergeIsObject(artifact) || !Array.isArray(artifact.raw)) {
      throw new Error("DNS合并：当前 Sub-Store 未返回原始内容（includeRaw），请更新后端后重试。");
    }
    if (artifact.raw.length === 0 || artifact.raw.some((raw) => typeof raw !== "string" || !raw.trim())) {
      throw new Error("DNS合并：单条订阅「" + name + "」返回了空原始内容，未继续生成配置。");
    }
    for (let index = 0; index < artifact.raw.length; index += 1) {
      const raw = artifact.raw[index].replace(/^\uFEFF/, "");
      // URI/base64 节点订阅没有 YAML DNS；不把它们当成损坏的 Clash 配置。
      if (!/(?:^|\n)(?:dns|proxies|proxy-providers)\s*:/.test(raw) && !raw.trim().startsWith("{")) continue;
      let original;
      try {
        original = ProxyUtils.yaml.safeLoad(raw);
      } catch (error) {
        throw new Error("DNS合并：单条订阅「" + name + "」第 " + (index + 1) + " 份原始配置的 YAML 无法解析。");
      }
      if (!dnsMergeIsObject(original)) continue;
      const domains = dnsMergeDomains(original.proxies);
      const dns = dnsMergeIsObject(original.dns) ? original.dns : {};
      for (const domain of domains) {
        if (!finalDomains.has(domain)) continue;
        tracedDomains.add(domain);
        const resolvers = dnsMergeResolvers(dns, domain);
        if (resolvers.length === 0) continue;
        const previous = assignments.get(domain);
        if (previous && dnsMergeKey(previous.resolvers) !== dnsMergeKey(resolvers)) {
          throw new Error("DNS合并：节点域名 " + domain + " 在「" + previous.name + "」与「" + name + "」中对应不同 DNS，无法按域名区分。");
        }
        assignments.set(domain, { name: name, resolvers: resolvers });
      }
    }
  }

  const currentDns = dnsMergeIsObject(config.dns) ? config.dns : {};
  // v3 会把输入中的全局专属 DNS 补给所有未匹配节点；多机场时拒绝这种不明确的输入。
  if (source.names.length > 1 && dnsMergePrivateResolvers(currentDns).length > 0) {
    throw new Error("DNS合并：输入已有全局专属 DNS，请移除前置操作写入的全局专属 DNS，仅保留按域名限定的策略。");
  }
  const policy = Object.assign({}, currentDns["proxy-server-nameserver-policy"] || {});
  for (const [domain, assignment] of assignments) {
    if (Object.prototype.hasOwnProperty.call(policy, domain) && dnsMergeKey(dnsMergeNormalize(policy[domain])) !== dnsMergeKey(assignment.resolvers)) {
      throw new Error("DNS合并：节点域名 " + domain + " 与文件已有 DNS 策略冲突，未覆盖原配置。");
    }
    policy[domain] = assignment.resolvers;
  }
  const untraced = Array.from(finalDomains).filter((domain) => !tracedDomains.has(domain)).length;
  if (untraced > 0) {
    $substore.info("DNS合并：有 " + untraced + " 个最终节点域名未在原 YAML 中找到，未推断其专属 DNS；请检查节点脚本是否改写了 server。");
  }
  $substore.info("DNS合并：已检查 " + source.names.length + " 条订阅，为 " + assignments.size + " 个节点域名恢复 DNS 策略。");
  if (assignments.size === 0) return config;
  return Object.assign({}, config, {
    dns: Object.assign({}, currentDns, { "proxy-server-nameserver-policy": policy }),
  });
}

function dnsMergeSources(file) {
  let names = DNS_MERGE_SETTINGS.subscriptions.slice();
  let proxy;
  if (names.length === 0 && file.sourceName) {
    if (file.sourceType === "subscription") {
      names = [file.sourceName];
    } else if (!file.sourceType || file.sourceType === "collection") {
      const collections = $substore.read("collections") || [];
      const collection = collections.find((item) => item.name === file.sourceName);
      if (!collection) throw new Error("DNS合并：找不到文件所选的组合订阅，请检查来源名称。");
      names = (collection.subscriptions || []).slice();
      proxy = collection.proxy;
      const tags = collection.subscriptionTags || [];
      if (tags.length > 0) {
        for (const sub of $substore.read("subs") || []) {
          if (Array.isArray(sub.tag) && sub.tag.some((tag) => tags.includes(tag))) names.push(sub.name);
        }
      }
    }
  }
  names = Array.from(new Set(names.filter((name) => typeof name === "string" && name.length > 0)));
  if (names.length === 0) {
    throw new Error("DNS合并：文件来源请选择单条订阅或组合订阅；也可在 subscriptions 数组中填写单条订阅内部名称。");
  }
  return { names: names, proxy: proxy };
}

function dnsMergeDomains(proxies) {
  const domains = new Set();
  for (const proxy of Array.isArray(proxies) ? proxies : []) {
    if (!proxy || typeof proxy.server !== "string") continue;
    const domain = proxy.server.trim().replace(/\.$/, "").toLowerCase();
    if (domain && !domain.includes(":") && !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(domain)) domains.add(domain);
  }
  return domains;
}

function dnsMergeResolvers(dns, domain) {
  // 节点专用策略优先于普通策略；同一策略表里优先选择更具体的域名。
  for (const key of ["proxy-server-nameserver-policy", "nameserver-policy"]) {
    let selected = [];
    let selectedScore = -1;
    let ambiguous = false;
    for (const [pattern, value] of Object.entries(dnsMergeIsObject(dns[key]) ? dns[key] : {})) {
      const score = dnsMergeMatchScore(pattern, domain);
      const resolvers = dnsMergeNormalize(value);
      if (score < 0 || resolvers.length === 0) continue;
      if (score > selectedScore) {
        selected = resolvers;
        selectedScore = score;
        ambiguous = false;
      } else if (score === selectedScore && dnsMergeKey(selected) !== dnsMergeKey(resolvers)) {
        ambiguous = true;
      }
    }
    if (ambiguous) throw new Error("DNS合并：节点域名 " + domain + " 匹配到优先级相同、DNS 不同的策略，请先明确原订阅规则。");
    if (selected.length > 0) return selected;
  }
  return dnsMergePrivateResolvers(dns);
}

function dnsMergePrivateResolvers(dns) {
  const values = dnsMergeNormalize([].concat(dns.nameserver || [], dns["proxy-server-nameserver"] || []));
  return values.filter((value) => {
    const lower = value.toLowerCase();
    return !DNS_MERGE_PUBLIC_REGEX.test(lower) &&
      !/^(?:system(?::\/\/)?|dhcp:\/\/.*|rcode:\/\/.*)$/.test(lower) &&
      !/(?:127\.0\.0\.1|localhost|\[::1\])/.test(lower) &&
      !(typeof dns.listen === "string" && dns.listen && lower.includes(dns.listen.toLowerCase()));
  });
}

function dnsMergeMatchScore(pattern, domain) {
  let best = -1;
  for (const part of pattern.toLowerCase().split(",").map((item) => item.trim())) {
    let matched;
    let priority = 0;
    if (part.startsWith("+.")) {
      const suffix = part.slice(2);
      matched = domain === suffix || domain.endsWith("." + suffix);
    } else if (part.startsWith(".")) {
      matched = domain !== part.slice(1) && domain.endsWith(part);
    } else if (part.includes("*")) {
      const labels = part.split(".");
      const domainLabels = domain.split(".");
      matched = labels.length === domainLabels.length && labels.every((label, index) => label === "*" || label === domainLabels[index]);
      priority = 1;
    } else {
      matched = part === domain;
      priority = 2;
    }
    if (matched) best = Math.max(best, part.split(".").filter((label) => label && label !== "+" && label !== "*").length * 10 + priority);
  }
  return best;
}

function dnsMergeNormalize(value) {
  const values = Array.isArray(value) ? value : [value];
  return Array.from(new Set(values.filter((item) => typeof item === "string").map((item) => {
    const text = item.trim();
    const index = text.indexOf("#");
    if (index < 0) return text;
    return text.slice(0, index).trim() + (/direct|直连/i.test(text.slice(index + 1)) ? "#DIRECT" : "");
  }).filter(Boolean)));
}

function dnsMergeKey(values) {
  return JSON.stringify(values.slice().sort());
}

function dnsMergeIsObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
