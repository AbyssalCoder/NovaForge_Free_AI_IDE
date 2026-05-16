import fs from "node:fs";
import path from "node:path";
import { workspacePath } from "./security.js";
import { config } from "./config.js";

export type WorkspaceEntry = {
  path: string;
  type: "file" | "folder";
};

const starterFiles: Record<string, string> = {
  "app/page.tsx": `export default function Page() {
  return (
    <main>
      <h1>Hello from CodeAbyss</h1>
      <p>Ask the agent to turn this into a complete app.</p>
    </main>
  );
}
`,
  "styles.css": `body {
  background: #05070d;
  color: #e5f6ff;
  font-family: system-ui, sans-serif;
}
`,
  "python/main.py": `print("Hello from CodeAbyss Python")
`,
  "javascript/index.js": `console.log("Hello from CodeAbyss JavaScript");
`,
  "c/main.c": `#include <stdio.h>

int main(void) {
  printf("Hello from CodeAbyss C\\n");
  return 0;
}
`,
  "cpp/main.cpp": `#include <iostream>

int main() {
  std::cout << "Hello from CodeAbyss C++" << std::endl;
  return 0;
}
`,
  "java/Main.java": `public class Main {
  public static void main(String[] args) {
    System.out.println("Hello from CodeAbyss Java");
  }
}
`,
  "rust/main.rs": `fn main() {
    println!("Hello from CodeAbyss Rust");
}
`
};

export function ensureStarterWorkspace(workspaceId = "demo-js") {
  const root = workspacePath(workspaceId);
  for (const [relativePath, content] of Object.entries(starterFiles)) {
    const target = safeWorkspaceFile(root, relativePath);
    if (!fs.existsSync(target)) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content, "utf8");
    }
  }
}

export function listWorkspace(workspaceId = "demo-js") {
  ensureStarterWorkspace(workspaceId);
  const root = workspacePath(workspaceId);
  const entries: WorkspaceEntry[] = [];

  function walk(current: string) {
    for (const item of fs.readdirSync(current, { withFileTypes: true })) {
      if (item.name === "node_modules" || item.name === ".git") continue;
      const full = path.join(current, item.name);
      const relative = normalizeRelative(path.relative(root, full));
      if (item.isDirectory()) {
        entries.push({ path: relative, type: "folder" });
        walk(full);
      } else {
        entries.push({ path: relative, type: "file" });
      }
    }
  }

  walk(root);
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

export function readWorkspaceFile(workspaceId: string, relativePath: string) {
  const root = workspacePath(workspaceId);
  const target = safeWorkspaceFile(root, relativePath);
  return fs.readFileSync(target, "utf8");
}

export function writeWorkspaceFile(workspaceId: string, relativePath: string, content: string) {
  const root = workspacePath(workspaceId);
  // Enforce per-workspace quota
  const stats = getWorkspaceStats(root);
  const maxBytes = config.maxWorkspaceSizeMB * 1024 * 1024;
  if (stats.totalSize + content.length > maxBytes) {
    throw new Error(`Workspace storage quota exceeded (${config.maxWorkspaceSizeMB}MB limit).`);
  }
  if (stats.fileCount >= config.maxWorkspaceFiles) {
    throw new Error(`Workspace file limit exceeded (${config.maxWorkspaceFiles} files max).`);
  }
  const target = safeWorkspaceFile(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
}

function getWorkspaceStats(root: string): { totalSize: number; fileCount: number } {
  let totalSize = 0, fileCount = 0;
  function walk(dir: string) {
    try {
      for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        if (item.name === "node_modules" || item.name === ".git") continue;
        const full = path.join(dir, item.name);
        if (item.isDirectory()) { walk(full); }
        else { totalSize += fs.statSync(full).size; fileCount++; }
      }
    } catch {}
  }
  try { walk(root); } catch {}
  return { totalSize, fileCount };
}

export function createWorkspaceFolder(workspaceId: string, relativePath: string) {
  const root = workspacePath(workspaceId);
  const target = safeWorkspaceFile(root, relativePath);
  fs.mkdirSync(target, { recursive: true });
}

export function deleteWorkspaceEntry(workspaceId: string, relativePath: string) {
  const root = workspacePath(workspaceId);
  const target = safeWorkspaceFile(root, relativePath);
  if (!fs.existsSync(target)) return;
  fs.rmSync(target, { recursive: true, force: true });
}

function safeWorkspaceFile(root: string, relativePath: string) {
  const clean = normalizeRelative(relativePath).replace(/^\/+/, "");
  if (!clean || clean.includes("..")) {
    throw new Error("Invalid workspace path.");
  }
  const target = path.resolve(root, clean);
  if (!target.startsWith(path.resolve(root))) {
    throw new Error("Path escapes workspace.");
  }
  return target;
}

function normalizeRelative(relativePath: string) {
  return relativePath.replaceAll("\\", "/").replace(/^\/+/, "");
}
