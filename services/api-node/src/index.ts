import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import http from "node:http";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getProviderSummary, runAgent } from "./ai.js";
import { config } from "./config.js";
import { db } from "./db.js";
import { imageStatus, runInDocker } from "./sandbox.js";
import { sanitizeText } from "./security.js";
import { attachTerminal } from "./terminal.js";
import {
  createWorkspaceFolder,
  deleteWorkspaceEntry,
  ensureStarterWorkspace,
  listWorkspace,
  readWorkspaceFile,
  writeWorkspaceFile
} from "./workspace.js";

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: config.allowedOrigins, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(rateLimit({ windowMs: 60_000, limit: 120 }));

app.get("/health", (_request, response) => {
  response.json({ ok: true, service: "novaforge-node-api", sqlite: true });
});

ensureStarterWorkspace("demo-js");

app.get("/api/projects", (_request, response) => {
  const projects = db.prepare("SELECT * FROM projects ORDER BY created_at DESC").all();
  response.json({ projects });
});

app.get("/api/ai/providers", (_request, response) => {
  response.json(getProviderSummary());
});

app.get("/api/workspace/tree", (request, response) => {
  const workspaceId = String(request.query.workspaceId || "demo-js");
  response.json({ entries: listWorkspace(workspaceId) });
});

app.get("/api/workspace/file", (request, response) => {
  const workspaceId = String(request.query.workspaceId || "demo-js");
  const filePath = String(request.query.path || "");
  response.json({ path: filePath, content: readWorkspaceFile(workspaceId, filePath) });
});

app.put("/api/workspace/file", (request, response) => {
  const schema = z.object({
    workspaceId: z.string().default("demo-js"),
    path: z.string().min(1).max(300),
    content: z.string().max(1_000_000).default("")
  });
  const parsed = schema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid file request." });
    return;
  }
  writeWorkspaceFile(parsed.data.workspaceId, parsed.data.path, parsed.data.content);
  response.json({ ok: true, entries: listWorkspace(parsed.data.workspaceId) });
});

app.post("/api/workspace/folder", (request, response) => {
  const schema = z.object({
    workspaceId: z.string().default("demo-js"),
    path: z.string().min(1).max(300)
  });
  const parsed = schema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid folder request." });
    return;
  }
  createWorkspaceFolder(parsed.data.workspaceId, parsed.data.path);
  response.json({ ok: true, entries: listWorkspace(parsed.data.workspaceId) });
});

app.delete("/api/workspace/entry", (request, response) => {
  const schema = z.object({
    workspaceId: z.string().default("demo-js"),
    path: z.string().min(1).max(300)
  });
  const parsed = schema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid delete request." });
    return;
  }
  deleteWorkspaceEntry(parsed.data.workspaceId, parsed.data.path);
  response.json({ ok: true, entries: listWorkspace(parsed.data.workspaceId) });
});

app.post("/api/waitlist", (request, response) => {
  const schema = z.object({ email: z.string().email().max(240) });
  const parsed = schema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid email." });
    return;
  }
  db.prepare("INSERT OR IGNORE INTO waitlist (email) VALUES (?)").run(parsed.data.email.toLowerCase());
  response.json({ ok: true });
});

app.post("/api/agent/run", async (request, response) => {
  const schema = z.object({
    provider: z.string().default("ollama"),
    prompt: z.string().min(2).max(12000),
    projectId: z.string().default("demo-js"),
    files: z.record(z.string()).optional()
  });
  const parsed = schema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid agent request." });
    return;
  }

  const runId = nanoid();
  db.prepare("INSERT INTO agent_runs (id, project_id, provider, prompt, status) VALUES (?, ?, ?, ?, ?)").run(
    runId,
    parsed.data.projectId,
    parsed.data.provider,
    sanitizeText(parsed.data.prompt),
    "running"
  );

  const result = await runAgent({
    provider: parsed.data.provider,
    prompt: sanitizeText(parsed.data.prompt),
    apiKey: request.header("x-novaforge-api-key") || undefined,
    files: parsed.data.files
  });

  db.prepare("UPDATE agent_runs SET status = ?, summary = ? WHERE id = ?").run("completed", result.message, runId);
  response.json({ runId, ...result });
});

app.post("/api/sandbox/run", async (request, response) => {
  const schema = z.object({
    workspaceId: z.string().default("demo-js"),
    language: z.string().default("node"),
    command: z.string().min(1).max(500)
  });
  const parsed = schema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid sandbox request." });
    return;
  }
  const result = await runInDocker(parsed.data.workspaceId, parsed.data.language, parsed.data.command);
  response.status(result.ok ? 200 : 503).json(result);
});

app.get("/api/sandbox/status", async (_request, response) => {
  response.json({ docker: true, images: await imageStatus() });
});

app.post("/api/smoke", async (_request, response) => {
  try {
    const py = await fetch(`${config.pythonServiceUrl}/health`).then((result) => result.json());
    response.json({ ok: true, message: "Node and Python services responded.", python: py });
  } catch {
    response.json({ ok: false, message: "Node API is up; Python FastAPI service is not reachable." });
  }
});

app.post("/api/share", (_request, response) => {
  const slug = `build-${nanoid(8)}`;
  db.prepare("INSERT INTO share_links (id, project_id, slug) VALUES (?, ?, ?)").run(nanoid(), "demo-js", slug);
  response.json({ url: `http://localhost:3000/share/${slug}` });
});

const server = http.createServer(app);
attachTerminal(server);

server.listen(config.port, () => {
  console.log(`NovaForge Node API listening on http://localhost:${config.port}`);
});
