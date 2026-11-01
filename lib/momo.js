// 墨墨开放 API 客户端。
// 默认直连 open.maimemo.com（Node fetch 不读系统代理，避免“代理没开 → 10061 连接被拒绝”）；
// 设置里可改成走代理。环境变量 MOMO_PROXY（direct / env / 代理地址）优先。
const net = require("./net");
const BASE = (process.env.MOMO_API_BASE || "https://open.maimemo.com/open/api/v1").replace(/\/+$/, "");

class MomoError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details || null;
  }
}

function normalizeToken(token) {
  const t = String(token || "").replace(/^Bearer\s+/i, "").trim();
  if (!t) throw new MomoError(400, "请先在「设置」里填写墨墨开放 API Token");
  return t;
}

async function request(token, apiPath, body = {}, { timeoutMs = 20000, proxy } = {}) {
  let res;
  const via = process.env.MOMO_PROXY || proxy || "";
  try {
    res = await net.request(BASE + apiPath, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${normalizeToken(token)}`,
        "User-Agent": "momo-kan/0.5 (+local)",
      },
      body: JSON.stringify(body),
      timeoutMs,
      proxy: via,
    });
  } catch (e) {
    if (e instanceof MomoError) throw e;
    let how = "直连";
    try { const u = net.resolveProxy(via); if (u) how = `经代理 ${net.maskProxy(u)}`; } catch { how = "代理设置有误"; }
    throw new MomoError(502, `无法连接墨墨服务（${how}：${e.message}）。请检查网络，或在设置里切换代理`);
  }
  const text = res.text;
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 300) }; }

  const err = Array.isArray(data?.errors) ? data.errors[0] || {} : {};
  if (res.status === 401 || String(err.code || "").includes("unauthorized")) {
    throw new MomoError(401, "墨墨 Token 无效或已过期，请到 App 里重新生成");
  }
  if (res.status === 429) throw new MomoError(429, "墨墨接口请求过于频繁，请稍后再试");
  if (!res.ok || data?.success === false) {
    throw new MomoError(502, `墨墨接口错误：${err.msg || data?.message || res.status}`, data);
  }
  if (data && typeof data === "object" && "success" in data && "data" in data) return data.data || {};
  return data;
}

// 今日条目：去重，记录 FORGET / VAGUE 等反馈
async function todayItems(token, opts) {
  const data = await request(token, "/memo/study/get_today_items", { limit: 1000 }, opts);
  const seen = new Set();
  const out = [];
  for (const it of data.today_items || []) {
    const spelling = String(it.voc_spelling || "").trim();
    if (!spelling || seen.has(spelling.toLowerCase())) continue;
    seen.add(spelling.toLowerCase());
    out.push({
      finished: Boolean(it.is_finished),
      vocId: it.voc_id || null,
      spelling,
      response: it.first_response || it.last_response || null,
      order: it.order ?? out.length,
      isNew: Boolean(it.is_new),
    });
  }
  return out;
}

async function studyProgress(token, opts) {
  const data = await request(token, "/memo/study/get_study_progress", {}, opts);
  const p = data.progress || {};
  return { finished: p.finished || 0, total: p.total || 0, studyTimeMs: p.study_time || 0 };
}

// 学习记录：用来核对 last_study_date，判断墨墨返回的是不是今天的数据
async function studyRecords(token, vocIds, opts) {
  const data = await request(token, "/memo/study/query_study_records", { voc_ids: vocIds.slice(0, 1000), limit: 1000 }, opts);
  return data.records || [];
}

// 把 ISO 时间换成本机本地日期 YYYY-MM-DD（和 api.today() 同一口径）
function cnDate(iso) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function queryVocabulary(token, spellings, opts) {
  const data = await request(token, "/memo/vocabulary/query", { spellings }, opts);
  return data.voc || [];
}

async function addWords(token, vocIds, advance, opts) {
  return request(token, "/memo/study/add_words", {
    words: vocIds.map((id) => ({ id })),
    advance: Boolean(advance),
  }, opts);
}

async function createNotepad(token, { title, brief, content, tags }, opts) {
  return request(token, "/memo/notepads", {
    notepad: { status: "PUBLISHED", title, brief, content, tags },
  }, opts);
}

module.exports = { MomoError, todayItems, studyProgress, studyRecords, cnDate, queryVocabulary, addWords, createNotepad, BASE };
