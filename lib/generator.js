// 把当天的错词分批，交给模型写成短文；校验目标词是否全部出现；为短文生成练习；语境查词。
const llm = require("./llm");

const STYLES = { kaoyan: "考试阅读", story: "趣味小故事" };
const EXAM_TARGETS = ["考研", "四级", "六级", "雅思", "托福", "GRE", "GMAT", "高考", "中考", "商务英语", "日常交流"];
const RESPONSE_ZH = { FORGET: "忘记", VAGUE: "模糊" };

const SYSTEM = "You are an expert English writer and teacher for Chinese learners preparing for English exams. "
  + "You write natural, coherent English, and you always return exactly one JSON object and nothing else.";

const EXAM_HINTS = {
  考研: "考研英语阅读 Part A：外刊评论风格，社科、教育、科技、心理、商业或环境话题。",
  四级: "大学英语四级阅读：话题贴近校园与社会生活，句子清晰，难度适中。",
  六级: "大学英语六级阅读：外刊/科普风格，句式比四级更复杂。",
  雅思: "雅思学术类阅读：学术科普，说明与论证结合。",
  托福: "托福阅读：大学教材式的学术说明文（自然科学、社会科学、艺术史等）。",
  GRE: "GRE 阅读：学术评论，论证密度高，用词精确。",
  GMAT: "GMAT 阅读：商业、经济或社会科学论证文。",
  高考: "高考英语阅读：话题积极，句子不过长。",
  中考: "中考英语阅读：简单清晰的叙述或说明。",
  商务英语: "商务英语：商业报道、职场案例或公司公告风格。",
  日常交流: "日常英语：生活化的随笔或专栏。",
};

function lengthRule(length, maxWords) {
  const paras = length < 160 ? "2-3" : "3-4";
  return maxWords ? `${paras} 段，总长约 ${length} 词，硬性上限 ${maxWords} 词（宁短勿超）。` : `${paras} 段，总长约 ${length} 词。`;
}

function styleRules(style, length, target, maxWords = 0) {
  if (style === "story") {
    return `文体：有趣、好记的英文小故事。
- 有具体人物、场景和一个小反转或笑点，画面感强，让人读完能记住情节。
- ${lengthRule(length, maxWords)}
- 语言生动但规范，句子长短结合；让每个目标词出现在一个能“看图记词”的情节里，用法要准确。
- 不要写成说教或词汇堆砌。`;
  }
  const hint = EXAM_HINTS[target] || EXAM_HINTS.考研;
  return `文体：${hint}
- ${lengthRule(length, maxWords)}首段引出现象或争议，中段论证并给出不同立场，末段收束。
- 正式书面语，适量使用从句、非谓语、插入语和 however / by contrast / rather than 等衔接；语气克制，有 may / tend to 之类的限定。
- 避免 "With the development of society"、"Every coin has two sides" 之类的模板句。
- 只模仿文体，不要照抄任何真题或外刊原文。`;
}

const OUTPUT_SPEC = `只输出一个 JSON 对象（不要 Markdown 代码块），结构如下：
{
  "title": "英文标题",
  "title_zh": "中文标题",
  "paragraphs": [
    {"en": "英文段落，目标词用 **双星号** 包起来", "zh": "这一段自然流畅的中文意思"}
  ],
  "glossary": [
    {"word": "目标词原形（与列表一致）", "form": "文中实际出现的形式", "pos": "词性，如 v. / n. / adj.",
     "meaning_zh": "结合本文用法的中文释义（6-20字）", "note": "一句简短的中文记忆提示或常见搭配"}
  ]
}`;

// 每篇最多能放多少个目标词：留约 60 词给上下文，每个目标词约需 8 词
function wordsPerArticleCap(maxWords) {
  return maxWords > 0 ? Math.max(4, Math.floor((maxWords - 60) / 8)) : Infinity;
}

const clampMaxWords = (v) => (Number(v) > 0 ? Math.min(Math.max(Math.round(Number(v)), 80), 1000) : 0);

// 约 60 词 → 4 篇；考试阅读与小故事交替；忘记的词均匀分到各篇。
// maxWords > 0 时每篇不超过这么多词，词多就自动多拆几篇。
function planBatches(words, { maxArticles = 5, maxWords = 0 } = {}) {
  const n = words.length;
  if (!n) return [];
  maxWords = clampMaxWords(maxWords);
  let k = n <= 12 ? 1 : n <= 28 ? 2 : n <= 45 ? 3 : n <= 72 ? 4 : maxArticles;
  if (maxWords) k = Math.min(Math.max(k, Math.ceil(n / wordsPerArticleCap(maxWords))), 20, n);
  const ordered = [...words.filter((w) => w.response === "FORGET"), ...words.filter((w) => w.response !== "FORGET")];
  const buckets = Array.from({ length: k }, () => []);
  ordered.forEach((w, i) => buckets[i % k].push(w));
  return buckets.map((b, idx) => {
    const style = idx % 2 === 0 ? "kaoyan" : "story";
    let length = Math.min(style === "story" ? 180 + b.length * 6 : 220 + b.length * 7, 360);
    if (maxWords) length = Math.min(length, Math.round(maxWords * 0.9));
    return { idx, style, words: b, length, maxWords };
  });
}

