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
  loadRevokedTokens,
  loginUser,
  optionalAuth,
  registerUser,
  requireAdmin,
  requireAuth,
  revokeToken
} from "./auth.js";
import { config } from "./config.js";
import { initDb, queryOne, queryAll, execute } from "./db.js";
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

// Always allow the production frontend + any env-configured origins
const allowedOrigins = [...new Set([...config.allowedOrigins, "https://codeabyss.vercel.app"])];
app.use(cors({ origin: allowedOrigins, credentials: true }));
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
  res.json({ ok: true, service: "CodeAbyss-node-api", db: "postgresql", uptime: process.uptime() });
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
app.post("/api/auth/register", async (req, res) => {
  const schema = z.object({ username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/), password: z.string().min(6).max(100), displayName: z.string().max(100).optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid registration data. Username must be 3-30 alphanumeric chars, password min 6 chars." }); return; }
  const user = await registerUser(parsed.data.username, parsed.data.password, parsed.data.displayName);
  if (!user) { res.status(409).json({ error: "Username already taken." }); return; }
  // Create per-user workspace
  ensureStarterWorkspace(`ws-${user.id}`);
  const login = await loginUser(parsed.data.username, parsed.data.password);
  res.json({ ok: true, ...login });
});

app.post("/api/auth/login", async (req, res) => {
  const schema = z.object({ username: z.string().min(1).max(30), password: z.string().min(1).max(100) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid credentials." }); return; }
  const result = await loginUser(parsed.data.username, parsed.data.password);
  if (!result) { res.status(401).json({ error: "Invalid username or password." }); return; }
  res.json({ ok: true, ...result });
});

app.get("/api/auth/me", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const full = await queryOne("SELECT id, username, display_name, role, plan, ai_requests_today, created_at FROM users WHERE id = $1", [user.userId]);
  const limit = await checkAILimit(user.userId);
  res.json({ user: full, aiLimit: limit, workspaceId: `ws-${user.userId}` });
});

// ── Admin ─────────────────────────────────────────────────────────
app.get("/api/admin/analytics", requireAuth, requireAdmin, async (_req, res) => { res.json(await getAnalytics()); });

app.get("/api/admin/users", requireAuth, requireAdmin, async (_req, res) => {
  const users = await queryAll("SELECT id, username, display_name, role, plan, ai_requests_today, created_at FROM users ORDER BY created_at DESC");
  res.json({ users });
});

app.delete("/api/admin/users/:id", requireAuth, requireAdmin, async (req, res) => {
  const id = req.params.id as string;
  if (id === "admin-001") { res.status(400).json({ error: "Cannot delete admin account." }); return; }
  await execute("DELETE FROM users WHERE id = $1", [id]);
  res.json({ ok: true });
});

// ── Logout ────────────────────────────────────────────────────────
app.post("/api/auth/logout", requireAuth, async (req, res) => {
  const token = req.headers.authorization?.slice(7);
  if (token) await revokeToken(token);
  res.json({ ok: true });
});

// ── Projects ──────────────────────────────────────────────────────
app.get("/api/projects", requireAuth, async (req, res) => {
  const userId = (req as any).user.userId;
  const projects = await queryAll("SELECT * FROM projects WHERE owner_id = $1 OR visibility = 'public' ORDER BY created_at DESC", [userId]);
  res.json({ projects });
});

app.post("/api/projects", async (req, res) => {
  const schema = z.object({ name: z.string().min(1).max(100), template: z.string().default("blank") });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid project data." }); return; }
  const id = nanoid(10);
  await execute("INSERT INTO projects (id, name, owner_id, visibility, template) VALUES ($1, $2, $3, $4, $5)", [id, parsed.data.name, (req as any).user?.userId || null, "private", parsed.data.template]);
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
app.post("/api/waitlist", async (req, res) => {
  const schema = z.object({ email: z.string().email().max(240) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid email." }); return; }
  await execute("INSERT INTO waitlist (email) VALUES ($1) ON CONFLICT DO NOTHING", [parsed.data.email.toLowerCase()]);
  res.json({ ok: true });
});

// ── Agent ─────────────────────────────────────────────────────────
app.post("/api/agent/run", async (req, res) => {
  const schema = z.object({ provider: z.string().default("ollama"), prompt: z.string().min(2).max(12000), projectId: z.string().default("demo-js"), files: z.record(z.string()).optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid agent request." }); return; }

  const userId = (req as any).user?.userId;
  const limit = await checkAILimit(userId);
  if (!limit.allowed) { res.status(429).json({ error: "AI request limit reached. Upgrade to PRO for more.", remaining: 0 }); return; }

  const runId = nanoid();
  await execute("INSERT INTO agent_runs (id, project_id, user_id, provider, prompt, status) VALUES ($1, $2, $3, $4, $5, $6)", [runId, parsed.data.projectId, userId || null, parsed.data.provider, sanitizeText(parsed.data.prompt), "running"]);

  try {
    const result = await runAgent({ provider: parsed.data.provider, prompt: sanitizeText(parsed.data.prompt), apiKey: req.header("x-CodeAbyss-api-key") || undefined, files: parsed.data.files });

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

    if (userId) await incrementAIUsage(userId);
    await execute("UPDATE agent_runs SET status = $1, summary = $2 WHERE id = $3", ["completed", result.message, runId]);
    await execute("INSERT INTO chat_history (id, user_id, project_id, role, content) VALUES ($1, $2, $3, $4, $5)", [nanoid(), userId || "anon", parsed.data.projectId, "user", parsed.data.prompt]);
    await execute("INSERT INTO chat_history (id, user_id, project_id, role, content) VALUES ($1, $2, $3, $4, $5)", [nanoid(), userId || "anon", parsed.data.projectId, "assistant", result.message]);

    // Return updated workspace tree so frontend can refresh
    const updatedEntries = listWorkspace(parsed.data.projectId);
    res.json({ runId, remaining: limit.remaining - 1, ...result, createdFiles, entries: updatedEntries });
  } catch (error) {
    await execute("UPDATE agent_runs SET status = $1 WHERE id = $2", ["failed", runId]);
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

app.post("/api/share", async (_req, res) => {
  const slug = `build-${nanoid(8)}`;
  await execute("INSERT INTO share_links (id, project_id, slug) VALUES ($1, $2, $3)", [nanoid(), "demo-js", slug]);
  res.json({ ok: true, url: `/share/${slug}`, slug });
});

// ── Donations ─────────────────────────────────────────────────────
app.post("/api/donations", async (req, res) => {
  const schema = z.object({ amount: z.number().min(1).max(100000), message: z.string().max(500).default("") });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid donation." }); return; }
  await execute("INSERT INTO donations (id, user_id, amount, currency, message) VALUES ($1, $2, $3, $4, $5)", [nanoid(), (req as any).user?.userId || null, parsed.data.amount, "INR", sanitizeText(parsed.data.message)]);
  res.json({ ok: true, message: "Thank you for your support!" });
});

app.get("/api/donations/recent", async (_req, res) => {
  const donations = await queryAll("SELECT amount, message, created_at FROM donations ORDER BY created_at DESC LIMIT 10");
  res.json({ donations });
});

// ── Subscriptions ─────────────────────────────────────────────────
// User submits upgrade request after UPI payment
app.post("/api/subscriptions/upgrade", requireAuth, async (req, res) => {
  const userId = (req as any).user.userId;
  const { transactionId } = req.body;
  if (!transactionId || typeof transactionId !== "string" || transactionId.trim().length < 5) {
    return res.status(400).json({ error: "Valid UPI transaction ID is required (min 5 chars)" });
  }

  const sanitizedTxn = sanitizeText(transactionId.trim()).slice(0, 100);
  const user = await queryOne<any>("SELECT username FROM users WHERE id = $1", [userId]);
  const existing = await queryOne("SELECT id FROM upgrade_requests WHERE user_id = $1 AND status = 'pending'", [userId]);
  if (existing) {
    return res.status(409).json({ error: "You already have a pending upgrade request. Please wait 24-48 hours for approval." });
  }

  const id = nanoid();
  await execute(
    "INSERT INTO upgrade_requests (id, user_id, username, transaction_id) VALUES ($1, $2, $3, $4)",
    [id, userId, user?.username || "unknown", sanitizedTxn]
  );

  // Send push notification to admin via ntfy.sh (free)
  try {
    await fetch(`https://ntfy.sh/${config.ntfyTopic}`, {
      method: "POST",
      headers: {
        "Title": "CodeAbyss: New PRO Upgrade Request",
        "Priority": "high",
        "Tags": "money_with_wings",
      },
      body: `User: ${user?.username}\nTxn ID: ${sanitizedTxn}\nAmount: ₹150\n\nApprove in admin panel or reply APPROVE ${id}`,
    });
  } catch (e) {
    console.error("ntfy notification failed:", e);
  }

  res.json({ ok: true, message: "Upgrade request submitted! You'll be upgraded within 24-48 hours after payment verification.", requestId: id });
});

// Admin: list all upgrade requests
app.get("/api/admin/upgrade-requests", requireAuth, requireAdmin, async (_req, res) => {
  const requests = await queryAll("SELECT * FROM upgrade_requests ORDER BY created_at DESC");
  res.json({ requests });
});

// Admin: approve an upgrade request
app.post("/api/admin/upgrade-requests/:id/approve", requireAuth, requireAdmin, async (req, res) => {
  const id = req.params.id as string;
  const request = await queryOne<any>("SELECT * FROM upgrade_requests WHERE id = $1", [id]);
  if (!request) return res.status(404).json({ error: "Request not found" });
  if (request.status !== "pending") return res.status(400).json({ error: `Request already ${request.status}` });

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await execute("UPDATE users SET plan = 'pro' WHERE id = $1", [request.user_id]);
  await execute(
    "INSERT INTO subscriptions (id, user_id, plan, started_at, expires_at, status) VALUES ($1, $2, 'pro', NOW(), $3, 'active') ON CONFLICT (user_id) DO UPDATE SET plan = 'pro', started_at = NOW(), expires_at = $3, status = 'active'",
    [nanoid(), request.user_id, expiresAt]
  );
  await execute("UPDATE upgrade_requests SET status = 'approved', resolved_at = NOW() WHERE id = $1", [id]);

  res.json({ ok: true, message: `User ${request.username} upgraded to PRO until ${expiresAt}` });
});

// Admin: reject an upgrade request
app.post("/api/admin/upgrade-requests/:id/reject", requireAuth, requireAdmin, async (req, res) => {
  const id = req.params.id as string;
  const note = typeof req.body?.note === "string" ? sanitizeText(req.body.note).slice(0, 500) : "";
  const request = await queryOne<any>("SELECT * FROM upgrade_requests WHERE id = $1", [id]);
  if (!request) return res.status(404).json({ error: "Request not found" });
  if (request.status !== "pending") return res.status(400).json({ error: `Request already ${request.status}` });

  await execute("UPDATE upgrade_requests SET status = 'rejected', admin_note = $1, resolved_at = NOW() WHERE id = $2", [note, id]);
  res.json({ ok: true, message: "Request rejected" });
});

app.get("/api/subscriptions/status", requireAuth, async (req, res) => {
  const userId = (req as any).user.userId;
  const sub = await queryOne<any>("SELECT * FROM subscriptions WHERE user_id = $1", [userId]);
  const user = await queryOne<any>("SELECT plan FROM users WHERE id = $1", [userId]);
  const pendingRequest = await queryOne("SELECT id, created_at FROM upgrade_requests WHERE user_id = $1 AND status = 'pending'", [userId]);
  res.json({ plan: user?.plan || "free", subscription: sub || null, pendingRequest: pendingRequest || null });
});

// ── Settings ──────────────────────────────────────────────────────
app.get("/api/settings", requireAuth, async (req, res) => {
  const userId = (req as any).user.userId;
  let settings = await queryOne("SELECT * FROM settings WHERE user_id = $1", [userId]);
  if (!settings) { await execute("INSERT INTO settings (user_id) VALUES ($1)", [userId]); settings = await queryOne("SELECT * FROM settings WHERE user_id = $1", [userId]); }
  res.json({ settings });
});

app.put("/api/settings", requireAuth, async (req, res) => {
  const userId = (req as any).user.userId;
  const schema = z.object({ theme: z.string().optional(), editor_font_size: z.number().min(10).max(24).optional(), ai_provider: z.string().optional(), ai_model: z.string().optional(), terminal_font_size: z.number().min(10).max(20).optional(), auto_save: z.number().min(0).max(1).optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid settings." }); return; }
  const existing = await queryOne("SELECT user_id FROM settings WHERE user_id = $1", [userId]);
  if (!existing) { await execute("INSERT INTO settings (user_id) VALUES ($1)", [userId]); }
  const allowedColumns = new Set(["theme", "editor_font_size", "ai_provider", "ai_model", "terminal_font_size", "auto_save"]);
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined && allowedColumns.has(key)) {
      await execute(`UPDATE settings SET ${key} = $1 WHERE user_id = $2`, [value, userId]);
    }
  }
  res.json({ ok: true, settings: await queryOne("SELECT * FROM settings WHERE user_id = $1", [userId]) });
});

// ── Chat / Dashboard / Templates ──────────────────────────────────
app.get("/api/chat/history", requireAuth, async (req, res) => {
  const userId = (req as any).user.userId;
  const projectId = String(req.query.projectId || `ws-${userId}`);
  const history = await queryAll("SELECT role, content, created_at FROM chat_history WHERE project_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 50", [projectId, userId]);
  res.json({ history: history.reverse() });
});

app.get("/api/dashboard", requireAuth, async (req, res) => {
  const userId = (req as any).user.userId;
  const projects = await queryAll("SELECT * FROM projects WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 20", [userId]);
  const recentChats = await queryAll("SELECT role, content, created_at FROM chat_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10", [userId]);
  const aiLimit = await checkAILimit(userId);
  const agentRuns = await queryOne<any>("SELECT COUNT(*) as count FROM agent_runs WHERE user_id = $1", [userId]);
  res.json({ projects, recentChats: recentChats.reverse(), aiUsage: { remaining: aiLimit.remaining }, agentRuns: agentRuns?.count || 0 });
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
  const projectId = (req.params.projectId as string).replace(/[^a-zA-Z0-9_-]/g, "");
  const filePath = (req.params as any)[0] || "index.html";
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

// Initialize database then start server
(async () => {
  try {
    await initDb();
    await loadRevokedTokens();
    console.log("[db] PostgreSQL connected and initialized");
  } catch (err) {
    console.error("[db] Failed to initialize database:", err);
    process.exit(1);
  }

  server.listen(config.port, () => {
    console.log(`CodeAbyss Node API listening on http://localhost:${config.port}`);
  });
})();

// Self-ping to prevent Render free tier from sleeping (every 14 minutes)
const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
if (RENDER_URL) {
  setInterval(async () => {
    try {
      const res = await fetch(`${RENDER_URL}/api/health`);
      console.log(`[keep-alive] pinged ${RENDER_URL} → ${res.status}`);
    } catch (e) {
      console.log(`[keep-alive] ping failed: ${(e as Error).message}`);
    }
  }, 14 * 60 * 1000); // 14 minutes
  console.log("[keep-alive] self-ping enabled (every 14 min)");
}

// Graceful shutdown
function shutdown() {
  console.log("Shutting down gracefully...");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
