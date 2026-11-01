// SQLite 存储：每天的背单词时长、词表、生成的短文（含练习）、查词缓存。
// 使用 Node 自带的 node:sqlite（Node ≥ 22.13），无需 npm 依赖。
// 墨墨 Token 与模型 API Key 只保存在浏览器里，永远不写进这里。

const SCHEMA = `
CREATE TABLE IF NOT EXISTS study_log (
  date          TEXT PRIMARY KEY,
  study_time_ms INTEGER NOT NULL DEFAULT 0,
  finished      INTEGER NOT NULL DEFAULT 0,
  total         INTEGER NOT NULL DEFAULT 0,
  fetched_at    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS day_words (
  date     TEXT NOT NULL,
  spelling TEXT NOT NULL,
  voc_id   TEXT,
  response TEXT,
  ord      INTEGER,
  is_new   INTEGER,
  source   TEXT NOT NULL DEFAULT 'momo',
  PRIMARY KEY (date, spelling)
);
CREATE TABLE IF NOT EXISTS articles (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  date       TEXT NOT NULL,
  idx        INTEGER NOT NULL,
  style      TEXT NOT NULL,
  title      TEXT,
  title_zh   TEXT,
  content    TEXT NOT NULL,
  words      TEXT NOT NULL,
  missing    TEXT NOT NULL DEFAULT '[]',
  drills     TEXT,
  model      TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_articles_date ON articles(date, idx);
CREATE TABLE IF NOT EXISTS lookups (
  word       TEXT NOT NULL,
  context    TEXT NOT NULL,
  result     TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (word, context)
);
CREATE TABLE IF NOT EXISTS tombstones (
  tbl  TEXT NOT NULL,
  k1   TEXT NOT NULL,
  k2   TEXT NOT NULL,
  at   INTEGER NOT NULL,
  PRIMARY KEY (tbl, k1, k2)
);
`;

const now = () => Math.floor(Date.now() / 1000);
const nowMs = () => Date.now();

function parseJson(text, fallback) {
  try { return text == null ? fallback : JSON.parse(text); } catch { return fallback; }
}

class DB {
  constructor(file, { driver } = {}) {
    if (driver) {
      this.db = driver; // 安卓 App 里传入原生 SQLite 适配器
    } else {
      const fs = require("node:fs");
      const path = require("node:path");
      const { DatabaseSync } = require("node:sqlite");
      fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
      this.db = new DatabaseSync(file);
      this.db.exec("PRAGMA journal_mode=WAL;");
    }
    this.db.exec(SCHEMA);
    // 旧版（Python v0.1.x）数据库没有这些列，补上
    this.addColumn("day_words", "source", "TEXT NOT NULL DEFAULT 'momo'");
    this.addColumn("articles", "drills", "TEXT");
    // 同步 / 备份用的修改时间（毫秒）
    this.addColumn("day_words", "updated_at", "INTEGER NOT NULL DEFAULT 0");
    this.addColumn("articles", "auto", "INTEGER NOT NULL DEFAULT 0"); // 1 = 电脑后台自动生成
    if (this.addColumn("articles", "updated_at", "INTEGER NOT NULL DEFAULT 0")) {
      this.db.exec("UPDATE articles SET updated_at=created_at*1000 WHERE updated_at=0");
    }
    this.addSyncStamps();
    try { this.fixDuplicatedDays(); } catch { /* 修不了也不影响使用 */ }
  }

  // 同步用的「本机写入时间」local_at（本机时钟，毫秒）：任何写入（包括从别的设备导入）都会刷新它。
  // 增量导出按 local_at 判断，经电脑中转的数据也能继续传给其它设备；冲突仍按 updated_at 判断。
  addSyncStamps() {
    const NOW = "CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)";
    const init = { study_log: "fetched_at*1000", day_words: "updated_at", articles: "updated_at", tombstones: "at" };
    for (const [t, from] of Object.entries(init)) {
      if (this.addColumn(t, "local_at", "INTEGER NOT NULL DEFAULT 0")) this.db.exec(`UPDATE ${t} SET local_at=${from}`);
      this.db.exec(`CREATE TRIGGER IF NOT EXISTS ${t}_local_ins AFTER INSERT ON ${t} BEGIN UPDATE ${t} SET local_at=${NOW} WHERE rowid=NEW.rowid; END`);
      this.db.exec(`CREATE TRIGGER IF NOT EXISTS ${t}_local_upd AFTER UPDATE ON ${t} WHEN NEW.local_at = OLD.local_at BEGIN UPDATE ${t} SET local_at=${NOW} WHERE rowid=NEW.rowid; END`);
    }
  }

