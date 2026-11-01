// momo-web 本地服务（基于 MoBeiDanCi 二改）：托管页面、代理墨墨开放 API、调用本地模型、写 SQLite。
//
// 启动：npm start              （默认 http://127.0.0.1:8765）
//       node server.js --port 9000 --db data/momo.db --open --auto-exit
//
// 只用 Node 自带模块（Node ≥ 22.13），无需 npm install。
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error(`需要 Node.js 22.13 或更高版本（当前 ${process.version}）。请到 https://nodejs.org 安装 LTS 版。`);
  process.exit(1);
}

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFile } = require("node:child_process");
const { URL } = require("node:url");

const { DB } = require("./lib/db");
const momo = require("./lib/momo");
const llm = require("./lib/llm");
const gen = require("./lib/generator");
const dict = require("./lib/dict");
const { createApi, ApiError } = require("./lib/api");
const { createBackup } = require("./lib/backup");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : fallback;
}

const HOST = arg("host", process.env.HOST || "127.0.0.1");
const PORT = Number(arg("port", process.env.PORT || 8765));
// 数据默认放在用户目录（如 C:\Users\你\黑黑看单词数据），和程序文件夹分开：更新时删掉旧程序也不会丢数据。
// 改名前的旧目录（墨墨看单词数据）若存在且新目录还没有，就继续用旧目录，避免升级后"数据不见了"。
const DEFAULT_DATA_DIR = (() => {
  const nu = path.join(os.homedir(), "黑黑看单词数据"), old = path.join(os.homedir(), "墨墨看单词数据");
  try { if (!fs.existsSync(nu) && fs.existsSync(old)) return old; } catch {}
  return nu;
})();
const DATA_DIR = arg("data", process.env.MOMO_DATA || DEFAULT_DATA_DIR);
const DB_FILE = arg("db", process.env.MOMO_DB || path.join(DATA_DIR, "momo.db"));
(function migrateLegacyData() {
  const legacy = path.join(__dirname, "data");
  if (arg("db") || process.env.MOMO_DB || fs.existsSync(DB_FILE) || !fs.existsSync(path.join(legacy, "momo.db"))) return;
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  for (const f of ["momo.db", "momo.db-wal", "momo.db-shm", "settings.json", "backup.json"]) {
    const from = path.join(legacy, f);
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(path.dirname(DB_FILE), f));
  }
  console.log(`已把旧数据从 ${legacy} 复制到 ${path.dirname(DB_FILE)}`);
})();
const PUBLIC_DIR = path.join(__dirname, "public");

const db = new DB(DB_FILE);
const api = createApi({ db, momo, llm, gen, dict });
const { today } = api;
const backup = createBackup({ db, file: path.join(path.dirname(DB_FILE), "backup.json"), getSettings: () => readSettings() });

// 监听 0.0.0.0 时，列出本机局域网地址，方便手机访问
const LAN_MODE = HOST === "0.0.0.0" || HOST === "::";
function lanUrls() {
  if (!LAN_MODE) return [];
  const urls = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    if (/vethernet|virtualbox|vmware|docker|wsl|loopback|tailscale|zerotier/i.test(name)) continue;
    for (const a of list || []) {
      if (a.family !== "IPv4" && a.family !== 4) continue;
      if (a.internal || a.address.startsWith("169.254.")) continue;
      urls.push(`http://${a.address}:${PORT}`);
    }
  }
  return urls;
}

// ---------------------------------------------------------------- 多设备同步设置（含 Token / Key）
// 存在数据库旁边的 settings.json（data/ 已被 .gitignore 忽略），只给本机和内网/虚拟组网设备读写。
const SETTINGS_FILE = path.join(path.dirname(DB_FILE), "settings.json");
function readSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")); } catch { return { settings: null, updatedAt: 0 }; }
}
// 「空白设置」：没有墨墨 Token，模型也都没填 Key/地址（新设备的默认值）
function blankSettings(st) {
  if (!st || typeof st !== "object") return true;
  const profiles = Array.isArray(st.profiles) ? st.profiles : [];
  return !st.token && profiles.every((p) => !p || (!p.apiKey && !p.baseUrl));
}
function writeSettings(obj) {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  if (fs.existsSync(SETTINGS_FILE)) { try { fs.copyFileSync(SETTINGS_FILE, SETTINGS_FILE + ".prev"); } catch { /* 忽略 */ } }
  const tmp = SETTINGS_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj), { mode: 0o600 });
  fs.renameSync(tmp, SETTINGS_FILE);
}

