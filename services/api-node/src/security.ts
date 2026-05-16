import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

const allowedPrefixes = [
  "node",
  "npm",
  "npx",
  "python",
  "py",
  "pip",
  "git",
  "ls",
  "dir",
  "cat",
  "type",
  "pwd",
  "cargo",
  "rustc",
  "gcc",
  "g++",
  "javac",
  "java",
  "echo",
  "./main"
];

const deniedPatterns = [
  /\brm\s+-rf\b/i,
  /\bdel\s+\/[fsq]/i,
  /\bformat\b/i,
  /\bshutdown\b/i,
  /\breg\s+/i,
  /\bpowershell\b/i,
  /\bcmd\s*\/c\b/i,
  /[;|`]/,
  /\$\(/,
  /\n/,
  /\.\./
];

export function sanitizeText(input: unknown, limit = 8000) {
  return String(input || "")
    .replace(/\u0000/g, "")
    .slice(0, limit);
}

export function assertCommandAllowed(command: string) {
  const trimmed = command.trim();
  if (!trimmed) return;
  if (deniedPatterns.some((pattern) => pattern.test(trimmed))) {
    throw new Error("Command blocked by NovaForge local guardrails.");
  }
  const segments = trimmed.split("&&").map((segment) => segment.trim()).filter(Boolean);
  for (const segment of segments) {
    const prefix = segment.split(/\s+/)[0]?.toLowerCase();
    if (!allowedPrefixes.includes(prefix)) {
      throw new Error(`Command '${prefix}' is not in the low-risk allowlist.`);
    }
  }
}

export function workspacePath(workspaceId: string) {
  const safeId = workspaceId.replace(/[^a-zA-Z0-9_-]/g, "");
  const root = path.resolve(config.workspaceRoot);
  const target = path.resolve(root, safeId);
  if (!target.startsWith(root)) {
    throw new Error("Invalid workspace path.");
  }
  fs.mkdirSync(target, { recursive: true });
  return target;
}
