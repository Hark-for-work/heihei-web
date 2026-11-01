/* 主题：浅色 / 深色 / 跟随系统 + 种子色生成 M3 tonal 配色（无依赖，放在 <head> 里同步执行，避免闪烁）。
   色调（tone）按 M3 的 L* 定义换算到 OKLCH 亮度，色相/色度在 OKLCH 里取，超出 sRGB 时降低色度。
   设置按设备保存在 localStorage（momo.theme），不参与多设备同步：电脑浅色、手机深色互不影响。
   安卓 App 内：window.MomoAndroid.setTheme(...) 让状态栏/导航栏/原生页面跟着变。 */
(function () {
  "use strict";
  var KEY = "momo.theme";
  var DEFAULT = { mode: "system", seed: "#006C4C" };
  var PRESETS = [
    { id: "#006C4C", name: "森林绿" },
    { id: "#00658E", name: "湖蓝" },
    { id: "#3F5AA9", name: "靛青" },
    { id: "#6750A4", name: "紫藤" },
    { id: "#984061", name: "樱粉" },
    { id: "#9C4323", name: "赤陶" },
    { id: "#7C5800", name: "琥珀" },
    { id: "#5D5F5F", name: "石墨" },
  ];

  // ---- 颜色换算 ---------------------------------------------------------
  function hexToRgb(hex) {
    var h = String(hex || "").replace("#", "");
    if (h.length === 3) h = h.replace(/./g, "$&$&");
    var n = parseInt(h, 16);
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (v) { return v / 255; });
  }
  function toLin(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function fromLin(c) { return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }
  function rgbToOklch(rgb) {
    var r = toLin(rgb[0]), g = toLin(rgb[1]), b = toLin(rgb[2]);
    var l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    var m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    var s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    var L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
    var A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
    var B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
    var H = Math.atan2(B, A) * 180 / Math.PI;
    return [L, Math.sqrt(A * A + B * B), H < 0 ? H + 360 : H];
  }
  function oklchToLinRgb(L, C, H) {
    var a = C * Math.cos(H * Math.PI / 180), b = C * Math.sin(H * Math.PI / 180);
    var l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
    var m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
    var s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ];
  }
  function inGamut(c) { return c.every(function (v) { return v >= -0.0005 && v <= 1.0005; }); }
  function hex(c) {
    return "#" + c.map(function (v) {
      var x = Math.round(Math.min(1, Math.max(0, fromLin(Math.min(1, Math.max(0, v))))) * 255);
      return (x < 16 ? "0" : "") + x.toString(16);
    }).join("").toUpperCase();
  }
  // M3 tone = CIE L*；灰色的 OKLab L = cbrt(Y)
  function toneToL(t) {
    if (t <= 0) return 0;
    if (t >= 100) return 1;
    var fy = (t + 16) / 116;
    var y = t > 8 ? fy * fy * fy : t / 903.2962963;
    return Math.cbrt(y);
  }
  function tone(h, c, t) {
    var L = toneToL(t);
    if (t >= 100) return "#FFFFFF";
    if (t <= 0) return "#000000";
    var lo = 0, hi = c, rgb = oklchToLinRgb(L, c, h);
    if (!inGamut(rgb)) {
      for (var i = 0; i < 18; i++) {
        var mid = (lo + hi) / 2;
        if (inGamut(oklchToLinRgb(L, mid, h))) lo = mid; else hi = mid;
      }
      rgb = oklchToLinRgb(L, lo, h);
    }
    return hex(rgb);
  }

  // ---- 生成配色 ---------------------------------------------------------
  function scheme(seedHex, dark) {
    var rgb = hexToRgb(seedHex) || hexToRgb(DEFAULT.seed);
    var o = rgbToOklch(rgb), h = o[2], c = o[1];
    var grey = c < 0.03; // 石墨等低饱和种子：整套偏中性
    var P = function (t) { return tone(h, grey ? 0.014 : Math.max(c, 0.11), t); };
    var S = function (t) { return tone(h, grey ? 0.012 : 0.04, t); };
    var T = function (t) { return tone((h + 60) % 360, grey ? 0.02 : 0.06, t); };
    var N = function (t) { return tone(h, grey ? 0.003 : 0.008, t); };
    var NV = function (t) { return tone(h, grey ? 0.006 : 0.017, t); };
    var F = function (t) { return tone(38, 0.1, t); };   // 「忘记」扩展色：珊瑚
    var E = function (t) { return tone(25, 0.2, t); };   // error
    var d = dark;
    return {
      "--md-primary": P(d ? 80 : 40), "--md-on-primary": P(d ? 20 : 100),
      "--md-primary-container": P(d ? 30 : 90), "--md-on-primary-container": P(d ? 90 : 10),
      "--md-secondary": S(d ? 80 : 40), "--md-on-secondary": S(d ? 20 : 100),
      "--md-secondary-container": S(d ? 30 : 90), "--md-on-secondary-container": S(d ? 90 : 10),
      "--md-tertiary": T(d ? 80 : 40), "--md-on-tertiary": T(d ? 20 : 100),
      "--md-tertiary-container": T(d ? 30 : 90), "--md-on-tertiary-container": T(d ? 90 : 10),
      "--md-error": E(d ? 80 : 40), "--md-error-container": E(d ? 30 : 90), "--md-on-error-container": E(d ? 90 : 10),
      "--md-surface": N(d ? 6 : 98), "--md-surface-dim": N(d ? 6 : 87), "--md-surface-bright": N(d ? 24 : 98),
      "--md-surface-container-lowest": N(d ? 4 : 100), "--md-surface-container-low": N(d ? 10 : 96),
      "--md-surface-container": N(d ? 12 : 94), "--md-surface-container-high": N(d ? 17 : 92),
      "--md-surface-container-highest": N(d ? 22 : 90),
      "--md-on-surface": N(d ? 90 : 10), "--md-on-surface-variant": NV(d ? 80 : 30),
      "--md-outline": NV(d ? 60 : 50), "--md-outline-variant": NV(d ? 30 : 80),
      "--md-inverse-surface": N(d ? 90 : 20), "--md-inverse-on-surface": N(d ? 20 : 95), "--md-inverse-primary": P(d ? 40 : 80),
      "--x-success": d ? "#8DD88A" : "#2E6B30",
      "--x-forget": F(d ? 80 : 40), "--x-forget-container": F(d ? 30 : 90), "--x-on-forget-container": F(d ? 90 : 10),
    };
  }

  // ---- 状态 -------------------------------------------------------------
  function load() {
    try {
      var t = JSON.parse(localStorage.getItem(KEY) || "null") || {};
      return {
        mode: ["system", "light", "dark"].indexOf(t.mode) >= 0 ? t.mode : DEFAULT.mode,
        seed: t.seed === "wallpaper" || hexToRgb(t.seed) ? t.seed : DEFAULT.seed,
      };
    } catch (e) { return { mode: DEFAULT.mode, seed: DEFAULT.seed }; }
  }
  var state = load();
  var android = window.MomoAndroid || null;
  var mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  var androidSystemDark = null; // App 告诉我们的系统深色状态（WebView 的媒体查询不一定可靠）
  var listeners = [];

  function wallpaperColor() {
    try { var c = android && android.wallpaperColor && android.wallpaperColor(); return hexToRgb(c) ? c : ""; } catch (e) { return ""; }
  }
  function systemDark() {
    if (androidSystemDark !== null) return androidSystemDark;
    try { if (android && android.systemDark) return !!android.systemDark(); } catch (e) { /* 旧版 App */ }
    return !!(mq && mq.matches);
  }
  function resolved() {
    var dark = state.mode === "dark" || (state.mode === "system" && systemDark());
    var seed = state.seed === "wallpaper" ? (wallpaperColor() || DEFAULT.seed) : state.seed;
    return { dark: dark, seed: seed };
  }
  var applied = false, animTimer = null;
  function apply() {
    var r = resolved();
    var root0 = document.documentElement;
    if (applied) {
      root0.classList.add("theme-anim");
      clearTimeout(animTimer);
      animTimer = setTimeout(function () { root0.classList.remove("theme-anim"); }, 420);
    }
    applied = true;
    var vars = scheme(r.seed, r.dark);
    var root = document.documentElement;
    for (var k in vars) root.style.setProperty(k, vars[k]);
    root.setAttribute("data-scheme", r.dark ? "dark" : "light");
    root.style.colorScheme = r.dark ? "dark" : "light";
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i++) { metas[i].setAttribute("content", vars["--md-surface"]); metas[i].removeAttribute("media"); }
    try {
      if (android && android.setTheme) android.setTheme(state.mode, state.seed, r.seed, vars["--md-surface"], r.dark);
    } catch (e) { /* 旧版 App 没有这个接口 */ }
    listeners.forEach(function (fn) { try { fn(api.get()); } catch (e) { /* ignore */ } });
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 隐私模式 */ } }

  var api = {
    PRESETS: PRESETS,
    DEFAULT_SEED: DEFAULT.seed,
    get: function () { var r = resolved(); return { mode: state.mode, seed: state.seed, color: r.seed, dark: r.dark, wallpaper: wallpaperColor() }; },
    set: function (patch) {
      if (patch.mode && ["system", "light", "dark"].indexOf(patch.mode) >= 0) state.mode = patch.mode;
      if (patch.seed && (patch.seed === "wallpaper" || hexToRgb(patch.seed))) state.seed = patch.seed.toUpperCase ? (patch.seed === "wallpaper" ? "wallpaper" : patch.seed.toUpperCase()) : patch.seed;
      save(); apply();
    },
    onChange: function (fn) { listeners.push(fn); },
    // 安卓 App 调用：系统深浅色或壁纸变了
    systemChanged: function (dark) { androidSystemDark = !!dark; apply(); },
    scheme: scheme,
  };
  window.momoTheme = api;
  if (mq) {
    var onMq = function () { if (state.mode === "system" && androidSystemDark === null) apply(); };
    if (mq.addEventListener) mq.addEventListener("change", onMq); else if (mq.addListener) mq.addListener(onMq);
  }
  window.addEventListener("storage", function (e) { if (e.key === KEY) { state = load(); apply(); } });
  apply();
})();
