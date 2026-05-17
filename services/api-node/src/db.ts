import pg from "pg";
import { config } from "./config.js";

const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseUrl.includes("supabase") ? { rejectUnauthorized: false } : undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

// ── Query helpers ─────────────────────────────────────────────────
export async function queryAll<T = any>(text: string, params?: any[]): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows;
}

export async function queryOne<T = any>(text: string, params?: any[]): Promise<T | undefined> {
  const result = await pool.query(text, params);
  return result.rows[0];
}

export async function execute(text: string, params?: any[]): Promise<void> {
  await pool.query(text, params);
}

// ── Schema initialization ─────────────────────────────────────────
export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'user',
      plan TEXT NOT NULL DEFAULT 'free',
      ai_requests_today INTEGER NOT NULL DEFAULT 0,
      ai_requests_reset TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_id TEXT,
      visibility TEXT NOT NULL DEFAULT 'private',
      template TEXT NOT NULL DEFAULT 'blank',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS waitlist (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      user_id TEXT,
      provider TEXT NOT NULL,
      prompt TEXT NOT NULL,
      status TEXT NOT NULL,
      summary TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS share_links (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS donations (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      amount INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      message TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      plan TEXT NOT NULL DEFAULT 'free',
      started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMPTZ,
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
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS token_blacklist (
      token_hash TEXT PRIMARY KEY,
      expires_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS upgrade_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      transaction_id TEXT NOT NULL,
      amount INTEGER NOT NULL DEFAULT 150,
      status TEXT NOT NULL DEFAULT 'pending',
      admin_note TEXT DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resolved_at TIMESTAMPTZ
    );
  `);

  // Indexes
  const indexes = [
    "CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)",
    "CREATE INDEX IF NOT EXISTS idx_chat_history_project ON chat_history(project_id)",
    "CREATE INDEX IF NOT EXISTS idx_chat_history_user ON chat_history(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_agent_runs_user ON agent_runs(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_agent_runs_project ON agent_runs(project_id)",
    "CREATE INDEX IF NOT EXISTS idx_share_links_slug ON share_links(slug)",
    "CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id)",
    "CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_upgrade_requests_user ON upgrade_requests(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_upgrade_requests_status ON upgrade_requests(status)",
  ];
  for (const idx of indexes) await pool.query(idx);

  // Seed admin user (password: admin2005, bcrypt hash)
  const adminHash = "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";
  const existingAdmin = await queryOne("SELECT id FROM users WHERE username = $1", ["admin"]);
  if (!existingAdmin) {
    await execute(
      "INSERT INTO users (id, username, password_hash, display_name, role, plan) VALUES ($1, $2, $3, $4, $5, $6)",
      ["admin-001", "admin", adminHash, "Admin", "admin", "pro"]
    );
  }

  const seedProject = await queryOne("SELECT id FROM projects WHERE id = $1", ["demo-js"]);
  if (!seedProject) {
    await execute(
      "INSERT INTO projects (id, name, owner_id, visibility, template) VALUES ($1, $2, $3, $4, $5)",
      ["demo-js", "CodeAbyss Demo App", "admin-001", "public", "nextjs"]
    );
  }

  console.log("[db] PostgreSQL schema initialized (Supabase)");
}
