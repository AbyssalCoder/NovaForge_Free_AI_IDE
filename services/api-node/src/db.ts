import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";

fs.mkdirSync(path.dirname(config.sqlitePath), { recursive: true });

export const db = new DatabaseSync(config.sqlitePath);
db.exec("PRAGMA journal_mode = WAL;");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'user',
    plan TEXT NOT NULL DEFAULT 'free',
    ai_requests_today INTEGER NOT NULL DEFAULT 0,
    ai_requests_reset TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id TEXT,
    visibility TEXT NOT NULL DEFAULT 'private',
    template TEXT NOT NULL DEFAULT 'blank',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS waitlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS agent_runs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    user_id TEXT,
    provider TEXT NOT NULL,
    prompt TEXT NOT NULL,
    status TEXT NOT NULL,
    summary TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS share_links (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS donations (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    amount INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'INR',
    message TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    plan TEXT NOT NULL DEFAULT 'free',
    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT,
    status TEXT NOT NULL DEFAULT 'active'
  );

  CREATE TABLE IF NOT EXISTS settings (
    user_id TEXT PRIMARY KEY,
    theme TEXT NOT NULL DEFAULT 'cyberpunk',
    editor_font_size INTEGER NOT NULL DEFAULT 14,
    ai_provider TEXT NOT NULL DEFAULT 'auto',
    ai_model TEXT NOT NULL DEFAULT '',
    terminal_font_size INTEGER NOT NULL DEFAULT 13,
    auto_save INTEGER NOT NULL DEFAULT 1,
    keyboard_shortcuts TEXT NOT NULL DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS chat_history (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    project_id TEXT,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS token_blacklist (
    token_hash TEXT PRIMARY KEY,
    expires_at TEXT NOT NULL
  );
`);

// Indexes for frequently queried columns
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
  CREATE INDEX IF NOT EXISTS idx_chat_history_project ON chat_history(project_id);
  CREATE INDEX IF NOT EXISTS idx_chat_history_user ON chat_history(user_id);
  CREATE INDEX IF NOT EXISTS idx_agent_runs_user ON agent_runs(user_id);
  CREATE INDEX IF NOT EXISTS idx_agent_runs_project ON agent_runs(project_id);
  CREATE INDEX IF NOT EXISTS idx_share_links_slug ON share_links(slug);
  CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
  CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
`);

// Seed admin user (password: admin2005, bcrypt hash)
const adminHash = "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";
const existingAdmin = db.prepare("SELECT id FROM users WHERE username = ?").get("admin");
if (!existingAdmin) {
  db.prepare("INSERT INTO users (id, username, password_hash, display_name, role, plan) VALUES (?, ?, ?, ?, ?, ?)").run(
    "admin-001", "admin", adminHash, "Admin", "admin", "pro"
  );
}

const seedProject = db.prepare("SELECT id FROM projects WHERE id = ?").get("demo-js");
if (!seedProject) {
  db.prepare("INSERT INTO projects (id, name, owner_id, visibility, template) VALUES (?, ?, ?, ?, ?)").run(
    "demo-js", "NovaForge Demo App", "admin-001", "public", "nextjs"
  );
}
