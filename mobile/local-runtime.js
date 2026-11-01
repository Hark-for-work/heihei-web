// 黑黑看单词 · 安卓 App「手机独立模式」运行时。
// 把电脑上 server.js 的接口搬到手机里执行：数据存在手机的 SQLite（原生桥 MomoAndroid.sql），
// 网络请求走原生（MomoAndroid.httpStart）。电脑连得上时：模型调用交给电脑（/api/llm-chat），数据自动双向同步（/api/sync）。
const { DB } = require("./db");
const { createApi, ApiError, makeLlmCfg } = require("./api");
const momo = require("./momo");
const llm = require("./llm");
const gen = require("./generator");
const dict = require("./dict");
const net = require("./net");
const { createBackup } = require("./backup");

const bridge = window.MomoAndroid || null;

// ---- 原生 SQLite 适配成 node:sqlite 的接口
function sqlCall(mode, sql, params) {
  const norm = (params || []).map((v) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : typeof v === "bigint" ? Number(v) : v));
  const r = JSON.parse(bridge.sql(mode, sql, JSON.stringify(norm)));
  if (r.error) throw new Error(`数据库错误：${r.error}`);
  return r;
}
const driver = {
  prepare(sql) {
    return {
      run: (...a) => { const r = sqlCall("run", sql, a); return { changes: r.changes || 0, lastInsertRowid: r.lastInsertRowid || 0 }; },
      get: (...a) => sqlCall("get", sql, a).row || undefined,
      all: (...a) => sqlCall("all", sql, a).rows || [],
    };
  },
  exec(sql) {
    // 触发器的 BEGIN … END 里本身带分号，整条交给原生
    if (/^\s*CREATE\s+TRIGGER/i.test(sql)) return void sqlCall("exec", String(sql).trim(), []);
    for (const st of String(sql).split(";").map((x) => x.trim()).filter(Boolean)) sqlCall("exec", st, []);
  },
};

const db = new DB(null, { driver });
const api = createApi({ db, momo, llm, gen, dict });

// ---- 离线词典：解压 /dict.tsv.gz
// 启动 3 秒后再解压（约 7 MB 文本），别和首屏抢时间；查词时会先用有道
setTimeout(async () => {
  try {
    const res = await fetch("/dict.tsv.gz");
    if (!res.ok || typeof DecompressionStream === "undefined") return;
    dict.setText(await new Response(res.body.pipeThrough(new DecompressionStream("gzip"))).text());
  } catch (e) { console.warn("离线词典加载失败", e); }
}, 3000);

