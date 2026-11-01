const test = require("node:test");
const assert = require("node:assert");
const g = require("../lib/generator");

const words = Array.from({ length: 63 }, (_, i) => ({ spelling: `w${i}`, response: i < 21 ? "FORGET" : "VAGUE" }));

test("自动模式约 4 篇", () => {
  assert.strictEqual(g.planBatches(words).length, 4);
});

test("每篇最多词数：长度不超上限，词多自动多拆", () => {
  const b = g.planBatches(words, { maxWords: 150 });
  assert.ok(b.length > 4);
  for (const x of b) {
    assert.ok(x.length <= 150);
    assert.ok(x.words.length <= g.wordsPerArticleCap(150));
    assert.strictEqual(x.maxWords, 150);
  }
  assert.strictEqual(b.reduce((n, x) => n + x.words.length, 0), 63);
});

test("上限最小 80，0 为自动", () => {
  assert.strictEqual(g.clampMaxWords(30), 80);
  assert.strictEqual(g.clampMaxWords(0), 0);
  assert.match(g.buildPrompt("kaoyan", words.slice(0, 5), 135, "考研", 150), /硬性上限 150 词/);
});
