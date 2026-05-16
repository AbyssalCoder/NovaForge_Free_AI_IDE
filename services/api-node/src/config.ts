import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

const jwtSecret = process.env.JWT_SECRET || "CodeAbyss-dev-only-change-me";
if (jwtSecret === "CodeAbyss-dev-only-change-me" && process.env.NODE_ENV === "production") {
  console.error("FATAL: JWT_SECRET must be set in production. Exiting.");
  process.exit(1);
}

export const config = {
  port: Number(process.env.NODE_API_PORT || 8787),
  jwtSecret,
  sqlitePath: process.env.SQLITE_PATH || path.resolve(process.cwd(), "data/CodeAbyss.db"),
  workspaceRoot: process.env.WORKSPACE_ROOT || path.resolve(process.cwd(), "workspaces"),
  allowedOrigins: (process.env.ALLOWED_ORIGINS || "http://localhost:3000,http://127.0.0.1:3000").split(","),
  pythonServiceUrl: process.env.PYTHON_SERVICE_URL || "http://127.0.0.1:8788",
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434",
  ollamaModel: process.env.OLLAMA_MODEL || "qwen2.5-coder:7b",
  geminiApiKeys: (process.env.GEMINI_API_KEYS || "").split(",").map((key) => key.trim()).filter(Boolean),
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  openRouterApiKeys: (process.env.OPENROUTER_API_KEYS || process.env.OPENROUTER_API_KEY || "").split(",").map(k => k.trim()).filter(Boolean),
  openRouterModel: process.env.OPENROUTER_MODEL || "deepseek/deepseek-chat:free",
  maxWorkspaceSizeMB: Number(process.env.MAX_WORKSPACE_SIZE_MB || 50),
  maxWorkspaceFiles: Number(process.env.MAX_WORKSPACE_FILES || 200),
  ntfyTopic: process.env.NTFY_TOPIC || "CodeAbyss-admin-alerts",
  adminPhoneNote: process.env.ADMIN_PHONE || "+91 7980458591",
};
