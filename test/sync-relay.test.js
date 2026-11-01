// 多设备同步：经电脑中转的数据也要传到第三台设备；未来时间戳不能封住数据；按篇删除能同步
const test = require("node:test");
const assert = require("node:assert");
const { DB } = require("../lib/db");

const mk = () => new DB(":memory:");
function sync(phone, pc, st) {
  const t0 = Date.now();
  const imp = pc.importData(phone.exportData(st.push));
  void imp;
  const now = Date.now();
  const back = pc.exportData(st.pull);
  phone.importData(back);
  st.push = t0; st.pull = now;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test("手机 A 推给电脑的词，手机 B 之后也能收到", async () => {
  const pc = mk(), a = mk(), b = mk();
  const sa = { push: -1, pull: -1 }, sb = { push: -1, pull: -1 };
  a.saveWords("2026-10-30", [{ spelling: "relay" }], "manual");
  await wait(5);
  sync(b, pc, sb);
  await wait(5);
  sync(a, pc, sa);
  await wait(5);
  sync(b, pc, sb);
  assert.ok(b.getWords("2026-10-30").some((w) => w.spelling === "relay"));
});

test("未来时间的删除记录不会永久封住数据", async () => {
  const pc = mk();
  pc.importData({ tombstones: [{ tbl: "day_words", k1: "2026-10-30", k2: "x", at: 9e12 }] });
  const ts = pc.db.prepare("SELECT at FROM tombstones").get();
  assert.ok(ts.at < Date.now() + 11 * 60_000);
});

test("同步回来的数据不会来回反复", async () => {
  const pc = mk(), a = mk();
  const sa = { push: -1, pull: -1 };
  a.saveProgress("2026-10-30", { studyTimeMs: 60000, finished: 1, total: 2 }, { exact: true });
  a.saveWords("2026-10-30", [{ spelling: "loop" }], "manual");
  sync(a, pc, sa); await wait(5);
  sync(a, pc, sa); await wait(5);
  const out = a.exportData(sa.push);
  assert.equal(out.day_words.length + out.study_log.length + out.articles.length, 0);
});
