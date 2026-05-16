import { spawn } from "node:child_process";
import http from "node:http";
import { WebSocketServer } from "ws";
import { assertCommandAllowed, workspacePath } from "./security.js";
import { verifyToken } from "./auth.js";

export function attachTerminal(server: http.Server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (socket, request) => {
    const url = new URL(request.url || "", "http://localhost");
    const workspace = url.searchParams.get("workspace") || "demo-js";
    const token = url.searchParams.get("token");

    // Auth check - allow if valid token or no token (dev mode / anonymous)
    if (token) {
      const user = verifyToken(token);
      if (!user) {
        socket.send("Authentication failed.");
        socket.close();
        return;
      }
    }
    const cwd = workspacePath(workspace);

    socket.on("message", (raw) => {
      try {
        const payload = JSON.parse(String(raw)) as { command?: string };
        const command = String(payload.command || "").trim();
        if (!command) return;
        assertCommandAllowed(command);

        const shell = process.platform === "win32" ? "cmd.exe" : "sh";
        const shellArgs = process.platform === "win32" ? ["/d", "/s", "/c", command] : ["-lc", command];
        const child = spawn(shell, shellArgs, {
          cwd,
          env: { ...process.env, NOVAFORGE_WORKSPACE: cwd },
          windowsHide: true
        });

        const timer = setTimeout(() => {
          child.kill();
          socket.send("\nCommand timed out after 60 seconds.");
        }, 60_000);

        child.stdout.on("data", (chunk) => socket.send(chunk.toString()));
        child.stderr.on("data", (chunk) => socket.send(chunk.toString()));
        child.on("exit", (code) => {
          clearTimeout(timer);
          socket.send(`\nexit ${code ?? 0}`);
        });
      } catch (error) {
        socket.send(error instanceof Error ? error.message : "Command rejected.");
      }
    });
  });
}