  addColumn(table, column, type) {
    const cols = this.db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    if (cols.includes(column)) return false;
    this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    return true;
  }

  tx(fn) {
    this.db.exec("BEGIN");
    try { const r = fn(); this.db.exec("COMMIT"); return r; } catch (e) { this.db.exec("ROLLBACK"); throw e; }
  }

  // ---- 学习时长 ----------------------------------------------------------
  // exact=true：用墨墨确认过是今天的数据，直接覆盖（之前误存的昨天数据会被纠正）；否则取最大值
  saveProgress(date, { studyTimeMs = 0, finished = 0, total = 0 }, { exact = false } = {}) {
    // 不用 ON CONFLICT DO UPDATE：安卓 11 以下自带的 SQLite 不支持
    this.tx(() => {
      this.db.prepare("INSERT OR IGNORE INTO study_log(date, study_time_ms, finished, total, fetched_at) VALUES(?,0,0,0,0)").run(date);
      this.db.prepare(`UPDATE study_log SET study_time_ms=${exact ? "?" : "MAX(study_time_ms, ?)"}, finished=?, total=?, fetched_at=? WHERE date=?`)
        .run(Math.round(studyTimeMs), finished | 0, total | 0, Math.max(now(), (this.getProgress(date)?.fetched_at || 0) + 1), date);
    });
  }

  /** date 之前最近一天的学习记录 */
  prevProgress(date) {
    return this.db.prepare("SELECT * FROM study_log WHERE date < ? AND study_time_ms > 0 ORDER BY date DESC LIMIT 1").get(date) || null;
  }

  /** 墨墨今天还没初始化时误存成今天的数据：删掉今天的时长记录和从墨墨拉来的词（手动补的词和短文保留） */
  dropStaleDay(date) {
    const t = nowMs();
    this.tx(() => {
      this.zeroDay(date);
      const rows = this.db.prepare("SELECT spelling FROM day_words WHERE date=? AND source='momo'").all(date);
      for (const r of rows) this.tombstone("day_words", date, r.spelling, t);
      this.db.prepare("DELETE FROM day_words WHERE date=? AND source='momo'").run(date);
    });
  }

  // 清零而不是删除：fetched_at 更新后，同步时其它设备上的同一天也会被纠正
  zeroDay(date) {
    const old = this.getProgress(date);
    if (!old) return;
    this.db.prepare("UPDATE study_log SET study_time_ms=0, finished=0, total=0, fetched_at=? WHERE date=?").run(Math.max(now(), old.fetched_at + 1), date);
  }