function buildPrompt(style, words, length, target, maxWords = 0) {
  const lines = words.map((w) => `- ${w.spelling}${RESPONSE_ZH[w.response] ? `（今天：${RESPONSE_ZH[w.response]}）` : ""}`);
  return `请用下面这些英语单词写一篇短文，帮助我在语境里复习它们。

目标单词（每个都必须自然出现至少一次，可以变换词形，例如时态、单复数、比较级）：
${lines.join("\n")}

${styleRules(style, length, target, maxWords)}

硬性要求：
1. 每个目标词出现时都用 **双星号** 包住实际使用的词形，例如 **deteriorated**；除目标词外不要加粗任何词。
2. 目标词的用法、搭配和词义必须正确，不要为了凑词扭曲句意。
3. 每段给出对应的中文意思（zh），是自然的意译，不是逐词直译。
4. glossary 必须覆盖全部 ${words.length} 个目标词，word 字段使用上面列表里的原形，meaning_zh 写本文语境下的意思。

${OUTPUT_SPEC}`;
}

// ---------------------------------------------------------------- 词形
const IRREGULAR = {
  be: ["am", "is", "are", "was", "were", "been", "being"], go: ["went", "gone", "goes"], do: ["did", "done", "does"],
  have: ["has", "had"], see: ["saw", "seen"], take: ["took", "taken"], give: ["gave", "given"], make: ["made"],
  come: ["came"], get: ["got", "gotten"], know: ["knew", "known"], think: ["thought"], bring: ["brought"],
  buy: ["bought"], catch: ["caught"], teach: ["taught"], seek: ["sought"], fight: ["fought"], find: ["found"],
  hold: ["held"], keep: ["kept"], leave: ["left"], lead: ["led"], lose: ["lost"], mean: ["meant"], meet: ["met"],
  pay: ["paid"], say: ["said"], sell: ["sold"], send: ["sent"], spend: ["spent"], stand: ["stood"], tell: ["told"],
  understand: ["understood"], write: ["wrote", "written"], begin: ["began", "begun"], break: ["broke", "broken"],
  choose: ["chose", "chosen"], drive: ["drove", "driven"], fall: ["fell", "fallen"], forget: ["forgot", "forgotten"],
  grow: ["grew", "grown"], rise: ["rose", "risen"], arise: ["arose", "arisen"], speak: ["spoke", "spoken"],
  steal: ["stole", "stolen"], swear: ["swore", "sworn"], tear: ["tore", "torn"], wear: ["wore", "worn"],
  bear: ["bore", "borne", "born"], bind: ["bound"], cling: ["clung"], dig: ["dug"], feed: ["fed"], flee: ["fled"],
  forbid: ["forbade", "forbidden"], freeze: ["froze", "frozen"], hide: ["hid", "hidden"], lay: ["laid"],
  lie: ["lay", "lain", "lying"], ride: ["rode", "ridden"], shake: ["shook", "shaken"], shrink: ["shrank", "shrunk"],
  sink: ["sank", "sunk"], slide: ["slid"], spin: ["spun"], spring: ["sprang", "sprung"], sting: ["stung"],
  stick: ["stuck"], strike: ["struck", "stricken"], strive: ["strove", "striven"], swing: ["swung"],
  undertake: ["undertook", "undertaken"], withdraw: ["withdrew", "withdrawn"], overcome: ["overcame"],
  foresee: ["foresaw", "foreseen"], mislead: ["misled"], child: ["children"], man: ["men"], woman: ["women"],
  foot: ["feet"], tooth: ["teeth"], mouse: ["mice"], phenomenon: ["phenomena"], criterion: ["criteria"],
  crisis: ["crises"], analysis: ["analyses"], hypothesis: ["hypotheses"], thesis: ["theses"], basis: ["bases"],
  medium: ["media"], datum: ["data"], stimulus: ["stimuli"], nucleus: ["nuclei"], good: ["better", "best"],
  bad: ["worse", "worst"], far: ["farther", "further", "farthest", "furthest"],
};
const VOWELS = "aeiou";

