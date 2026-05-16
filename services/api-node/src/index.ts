import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import http from "node:http";
import path from "node:path";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getProviderSummary, runAgent } from "./ai.js";
import {
  checkAILimit,
  getAnalytics,
  incrementAIUsage,
  loginUser,
  optionalAuth,
  registerUser,
  requireAdmin,
  requireAuth,
  revokeToken
} from "./auth.js";
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
app.use(helmet({ contentSecurityPolicy: false, frameguard: false }));
app.use(cors({ origin: config.allowedOrigins, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(optionalAuth);

const generalLimiter = rateLimit({ windowMs: 60_000, limit: 200 });
const authLimiter = rateLimit({ windowMs: 60_000, limit: 20 });
const agentLimiter = rateLimit({ windowMs: 60_000, limit: 30 });
app.use("/api/auth", authLimiter);
app.use("/api/agent", agentLimiter);
app.use(generalLimiter);

// ── Root ──────────────────────────────────────────────────────────
app.get("/", (_req, res) => {
  res.redirect("/preview/demo-js/index.html");
});

// ── Health ────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "novaforge-node-api", sqlite: true, uptime: process.uptime() });
});

app.get("/api/health", async (_req, res) => {
  let pythonOk = false;
  try {
    const py = await fetch(`${config.pythonServiceUrl}/health`, { signal: AbortSignal.timeout(3000) });
    pythonOk = py.ok;
  } catch { /* python offline */ }
  res.json({ ok: true, node: true, python: pythonOk, uptime: Math.floor(process.uptime()), timestamp: new Date().toISOString() });
});

ensureStarterWorkspace("demo-js");

// ── Auth ──────────────────────────────────────────────────────────
app.post("/api/auth/register", (req, res) => {
  const schema = z.object({ username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/), password: z.string().min(6).max(100), displayName: z.string().max(100).optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid registration data. Username must be 3-30 alphanumeric chars, password min 6 chars." }); return; }
  const user = registerUser(parsed.data.username, parsed.data.password, parsed.data.displayName);
  if (!user) { res.status(409).json({ error: "Username already taken." }); return; }
  // Create per-user workspace
  ensureStarterWorkspace(`ws-${user.id}`);
  const login = loginUser(parsed.data.username, parsed.data.password);
  res.json({ ok: true, ...login });
});

app.post("/api/auth/login", (req, res) => {
  const schema = z.object({ username: z.string().min(1).max(30), password: z.string().min(1).max(100) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid credentials." }); return; }
  const result = loginUser(parsed.data.username, parsed.data.password);
  if (!result) { res.status(401).json({ error: "Invalid username or password." }); return; }
  res.json({ ok: true, ...result });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  const user = (req as any).user;
  const full = db.prepare("SELECT id, username, display_name, role, plan, ai_requests_today, created_at FROM users WHERE id = ?").get(user.userId);
  const limit = checkAILimit(user.userId);
  res.json({ user: full, aiLimit: limit, workspaceId: `ws-${user.userId}` });
});

// ── Admin ─────────────────────────────────────────────────────────
app.get("/api/admin/analytics", requireAuth, requireAdmin, (_req, res) => { res.json(getAnalytics()); });

app.get("/api/admin/users", requireAuth, requireAdmin, (_req, res) => {
  const users = db.prepare("SELECT id, username, display_name, role, plan, ai_requests_today, created_at FROM users ORDER BY created_at DESC").all();
  res.json({ users });
});

app.delete("/api/admin/users/:id", requireAuth, requireAdmin, (req, res) => {
  if (req.params.id === "admin-001") { res.status(400).json({ error: "Cannot delete admin account." }); return; }
  db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// ── Logout ────────────────────────────────────────────────────────
app.post("/api/auth/logout", requireAuth, (req, res) => {
  const token = req.headers.authorization?.slice(7);
  if (token) revokeToken(token);
  res.json({ ok: true });
});

// ── Projects ──────────────────────────────────────────────────────
app.get("/api/projects", requireAuth, (req, res) => {
  const userId = (req as any).user.userId;
  const projects = db.prepare("SELECT * FROM projects WHERE owner_id = ? OR visibility = 'public' ORDER BY created_at DESC").all(userId);
  res.json({ projects });
});

app.post("/api/projects", (req, res) => {
  const schema = z.object({ name: z.string().min(1).max(100), template: z.string().default("blank") });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid project data." }); return; }
  const id = nanoid(10);
  db.prepare("INSERT INTO projects (id, name, owner_id, visibility, template) VALUES (?, ?, ?, ?, ?)").run(id, parsed.data.name, (req as any).user?.userId || null, "private", parsed.data.template);
  ensureStarterWorkspace(id);
  res.json({ ok: true, projectId: id });
});

// ── AI Providers ──────────────────────────────────────────────────
app.get("/api/ai/providers", (_req, res) => { res.json(getProviderSummary()); });

// ── Workspace ─────────────────────────────────────────────────────
app.get("/api/workspace/tree", (req, res) => {
  try { res.json({ entries: listWorkspace(String(req.query.workspaceId || "demo-js")) }); }
  catch { res.json({ entries: [] }); }
});

app.get("/api/workspace/file", (req, res) => {
  const workspaceId = String(req.query.workspaceId || "demo-js");
  const filePath = String(req.query.path || "");
  try { res.json({ path: filePath, content: readWorkspaceFile(workspaceId, filePath) }); }
  catch { res.status(404).json({ error: "File not found." }); }
});

app.put("/api/workspace/file", (req, res) => {
  const schema = z.object({ workspaceId: z.string().default("demo-js"), path: z.string().min(1).max(300), content: z.string().max(1_000_000).default("") });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid file request." }); return; }
  writeWorkspaceFile(parsed.data.workspaceId, parsed.data.path, parsed.data.content);
  res.json({ ok: true, entries: listWorkspace(parsed.data.workspaceId) });
});

app.post("/api/workspace/folder", (req, res) => {
  const schema = z.object({ workspaceId: z.string().default("demo-js"), path: z.string().min(1).max(300) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid folder request." }); return; }
  createWorkspaceFolder(parsed.data.workspaceId, parsed.data.path);
  res.json({ ok: true, entries: listWorkspace(parsed.data.workspaceId) });
});

app.delete("/api/workspace/entry", (req, res) => {
  const schema = z.object({ workspaceId: z.string().default("demo-js"), path: z.string().min(1).max(300) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid delete request." }); return; }
  deleteWorkspaceEntry(parsed.data.workspaceId, parsed.data.path);
  res.json({ ok: true, entries: listWorkspace(parsed.data.workspaceId) });
});

app.post("/api/workspace/rename", (req, res) => {
  const schema = z.object({ workspaceId: z.string().default("demo-js"), oldPath: z.string().min(1).max(300), newPath: z.string().min(1).max(300) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid rename request." }); return; }
  try {
    const content = readWorkspaceFile(parsed.data.workspaceId, parsed.data.oldPath);
    writeWorkspaceFile(parsed.data.workspaceId, parsed.data.newPath, content);
    deleteWorkspaceEntry(parsed.data.workspaceId, parsed.data.oldPath);
    res.json({ ok: true, entries: listWorkspace(parsed.data.workspaceId) });
  } catch { res.status(400).json({ error: "Rename failed." }); }
});

app.get("/api/workspace/export", requireAuth, (req, res) => {
  const workspaceId = String(req.query.workspaceId || `ws-${(req as any).user.userId}`);
  const entries = listWorkspace(workspaceId);
  const files: Record<string, string> = {};
  let totalSize = 0;
  const MAX_EXPORT = 10 * 1024 * 1024;
  for (const entry of entries.filter((e) => e.type === "file")) {
    try {
      const content = readWorkspaceFile(workspaceId, entry.path);
      totalSize += content.length;
      if (totalSize > MAX_EXPORT) { res.status(413).json({ error: "Workspace too large to export (10MB limit)." }); return; }
      files[entry.path] = content;
    } catch {}
  }
  res.json({ ok: true, files });
});

// ── Waitlist ──────────────────────────────────────────────────────
app.post("/api/waitlist", (req, res) => {
  const schema = z.object({ email: z.string().email().max(240) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid email." }); return; }
  db.prepare("INSERT OR IGNORE INTO waitlist (email) VALUES (?)").run(parsed.data.email.toLowerCase());
  res.json({ ok: true });
});

// ── Agent ─────────────────────────────────────────────────────────
app.post("/api/agent/run", async (req, res) => {
  const schema = z.object({ provider: z.string().default("ollama"), prompt: z.string().min(2).max(12000), projectId: z.string().default("demo-js"), files: z.record(z.string()).optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid agent request." }); return; }

  const userId = (req as any).user?.userId;
  const limit = checkAILimit(userId);
  if (!limit.allowed) { res.status(429).json({ error: "AI request limit reached. Upgrade to PRO for more.", remaining: 0 }); return; }

  const runId = nanoid();
  db.prepare("INSERT INTO agent_runs (id, project_id, user_id, provider, prompt, status) VALUES (?, ?, ?, ?, ?, ?)").run(runId, parsed.data.projectId, userId || null, parsed.data.provider, sanitizeText(parsed.data.prompt), "running");

  try {
    const result = await runAgent({ provider: parsed.data.provider, prompt: sanitizeText(parsed.data.prompt), apiKey: req.header("x-novaforge-api-key") || undefined, files: parsed.data.files });

    // Actually write generated files to the workspace
    const createdFiles: string[] = [];
    if (result.files && Object.keys(result.files).length > 0) {
      for (const [filePath, content] of Object.entries(result.files)) {
        try {
          writeWorkspaceFile(parsed.data.projectId, filePath, content);
          createdFiles.push(filePath);
        } catch (e) {
          console.error(`Failed to write ${filePath}:`, e);
        }
      }
    }

    if (userId) incrementAIUsage(userId);
    db.prepare("UPDATE agent_runs SET status = ?, summary = ? WHERE id = ?").run("completed", result.message, runId);
    db.prepare("INSERT INTO chat_history (id, user_id, project_id, role, content) VALUES (?, ?, ?, ?, ?)").run(nanoid(), userId || "anon", parsed.data.projectId, "user", parsed.data.prompt);
    db.prepare("INSERT INTO chat_history (id, user_id, project_id, role, content) VALUES (?, ?, ?, ?, ?)").run(nanoid(), userId || "anon", parsed.data.projectId, "assistant", result.message);

    // Return updated workspace tree so frontend can refresh
    const updatedEntries = listWorkspace(parsed.data.projectId);
    res.json({ runId, remaining: limit.remaining - 1, ...result, createdFiles, entries: updatedEntries });
  } catch (error) {
    db.prepare("UPDATE agent_runs SET status = ? WHERE id = ?").run("failed", runId);
    console.error("Agent execution failed:", error);
    res.status(500).json({ error: "Agent execution failed. Please try again." });
  }
});

// ── Sandbox ───────────────────────────────────────────────────────
app.post("/api/sandbox/run", async (req, res) => {
  const schema = z.object({ workspaceId: z.string().default("demo-js"), language: z.string().default("node"), command: z.string().min(1).max(500) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid sandbox request." }); return; }
  try { const result = await runInDocker(parsed.data.workspaceId, parsed.data.language, parsed.data.command); res.status(result.ok ? 200 : 503).json(result); }
  catch { res.status(503).json({ ok: false, output: "Sandbox execution failed. Is Docker running?" }); }
});

app.get("/api/sandbox/status", async (_req, res) => {
  try { res.json({ docker: true, images: await imageStatus() }); }
  catch { res.json({ docker: false, images: [] }); }
});

// ── Smoke / Share ─────────────────────────────────────────────────
app.post("/api/smoke", async (_req, res) => {
  try { const py = await fetch(`${config.pythonServiceUrl}/health`, { signal: AbortSignal.timeout(3000) }).then((r) => r.json()); res.json({ ok: true, message: "Node and Python services responded.", python: py }); }
  catch { res.json({ ok: false, message: "Node API is up; Python service not reachable." }); }
});

app.post("/api/share", (_req, res) => {
  const slug = `build-${nanoid(8)}`;
  db.prepare("INSERT INTO share_links (id, project_id, slug) VALUES (?, ?, ?)").run(nanoid(), "demo-js", slug);
  res.json({ ok: true, url: `/share/${slug}`, slug });
});

// ── Donations ─────────────────────────────────────────────────────
app.post("/api/donations", (req, res) => {
  const schema = z.object({ amount: z.number().min(1).max(100000), message: z.string().max(500).default("") });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid donation." }); return; }
  db.prepare("INSERT INTO donations (id, user_id, amount, currency, message) VALUES (?, ?, ?, ?, ?)").run(nanoid(), (req as any).user?.userId || null, parsed.data.amount, "INR", sanitizeText(parsed.data.message));
  res.json({ ok: true, message: "Thank you for your support!" });
});

app.get("/api/donations/recent", (_req, res) => {
  const donations = db.prepare("SELECT amount, message, created_at FROM donations ORDER BY created_at DESC LIMIT 10").all();
  res.json({ donations });
});

// ── Subscriptions ─────────────────────────────────────────────────
app.post("/api/subscriptions/upgrade", requireAuth, (_req, res) => {
  res.status(501).json({ error: "Payment integration pending. Contact support for PRO access." });
});

app.get("/api/subscriptions/status", requireAuth, (req, res) => {
  const userId = (req as any).user.userId;
  const sub = db.prepare("SELECT * FROM subscriptions WHERE user_id = ?").get(userId);
  const user = db.prepare("SELECT plan FROM users WHERE id = ?").get(userId) as any;
  res.json({ plan: user?.plan || "free", subscription: sub || null });
});

// ── Settings ──────────────────────────────────────────────────────
app.get("/api/settings", requireAuth, (req, res) => {
  const userId = (req as any).user.userId;
  let settings = db.prepare("SELECT * FROM settings WHERE user_id = ?").get(userId);
  if (!settings) { db.prepare("INSERT INTO settings (user_id) VALUES (?)").run(userId); settings = db.prepare("SELECT * FROM settings WHERE user_id = ?").get(userId); }
  res.json({ settings });
});

app.put("/api/settings", requireAuth, (req, res) => {
  const userId = (req as any).user.userId;
  const schema = z.object({ theme: z.string().optional(), editor_font_size: z.number().min(10).max(24).optional(), ai_provider: z.string().optional(), ai_model: z.string().optional(), terminal_font_size: z.number().min(10).max(20).optional(), auto_save: z.number().min(0).max(1).optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid settings." }); return; }
  const existing = db.prepare("SELECT user_id FROM settings WHERE user_id = ?").get(userId);
  if (!existing) { db.prepare("INSERT INTO settings (user_id) VALUES (?)").run(userId); }
  const allowedColumns = new Set(["theme", "editor_font_size", "ai_provider", "ai_model", "terminal_font_size", "auto_save"]);
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined && allowedColumns.has(key)) {
      db.prepare(`UPDATE settings SET ${key} = ? WHERE user_id = ?`).run(value, userId);
    }
  }
  res.json({ ok: true, settings: db.prepare("SELECT * FROM settings WHERE user_id = ?").get(userId) });
});

// ── Chat / Dashboard / Templates ──────────────────────────────────
app.get("/api/chat/history", requireAuth, (req, res) => {
  const userId = (req as any).user.userId;
  const projectId = String(req.query.projectId || `ws-${userId}`);
  const history = db.prepare("SELECT role, content, created_at FROM chat_history WHERE project_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 50").all(projectId, userId);
  res.json({ history: (history as any[]).reverse() });
});

app.get("/api/dashboard", requireAuth, (req, res) => {
  const userId = (req as any).user.userId;
  const projects = db.prepare("SELECT * FROM projects WHERE owner_id = ? ORDER BY created_at DESC LIMIT 20").all(userId);
  const recentChats = db.prepare("SELECT role, content, created_at FROM chat_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 10").all(userId);
  const aiLimit = checkAILimit(userId);
  const agentRuns = db.prepare("SELECT COUNT(*) as count FROM agent_runs WHERE user_id = ?").get(userId) as any;
  res.json({ projects, recentChats: (recentChats as any[]).reverse(), aiUsage: { remaining: aiLimit.remaining }, agentRuns: agentRuns?.count || 0 });
});

app.get("/api/templates", (_req, res) => {
  res.json({ templates: [
    { id: "react", name: "React App", description: "React with Vite", icon: "⚛️", language: "TypeScript" },
    { id: "nextjs", name: "Next.js App", description: "Next.js 15 with App Router", icon: "▲", language: "TypeScript" },
    { id: "python-ai", name: "Python AI App", description: "Python with ML starter", icon: "🐍", language: "Python" },
    { id: "express", name: "Express Backend", description: "Express.js REST API", icon: "🚀", language: "JavaScript" },
    { id: "rust-cli", name: "Rust CLI", description: "Rust command-line tool", icon: "🦀", language: "Rust" },
    { id: "java", name: "Java Starter", description: "Java console application", icon: "☕", language: "Java" },
    { id: "cpp", name: "C++ Starter", description: "C++ with CMake", icon: "⚡", language: "C++" },
    { id: "html", name: "HTML/CSS Website", description: "Static website starter", icon: "🌐", language: "HTML" }
  ]});
});

// ── Preview (serve workspace files with correct MIME) ─────────────
const mimeTypes: Record<string, string> = {
  ".html": "text/html", ".css": "text/css", ".js": "application/javascript",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2",
  ".ttf": "font/ttf", ".txt": "text/plain", ".xml": "application/xml",
};

app.get("/preview/:projectId/*", (req, res) => {
  const projectId = req.params.projectId.replace(/[^a-zA-Z0-9_-]/g, "");
  const filePath = req.params[0] || "index.html";
  try {
    const content = readWorkspaceFile(projectId, filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.setHeader("Content-Type", mimeTypes[ext] || "text/plain");
    res.setHeader("Cache-Control", "no-cache");
    res.removeHeader("X-Frame-Options");
    res.removeHeader("Cross-Origin-Resource-Policy");
    res.removeHeader("Cross-Origin-Opener-Policy");
    res.setHeader("Access-Control-Allow-Origin", config.allowedOrigins[0] || "http://localhost:3000");
    res.setHeader("Content-Security-Policy", `frame-ancestors 'self' ${config.allowedOrigins.join(" ")}`);
    res.send(content);
  } catch {
    res.status(404).send("File not found");
  }
});

// ── Error handler ─────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled error:", err.message);
  res.status(500).json({ error: "Internal server error." });
});

const server = http.createServer(app);
attachTerminal(server);

server.listen(config.port, () => {
  console.log(`NovaForge Node API listening on http://localhost:${config.port}`);
});

// Graceful shutdown
function shutdown() {
  console.log("Shutting down gracefully...");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
