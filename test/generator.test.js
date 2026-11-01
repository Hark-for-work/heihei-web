const test = require("node:test");
const assert = require("node:assert");
const gen = require("../lib/generator");
const llm = require("../lib/llm");

test("约 60 词拆成 4 篇，考试风与小故事交替，忘记词均匀分布", () => {
  const words = Array.from({ length: 60 }, (_, i) => ({ spelling: `w${i}`, response: i < 20 ? "FORGET" : "VAGUE" }));
  const b = gen.planBatches(words);
  assert.strictEqual(b.length, 4);
  assert.deepStrictEqual(b.map((x) => x.style), ["kaoyan", "story", "kaoyan", "story"]);
  for (const x of b) assert.strictEqual(x.words.filter((w) => w.response === "FORGET").length, 5);
});

test("词形校验认得变形和不规则变化", () => {
  const words = ["deteriorate", "reluctant", "arise", "phenomenon", "ambiguous"].map((spelling) => ({ spelling }));
  const data = { paragraphs: [{ en: "It **deteriorated**. She was **reluctantly** honest. Problems arose. Such phenomena exist." }], glossary: [] };
  assert.deepStrictEqual(gen.coverage(data, words), ["ambiguous"]);
});

test("模型 JSON 容错：去掉 think 与代码块", () => {
  const t = llm.stripThink('<think>hmm</think>```json\n{"a":1}\n```');
  assert.deepStrictEqual(llm.parseJson(t), { a: 1 });
});

test("Base URL 规范化", () => {
  assert.strictEqual(llm.normalizeUrl("http://127.0.0.1:8000/v1"), "http://127.0.0.1:8000/v1/chat/completions");
  assert.strictEqual(llm.normalizeUrl("http://localhost:11434"), "http://localhost:11434/v1/chat/completions");
  assert.strictEqual(llm.normalizeUrl("https://api.deepseek.com"), "https://api.deepseek.com/chat/completions");
});

test("sanitize 兼容上游 article 字段", () => {
  const d = gen.sanitize({ title: "T", article: "Para one.\nPara two.", glossary: [{ word: "x", meaning: "义" }] });
  assert.strictEqual(d.paragraphs.length, 2);
  assert.strictEqual(d.glossary[0].meaning_zh, "义");
});
