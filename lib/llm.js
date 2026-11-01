// 多协议大模型客户端：OpenAI Chat Completions / OpenAI Responses / Anthropic Messages / Google Gemini / Ollama。
// cfg = { protocol, baseUrl, apiKey, model, maxTokens, contextWindow, temperature, proxy }
const net = require("./net");

class LLMError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = "LLMError";
    this.status = status;
  }
}

const PROTOCOLS = {
  openai: "OpenAI 兼容（Chat Completions）",
  responses: "OpenAI Responses",
  anthropic: "Anthropic Messages",
  gemini: "Google Gemini",
  ollama: "Ollama 原生",
};

const DEFAULT_BASE = {
  openai: "",
  responses: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com",
  gemini: "https://generativelanguage.googleapis.com",
  ollama: "http://127.0.0.1:11434",
};

const trimSlash = (u) => String(u || "").trim().replace(/\/+$/, "");
const hasVersion = (u) => /\/(v\d+(beta)?|api\/paas\/v\d+|compatible-mode\/v\d+|openai)$/.test(u);

function protocolOf(cfg) {
  return PROTOCOLS[cfg.protocol] ? cfg.protocol : "openai";
}

function baseOf(cfg) {
  const p = protocolOf(cfg);
  const u = trimSlash(cfg.baseUrl) || DEFAULT_BASE[p];
  if (!u) throw new LLMError("请先在「设置 → 模型」里填写 Base URL", 400);
  return u;
}

// 生成接口地址
function endpoint(cfg) {
  const p = protocolOf(cfg);
  const u = baseOf(cfg);
  switch (p) {
    case "responses":
      if (u.endsWith("/responses")) return u;
      return hasVersion(u) ? `${u}/responses` : `${u}/v1/responses`;
    case "anthropic":
      if (u.endsWith("/messages")) return u;
      return hasVersion(u) ? `${u}/messages` : `${u}/v1/messages`;
    case "gemini": {
      const root = u.replace(/\/models\/[^/]+(:\w+)?$/, "");
      const ver = /\/v\d+(beta)?$/.test(root) ? root : `${root}/v1beta`;
      return `${ver}/models/${encodeURIComponent(cfg.model || "gemini-2.5-flash")}:generateContent`;
    }
    case "ollama":
      if (u.endsWith("/api/chat")) return u;
      return `${u.replace(/\/(api|v1)$/, "")}/api/chat`;
    default:
      if (u.endsWith("/chat/completions")) return u;
      if (hasVersion(u) || /^https:\/\/api\.deepseek\.com$/.test(u)) return `${u}/chat/completions`;
      return `${u}/v1/chat/completions`;
  }
}

// 模型列表地址
function modelsEndpoint(cfg) {
  const p = protocolOf(cfg);
  const u = baseOf(cfg);
  switch (p) {
    case "anthropic": return `${u.replace(/\/messages$/, "").replace(/\/v1$/, "")}/v1/models?limit=100`;
    case "gemini": {
      const root = u.replace(/\/models\/.*$/, "");
      return `${/\/v\d+(beta)?$/.test(root) ? root : `${root}/v1beta`}/models?pageSize=200`;
    }
    case "ollama": return `${u.replace(/\/api\/chat$/, "").replace(/\/(api|v1)$/, "")}/api/tags`;
    default: {
      const root = u.replace(/\/(chat\/completions|responses)$/, "");
      return hasVersion(root) || /^https:\/\/api\.deepseek\.com$/.test(root) ? `${root}/models` : `${root}/v1/models`;
    }
  }
}

function headersFor(cfg) {
  const p = protocolOf(cfg);
  const h = { "Content-Type": "application/json", Accept: "application/json" };
  const key = String(cfg.apiKey || "").trim();
  if (p === "anthropic") {
    h["anthropic-version"] = "2023-06-01";
    if (key) h["x-api-key"] = key;
  } else if (p === "gemini") {
    if (key) h["x-goog-api-key"] = key;
  } else if (key) {
    h.Authorization = `Bearer ${key}`;
  }
  return h;
}

const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : d);
const maxTokensOf = (cfg) => num(cfg.maxTokens, 8192);
const contextOf = (cfg) => num(cfg.contextWindow, 0);

// 粗略估算 token：中文按 1 字 ≈ 1 token，其它按 4 字符 ≈ 1 token
function estimateTokens(messages) {
  const text = messages.map((m) => m.content).join("\n");
  const cjk = (text.match(/[\u3000-\u9fff\uff00-\uffef]/g) || []).length;
  return Math.ceil(cjk + (text.length - cjk) / 4) + messages.length * 4;
}

// 是否放得进上下文：输入 + 最大输出 ≤ 上下文
function fits(cfg, messages, maxTokens = maxTokensOf(cfg)) {
  const ctx = contextOf(cfg);
  return !ctx || estimateTokens(messages) + maxTokens <= ctx;
}

// 思考等级：""=不传（模型默认）| none | low | medium | high
const REASONING = ["none", "low", "medium", "high"];
const reasoningOf = (cfg) => (REASONING.includes(cfg.reasoning) ? cfg.reasoning : "");

