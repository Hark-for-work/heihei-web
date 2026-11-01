// 黑黑看单词 前端（Vue 3，基于 MoBeiDanCi 二改）。
// 模型输出一律通过 Vue 插值渲染（自动转义），不使用 v-html。
const { createApp, reactive, ref, computed, watch, watchEffect, onMounted, onBeforeUnmount } = Vue;

const RESP_ZH = { FORGET: "忘记", VAGUE: "模糊", FAMILIAR: "认识", WELL_FAMILIAR: "熟知" };
const EXAM_TARGETS = ["考研", "四级", "六级", "雅思", "托福", "GRE", "GMAT", "高考", "中考", "商务英语", "日常交流"];
const TABS = [
  { id: "read", name: "阅读" },
  { id: "glossary", name: "词表" },
  { id: "cloze", name: "完形" },
  { id: "quiz", name: "测验" },
  { id: "cards", name: "卡片" },
];
const ICONS = {
  back: "M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z",
  chevron: "M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z",
  palette: "M12 3a9 9 0 0 0 0 18c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3 4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z",
  person: "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z",
  chip: "M20 9V7c0-1.1-.9-2-2-2h-3V2h-2v3h-2V2H9v3H6c-1.1 0-2 .9-2 2v2H1v2h3v2H1v2h3v2c0 1.1.9 2 2 2h3v3h2v-3h2v3h2v-3h3c1.1 0 2-.9 2-2v-2h3v-2h-3v-2h3V9h-3zm-4 7H8V8h8v8z",
  article: "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z",
  cloud: "M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z",
  info: "M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z",
  computer: "M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z",
  folder: "M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z",
  favorite: "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z",
  download: "M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z",
  bug: "M20 8h-2.81a5.985 5.985 0 0 0-1.82-1.96L17 4.41 15.59 3l-2.17 2.17a6.002 6.002 0 0 0-2.83 0L8.41 3 7 4.41l1.62 1.63C7.88 6.55 7.26 7.22 6.81 8H4v2h2.09c-.05.33-.09.66-.09 1v1H4v2h2v1c0 .34.04.67.09 1H4v2h2.81c1.04 1.79 2.97 3 5.19 3s4.15-1.21 5.19-3H20v-2h-2.09c.05-.33.09-.66.09-1v-1h2v-2h-2v-1c0-.34-.04-.67-.09-1H20V8zm-6 8h-4v-2h4v2zm0-4h-4v-2h4v2z",
  logout: "M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z",
  code: "M9.4 16.6 4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0 4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z",
  link: "M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z",
  flame: "M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z",
  flag: "M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z",
  more: "M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z",
  add: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z",
  playlist: "M14 10H3v2h11v-2zm0-4H3v2h11V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM3 16h7v-2H3v2z",
  fast: "M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z",
  note: "M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15l-5-2.18L7 18V5h10v13z",
  textFormat: "M9 4v3h5v12h3V7h5V4H9zm-6 8h3v7h3v-7h3V9H3v3z",
  story: "M19 1l-5 5v11l5-4.5V1zM1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5V6c-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6zm22 13.5V6c-.6-.45-1.25-.75-2-1v13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5v2c1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5v-1.1z",
  openNew: "M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z",
  key: "M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z",
  phone: "M16 1H8C6.34 1 5 2.34 5 4v16c0 1.66 1.34 3 3 3h8c1.66 0 3-1.34 3-3V4c0-1.66-1.34-3-3-3zm-2 20h-4v-1h4v1zm3.25-3H6.75V4h10.5v14z",
  today: "M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-2 .9-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z",
  history: "M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z",
  settings: "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z",
  refresh: "M17.65 6.35A7.958 7.958 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z",
  spark: "M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15z",
  book: "M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1z",
  timer: "M15 1H9v2h6V1zm-4 13h2V8h-2v6zm8.03-6.61 1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42A8.962 8.962 0 0 0 12 4c-4.97 0-9 4.03-9 9s4.02 9 9 9a8.994 8.994 0 0 0 7.03-14.61zM12 20c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z",
  done: "M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
  forget: "M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z",
  vague: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zM7 11h10v2H7z",
  check: "M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
  close: "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
};