function wordForms(word) {
  const w = String(word).toLowerCase().trim();
  const f = new Set([w]);
  if (w.includes(" ")) return f;
  (IRREGULAR[w] || []).forEach((x) => f.add(x));
  ["s", "es", "ed", "d", "ing", "er", "est", "ly", "'s", "s'"].forEach((s) => f.add(w + s));
  if (w.endsWith("e")) ["ing", "ed", "er", "y"].forEach((s) => f.add(w.slice(0, -1) + s));
  if (w.endsWith("ie")) f.add(`${w.slice(0, -2)}ying`);
  if (/[^aeiou]y$/.test(w) && w.length > 2) ["ies", "ied", "ier", "iest", "ily"].forEach((s) => f.add(w.slice(0, -1) + s));
  if (/fe?$/.test(w)) f.add(w.replace(/fe?$/, "ves"));
  if (w.endsWith("le")) f.add(`${w.slice(0, -1)}y`);
  if (w.endsWith("ic")) ["ally", "ked", "king"].forEach((s) => f.add(w + s));
  if (w.length >= 3 && !(VOWELS + "wxy").includes(w.at(-1)) && VOWELS.includes(w.at(-2)) && !VOWELS.includes(w.at(-3))) {
    ["ed", "ing", "er", "est"].forEach((s) => f.add(w + w.at(-1) + s));
  }
  if (w.endsWith("ate")) ["ion", "ions"].forEach((s) => f.add(w.slice(0, -1) + s));
  return f;
}