function buildPayload(cfg, messages, opts) {
  const body = buildBase(cfg, messages, opts);
  applyReasoning(cfg, body, opts.maxTokens);
  return body;
}

function applyReasoning(cfg, body, maxTokens) {
  const r = reasoningOf(cfg);
  if (!r) return;
  switch (protocolOf(cfg)) {
    case "responses":
      body.reasoning = { effort: r };
      if (r !== "none") delete body.temperature; // 推理模型不接受 temperature
      break;
    case "anthropic": {
      if (r === "none") break; // 默认就是不思考
      const budget = Math.min({ low: 2048, medium: 8192, high: 24576 }[r], (maxTokens || 8192) - 1024);
      if (budget >= 1024) { body.thinking = { type: "enabled", budget_tokens: budget }; delete body.temperature; }
      break;
    }
    case "gemini":
      body.generationConfig.thinkingConfig = { thinkingBudget: { none: 0, low: 1024, medium: 8192, high: 24576 }[r] };
      break;
    case "ollama":
      body.think = r === "none" ? false : r;
      break;
    default:
      // OpenAI 兼容：reasoning_effort 是通用写法；关思考时再带上 DeepSeek / vLLM(Qwen) 的开关（官方 OpenAI 不认这些字段）
      body.reasoning_effort = r;
      if (!/api\.openai\.com/.test(baseOf(cfg))) {
        if (r === "none") {
          body.thinking = { type: "disabled" };
          body.chat_template_kwargs = { enable_thinking: false, thinking: false };
        } else {
          body.thinking = { type: "enabled" };
        }
      }
  }
}

function buildBase(cfg, messages, { json, temperature, maxTokens }) {
  const p = protocolOf(cfg);
  const model = cfg.model || "deepseek-v4.1-flash";
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const rest = messages.filter((m) => m.role !== "system");
  switch (p) {
    case "responses": {
      const body = { model, input: rest.map((m) => ({ role: m.role, content: m.content })), max_output_tokens: maxTokens, store: false };
      if (system) body.instructions = system;
      if (temperature != null) body.temperature = temperature;
      if (json) body.text = { format: { type: "json_object" } };
      return body;
    }
    case "anthropic": {
      const body = { model, max_tokens: maxTokens, messages: rest.map((m) => ({ role: m.role, content: m.content })) };
      if (system) body.system = system;
      if (temperature != null) body.temperature = Math.min(temperature, 1);
      return body;
    }
    case "gemini": {
      const body = {
        contents: rest.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
        generationConfig: { maxOutputTokens: maxTokens },
      };
      if (system) body.systemInstruction = { parts: [{ text: system }] };
      if (temperature != null) body.generationConfig.temperature = temperature;
      if (json) body.generationConfig.responseMimeType = "application/json";
      return body;
    }
    case "ollama": {
      const options = { num_predict: maxTokens };
      if (contextOf(cfg)) options.num_ctx = contextOf(cfg);
      if (temperature != null) options.temperature = temperature;
      const body = { model, messages, stream: false, options };
      if (json) body.format = "json";
      return body;
    }
    default: {
      const body = { model, messages, stream: false };
      if (temperature != null) body.temperature = temperature;
      // OpenAI 官方新模型只认 max_completion_tokens；其它兼容服务用 max_tokens
      if (/api\.openai\.com/.test(baseOf(cfg))) body.max_completion_tokens = maxTokens;
      else body.max_tokens = maxTokens;
      if (json) body.response_format = { type: "json_object" };
      return body;
    }
  }
}

