// 安卓 App 里的网络请求：交给原生（不受跨域限制），回调 window.__momoHttpDone。没有原生桥时退回 fetch（方便在浏览器里调试）。
class NetError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}
const pending = new Map();
let seq = 0;
window.__momoHttpDone = (id, json) => {
  const p = pending.get(id);
  if (!p) return;
  pending.delete(id);
  let r;
  try { r = typeof json === "string" ? JSON.parse(json) : json; } catch { r = { error: "原生返回格式错误" }; }
  if (r.error) p.reject(new NetError(r.error, r.code || (/timeout|timed out/i.test(r.error) ? "TIMEOUT" : "")));
  else p.resolve({ status: r.status, ok: r.status >= 200 && r.status < 300, text: r.text || "" });
};

async function request(url, { method = "GET", headers = {}, body, timeoutMs = 30000 } = {}) {
  const bridge = window.MomoAndroid;
  if (bridge && bridge.httpStart) {
    const id = ++seq;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      bridge.httpStart(id, JSON.stringify({ url: String(url), method, headers, body: body == null ? null : String(body), timeoutMs }));
    });
  }
  let res;
  try {
    res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    if (e.name === "TimeoutError") throw new NetError("请求超时", "TIMEOUT");
    throw new NetError(e.message || "网络错误");
  }
  return { status: res.status, ok: res.ok, text: await res.text() };
}

module.exports = { request, resolveProxy: () => null, maskProxy: () => "直连", NetError };