// ---------------------------------------------------------------- 本地存储（浏览器；开启同步时另存一份到本地服务）
const LS = {
  get(k, d) { try { const v = localStorage.getItem(`momo.${k}`); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { localStorage.setItem(`momo.${k}`, JSON.stringify(v)); },
  del(k) { localStorage.removeItem(`momo.${k}`); },
};

const PROTOCOLS = [
  { id: "openai", name: "OpenAI 兼容（Chat Completions）", base: "http://127.0.0.1:8000/v1" },
  { id: "responses", name: "OpenAI Responses", base: "https://api.openai.com/v1" },
  { id: "anthropic", name: "Anthropic Messages", base: "https://api.anthropic.com" },
  { id: "gemini", name: "Google Gemini", base: "https://generativelanguage.googleapis.com" },
  { id: "ollama", name: "Ollama 原生", base: "http://127.0.0.1:11434" },
];
const PROXY_MODES = [
  { id: "direct", name: "直连" },
  { id: "env", name: "跟随环境变量" },
  { id: "custom", name: "自定义代理" },
];
const MAX_WORDS_CHIPS = [0, 120, 150, 200, 250, 300];
const CONTEXT_CHIPS = [8192, 32768, 131072, 200000, 1048576];
const PRESETS = [
  { name: "本地 vLLM / llama.cpp", protocol: "openai", baseUrl: "http://127.0.0.1:8000/v1", model: "deepseek-v4.1-flash", maxTokens: 8192, contextWindow: 200000 },
  { name: "LM Studio", protocol: "openai", baseUrl: "http://127.0.0.1:1234/v1", model: "", maxTokens: 8192, contextWindow: 32768 },
  { name: "Ollama", protocol: "ollama", baseUrl: "http://127.0.0.1:11434", model: "", maxTokens: 4096, contextWindow: 8192 },
  { name: "DeepSeek 官方", protocol: "openai", baseUrl: "https://api.deepseek.com", model: "deepseek-flash", maxTokens: 8192, contextWindow: 65536 },
  { name: "OpenAI", protocol: "responses", baseUrl: "https://api.openai.com/v1", model: "gpt-4.1-mini", maxTokens: 8192, contextWindow: 128000 },
  { name: "Anthropic Claude", protocol: "anthropic", baseUrl: "https://api.anthropic.com", model: "claude-sonnet-4-5", maxTokens: 8192, contextWindow: 200000 },
  { name: "Google Gemini", protocol: "gemini", baseUrl: "https://generativelanguage.googleapis.com", model: "gemini-2.5-flash", maxTokens: 8192, contextWindow: 1048576 },
  { name: "OpenRouter", protocol: "openai", baseUrl: "https://openrouter.ai/api/v1", model: "", maxTokens: 8192, contextWindow: 131072 },
  { name: "自定义（空白）", protocol: "openai", baseUrl: "", model: "", maxTokens: 8192, contextWindow: 32768 },
];
const newId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function makeProfile(fields = {}) {
  return {
    id: newId(), name: "新模型", protocol: "openai", baseUrl: "", apiKey: "", model: "",
    maxTokens: 8192, contextWindow: 32768, proxyMode: "direct", proxyUrl: "", reasoning: "", ...fields,
  };
}

function cleanProfile(p) {
  const q = makeProfile();
  for (const k of Object.keys(q)) if (p[k] !== undefined && p[k] !== null) q[k] = p[k];
  if (!PROTOCOLS.some((x) => x.id === q.protocol)) q.protocol = "openai";
  if (!PROXY_MODES.some((x) => x.id === q.proxyMode)) q.proxyMode = "direct";
  if (!REASONING.some((x) => x.id === q.reasoning)) q.reasoning = "";
  q.maxTokens = Math.max(256, Number(q.maxTokens) || 8192);
  q.contextWindow = Math.max(0, Number(q.contextWindow) || 0);
  q.name = String(q.name || "未命名").slice(0, 40);
  // DeepSeek 已停用的旧模型名 → 现行的 deepseek-flash
  if (/api\.deepseek\.com/.test(q.baseUrl) && /^deepseek-(chat|reasoner)$/.test(q.model)) q.model = "deepseek-flash";
  return q;
}

// 「空白设置」：没有墨墨 Token，模型也都没填 Key/地址（新设备的默认值）
function blankSettings(st) {
  if (!st || typeof st !== "object") return true;
  const profiles = Array.isArray(st.profiles) ? st.profiles : [];
  return !st.token && profiles.every((p) => !p || (!p.apiKey && !p.baseUrl));
}

function loadStore() {
  // 兼容 v0.1.x / v0.2.0 的单一模型设置，以及上游 MoBeiDanCi 的旧键名
  let up = {};
  try { up = JSON.parse(localStorage.getItem("maimemo-story-lab-settings") || "{}"); } catch { up = {}; }
  let profiles = (LS.get("profiles", []) || []).map(cleanProfile);
  if (!profiles.length) {
    const baseUrl = LS.get("baseUrl", LS.get("base_url", up.llmBaseUrl || ""));
    profiles = [makeProfile({
      name: "本地模型", baseUrl, model: LS.get("model", up.llmModel || "deepseek-v4.1-flash"),
      apiKey: LS.get("apiKey", LS.get("api_key", up.llmApiKey || "")), contextWindow: 200000,
    })];
  }
  const activeId = profiles.some((p) => p.id === LS.get("activeProfile")) ? LS.get("activeProfile") : profiles[0].id;
  const lookupId = profiles.some((p) => p.id === LS.get("lookupProfile")) ? LS.get("lookupProfile") : "";
  return {
    token: LS.get("token", up.maimemoToken || ""),
    momoProxyMode: LS.get("momoProxyMode", "direct"),
    momoProxyUrl: LS.get("momoProxyUrl", ""),
    target: EXAM_TARGETS.includes(LS.get("target", "")) ? LS.get("target") : "考研",
    maxWords: Number(LS.get("maxWords", 0)) || 0,
    lookupMode: ["dict", "local", "ai"].includes(LS.get("lookupMode", "")) ? LS.get("lookupMode") : "dict",
    autoGenerate: LS.get("autoGenerate", true) !== false,
    fallbackId: LS.get("fallbackProfile", ""),
    profiles, activeId, lookupId,
  };
}

function saveStore(st) {
  LS.set("token", st.token);
  LS.set("momoProxyMode", st.momoProxyMode);
  LS.set("momoProxyUrl", st.momoProxyUrl);
  LS.set("target", st.target);
  LS.set("maxWords", Number(st.maxWords) || 0);
  LS.set("lookupMode", st.lookupMode || "dict");
  LS.set("autoGenerate", st.autoGenerate !== false);
  LS.set("fallbackProfile", st.fallbackId || "");
  LS.set("profiles", st.profiles);
  LS.set("activeProfile", st.activeId);
  LS.set("lookupProfile", st.lookupId);
  ["baseUrl", "base_url", "model", "apiKey", "api_key"].forEach(LS.del);
}

const REASONING = [
  { id: "", name: "默认" }, { id: "none", name: "关闭" }, { id: "low", name: "低" }, { id: "medium", name: "中" }, { id: "high", name: "高" },
];
const LOOKUP_MODES = [
  { id: "dict", name: "在线词典" }, { id: "local", name: "离线词典" }, { id: "ai", name: "AI 语境释义" },
];
const proxyValue = (mode, url) => (mode === "env" ? "env" : mode === "custom" ? String(url || "").trim() : "");

function profileCfg(p) {
  if (!p) return null;
  return {
    name: p.name, protocol: p.protocol, baseUrl: p.baseUrl, apiKey: p.apiKey, model: p.model,
    maxTokens: p.maxTokens, contextWindow: p.contextWindow, proxy: proxyValue(p.proxyMode, p.proxyUrl), reasoning: p.reasoning || "",
  };
}

// 安卓 App 的「手机独立模式」由 local.js 提供 window.MomoLocal：接口在手机本地执行，数据存手机，电脑在线时自动同步
const LOCAL = typeof window !== "undefined" && window.MomoLocal ? window.MomoLocal : null;

async function api(path, body) {
  if (LOCAL) return LOCAL.api(path, body);
  const opt = body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
  let res;
  try { res = await fetch(path, opt); } catch { throw new Error("无法连接本地服务，请确认 npm start 正在运行"); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `请求失败（${res.status}）`), { status: res.status });
  return data;
}

// ---------------------------------------------------------------- 格式化
function fmtDuration(ms) {
  const min = Math.round((ms || 0) / 60000);
  if (min < 60) return `${min} 分钟`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} 小时 ${m} 分` : `${h} 小时`;
}
// 大号数字用：拆成 [{ n: "12", u: "小时" }, { n: "5", u: "分" }]，数字大、单位小，窄屏也不会被截断
function durParts(ms) {
  const min = Math.round((ms || 0) / 60000);
  if (min < 60) return [{ n: String(min), u: "分钟" }];
  const h = Math.floor(min / 60), m = min % 60;
  return m ? [{ n: String(h), u: "小时" }, { n: String(m), u: "分" }] : [{ n: String(h), u: "小时" }];
}
// 柱子顶上的短标签
function fmtShort(ms) {
  const min = Math.round((ms || 0) / 60000);
  if (!min) return "";
  if (min < 60) return `${min}分`;
  const h = min / 60;
  return `${h >= 10 ? Math.round(h) : Math.round(h * 10) / 10}时`;
}
function fmtDate(d) {
  if (!d) return "";
  const [y, m, dd] = d.split("-").map(Number);
  return `${m} 月 ${dd} 日 · 周${"日一二三四五六"[new Date(y, m - 1, dd).getDay()]}`;
}
function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function escapeHtml(v) {
  return String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
function sanitizeFilename(v) {
  return String(v || "黑黑看单词").replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().slice(0, 80) || "黑黑看单词";
}

// ---------------------------------------------------------------- 词形匹配（与 lib/generator.js 一致的简化版）
const VOW = "aeiou";
function wordForms(word) {
  const w = String(word).toLowerCase().trim();
  const f = new Set([w]);
  if (w.includes(" ")) return f;
  ["s", "es", "ed", "d", "ing", "er", "est", "ly", "'s"].forEach((s) => f.add(w + s));
  if (w.endsWith("e")) ["ing", "ed", "er"].forEach((s) => f.add(w.slice(0, -1) + s));
  if (w.endsWith("ie")) f.add(`${w.slice(0, -2)}ying`);
  if (/[^aeiou]y$/.test(w)) ["ies", "ied", "ier", "iest", "ily"].forEach((s) => f.add(w.slice(0, -1) + s));
  if (/fe?$/.test(w)) f.add(w.replace(/fe?$/, "ves"));
  if (w.endsWith("le")) f.add(`${w.slice(0, -1)}y`);
  if (w.endsWith("ic")) f.add(`${w}ally`);
  if (w.length >= 3 && !(VOW + "wxy").includes(w.at(-1)) && VOW.includes(w.at(-2)) && !VOW.includes(w.at(-3))) {
    ["ed", "ing", "er", "est"].forEach((s) => f.add(w + w.at(-1) + s));
  }
  return f;
}

function buildMatcher(article) {
  const words = article.words || [];
  const map = new Map();
  for (const w of words) for (const f of wordForms(w.spelling)) if (!map.has(f)) map.set(f, w.spelling);
  for (const g of article.content.glossary || []) {
    const hit = words.find((w) => w.spelling.toLowerCase() === (g.word || "").toLowerCase());
    if (g.form) map.set(g.form.toLowerCase(), hit ? hit.spelling : g.word);
  }
  const loose = (token) => {
    const t = token.toLowerCase().replace(/^[^a-z]+|[^a-z']+$/g, "");
    if (map.has(t)) return map.get(t);
    for (const w of words) {
      const s = w.spelling.toLowerCase();
      if (s.length >= 5 && (t.startsWith(s.slice(0, -1)) || s.startsWith(t)) && Math.abs(t.length - s.length) <= 4) return w.spelling;
    }
    return null;
  };
  const exact = (token) => map.get(token.toLowerCase().replace(/^[^a-z]+|[^a-z']+$/g, "")) || null;
  return { loose, exact };
}

// 把一段英文拆成 token：t=目标词，w=普通词，s=其它文字
function tokenize(en, matcher, respOf) {
  const out = [];
  const pushPlain = (text) => {
    const re = /[A-Za-z][A-Za-z'’-]*/g;
    let last = 0;
    let m;
    while ((m = re.exec(text))) {
      if (m.index > last) out.push({ k: "s", x: text.slice(last, m.index) });
      const tok = m[0];
      const sp = tok.length > 2 ? matcher.exact(tok) : null;
      out.push(sp ? { k: "t", x: tok, sp, r: respOf.get(sp.toLowerCase()) || "" } : { k: "w", x: tok });
      last = m.index + tok.length;
    }
    if (last < text.length) out.push({ k: "s", x: text.slice(last) });
  };
  String(en || "").split(/\*\*(.+?)\*\*/g).forEach((part, i) => {
    if (i % 2 === 1) {
      const sp = matcher.loose(part);
      if (sp) out.push({ k: "t", x: part, sp, r: respOf.get(sp.toLowerCase()) || "" });
      else pushPlain(part);
    } else pushPlain(part);
  });
  return out;
}

function sentenceAround(tokens, index) {
  const text = tokens.map((t) => t.x).join("");
  const pos = tokens.slice(0, index).reduce((n, t) => n + t.x.length, 0);
  const start = Math.max(text.lastIndexOf(". ", pos), text.lastIndexOf("! ", pos), text.lastIndexOf("? ", pos));
  const ends = [". ", "! ", "? "].map((s) => text.indexOf(s, pos)).filter((i) => i >= 0);
  const end = ends.length ? Math.min(...ends) + 1 : text.length;
  return text.slice(start < 0 ? 0 : start + 2, end).trim();
}

const styleName = (style, target) => (style === "story" ? "趣味小故事" : `${target || "考研"}阅读`);

// ---- M3 下拉菜单（代替原生 <select>：原生弹出的列表在手机/WebView 上不是 Material 风格）
const MSelect = {
  props: { modelValue: { default: "" }, options: { type: Array, default: () => [] }, placeholder: { type: String, default: "请选择" }, inline: Boolean, ariaLabel: String },
  emits: ["update:modelValue", "change"],
  setup(props, { emit }) {
    const open = ref(false);
    const root = ref(null);
    const menuStyle = ref({});
    const current = computed(() => props.options.find((o) => o.value === props.modelValue));
    const onWin = (e) => { if (e.type === "keydown" && e.key !== "Escape") return; open.value = false; };
    watch(open, (v) => {
      const f = v ? "addEventListener" : "removeEventListener";
      window[f]("resize", onWin); window[f]("keydown", onWin);
      document[f]("scroll", onWin, true);
    });
    function toggle() {
      if (open.value) { open.value = false; return; }
      const r = root.value.getBoundingClientRect();
      const h = Math.min(336, props.options.length * 48 + 16);
      const below = window.innerHeight - r.bottom;
      const up = below < h + 12 && r.top > below;
      const w = Math.max(r.width, props.inline ? 200 : 112);
      const left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
      menuStyle.value = { left: `${left}px`, width: `${w}px`, maxHeight: `${up ? Math.min(h, r.top - 12) : Math.min(h, below - 12)}px`,
        top: up ? "auto" : `${r.bottom + 4}px`, bottom: up ? `${window.innerHeight - r.top + 4}px` : "auto", transformOrigin: up ? "bottom" : "top" };
      open.value = true;
    }
    function pick(o) {
      if (o.disabled) return;
      open.value = false;
      emit("update:modelValue", o.value);
      emit("change", o.value);
    }
    return { open, root, menuStyle, current, toggle, pick };
  },
  template: `<div class="m-select" :class="{ inline }" ref="root">
    <button type="button" class="m-select-field" :class="{ open }" :aria-label="ariaLabel" aria-haspopup="listbox" :aria-expanded="open" @click.prevent="toggle">
      <span class="m-select-value" :class="{ placeholder: !current }">{{ current ? current.label : placeholder }}</span>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5z"/></svg>
    </button>
    <teleport to="body">
      <div v-if="open" class="m-menu-scrim" @pointerdown.prevent="open = false"></div>
      <div v-if="open" class="m-menu" role="listbox" :style="menuStyle">
        <button v-for="o in options" :key="String(o.value)" type="button" class="m-menu-item" role="option"
                :class="{ selected: o.value === modelValue }" :aria-selected="o.value === modelValue" :disabled="o.disabled" @click="pick(o)">
          <span>{{ o.label }}</span>
          <svg v-if="o.value === modelValue" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
        </button>
      </div>
    </teleport>
  </div>`,
};

createApp({
  setup() {
    const store = reactive(loadStore());
    saveStore(store); // 完成旧设置迁移
    // 电脑同步（设置 → 电脑同步，一个总开关）：开着时设置存到电脑上的服务里、手机 App 的数据和电脑双向同步、
    // 生成交给电脑的模型；关掉后这台设备完全独立，不再连电脑。旧版的「多设备同步」开关（syncSettings）自动沿用。
    const PCSYNC_BRIDGE = typeof window !== "undefined" && window.MomoAndroid && typeof window.MomoAndroid.pcSync === "function";
    const initialPcSync = PCSYNC_BRIDGE ? !!window.MomoAndroid.pcSync() : LS.get("pcSync", LS.get("syncSettings", true)) !== false;
    const sync = reactive({ on: initialPcSync, status: "", at: 0 });
    let applying = false;
    let pushTimer = null;
    // 同步状态（v0.6.2 起不再比较各设备的时钟）：
    //   settingsBase  上次和电脑对齐时电脑那份设置的版本号；settingsDirty  之后本机改过设置
    //   settingsJoined  这台设备已经和电脑对齐过至少一次（没对齐过时永远先用电脑的）
    const syncPayload = () => JSON.parse(JSON.stringify({
      token: store.token, momoProxyMode: store.momoProxyMode, momoProxyUrl: store.momoProxyUrl, target: store.target,
      maxWords: store.maxWords, lookupMode: store.lookupMode, autoGenerate: store.autoGenerate, fallbackId: store.fallbackId, profiles: store.profiles, activeId: store.activeId, lookupId: store.lookupId,
    }));
    const filled = (p) => !!(p && (p.apiKey || p.baseUrl));
    const sameProfile = (a, b) => a.id === b.id || (a.baseUrl === b.baseUrl && a.model === b.model && a.protocol === b.protocol && (a.apiKey || "") === (b.apiKey || ""));
    // 用电脑上的设置；merge 时把本机独有、填过地址或 Key 的模型（比如在手机上新加的 DeepSeek）也留下
    function applyRemote(r, { merge = false } = {}) {
      const st = r.settings || {};
      const profiles = (Array.isArray(st.profiles) ? st.profiles : []).map(cleanProfile);
      let added = false;
      if (merge) {
        for (const p of store.profiles) if (filled(p) && !profiles.some((q) => sameProfile(p, q))) { profiles.push(cleanProfile(p)); added = true; }
      }
      if (!profiles.length) return false;
      const has = (id) => profiles.some((p) => p.id === id);
      const keepLocal = merge && store.fallbackId && has(store.fallbackId) && !has(st.fallbackId);
      applying = true;
      Object.assign(store, {
        token: st.token || (merge ? store.token : "") || "", momoProxyMode: st.momoProxyMode || "direct", momoProxyUrl: st.momoProxyUrl || "",
        target: EXAM_TARGETS.includes(st.target) ? st.target : "考研", maxWords: Number(st.maxWords) || 0, profiles,
        lookupMode: ["dict", "local", "ai"].includes(st.lookupMode) ? st.lookupMode : store.lookupMode,
        activeId: has(st.activeId) ? st.activeId : profiles[0].id,
        lookupId: has(st.lookupId) ? st.lookupId : "",
        fallbackId: keepLocal ? store.fallbackId : has(st.fallbackId) ? st.fallbackId : "",
        autoGenerate: st.autoGenerate !== false,
      });
      if (merge && store.token && !st.token) added = true;
      if (keepLocal) added = true;
      LS.set("settingsBase", r.updatedAt || 0);
      LS.set("settingsJoined", true);
      LS.set("settingsDirty", added);
      saveStore(store);
      Promise.resolve().then(() => { applying = false; });
      return added;
    }
    const syncNote = (msg) => { sync.status = msg; sync.at = Date.now(); };
    async function pushSettings(depth = 0) {
      if (!sync.on) return;
      try {
        const r = await api("/api/settings", { settings: syncPayload(), base: LS.get("settingsBase", 0) });
        if (r.offline) { syncNote("电脑不在线，连上后自动同步"); return; }
        if (r.stale) {
          // 电脑上的设置更新（或本机是空白默认值）：用电脑的，本机独有的模型合并进去再推一次
          if (applyRemote(r, { merge: true }) && depth < 2) return pushSettings(depth + 1);
          syncNote("已从电脑同步设置");
          return;
        }
        LS.set("settingsBase", r.updatedAt || 0);
        LS.set("settingsJoined", true);
        LS.set("settingsDirty", false);
        syncNote("已同步到电脑");
      } catch (e) { syncNote(`同步失败：${e.message}`); }
    }
    async function pullSettings({ force = false } = {}) {
      if (!sync.on && !force) return;
      try {
        const r = await api("/api/settings");
        if (r.offline) { syncNote("电脑不在线，连上后自动同步"); if (force) toast("电脑不在线"); return; } // 别把本机默认值当成「更新」
        if (!r.settings || blankSettings(r.settings)) {
          if (LS.get("settingsDirty", false) || !LS.get("settingsJoined", false)) await pushSettings();
          else syncNote("已同步");
          return;
        }
        const joined = LS.get("settingsJoined", false);
        const base = LS.get("settingsBase", 0);
        const dirty = LS.get("settingsDirty", false);
        if (force) { applyRemote(r); syncNote("已用电脑上的设置覆盖本机"); toast("已用电脑上的设置"); return; }
        if (!joined || r.updatedAt !== base) {
          // 第一次对齐，或电脑上的设置变了：以电脑为准；本机改过的模型合并进去
          const added = applyRemote(r, { merge: !joined || dirty });
          if (added) await pushSettings(); else syncNote("已从电脑同步设置");
        } else if (dirty) await pushSettings();
        else syncNote("已同步");
      } catch { syncNote("同步失败：连不上电脑上的服务"); }
    }
    watch(store, () => {
      saveStore(store);
      if (applying || !sync.on) return;
      LS.set("settingsDirty", true);
      clearTimeout(pushTimer);
      pushTimer = setTimeout(pushSettings, 600);
    }, { deep: true });
    watch(() => sync.on, (v) => {
      LS.set("pcSync", v); LS.set("syncSettings", v); sync.status = "";
      if (PCSYNC_BRIDGE && typeof window.MomoAndroid.setPcSync === "function") { try { window.MomoAndroid.setPcSync(v); } catch { /* 旧版 App */ } }
      if (LOCAL && LOCAL.setPcSync) LOCAL.setPcSync(v);
      if (v) pullSettings();
      toast(v ? "已开启电脑同步" : "已关闭电脑同步：这台设备不再连电脑");
    });
    // 外观（public/theme.js 管理，按设备保存）
    const TH = window.momoTheme;
    const theme = reactive(TH ? TH.get() : { mode: "system", seed: "#006C4C", wallpaper: "" });
    if (TH) TH.onChange((v) => Object.assign(theme, v));
    const THEME_MODES = [{ id: "system", name: "跟随系统" }, { id: "light", name: "浅色" }, { id: "dark", name: "深色" }];
    const THEME_PRESETS = TH ? TH.PRESETS : [];
    const isCustomSeed = computed(() => theme.seed !== "wallpaper" && !THEME_PRESETS.some((p) => p.id === theme.seed));
    const swatchCache = {};
    function swatchColors(seed) {
      const k = `${seed}|${theme.dark}`;
      if (!swatchCache[k] && TH) {
        const s = TH.scheme(seed, theme.dark);
        swatchCache[k] = [s["--md-primary"], s["--md-secondary-container"], s["--md-tertiary"]];
      }
      return swatchCache[k] || [seed, seed, seed];
    }
    function setTheme(patch) { if (TH) TH.set(patch); }
    // 安卓 App 内的原生功能
    const inApp = !!(window.MomoAndroid && window.MomoAndroid.openSettings);
    const appInfo = inApp ? (() => { try { return window.MomoAndroid.info(); } catch { return ""; } })() : "";
    // 彩蛋：关于页连点图标 7 下，输入口令可在「黑黑看单词」和「墨墨看单词」之间切换显示名（只存本机）。
    const BRAND_NAMES = { heihei: "黑黑看单词", momo: "墨墨看单词" };
    const brandKey = ref(LS.get("brand", "heihei") === "momo" ? "momo" : "heihei");
    const brandName = computed(() => BRAND_NAMES[brandKey.value]);
    watchEffect(() => { document.title = brandName.value; });
    const eggDlg = ref(false), eggCode = ref("");
    let eggTaps = 0, eggTimer = 0;
    const aboutLogoTap = () => {
      clearTimeout(eggTimer); eggTimer = setTimeout(() => { eggTaps = 0; }, 1500);
      if (++eggTaps >= 7) { eggTaps = 0; eggCode.value = ""; eggDlg.value = true; }
    };
    const submitEgg = () => {
      if (eggCode.value.trim().toLowerCase() !== "momobeidanci") { toast("口令不对"); return; }
      brandKey.value = brandKey.value === "momo" ? "heihei" : "momo";
      LS.set("brand", brandKey.value); eggDlg.value = false;
      toast(`已切换为「${brandName.value}」`);
    };
    const appVersion = ((appInfo.match(/momo-android\s+([\w.\-]+)/) || [])[1]) || "";
    function appCall(fn) { try { window.MomoAndroid[fn](); } catch (e) { toast(`App 不支持：${fn}`); } }
    const editId = ref(store.activeId);
    const modelLists = reactive({});
    const profileStatus = reactive({});
    const momoStatus = ref("");
    const lanUrls = ref([]);
    // ---------------------------------------------------------------- 数据位置与 GitHub 备份
    const health = reactive({ dataDir: "", local: false, version: "" });
    const backup = reactive({ loaded: false, configured: false, repo: "momo-kan-backup", auto: true, proxy: "", lastBackupAt: 0, lastError: "", url: "", token: "", busy: false, msg: "" });
    async function loadBackup() {
      try { Object.assign(backup, await api("/api/backup"), { loaded: true }); } catch (e) { backup.loaded = false; backup.msg = e.message; }
    }
    async function saveBackupCfg() {
      const r = await api("/api/backup/config", { token: backup.token, repo: backup.repo, auto: backup.auto, proxy: backup.proxy });
      Object.assign(backup, r, { token: "" });
    }
    async function runBackup() {
      if (backup.busy) return;
      backup.busy = true; backup.msg = "正在备份…";
      try {
        await saveBackupCfg();
        Object.assign(backup, await api("/api/backup/run", {}));
        backup.msg = "备份完成";
      } catch (e) { backup.msg = e.message; await loadBackup(); }
      finally { backup.busy = false; }
    }
    async function restoreBackup() {
      if (backup.busy || !(await ask({ title: "从备份恢复？", text: "会把 GitHub 备份里的历史合并进来，不会删除现有数据。", ok: "恢复" }))) return;
      backup.busy = true; backup.msg = "正在恢复…";
      try {
        await saveBackupCfg();
        const r = await api("/api/backup/restore", {});
        backup.msg = `已恢复：${r.counts.days} 天、${r.counts.articles} 篇短文`;
        loadDay(date.value);
      } catch (e) { backup.msg = e.message; }
      finally { backup.busy = false; }
    }
    // 手机独立模式：电脑在线状态与数据同步
    const localState = reactive(LOCAL ? LOCAL.status() : { local: false });
    async function syncLocalNow() {
      if (!LOCAL) return;
      try {
        const r = await LOCAL.syncNow();
        toast(r && r.disabled ? "没开电脑同步" : r && r.offline ? "电脑不在线，连上后会自动同步" : "已和电脑同步");
      } catch (e) { toast(`同步失败：${e.message}`); }
    }
    if (LOCAL) {
      window.addEventListener("momo-local-status", (e) => {
        const wasOnline = localState.online;
        Object.assign(localState, e.detail);
        if (e.detail.online && !wasOnline) pullSettings();
      });
      window.addEventListener("momo-synced", () => {
        if (busy.value) return;
        if (view.value === "day") loadDay(date.value);
        else if (view.value === "history") loadHistory();
      });
    }
    // ---------------------------------------------------------------- 安卓 App 连接设置（原生页面搬进网页，样式和其它二级页一致）
    const CONN_BRIDGE = inApp && typeof window.MomoAndroid.getConnection === "function";
    const conn = reactive({ loaded: false, localMode: true, networkName: "", networkSecret: "", hasSecret: false, peers: "", virtualIp: "", pcUrl: "", errors: {}, saving: false });
    function loadConn() {
      if (!CONN_BRIDGE) return;
      try {
        const c = JSON.parse(window.MomoAndroid.getConnection() || "{}");
        Object.assign(conn, { localMode: c.localMode !== false, networkName: c.networkName || "", networkSecret: "", hasSecret: !!c.hasSecret,
          peers: c.peers || "", virtualIp: c.virtualIp || "", pcUrl: (c.pcUrl || "").replace(/^http:\/\//, ""), errors: {}, loaded: true });
      } catch (e) { toast(`读取连接设置失败：${e.message}`); }
    }
    function saveConn() {
      if (!CONN_BRIDGE || conn.saving) return;
      conn.saving = true;
      try {
        const r = JSON.parse(window.MomoAndroid.saveConnection(JSON.stringify({
          localMode: conn.localMode, networkName: conn.networkName, networkSecret: conn.networkSecret, keepSecret: !conn.networkSecret,
          peers: conn.peers, virtualIp: conn.virtualIp, pcUrl: conn.pcUrl,
        })) || "{}");
        conn.errors = r.errors || {};
        if (r.ok) { conn.networkSecret = ""; conn.hasSecret = !!r.hasSecret; toast("连接设置已保存，正在重新连接"); }
        else toast("有几项没填对，看下红色提示");
      } catch (e) { toast(`保存失败：${e.message}`); }
      finally { conn.saving = false; }
    }
    // 移动端顶部品牌栏：往下滑平滑收起，快回到顶端时再出现
    const barHidden = ref(false);
    let lastScrollY = 0;
    function onScroll() {
      const y = window.scrollY || 0;
      if (y < 96) barHidden.value = false;
      else if (y > lastScrollY + 2) barHidden.value = true;
      lastScrollY = y;
    }
    const fmtTime = (ms) => (ms ? new Date(ms).toLocaleString() : "从未");
    const presetPick = ref("");
    const importInput = ref(null);
    const opts = reactive({
      boldForget: LS.get("opt.boldForget", true),
      markTargets: LS.get("opt.markTargets", true),
      showZh: LS.get("opt.showZh", true),
      fontSize: LS.get("opt.fontSize", "m"),
    });
    const FONT_SIZES = [{ id: "s", name: "小" }, { id: "m", name: "中" }, { id: "l", name: "大" }];

    // 顶栏菜单（⋮ 更多操作 / 阅读页显示选项）：点别处或按 Esc 关闭
    const menuOpen = ref("");
    const toggleMenu = (id) => { menuOpen.value = menuOpen.value === id ? "" : id; };
    const menuDo = (fn) => { menuOpen.value = ""; fn(); };
    document.addEventListener("click", () => { menuOpen.value = ""; });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") menuOpen.value = ""; });
    const wordDlg = ref(false);
    const openWordDlg = () => { menuOpen.value = ""; wordDlg.value = true; };

    // 看短文时长：这台设备上页面可见、且最近 3 分钟内有操作的时间，按天记在本机
    const appTime = reactive(LS.get("appTime", {}));
    {
      let lastAct = Date.now(), lastTick = Date.now();
      const act = () => { lastAct = Date.now(); };
      for (const ev of ["pointerdown", "keydown", "scroll", "wheel", "touchstart"]) addEventListener(ev, act, { passive: true, capture: true });
      document.addEventListener("visibilitychange", () => { lastTick = Date.now(); if (document.visibilityState === "visible") act(); });
      setInterval(() => {
        const now = Date.now();
        const dt = Math.min(now - lastTick, 30000);
        lastTick = now;
        if (document.visibilityState !== "visible" || now - lastAct > 180000) return;
        const k = localDate(new Date());
        appTime[k] = (appTime[k] || 0) + dt;
        const keys = Object.keys(appTime).sort();
        while (keys.length > 800) delete appTime[keys.shift()];
        LS.set("appTime", { ...appTime });
      }, 15000);
    }
    watch(opts, () => Object.entries(opts).forEach(([k, v]) => LS.set(`opt.${k}`, v)), { deep: true });

    const view = ref("day");
    // 设置分组：首页是列表，点进去是各自的子页面（#/settings/<id>）
    const SETTINGS_SECTIONS = [
      { id: "momo", icon: "person", name: "墨墨账号", desc: "开放 API Token、连接方式" },
      { id: "model", icon: "chip", name: "自定义模型", desc: "使用的模型、查词模型、模型配置" },
      { id: "generate", icon: "article", name: "短文与查词", desc: "备考目标、篇幅、查词方式" },
      { id: "pc", icon: "computer", name: "电脑同步", desc: "同步到电脑、手机访问、电脑自动生成" },
      { id: "data", icon: "cloud", name: "数据与备份", desc: "数据位置、GitHub 备份、清除 Key" },
      { id: "appearance", icon: "palette", name: "自定义外观", desc: "深浅色、主题色" },
      { id: "app", icon: "info", name: "关于", desc: "版本、更新、诊断信息" },
      // 不在设置首页列出：从「电脑同步」进入，返回也回到「电脑同步」
      { id: "records", icon: "timer", name: "学习记录", desc: "每天背单词和看短文各花了多久", hidden: true, parent: "app" },
      { id: "connect", icon: "computer", name: "连接设置", desc: "手机独立模式、EasyTier 网络、电脑地址", hidden: true, parent: "pc" },
    ];
    const settingsTab = ref("");
    const visibleSections = computed(() => SETTINGS_SECTIONS.filter((g) => !g.hidden && (!g.app || inApp)));
    const settingsSection = computed(() => SETTINGS_SECTIONS.find((g) => g.id === settingsTab.value) || {});
    const date = ref(localDate());
    const serverToday = ref(localDate());
    const day = reactive({ progress: null, words: [], articles: [] });
    const pending = ref([]); // 正在生成 / 失败的批次
    const busy = ref(false);
    const progress = reactive({ on: false, frac: null });
    const banner = reactive({ text: "", kind: "" });
    const snack = ref("");
    const responses = ref(LS.get("responses", ["FORGET", "VAGUE"]));
    const manualWords = ref("");
    const tabs = reactive({});
    const revealed = reactive({});
    const answers = reactive({});
    const drillBusy = reactive({});
    const days = ref([]);
    const pop = reactive({ open: false, key: "", word: "", badge: "", badgeClass: "", pos: "", meaning: "", note: "", source: "", sentence: "", busy: false, style: {}, mobile: false });
    let autoFetched = false;
    let snackTimer = null;

    const isToday = computed(() => date.value === serverToday.value);
    const activeNav = computed(() => (view.value === "day" ? (isToday.value ? "day" : "history") : view.value));
    const navItems = [
      { view: "day", label: "今天", href: "#/today", icon: ICONS.today },
      { view: "history", label: "历史", href: "#/history", icon: ICONS.history },
      { view: "settings", label: "设置", href: "#/settings", icon: ICONS.settings },
    ];
    const pickedWords = computed(() => day.words.filter((w) => responses.value.includes(w.response)));
    const countOf = (r) => day.words.filter((w) => w.response === r).length;

    // 阅读页：#/today/a/0、#/day/2026-10-30/a/1；列表页只显示标题，点进去再看全文
    const readIdx = ref(null);
    const dayHref = computed(() => (isToday.value ? "#/today" : `#/day/${date.value}`));
    const readHref = (idx) => `${dayHref.value}/a/${idx}`;
    const readSlots = computed(() => (readIdx.value === null ? [] : slots.value.filter((x) => x.idx === readIdx.value)));
    const slots = computed(() => {
      const map = new Map();
      for (const a of day.articles) map.set(a.idx, { idx: a.idx, style: a.style, words: a.words, article: a });
      for (const p of pending.value) if (!map.has(p.idx)) map.set(p.idx, p);
      return [...map.values()].sort((a, b) => a.idx - b.idx);
    });

    // 渲染缓存：文章 id → token 段落
    const renderCache = new Map();
    function rendered(article) {
      const key = `${article.id}:${article.created_at}`;
      if (!renderCache.has(key)) {
        const matcher = buildMatcher(article);
        const respOf = new Map((article.words || []).map((w) => [w.spelling.toLowerCase(), w.response]));
        renderCache.set(key, (article.content.paragraphs || []).map((p) => tokenize(p.en, matcher, respOf)));
      }
      return renderCache.get(key);
    }
    const keyOf = (a, pi, ti) => `${a.id}-${pi}-${ti}`;
    const respOf = (a, word) => (a.words.find((w) => w.spelling.toLowerCase() === String(word).toLowerCase()) || {}).response || "";
    const tabOf = (a) => tabs[a.id] || "read";
    const setTab = (a, id) => { tabs[a.id] = id; closePop(); };

    // M3 对话框（代替原生 confirm()）：ask({ title, text, ok, cancel, alt }) → "ok" | "alt" | false
    const dialog = reactive({ open: false, title: "", text: "", ok: "确定", cancel: "取消", alt: "", danger: false, resolve: null });
    function ask(o) {
      if (dialog.resolve) dialog.resolve(false);
      return new Promise((resolve) => Object.assign(dialog, { title: "", text: "", ok: "确定", cancel: "取消", alt: "", danger: false, ...o, open: true, resolve }));
    }
    function closeDialog(v) {
      const r = dialog.resolve;
      dialog.open = false; dialog.resolve = null;
      if (r) r(v);
    }
    function toast(msg) {
      snack.value = msg;
      clearTimeout(snackTimer);
      snackTimer = setTimeout(() => { snack.value = ""; }, 4000);
    }
    function setBanner(text, kind = "") { banner.text = text; banner.kind = kind; }

    // ---------------------------------------------------------------- 点词
    function placePop(el) {
      pop.mobile = matchMedia("(max-width: 600px)").matches;
      if (pop.mobile) { pop.style = {}; return; }
      const r = el.getBoundingClientRect();
      const w = Math.min(320, document.documentElement.clientWidth - 32);
      let left = r.left + window.scrollX + r.width / 2 - w / 2;
      left = Math.max(16, Math.min(left, window.scrollX + document.documentElement.clientWidth - w - 16));
      let top = r.bottom + window.scrollY + 8;
      if (r.bottom + 200 > window.innerHeight) top = r.top + window.scrollY - 168;
      pop.style = { left: `${left}px`, top: `${Math.max(8, top)}px` };
    }
    function openPop(el, key, fields) {
      Object.assign(pop, { open: true, key, badge: "", badgeClass: "", pos: "", meaning: "", note: "", source: "", sentence: "", busy: false }, fields);
      placePop(el);
    }
    function closePop() { pop.open = false; pop.key = ""; }

    function showTarget(ev, article, tk, key) {
      if (pop.key === key) return closePop();
      const g = (article.content.glossary || []).find((x) => x.word.toLowerCase() === tk.sp.toLowerCase())
        || (article.content.glossary || []).find((x) => (x.form || "").toLowerCase() === tk.x.toLowerCase());
      openPop(ev.currentTarget, key, {
        word: tk.sp,
        badge: RESP_ZH[tk.r] || "",
        badgeClass: tk.r,
        pos: g ? [g.pos, g.form && g.form.toLowerCase() !== tk.sp.toLowerCase() ? `文中：${g.form}` : ""].filter(Boolean).join(" · ") : "",
        meaning: g ? g.meaning_zh : "这个词缺少释义，点「重写」可以重新生成",
        note: g ? g.note : "",
      });
    }

    async function lookupWord(ev, article, pi, tk, key) {
      if (pop.key === key) return closePop();
      const tokens = rendered(article)[pi];
      const sentence = sentenceAround(tokens, tokens.indexOf(tk));
      openPop(ev.currentTarget, key, { word: tk.x, meaning: "查询中…", sentence, busy: true });
      await doLookup(key, tk.x, sentence, store.lookupMode);
    }
    async function doLookup(key, word, sentence, mode) {
      pop.busy = true;
      try {
        const { result } = await api("/api/lookup", { word, sentence, lookupMode: mode, llm: llmCfg(), lookupLlm: llmCfg(store.lookupId), llmFallback: fallbackCfg() });
        if (pop.key !== key) return;
        pop.pos = [result.pos, result.lemma && result.lemma.toLowerCase() !== word.toLowerCase() ? `原形：${result.lemma}` : ""].filter(Boolean).join(" · ");
        pop.meaning = result.meaning_zh || "（没有结果）";
        pop.note = result.note || "";
        pop.source = result.source || "";
      } catch (e) {
        if (pop.key === key) { pop.meaning = e.message; pop.source = ""; }
      } finally {
        if (pop.key === key) pop.busy = false;
      }
    }
    // 弹窗里的「AI 结合语境」：词典给的是所有义项，想知道句中意思时再用 AI
    function lookupWithAi() {
      if (!pop.key || pop.busy) return;
      pop.meaning = "AI 正在结合句子解释…";
      pop.note = "";
      doLookup(pop.key, pop.word, pop.sentence, "ai");
    }

    // ---------------------------------------------------------------- 数据
    const profileById = (id) => store.profiles.find((p) => p.id === id) || null;
    const activeProfile = computed(() => profileById(store.activeId) || store.profiles[0] || null);
    const editProfile = computed(() => profileById(editId.value) || activeProfile.value);
    const llmCfg = (id) => profileCfg(id ? profileById(id) || activeProfile.value : activeProfile.value);
    // 备用模型：主模型失败时（或手机连不上电脑时）改用它；没选就不传
    // 没开电脑同步时不显示、也不用「备用模型」：这台设备只用当前选的模型
    const fallbackCfg = () => (sync.on && store.fallbackId && store.fallbackId !== store.activeId && profileById(store.fallbackId) ? llmCfg(store.fallbackId) : undefined);
    function addDeepSeekFallback() {
      const ex = store.profiles.find((p) => /deepseek\.com/.test(p.baseUrl || ""));
      const p = ex || addProfile(PRESETS.find((x) => x.name === "DeepSeek 官方"));
      store.fallbackId = p.id;
      editId.value = p.id;
      if (!p.apiKey) toast("已添加 DeepSeek 官方，在下面填上 API Key");
    }
    const momoProxy = () => proxyValue(store.momoProxyMode, store.momoProxyUrl);
    function needModel() {
      const p = activeProfile.value;
      if (p && (p.baseUrl || p.protocol !== "openai") && (p.model || p.protocol === "openai")) return false;
      setBanner("先在「设置 → 模型」里配置并选中一个模型", "error");
      location.hash = "#/settings";
      return true;
    }

    function applyDay(data) {
      day.progress = data.progress || null;
      day.words = data.words || [];
      day.articles = data.articles || [];
      if (data.today) serverToday.value = data.today;
    }

    let loadedDay = "";
    async function loadDay(d) {
      date.value = d;
      pending.value = [];
      setBanner("");
      try {
        applyDay(await api(`/api/day?date=${encodeURIComponent(d)}`));
      } catch (e) {
        setBanner(e.message, "error");
        applyDay({});
      }
      if (isToday.value && !autoFetched && !day.words.length && store.token) {
        autoFetched = true;
        fetchMomo();
      }
    }

    async function run(task, { determinate = false } = {}) {
      busy.value = true;
      progress.on = true;
      progress.frac = determinate ? 0 : null;
      try { return await task(); } finally { busy.value = false; progress.on = false; }
    }

    function needToken() {
      if (store.token) return false;
      setBanner("先在「设置」里填写墨墨 Token", "error");
      location.hash = "#/settings";
      return true;
    }

    const staleLabel = (d) => {
      if (typeof d !== "string") return "上一天";
      const [, m, dd] = d.split("-").map(Number);
      const y = new Date(); y.setDate(y.getDate() - 1);
      return d === localDate(y) ? "昨天" : `${m} 月 ${dd} 日`;
    };

    async function fetchMomo() {
      if (needToken()) return;
      setBanner("");
      await run(async () => {
        try {
          const data = await api("/api/today", { token: store.token, momoProxy: momoProxy() });
          applyDay(data);
          if (data.stale) setBanner(`墨墨今天还没开始：现在拿到的还是${staleLabel(data.stale)}的数据，没有存成今天的。先打开墨墨 App 背几个词，再回来拉取。`);
          else if (!data.fetched) setBanner("今天还没有学习记录：确认墨墨 App 开启了自动同步，并且今天已经背过单词。");
          else toast(`已拉取 ${data.fetched} 条记录，待复习 ${pickedWords.value.length} 个词`);
        } catch (e) {
          setBanner(e.message, "error");
        }
      });
    }

    function toggleResponse(r) {
      const set = new Set(responses.value);
      if (set.has(r)) { if (set.size > 1) set.delete(r); } else set.add(r);
      responses.value = ["FORGET", "VAGUE"].filter((x) => set.has(x));
      LS.set("responses", responses.value);
    }

    async function addManualWords() {
      const words = manualWords.value.split(/[\s,，;；、]+/).map((w) => w.trim()).filter(Boolean);
      try {
        const data = await api("/api/words/add", { date: date.value, words });
        applyDay(data);
        manualWords.value = "";
        toast(`已加入 ${data.added} 个词${data.added < words.length ? "（非英文单词已跳过）" : ""}`);
      } catch (e) { setBanner(e.message, "error"); }
    }

    async function removeWord(w) {
      try { applyDay(await api("/api/words/remove", { date: date.value, spelling: w.spelling })); } catch (e) { toast(e.message); }
    }

    // ---------------------------------------------------------------- 生成
    // 今天的单词还没背完（墨墨没打卡）时先提醒：现在生成只会用到已经背过的词
    async function checkUnfinished() {
      if (date.value !== serverToday.value || !store.token) return true;
      try {
        const r = await Promise.race([api("/api/progress", { token: store.token, momoProxy: momoProxy() }), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 6000))]);
        if (r) day.progress = r.progress || null;
        if (r && r.stale) {
          const v = await ask({ title: "墨墨今天还没开始", text: `墨墨现在返回的还是${staleLabel(r.stale)}的数据。先打开墨墨 App 背完今天的单词，再回来生成。`, ok: "仍然生成", cancel: "好的" });
          return v === "ok";
        }
      } catch { /* 拿不到就用上次的进度 */ }
      const p = day.progress;
      if (!p || !p.total || p.finished >= p.total) return true;
      const v = await ask({
        title: "今天的单词还没背完",
        text: `墨墨今天完成 ${p.finished}/${p.total}，还没打卡。现在生成只会用到已经背过的忘记、模糊词，背完后再生成会更完整。`,
        ok: "仍然生成", cancel: "等背完再说",
      });
      return v === "ok";
    }

    async function generateAll() {
      if (needModel()) return;
      if (!(await checkUnfinished())) return;
      if (day.articles.length && !(await ask({ title: "重新生成？", text: "这一天已经有短文了，重新生成会覆盖它们（包括练习）。", ok: "重新生成" }))) return;
      setBanner("");
      closePop();
      await run(async () => {
        try {
          const plan = await api("/api/plan", { date: date.value, responses: responses.value, maxWords: store.maxWords });
          day.articles = [];
          pending.value = plan.batches.map((b) => ({ ...b, status: "排队中", error: "" }));
          let done = 0;
          // 依次生成：本地模型一次处理一个请求更稳
          for (const b of pending.value) {
            b.status = "正在写…";
            await generateBatch(b);
            done += 1;
            progress.frac = done / pending.value.length;
          }
          const failed = pending.value.filter((p) => p.error).length;
          if (failed < plan.batches.length) {
            // 至少写好一篇：删掉上一次多出来的旧篇
            try { await api("/api/articles/trim", { date: date.value, keep: plan.batches.length }); } catch { /* 下次重新生成时再删 */ }
          }
          if (failed && failed === plan.batches.length) {
            await loadDay(date.value);
            toast(day.articles.length ? "全部生成失败，原来的短文还在" : "全部生成失败，可以单独重试");
          } else toast(failed ? `完成，${failed} 篇失败，可以单独重试` : `已生成 ${day.articles.length} 篇短文`);
        } catch (e) {
          setBanner(e.message, "error");
        } finally {
          pending.value = pending.value.filter((p) => p.error);
        }
      }, { determinate: true });
    }

    let fallbackNoticed = false;
    async function generateBatch(b) {
      try {
        const { article, usedFallback } = await api("/api/article", {
          date: date.value, idx: b.idx, style: b.style, words: b.words, length: b.length, maxWords: b.maxWords, target: store.target, llm: llmCfg(), llmFallback: fallbackCfg(),
        });
        if (usedFallback && !fallbackNoticed) { fallbackNoticed = true; toast(`主模型不可用，已改用备用模型「${usedFallback}」`); }
        day.articles = day.articles.filter((a) => a.idx !== b.idx).concat([article]).sort((x, y) => x.idx - y.idx);
        b.error = "";
        pending.value = pending.value.filter((p) => p.idx !== b.idx);
      } catch (e) {
        b.error = `第 ${b.idx + 1} 篇生成失败：${e.message}`;
      }
    }

    async function generateOne(slot) {
      const b = reactive({ idx: slot.idx, style: slot.style, words: slot.words, length: slot.length || guessLength(slot), status: "正在写…", error: "" });
      pending.value = pending.value.filter((p) => p.idx !== b.idx).concat([b]);
      day.articles = day.articles.filter((a) => a.idx !== b.idx);
      await run(() => generateBatch(b));
    }

    function regenerate(article) {
      closePop();
      generateOne({ idx: article.idx, style: article.style, words: article.words });
    }

    function guessLength(s) {
      const n = (s.words || []).length;
      return Math.min(s.style === "story" ? 180 + n * 6 : 220 + n * 7, 360);
    }

    async function makeDrills(article) {
      if (needModel()) return;
      drillBusy[article.id] = true;
      try {
        const { article: updated } = await api("/api/drills", { id: article.id, target: store.target, llm: llmCfg(), llmFallback: fallbackCfg() });
        const i = day.articles.findIndex((a) => a.id === article.id);
        if (i >= 0) day.articles[i] = updated;
        Object.keys(revealed).filter((k) => k.startsWith(`${article.id}-`)).forEach((k) => delete revealed[k]);
        Object.keys(answers).filter((k) => k.startsWith(`${article.id}-`)).forEach((k) => delete answers[k]);
      } catch (e) {
        toast(`出题失败：${e.message}`);
      } finally {
        drillBusy[article.id] = false;
      }
    }

    const toggleReveal = (k) => { revealed[k] = !revealed[k]; };
    const answer = (id, qi, option) => { if (!answers[`${id}-${qi}`]) answers[`${id}-${qi}`] = option; };
    function optionClass(id, qi, q, option) {
      const picked = answers[`${id}-${qi}`];
      if (!picked) return "";
      const letter = (o) => String(o).trim().charAt(0).toUpperCase();
      const correct = letter(option) === letter(q.answer) || option === q.answer;
      if (correct) return "correct";
      return picked === option ? "wrong" : "";
    }

    // ---------------------------------------------------------------- 回写墨墨
    async function addToStudy(advance) {
      if (needToken()) return;
      await run(async () => {
        try {
          const data = await api("/api/maimemo/add-words", {
            token: store.token, momoProxy: momoProxy(), date: date.value, advance, spellings: pickedWords.value.map((w) => w.spelling),
          });
          toast(`已加入 ${data.added} 个词${advance ? "，并提前复习" : ""}`);
        } catch (e) { setBanner(e.message, "error"); }
      });
    }

    async function saveNotepad() {
      if (needToken()) return;
      await run(async () => {
        try {
          const data = await api("/api/maimemo/notepad", { token: store.token, momoProxy: momoProxy(), date: date.value });
          toast(`云词本已创建：${data.title}`);
        } catch (e) { setBanner(e.message, "error"); }
      });
    }

    // ---------------------------------------------------------------- 导出（沿用上游 Word / PDF，新增 Markdown）
    function markHtml(en) {
      return escapeHtml(en).replace(/\*\*([^*]+)\*\*/g, '<span class="target-word">$1</span>');
    }
    function exportHtml() {
      const parts = day.articles.map((a, i) => {
        const c = a.content;
        const d = a.drills;
        return `<h1>${i + 1}. ${escapeHtml(c.title)}</h1>
<div class="meta">${escapeHtml(styleName(a.style, c.target))} · ${escapeHtml(c.title_zh || "")}</div>
${c.paragraphs.map((p) => `<p class="en">${markHtml(p.en)}</p>`).join("")}
<h2>全文意思</h2>${c.paragraphs.map((p) => `<p>${escapeHtml(p.zh)}</p>`).join("")}
<h2>词表</h2>${c.glossary.map((g) => `<div class="card"><strong>${escapeHtml(g.word)}</strong> ${escapeHtml(g.pos)} ${escapeHtml(g.meaning_zh)}<div class="muted">${escapeHtml(g.note)}</div></div>`).join("")}
${d ? `<h2>完形</h2>${d.cloze.map((x, k) => `<div class="card">${k + 1}. ${escapeHtml(x.sentence)}<div class="muted">提示：${escapeHtml(x.hint)}　答案：${escapeHtml(x.answer)}</div></div>`).join("")}
<h2>测验</h2>${d.questions.map((q, k) => `<div class="card"><strong>${k + 1}. ${escapeHtml(q.question)}</strong><div>${q.options.map(escapeHtml).join("<br>")}</div><div class="muted">答案 ${escapeHtml(q.answer)}：${escapeHtml(q.explanation)}</div></div>`).join("")}
<h2>复习卡</h2>${d.flashcards.map((f) => `<div class="card"><strong>${escapeHtml(f.front)}</strong><div>${escapeHtml(f.back)}</div></div>`).join("")}` : ""}`;
      }).join('<div class="page-break"></div>');
      return `<!doctype html><html><head><meta charset="utf-8"><title>${brandName.value} ${date.value}</title><style>
body{font-family:"Microsoft YaHei",Georgia,serif;color:#1d1b20;line-height:1.75;padding:32px;max-width:820px;margin:auto}
h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;margin:22px 0 8px;border-bottom:1px solid #cac4d0;padding-bottom:4px;color:#6750a4}
.en{font-family:Georgia,serif;font-size:16px}.meta,.muted{color:#49454f;font-size:13px}
.target-word{font-weight:700;text-decoration:underline;text-underline-offset:3px}
.card{border:1px solid #cac4d0;border-radius:8px;padding:8px 12px;margin:6px 0;page-break-inside:avoid}
.page-break{page-break-after:always;height:24px}</style></head><body>
<div class="meta">${brandName.value} · ${escapeHtml(fmtDate(date.value))} · 背单词 ${escapeHtml(day.progress ? fmtDuration(day.progress.study_time_ms) : "—")}</div>
${parts}</body></html>`;
    }
    function exportMarkdownText() {
      const lines = [`# ${brandName.value} ${date.value}`, "", `背单词时长：${day.progress ? fmtDuration(day.progress.study_time_ms) : "—"}`, ""];
      day.articles.forEach((a, i) => {
        const c = a.content;
        lines.push(`## ${i + 1}. ${c.title}`, "", `> ${styleName(a.style, c.target)} · ${c.title_zh || ""}`, "");
        c.paragraphs.forEach((p) => lines.push(p.en, ""));
        lines.push("### 全文意思", "");
        c.paragraphs.forEach((p) => lines.push(p.zh, ""));
        lines.push("### 词表", "");
        c.glossary.forEach((g) => lines.push(`- **${g.word}** ${g.pos} ${g.meaning_zh}${g.note ? `（${g.note}）` : ""}`));
        lines.push("");
        if (a.drills) {
          lines.push("### 完形", "");
          a.drills.cloze.forEach((x, k) => lines.push(`${k + 1}. ${x.sentence}  `, `   提示：${x.hint}；答案：${x.answer}`));
          lines.push("", "### 测验", "");
          a.drills.questions.forEach((q, k) => lines.push(`${k + 1}. ${q.question}`, ...q.options.map((o) => `   - ${o}`), `   答案 ${q.answer}：${q.explanation}`));
          lines.push("", "### 复习卡", "");
          a.drills.flashcards.forEach((f) => lines.push(`- ${f.front} —— ${f.back}`));
          lines.push("");
        }
      });
      return lines.join("\n");
    }
    function download(content, filename, type) {
      if (window.MomoAndroid) { window.MomoAndroid.saveFile(filename, type, String(content)); return; } // 安卓 App 内
      const url = URL.createObjectURL(new Blob([content], { type }));
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    function ensureArticles() {
      if (day.articles.length) return true;
      toast("这一天还没有短文可以导出");
      return false;
    }
    function exportWord() {
      if (!ensureArticles()) return;
      download(exportHtml(), `${sanitizeFilename(`${brandName.value} ${date.value}`)}.doc`, "application/msword;charset=utf-8");
    }
    function exportMarkdown() {
      if (!ensureArticles()) return;
      download(exportMarkdownText(), `${sanitizeFilename(`${brandName.value} ${date.value}`)}.md`, "text/markdown;charset=utf-8");
    }
    function exportPdf() {
      if (!ensureArticles()) return;
      if (window.MomoAndroid) { window.MomoAndroid.printHtml(exportHtml()); return; } // 安卓 App 内用系统打印另存 PDF
      const w = window.open("", "_blank");
      if (!w) { toast("浏览器拦截了弹窗，请允许后重试"); return; }
      w.document.open();
      w.document.write(exportHtml());
      w.document.close();
      w.onload = () => { w.focus(); w.print(); };
      toast("在打印窗口里选择「另存为 PDF」");
    }

    // ---------------------------------------------------------------- 历史
    // 学习时长柱状图：日（近 7 天）/ 周（近 7 周）/ 月（近 7 个月）
    const chartMode = ref(LS.get("chartMode", "day"));
    watch(chartMode, (v) => LS.set("chartMode", v));
    const study = ref([]);
    const historyLimit = ref(60);
    const studyByDate = computed(() => {
      const byDate = new Map(study.value.map((d) => [d.date, d.ms]));
      for (const d of days.value) if (!byDate.has(d.date) && d.study_time_ms) byDate.set(d.date, d.study_time_ms);
      return byDate;
    });
    const todayParts = () => (serverToday.value || localDate(new Date())).split("-").map(Number);
    function weekSum(start, byDate, upto = 7) {
      let ms = 0, n = 0;
      for (let k = 0; k < upto; k += 1) {
        const v = byDate.get(localDate(new Date(start.getFullYear(), start.getMonth(), start.getDate() + k))) || 0;
        ms += v; if (v) n += 1;
      }
      return { ms, n };
    }
    const thisMonday = () => { const [y, m, d] = todayParts(); const t = new Date(y, m - 1, d); return new Date(y, m - 1, d - ((t.getDay() + 6) % 7)); };
    // 本周（周一到今天）已背单词多久
    const weekStudy = computed(() => {
      const [y, m, d] = todayParts();
      const mon = thisMonday();
      const upto = Math.round((new Date(y, m - 1, d) - mon) / 86400000) + 1;
      return weekSum(mon, studyByDate.value, upto);
    });
    const chart = computed(() => {
      const byDate = studyByDate.value;
      const [y, m, d] = todayParts();
      const cols = [];
      if (chartMode.value === "week") {
        const monday = thisMonday();
        for (let i = 6; i >= 0; i -= 1) {
          const start = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - i * 7);
          const { ms, n } = weekSum(start, byDate);
          cols.push({ key: localDate(start), label: i === 0 ? "本周" : `${start.getMonth() + 1}/${start.getDate()}`, tip: `${start.getMonth() + 1} 月 ${start.getDate()} 日起一周`, ms, n, now: i === 0 });
        }
      } else if (chartMode.value === "month") {
        for (let i = 6; i >= 0; i -= 1) {
          const dt = new Date(y, m - 1 - i, 1);
          const prefix = localDate(dt).slice(0, 7);
          let ms = 0, n = 0;
          for (const [k, v] of byDate) if (k.startsWith(prefix)) { ms += v; if (v) n += 1; }
          cols.push({ key: prefix, label: i === 0 ? "本月" : `${dt.getMonth() + 1}月`, tip: `${dt.getFullYear()} 年 ${dt.getMonth() + 1} 月`, ms, n, now: i === 0 });
        }
      } else {
        for (let i = 6; i >= 0; i -= 1) {
          const dt = new Date(y, m - 1, d - i);
          const key = localDate(dt);
          const ms = byDate.get(key) || 0;
          cols.push({ key, label: i === 0 ? "今天" : `周${"日一二三四五六"[dt.getDay()]}`, tip: `${dt.getMonth() + 1} 月 ${dt.getDate()} 日`, ms, n: ms ? 1 : 0, now: i === 0 });
        }
      }
      return cols;
    });
    const chartStats = computed(() => {
      const c = chart.value;
      const total = c.reduce((a, x) => a + x.ms, 0);
      const activeDays = c.reduce((a, x) => a + x.n, 0);
      const max = Math.max(60000, ...c.map((x) => x.ms));
      return {
        max, total, activeDays, avg: activeDays ? total / activeDays : 0,
        // 最高的柱子占 84%，顶上留出数字的位置
        bars: c.map((x) => ({ ...x, pct: x.ms ? Math.max(4, (x.ms / max) * 84) : 0 })),
        range: chartMode.value === "day" ? "近 7 天" : chartMode.value === "week" ? "近 7 周" : "近 7 个月",
      };
    });
    const chartMax = computed(() => Math.max(1, ...chart.value.map((c) => c.ms)));
    // 学习记录（关于 → 学习记录）：按天 / 周 / 月列出背单词（墨墨）和看短文（本应用）时长
    const RECORD_MODES = [{ id: "day", name: "按天" }, { id: "week", name: "按周" }, { id: "month", name: "按月" }];
    const recordMode = ref("day");
    const RECORD_VIEWS = [{ id: "heat", name: "热力日历" }, { id: "climb", name: "爬山" }, { id: "list", name: "明细" }];
    const recordView = ref(LS.get("recordView", "heat"));
    watch(recordView, (v) => LS.set("recordView", v));

    // 每天的总学习时长（背单词 + 看短文）
    const RECORD_SRCS = [{ id: "all", name: "全部" }, { id: "momo", name: "背单词" }, { id: "app", name: "看短文" }];
    const recordSrc = ref(LS.get("recordSrc", "all"));
    watch(recordSrc, (v) => LS.set("recordSrc", v));
    const srcMomo = computed(() => recordSrc.value !== "app");
    const srcApp = computed(() => recordSrc.value !== "momo");
    const dayTotal = (key) => (srcMomo.value ? studyByDate.value.get(key) || 0 : 0) + (srcApp.value ? appTime[key] || 0 : 0);

    // ---- 热力日历：一行一周（周一到周日），最近的在上面；方块按总时长分 5 档
    const heatWeeks = ref(26);
    const heatPick = ref("");
    const heat = computed(() => {
      const [y, m, d] = todayParts();
      const todayKey = localDate(new Date(y, m - 1, d));
      const mon = thisMonday();
      const rows = [];
      // 最近的一周在最上面，往下越来越早
      for (let w = 0; w < heatWeeks.value; w += 1) {
        const cells = [];
        let monthLabel = "";
        for (let k = 0; k < 7; k += 1) {
          const dt = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() - w * 7 + k);
          const key = localDate(dt);
          const future = key > todayKey;
          const ms = future ? 0 : dayTotal(key);
          const min = ms / 60000;
          const lv = future ? -1 : !ms ? 0 : min < 10 ? 1 : min < 20 ? 2 : min < 40 ? 3 : 4;
          if (dt.getDate() === 1 || (w === 0 && k === 0)) monthLabel = `${dt.getMonth() + 1}月`;
          cells.push({ key, day: dt.getDate(), first: dt.getDate() === 1, lv, ms, today: key === todayKey, future });
        }
        rows.push({ key: cells[0].key, month: monthLabel, year: cells[0].key.slice(0, 4), cells });
      }
      // 连续学习：今天还没学不算断，从昨天往前数
      const has = (dt) => dayTotal(localDate(dt)) > 0;
      let streak = 0;
      let cur = new Date(y, m - 1, d);
      if (!has(cur)) cur = new Date(y, m - 1, d - 1);
      while (has(cur) && streak < 5000) { streak += 1; cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() - 1); }
      const keys = new Set([...studyByDate.value.keys(), ...Object.keys(appTime)].filter((k) => dayTotal(k) > 0));
      const sorted = [...keys].sort();
      let best = 0, run = 0, prev = null;
      for (const k of sorted) {
        const [a, b, c] = k.split("-").map(Number);
        const t = new Date(a, b - 1, c).getTime();
        run = prev !== null && Math.round((t - prev) / 86400000) === 1 ? run + 1 : 1;
        best = Math.max(best, run); prev = t;
      }
      const first = sorted[0] || todayKey;
      const [fy, fm, fd] = first.split("-").map(Number);
      const spanWeeks = Math.ceil((mon - new Date(fy, fm - 1, fd)) / (7 * 86400000)) + 1;
      return { rows, streak, best, days: keys.size, more: spanWeeks > heatWeeks.value };
    });
    const heatDetail = computed(() => {
      const k = heatPick.value;
      if (!k) return null;
      const [a, b, c] = k.split("-").map(Number);
      const dt = new Date(a, b - 1, c);
      return { key: k, label: `${b} 月 ${c} 日 · 周${"日一二三四五六"[dt.getDay()]}`, momo: studyByDate.value.get(k) || 0, app: appTime[k] || 0 };
    });
    const pickHeat = (c) => { if (!c.future) heatPick.value = heatPick.value === c.key ? "" : c.key; };

    // ---- 猫头鹰爬山：累计学习 1 分钟 = 海拔 1 米。中国名山 → 世界高峰 → 飞向太空，走完一轮从头再爬
    const PEAKS = [
      { name: "紫金山", m: 449, at: "南京", tier: 0 }, { name: "香山", m: 575, at: "北京", tier: 0 },
      { name: "庐山", m: 1474, at: "江西", tier: 0 }, { name: "泰山", m: 1545, at: "山东", tier: 0 },
      { name: "黄山", m: 1864, at: "安徽", tier: 0 }, { name: "华山", m: 2155, at: "陕西", tier: 0 },
      { name: "峨眉山", m: 3099, at: "四川", tier: 0 },
      { name: "富士山", m: 3776, at: "日本", tier: 1 }, { name: "玉山", m: 3952, at: "台湾", tier: 1 },
      { name: "玉龙雪山", m: 5596, at: "云南", tier: 1 }, { name: "厄尔布鲁士峰", m: 5642, at: "俄罗斯", tier: 1 },
      { name: "乞力马扎罗", m: 5895, at: "坦桑尼亚", tier: 1 }, { name: "德纳利", m: 6190, at: "美国", tier: 1 },
      { name: "阿空加瓜", m: 6961, at: "阿根廷", tier: 1 }, { name: "慕士塔格峰", m: 7509, at: "新疆", tier: 1 },
      { name: "贡嘎山", m: 7556, at: "四川", tier: 1 }, { name: "南迦帕尔巴特", m: 8126, at: "巴基斯坦", tier: 1 },
      { name: "洛子峰", m: 8516, at: "中尼边境", tier: 1 }, { name: "干城章嘉峰", m: 8586, at: "尼印边境", tier: 1 },
      { name: "乔戈里峰 K2", m: 8611, at: "中巴边境", tier: 1 }, { name: "珠穆朗玛峰", m: 8849, at: "中尼边境", tier: 1 },
      { name: "客机巡航高度", m: 10000, at: "云层之上", tier: 2 }, { name: "协和号飞行高度", m: 18000, at: "平流层", tier: 2 },
      { name: "高空跳伞纪录", m: 39045, at: "平流层顶", tier: 2 }, { name: "卡门线", m: 100000, at: "太空边界", tier: 2 },
    ];
    const TIERS = ["中国名山", "世界高峰", "飞向太空"];
    // 天空按此刻的时间变：清晨 / 白天 / 黄昏 / 夜里
    const SKIES = {
      dawn: { sky: ["#3f4f8f", "#f3a683"], sun: "#ffd59a", far: ["#8e8fb8", "#6f7aa6", "#516089"], mt: ["#4e6f86", "#23384d"], shade: "#1b2b3d", snow: "#fff4ec", haze: "#f8c9b3", name: "清晨" },
      day: { sky: ["#4f9fdc", "#d4ecf7"], sun: "#fff3b0", far: ["#a9c8d8", "#7fa9bd", "#5b8aa0"], mt: ["#3c7a62", "#1e4b3c"], shade: "#173a2f", snow: "#ffffff", haze: "#e6f4fa", name: "白天" },
      dusk: { sky: ["#3a2a63", "#f08a5d"], sun: "#ffb26b", far: ["#9b7aa8", "#765f93", "#54487a"], mt: ["#4a4f78", "#22253f"], shade: "#181a30", snow: "#ffe3d2", haze: "#f7b79a", name: "黄昏" },
      night: { sky: ["#071226", "#1f3863"], sun: "#f4f1d8", far: ["#2b3f66", "#22345a", "#1a2a4b"], mt: ["#24395a", "#101d33"], shade: "#0b1527", snow: "#dfe8f5", haze: "#3a5584", name: "夜里" },
    };
    const climbHour = ref(new Date().getHours());
    setInterval(() => { climbHour.value = new Date().getHours(); }, 600000);
    function seeded(str) {
      let h = 2166136261;
      for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
      return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; };
    }
    // 中点位移：在关键点之间加出参差的山脊
    function ridge(keys, depth, rough, rnd) {
      let a = keys;
      for (let d = 0; d < depth; d += 1) {
        const b = [a[0]];
        for (let i = 1; i < a.length; i += 1) {
          const [x0, y0] = a[i - 1], [x1, y1] = a[i];
          const len = Math.hypot(x1 - x0, y1 - y0);
          b.push([(x0 + x1) / 2 + (rnd() - 0.5) * len * 0.12, (y0 + y1) / 2 + (rnd() - 0.5) * len * rough]);
          b.push(a[i]);
        }
        a = b;
      }
      return a;
    }
    const pathOf = (pts) => "M" + pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" L");
    // 平滑曲线采样（Catmull-Rom），返回密集点
    function smooth(pts, n = 10) {
      const out = [];
      for (let i = 0; i < pts.length - 1; i += 1) {
        const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
        for (let k = 0; k < n; k += 1) {
          const t = k / n, t2 = t * t, t3 = t2 * t;
          out.push([0, 1].map((j) => 0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
        }
      }
      out.push(pts[pts.length - 1]);
      return out;
    }
    function scene(target, prev, frac, hour) {
      const sk = hour >= 5 && hour < 8 ? SKIES.dawn : hour >= 8 && hour < 17 ? SKIES.day : hour >= 17 && hour < 19 ? SKIES.dusk : SKIES.night;
      const rnd = seeded(target.name);
      const W = 400, H = 320;
      const far = [0, 1, 2].map((k) => {
        const base = 150 + k * 34, keys = [[-10, base + 20]];
        for (let x = 30 + rnd() * 40; x < W; x += 60 + rnd() * 70) keys.push([x, base - rnd() * (70 - k * 18)]);
        keys.push([W + 10, base + 10]);
        return { d: pathOf(ridge(keys, 3, 0.18, rnd)) + ` L${W + 10} ${H} L-10 ${H} Z`, fill: sk.far[k] };
      });
      const stars = sk === SKIES.night ? Array.from({ length: 46 }, () => ({ x: rnd() * W, y: rnd() * 150, r: 0.4 + rnd() * 1.1, o: 0.35 + rnd() * 0.6 })) : [];
      const sunPos = sk === SKIES.day ? [84, 74] : sk === SKIES.night ? [92, 70] : [64, 136];
      const clouds = Array.from({ length: 3 }, (_, i) => ({ x: 40 + i * 130 + rnd() * 40, y: 50 + rnd() * 70, s: 0.6 + rnd() * 0.6, dur: 60 + rnd() * 50 }));
      if (target.tier === 2) {
        // 飞向太空：云海之上一条笔直的航线，越高天越黑、星星越多
        const y0 = 262, y1 = 46, x = 220;
        const oy = y0 - (y0 - y1) * frac;
        const space = Math.min(1, (target.m - 8849) / 60000 + frac * 0.4);
        return {
          sky: ["#04091a", sk.sky[0]], space, far: [], stars: Array.from({ length: 70 }, () => ({ x: rnd() * W, y: rnd() * 230, r: 0.4 + rnd() * 1.1, o: (0.2 + rnd() * 0.7) * (0.3 + space) })),
          sun: { x: sunPos[0], y: sunPos[1], c: sk.sun, night: sk === SKIES.night }, sea: true, clouds,
          main: "", shade: "", snow: "", mt: sk.mt, snowC: sk.snow, haze: sk.haze,
          trail: pathOf([[x, y0], [x, y1]]), walked: pathOf([[x, y0], [x, oy]]), owl: [x, oy], summit: [x, y1], base: [x, y0], fly: true, time: sk.name,
        };
      }
      // 主峰：每座山按名字生成自己的轮廓，左边受光、右边背光，山顶积雪
      const S = [250 + rnd() * 50, 44 + rnd() * 10];
      const left = ridge([[-10, 268], [60 + rnd() * 30, 214 - rnd() * 20], [150 + rnd() * 30, 140 - rnd() * 20], S], 4, 0.22, rnd);
      const right = ridge([S, [S[0] + 40 + rnd() * 20, 110 + rnd() * 20], [W + 10, 170 + rnd() * 30]], 4, 0.22, rnd);
      const sil = [...left, ...right.slice(1)];
      const main = pathOf(sil) + ` L${W + 10} ${H} L-10 ${H} Z`;
      const mid = ridge([S, [S[0] + 14 + rnd() * 16, 160], [S[0] + 30 + rnd() * 30, H]], 4, 0.08, rnd);
      const shade = pathOf([...right, [W + 10, H], ...mid.slice().reverse()]) + " Z";
      // 雪线：山顶往下约 36~56 单位
      const snowY = S[1] + 36 + rnd() * 20;
      const top = sil.filter((p) => p[1] < snowY);
      let snow = "";
      if (top.length > 2) {
        const x0 = top[0][0], x1 = top[top.length - 1][0];
        const edge = [];
        for (let x = x1; x >= x0; x -= 7) edge.push([x, snowY - 4 + rnd() * 14]);
        snow = pathOf([...top, ...edge]) + " Z";
      }
      // 之字形山路：左右折返爬到山顶
      const yBase = 292;
      const leftX = (y) => { for (let i = 1; i < left.length; i += 1) if (left[i][1] <= y) { const [ax, ay] = left[i - 1], [bx, by] = left[i]; return ax + (bx - ax) * ((ay - y) / (ay - by || 1)); } return S[0]; };
      const keys = [[30 + rnd() * 30, yBase]];
      const turns = 7;
      for (let i = 1; i < turns; i += 1) {
        const y = yBase - ((yBase - S[1] - 10) * i) / turns;
        const lx = Math.max(10, leftX(y) + 22), rx = Math.min(W - 20, S[0] + (y - S[1]) * 0.42);
        keys.push([i % 2 ? rx - rnd() * 18 : lx + rnd() * 14, y]);
      }
      keys.push([S[0], S[1] + 8]);
      const pts = smooth(keys, 12);
      const lens = [0];
      for (let i = 1; i < pts.length; i += 1) lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      const want = lens[lens.length - 1] * Math.max(0, Math.min(1, frac));
      let j = 1; while (j < lens.length - 1 && lens[j] < want) j += 1;
      const t = (want - lens[j - 1]) / ((lens[j] - lens[j - 1]) || 1);
      const owl = [pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * t, pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * t];
      return {
        sky: sk.sky, far, stars, sun: { x: sunPos[0], y: sunPos[1], c: sk.sun, night: sk === SKIES.night }, clouds,
        main, shade, snow, mt: sk.mt, shadeC: sk.shade, snowC: sk.snow, haze: sk.haze,
        trail: pathOf(pts), walked: pathOf([...pts.slice(0, j), owl]), owl, summit: S, base: pts[0], time: sk.name,
      };
    }
    const climb = computed(() => {
      let ms = 0;
      for (const v of studyByDate.value.values()) ms += v;
      for (const v of Object.values(appTime)) ms += v;
      const alt = Math.floor(ms / 60000);
      const top = PEAKS[PEAKS.length - 1].m;
      const laps = Math.floor(alt / top);
      const rest = alt - laps * top;
      const idx = Math.max(0, PEAKS.findIndex((p) => p.m > rest));
      const target = PEAKS[idx];
      const prev = idx ? PEAKS[idx - 1] : { name: "山脚", m: 0 };
      const frac = (rest - prev.m) / (target.m - prev.m);
      const done = PEAKS.filter((p) => rest >= p.m).length;
      return {
        alt, laps, rest, target, prev, idx, frac, done,
        conquered: done + laps * PEAKS.length,
        pct: Math.min(100, frac * 100),
        left: Math.max(0, target.m - rest) * 60000,
        sc: scene(target, prev, frac, climbHour.value),
        tiers: TIERS.map((name, ti) => {
          const list = PEAKS.map((p, i) => ({ ...p, i, done: laps > 0 || rest >= p.m, now: i === idx })).filter((p) => p.tier === ti);
          return { name, list, done: list.filter((p) => p.done).length };
        }),
      };
    });
    const peaksAll = ref(false);
    const peakVisible = (p) => peaksAll.value || Math.abs(p.i - climb.value.idx) <= 2;
    const recordShow = ref(20);
    watch(recordMode, () => { recordShow.value = 20; });
    const records = computed(() => {
      const momo = studyByDate.value;
      const app = appTime;
      const [y, m, d] = todayParts();
      const sumRange = (start, n) => {
        let a = 0, b = 0, days = 0;
        for (let k = 0; k < n; k += 1) {
          const key = localDate(new Date(start.getFullYear(), start.getMonth(), start.getDate() + k));
          const x = momo.get(key) || 0, z = app[key] || 0;
          a += x; b += z; if ((srcMomo.value && x) || (srcApp.value && z)) days += 1;
        }
        return { momo: a, app: b, days };
      };
      const rows = [];
      if (recordMode.value === "day") {
        for (let i = 0; i < 120; i += 1) {
          const dt = new Date(y, m - 1, d - i);
          const r = sumRange(dt, 1);
          if (!r.days && i) continue;
          rows.push({ key: localDate(dt), label: i === 0 ? "今天" : i === 1 ? "昨天" : `${dt.getMonth() + 1} 月 ${dt.getDate()} 日`,
            sub: `周${"日一二三四五六"[dt.getDay()]}${dt.getFullYear() !== y ? ` · ${dt.getFullYear()}` : ""}`, now: i === 0, ...r });
        }
      } else if (recordMode.value === "week") {
        const mon = thisMonday();
        for (let i = 0; i < 52; i += 1) {
          const st = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() - i * 7);
          const en = new Date(st.getFullYear(), st.getMonth(), st.getDate() + 6);
          const r = sumRange(st, 7);
          if (!r.days && i) continue;
          rows.push({ key: localDate(st), label: i === 0 ? "本周" : i === 1 ? "上周" : `${st.getMonth() + 1}/${st.getDate()} – ${en.getMonth() + 1}/${en.getDate()}`,
            sub: r.days ? `学了 ${r.days} 天` : "还没学", now: i === 0, ...r });
        }
      } else {
        for (let i = 0; i < 24; i += 1) {
          const st = new Date(y, m - 1 - i, 1);
          const n = new Date(st.getFullYear(), st.getMonth() + 1, 0).getDate();
          const r = sumRange(st, n);
          if (!r.days && i) continue;
          rows.push({ key: localDate(st).slice(0, 7), label: i === 0 ? "本月" : `${st.getFullYear() !== y ? st.getFullYear() + " 年 " : ""}${st.getMonth() + 1} 月`,
            sub: r.days ? `学了 ${r.days} 天` : "还没学", now: i === 0, ...r });
        }
      }
      const max = Math.max(60000, ...rows.map((r) => Math.max(srcMomo.value ? r.momo : 0, srcApp.value ? r.app : 0)));
      for (const r of rows) { r.momoPct = r.momo ? Math.max(3, (r.momo / max) * 100) : 0; r.appPct = r.app ? Math.max(3, (r.app / max) * 100) : 0; }
      const week = sumRange(thisMonday(), Math.round((new Date(y, m - 1, d) - thisMonday()) / 86400000) + 1);
      let tm = 0; for (const v of momo.values()) tm += v;
      let ta = 0; for (const v of Object.values(app)) ta += v;
      return { rows, week, total: { momo: tm, app: ta } };
    });

    async function loadHistory() {
      try {
        const data = await api("/api/days");
        days.value = data.days || [];
        study.value = data.study || [];
        serverToday.value = data.today;
      } catch (e) { toast(e.message); }
    }

    // ---------------------------------------------------------------- 设置
    function addProfile(preset) {
      const p = makeProfile({ ...(preset || {}) });
      const names = new Set(store.profiles.map((x) => x.name));
      let name = p.name; let i = 2;
      while (names.has(name)) name = `${p.name} ${i++}`;
      p.name = name;
      store.profiles.push(p);
      editId.value = p.id;
      if (!activeProfile.value) store.activeId = p.id;
      return p;
    }
    function addFromPreset() {
      const preset = PRESETS.find((x) => x.name === presetPick.value);
      if (preset) addProfile(preset);
      presetPick.value = "";
    }
    function duplicateProfile(p) {
      addProfile({ ...p, id: undefined, name: `${p.name} 副本` });
    }
    async function deleteProfile(p) {
      if (store.profiles.length <= 1) { toast("至少保留一个模型配置"); return; }
      if (!(await ask({ title: "删除模型？", text: `删除模型配置「${p.name}」。`, ok: "删除", danger: true }))) return;
      store.profiles = store.profiles.filter((x) => x.id !== p.id);
      if (store.activeId === p.id) store.activeId = store.profiles[0].id;
      if (store.lookupId === p.id) store.lookupId = "";
      editId.value = store.activeId;
    }
    function setProtocol(p, protocol) {
      const old = PROTOCOLS.find((x) => x.id === p.protocol);
      p.protocol = protocol;
      if (!p.baseUrl || (old && p.baseUrl === old.base)) p.baseUrl = PROTOCOLS.find((x) => x.id === protocol).base;
      delete modelLists[p.id];
    }
    const protocolBase = (p) => (PROTOCOLS.find((x) => x.id === p.protocol) || PROTOCOLS[0]).base;
    const fmtTokens = (n) => (n >= 1048576 ? `${Math.round(n / 1048576)}M` : n >= 1000 ? `${Math.round(n / 1024)}K` : String(n));

    async function fetchModels(p) {
      profileStatus[p.id] = "正在获取模型列表…";
      try {
        const r = await api("/api/llm-models", { llm: profileCfg(p) });
        modelLists[p.id] = r.models;
        profileStatus[p.id] = r.models.length ? `找到 ${r.models.length} 个模型，可在「模型名」里选择` : "接口没有返回模型";
        if (!p.model && r.models.length) p.model = r.models[0];
      } catch (e) {
        profileStatus[p.id] = `获取失败：${e.message}`;
      }
    }
    async function testProfile(p) {
      profileStatus[p.id] = "正在连接…";
      try {
        const r = await api("/api/llm-test", { llm: profileCfg(p) });
        profileStatus[p.id] = `连接成功（${(r.ms / 1000).toFixed(1)} 秒）：${r.url}，回复 ${r.reply}`;
      } catch (e) {
        profileStatus[p.id] = `连接失败：${e.message}`;
      }
    }
    async function testMomo() {
      if (!store.token) { momoStatus.value = "先填写 Token"; return; }
      momoStatus.value = "正在连接墨墨…";
      try {
        const r = await api("/api/momo-test", { token: store.token, momoProxy: momoProxy() });
        momoStatus.value = `墨墨连接成功（${(r.ms / 1000).toFixed(1)} 秒），今天已背 ${fmtDuration(r.studyTimeMs)}`;
      } catch (e) {
        momoStatus.value = `连接失败：${e.message}`;
      }
    }

    function exportProfiles(withKeys) {
      const profiles = store.profiles.map((p) => {
        const { id, ...rest } = p;
        return withKeys ? rest : { ...rest, apiKey: "" };
      });
      download(JSON.stringify({ app: "momo-kan", kind: "model-profiles", version: 1, profiles }, null, 2),
        `${brandName.value}-模型配置${withKeys ? "（含Key）" : ""}.json`, "application/json;charset=utf-8");
    }
    function importProfiles(ev) {
      const file = ev.target.files && ev.target.files[0];
      ev.target.value = "";
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(String(reader.result));
          const list = Array.isArray(data) ? data : Array.isArray(data.profiles) ? data.profiles : [data];
          let n = 0;
          for (const raw of list) {
            if (!raw || typeof raw !== "object") continue;
            // 也接受只有 baseUrl/model/apiKey（或 base_url / api_key）的简单 JSON
            const p = cleanProfile({
              ...raw, id: undefined,
              baseUrl: raw.baseUrl ?? raw.base_url ?? raw.llmBaseUrl, apiKey: raw.apiKey ?? raw.api_key ?? raw.llmApiKey,
              model: raw.model ?? raw.llmModel, maxTokens: raw.maxTokens ?? raw.max_tokens, contextWindow: raw.contextWindow ?? raw.context_window,
            });
            addProfile(p);
            n += 1;
          }
          toast(n ? `已导入 ${n} 个模型配置` : "文件里没有模型配置");
        } catch {
          toast("导入失败：不是有效的 JSON");
        }
      };
      reader.readAsText(file);
    }
    async function clearSecrets() {
      if (!(await ask({ title: "清除密钥？", text: "清除墨墨 Token 和所有模型的 API Key。历史文章和模型配置都会保留。", ok: "清除", danger: true }))) return;
      store.token = "";
      store.profiles.forEach((p) => { p.apiKey = ""; });
      toast("已清除");
    }

    // ---------------------------------------------------------------- 路由
    function route() {
      closePop();
      menuOpen.value = "";
      barHidden.value = false;
      const h = location.hash || "#/today";
      if (h.startsWith("#/history")) { view.value = "history"; loadHistory(); return; }
      if (h.startsWith("#/settings")) {
        view.value = "settings";
        const t = h.split("/")[2] || "";
        settingsTab.value = SETTINGS_SECTIONS.some((g) => g.id === t) ? t : "";
        if (settingsTab.value === "data") loadBackup();
        if (settingsTab.value === "records") loadHistory();
        if (settingsTab.value === "connect") loadConn(); editId.value = editProfile.value ? editProfile.value.id : store.activeId; return; }
      const wasDay = view.value === "day";
      view.value = "day";
      const m = h.match(/^#\/(?:day\/(\d{4}-\d{2}-\d{2})|today)(?:\/a\/(\d+))?\/?$/);
      const d = (m && m[1]) || serverToday.value;
      const prevRead = readIdx.value;
      readIdx.value = m && m[2] !== undefined ? Number(m[2]) : null;
      if (prevRead !== readIdx.value) window.scrollTo(0, 0);
      // 列表 ↔ 阅读页切换不重新加载（否则会清掉正在生成的进度）
      if (wasDay && loadedDay === d) return;
      loadedDay = d;
      loadDay(d);
    }

    function onKey(e) {
      if (e.key === "Escape") closePop();
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !busy.value && view.value === "day") generateAll();
    }
    function onDocClick(e) {
      if (!pop.open) return;
      if (e.target.closest(".popover, .t, .w")) return;
      closePop();
    }

    // 心跳：服务以 --auto-exit 启动时，关闭网页后会自动退出
    const clientId = newId();
    let beatFails = 0;
    async function heartbeat() {
      try {
        if (LOCAL) return;
        await fetch("/api/heartbeat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: clientId }) });
        if (beatFails >= 2) setBanner("");
        beatFails = 0;
      } catch {
        beatFails += 1;
        if (beatFails === 2) setBanner("本地服务已停止：在电脑上重新双击 start.bat 启动后刷新页面", "error");
      }
    }
    const onPageHide = () => !LOCAL && navigator.sendBeacon("/api/bye", new Blob([JSON.stringify({ id: clientId })], { type: "text/plain" }));
    const onVisible = () => { if (document.visibilityState === "visible") { heartbeat(); pullSettings(); } };
    let beatTimer = null;

    // M3 水波纹：按钮、标签、导航等按下时从手指位置扩散
    function onRipple(ev) {
      const el = ev.target.closest && ev.target.closest(".btn, .chip, .icon-btn, .nav-item .nav-indicator, .nav-item, .tab, .segmented button, .option, .list-item, .profile-item, .swatch-dot, .m-menu-item, .m-select-field, .settings-item");
      if (!el || el.disabled) return;
      const host = el.classList.contains("nav-item") ? el.querySelector(".nav-indicator") || el : el;
      const r = host.getBoundingClientRect();
      const size = Math.max(r.width, r.height) * 2.2;
      const dot = document.createElement("span");
      dot.className = "ripple";
      dot.style.cssText = `width:${size}px;height:${size}px;left:${ev.clientX - r.left - size / 2}px;top:${ev.clientY - r.top - size / 2}px`;
      if (getComputedStyle(host).position === "static") host.style.position = "relative";
      host.style.overflow = "hidden";
      host.appendChild(dot);
      setTimeout(() => dot.remove(), 600);
    }

    onMounted(async () => {
      document.addEventListener("pointerdown", onRipple, { passive: true });
      window.addEventListener("scroll", onScroll, { passive: true });
      heartbeat();
      beatTimer = setInterval(heartbeat, 15000);
      window.addEventListener("pagehide", onPageHide);
      document.addEventListener("visibilitychange", onVisible);
      // 先挂好路由、立刻显示这一天：拉设置、探测电脑（手机上电脑不在线时要等几秒）都放到后台，
      // 否则启动时点底部导航没反应、首页要等这些都完成才出来
      window.addEventListener("hashchange", route);
      document.addEventListener("keydown", onKey);
      document.addEventListener("click", onDocClick);
      route();
      api("/api/days").then((r) => {
        if (!r || !r.today || r.today === serverToday.value) return;
        const wasToday = isToday.value;
        serverToday.value = r.today;
        // 服务器的「今天」和本机日期不同（跨零点、时区）：今天页按服务器日期重新加载
        if (view.value === "day" && wasToday && !/^#\/day\//.test(location.hash)) { loadedDay = ""; route(); }
      }).catch(() => { /* 用本机日期 */ });
      api("/api/health").then((h) => { lanUrls.value = h.lan || []; health.dataDir = h.dataDir || ""; health.local = !!h.local; health.version = h.version || ""; }).catch(() => { /* 旧版服务 */ });
      pullSettings();
    });
    onBeforeUnmount(() => {
      clearInterval(beatTimer);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("hashchange", route);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onDocClick);
    });

    return {
      RESP_ZH, EXAM_TARGETS, TABS, icons: ICONS, navItems,
      REASONING, LOOKUP_MODES, addDeepSeekFallback, pullSettings, dialog, closeDialog, settingsTab, visibleSections, settingsSection, localState, syncLocalNow, health, backup, runBackup, restoreBackup, saveBackupCfg, fmtTime, IS_LOCAL: !!LOCAL, lookupWithAi, chartMode, chartStats, historyLimit,
      theme, THEME_MODES, THEME_PRESETS, isCustomSeed, swatchColors, setTheme, inApp, appInfo, appCall,
      store, sync, opts, editId, editProfile, activeProfile, modelLists, profileStatus, momoStatus, lanUrls, presetPick, importInput,
      PROTOCOLS, PROXY_MODES, PRESETS, CONTEXT_CHIPS, MAX_WORDS_CHIPS, view, date, serverToday, day, busy, progress, banner, snack, responses, manualWords,
      revealed, answers, drillBusy, days, pop,
      isToday, activeNav, pickedWords, slots, chart, chartMax,
      readIdx, readSlots, readHref, dayHref, appVersion, FONT_SIZES, menuOpen, toggleMenu, menuDo, wordDlg, openWordDlg, brandName, eggDlg, eggCode, aboutLogoTap, submitEgg,
      RECORD_MODES, recordMode, recordShow, records, RECORD_VIEWS, recordView, heat, heatWeeks, heatPick, heatDetail, pickHeat, climb, PEAKS, RECORD_SRCS, recordSrc, srcMomo, srcApp, peaksAll, peakVisible, TIERS_NAME: TIERS,
      fmtDate, fmtDuration, durParts, fmtShort, weekStudy, conn, loadConn, saveConn, CONN_BRIDGE, barHidden, styleName, countOf, rendered, keyOf, respOf, tabOf, setTab,
      fetchMomo, toggleResponse, addManualWords, removeWord, generateAll, generateOne, regenerate,
      makeDrills, toggleReveal, answer, optionClass, addToStudy, saveNotepad,
      exportWord, exportPdf, exportMarkdown, showTarget, lookupWord, closePop,
      addProfile, addFromPreset, duplicateProfile, deleteProfile, setProtocol, protocolBase, fmtTokens,
      fetchModels, testProfile, testMomo, exportProfiles, importProfiles, clearSecrets,
    };
  },
}).component("m-select", MSelect).mount("#app");