// 从响应里取文本与是否被截断
function readReply(cfg, data) {
  const p = protocolOf(cfg);
  switch (p) {
    case "responses": {
      let text = typeof data.output_text === "string" ? data.output_text : "";
      if (!text) {
        for (const item of data.output || []) {
          for (const c of item.content || []) if (c.type === "output_text" && c.text) text += c.text;
        }
      }
      const truncated = data.status === "incomplete" && data.incomplete_details?.reason === "max_output_tokens";
      return { text, truncated, usage: data.usage || null };
    }
    case "anthropic": {
      const text = (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
      return { text, truncated: data.stop_reason === "max_tokens", usage: data.usage || null };
    }
    case "gemini": {
      const cand = (data.candidates || [])[0] || {};
      const text = (cand.content?.parts || []).filter((x) => x.text && !x.thought).map((x) => x.text).join("");
      if (!text && data.promptFeedback?.blockReason) throw new LLMError(`Gemini 拒绝了请求：${data.promptFeedback.blockReason}`);
      return { text, truncated: cand.finishReason === "MAX_TOKENS", usage: data.usageMetadata || null };
    }
    case "ollama":
      return { text: data.message?.content || "", truncated: data.done_reason === "length", usage: { prompt_tokens: data.prompt_eval_count, completion_tokens: data.eval_count } };
    default: {
      const choice = (data.choices || [])[0];
      if (!choice) throw new LLMError("模型返回格式不是 Chat Completions（确认协议选对了）");
      return { text: choice.message?.content || "", truncated: choice.finish_reason === "length", usage: data.usage || null };
    }
  }
}

function errorText(status, text) {
  let msg = text.slice(0, 300);
  try {
    const d = JSON.parse(text);
    msg = d.error?.message || d.error || d.message || d.detail || msg;
    if (typeof msg !== "string") msg = JSON.stringify(msg).slice(0, 300);
  } catch { /* 原文 */ }
  return msg;
}

async function send(cfg, url, payload, timeoutMs) {
  try {
    return await net.request(url, { method: "POST", headers: headersFor(cfg), body: JSON.stringify(payload), timeoutMs, proxy: cfg.proxy });
  } catch (e) {
    if (e.code === "TIMEOUT") throw new LLMError("模型响应超时");
    const hint = /ECONNREFUSED/.test(e.message) && !cfg.proxy ? "（服务没启动，或需要开代理？）" : "";
    throw new LLMError(`无法连接模型（${url}）：${e.message}${hint}`);
  }
}

async function chat(cfg, messages, { json = true, temperature = 0.8, timeoutMs = 600000, maxTokens } = {}) {
  const mt = num(maxTokens, maxTokensOf(cfg));
  const ctx = contextOf(cfg);
  if (ctx) {
    const need = estimateTokens(messages);
    if (need + Math.min(mt, 1024) > ctx) {
      throw new LLMError(`输入约 ${need} tokens，超过上下文 ${ctx}：请在设置里调大「上下文」，或减少每篇词数`, 400);
    }
  }
  // 上下文放不下完整的最大输出时，自动压缩输出上限
  const outCap = ctx ? Math.max(512, Math.min(mt, ctx - estimateTokens(messages))) : mt;
  const url = endpoint(cfg);
  const payload = buildPayload(cfg, messages, { json, temperature, maxTokens: outCap });

  let r = await send(cfg, url, payload, timeoutMs);
  // 有的服务不认识 JSON 模式参数，去掉再试一次
  if (!r.ok && json && (r.status === 400 || r.status === 422)) {
    delete payload.response_format;
    delete payload.format;
    if (payload.text) delete payload.text;
    if (payload.generationConfig) delete payload.generationConfig.responseMimeType;
    r = await send(cfg, url, payload, timeoutMs);
  }
  if (r.status === 401 || r.status === 403) throw new LLMError(`模型拒绝访问（${r.status}）：${errorText(r.status, r.text)}，检查 API Key`);
  if (r.status === 404) throw new LLMError(`模型接口 404：${errorText(r.status, r.text)}（检查 Base URL、协议和模型名）`);
  if (r.status === 429) throw new LLMError("模型限流（429），稍后再试");
  if (!r.ok) throw new LLMError(`模型接口返回 ${r.status}：${errorText(r.status, r.text)}`);

  let data;
  try { data = JSON.parse(r.text); } catch { throw new LLMError("模型返回的不是 JSON（确认 Base URL 和协议对应）"); }
  const reply = readReply(cfg, data);
  const text = stripThink(reply.text);
  if (json && reply.truncated) {
    try { parseJson(text); } catch {
      throw new LLMError(`输出达到「最大输出」${outCap} tokens 被截断，请在设置里调大最大输出${ctx ? "或上下文" : ""}`);
    }
  }
  if (!text) throw new LLMError(reply.truncated ? `输出为空且被截断（最大输出 ${outCap}），思考模型请调大最大输出` : "模型返回了空内容");
  return { text, usage: reply.usage, truncated: reply.truncated };
}

async function listModels(cfg) {
  const url = modelsEndpoint(cfg);
  let r;
  try {
    r = await net.request(url, { headers: headersFor(cfg), timeoutMs: 20000, proxy: cfg.proxy });
  } catch (e) {
    throw new LLMError(`无法连接（${url}）：${e.message}`);
  }
  if (!r.ok) throw new LLMError(`获取模型列表失败（${r.status}）：${errorText(r.status, r.text)}`);
  let d;
  try { d = JSON.parse(r.text); } catch { throw new LLMError("模型列表不是 JSON"); }
  const p = protocolOf(cfg);
  let models = [];
  if (p === "ollama") models = (d.models || []).map((m) => m.name || m.model);
  else if (p === "gemini") {
    models = (d.models || []).filter((m) => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes("generateContent"))
      .map((m) => String(m.name || "").replace(/^models\//, ""));
  } else models = (d.data || d.models || []).map((m) => m.id || m.name);
  return [...new Set(models.filter(Boolean))].sort();
}

function stripThink(text) {
  return String(text || "").replace(/<think>[\s\S]*?<\/think>/g, "").replace(/^[\s\S]*?<\/think>/, "").trim();
}

function parseJson(text) {
  const t = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(t); } catch { /* fallthrough */ }
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(t.slice(start, end + 1)); } catch { /* fallthrough */ }
  }
  throw new LLMError("模型没有返回合法 JSON");
}

// 兼容旧版：只传 baseUrl 也能用
function normalizeUrl(baseUrl) {
  return endpoint({ protocol: "openai", baseUrl });
}

module.exports = {
  LLMError, PROTOCOLS, chat, listModels, parseJson, stripThink, normalizeUrl, endpoint, modelsEndpoint,
  estimateTokens, fits, buildPayload, readReply,
};
