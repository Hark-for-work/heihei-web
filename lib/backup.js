// 把学习数据备份到用户自己的 GitHub 私有仓库（momo-kan-backup.json）。
// 需要一个 GitHub Token（classic 勾选 repo，或 fine-grained 给该仓库 Contents 读写）。
// 备份内容：学习时长、词表、短文和练习；不含墨墨 Token 和模型 Key。git 历史本身就保留了每个版本。
// 电脑上存到 backup.json；安卓 App（手机独立模式）里传 store 存到 localStorage，同一份代码。
const net = require("./net");

// 不依赖 node:crypto / Buffer，手机 WebView 里也能跑
function hashText(s) {
  let a = 0x811c9dc5, b = 0x01000193 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 16777619);
    b = Math.imul(b ^ c, 2246822507) ^ (b >>> 13);
  }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0") + s.length.toString(16);
}
function toBase64(text) {
  if (typeof Buffer !== "undefined") return Buffer.from(text, "utf8").toString("base64");
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
const byteLen = (text) => (typeof Buffer !== "undefined" ? Buffer.byteLength(text) : new TextEncoder().encode(text).length);

function fileStore(file) {
  const fs = require("node:fs");
  return {
    load() { return JSON.parse(fs.readFileSync(file, "utf8")); },
    save(state) {
      const tmp = file + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
      fs.renameSync(tmp, file);
    },
  };
}

const FILE_NAME = "momo-kan-backup.json";
const API = process.env.MOMO_GITHUB_API || "https://api.github.com";

function createBackup({ db, file, store, getSettings }) {
  store = store || fileStore(file);
  let state = load();
  let running = null;

  function load() {
    try { return store.load() || {}; } catch { return {}; }
  }
  function save() { store.save(state); }

  function status() {
    return {
      configured: !!state.token, repo: state.repo || "momo-kan-backup", owner: state.owner || "",
      auto: state.auto !== false, proxy: state.proxy || "",
      lastBackupAt: state.lastBackupAt || 0, lastError: state.lastError || "", lastSize: state.lastSize || 0,
      url: state.owner ? `https://github.com/${state.owner}/${state.repo || "momo-kan-backup"}` : "",
    };
  }

  function configure(body) {
    if (typeof body.token === "string" && body.token.trim() !== "" && !/^\*+$/.test(body.token)) {
      state.token = body.token.trim();
      state.owner = "";
    }
    if (body.clear) { state = {}; }
    if (typeof body.repo === "string") state.repo = body.repo.trim().replace(/^.*\//, "").replace(/[^A-Za-z0-9._-]/g, "-") || "momo-kan-backup";
    if (typeof body.auto === "boolean") state.auto = body.auto;
    if (typeof body.proxy === "string") state.proxy = body.proxy.trim();
    save();
    return status();
  }

  async function gh(method, path, body, accept = "application/vnd.github+json") {
    const res = await net.request(API + path, {
      method,
      headers: {
        Authorization: `Bearer ${state.token}`, Accept: accept, "User-Agent": "momo-kan",
        "X-GitHub-Api-Version": "2022-11-28", ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      timeoutMs: 120000,
      proxy: state.proxy || "",
    }).catch((e) => { throw new Error(`连不上 GitHub（${e.message}）。国内网络可在备份设置里填代理`); });
    let data = null;
    if (accept.includes("json")) { try { data = res.text ? JSON.parse(res.text) : null; } catch { data = null; } }
    return { status: res.status, ok: res.ok, data, text: res.text };
  }

  async function ensureRepo() {
    if (!state.owner) {
      const me = await gh("GET", "/user");
      if (me.status === 401) throw new Error("GitHub Token 无效或已过期");
      if (!me.ok) throw new Error(`GitHub 出错：${me.data?.message || me.status}`);
      state.owner = me.data.login;
    }
    const repo = state.repo || "momo-kan-backup";
    const r = await gh("GET", `/repos/${state.owner}/${repo}`);
    if (r.ok) return repo;
    if (r.status !== 404) throw new Error(`GitHub 出错：${r.data?.message || r.status}`);
    const c = await gh("POST", "/user/repos", { name: repo, private: true, auto_init: true, description: "黑黑看单词 学习数据备份（自动生成）" });
    if (!c.ok) throw new Error(`没能自动创建私有仓库 ${repo}（${c.data?.message || c.status}）。可以先在 GitHub 上手动建一个同名私有仓库`);
    return repo;
  }

  function payload() {
    const st = (getSettings() || {}).settings || {};
    const settings = {
      target: st.target, maxWords: st.maxWords, lookupMode: st.lookupMode,
      profiles: (st.profiles || []).map((p) => ({ ...p, apiKey: "" })),
    };
    const data = db.exportData(-1);
    return { app: "黑黑看单词", format: "momo-kan-backup", version: 1, backedUpAt: Date.now(), settings, data };
  }

  async function run({ manual = false } = {}) {
    if (!state.token) throw new Error("还没填 GitHub Token");
    if (running) return running;
    running = (async () => {
      try {
        const repo = await ensureRepo();
        const body = payload();
        const json = JSON.stringify({ ...body.data, exportedAt: 0 });
        const hash = hashText(json);
        if (!manual && hash === state.lastHash) return { ...status(), skipped: true };
        const text = JSON.stringify(body, null, 1);
        const cur = await gh("GET", `/repos/${state.owner}/${repo}/contents/${FILE_NAME}`);
        const sha = cur.ok ? cur.data?.sha : undefined;
        const put = await gh("PUT", `/repos/${state.owner}/${repo}/contents/${FILE_NAME}`, {
          message: `备份 ${new Date().toISOString().slice(0, 16).replace("T", " ")}（${db.counts().days} 天）`,
          content: toBase64(text),
          ...(sha ? { sha } : {}),
        });
        if (!put.ok) throw new Error(`上传失败：${put.data?.message || put.status}`);
        Object.assign(state, { lastHash: hash, lastBackupAt: Date.now(), lastError: "", lastSize: byteLen(text) });
        save();
        return status();
      } catch (e) {
        state.lastError = e.message;
        save();
        throw e;
      } finally {
        running = null;
      }
    })();
    return running;
  }

  async function restore() {
    if (!state.token) throw new Error("还没填 GitHub Token");
    const repo = await ensureRepo();
    const r = await gh("GET", `/repos/${state.owner}/${repo}/contents/${FILE_NAME}`, null, "application/vnd.github.raw+json");
    if (r.status === 404) throw new Error("仓库里还没有备份");
    if (!r.ok) throw new Error(`下载备份失败：HTTP ${r.status}`);
    let body;
    try { body = JSON.parse(r.text); } catch { throw new Error("备份文件已损坏"); }
    const imported = db.importData(body.data);
    return { imported, backedUpAt: body.backedUpAt, counts: db.counts(), settings: body.settings || null };
  }

  // 自动备份：启动 3 分钟后一次，之后每 3 小时检查一次（数据没变就跳过）
  // 手机上 App 开着时才会跑：每 30 分钟看一次，距上次备份满 3 小时才备份
  function startAuto({ mobile = false } = {}) {
    const tick = () => {
      if (!state.token || state.auto === false) return;
      if (mobile && Date.now() - (state.lastBackupAt || 0) < 3 * 3600_000) return;
      run().catch((e) => console.error(`自动备份失败：${e.message}`));
    };
    const t1 = setTimeout(tick, 3 * 60_000), t2 = setInterval(tick, mobile ? 30 * 60_000 : 3 * 3600_000);
    if (t1.unref) { t1.unref(); t2.unref(); }
  }

  return { status, configure, run, restore, startAuto };
}

module.exports = { createBackup, hashText, toBase64 };