// ---- 电脑在线状态
const LS = {
  get: (k, d) => { try { const v = localStorage.getItem("momo." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => localStorage.setItem("momo." + k, JSON.stringify(v)),
};
// 「设置 → 电脑同步」总开关：关掉后完全不连电脑（不探测、不同步、不借电脑的模型）
const pcSyncOn = () => {
  try { if (bridge && typeof bridge.pcSync === "function") return !!bridge.pcSync(); } catch { /* 旧版 App */ }
  return LS.get("pcSync", LS.get("syncSettings", true)) !== false;
};
const state = { pcUrl: bridge && bridge.pcUrl ? bridge.pcUrl() : "", online: false, checkedAt: 0, lastSync: LS.get("syncAt", 0), syncError: "", syncing: false };
function emit() { window.dispatchEvent(new CustomEvent("momo-local-status", { detail: status() })); }
function status() {
  return { local: true, pcSync: pcSyncOn(), pcUrl: state.pcUrl, online: state.online, lastSync: state.lastSync, syncError: state.syncError, syncing: state.syncing };
}

async function pcOnline(force = false) {
  if (!state.pcUrl || !pcSyncOn()) {
    if (state.online) { state.online = false; emit(); }
    return false;
  }
  if (!force && Date.now() - state.checkedAt < 20000) return state.online;
  state.checkedAt = Date.now();
  try {
    const r = await net.request(state.pcUrl + "/api/health", { timeoutMs: 3500 });
    state.online = r.ok && JSON.parse(r.text).ok === true;
  } catch { state.online = false; }
  emit();
  return state.online;
}

async function pc(method, path, body, timeoutMs = 30000) {
  let r;
  try {
    r = await net.request(state.pcUrl + path, {
      method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, timeoutMs,
    });
  } catch (e) {
    state.online = false; state.checkedAt = Date.now(); emit();
    throw e;
  }
  let data = {};
  try { data = r.text ? JSON.parse(r.text) : {}; } catch { /* 非 JSON */ }
  if (!r.ok) throw new ApiError(r.status, data.error || `电脑返回 ${r.status}`);
  return data;
}

// ---- 模型调用：电脑在线 → 交给电脑；否则（或中途断开）→ 用「电脑不在线时」的备用模型直连
let usePc = false;
let fallbackCfg = null;
const realChat = llm.chat;
llm.chat = async (cfg, messages, opts = {}) => {
  if (usePc) {
    try {
      return await pc("POST", "/api/llm-chat", { llm: cfg, messages, opts }, (opts.timeoutMs || 600000) + 10000);
    } catch (e) {
      if (e instanceof ApiError) { e.fromModel = true; throw e; }
      usePc = false; // 电脑掉线了：改用备用模型
      if (fallbackCfg) cfg = fallbackCfg;
    }
  }
  return realChat(cfg, messages, opts);
};

const LLM_ROUTES = new Set(["/api/article", "/api/drills", "/api/lookup"]);
const BACKUP_ROUTES = new Set(["/api/backup", "/api/backup/config", "/api/backup/run", "/api/backup/restore"]);
// 手机自己的 GitHub 备份（没开电脑同步、或电脑不在线时用）：配置存在 App 的 localStorage
const backup = createBackup({
  db,
  store: { load: () => LS.get("ghBackup", {}), save: (st) => LS.set("ghBackup", st) },
  getSettings: () => ({ settings: { target: LS.get("target", undefined), maxWords: LS.get("maxWords", undefined), lookupMode: LS.get("lookupMode", undefined), profiles: LS.get("profiles", []) } }),
});
backup.startAuto({ mobile: true });
const localBackup = {
  "GET /api/backup": () => ({ ...backup.status(), onPhone: true }),
  "POST /api/backup/config": (b) => ({ ...backup.configure(b || {}), onPhone: true }),
  "POST /api/backup/run": () => backup.run({ manual: true }).then((r) => ({ ...r, onPhone: true })),
  "POST /api/backup/restore": () => backup.restore(),
};
const WRITES = new Set(["/api/articles/trim", "/api/today", "/api/progress", "/api/words/add", "/api/words/remove", "/api/plan", "/api/article", "/api/drills"]);

async function handle(path, body) {
  const method = body === undefined ? "GET" : "POST";
  const url = new URL(path, "https://momo.local/");
  const p = url.pathname;

  if (p === "/api/health") {
    const online = await pcOnline();
    return { ok: true, service: "momo-kan", version: typeof MOMO_VERSION === "string" ? MOMO_VERSION : "", local: true, dataDir: "手机本地（App 数据，卸载 App 会清除）", lan: [], counts: db.counts(), pcOnline: online };
  }
  if (p === "/api/settings") {
    if (!(await pcOnline())) return method === "GET" ? { settings: null, updatedAt: 0, offline: true } : { offline: true };
    return pc(method, p, body);
  }
  if (BACKUP_ROUTES.has(p)) {
    // 开着电脑同步且电脑在线：用电脑上的备份（数据已经同步过去）；否则手机自己备份
    if (pcSyncOn() && (await pcOnline())) return pc(method, path, body, 180000);
    const r = await localBackup[`${method} ${p}`](body);
    if (p === "/api/backup/restore") scheduleSync();
    return r;
  }
  if (p === "/api/llm-test" || p === "/api/llm-models") {
    if (await pcOnline()) return pc(method, p, body, 120000);
  }
  if (LLM_ROUTES.has(p) && body) {
    const online = await pcOnline();
    usePc = online;
    fallbackCfg = null;
    if (body.llmFallback) {
      try { fallbackCfg = makeLlmCfg(body.llmFallback, llm); } catch { fallbackCfg = null; }
      // 开着电脑同步但电脑不在线：主模型多半是电脑上的本地模型，直接用备用；没开同步时照常先用主模型，失败再用备用
      if (!online && pcSyncOn()) body = { ...body, llm: body.llmFallback, lookupLlm: body.llmFallback };
    }
  }
  const handler = api.routes[`${method} ${p}`];
  if (!handler) throw new ApiError(404, "未知 API 路径");
  const result = await handler(body || {}, url);
  if (WRITES.has(p)) scheduleSync();
  return result;
}

// ---- 与电脑双向同步数据
let syncTimer = null;
let syncing = null;
function scheduleSync(ms = 1500) { clearTimeout(syncTimer); syncTimer = setTimeout(() => syncNow().catch(() => {}), ms); }
function syncNow() {
  if (syncing) return syncing;
  syncing = (async () => {
    if (!pcSyncOn()) return { offline: true, disabled: true };
    if (!(await pcOnline(true))) return { offline: true };
    state.syncing = true; emit();
    try {
      const t0 = Date.now();
      const r = await pc("POST", "/api/sync", { since: LS.get("syncPull", -1), data: db.exportData(LS.get("syncPush", -1)) }, 120000);
      const imp = db.importData(r.data);
      LS.set("syncPush", t0);
      LS.set("syncPull", r.now);
      state.lastSync = Date.now(); LS.set("syncAt", state.lastSync);
      state.syncError = "";
      if (imp.articles || imp.day_words || imp.study_log || imp.tombstones) window.dispatchEvent(new CustomEvent("momo-synced", { detail: imp }));
      return imp;
    } catch (e) {
      state.syncError = e.message;
      throw e;
    } finally {
      state.syncing = false; emit();
    }
  })().finally(() => { syncing = null; });
  return syncing;
}

// 首次同步晚一点：同步要在主线程里读写数据库，放在首屏之后
setTimeout(() => syncNow().catch(() => {}), 6000);
setInterval(() => { if (document.visibilityState === "visible") syncNow().catch(() => {}); }, 120000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") scheduleSync(300); });

window.MomoLocal = {
  async api(path, body) {
    try {
      return await handle(path, body);
    } catch (e) {
      const err = new Error(e.message || String(e));
      err.status = e.status || 500;
      throw err;
    }
  },
  status,
  syncNow,
  setPcSync(v) {
    LS.set("pcSync", !!v);
    state.checkedAt = 0;
    if (v) scheduleSync(800); else { state.online = false; emit(); }
  },
  netChanged() { state.checkedAt = 0; if (bridge && bridge.pcUrl) state.pcUrl = bridge.pcUrl(); scheduleSync(800); },
};