function matchTarget(token, targets, glossaryForms = {}) {
  const t = String(token).toLowerCase().trim().replace(/^[\s.,;:!?"'()]+|[\s.,;:!?"'()]+$/g, "");
  for (const sp of targets) if (wordForms(sp).has(t)) return sp;
  for (const [sp, form] of Object.entries(glossaryForms)) if (form && t === form.toLowerCase()) return sp;
  for (const sp of targets) {
    const s = sp.toLowerCase();
    if (s.length >= 5 && (t.startsWith(s.slice(0, -1)) || s.startsWith(t)) && Math.abs(t.length - s.length) <= 4) return sp;
  }
  return null;
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function coverage(data, words) {
  const targets = words.map((w) => w.spelling);
  const gforms = {};
  for (const g of data.glossary || []) if (g.word) gforms[g.word] = g.form || "";
  const found = new Set();
  const full = (data.paragraphs || []).map((p) => p.en || "").join(" ");
  for (const m of full.matchAll(/\*\*(.+?)\*\*/g)) {
    const sp = matchTarget(m[1], targets, gforms);
    if (sp) found.add(sp.toLowerCase());
  }
  const plain = full.toLowerCase();
  for (const sp of targets) {
    if (found.has(sp.toLowerCase())) continue;
    for (const f of wordForms(sp)) {
      if (new RegExp(`(?<![a-z])${escapeRe(f)}(?![a-z])`).test(plain)) { found.add(sp.toLowerCase()); break; }
    }
  }
  return targets.filter((sp) => !found.has(sp.toLowerCase()));
}

const str = (v) => String(v ?? "").trim();

function sanitize(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new llm.LLMError("模型返回的 JSON 不是对象");
  let paras = [];
  for (const p of data.paragraphs || []) {
    if (typeof p === "string" && p.trim()) paras.push({ en: p.trim(), zh: "" });
    else if (p && typeof p === "object" && str(p.en)) paras.push({ en: str(p.en), zh: str(p.zh) });
  }
  // 兼容上游 MoBeiDanCi 的 article 字段
  if (!paras.length && (data.article_en || data.article)) {
    const en = String(data.article_en || data.article).split(/\n+/).filter((x) => x.trim());
    const zh = String(data.article_zh || "").split(/\n+/).filter((x) => x.trim());
    paras = en.map((e, i) => ({ en: e.trim(), zh: (zh[i] || "").trim() }));
  }
  if (!paras.length) throw new llm.LLMError("模型没有返回正文");
  const glossary = (data.glossary || []).filter((g) => g && g.word).map((g) => ({
    word: str(g.word), form: str(g.form), pos: str(g.pos), meaning_zh: str(g.meaning_zh || g.meaning), note: str(g.note || g.usage),
  }));
  return { title: str(data.title), title_zh: str(data.title_zh), paragraphs: paras, glossary };
}

async function fillGlossary(cfg, data, words) {
  const have = new Set(data.glossary.map((g) => g.word.toLowerCase()));
  const lack = words.map((w) => w.spelling).filter((sp) => !have.has(sp.toLowerCase()));
  if (!lack.length) return data;
  const text = data.paragraphs.map((p) => p.en).join("\n\n");
  const prompt = `下面是一篇英文短文：\n\n${text}\n\n请为这些词给出结合本文语境的释义：${lack.join(", ")}
只输出 JSON：{"glossary": [{"word": "原形", "form": "文中形式", "pos": "词性", "meaning_zh": "本文中的中文意思", "note": "简短记忆提示"}]}`;
  try {
    const { text: raw } = await llm.chat(cfg, [{ role: "system", content: SYSTEM }, { role: "user", content: prompt }], { temperature: 0.3 });
    const extra = sanitize({ paragraphs: ["x"], glossary: llm.parseJson(raw).glossary || [] });
    data.glossary.push(...extra.glossary);
  } catch { /* 释义缺了就在前端提示 */ }
  return data;
}

async function generateArticle(cfg, style, words, length, target = "考研", maxWords = 0) {
  const messages = [
    { role: "system", content: SYSTEM },
    { role: "user", content: buildPrompt(style, words, length, target, maxWords) },
  ];
  const { text: raw } = await llm.chat(cfg, messages);
  let data = sanitize(llm.parseJson(raw));
  let missing = coverage(data, words);
  if (missing.length && llm.fits(cfg, [...messages, { role: "assistant", content: raw }, { role: "user", content: "x".repeat(200) }])) {
    messages.push(
      { role: "assistant", content: raw },
      {
        role: "user",
        content: `上一版漏掉了这些目标词：${missing.join(", ")}。请在保持原有结构和情节的前提下改写，`
          + "确保每个目标词都自然出现至少一次并用 **双星号** 包住，glossary 覆盖全部目标词，重新输出完整 JSON。",
      },
    );
    try {
      const { text: raw2 } = await llm.chat(cfg, messages);
      const data2 = sanitize(llm.parseJson(raw2));
      const missing2 = coverage(data2, words);
      if (missing2.length <= missing.length) { data = data2; missing = missing2; }
    } catch { /* 保留第一版 */ }
  }
  data.target = style === "kaoyan" ? target : "";
  data = await fillGlossary(cfg, data, words);
  return { data, missing };
}

// ---------------------------------------------------------------- 练习（沿用上游的完形 / 选择题 / 复习卡）
async function generateDrills(cfg, article, target = "考研") {
  const text = (article.content.paragraphs || []).map((p) => p.en.replace(/\*\*/g, "")).join("\n\n");
  const words = (article.words || []).map((w) => w.spelling);
  const prompt = `下面是一篇英文短文，以及其中的目标词。请按「${target}」的出题习惯，为这些目标词出一套复习练习。

短文：
${text}

目标词：${words.join(", ")}

要求：
- cloze：完形/填空，每个目标词一题（最多 12 题）；sentence 是改写自短文或新造的英文句子，用 ____ 代替目标词，answer 是应填的词形，hint 是中文提示。
- questions：3-5 道阅读理解或词义选择题，options 为 4 个选项（以 "A. " "B. " 等开头），answer 只写字母，explanation 用中文解释。
- flashcards：每个目标词一张，front 是英文词 + 文中短语，back 是中文意思 + 一个新的英文例句。
- review_plan：一句中文复习建议。

只输出 JSON：{"cloze": [{"sentence": "", "answer": "", "hint": ""}], "questions": [{"question": "", "options": [""], "answer": "", "explanation": ""}], "flashcards": [{"front": "", "back": ""}], "review_plan": ""}`;
  const { text: raw } = await llm.chat(cfg, [{ role: "system", content: SYSTEM }, { role: "user", content: prompt }], { temperature: 0.6 });
  const d = llm.parseJson(raw);
  const arr = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : []);
  return {
    cloze: arr(d.cloze).map((c) => ({ sentence: str(c.sentence), answer: str(c.answer), hint: str(c.hint) })),
    questions: arr(d.questions).map((q) => ({
      question: str(q.question),
      options: Array.isArray(q.options) ? q.options.map(str).filter(Boolean) : [],
      answer: str(q.answer),
      explanation: str(q.explanation),
    })),
    flashcards: arr(d.flashcards).map((f) => ({ front: str(f.front), back: str(f.back) })),
    review_plan: str(d.review_plan),
  };
}

// ---------------------------------------------------------------- 点词查义
async function lookupWord(cfg, word, sentence) {
  const prompt = `句子：${sentence}
请解释句中单词 "${word}" 在这个句子里的意思。
只输出 JSON：{"word": "${word}", "lemma": "原形", "pos": "词性", "meaning_zh": "句中意思（6-20字）", "note": "一句简短补充（常见搭配或其他常用义）"}`;
  const { text } = await llm.chat(cfg, [{ role: "system", content: SYSTEM }, { role: "user", content: prompt }],
    { temperature: 0.2, timeoutMs: 120000 });
  const d = llm.parseJson(text);
  return { word: str(d.word || word), lemma: str(d.lemma), pos: str(d.pos), meaning_zh: str(d.meaning_zh), note: str(d.note) };
}

module.exports = {
  STYLES, EXAM_TARGETS, planBatches, clampMaxWords, wordsPerArticleCap, buildPrompt, wordForms, matchTarget, coverage, sanitize,
  generateArticle, generateDrills, lookupWord,
};