// 只允许本机、局域网和常见虚拟组网网段（EasyTier / ZeroTier / Tailscale 等）访问
function isPrivateAddr(addr = "") {
  const a = addr.replace(/^::ffff:/, "");
  if (a === "::1" || a.startsWith("127.")) return true;
  if (/^(10\.|192\.168\.|169\.254\.)/.test(a)) return true;
  let m = a.match(/^172\.(\d+)\./); if (m && +m[1] >= 16 && +m[1] <= 31) return true;
  m = a.match(/^100\.(\d+)\./); if (m && +m[1] >= 64 && +m[1] <= 127) return true;
  return /^f[cd][0-9a-f]{2}:/i.test(a) || /^fe80:/i.test(a);
}

// ---------------------------------------------------------------- 关闭网页后自动退出（--auto-exit）
// 页面每 15 秒发一次心跳；关闭页面时发 bye。没有页面在线、也没有进行中的请求时退出。
const AUTO_EXIT = process.argv.includes("--auto-exit");
const HEARTBEAT_TIMEOUT = 75 * 1000;  // 后台标签页的定时器可能被浏览器降到每分钟一次
const BYE_GRACE = 8 * 1000;           // 刷新页面时 bye 之后马上会有新心跳
const FIRST_VISIT_TIMEOUT = 3 * 60 * 1000;
const clients = new Map();
const startedAt = Date.now();
let everSeen = false;
let inflight = 0;
let lastBye = 0;

function maybeExit() {
  if (!AUTO_EXIT) return;
  const t = Date.now();
  for (const [id, seen] of clients) if (t - seen > HEARTBEAT_TIMEOUT) clients.delete(id);
  if (clients.size || inflight) return;
  if (!everSeen && t - startedAt < FIRST_VISIT_TIMEOUT) return;
  if (lastBye && t - lastBye < BYE_GRACE) return;
  console.log(`${new Date().toISOString()} 网页已关闭，服务自动退出`);
  process.exit(0);
}
if (AUTO_EXIT) setInterval(maybeExit, 3000).unref();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};


function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

async function readJson(req, limit = 2 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new ApiError(413, "请求体过大");
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) return {};
  let v;
  try { v = JSON.parse(text); } catch { throw new ApiError(400, "请求体不是有效 JSON"); }
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

