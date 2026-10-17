const express = require("express");
const cors = require("cors");
const http = require("http");
const WebSocket = require("ws");
const fs = require("fs/promises");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const INTERVAL_MS = Math.max(20000, Number(process.env.INTERVAL_MS || 25000));
const MAX_EVENTS = 80;
const MEMORY_FILE = path.join(__dirname, "memory.json");
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "*";

if (!API_KEY) {
  console.error("Missing GEMINI_API_KEY environment variable.");
  process.exit(1);
}

const app = express();
app.use(cors({
  origin: FRONTEND_ORIGIN === "*" ? true : FRONTEND_ORIGIN.split(",").map(s => s.trim()),
  methods: ["GET"]
}));
app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/health", (_req, res) => res.json({
  ok: true,
  clients: wss ? wss.clients.size : 0,
  events: events.length,
  generating
}));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: MODEL_NAME });

let events = [];
let worldSummary = "The universe has just begun. No major facts have been established yet.";
let generating = false;
let eventCounter = 0;
let timer = null;

function safeSend(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function broadcast(payload) {
  const data = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  }
}

async function loadMemory() {
  try {
    const data = JSON.parse(await fs.readFile(MEMORY_FILE, "utf8"));
    events = Array.isArray(data.events) ? data.events.slice(-MAX_EVENTS) : [];
    worldSummary = typeof data.worldSummary === "string" ? data.worldSummary : worldSummary;
    eventCounter = Number(data.eventCounter || events.length);
    console.log(`Loaded ${events.length} saved events.`);
  } catch (err) {
    if (err.code !== "ENOENT") console.warn("Could not load memory:", err.message);
  }
}

async function saveMemory() {
  // Best effort only: Render's free filesystem is ephemeral and may be reset.
  const temp = MEMORY_FILE + ".tmp";
  const data = JSON.stringify({ events, worldSummary, eventCounter }, null, 2);
  await fs.writeFile(temp, data, "utf8");
  await fs.rename(temp, MEMORY_FILE);
}

function makePrompt() {
  const recent = events.slice(-12).map(e => `#${e.id}: ${e.text}`).join("\n");
  return `You are the chronicler of a shared, evolving science-fantasy universe.
Continue the same canon. Create ONE new event, not a list.
Requirements:
- 80 to 130 words, vivid and readable.
- Add a meaningful development, discovery, decision, mystery, or consequence.
- Keep names and established facts consistent.
- Do not mention being an AI, prompts, or these instructions.
- Avoid repeating the recent events.
- Output only the story event, no title or markdown.

Current canon summary:
${worldSummary}

Recent events:
${recent || "(No events yet. Establish an intriguing opening event.)"}

Write the next event now.`;
}

async function generateEvent() {
  if (generating) return;
  generating = true;
  broadcast({ type: "status", status: "generating" });

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: makePrompt() }] }],
      generationConfig: { temperature: 0.9, maxOutputTokens: 240 }
    });
    const text = result.response.text().trim();
    if (!text) throw new Error("The model returned an empty response.");

    eventCounter += 1;
    const event = {
      id: eventCounter,
      createdAt: new Date().toISOString(),
      text
    };
    events.push(event);
    events = events.slice(-MAX_EVENTS);

    // Compact summary is intentionally updated from recent canon to keep prompt size bounded.
    worldSummary = `Continuity summary: ${events.slice(-18).map(e => e.text).join(" ")}`.slice(-6500);
    await saveMemory().catch(err => console.warn("Memory save failed:", err.message));

    broadcast({ type: "event", event });
    broadcast({ type: "status", status: "online" });
    console.log(`Generated event #${event.id}`);
  } catch (err) {
    const message = String(err.message || err).slice(0, 300);
    console.error("Generation failed:", message);
    broadcast({ type: "error", message: "Не удалось создать событие. Сервер повторит попытку позже." });
    broadcast({ type: "status", status: "degraded" });
  } finally {
    generating = false;
  }
}

wss.on("connection", socket => {
  safeSend(socket, {
    type: "history",
    events,
    status: generating ? "generating" : "online"
  });
  socket.on("message", raw => {
    // Client messages are only keepalives; clients cannot trigger paid/API calls.
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "ping") safeSend(socket, { type: "pong", at: Date.now() });
    } catch (_) {}
  });
});

async function start() {
  await loadMemory();
  server.listen(PORT, "0.0.0.0", async () => {
    console.log(`AI Universe listening on port ${PORT}`);
    if (events.length === 0) await generateEvent();
    timer = setInterval(generateEvent, INTERVAL_MS);
  });
}

process.on("SIGTERM", () => {
  if (timer) clearInterval(timer);
  wss.close(() => server.close(() => process.exit(0)));
});
process.on("SIGINT", () => {
  if (timer) clearInterval(timer);
  wss.close(() => server.close(() => process.exit(0)));
});

start().catch(err => {
  console.error("Startup failed:", err);
  process.exit(1);
});
