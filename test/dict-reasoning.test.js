const test = require("node:test");
const assert = require("node:assert");
const dict = require("../lib/dict");
const llm = require("../lib/llm");

test("离线词典：原词、变形、查不到", () => {
  assert.ok(dict.lookupLocal("resilient").meaning_zh);
  assert.strictEqual(dict.lookupLocal("went").lemma, "go");
  assert.strictEqual(dict.lookupLocal("studies").lemma, "study");
  assert.strictEqual(dict.lookupLocal("qwzxv"), null);
});

test("思考等级按协议换成对应参数", () => {
  const m = [{ role: "user", content: "hi" }];
  const p = (protocol, reasoning) => llm.buildPayload({ protocol, baseUrl: "http://127.0.0.1:1/v1", model: "x", reasoning }, m, { temperature: 0.5, maxTokens: 8192 });
  assert.strictEqual(p("openai", "").reasoning_effort, undefined);
  assert.strictEqual(p("openai", "low").reasoning_effort, "low");
  assert.deepStrictEqual(p("openai", "none").thinking, { type: "disabled" });
  assert.deepStrictEqual(p("responses", "high").reasoning, { effort: "high" });
  assert.strictEqual(p("anthropic", "medium").thinking.budget_tokens, 7168);
  assert.strictEqual(p("gemini", "none").generationConfig.thinkingConfig.thinkingBudget, 0);
  assert.strictEqual(p("ollama", "none").think, false);
});
