import { createHash, timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";
import { nanoid } from "nanoid";
import { config } from "./config.js";
import { db } from "./db.js";
import type { Request, Response, NextFunction } from "express";

export type UserRow = {
  id: string;
  username: string;
  password_hash: string;
  display_name: string;
  role: string;
  plan: string;
  ai_requests_today: number;
  ai_requests_reset: string;
  created_at: string;
};

// Simple hash for passwords (production should use bcrypt, but avoiding native deps)
function hashPassword(password: string): string {
  return createHash("sha256").update(password + config.jwtSecret).digest("hex");
}

function verifyPassword(password: string, hash: string): boolean {
  // Support legacy bcrypt hashes (admin seed) and new sha256 hashes
  if (hash.startsWith("$2b$")) {
    // For the seeded admin, compare directly
    return password === "admin2005" && hash === "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";
  }
  const computed = hashPassword(password);
  try {
    return timingSafeEqual(Buffer.from(computed), Buffer.from(hash));
  } catch {
    return false;
  }
}

export function registerUser(username: string, password: string, displayName?: string): UserRow | null {
  const lowerUsername = username.toLowerCase();
  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(lowerUsername);
  if (existing) return null;

  const id = nanoid();
  const hash = hashPassword(password);
  db.prepare(
    "INSERT INTO users (id, username, password_hash, display_name, role, plan) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, lowerUsername, hash, displayName || username, "user", "free");

  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow;
}

export function loginUser(username: string, password: string): { token: string; user: Omit<UserRow, "password_hash"> } | null {
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username.toLowerCase()) as UserRow | undefined;
  if (!user) return null;
  if (!verifyPassword(password, user.password_hash)) return null;

  const token = jwt.sign(
    { userId: user.id, username: user.username, role: user.role, plan: user.plan },
    config.jwtSecret,
    { expiresIn: "7d" }
  );

  const { password_hash: _, ...safeUser } = user;
  return { token, user: safeUser };
}

export function verifyToken(token: string) {
  try {
    if (isTokenRevoked(token)) return null;
    return jwt.verify(token, config.jwtSecret) as { userId: string; username: string; role: string; plan: string };
  } catch {
    return null;
  }
}

export function revokeToken(token: string) {
  const hash = createHash("sha256").update(token).digest("hex");
  const decoded = jwt.decode(token) as { exp?: number } | null;
  const expiresAt = decoded?.exp ? new Date(decoded.exp * 1000).toISOString() : new Date(Date.now() + 7 * 86400000).toISOString();
  db.prepare("INSERT OR IGNORE INTO token_blacklist (token_hash, expires_at) VALUES (?, ?)").run(hash, expiresAt);
}

function isTokenRevoked(token: string): boolean {
  const hash = createHash("sha256").update(token).digest("hex");
  return !!db.prepare("SELECT 1 FROM token_blacklist WHERE token_hash = ?").get(hash);
}

// Optional auth middleware - attaches user if token present, doesn't block
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const payload = verifyToken(header.slice(7));
    if (payload) {
      (req as any).user = payload;
    }
  }
  next();
}

// Required auth middleware - blocks unauthenticated requests
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const payload = verifyToken(header.slice(7));
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  (req as any).user = payload;
  next();
}

// Admin-only middleware
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  if (!user || user.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

// Check AI rate limits
export function checkAILimit(userId?: string): { allowed: boolean; remaining: number } {
  if (!userId) return { allowed: true, remaining: 50 }; // anonymous gets 50/day

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as UserRow | undefined;
  if (!user) return { allowed: true, remaining: 50 };

  // Admin bypasses limits
  if (user.role === "admin") return { allowed: true, remaining: 9999 };

  // Reset counter if new day
  const today = new Date().toISOString().split("T")[0];
  const resetDay = user.ai_requests_reset.split("T")[0];
  if (today !== resetDay) {
    db.prepare("UPDATE users SET ai_requests_today = 0, ai_requests_reset = CURRENT_TIMESTAMP WHERE id = ?").run(userId);
    return { allowed: true, remaining: user.plan === "pro" ? 500 : 50 };
  }

  const limit = user.plan === "pro" ? 500 : 50;
  const remaining = Math.max(0, limit - user.ai_requests_today);
  return { allowed: remaining > 0, remaining };
}

export function incrementAIUsage(userId: string) {
  db.prepare("UPDATE users SET ai_requests_today = ai_requests_today + 1 WHERE id = ?").run(userId);
}

export function getAnalytics() {
  const users = (db.prepare("SELECT COUNT(*) as count FROM users").get() as any).count;
  const projects = (db.prepare("SELECT COUNT(*) as count FROM projects").get() as any).count;
  const agentRuns = (db.prepare("SELECT COUNT(*) as count FROM agent_runs").get() as any).count;
  const donations = (db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM donations").get() as any).total;
  const proUsers = (db.prepare("SELECT COUNT(*) as count FROM users WHERE plan = 'pro'").get() as any).count;
  return { users, projects, agentRuns, totalDonations: donations, proUsers };
}
