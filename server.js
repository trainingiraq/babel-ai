const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PUBLIC_ROOT = path.join(ROOT, "public");
const ENV_PATH = path.join(ROOT, ".env.local");
const OPENAI_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5.4-nano";
const MAX_BODY_BYTES = 1024 * 1024;

const requestLog = new Map();
const dailyUsage = new Map();

function loadDotEnv() {
  if (!fs.existsSync(ENV_PATH)) return;

  const lines = fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    const index = line.indexOf("=");
    if (index < 1) continue;

    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) process.env[key] = value;
  }
}

function send(res, status, data, contentType = "application/json; charset=utf-8") {
  const body = Buffer.isBuffer(data)
    ? data
    : Buffer.from(typeof data === "string" ? data : JSON.stringify(data), "utf8");

  res.writeHead(status, {
    "Content-Type": contentType,
    "Content-Length": body.length,
    "Connection": "close",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
}

function mimeType(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    default:
      return "application/octet-stream";
  }
}

function getClientId(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "unknown";
}

function allowedAccessCodes() {
  const codes = [];
  if (process.env.APP_ACCESS_CODE) codes.push(process.env.APP_ACCESS_CODE);
  if (process.env.APP_ACCESS_CODES) {
    codes.push(
      ...process.env.APP_ACCESS_CODES.split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    );
  }
  return new Set(codes);
}

function checkAccessCode(code) {
  const codes = allowedAccessCodes();
  if (codes.size === 0) return true;
  return codes.has(String(code || ""));
}

function checkBurstLimit(clientId) {
  const now = Date.now();
  const cutoff = now - 10 * 60 * 1000;
  const entries = (requestLog.get(clientId) || []).filter((time) => time > cutoff);
  if (entries.length >= 25) {
    requestLog.set(clientId, entries);
    return false;
  }
  entries.push(now);
  requestLog.set(clientId, entries);
  return true;
}

function checkDailyLimit(accessCode) {
  const limit = Number.parseInt(process.env.DAILY_REQUEST_LIMIT || "50", 10);
  if (!Number.isFinite(limit) || limit < 1) return false;

  const today = new Date().toISOString().slice(0, 10);
  const key = `${today}:${accessCode || "public"}`;
  const count = dailyUsage.get(key) || 0;
  if (count >= limit) return false;
  dailyUsage.set(key, count + 1);
  return true;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function modeInstructions(mode) {
  switch (mode) {
    case "concise":
      return "Answer briefly and clearly. Provide practical steps only when the user needs them.";
    case "deep":
      return "Give a deeper, well-structured answer. Explain assumptions, risks, and next steps when useful.";
    default:
      return "Keep the answer friendly, balanced, easy for the public to understand, and avoid unnecessary complexity.";
  }
}

function buildInput(messages) {
  const recent = Array.isArray(messages) ? messages.slice(-12) : [];
  const lines = [];

  for (const message of recent) {
    const role = message && message.role === "assistant" ? "Assistant" : "User";
    let content = String((message && message.content) || "").trim();
    if (!content) continue;
    if (content.length > 4000) content = content.slice(0, 4000);
    lines.push(`${role}: ${content}`);
  }

  return lines.join("\n\n") || "User: Hello";
}

function extractText(response) {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }

  const parts = [];
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string" && content.text.trim()) {
        parts.push(content.text);
      }
    }
  }

  return parts.join("\n\n") || "The model returned a response, but the text could not be read. Try again.";
}

async function callOpenAI(messages, mode) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw Object.assign(new Error("OPENAI_API_KEY is missing."), { status: 500 });

  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const instructions = [
    'You are a general-purpose AI assistant named "Arkan AI" / "أركان".',
    "You help the public understand, plan, write, learn, and solve everyday problems.",
    "Reply in the user's language by default. If the user writes Arabic, reply in clear Arabic.",
    "Use simple, respectful language and avoid unnecessary technical complexity.",
    "Do not claim to be human or to have legal, medical, financial, or personal authority.",
    "For sensitive medical, legal, or financial topics, provide general information and recommend consulting a qualified professional before decisions.",
    "If the request is unclear, ask one short clarifying question or state a reasonable assumption and continue.",
    "Protect user privacy. Do not ask for passwords, API keys, banking details, or secrets.",
    modeInstructions(mode),
  ].join("\n");

  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions,
      input: buildInput(messages),
      max_output_tokens: 900,
      store: false,
    }),
  });

  if (!response.ok) {
    let detail = "";
    try {
      detail = await response.text();
    } catch {
      detail = "";
    }
    const error = new Error(detail || `OpenAI request failed with ${response.status}.`);
    error.status = response.status;
    throw error;
  }

  const json = await response.json();
  return { reply: extractText(json), model };
}

async function handleChat(req, res) {
  const clientId = getClientId(req);
  if (!checkBurstLimit(clientId)) {
    return send(res, 429, { error: "Local request limit reached. Wait a little, then try again." });
  }

  let data;
  try {
    data = JSON.parse(await readBody(req));
  } catch {
    return send(res, 400, { error: "Invalid request format." });
  }

  if (!checkAccessCode(data.accessCode)) {
    return send(res, 401, { error: "Access code is required." });
  }

  if (!Array.isArray(data.messages) || data.messages.length === 0) {
    return send(res, 400, { error: "Write a message first." });
  }

  if (!checkDailyLimit(data.accessCode)) {
    return send(res, 429, { error: "Daily request limit reached." });
  }

  try {
    const answer = await callOpenAI(data.messages, String(data.mode || "balanced"));
    return send(res, 200, answer);
  } catch (error) {
    let message = "Could not get a response from OpenAI. Check the key, billing, or connection, then try again.";
    if (error.status === 401) message = "The OpenAI API key is invalid or unauthorized.";
    if (error.status === 429) message = "Usage, rate, or billing limit reached. Check OpenAI limits and billing.";
    if (error.status === 400) message = "OpenAI rejected the request. The model may be unavailable to your account or the request format may need adjustment.";
    return send(res, 500, { error: message });
  }
}

function handleStatic(req, res) {
  let pathname = "/";
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    pathname = "/";
  }

  if (pathname === "/") pathname = "/index.html";

  const filePath = path.resolve(PUBLIC_ROOT, `.${pathname}`);
  if (!filePath.startsWith(PUBLIC_ROOT + path.sep) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return send(res, 404, "Not found", "text/plain; charset=utf-8");
  }

  send(res, 200, fs.readFileSync(filePath), mimeType(filePath));
}

loadDotEnv();

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/api/health") {
    return send(res, 200, {
      ok: true,
      model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
      accessCodeRequired: allowedAccessCodes().size > 0,
    });
  }

  if (req.method === "POST" && req.url === "/api/chat") {
    return handleChat(req, res);
  }

  if (req.method === "GET") {
    return handleStatic(req, res);
  }

  send(res, 405, { error: "Method not allowed." });
});

const port = Number.parseInt(process.env.PORT || "5174", 10);
server.listen(port, () => {
  console.log(`Arkan AI is running on port ${port}`);
});
