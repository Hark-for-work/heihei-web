// 把网页打包进安卓 App（手机独立模式）：public/ + 离线词典 + 把 lib/ 打包成一个浏览器脚本 local.js。
// 用法：node scripts/build-android-web.js [输出目录，默认 android/app/src/main/assets/web]
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const OUT = path.resolve(process.argv[2] || path.join(ROOT, "android/app/src/main/assets/web"));

const MODULES = {
  net: "mobile/net-shim.js",
  db: "lib/db.js",
  api: "lib/api.js",
  momo: "lib/momo.js",
  llm: "lib/llm.js",
  generator: "lib/generator.js",
  dict: "lib/dict.js",
  backup: "lib/backup.js",
  runtime: "mobile/local-runtime.js",
};

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
copyDir(path.join(ROOT, "public"), OUT);
fs.copyFileSync(path.join(ROOT, "dict/ecdict-lite.tsv.gz"), path.join(OUT, "dict.tsv.gz"));

let bundle = `// 自动生成：scripts/build-android-web.js（不要手改）
(function () {
var process = { env: window.__momoEnv || {}, versions: {} };
var MOMO_VERSION = ${JSON.stringify(require("../package.json").version)};
var defs = {}, cache = {};
function req(name) {
  var key = String(name).replace(/^\\.\\//, "").replace(/\\.js$/, "");
  if (cache[key]) return cache[key].exports;
  if (!defs[key]) throw new Error("模块不存在：" + name);
  var module = { exports: {} };
  cache[key] = module;
  defs[key](module, module.exports, req, process);
  return module.exports;
}
`;
for (const [name, file] of Object.entries(MODULES)) {
  const src = fs.readFileSync(path.join(ROOT, file), "utf8");
  bundle += `defs[${JSON.stringify(name)}] = function (module, exports, require, process) {\n${src}\n};\n`;
}
bundle += `try { req("runtime"); } catch (e) { console.error(e); window.__momoLocalError = String(e && e.message || e); }\n})();\n`;
fs.writeFileSync(path.join(OUT, "local.js"), bundle);

const indexFile = path.join(OUT, "index.html");
let html = fs.readFileSync(indexFile, "utf8");
const tag = '<script src="/local.js"></script>';
html = html.replace(/(<script[^>]*src="\/?app\.js"[^>]*><\/script>)/, `${tag}\n  $1`);
if (!html.includes(tag)) throw new Error("index.html 里没找到 app.js 的 script 标签");
fs.writeFileSync(indexFile, html);
console.log(`已生成 ${OUT}（local.js ${(bundle.length / 1024).toFixed(0)} KB）`);
