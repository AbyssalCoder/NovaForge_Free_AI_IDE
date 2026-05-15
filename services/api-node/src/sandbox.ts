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
    return {
      ok: false,
      output: "Docker is not installed or not on PATH. Install Docker Desktop to enable isolated sandboxes."
    };
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
    return uniqueImages.map((image) => ({ image, present: false, reason: "Docker unavailable" }));
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
