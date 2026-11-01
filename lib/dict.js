// 查词：本地离线词典（ECDICT 精简版）→ 有道在线词典 → 由调用方决定是否用 AI。
// 词典首次使用时加载进内存（约 5.8 万词，几十毫秒）。
// 词典首次使用时加载进内存；安卓 App 里由 local.js 解压后调用 setText 传入。
const net = require("./net");
let rawText = null;
let entries = null; // lower(word) -> { w, ph, tr, ex, tag }
let forms = null;   // 变形 -> 原形

const TAGS = { zk: "中考", gk: "高考", cet4: "四级", cet6: "六级", ky: "考研", toefl: "托福", ielts: "雅思", gre: "GRE" };

function readFile() {
  if (rawText != null) return rawText;
  if (typeof process === "undefined" || !process.versions || !process.versions.node) return null;
  const fs = require("node:fs");
  const path = require("node:path");
  const zlib = require("node:zlib");
  const file = path.join(__dirname, "..", "dict", "ecdict-lite.tsv.gz");
  return fs.existsSync(file) ? zlib.gunzipSync(fs.readFileSync(file)).toString("utf8") : null;
}

function setText(text) { rawText = text; entries = null; }

function load() {
  if (entries) return;
  const text = readFile();
  if (text == null) return; // 安卓里词典还没解压完：先不缓存空表
  entries = new Map();
  forms = new Map();
  for (const line of text.split("\n")) {
    if (!line) continue;
    const [w, ph, tr, ex, tag] = line.split("\t");
    const k = w.toLowerCase();
    if (!entries.has(k) || w === k) entries.set(k, { w, ph, tr, ex, tag });
  }
  for (const [k, e] of entries) {
    for (const part of (e.ex || "").split("/")) {
      const [type, val] = part.split(":");
      if (!val || !"pdi3rts".includes(type)) continue;
      for (const f of val.split(/[,，]/)) {
        const fk = f.trim().toLowerCase();
        if (fk && fk !== k && !forms.has(fk)) forms.set(fk, k);
      }
    }
  }
}

const isLoaded = () => { load(); return !!entries && entries.size > 0; };

function baseOf(e) {
  const m = /(?:^|\/)0:([^/]+)/.exec(e.ex || "");
  return m ? m[1].toLowerCase() : "";
}

function guessLemma(k) {
  const tries = [];
  if (k.endsWith("ies")) tries.push(k.slice(0, -3) + "y");
  if (k.endsWith("es")) tries.push(k.slice(0, -2));
  if (k.endsWith("s")) tries.push(k.slice(0, -1));
  if (k.endsWith("ied")) tries.push(k.slice(0, -3) + "y");
  if (k.endsWith("ed")) tries.push(k.slice(0, -2), k.slice(0, -1), k.slice(0, -3));
  if (k.endsWith("ing")) tries.push(k.slice(0, -3), k.slice(0, -3) + "e", k.slice(0, -4));
  if (k.endsWith("ly")) tries.push(k.slice(0, -2), k.slice(0, -3) + "y");
  if (k.endsWith("er")) tries.push(k.slice(0, -2), k.slice(0, -1));
  if (k.endsWith("est")) tries.push(k.slice(0, -3), k.slice(0, -2));
  return tries.find((t) => t.length > 1 && entries.has(t)) || "";
}

function format(e, word) {
  const lines = String(e.tr || "").split("\\n").map((s) => s.trim()).filter(Boolean);
  const main = lines.filter((l) => !l.startsWith("[网络]"));
  const net = lines.find((l) => l.startsWith("[网络]"));
  const tags = String(e.tag || "").split(" ").map((t) => TAGS[t]).filter(Boolean);
  return {
    word,
    lemma: e.w,
    pos: e.ph ? `/${e.ph}/` : "",
    meaning_zh: (main.length ? main : lines).slice(0, 2).join("；"),
    note: [main.slice(2).join("；"), net || "", tags.length ? `考纲：${tags.join(" · ")}` : ""].filter(Boolean).join("\n"),
    source: "本地词典",
  };
}

/** 本地词典查词；查不到返回 null */
function lookupLocal(word) {
  load();
  if (!entries) return null;
  const k = String(word || "").trim().toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, "");
  if (!k) return null;
  let e = entries.get(k);
  let lemmaKey = "";
  if (!e) { lemmaKey = forms.get(k) || guessLemma(k); e = lemmaKey ? entries.get(lemmaKey) : null; }
  if (!e) return null;
  const r = format(e, word);
  // 是变形（went、running…）且词条本身释义很短：补上原形的释义
  const b = lemmaKey ? "" : baseOf(e);
  if (b && entries.has(b)) {
    const be = format(entries.get(b), b);
    r.lemma = entries.get(b).w;
    r.note = [`${be.lemma}：${be.meaning_zh}`, r.note].filter(Boolean).join("\n");
  }
  return r;
}

/** 有道在线词典（免费接口，无需 Key）；失败返回 null */
async function lookupYoudao(word, { timeoutMs = 6000 } = {}) {
  const q = String(word || "").trim();
  if (!q) return null;
  try {
    const res = await net.request(`https://dict.youdao.com/suggest?num=3&doctype=json&q=${encodeURIComponent(q)}`, { timeoutMs });
    if (!res.ok) return null;
    const data = JSON.parse(res.text);
    const list = data?.data?.entries || [];
    const hit = list.find((x) => String(x.entry).toLowerCase() === q.toLowerCase()) || null;
    if (!hit || !hit.explain) return null;
    return { word: q, lemma: hit.entry, pos: "", meaning_zh: hit.explain, note: "", source: "有道词典" };
  } catch {
    return null;
  }
}

module.exports = { lookupLocal, lookupYoudao, isLoaded, setText };
