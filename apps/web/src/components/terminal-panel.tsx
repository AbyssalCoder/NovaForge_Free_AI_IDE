"use client";

import { TerminalSquare, Trash2, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";
import { WS_URL } from "@/lib/config";

export function TerminalPanel({ workspaceId = "demo-js" }: { workspaceId?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const termRef = useRef<import("@xterm/xterm").Terminal | null>(null);
  const fitRef = useRef<import("@xterm/addon-fit").FitAddon | null>(null);
  const [connected, setConnected] = useState(false);
  const bufferRef = useRef("");

  const connect = useCallback(() => {
    if (!termRef.current) return;
    const terminal = termRef.current;

    socketRef.current?.close();
    const socket = new WebSocket(`${WS_URL}?workspace=${encodeURIComponent(workspaceId)}`);
    socketRef.current = socket;

    socket.onopen = () => {
      setConnected(true);
      terminal.writeln("\r\n\x1b[32m● connected to backend shell\x1b[0m");
      terminal.write("\x1b[36m❯\x1b[0m ");
    };
    socket.onmessage = (event) => {
      const data = String(event.data);
      terminal.write(data.replace(/\n/g, "\r\n"));
      // Only show prompt after exit lines
      if (data.includes("exit ")) {
        terminal.write("\r\n\x1b[36m❯\x1b[0m ");
      }
    };
    socket.onclose = () => {
      setConnected(false);
      terminal.writeln("\r\n\x1b[33m● disconnected\x1b[0m");
    };
    socket.onerror = () => {
      terminal.writeln("\r\n\x1b[31m● websocket unavailable\x1b[0m");
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;

    async function bootTerminal() {
      const [{ Terminal }, { FitAddon }] = await Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]);
      if (disposed || !containerRef.current) return;

      const terminal = new Terminal({
        cursorBlink: true,
        fontFamily: "JetBrains Mono, Consolas, Monaco, monospace",
        fontSize: 13,
        theme: {
          background: "#05070d",
          foreground: "#d7f8ff",
          cursor: "#22d3ee",
          selectionBackground: "#22d3ee33",
        },
        allowProposedApi: true,
      });
      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(containerRef.current!);
      termRef.current = terminal;
      fitRef.current = fitAddon;

      requestAnimationFrame(() => {
        try { fitAddon.fit(); } catch { terminal.resize(80, 12); }
      });

      terminal.writeln("\x1b[1;36m╔══════════════════════════════════╗\x1b[0m");
      terminal.writeln("\x1b[1;36m║\x1b[0m   \x1b[1mNovaForge Terminal\x1b[0m            \x1b[1;36m║\x1b[0m");
      terminal.writeln("\x1b[1;36m╚══════════════════════════════════╝\x1b[0m");
      terminal.write("\x1b[36m❯\x1b[0m ");

      terminal.onData((data) => {
        if (data === "\r") {
          terminal.write("\r\n");
          if (socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({ type: "command", command: bufferRef.current }));
          } else {
            terminal.writeln("\x1b[33mNot connected. Click reconnect.\x1b[0m");
            terminal.write("\x1b[36m❯\x1b[0m ");
          }
          bufferRef.current = "";
          return;
        }
        if (data === "\u007f") {
          if (bufferRef.current.length > 0) {
            bufferRef.current = bufferRef.current.slice(0, -1);
            terminal.write("\b \b");
          }
          return;
        }
        bufferRef.current += data;
        terminal.write(data);
      });

      // Auto-connect
      const socket = new WebSocket(`${WS_URL}?workspace=${encodeURIComponent(workspaceId)}`);
      socketRef.current = socket;
      socket.onopen = () => {
        setConnected(true);
        terminal.writeln("\r\n\x1b[32m● connected to backend shell\x1b[0m");
        terminal.write("\x1b[36m❯\x1b[0m ");
      };
      socket.onmessage = (event) => {
        terminal.write(String(event.data).replace(/\n/g, "\r\n"));
        terminal.write("\r\n\x1b[36m❯\x1b[0m ");
      };
      socket.onclose = () => {
        setConnected(false);
        terminal.writeln("\r\n\x1b[33m● disconnected – reconnecting...\x1b[0m");
        // Auto-reconnect with exponential backoff
        let delay = 1000;
        const maxDelay = 15000;
        function tryReconnect() {
          if (disposed) return;
          setTimeout(() => {
            const rs = new WebSocket(`${WS_URL}?workspace=${encodeURIComponent(workspaceId)}`);
            rs.onopen = () => {
              socketRef.current = rs;
              setConnected(true);
              terminal.writeln("\r\n\x1b[32m● reconnected\x1b[0m");
              terminal.write("\x1b[36m❯\x1b[0m ");
              rs.onmessage = socket.onmessage;
              rs.onclose = socket.onclose;
            };
            rs.onerror = () => {
              delay = Math.min(delay * 2, maxDelay);
              tryReconnect();
            };
          }, delay);
        }
        tryReconnect();
      };
      socket.onerror = () => {
        terminal.writeln("\r\n\x1b[31m● websocket unavailable\x1b[0m");
      };
    }

    bootTerminal();

    const resizeObs = new ResizeObserver(() => {
      try { fitRef.current?.fit(); } catch {}
    });
    if (containerRef.current) resizeObs.observe(containerRef.current);

    return () => {
      disposed = true;
      resizeObs.disconnect();
      socketRef.current?.close();
      termRef.current?.dispose();
    };
  }, []);

  function clearTerminal() {
    termRef.current?.clear();
    termRef.current?.write("\x1b[36m❯\x1b[0m ");
  }

  return (
    <div className="glass flex h-full flex-col overflow-hidden rounded-lg">
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-1.5">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-100">
          <TerminalSquare className="h-4 w-4 text-cyanForge" />
          Terminal
        </div>
        <div className="flex items-center gap-2">
          <button onClick={clearTerminal} className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-300" title="Clear">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button onClick={connect} className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-300" title="Reconnect">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <span className={`rounded px-2 py-0.5 text-xs ${connected ? "bg-mintForge/10 text-mintForge" : "bg-amberForge/10 text-amberForge"}`}>
            {connected ? "connected" : "offline"}
          </span>
        </div>
      </div>
      <div ref={containerRef} className="flex-1 p-1" />
    </div>
  );
}
