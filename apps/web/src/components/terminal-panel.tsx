"use client";

import { TerminalSquare } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { WS_URL } from "@/lib/config";

export function TerminalPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    let terminal: import("@xterm/xterm").Terminal | null = null;
    let socket: WebSocket | null = null;
    let disposed = false;

    async function bootTerminal() {
      const [{ Terminal }, { FitAddon }] = await Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]);
      if (disposed || !containerRef.current) return;

      terminal = new Terminal({
        cursorBlink: true,
        fontFamily: "Consolas, Monaco, monospace",
        fontSize: 13,
        theme: {
          background: "#05070d",
          foreground: "#d7f8ff",
          cursor: "#22d3ee"
        }
      });
      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(containerRef.current);
      window.requestAnimationFrame(() => {
        if (!terminal) return;
        try {
          fitAddon.fit();
        } catch {
          terminal.resize(80, 12);
        }
      });
      terminal.writeln("NovaForge terminal");
      terminal.writeln("Allowed locally: node, npm, python, pip, git, ls/dir, cat/type, cargo, rustc, gcc/g++, javac/java");
      terminal.write("> ");

      let buffer = "";
      socket = new WebSocket(`${WS_URL}?workspace=demo-js`);
      socketRef.current = socket;

      socket.onopen = () => {
        setConnected(true);
        terminal?.writeln("\r\nconnected to guarded backend shell");
        terminal?.write("> ");
      };
      socket.onmessage = (event) => {
        terminal?.write(String(event.data).replace(/\n/g, "\r\n"));
        terminal?.write("\r\n> ");
      };
      socket.onclose = () => {
        setConnected(false);
        terminal?.writeln("\r\nbackend terminal disconnected");
      };
      socket.onerror = () => {
        terminal?.writeln("\r\nterminal websocket unavailable");
      };

      terminal.onData((data) => {
        if (data === "\r") {
          terminal?.write("\r\n");
          if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "command", command: buffer }));
          }
          buffer = "";
          return;
        }
        if (data === "\u007f") {
          if (buffer.length > 0) {
            buffer = buffer.slice(0, -1);
            terminal?.write("\b \b");
          }
          return;
        }
        buffer += data;
        terminal?.write(data);
      });
    }

    bootTerminal();

    const resize = () => terminal?.resize(80, 12);
    window.addEventListener("resize", resize);

    return () => {
      disposed = true;
      window.removeEventListener("resize", resize);
      socket?.close();
      terminal?.dispose();
    };
  }, []);

  return (
    <div className="glass flex h-full flex-col overflow-hidden rounded-lg">
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-1.5">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-100">
          <TerminalSquare className="h-4 w-4 text-cyanForge" />
          Terminal
        </div>
        <span className={`rounded px-2 py-0.5 text-xs ${connected ? "bg-mintForge/10 text-mintForge" : "bg-amberForge/10 text-amberForge"}`}>
          {connected ? "connected" : "offline"}
        </span>
      </div>
      <div ref={containerRef} className="flex-1 p-1" />
    </div>
  );
}