  /** 旧版本留下的错误：某天的时长、完成数和前一天完全一样（墨墨那天还没初始化时拉到的是前一天的数据），删掉这些重复天 */
  fixDuplicatedDays() {
    const rows = this.db.prepare("SELECT * FROM study_log WHERE study_time_ms > 0 ORDER BY date").all();
    const out = [];
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1], b = rows[i];
      if (b.study_time_ms > 0 && b.study_time_ms === a.study_time_ms && b.finished === a.finished && b.total === a.total) out.push(b.date);
    }
    for (const d of out) {
      const prev = rows[rows.findIndex((r) => r.date === d) - 1].date;
      const key = (x) => this.db.prepare("SELECT spelling, response FROM day_words WHERE date=? AND source='momo' ORDER BY spelling").all(x).map((r) => r.spelling + ":" + r.response).join("|");
      const same = key(d) === key(prev);
      const t = nowMs();
      this.tx(() => {
        this.zeroDay(d);
        if (!same) return;
        for (const r of this.db.prepare("SELECT spelling FROM day_words WHERE date=? AND source='momo'").all(d)) this.tombstone("day_words", d, r.spelling, t);
        this.db.prepare("DELETE FROM day_words WHERE date=? AND source='momo'").run(d);
      });
    }
    return out;
  }

  getProgress(date) {
    return this.db.prepare("SELECT * FROM study_log WHERE date=?").get(date) || null;
  }

  // ---- 词表 --------------------------------------------------------------
  saveWords(date, items, source = "momo") {
    const ins = this.db.prepare("INSERT OR IGNORE INTO day_words(date, spelling, source, updated_at) VALUES(?,?,?,0)");
    const upd = this.db.prepare(`UPDATE day_words SET voc_id=COALESCE(?, voc_id), response=?, ord=?, is_new=?, source=?, updated_at=?
      WHERE date=? AND spelling=?`);
    const t = nowMs();
    this.tx(() => {
      for (const it of items) {
        ins.run(date, it.spelling, it.source || source);
        upd.run(it.vocId || null, it.response || null, it.order ?? null, it.isNew ? 1 : 0, it.source || source, t, date, it.spelling);
      }
    });
  }

  setVocIds(date, map) {
    const st = this.db.prepare("UPDATE day_words SET voc_id=?, updated_at=? WHERE date=? AND lower(spelling)=lower(?)");
    const t = nowMs();
    this.tx(() => { for (const [sp, id] of Object.entries(map)) st.run(id, t, date, sp); });
  }

  removeWord(date, spelling) {
    this.db.prepare("DELETE FROM day_words WHERE date=? AND spelling=?").run(date, spelling);
    this.tombstone("day_words", date, spelling);
  }

  tombstone(tbl, k1, k2, at = nowMs()) {
    this.db.prepare("INSERT OR REPLACE INTO tombstones(tbl, k1, k2, at) VALUES(?,?,?,?)").run(tbl, k1, k2, at);
  }

  getWords(date) {
    return this.db.prepare("SELECT * FROM day_words WHERE date=? ORDER BY ord IS NULL, ord, spelling").all(date)
      .map((r) => ({ ...r }));
  }

  // ---- 短文 --------------------------------------------------------------
  replaceArticle(date, idx, style, data, words, missing, model, { auto = false } = {}) {
    return this.tx(() => {
      this.db.prepare("DELETE FROM articles WHERE date=? AND idx=?").run(date, idx);
      return this.db.prepare(`INSERT INTO articles(date, idx, style, title, title_zh, content, words, missing, model, created_at, updated_at, auto)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(date, idx, style, data.title || "", data.title_zh || "",
        JSON.stringify(data), JSON.stringify(words), JSON.stringify(missing || []), model || "", now(), nowMs(), auto ? 1 : 0).lastInsertRowid;
    });
  }

  saveDrills(id, drills) {
    this.db.prepare("UPDATE articles SET drills=?, updated_at=? WHERE id=?").run(JSON.stringify(drills), nowMs(), id);
  }

  /** 重新生成成功后删掉多出来的旧篇（idx >= keep），按篇记删除，同步到其它设备 */
  trimArticles(date, keep) {
    return this.tx(() => {
      const rows = this.db.prepare("SELECT DISTINCT idx FROM articles WHERE date=? AND idx>=?").all(date, keep);
      for (const r of rows) {
        this.db.prepare("DELETE FROM articles WHERE date=? AND idx=?").run(date, r.idx);
        this.tombstone("articles", date, String(r.idx));
      }
      return rows.length;
    });
  }

  clearArticles(date) {
    this.db.prepare("DELETE FROM articles WHERE date=?").run(date);
    this.tombstone("articles", date, "*");
  }

  getArticle(id) {
    const r = this.db.prepare("SELECT * FROM articles WHERE id=?").get(id);
    return r ? this.inflate(r) : null;
  }

  getArticles(date) {
    return this.db.prepare("SELECT * FROM articles WHERE date=? ORDER BY idx").all(date).map((r) => this.inflate(r));
  }

  inflate(r) {
    return {
      ...r,
      content: parseJson(r.content, {}),
      words: parseJson(r.words, []),
      missing: parseJson(r.missing, []),
      drills: parseJson(r.drills, null),
    };
  }

  // ---- 历史 --------------------------------------------------------------
  listDays(limit = -1) {
    return this.db.prepare(`SELECT d.date,
        COALESCE(s.study_time_ms, 0) AS study_time_ms,
        COALESCE(s.finished, 0) AS finished,
        COALESCE(s.total, 0) AS total,
        (SELECT COUNT(*) FROM day_words w WHERE w.date=d.date AND w.response='FORGET') AS forget,
        (SELECT COUNT(*) FROM day_words w WHERE w.date=d.date AND w.response='VAGUE') AS vague,
        (SELECT COUNT(*) FROM articles a WHERE a.date=d.date) AS articles
      FROM (SELECT date FROM study_log UNION SELECT date FROM articles UNION SELECT date FROM day_words) d
      LEFT JOIN study_log s ON s.date=d.date
      ORDER BY d.date DESC LIMIT ?`).all(limit).map((r) => ({ ...r }));
  }

  /** 全部学习时长记录（画日/周/月曲线用） */
  studySeries() {
    return this.db.prepare("SELECT date, study_time_ms FROM study_log WHERE study_time_ms > 0 ORDER BY date").all()
      .map((r) => ({ date: r.date, ms: r.study_time_ms }));
  }

  // ---- 查词缓存 ----------------------------------------------------------
  getLookup(word, context) {
    const r = this.db.prepare("SELECT result FROM lookups WHERE word=? AND context=?").get(word, context);
    return r ? parseJson(r.result, null) : null;
  }

  saveLookup(word, context, result) {
    this.db.prepare("INSERT OR REPLACE INTO lookups(word, context, result, created_at) VALUES(?,?,?,?)")
      .run(word, context, JSON.stringify(result), now());
  }

  // ---- 同步 / 备份 ------------------------------------------------------
  /** 导出 since（毫秒）之后改动的数据；since<0 导出全部 */
  exportData(since = -1) {
    const q = (sql, ...a) => this.db.prepare(sql).all(...a).map((r) => ({ ...r }));
    return {
      format: "momo-kan-data", version: 1, exportedAt: nowMs(),
      study_log: q("SELECT date, study_time_ms, finished, total, fetched_at FROM study_log WHERE local_at > ?", since),
      day_words: q("SELECT date, spelling, voc_id, response, ord, is_new, source, updated_at FROM day_words WHERE local_at > ?", since),
      articles: q("SELECT date, idx, style, title, title_zh, content, words, missing, drills, model, created_at, updated_at, auto FROM articles WHERE local_at > ?", since),
      tombstones: q("SELECT tbl, k1, k2, at FROM tombstones WHERE local_at > ?", since),
    };
  }

  /** 合并另一台设备 / 备份的数据：时长以最近一次从墨墨拉取的为准，词表和短文按修改时间新的为准，删除记录照样生效 */
  importData(data) {
    const n = { study_log: 0, day_words: 0, articles: 0, tombstones: 0 };
    if (!data || typeof data !== "object") return n;
    const DATE = /^\d{4}-\d{2}-\d{2}$/;
    // 时间戳最多比本机快 10 分钟：时钟偏快的设备或伪造的请求不能「封住」数据
    const capMs = nowMs() + 10 * 60_000, capS = Math.ceil(capMs / 1000);
    const ms = (v) => Math.min(Number(v) || 0, capMs);
    this.tx(() => {
      for (const t of data.tombstones || []) {
        if (!t || !["day_words", "articles"].includes(t.tbl)) continue;
        const at = ms(t.at);
        const old = this.db.prepare("SELECT at FROM tombstones WHERE tbl=? AND k1=? AND k2=?").get(t.tbl, t.k1, t.k2);
        if (old && old.at >= at) continue;
        this.tombstone(t.tbl, String(t.k1), String(t.k2), at);
        if (t.tbl === "day_words") this.db.prepare("DELETE FROM day_words WHERE date=? AND spelling=? AND updated_at < ?").run(t.k1, t.k2, at);
        else if (t.k2 === "*") this.db.prepare("DELETE FROM articles WHERE date=? AND updated_at < ?").run(t.k1, at);
        else if (/^\d+$/.test(String(t.k2))) this.db.prepare("DELETE FROM articles WHERE date=? AND idx=? AND updated_at < ?").run(t.k1, Number(t.k2), at);
        n.tombstones += 1;
      }
      const slIns = this.db.prepare("INSERT OR IGNORE INTO study_log(date, study_time_ms, finished, total, fetched_at) VALUES(?,0,0,0,0)");
      const slUpd = this.db.prepare(`UPDATE study_log SET study_time_ms=CASE WHEN ? > fetched_at THEN ? ELSE study_time_ms END,
          finished=CASE WHEN ? > fetched_at THEN ? ELSE finished END,
          total=CASE WHEN ? > fetched_at THEN ? ELSE total END,
          fetched_at=MAX(fetched_at, ?) WHERE date=? AND fetched_at < ?`);
      for (const r of data.study_log || []) {
        if (!r || !DATE.test(r.date)) continue;
        const f = Math.min(Number(r.fetched_at) || 0, capS);
        slIns.run(r.date);
        if (slUpd.run(f, Number(r.study_time_ms) || 0, f, r.finished | 0, f, r.total | 0, f, r.date, f).changes) n.study_log += 1;
      }
      for (const r of data.day_words || []) {
        if (!r || !DATE.test(r.date) || !r.spelling) continue;
        const at = ms(r.updated_at);
        const old = this.db.prepare("SELECT updated_at FROM day_words WHERE date=? AND spelling=?").get(r.date, r.spelling);
        if (old && old.updated_at >= at) continue;
        const ts = this.db.prepare("SELECT at FROM tombstones WHERE tbl='day_words' AND k1=? AND k2=?").get(r.date, r.spelling);
        if (ts && ts.at > at) continue;
        this.db.prepare(`INSERT OR REPLACE INTO day_words(date, spelling, voc_id, response, ord, is_new, source, updated_at)
          VALUES(?,?,?,?,?,?,?,?)`).run(r.date, r.spelling, r.voc_id ?? null, r.response ?? null, r.ord ?? null, r.is_new ? 1 : 0, r.source || "momo", at);
        n.day_words += 1;
      }
      // 短文冲突规则：手动生成（手机或网页上点的）优先于电脑后台自动生成；同类的按修改时间新的为准。按天整体判断，避免两套短文混在一起。
      const incoming = (data.articles || []).filter((r) => r && DATE.test(r.date) && r.content != null);
      const byDate = new Map();
      for (const r of incoming) (byDate.get(r.date) || byDate.set(r.date, []).get(r.date)).push(r);
      for (const [date, list] of byDate) {
        const ts = this.db.prepare("SELECT at FROM tombstones WHERE tbl='articles' AND k1=? AND k2='*'").get(date);
        const idxTs = this.db.prepare("SELECT k2, at FROM tombstones WHERE tbl='articles' AND k1=? AND k2<>'*'").all(date);
        const tsAt = (i) => Math.max(ts ? ts.at : 0, ...idxTs.filter((x) => Number(x.k2) === Number(i)).map((x) => x.at));
        const live = list.filter((r) => !(tsAt(r.idx) > ms(r.updated_at)));
        if (!live.length) continue;
        const localManual = this.db.prepare("SELECT COUNT(*) AS n FROM articles WHERE date=? AND auto=0").get(date).n;
        const localAuto = this.db.prepare("SELECT COUNT(*) AS n FROM articles WHERE date=? AND auto=1").get(date).n;
        const inManual = live.some((r) => !r.auto);
        let use = live;
        if (localManual && !inManual) continue; // 本机有手动生成的，丢弃对方自动生成的
        if (inManual) {
          use = live.filter((r) => !r.auto);
          if (localAuto) this.db.prepare("DELETE FROM articles WHERE date=? AND auto=1").run(date);
        }
        for (const r of use) {
          const at = ms(r.updated_at);
          const old = this.db.prepare("SELECT MAX(updated_at) AS u FROM articles WHERE date=? AND idx=?").get(date, r.idx);
          if (old && old.u != null && old.u >= at) continue;
          const str = (v, d) => (v == null ? d : typeof v === "string" ? v : JSON.stringify(v));
          this.db.prepare("DELETE FROM articles WHERE date=? AND idx=?").run(date, r.idx);
          this.db.prepare(`INSERT INTO articles(date, idx, style, title, title_zh, content, words, missing, drills, model, created_at, updated_at, auto)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(date, r.idx | 0, r.style || "story", r.title || "", r.title_zh || "",
            str(r.content, "{}"), str(r.words, "[]"), str(r.missing, "[]"), r.drills == null ? null : str(r.drills, null),
            r.model || "", Number(r.created_at) || now(), at, r.auto ? 1 : 0);
          n.articles += 1;
        }
      }
    });
    return n;
  }

  counts() {
    const c = (t) => this.db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
    return { days: this.listDays().length, articles: c("articles"), words: c("day_words") };
  }
}

module.exports = { DB };
