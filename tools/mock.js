// 开发用假服务：同时模拟墨墨开放 API 和 OpenAI 兼容 Chat Completions。
//   node tools/mock.js                      # 监听 127.0.0.1:9177
//   MOMO_API_BASE=http://127.0.0.1:9177/open/api/v1 npm start
// 设置里模型地址填 http://127.0.0.1:9177/v1，Token 随便填（填 bad 返回 401）。
const http = require("node:http");

const WORDS = ("ambiguous deteriorate reluctant inevitable undermine compel scrutiny alleviate "
  + "contemplate diligent elaborate feasible hinder impose intrinsic lucrative mitigate "
  + "notorious obsolete plausible prevail profound refute resilient skeptical subtle "
  + "sustain tentative trivial vulnerable advocate allocate coherent comply conceive "
  + "constrain deduce denote discrete diverse eminent empirical endorse erode explicit "
  + "foster futile grant incentive inherent integrity legitimate manifest marginal "
  + "novel offset paradox perceive pervasive pragmatic prospect rational rigorous").split(" ");

function send(res, code, obj) {
  const b = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(b) });
  res.end(b);
}

// 各协议的请求体统一成 messages
function toMessages(url, body) {
  if (body.messages && !url.includes("/v1/messages")) return body.messages;
  if (url.includes("/v1/messages")) return body.messages;
  if (body.input) return body.input;
  if (body.contents) return body.contents.map((c) => ({ role: c.role === "model" ? "assistant" : "user", content: c.parts.map((x) => x.text).join("") }));
  return [];
}

function wrap(url, text) {
  if (url.includes("/responses")) return { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text }] }] };
  if (url.includes("/v1/messages")) return { content: [{ type: "text", text }], stop_reason: "end_turn" };
  if (url.includes(":generateContent")) return { candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }] };
  if (url.endsWith("/api/chat")) return { message: { role: "assistant", content: text }, done: true, done_reason: "stop" };
  return { choices: [{ message: { role: "assistant", content: text }, finish_reason: "stop" }] };
}

function chat(rawBody) {
  const body = { ...rawBody };
  const prompt = body.messages.at(-1).content;
  let out;
  if (prompt.includes("请解释句中单词")) {
    const w = prompt.match(/单词 "(.+?)"/)[1];
    out = { word: w, lemma: w.toLowerCase(), pos: "n.", meaning_zh: `${w} 的句中意思（示例）`, note: "示例补充" };
  } else if (prompt.includes('只输出 JSON：{"ok"')) {
    out = { ok: true };
  } else if (prompt.includes("复习练习")) {
    const words = prompt.match(/目标词：(.+)/)[1].split(", ");
    out = {
      cloze: words.map((w) => ({ sentence: `The result was ____ (${w[0]}...).`, answer: w, hint: `${w} 的中文提示` })),
      questions: [{ question: "What is the main idea?", options: ["A. one", "B. two", "C. three", "D. four"], answer: "B", explanation: "示例解析" }],
      flashcards: words.map((w) => ({ front: w, back: `${w} 的意思；An example with ${w}.` })),
      review_plan: "今晚睡前再读一遍，明天早上做一次完形。",
    };
  } else {
    let words = [...prompt.matchAll(/^- ([A-Za-z' -]+?)(?:（|$)/gm)].map((m) => m[1]);
    if (!words.length) words = [...body.messages[1].content.matchAll(/^- ([A-Za-z' -]+?)(?:（|$)/gm)].map((m) => m[1]);
    const story = prompt.includes("小故事");
    const paras = [];
    for (let i = 0; i < words.length; i += 4) {
      const s = words.slice(i, i + 4).map((w, j) => (j % 2
        ? `The narrator found it hard to stay **${w}** about the matter.`
        : `Critics argue that the **${w}** effect is often overlooked, however.`)).join(" ");
      paras.push({ en: (story ? "Once upon a time, " : "In recent years, ") + s, zh: "这是这一段的中文意思（示例），用于测试界面排版和对齐。" });
    }
    out = {
      title: story ? "A Small Story" : "The Hidden Cost of Convenience",
      title_zh: story ? "一个小故事" : "便利的隐性代价",
      paragraphs: paras,
      glossary: words.map((w) => ({ word: w, form: w, pos: "adj.", meaning_zh: `${w} 在文中的意思`, note: "示例记忆提示" })),
    };
  }
  return `<think>...</think>${JSON.stringify(out)}`;
}

http.createServer(async (req, res) => {
  let raw = "";
  for await (const c of req) raw += c;
  const body = raw ? JSON.parse(raw) : {};
  const auth = req.headers.authorization || "";
  if (req.url.startsWith("/open/api/v1/")) {
    if (auth.endsWith("bad")) return send(res, 401, { success: false, errors: [{ code: "common_unauthorized", msg: "Authorization failed" }] });
    if (req.url.endsWith("get_today_items")) {
      return send(res, 200, {
        success: true,
        data: {
          today_items: WORDS.map((w, i) => ({
            voc_id: `id${i}`, voc_spelling: w, order: i, is_new: false, is_finished: true,
            first_response: ["FORGET", "VAGUE", "FAMILIAR"][i % 3],
          })),
        },
      });
    }
    // MOCK_STALE=1：模拟墨墨今天还没初始化（返回的是昨天的记录）
    if (req.url.endsWith("query_study_records")) {
      const at = new Date(Date.now() - (process.env.MOCK_STALE ? 86400000 : 0)).toISOString();
      return send(res, 200, { success: true, data: { records: (body.voc_ids || []).map((id) => ({ voc_id: id, voc_spelling: "", last_study_date: at, study_count: 1, tags: [] })), count: 0 } });
    }
    if (req.url.endsWith("get_study_progress")) return send(res, 200, { success: true, data: { progress: { finished: 120, total: 130, study_time: 2460000 } } });
    if (req.url.endsWith("vocabulary/query")) return send(res, 200, { success: true, data: { voc: (body.spellings || []).map((s, i) => ({ id: `q${i}`, spelling: s })) } });
    if (req.url.endsWith("add_words")) return send(res, 200, { success: true, data: { added_count: body.words.length } });
    if (req.url.endsWith("notepads")) return send(res, 200, { success: true, data: { notepad: { title: body.notepad.title } } });
    return send(res, 404, { success: false, errors: [{ code: "nf", msg: "nf" }] });
  }
  const gen = ["/chat/completions", "/responses", "/v1/messages", "/api/chat"].some((x) => req.url.endsWith(x)) || req.url.includes(":generateContent");
  if (gen) {
    if (req.url.endsWith("/v1/messages") && !body.max_tokens) return send(res, 400, { error: { message: "max_tokens required" } });
    const messages = toMessages(req.url, body);
    return send(res, 200, wrap(req.url, chat({ messages })));
  }
  if (req.method === "GET" && req.url.startsWith("/api/tags")) return send(res, 200, { models: [{ name: "qwen3:8b" }, { name: "deepseek-r1:14b" }] });
  if (req.method === "GET" && req.url.startsWith("/v1beta/models")) return send(res, 200, { models: [{ name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] }] });
  if (req.method === "GET" && req.url.startsWith("/v1/models")) return send(res, 200, { data: [{ id: "deepseek-v4.1-flash" }, { id: "mock-model" }] });
  return send(res, 404, { error: "nf" });
}).listen(9177, "127.0.0.1", () => console.log("mock on http://127.0.0.1:9177"));