// ---------------------------------------------------------------- 防 DNS rebinding / 跨站请求
// 只认 IP、localhost、Windows 机器名（不带点）和 .local；反代或 MagicDNS 等域名用 MOMO_ALLOWED_HOSTS=域名1,域名2 加白名单
const EXTRA_HOSTS = (process.env.MOMO_ALLOWED_HOSTS || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
function hostAllowed(h = "") {
  const name = String(h).toLowerCase().replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  if (!name) return false;
  return name === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(name) || name.includes(":")
    || /^[a-z0-9-]+$/.test(name) || name.endsWith(".local") || EXTRA_HOSTS.includes(name);
}
function checkRequest(req, url) {
  if (!hostAllowed(req.headers.host)) throw new ApiError(403, "Host 不被允许（用域名访问时请设置环境变量 MOMO_ALLOWED_HOSTS）");
  if (req.method !== "POST") return;
  const origin = req.headers.origin;
  if (origin && origin !== "null") {
    let oh = "";
    try { oh = new URL(origin).host; } catch { /* 当作不一致 */ }
    if (oh.toLowerCase() !== String(req.headers.host || "").toLowerCase()) throw new ApiError(403, "跨站请求被拒绝");
  } else if (origin === "null") throw new ApiError(403, "跨站请求被拒绝");
  const ct = String(req.headers["content-type"] || "");
  const len = Number(req.headers["content-length"] || 0);
  const chunked = !!req.headers["transfer-encoding"];
  if (!ct.startsWith("application/json") && url.pathname !== "/api/bye" && (len > 0 || chunked)) throw new ApiError(415, "只接受 application/json");
}

// ---------------------------------------------------------------- 路由
const routes = {
  "GET /api/health": () => ({ ok: true, service: "momo-kan", version: require("./package.json").version, lan: lanUrls(), dataDir: path.dirname(DB_FILE), counts: db.counts() }),

  // ---- GitHub 备份
  "GET /api/backup": () => backup.status(),
  "POST /api/backup/config": (body) => backup.configure(body),
  "POST /api/backup/run": () => backup.run({ manual: true }),
  "POST /api/backup/restore": () => backup.restore(),

  "GET /api/settings": () => readSettings(),
  "POST /api/settings": (body) => {
    const cur = readSettings();
    if (!body.settings || typeof body.settings !== "object") throw new ApiError(400, "设置内容为空");
    // 新设备还没拿到设置就推上来一份空白默认值：不覆盖，把电脑上的发回去
    if (blankSettings(body.settings) && !blankSettings(cur.settings)) return { ...cur, stale: true };
    if (body.base !== undefined) {
      // v0.6.2 起：按版本号判断，不比较各设备的时钟（手机和电脑时间不一致也不会互相覆盖）
      if (cur.settings && Number(body.base) !== (cur.updatedAt || 0)) return { ...cur, stale: true };
      const next = { settings: body.settings, updatedAt: Math.max(Date.now(), (cur.updatedAt || 0) + 1) };
      writeSettings(next);
      return next;
    }
    const at = Number(body.updatedAt) || 0; // 旧版页面
    if (at < (cur.updatedAt || 0)) return { ...cur, stale: true };
    const next = { settings: body.settings, updatedAt: Math.max(at, (cur.updatedAt || 0) + 1) };
    writeSettings(next);
    return next;
  },

  "POST /api/heartbeat": (body) => {
    if (body.id) { clients.set(String(body.id).slice(0, 64), Date.now()); everSeen = true; }
    return { ok: true, autoExit: AUTO_EXIT };
  },
  "POST /api/bye": (body) => {
    clients.delete(String(body.id || ""));
    lastBye = Date.now();
    setTimeout(maybeExit, BYE_GRACE + 200);
    return { ok: true };
  },
  ...api.routes,
};

async function handleApi(req, res, url) {
  const handler = routes[`${req.method} ${url.pathname}`];
  if (!handler) throw new ApiError(404, "未知 API 路径");
  checkRequest(req, url);
  // 同步一次可能带上几个月的数据，单独放宽
  const body = req.method === "POST" ? await readJson(req, url.pathname === "/api/sync" ? 64 * 1024 * 1024 : 2 * 1024 * 1024) : {};
  const quiet = ["/api/heartbeat", "/api/bye", "/api/settings"].includes(url.pathname);
  if (!quiet) inflight += 1;
  try {
    return sendJson(res, 200, await handler(body, url));
  } finally {
    if (!quiet) inflight -= 1;
  }
}

function serveStatic(req, res, url) {
  let rel;
  try { rel = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname); } catch { res.writeHead(400); return res.end("Bad Request"); }
  let filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); return res.end("Forbidden"); }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) filePath = path.join(PUBLIC_DIR, "index.html");
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not Found"); }
    res.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(req.method === "HEAD" ? undefined : data);
  });
}

const server = http.createServer(async (req, res) => {
  if (!isPrivateAddr(req.socket.remoteAddress)) { res.writeHead(403); return res.end("Forbidden"); }
  let url;
  // 不用客户端给的 Host 拼地址：畸形的 Host 会让 new URL 抛错
  try { url = new URL(req.url, "http://localhost"); } catch { res.writeHead(400); return res.end("Bad Request"); }
  if (!hostAllowed(req.headers.host)) { res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("Host 不被允许。用域名访问时请设置环境变量 MOMO_ALLOWED_HOSTS"); }
  try {
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
    if (req.method === "GET" || req.method === "HEAD") return serveStatic(req, res, url);
    res.writeHead(405); return res.end("Method Not Allowed");
  } catch (e) {
    const known = e instanceof ApiError || e instanceof momo.MomoError || e instanceof llm.LLMError;
    if (!known) console.error(e);
    // 只记录路径和错误，不记录请求体（里面有 Token / Key）
    console.error(`${new Date().toISOString()} ${req.method} ${url.pathname} -> ${e.status || 500} ${e.message}`);
    return sendJson(res, known ? (e.status || 502) : 500, { error: known ? e.message : `服务内部错误：${e.message}` });
  }
});

