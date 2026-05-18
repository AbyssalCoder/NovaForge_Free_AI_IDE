import { spawn } from "node:child_process";
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
    // Fallback: execute directly with a sanitized environment
    return runDirectly(workspaceId, language, command);
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

// ── Direct execution fallback (sanitized env, no secrets) ─────────
function runDirectly(workspaceId: string, _language: string, command: string): Promise<{ ok: boolean; output: string }> {
  assertCommandAllowed(command);
  const cwd = workspacePath(workspaceId);

  // Clean environment: only PATH and language-specific vars, NO secrets
  const safeEnv: Record<string, string> = {
    PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    HOME: "/tmp",
    LANG: "C.UTF-8",
    TERM: "dumb",
    JAVA_HOME: "/usr/lib/jvm/java-17-openjdk",
  };

  return new Promise<{ ok: boolean; output: string }>((resolve) => {
    const child = spawn("sh", ["-c", command], {
      cwd,
      env: safeEnv,
      shell: false,
    });
    let output = "";
    let outputSize = 0;
    const MAX_OUTPUT = 100_000; // 100KB max output

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      output += "\n[TIMEOUT] Process killed after 15s";
    }, 15_000);

    child.stdout.on("data", (chunk: Buffer) => {
      if (outputSize < MAX_OUTPUT) {
        output += chunk.toString();
        outputSize += chunk.length;
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (outputSize < MAX_OUTPUT) {
        output += chunk.toString();
        outputSize += chunk.length;
      }
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, output: output.trim() || "(No output)" });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, output: `Execution error: ${err.message}` });
    });
  });
}

export async function imageStatus() {
  const uniqueImages = [...new Set(Object.values(dockerImages))];
  const available = await dockerAvailable();
  if (!available) {
    return uniqueImages.map((image) => ({ image, present: false, reason: "Using direct execution (compilers installed)" }));
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
