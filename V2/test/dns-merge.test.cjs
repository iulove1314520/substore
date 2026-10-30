const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// 优先使用仓库自身的开发依赖；相邻工具目录作为本机已有依赖的兼容回退。
const yamlPath = require.resolve("yaml", {
  paths: [__dirname, path.resolve(__dirname, "../../../工具")],
});
const YAML = require(yamlPath);
const helperCode = fs.readFileSync(path.join(__dirname, "../订阅DNS合并.js"), "utf8");
const v3Code = fs.readFileSync(path.join(__dirname, "../自用覆写v3.js"), "utf8");
const clone = (value) => JSON.parse(JSON.stringify(value));
const node = (name, server) => ({ name: name, type: "socks5", server: server, port: 1080 });
const privateDns = (name) => "https://resolver." + name + ".example/dns-query";

function createRuntime({ originals, file, collections = [], subs = [], produce, settings } = {}) {
  const requests = [];
  const messages = [];
  const context = vm.createContext({
    $file: file || { type: "mihomoConfig", sourceType: "subscription", sourceName: "A" },
    $substore: {
      read: (key) => ({ collections: collections, subs: subs })[key],
      info: (message) => messages.push(message),
    },
    ProxyUtils: { yaml: { safeLoad: (text) => YAML.parse(text) } },
    produceArtifact: async (options) => {
      requests.push(clone(options));
      if (produce) return produce(options);
      return { result: "[预处理后的内容]", raw: originals[options.name].map((value) => YAML.stringify(value)) };
    },
  });
  vm.runInContext(helperCode, context);
  if (settings) {
    context.settings = settings;
    vm.runInContext("DNS_MERGE_SETTINGS.subscriptions = settings", context);
  }
  return { run: (config) => context.main(config), requests: requests, messages: messages };
}

function runV3(config) {
  const context = vm.createContext({ input: config });
  vm.runInContext(v3Code, context);
  return vm.runInContext("main(input)", context, { timeout: 5000 });
}

test("三机场：保留已处理节点，并让 v3 输出各家对应 DNS", async () => {
  const proxies = [node("香港-已中文化-A", "hk.a.example"), node("日本-已排序-B", "jp.b.example"), node("美国-C", "us.c.example")];
  const originals = {
    A: [{ proxies: [node("rawA", "hk.a.example")], dns: { "proxy-server-nameserver": [privateDns("a")] } }],
    B: [{ proxies: [node("rawB", "jp.b.example")], dns: { "nameserver-policy": { "*.b.example": privateDns("b") } } }],
    C: [{ proxies: [node("rawC", "us.c.example")], dns: { nameserver: ["223.5.5.5", privateDns("c")] } }],
  };
  const input = { proxies: proxies, tun: { enable: true } };
  const snapshot = clone(input);
  assert.equal(runV3(input).dns["proxy-server-nameserver-policy"], undefined, "原流程确实丢失专属 DNS");
  const runtime = createRuntime({ originals: originals, file: { sourceType: "collection", sourceName: "三家" }, collections: [{ name: "三家", subscriptions: ["A", "B", "C"] }] });
  const merged = await runtime.run(input);
  const output = runV3(merged);
  const policy = output.dns["proxy-server-nameserver-policy"];
  for (const [domain, name] of [["hk.a.example", "a"], ["jp.b.example", "b"], ["us.c.example", "c"]]) assert.deepEqual(clone(policy[domain]), [privateDns(name)]);
  assert.deepEqual(clone(output.proxies), proxies);
  assert.deepEqual(input, snapshot);
  assert.strictEqual(merged.proxies, input.proxies);
  assert.deepEqual(clone(output.tun), input.tun);
  assert.equal(runtime.requests.length, 3);
  assert.ok(runtime.requests.every((request) => request.produceType === "raw" && request.includeRaw && request.ignoreFailedRemoteSub === "disabled"));
  assert.equal(merged.dns.nameserver, undefined, "不创建跨机场的全局专属 DNS 列表");
  assert.equal(merged.dns["proxy-server-nameserver"], undefined);
  assert.deepEqual(YAML.parse(YAML.stringify({ dns: output.dns })), clone({ dns: output.dns }));
});

test("只为保留下来的节点建立策略，忽略 IP 节点", async () => {
  const runtime = createRuntime({ originals: { A: [{ proxies: [node("keep", "HK.A.EXAMPLE."), node("filtered", "us.a.example"), node("ip", "192.0.2.1")], dns: { "proxy-server-nameserver": privateDns("a") } }] } });
  const output = await runtime.run({ proxies: [node("renamed", "hk.a.example"), node("ip", "192.0.2.1")] });
  assert.deepEqual(Object.keys(output.dns["proxy-server-nameserver-policy"]), ["hk.a.example"]);
});

test("同一个节点域名对应不同机场 DNS 时明确报错，不改变输入", async () => {
  const proxies = [node("shared", "shared.example")];
  const runtime = createRuntime({ originals: Object.fromEntries(["A", "B"].map((name) => [name, [{ proxies: proxies, dns: { "proxy-server-nameserver": privateDns(name.toLowerCase()) } }]])), settings: ["A", "B"] });
  const input = { proxies: proxies };
  await assert.rejects(runtime.run(input), /对应不同 DNS/);
  assert.deepEqual(input, { proxies: proxies });
});

