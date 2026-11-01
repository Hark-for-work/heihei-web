// 业务接口（电脑上的 server.js 和安卓 App 内的离线模式共用同一份代码）。
// createApi 传入数据库和各模块，返回 { routes, ApiError, today }；路由签名 (body, url) => 结果。

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function createApi({ db, momo, llm, gen, dict }) {
  function today() {
    // 本机本地日期（墨墨的“今天”也按本地时间算）
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  const pickDate = (v) => (typeof v === "string" && DATE_RE.test(v) ? v : today());

  function cleanWords(words) {
    return [...new Set((words || []).map((w) => String(w || "").trim()).filter(Boolean))].slice(0, 1000);
  }

  function llmCfg(body, key = "llm") {
    return makeLlmCfg(body[key] || body.llm || {}, llm);
  }


  const momoOpts = (body) => ({ proxy: String(body.momoProxy || "").trim() });

  function dayPayload(date) {
    return { date, today: today(), progress: db.getProgress(date), words: db.getWords(date), articles: db.getArticles(date) };
  }

  // 主模型失败（连不上、超时、限流、Key 无效、返回异常）时，自动用备用模型重试一次
  const isModelError = (e) => e && (e.name === "LLMError" || e.fromModel) && e.status !== 400;
  const sameCfg = (a, b) => JSON.stringify(a || {}) === JSON.stringify(b || {});
  function withFallback(handler, keys) {
    return async (body, url) => {
      try {
        return await handler(body, url);
      } catch (e) {
        const fb = body && body.llmFallback;
        if (!fb || !isModelError(e) || keys.every((k) => sameCfg(body[k] || body.llm, fb))) throw e;
        const next = { ...body };
        for (const k of keys) next[k] = fb;
        const r = await handler(next, url);
        return { ...r, usedFallback: fb.name || "备用模型", primaryError: e.message };
      }
    };
  }

  // 判断墨墨返回的是不是今天的数据：
  //  1) 今天已经背过的词（有 first_response）里，只要有一个的 last_study_date 是今天，就是今天的；全都更早 → 旧数据
  //  2) 查不到学习记录时退回：时长、完成数和本机记录的上一个学习日完全一样 → 旧数据
  async function checkStale(token, opts, items, progress, date) {
    const done = items.filter((it) => it.response && it.vocId);
    if (done.length) {
      try {
        const recs = await momo.studyRecords(token, done.slice(0, 200).map((it) => it.vocId), opts);
        const days = recs.map((x) => momo.cnDate(x.last_study_date)).filter(Boolean);
        if (days.length) {
          if (days.some((d) => d >= date)) return null;
          return days.sort().pop();
        }
      } catch (e) {
        if (e.status === 401) throw e;
      }
    }
    const prev = db.prevProgress(date);
    if (progress && prev && progress.studyTimeMs > 0 && Math.round(progress.studyTimeMs) === prev.study_time_ms
      && (progress.finished | 0) === prev.finished && (progress.total | 0) === prev.total) return prev.date;
    return null;
  }

  async function pullToday(token, opts, { withItems = true } = {}) {
    const date = today();
    const items = withItems ? await momo.todayItems(token, opts) : [];
    let progress = null;
    try {
      progress = await momo.studyProgress(token, opts);
    } catch (e) {
      if (e.status === 401 || !withItems) throw e;
    }
    const staleDate = await checkStale(token, opts, items, progress, date);
    if (staleDate) {
      db.dropStaleDay(date);
      return { stale: true, staleDate, items: [], progress: null };
    }
    if (progress) db.saveProgress(date, progress, { exact: true });
    if (withItems) db.saveWords(date, items.filter((it) => it.response));
    return { stale: false, items, progress };
  }

  const routes = {
    "GET /api/days": () => ({ days: db.listDays(), study: db.studySeries(), today: today() }),
    "GET /api/day": (_b, url) => dayPayload(pickDate(url.searchParams.get("date"))),

    // 拉取今天的墨墨数据：词表（含 FORGET/VAGUE）+ 学习时长，写入 SQLite。
    // 墨墨当天没打开 App 初始化前，接口返回的还是上一个学习日的数据，所以先核对再存。
    "POST /api/today": async (body) => {
      const date = today();
      const r = await pullToday(body.token, momoOpts(body));
      if (r.stale) return { ...dayPayload(date), fetched: 0, stale: r.staleDate || true };
      return { ...dayPayload(date), fetched: r.items.length };
    },

    "POST /api/progress": async (body) => {
      const r = await pullToday(body.token, momoOpts(body));
      return { progress: db.getProgress(today()), stale: r.stale ? r.staleDate || true : false };
    },

    // 手动补充词（沿用上游功能），默认当作“忘记”
    "POST /api/words/add": (body) => {
      const date = pickDate(body.date);
      const resp = ["FORGET", "VAGUE"].includes(body.response) ? body.response : "FORGET";
      const exist = db.getWords(date);
      let ord = exist.reduce((m, w) => Math.max(m, w.ord ?? 0), 0) + 1;
      const words = cleanWords(body.words).filter((w) => /^[A-Za-z][A-Za-z' -]{0,40}$/.test(w));
      db.saveWords(date, words.map((spelling) => ({ spelling, response: resp, order: ord++, source: "manual" })), "manual");
      return { ...dayPayload(date), added: words.length };
    },

    "POST /api/words/remove": (body) => {
      const date = pickDate(body.date);
      db.removeWord(date, String(body.spelling || ""));
      return dayPayload(date);
    },

    "POST /api/plan": (body) => {
      const date = pickDate(body.date);
      const responses = new Set(Array.isArray(body.responses) && body.responses.length ? body.responses : ["FORGET", "VAGUE"]);
      const words = db.getWords(date).filter((w) => responses.has(w.response))
        .map((w) => ({ spelling: w.spelling, response: w.response }));
      if (!words.length) throw new ApiError(400, "这一天没有需要复习的词：先拉取墨墨数据，或检查 App 是否已同步");
      // 不再先清空：旧短文留到新的一篇篇写好再按篇覆盖，生成失败也不会丢；写完后用 /api/articles/trim 删掉多出来的旧篇
      if (body.replace === true) db.clearArticles(date);
      return { date, batches: gen.planBatches(words, { maxWords: body.maxWords }) };
    },

    "POST /api/articles/trim": (body) => {
      const date = pickDate(body.date);
      const keep = Math.max(1, Number(body.keep) | 0);
      return { removed: db.trimArticles(date, keep), day: dayPayload(date) };
    },

    "POST /api/article": async (body) => {
      const cfg = llmCfg(body);
      const date = pickDate(body.date);
      const style = gen.STYLES[body.style] ? body.style : "kaoyan";
      const words = (Array.isArray(body.words) ? body.words : []).filter((w) => w && w.spelling).map((w) => ({ spelling: String(w.spelling), response: w.response || null }));
      if (!words.length) throw new ApiError(400, "这一篇没有目标词");
      const idx = Number(body.idx) || 0;
      const maxWords = gen.clampMaxWords(body.maxWords);
      let length = Math.min(Math.max(Number(body.length) || 260, 80), 500);
      if (maxWords) length = Math.min(length, Math.round(maxWords * 0.9));
      const target = gen.EXAM_TARGETS.includes(body.target) ? body.target : "考研";
      const { data, missing } = await gen.generateArticle(cfg, style, words, length, target, maxWords);
      const id = db.replaceArticle(date, idx, style, data, words, missing, cfg.model, { auto: !!body.auto });
      return { article: db.getArticle(id) };
    },

    "POST /api/drills": async (body) => {
      const cfg = llmCfg(body);
      const art = db.getArticle(Number(body.id));
      if (!art) throw new ApiError(404, "找不到这篇短文");
      const target = gen.EXAM_TARGETS.includes(body.target) ? body.target : (art.content.target || "考研");
      const drills = await gen.generateDrills(cfg, art, target);
      db.saveDrills(art.id, drills);
      return { article: db.getArticle(art.id) };
    },

    // 查词：lookupMode = dict（有道在线 → 本地词典 → AI，默认）| local（本地词典 → 有道）| ai（AI 结合语境）
    "POST /api/lookup": async (body) => {
      const word = String(body.word || "").trim().slice(0, 64);
      const sentence = String(body.sentence || "").trim().slice(0, 600);
      if (!word) throw new ApiError(400, "缺少单词");
      const mode = ["dict", "local", "ai"].includes(body.lookupMode) ? body.lookupMode : "dict";
      const key = word.toLowerCase();
      if (mode !== "ai") {
        const cachedDict = db.getLookup(key, "#youdao");
        const tryYoudao = async () => {
          if (cachedDict) return cachedDict;
          const r = await dict.lookupYoudao(word, { timeoutMs: 3000 });
          if (r) db.saveLookup(key, "#youdao", r);
          return r;
        };
        const r = mode === "local"
          ? dict.lookupLocal(word) || await tryYoudao()
          : await tryYoudao() || dict.lookupLocal(word);
        if (r) return { result: r, cached: false };
      }
      // 词典都查不到，或者指定用 AI
      const cached = db.getLookup(key, sentence);
      if (cached) return { result: { source: "AI", ...cached }, cached: true };
      let cfg;
      try { cfg = llmCfg(body, "lookupLlm"); } catch (e) {
        if (mode === "ai") throw e;
        throw new ApiError(404, "词典里没有这个词");
      }
      const result = { ...(await gen.lookupWord(cfg, word, sentence)), source: "AI" };
      db.saveLookup(key, sentence, result);
      return { result, cached: false };
    },

    "POST /api/llm-test": async (body) => {
      const cfg = llmCfg(body);
      const t0 = Date.now();
      const { text, usage } = await llm.chat(cfg, [{ role: "user", content: '只输出 JSON：{"ok": true}' }],
        { temperature: 0, timeoutMs: 90000, maxTokens: Math.min(cfg.maxTokens, 1024) });
      return { ok: true, reply: text.slice(0, 200), url: llm.endpoint(cfg), ms: Date.now() - t0, usage };
    },

    "POST /api/llm-models": async (body) => ({ models: await llm.listModels(llmCfg(body)), url: llm.modelsEndpoint(llmCfg(body)) }),

    "POST /api/momo-test": async (body) => {
      const t0 = Date.now();
      const p = await momo.studyProgress(body.token, momoOpts(body));
      return { ok: true, ms: Date.now() - t0, studyTimeMs: p.studyTimeMs };
    },

    // ---- 回写墨墨（沿用上游）：查词 ID → 加入学习计划；保存云词本
    "POST /api/maimemo/add-words": async (body) => {
      const date = pickDate(body.date);
      const words = db.getWords(date).filter((w) => !body.spellings || body.spellings.includes(w.spelling));
      const lack = words.filter((w) => !w.voc_id).map((w) => w.spelling);
      if (lack.length) {
        const voc = await momo.queryVocabulary(body.token, lack, momoOpts(body));
        const map = Object.fromEntries(voc.map((v) => [v.spelling, v.id]));
        db.setVocIds(date, map);
      }
      const ids = db.getWords(date).filter((w) => words.some((x) => x.spelling === w.spelling) && w.voc_id).map((w) => w.voc_id);
      if (!ids.length) throw new ApiError(400, "没有可以加入的单词 ID");
      const data = await momo.addWords(body.token, ids, body.advance, momoOpts(body));
      return { added: data.added_count ?? ids.length, total: ids.length };
    },

    "POST /api/maimemo/notepad": async (body) => {
      const date = pickDate(body.date);
      const words = db.getWords(date).map((w) => w.spelling);
      if (!words.length) throw new ApiError(400, "这一天还没有词表");
      const title = String(body.title || `语境复习 ${date}`).slice(0, 80);
      const data = await momo.createNotepad(body.token, {
        title,
        brief: "由 momo-web 从当天忘记/模糊的词生成",
        content: `# ${title}\n${words.join("\n")}`,
        tags: ["AI学习", "语境复习"],
      }, momoOpts(body));
      return { title: data.notepad?.title || title };
    },

    // ---- 手机独立模式借用电脑上的模型：手机把这次对话发过来，电脑调用模型后把回复交回去
    "POST /api/llm-chat": async (body) => {
      const cfg = llmCfg(body);
      const o = body.opts || {};
      const messages = (Array.isArray(body.messages) ? body.messages : []).filter((m) => m && typeof m === "object").map((m) => ({ role: String(m.role), content: String(m.content ?? "") }));
      if (!messages.length) throw new ApiError(400, "没有消息");
      return llm.chat(cfg, messages, {
        json: o.json !== false, temperature: o.temperature, maxTokens: o.maxTokens, timeoutMs: Math.min(Number(o.timeoutMs) || 600000, 900000),
      });
    },

    // ---- 多设备同步数据：对方把自己 since 之后的改动发过来，合并后把本机 since 之后的改动发回去
    "POST /api/sync": (body) => {
      const since = Number(body.since);
      const imported = body.data ? db.importData(body.data) : null;
      return { now: Date.now(), imported, data: db.exportData(Number.isFinite(since) ? since : -1) };
    },
  };

  for (const [k, keys] of [["POST /api/article", ["llm"]], ["POST /api/drills", ["llm"]], ["POST /api/lookup", ["lookupLlm", "llm"]]]) {
    routes[k] = withFallback(routes[k], keys);
  }
  return { routes, today, dayPayload, pullToday };
}

// 把网页传来的模型配置整理成 lib/llm.js 用的格式
function makeLlmCfg(c, llm) {
  c = c || {};
  const cfg = {
    protocol: llm.PROTOCOLS[c.protocol] ? c.protocol : "openai",
    baseUrl: String(c.baseUrl || "").trim(),
    apiKey: String(c.apiKey || "").trim(),
    model: String(c.model || "").trim(),
    maxTokens: Number(c.maxTokens) || 8192,
    contextWindow: Number(c.contextWindow) || 0,
    proxy: String(c.proxy || "").trim(),
    reasoning: ["none", "low", "medium", "high"].includes(c.reasoning) ? c.reasoning : "",
  };
  if (!cfg.baseUrl && cfg.protocol === "openai") throw new ApiError(400, "请先在「设置 → 模型」里填写 Base URL");
  return cfg;
}

module.exports = { createApi, ApiError, DATE_RE, makeLlmCfg };