// 兜底：一个请求出错不能带走整个服务
process.on("unhandledRejection", (e) => console.error(`${new Date().toISOString()} unhandledRejection`, e));

// 后台自动记录学习时长：开启了多设备同步（电脑上存了 Token）时，每 15 分钟向墨墨取一次今天的时长，
// 这样就算当天没打开网页，历史曲线也不会断。
async function autoRecordProgress() {
  const st = readSettings().settings;
  if (!st || !st.token) return;
  const proxy = st.momoProxyMode === "env" ? "env" : st.momoProxyMode === "custom" ? String(st.momoProxyUrl || "").trim() : "";
  let progress;
  try {
    const r = await api.pullToday(st.token, { proxy });
    if (r.stale) return; // 墨墨今天还没初始化，拿到的是上一天的数据
    progress = r.progress;
  } catch (e) {
    console.error(`${new Date().toISOString()} 自动记录学习时长失败：${e.message}`);
    return;
  }
  await autoGenerate(st, proxy, progress).catch((e) => console.error(`${new Date().toISOString()} 自动生成短文失败：${e.message}`));
}

// 墨墨今天已打卡（finished ≥ total）且今天还没有短文时，电脑用当前模型在后台生成，手机打开后同步过去。
// 手机上手动生成的短文同步过来后会覆盖这里自动生成的。
let autoGenTried = { date: "", times: 0 };
async function autoGenerate(st, proxy, progress) {
  if (st.autoGenerate === false) return;
  const date = today();
  if (!progress || !progress.total || progress.finished < progress.total) return;
  if (db.getArticles(date).length) return;
  if (autoGenTried.date !== date) autoGenTried = { date, times: 0 };
  if (autoGenTried.times >= 2) return;
  const profiles = Array.isArray(st.profiles) ? st.profiles : [];
  const p = profiles.find((x) => x.id === st.activeId) || profiles[0];
  if (!p) return;
  autoGenTried.times += 1;
  const llmBody = {
    protocol: p.protocol, baseUrl: p.baseUrl, apiKey: p.apiKey, model: p.model, maxTokens: p.maxTokens, contextWindow: p.contextWindow,
    proxy: p.proxyMode === "env" ? "env" : p.proxyMode === "custom" ? String(p.proxyUrl || "").trim() : "", reasoning: p.reasoning || "",
  };
  let plan;
  try {
    plan = await api.routes["POST /api/plan"]({ date, maxWords: st.maxWords, replace: false });
  } catch { return; } // 今天没有忘记 / 模糊的词
  console.log(`${new Date().toISOString()} 今天已打卡，后台自动生成 ${plan.batches.length} 篇短文…`);
  for (const b of plan.batches) {
    if (db.getArticles(date).some((a) => !a.auto)) return; // 期间手机同步来了手动生成的
    try {
      await api.routes["POST /api/article"]({
        date, idx: b.idx, style: b.style, words: b.words, length: b.length, maxWords: b.maxWords,
        target: st.target, llm: llmBody, auto: true,
      });
    } catch (e) {
      console.error(`${new Date().toISOString()} 自动生成第 ${b.idx + 1} 篇失败：${e.message}`);
    }
  }
}
if (!process.argv.includes("--no-auto-record")) backup.startAuto();
if (!process.argv.includes("--no-auto-record")) {
  setTimeout(autoRecordProgress, 20_000).unref();
  setInterval(autoRecordProgress, 15 * 60_000).unref();
}

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") console.error(`端口 ${PORT} 被占用：可以 npm run stop 释放，或 node server.js --port 5174`);
  else console.error(e);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const url = `http://${HOST === "0.0.0.0" ? "127.0.0.1" : HOST}:${PORT}`;
  console.log(`${new Date().toISOString()} momo-web 已启动：${url}  （数据库 ${DB_FILE}${AUTO_EXIT ? "，关闭网页后自动退出" : "，Ctrl+C 退出"}）`);
  if (process.argv.includes("--open")) {
    const cmd = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
    const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
    execFile(cmd, args, () => {});
  }
  const lan = lanUrls();
  if (lan.length) {
    console.log("\n  手机和电脑连同一个 Wi-Fi，在手机浏览器打开：");
    for (const u of lan) console.log(`    ${u}`);
    console.log("  （首次启动 Windows 防火墙会弹窗，请勾选「专用网络」并允许；没有登录保护，只在自家网络里用）\n");
  }
});