test("订阅标签与显式来源合并，重复名称只读取一次，并继承组合下载代理", async () => {
  const original = { proxies: [node("hk", "hk.a.example")], dns: { "proxy-server-nameserver": privateDns("a") } };
  const runtime = createRuntime({
    originals: { A: [original], B: [original] },
    file: { sourceType: "collection", sourceName: "标签组合" },
    collections: [{ name: "标签组合", subscriptions: ["A"], subscriptionTags: ["选中"], proxy: "DIRECT" }],
    subs: [{ name: "A", tag: ["选中"] }, { name: "B", tag: ["选中"] }, { name: "C", tag: ["不选"] }],
  });
  await runtime.run({ proxies: original.proxies });
  assert.deepEqual(runtime.requests.map((request) => request.name), ["A", "B"]);
  assert.ok(runtime.requests.every((request) => request.proxy === "DIRECT"));
});

test("同一订阅有多个原始 YAML 时逐份对应 DNS，不混用", async () => {
  const proxies = [node("hk", "hk.a.example"), node("jp", "jp.b.example")];
  const runtime = createRuntime({ originals: { A: [
    { proxies: [proxies[0]], dns: { "proxy-server-nameserver": privateDns("a") } },
    { proxies: [proxies[1]], dns: { "proxy-server-nameserver": privateDns("b") } },
  ] } });
  const policy = (await runtime.run({ proxies: proxies })).dns["proxy-server-nameserver-policy"];
  assert.deepEqual(clone(policy["hk.a.example"]), [privateDns("a")]);
  assert.deepEqual(clone(policy["jp.b.example"]), [privateDns("b")]);
});

test("节点策略优先于普通策略，同表精确域名优先于后缀", async () => {
  const proxies = [node("hk", "hk.a.example")];
  const runtime = createRuntime({ originals: { A: [{ proxies: proxies, dns: {
    "proxy-server-nameserver-policy": { "+.a.example": privateDns("general"), ".a.example": privateDns("overlap"), "hk.a.example": privateDns("exact") },
    "nameserver-policy": { "hk.a.example": privateDns("other") },
  } }] } });
  assert.deepEqual(clone((await runtime.run({ proxies: proxies })).dns["proxy-server-nameserver-policy"]["hk.a.example"]), [privateDns("exact")]);
});

test("逗号域名键有效，清理旧策略组后缀，保留 DIRECT", async () => {
  const proxies = [node("hk", "hk.a.example")];
  const runtime = createRuntime({ originals: { A: [{ proxies: proxies, dns: {
    "nameserver-policy": { "unused.example, *.a.example": [privateDns("a") + "#旧分组", privateDns("b") + "#直连"] },
  } }] } });
  assert.deepEqual(clone((await runtime.run({ proxies: proxies })).dns["proxy-server-nameserver-policy"]["hk.a.example"]), [privateDns("a"), privateDns("b") + "#DIRECT"]);
});

test("公共 DNS 和本机监听不作为专属 DNS，IP 边界不会误伤私有地址", async () => {
  const proxies = [node("hk", "hk.a.example")];
  const runtime = createRuntime({ originals: { A: [{ proxies: proxies, dns: {
    listen: "0.0.0.0:1053",
    nameserver: ["223.5.5.5", "https://dns.google/dns-query", "system", "dhcp://en0", "rcode://success", "127.0.0.1:1053", "11.1.1.1"],
  } }] } });
  assert.deepEqual(clone((await runtime.run({ proxies: proxies })).dns["proxy-server-nameserver-policy"]["hk.a.example"]), ["11.1.1.1"]);
});

test("后端不支持 includeRaw、下载失败、空原文和损坏 YAML 均报错", async () => {
  const input = { proxies: [node("hk", "hk.a.example")] };
  for (const [produce, message] of [
    [async () => "[]", /includeRaw/],
    [async () => { throw new Error("https://private.example/SECRET_TOKEN"); }, /读取单条订阅/],
    [async () => ({ raw: [""] }), /空原始内容/],
    [async () => ({ raw: ["dns: [\nSECRET_TOKEN"] }), /YAML 无法解析/],
  ]) {
    const runtime = createRuntime({ produce: produce });
    await assert.rejects(runtime.run(input), (error) => message.test(error.message) && !error.message.includes("SECRET_TOKEN"));
  }
  assert.equal(input.dns, undefined);
});

test("URI 订阅不推断 DNS；改写 server 的域名不会错误继承其他机场 DNS", async () => {
  const runtime = createRuntime({ produce: async () => ({ raw: ["ss://fixture", YAML.stringify({ proxies: [node("raw", "hk.a.example")], dns: { "proxy-server-nameserver": privateDns("a") } })] }) });
  const input = { proxies: [node("changed", "changed.example")] };
  assert.strictEqual(await runtime.run(input), input);
  assert.ok(runtime.messages.some((message) => message.includes("1 个最终节点域名")));
});

test("拒绝覆盖文件已有冲突策略，以及多机场全局专属 DNS", async () => {
  const proxies = [node("hk", "hk.a.example")];
  const original = { proxies: proxies, dns: { "proxy-server-nameserver": privateDns("a") } };
  const runtime = createRuntime({ originals: { A: [original] } });
  await assert.rejects(runtime.run({ proxies: proxies, dns: { "proxy-server-nameserver-policy": { "hk.a.example": privateDns("other") } } }), /已有 DNS 策略冲突/);
  const collection = createRuntime({ originals: { A: [original], B: [original] }, settings: ["A", "B"] });
  await assert.rejects(collection.run({ proxies: proxies, dns: { nameserver: [privateDns("a")] } }), /全局专属 DNS/);
});

test("没有来源时明确提示，支持手动指定单条订阅名称", async () => {
  const input = { proxies: [node("hk", "hk.a.example")] };
  await assert.rejects(createRuntime({ file: {} }).run(input), /来源请选择/);
  const original = { proxies: input.proxies, dns: { "proxy-server-nameserver": privateDns("a") } };
  const output = await createRuntime({ file: {}, originals: { A: [original] }, settings: ["A"] }).run(input);
  assert.ok(output.dns["proxy-server-nameserver-policy"]["hk.a.example"]);
});
