# 订阅 DNS 合并

适用于：在 Sub-Store 的单条订阅中运行节点脚本，再在文件模块选择单条或组合订阅，最后执行「自用覆写v3」。

文件以订阅为来源时，进入覆写的配置只有处理后的节点，机场原始 YAML 的 DNS 不会一起复制。本前置脚本按每条订阅分别读取原始内容，把专属 DNS 限定到对应节点的精确域名，再交给 v3。

## 设置步骤

1. 单条订阅中的过滤、中文化、排序等节点脚本照常保留。
2. 组合订阅照常选择各家机场；只有一家时可以直接使用单条订阅。
3. 文件类型选择「mihomo 配置文件」，来源继续选择需要的单条订阅或组合订阅。
4. 在文件的操作列表新增「脚本操作」，选择「本地内容」，粘贴 `订阅DNS合并.js` 的全文。
5. 把这个操作排在「自用覆写v3」之前。v3 保持 `dnsMode: "managed"`、`preservePrivateDns: true`。
6. 保存后重新预览文件，在 `dns.proxy-server-nameserver-policy` 中检查各家节点域名与 DNS 的对应关系。

脚本可选择「本地内容」粘贴全文，也可选择「远程链接」填写本仓库对应文件的 GitHub Raw 地址。

## 自动识别与手动指定

默认通过 `$file.sourceType` / `$file.sourceName` 识别文件来源。组合订阅同时处理显式选中的订阅和通过标签选中的订阅。使用单条订阅的内部名称，不使用显示名称。

如果当前后端没有给脚本提供文件来源，可以在脚本开头手动填写：

```js
const DNS_MERGE_SETTINGS = {
  subscriptions: ["鸡油", "另一家单条订阅名称", "第三家单条订阅名称"],
};
```

只填自己已有的单条订阅名称，不填 URL 或令牌。自动识别正常时保持空数组。

## 行为与限制

- 通过 `produceArtifact({ type: "subscription", produceType: "raw", includeRaw: true })` 读取原文，该路径在节点处理之前返回，不会重复执行节点脚本；下载沿用 Sub-Store 的 UA、代理和缓存机制。文件或组合设置的下载代理会作为本次读取的覆盖参数。
- 只处理最终节点列表中仍存在、且能在各家原始 YAML 的 `proxies[].server` 找到的域名。节点的名称、顺序、属性和筛选结果保持不变；IP 节点不需要 DNS 策略。
- 优先取原配置的 `proxy-server-nameserver-policy`，其次取匹配节点的 `nameserver-policy`；没有匹配策略时，只把该家配置中的非公共 DNS 分配给该家的节点。
- 输出精确域名键，不把三家专属 DNS 混成全局解析器列表；v3 可能进一步折叠同 DNS 的域名键。
- 同一节点域名对应不同 DNS、与文件已有精确策略冲突、原文读取失败或损坏时明确报错。多机场输入已经含有全局专属 DNS 时也会拒绝继续，避免 v3 将其套给其他节点。
- 节点脚本若改写了 `server`，未能对应原域名的节点不会猜测 DNS，日志会提示数量；此类节点需要额外明确映射。这里只匹配节点服务器域名，不使用节点名称或 TLS SNI 猜测来源。
- 原订阅需要提供含 DNS 的 Clash/mihomo YAML（也可为同结构 JSON）。URI/base64 订阅无法恢复其未包含的 DNS；只有 `proxy-providers`、没有展开节点域名的原配置也无法自动建立对应关系。
- 依赖后端支持 `includeRaw` 原文返回。旧后端只返回转换后文本时会明确提示更新，不会把已经丢失 DNS 的预处理结果当作原文使用。
- 脚本不保存订阅原文、URL、令牌或节点凭据；自己的摘要日志只包含订阅数量、域名数量，不包含 DNS 地址。Sub-Store 自身的下载日志遵循其后端实现。

## 本地验证

```powershell
npm ci
npm test
```

从仓库根目录执行，测试所需的 `yaml` 开发依赖由 package-lock.json 锁定。测试通过模拟原文接口验证三机场隔离、组合标签、节点过滤、策略优先级、冲突和失败路径，并把合并结果交给真实 v3。实际 Sub-Store 后端和机场 DNS 连通性仍需在预览及客户端中确认。

## 接口依据

- [Sub-Store 文件脚本](https://sub-store-org.github.io/doc/file/scripts)
- [订阅原始内容返回与节点处理顺序](https://github.com/sub-store-org/Sub-Store/blob/master/backend/src/restful/sync.js)
- [文件脚本的 main(config) 执行入口](https://github.com/sub-store-org/Sub-Store/blob/master/backend/src/core/proxy-utils/processors/index.js)
- [Mihomo 节点域名 DNS 策略](https://wiki.metacubex.one/config/dns/#proxy-server-nameserver-policy)
