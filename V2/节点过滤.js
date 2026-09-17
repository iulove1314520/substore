// 精确过滤订阅说明、流量状态和联系方式等伪节点，避免误删正常线路。
/**
 * 节点过滤
 * 功能：过滤无名称项，以及订阅说明、流量信息、到期状态和联系方式等伪节点
 * 版本：2.0.0
 * 说明：
 * 1. 强特征可以直接触发过滤，例如流量数值、到期日期、网址和邮箱
 * 2. “测试、备用、Premium、学术、机场”等弱标签不会单独触发过滤
 * 3. 不修改原数组和节点对象，并保持有效节点的原始顺序
 */

const FLAG_RE = /(?:[\uD83C][\uDDE6-\uDDFF]){2}/g;
const LEADING_LABEL_RE = /^(?:(?:（[^）]*）|\([^)]*\)|【[^】]*】|\[[^\]]*\])\s*)+/;
const DECORATION_RE =
  /(?:🏴‍☠️|[\s\-_|/\\:：=·•—~～「」『』《》<>【】\[\]（）()])+/g;

const INFO_ONLY_LABELS = new Set([
  "tg",
  "telegram",
  "电报群",
  "群组",
  "交流群",
  "qq群",
  "微信群",
  "频道",
  "订阅",
  "订阅地址",
  "订阅链接",
  "订阅信息",
  "更新订阅",
  "套餐",
  "套餐信息",
  "到期",
  "到期时间",
  "有效期",
  "永久有效",
  "剩余",
  "剩余流量",
  "版本",
  "版本信息",
  "已用",
  "已用流量",
  "过期",
  "已过期",
  "失联",
  "官方",
  "官网",
  "官方网站",
  "网址",
  "备用地址",
  "客服",
  "在线客服",
  "网站",
  "获取订阅",
  "流量",
  "流量信息",
  "下次重置",
  "距离下次重置",
  "流量重置",
  "重置时间",
  "邮箱",
  "工单",
  "联系方式",
  "联系管理员",
  "机场",
  "机场公告",
  "公告",
  "通知",
  "use",
  "used",
  "total",
  "expire",
  "expiry",
  "email",
  "traffic",
  "subscription",
  "website",
  "official",
  "support",
  "channel",
  "group",
]);

const INVALID_NODE_PATTERNS = [
  // 中文或英文流量字段后带有容量或百分比，避免仅凭“流量”二字误杀。
  /(?:剩余(?:流量)?|可用(?:流量)?|已用(?:流量)?|使用(?:流量)?|总(?:流量|量)|流量(?:剩余|已用|总计|总量)?)[\s:：=\]】)）|_-]*\d+(?:[.,]\d+)?\s*(?:[KMGTPE](?:i?B)?|B|%)/i,
  /(?:traffic|used|total|remaining|remain)[\s:：=\]】)）|_-]*\d+(?:[.,]\d+)?\s*(?:[KMGTPE](?:i?B)?|B|%)/i,

  // 到期、失效和重置时间；要求出现日期、永久标记或剩余时长。
  /(?:到期(?:时间)?|过期(?:时间)?|有效期(?:至)?|失效(?:时间)?|重置(?:时间)?|下次重置)[\s:：=\]】)）|_-]*(?:20\d{2}[-/.年]\d{1,2}(?:[-/.月]\d{1,2}日?)?|永久|永不过期|never)/i,
  /(?:expire|expiry|expiration|reset)[\s:：=\]】)）|_-]*(?:20\d{2}[-/.]\d{1,2}(?:[-/.]\d{1,2})?|never)/i,
  /(?:距离)?(?:下次)?重置[^\d]*\d+(?:[.,]\d+)?\s*(?:天|小时|分鐘|分钟|days?|hours?|minutes?)/i,
  /(?:到期|过期|有效期|剩余时间)[^\d]*\d+(?:[.,]\d+)?\s*(?:天|小时|分鐘|分钟|days?|hours?|minutes?)/i,
  /(?:expires?|expiry|expiration)\s*(?:in\s*)?\d+(?:[.,]\d+)?\s*(?:days?|hours?|minutes?)/i,

  // 明确的订阅状态组合。
  /(?:订阅|套餐).*(?:到期|过期|剩余|流量|有效期|重置)/i,
  /(?:到期|过期|剩余|流量|有效期|重置).*(?:订阅|套餐)/i,
  /(?:节点|订阅).*(?:失联|失效|不可用|已过期)/i,
  /(?:失联|失效|不可用|已过期).*(?:节点|订阅)/i,
  /(?:流量|套餐|订阅|到期|重置)(?:信息|详情|狀態|状态|查询|查詢)/i,
  /^(?:version|版本)\s*[:：=]?\s*v?\d+(?:\.\d+)*$/i,
  /(?:请勿|請勿|禁止|严禁|嚴禁)(?:测速|測速|滥用|濫用)/i,

  // 联系方式和外部链接。
  /(?:https?:\/\/|www\.|t\.me\/|telegram\.me\/)/i,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  /(?:官网|网站|网址|订阅(?:地址|链接)?|客服|工单|邮箱|群组|频道)\s*[:：=]\s*\S+/i,
  /(?:官网|网站|网址|订阅(?:地址|链接)?|客服|工单|邮箱)\s*[:：=]?\s*(?:[A-Z0-9-]+\.)+[A-Z]{2,}(?:\/\S*)?/i,
  /(?:traffic|used|total|remaining|remain|expire|expiry|email|website|subscription|support)\s*[:：=]\s*\S+/i,
  /(?:TG|Telegram|QQ群|微信群).*(?:群|组|频道|channel|group|@|[:：=])/i,
];

function operator(proxies = [], targetPlatform, context) {
  void targetPlatform;
  void context;

  if (!Array.isArray(proxies)) {
    return [];
  }

  return proxies.filter((proxy) => {
    const name = normalizeProxyName(proxy);
    return Boolean(name) && !isInformationalName(name);
  });
}

function normalizeProxyName(proxy) {
  if (!proxy || typeof proxy.name !== "string") {
    return "";
  }

  let name = proxy.name.trim();
  if (!name) {
    return "";
  }

  if (typeof name.normalize === "function") {
    name = name.normalize("NFKC");
  }

  if (
    typeof ProxyUtils !== "undefined" &&
    ProxyUtils &&
    typeof ProxyUtils.removeFlag === "function"
  ) {
    name = ProxyUtils.removeFlag(name);
  }

  return name.replace(FLAG_RE, "").replace(/\s+/g, " ").trim();
}

function isInformationalName(name) {
  const candidates = getNameCandidates(name);

  for (const candidate of candidates) {
    if (INFO_ONLY_LABELS.has(normalizeInfoLabel(candidate))) {
      return true;
    }

    if (INVALID_NODE_PATTERNS.some((pattern) => pattern.test(candidate))) {
      return true;
    }
  }

  return false;
}

function getNameCandidates(name) {
  const candidates = new Set([name]);
  const withoutLeadingLabel = name.replace(LEADING_LABEL_RE, "").trim();

  if (withoutLeadingLabel && withoutLeadingLabel !== name) {
    candidates.add(withoutLeadingLabel);
  }

  for (const candidate of Array.from(candidates)) {
    const compactCandidate = candidate.replace(DECORATION_RE, "");
    if (compactCandidate) {
      candidates.add(compactCandidate);
    }
  }

  return Array.from(candidates);
}

function normalizeInfoLabel(name) {
  return name.replace(DECORATION_RE, "").replace(/\./g, "").toLowerCase();
}
