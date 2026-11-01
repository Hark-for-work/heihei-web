// HTTP 请求：默认直连（Node fetch 不读系统代理）；可选走 HTTP 代理（支持 http / https 目标，https 走 CONNECT 隧道）。
// proxy 取值："" / "direct" = 直连；"env" = 读 HTTPS_PROXY / HTTP_PROXY 环境变量；或代理地址如 http://127.0.0.1:7890
const http = require("node:http");
const https = require("node:https");
const tls = require("node:tls");
const { URL } = require("node:url");

class NetError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

function resolveProxy(proxy) {
  const p = String(proxy || "").trim();
  if (!p || p === "direct") return null;
  if (p === "env") {
    const env = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || process.env.ALL_PROXY || process.env.all_proxy;
    if (!env) throw new NetError("选择了「跟随环境变量」，但没有设置 HTTPS_PROXY / HTTP_PROXY", "NO_ENV_PROXY");
    return resolveProxy(env);
  }
  let u;
  try { u = new URL(/^[a-z]+:\/\//i.test(p) ? p : `http://${p}`); } catch { throw new NetError(`代理地址无效：${p}`, "BAD_PROXY"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new NetError("目前只支持 HTTP 代理（Clash / v2rayN 的 HTTP 端口，如 http://127.0.0.1:7890）", "BAD_PROXY");
  return u;
}

function maskProxy(u) {
  return u ? `${u.protocol}//${u.hostname}:${u.port || 80}` : "直连";
}

function proxyAuth(u) {
  if (!u.username) return {};
  const cred = `${decodeURIComponent(u.username)}:${decodeURIComponent(u.password || "")}`;
  return { "Proxy-Authorization": `Basic ${Buffer.from(cred).toString("base64")}` };
}

function viaProxy(target, proxyUrl, { method, headers, body, timeoutMs }) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn, v) => { if (!done) { done = true; clearTimeout(timer); fn(v); } };
    const fail = (e) => finish(reject, e instanceof NetError ? e : new NetError(e.message || e.code || "网络错误", e.code));
    const timer = setTimeout(() => { fail(new NetError("请求超时", "TIMEOUT")); req?.destroy(); }, timeoutMs);
    const pPort = Number(proxyUrl.port || (proxyUrl.protocol === "https:" ? 443 : 80));
    const pMod = proxyUrl.protocol === "https:" ? https : http;
    const payload = body == null ? null : Buffer.from(body);
    const hdrs = { ...headers, Host: target.host };
    if (payload) hdrs["Content-Length"] = payload.length;
    let req;

    const onResponse = (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => finish(resolve, { status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, text: Buffer.concat(chunks).toString("utf8") }));
      res.on("error", fail);
    };

    if (target.protocol === "http:") {
      req = pMod.request({ host: proxyUrl.hostname, port: pPort, method, path: target.href, headers: { ...hdrs, ...proxyAuth(proxyUrl) } }, onResponse);
      req.on("error", (e) => fail(new NetError(`代理连接失败（${maskProxy(proxyUrl)}）：${e.code || e.message}`, e.code)));
      return req.end(payload || undefined);
    }

    const tPort = Number(target.port || 443);
    const connect = pMod.request({ host: proxyUrl.hostname, port: pPort, method: "CONNECT", path: `${target.hostname}:${tPort}`, headers: { Host: `${target.hostname}:${tPort}`, ...proxyAuth(proxyUrl) } });
    connect.on("connect", (res, socket) => {
      if (res.statusCode !== 200) { socket.destroy(); return fail(new NetError(`代理拒绝隧道（HTTP ${res.statusCode}）`, "PROXY_REFUSED")); }
      const secure = tls.connect({ socket, servername: target.hostname });
      secure.on("error", fail);
      req = http.request({
        host: target.hostname, port: tPort, method, path: target.pathname + target.search, headers: hdrs,
        createConnection: () => secure,
      }, onResponse);
      req.on("error", fail);
      req.end(payload || undefined);
    });
    connect.on("error", (e) => fail(new NetError(`代理连接失败（${maskProxy(proxyUrl)}）：${e.code || e.message}`, e.code)));
    connect.end();
  });
}

// 返回 { status, ok, text }
async function request(url, { method = "GET", headers = {}, body, timeoutMs = 30000, proxy } = {}) {
  const proxyUrl = resolveProxy(proxy);
  const target = new URL(url);
  if (proxyUrl) return viaProxy(target, proxyUrl, { method, headers, body, timeoutMs });
  let res;
  try {
    res = await fetch(target, { method, headers, body, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    if (e.name === "TimeoutError") throw new NetError("请求超时", "TIMEOUT");
    const code = e.cause?.code || e.cause?.message || e.message;
    throw new NetError(String(code), e.cause?.code);
  }
  return { status: res.status, ok: res.ok, text: await res.text() };
}

module.exports = { request, resolveProxy, maskProxy, NetError };
