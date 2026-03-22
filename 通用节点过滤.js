/**
 * 通用节点过滤
 * 功能：过滤订阅说明、流量信息、客服信息等非有效节点
 */

const INVALID_NODE_PATTERN =
  /(?:\W|^)(频道|订阅|套餐|到期|有效|剩余|版本|已用|过期|失联|测试|官方|网址|备用|群|客服|网站|获取|流量|机场|下次|官|系|邮箱|工单|学术|USE|USED|TOTAL|EXPIRE|EMAIL|Traffic)(?:\W|$)/i;

function operator(proxies = [], targetPlatform, context) {
  void targetPlatform;
  void context;

  if (!Array.isArray(proxies)) {
    return [];
  }

  return proxies.filter((proxy) => {
    const name = normalizeProxyName(proxy);
    if (!name) {
      return true;
    }

    return !INVALID_NODE_PATTERN.test(name);
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

  if (typeof ProxyUtils !== "undefined" && typeof ProxyUtils.removeFlag === "function") {
    name = ProxyUtils.removeFlag(name);
  }

  return name.replace(/\s+/g, " ").trim();
}
