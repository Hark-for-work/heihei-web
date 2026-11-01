const test = require("node:test");
const assert = require("node:assert");
const { DB } = require("../lib/db");
const { createApi } = require("../lib/api");

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const TODAY = ymd(new Date());
const Y = new Date(); Y.setDate(Y.getDate() - 1); const YDAY = ymd(Y);

function setup(lastStudy, prog = { studyTimeMs: 1800000, finished: 120, total: 120 }) {
  const db = new DB(":memory:");
  const momo = {
    todayItems: async () => [{ vocId: "v1", spelling: "ambiguous", response: "FORGET", order: 0 }, { vocId: "v2", spelling: "novel", response: "VAGUE", order: 1 }],
    studyProgress: async () => prog,
    studyRecords: async () => [{ voc_id: "v1", last_study_date: lastStudy }, { voc_id: "v2", last_study_date: lastStudy }],
    cnDate: require("../lib/momo").cnDate,
  };
  return { db, api: createApi({ db, momo, llm: {}, gen: {}, dict: {} }) };
}

test("墨墨还没初始化今天：拿到昨天的数据不存成今天", async () => {
  const { db, api } = setup(Y.toISOString());
  const r = await api.routes["POST /api/today"]({ token: "x" });
  assert.equal(r.stale, YDAY);
  assert.equal(r.fetched, 0);
  assert.equal(db.getWords(TODAY).length, 0);
  assert.ok(!db.getProgress(TODAY) || db.getProgress(TODAY).study_time_ms === 0);
});

test("今天的数据：覆盖之前误存的值", async () => {
  const { db, api } = setup(new Date().toISOString(), { studyTimeMs: 60000, finished: 5, total: 120 });
  db.saveProgress(TODAY, { studyTimeMs: 1800000, finished: 120, total: 120 });
  const r = await api.routes["POST /api/today"]({ token: "x" });
  assert.ok(!r.stale);
  assert.equal(db.getProgress(TODAY).study_time_ms, 60000);
  assert.equal(db.getWords(TODAY).length, 2);
});

test("查不到学习记录时：和上一天完全一样就当旧数据", async () => {
  const { db, api } = setup(null);
  db.saveProgress(YDAY, { studyTimeMs: 1800000, finished: 120, total: 120 });
  const r = await api.routes["POST /api/progress"]({ token: "x" });
  assert.equal(r.stale, YDAY);
});

test("启动时修复旧版本留下的重复天", () => {
  const db = new DB(":memory:");
  db.saveProgress("2026-10-28", { studyTimeMs: 1000, finished: 3, total: 3 });
  db.saveProgress("2026-10-29", { studyTimeMs: 1000, finished: 3, total: 3 });
  db.saveProgress("2026-10-30", { studyTimeMs: 2000, finished: 4, total: 4 });
  assert.deepEqual(db.fixDuplicatedDays(), ["2026-10-29"]);
  assert.equal(db.getProgress("2026-10-29").study_time_ms, 0);
  assert.equal(db.getProgress("2026-10-30").study_time_ms, 2000);
});

test("同步：更晚拉取的时长为准", () => {
  const a = new DB(":memory:");
  a.saveProgress(TODAY, { studyTimeMs: 1800000, finished: 120, total: 120 });
  const row = a.getProgress(TODAY);
  a.importData({ study_log: [{ ...row, study_time_ms: 60000, fetched_at: row.fetched_at + 5 }] });
  assert.equal(a.getProgress(TODAY).study_time_ms, 60000);
  a.importData({ study_log: [{ ...row, study_time_ms: 999999, fetched_at: row.fetched_at - 5 }] });
  assert.equal(a.getProgress(TODAY).study_time_ms, 60000);
});
