import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { assertCommandAllowed, workspacePath } from "./security.js";

const dockerImages: Record<string, string> = {
  node: "node:22-alpine",
  javascript: "node:22-alpine",
  typescript: "node:22-alpine",
  python: "python:3.12-alpine",
  c: "gcc:14",
  cpp: "gcc:14",
  "c++": "gcc:14",
  java: "eclipse-temurin:21",
  rust: "rust:1.82",
  html: "node:22-alpine",
  css: "node:22-alpine"
};

export const compilerImages = dockerImages;

export async function dockerAvailable() {
  return new Promise<boolean>((resolve) => {
    const child = spawn("docker", ["--version"], { shell: false });
    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
  });
}

export async function runInDocker(workspaceId: string, language: string, command: string) {
  assertCommandAllowed(command);
  const available = await dockerAvailable();
  if (!available) {
    // Fallback: use Piston API for code execution when Docker is unavailable
    return runViaPiston(workspaceId, language, command);
  }

  const cwd = workspacePath(workspaceId);
  const image = dockerImages[language] || dockerImages.node;

  return new Promise<{ ok: boolean; output: string }>((resolve) => {
    const args = [
      "run",
      "--rm",
      "--network",
      "none",
      "--cpus",
      "1",
      "--memory",
      "512m",
      "-v",
      `${cwd}:/workspace`,
      "-w",
      "/workspace",
      image,
      "sh",
      "-c",
      command
    ];
    const child = spawn("docker", args, { shell: false });
    let output = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      output += "\nProcess killed after timeout.";
    }, 30_000);
    child.stdout.on("data", (chunk) => (output += chunk.toString()));
    child.stderr.on("data", (chunk) => (output += chunk.toString()));
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, output });
    });
  });
}

export async function imageStatus() {
  const uniqueImages = [...new Set(Object.values(dockerImages))];
  const available = await dockerAvailable();
  if (!available) {
    return uniqueImages.map((image) => ({ image, present: false, reason: "Docker unavailable (using Piston API)" }));
  }

  return Promise.all(
    uniqueImages.map(
      (image) =>
        new Promise<{ image: string; present: boolean; reason?: string }>((resolve) => {
          const child = spawn("docker", ["image", "inspect", image], { shell: false });
          child.on("error", (error) => resolve({ image, present: false, reason: error.message }));
          child.on("exit", (code) => resolve({ image, present: code === 0 }));
        })
    )
  );
}

// ── Piston API fallback for environments without Docker ───────────
const PISTON_URL = "https://emkc.org/api/v2/piston/execute";

const pistonLangMap: Record<string, { language: string; version: string }> = {
  javascript: { language: "javascript", version: "18.15.0" },
  node: { language: "javascript", version: "18.15.0" },
  typescript: { language: "typescript", version: "5.0.3" },
  python: { language: "python", version: "3.10.0" },
  c: { language: "c", version: "10.2.0" },
  cpp: { language: "c++", version: "10.2.0" },
  "c++": { language: "c++", version: "10.2.0" },
  java: { language: "java", version: "15.0.2" },
  rust: { language: "rust", version: "1.68.2" },
  html: { language: "javascript", version: "18.15.0" },
  css: { language: "javascript", version: "18.15.0" },
};

function extractFilename(command: string): string | null {
  // Match common patterns: python 'file.py', node 'file.js', gcc 'file.c', etc.
  const patterns = [
    /python\s+'([^']+)'/,
    /python\s+(\S+)/,
    /node\s+'([^']+)'/,
    /node\s+(\S+)/,
    /npx\s+tsx\s+'([^']+)'/,
    /npx\s+tsx\s+(\S+)/,
    /gcc\s+'([^']+)'/,
    /gcc\s+(\S+)/,
    /g\+\+\s+'([^']+)'/,
    /g\+\+\s+(\S+)/,
    /javac\s+'([^']+)'/,
    /javac\s+(\S+)/,
    /rustc\s+'([^']+)'/,
    /rustc\s+(\S+)/,
  ];
  for (const pattern of patterns) {
    const match = command.match(pattern);
    if (match) return match[1];
  }
  return null;
}

async function runViaPiston(workspaceId: string, language: string, command: string): Promise<{ ok: boolean; output: string }> {
  const mapping = pistonLangMap[language];
  if (!mapping) {
    return { ok: false, output: `Language "${language}" is not supported for online execution.` };
  }

  // Extract filename from the command and read the source file
  const filename = extractFilename(command);
  if (!filename) {
    return { ok: false, output: `Could not determine source file from command: ${command}` };
  }

  const cwd = workspacePath(workspaceId);
  const filePath = path.join(cwd, filename);
  let sourceCode: string;
  try {
    sourceCode = await readFile(filePath, "utf-8");
  } catch {
    return { ok: false, output: `File not found: ${filename}` };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    const response = await fetch(PISTON_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        language: mapping.language,
        version: mapping.version,
        files: [{ name: filename, content: sourceCode }],
      }),
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return { ok: false, output: `Code execution service returned ${response.status}. Please try again.` };
    }

    const data = await response.json() as { run?: { stdout?: string; stderr?: string; code?: number }; message?: string };
    if (data.message) {
      return { ok: false, output: data.message };
    }
    const run = data.run;
    if (!run) {
      return { ok: false, output: "Unexpected response from execution service." };
    }

    const output = [run.stdout, run.stderr].filter(Boolean).join("\n").trim() || "(No output)";
    return { ok: run.code === 0, output };
  } catch (err: any) {
    if (err.name === "AbortError") {
      return { ok: false, output: "[TIMEOUT] Execution timed out after 30s" };
    }
    return { ok: false, output: `Execution service error: ${err.message}` };
  }
}
