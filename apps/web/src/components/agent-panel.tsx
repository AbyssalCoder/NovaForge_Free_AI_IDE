"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  FileCode2,
  Globe,
  Loader2,
  Send,
  Sparkles,
  Terminal as TerminalIcon,
  User,
  Wrench,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { API_URL } from "@/lib/config";

/* ── Types ────────────────────────────────────────────────────── */

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  steps?: AgentStep[];
  createdFiles?: string[];
  port?: number;
};

type AgentStep = {
  text: string;
  status: "pending" | "in-progress" | "completed";
  file?: string;
};

type Props = {
  provider: string;
  apiKey: string;
  files: Record<string, string>;
  onStatus: (message: string) => void;
  onHighlightFile?: (file: string | null) => void;
  onFilesCreated?: () => void;
  onOpenFile?: (path: string) => void;
  onPreviewUrl?: (url: string) => void;
};

/* ── Helpers ──────────────────────────────────────────────────── */

function detectPort(prompt: string): number {
  const portMatch = prompt.match(/port\s*(\d{4,5})/i);
  if (portMatch) return parseInt(portMatch[1], 10);
  const lower = prompt.toLowerCase();
  if (lower.includes("react") || lower.includes("vite")) return 5173;
  if (lower.includes("next")) return 3000;
  if (lower.includes("express") || lower.includes("api") || lower.includes("backend")) return 8080;
  if (lower.includes("flask") || lower.includes("django")) return 5000;
  return 5500;
}

function detectProjectType(prompt: string): string {
  const lower = prompt.toLowerCase();
  if (lower.includes("ecommerce") || lower.includes("e-commerce") || lower.includes("shop") || lower.includes("store")) return "E-Commerce App";
  if (lower.includes("todo") || lower.includes("task")) return "Todo App";
  if (lower.includes("portfolio")) return "Portfolio Site";
  if (lower.includes("dashboard") || lower.includes("admin")) return "Dashboard";
  if (lower.includes("chat") || lower.includes("messenger")) return "Chat App";
  if (lower.includes("calculator")) return "Calculator";
  if (lower.includes("weather")) return "Weather App";
  if (lower.includes("landing") || lower.includes("homepage")) return "Landing Page";
  if (lower.includes("game")) return "Game";
  return "Web App";
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

let msgId = 0;
function nextId() { return `msg-${++msgId}`; }

/* ── Component ────────────────────────────────────────────────── */

export function AgentPanel({ provider, apiKey, files, onStatus, onHighlightFile, onFilesCreated, onOpenFile, onPreviewUrl }: Props) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: nextId(),
      role: "system",
      content: "NovaForge Agent is ready. Describe what you want to build — I'll generate the full project and write it to your workspace.",
      timestamp: new Date(),
    },
  ]);
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function toggleSteps(id: string) {
    setExpandedSteps((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || busy) return;

    const userMsg: ChatMessage = { id: nextId(), role: "user", content: text, timestamp: new Date() };

    const thinkingId = nextId();
    const thinkingMsg: ChatMessage = {
      id: thinkingId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      steps: [
        { text: "Understanding your request...", status: "in-progress" },
        { text: "Planning project structure...", status: "pending" },
        { text: "Generating code...", status: "pending" },
        { text: "Writing files to workspace...", status: "pending" },
      ],
    };

    setMessages((prev) => [...prev, userMsg, thinkingMsg]);
    setExpandedSteps((prev) => ({ ...prev, [thinkingId]: true }));
    setInput("");
    setBusy(true);
    onStatus("Agent is working...");

    // Animate steps
    await new Promise((r) => setTimeout(r, 400));
    setMessages((prev) =>
      prev.map((m) =>
        m.id === thinkingId
          ? { ...m, steps: m.steps?.map((s, i) => (i === 0 ? { ...s, status: "completed" as const } : i === 1 ? { ...s, status: "in-progress" as const } : s)) }
          : m
      )
    );
    await new Promise((r) => setTimeout(r, 300));
    setMessages((prev) =>
      prev.map((m) =>
        m.id === thinkingId
          ? { ...m, steps: m.steps?.map((s, i) => (i <= 1 ? { ...s, status: "completed" as const } : i === 2 ? { ...s, status: "in-progress" as const } : s)) }
          : m
      )
    );

    try {
      const response = await fetch(`${API_URL}/api/agent/run`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(apiKey ? { "x-novaforge-api-key": apiKey } : {}),
        },
        body: JSON.stringify({ provider, prompt: text, projectId: "demo-js", files }),
      });
      const data = await response.json();

      const fileSteps: AgentStep[] = (data.steps || []).map((step: string) => {
        const fileMatch = step.match(/(?:create|edit|update|modify|write|reading|wrote)\s+['"]?(\S+\.\w+)['"]?/i);
        return { text: step, status: "completed" as const, file: fileMatch?.[1] };
      });

      const port = detectPort(text);
      const projectType = detectProjectType(text);
      const createdFiles: string[] = data.createdFiles || [];
      const hasHTML = createdFiles.some((f: string) => f.endsWith(".html"));

      let content = "";
      if (createdFiles.length > 0) {
        content += `Built your **${projectType}** — ${createdFiles.length} file(s) created.\n\n`;
        content += `**Files:**\n${createdFiles.map((f: string) => `- \`${f}\``).join("\n")}\n\n`;
        if (hasHTML) {
          content += `**🌐 Open in browser:**\n`;
          content += `Click a file below to open it in the editor, or use **Run** to execute.\n`;
        } else {
          content += `Click a file below to open it in the editor.\n`;
        }
      } else {
        content = data.message || "No files generated. Try a more specific request.";
      }

      const assistantMsg: ChatMessage = {
        id: nextId(),
        role: "assistant",
        content,
        timestamp: new Date(),
        steps: fileSteps,
        createdFiles,
        port: hasHTML ? 8787 : undefined,
      };

      setMessages((prev) => prev.filter((m) => m.id !== thinkingId).concat(assistantMsg));
      setExpandedSteps((prev) => ({ ...prev, [assistantMsg.id]: true }));

      if (createdFiles.length > 0) {
        onFilesCreated?.();
        if (createdFiles[0]) onOpenFile?.(createdFiles[0]);
        if (hasHTML) {
          onPreviewUrl?.(`http://localhost:8787/preview/demo-js/index.html`);
        }
        for (const f of createdFiles) {
          onHighlightFile?.(f);
          await new Promise((r) => setTimeout(r, 200));
        }
        setTimeout(() => onHighlightFile?.(null), 2000);
      }

      onStatus(response.ok ? "Agent completed" : "Agent error");
    } catch {
      const errorMsg: ChatMessage = {
        id: nextId(),
        role: "assistant",
        content: "**Error:** Backend API unreachable at `localhost:8787`.\n\n```\nnpm run dev:node\n```\n\nStart the backend and try again.",
        timestamp: new Date(),
      };
      setMessages((prev) => prev.filter((m) => m.id !== thinkingId).concat(errorMsg));
      onStatus("Agent API offline");
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  /* ── Render Markdown-lite ─────────────────────────────────── */
  function renderContent(text: string) {
    const parts = text.split(/(```[\s\S]*?```)/g);
    return parts.map((part, i) => {
      if (part.startsWith("```")) {
        const code = part.replace(/```\w*\n?/, "").replace(/```$/, "").trim();
        return (
          <pre key={i} className="my-2 overflow-x-auto rounded-md border border-slate-700 bg-slate-950 p-2.5 text-[11px] leading-relaxed text-emerald-400 font-mono">
            <code>{code}</code>
          </pre>
        );
      }
      return (
        <span key={i}>
          {part.split("\n").map((line, j) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let processed: any = line;
            if (line.includes("**")) {
              const segments = line.split(/\*\*(.*?)\*\*/g);
              processed = segments.map((seg: string, k: number) =>
                k % 2 === 1 ? <strong key={k} className="text-slate-100 font-semibold">{seg}</strong> : seg
              );
            }
            if (typeof processed === "string" && processed.includes("`")) {
              const segments = processed.split(/`(.*?)`/g);
              processed = segments.map((seg: string, k: number) =>
                k % 2 === 1 ? <code key={k} className="rounded bg-slate-800 px-1 py-0.5 text-[11px] text-cyanForge font-mono">{seg}</code> : seg
              );
            }
            if (line.startsWith("- ")) {
              return <div key={j} className="ml-1 flex gap-1.5 py-0.5"><span className="text-cyanForge">•</span><span>{typeof processed === "string" ? processed.slice(2) : processed}</span></div>;
            }
            return <div key={j}>{processed || <br />}</div>;
          })}
        </span>
      );
    });
  }

  /* ── Chat Message Bubble ─────────────────────────────────── */
  function renderMessage(msg: ChatMessage) {
    if (msg.role === "system") {
      return (
        <motion.div
          key={msg.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-2 mb-3 flex items-start gap-2.5 rounded-lg border border-slate-800/60 bg-gradient-to-r from-cyanForge/5 to-transparent p-3"
        >
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyanForge/15">
            <Sparkles className="h-3.5 w-3.5 text-cyanForge" />
          </div>
          <div className="text-xs leading-relaxed text-slate-400">{msg.content}</div>
        </motion.div>
      );
    }

    if (msg.role === "user") {
      return (
        <motion.div
          key={msg.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-3 flex justify-end px-2"
        >
          <div className="flex max-w-[90%] items-start gap-2">
            <div className="rounded-xl rounded-tr-sm border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs leading-relaxed text-slate-200">
              {msg.content}
            </div>
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violetForge/20">
              <User className="h-3 w-3 text-violetForge" />
            </div>
          </div>
        </motion.div>
      );
    }

    // Assistant message
    const isThinking = !msg.content && msg.steps?.some((s) => s.status !== "completed");
    const stepsExpanded = expandedSteps[msg.id] ?? false;

    return (
      <motion.div
        key={msg.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-3 px-2"
      >
        <div className="flex items-start gap-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyanForge/15 mt-0.5">
            {isThinking ? <Loader2 className="h-3.5 w-3.5 animate-spin text-cyanForge" /> : <Bot className="h-3.5 w-3.5 text-cyanForge" />}
          </div>
          <div className="flex-1 min-w-0">
            {/* Steps collapsible */}
            {msg.steps && msg.steps.length > 0 && (
              <div className="mb-1.5">
                <button
                  onClick={() => toggleSteps(msg.id)}
                  className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-slate-400 hover:text-slate-200 transition-colors"
                >
                  {stepsExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  <Wrench className="h-3 w-3 text-amberForge" />
                  {isThinking ? "Working..." : `${msg.steps.filter(s => s.status === "completed").length} steps completed`}
                </button>
                <AnimatePresence>
                  {stepsExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="ml-0.5 rounded-md border border-slate-800/60 bg-slate-950/50 p-2">
                        {msg.steps.map((step, index) => (
                          <div key={index} className="mb-1 flex items-start gap-2 text-[11px] last:mb-0">
                            {step.status === "completed" ? (
                              <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-mintForge" />
                            ) : step.status === "in-progress" ? (
                              <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin text-cyanForge" />
                            ) : (
                              <Circle className="mt-0.5 h-3 w-3 shrink-0 text-slate-600" />
                            )}
                            <span className={step.status === "completed" ? "text-slate-500" : step.status === "in-progress" ? "text-cyanForge" : "text-slate-600"}>
                              {step.text}
                            </span>
                            {step.file && (
                              <button
                                className="ml-auto shrink-0 rounded bg-violetForge/10 px-1.5 py-0.5 text-[10px] text-violetForge hover:bg-violetForge/20 transition-colors"
                                onClick={() => onOpenFile?.(step.file!)}
                              >
                                {step.file}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Content */}
            {msg.content && (
              <div className="text-xs leading-relaxed text-slate-300">
                {renderContent(msg.content)}
              </div>
            )}

            {/* Port / Preview card */}
            {msg.port && (
              <div className="mt-2 flex items-center gap-2.5 rounded-lg border border-cyanForge/20 bg-gradient-to-r from-cyanForge/5 to-transparent px-3 py-2">
                <Globe className="h-4 w-4 text-cyanForge shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-medium text-slate-200">Preview Available</div>
                  <div className="text-[10px] text-slate-500">localhost:{msg.port} • Open in browser or Live Preview</div>
                </div>
                <span className="rounded-md border border-cyanForge/30 bg-cyanForge/10 px-2 py-0.5 text-[11px] font-mono font-medium text-cyanForge">
                  :{msg.port}
                </span>
              </div>
            )}

            {/* Created files as clickable pills */}
            {msg.createdFiles && msg.createdFiles.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {msg.createdFiles.map((f) => (
                  <button
                    key={f}
                    onClick={() => onOpenFile?.(f)}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-700/60 bg-slate-800/40 px-2 py-1 text-[10px] text-slate-300 hover:border-cyanForge/40 hover:text-cyanForge transition-colors"
                  >
                    <FileCode2 className="h-3 w-3" />
                    {f}
                  </button>
                ))}
              </div>
            )}

            {/* Timestamp */}
            <div className="mt-1.5 text-[10px] text-slate-600">{timeAgo(msg.timestamp)}</div>
          </div>
        </div>
      </motion.div>
    );
  }

  /* ── Main Render ─────────────────────────────────────────── */
  return (
    <div className="glass flex flex-1 flex-col overflow-hidden rounded-lg">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-100">
          <Sparkles className="h-4 w-4 text-cyanForge" />
          NovaForge Agent
        </div>
        <div className="flex items-center gap-1.5">
          <span className="flex items-center gap-1 rounded-md border border-mintForge/30 bg-mintForge/10 px-1.5 py-0.5 text-[10px] font-mono text-mintForge">
            <TerminalIcon className="h-2.5 w-2.5" />
            :8787
          </span>
          <span className="rounded-md border border-cyanForge/30 bg-cyanForge/10 px-1.5 py-0.5 text-[10px] text-cyanForge">{provider}</span>
        </div>
      </div>

      {/* Chat messages */}
      <div className="thin-scrollbar flex flex-1 flex-col overflow-y-auto py-3">
        {messages.map(renderMessage)}
        <div ref={chatEndRef} />
      </div>

      {/* Input bar */}
      <div className="border-t border-slate-800 p-2">
        <div className="flex items-end gap-2 rounded-lg border border-slate-700/60 bg-slate-900/80 p-2 focus-within:border-cyanForge/50 transition-colors">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask NovaForge to build something..."
            rows={1}
            className="flex-1 resize-none bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-500"
            style={{ minHeight: "20px", maxHeight: "80px" }}
            onInput={(e) => {
              const t = e.target as HTMLTextAreaElement;
              t.style.height = "20px";
              t.style.height = `${Math.min(t.scrollHeight, 80)}px`;
            }}
          />
          <button
            onClick={sendMessage}
            disabled={busy || !input.trim()}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-cyanForge text-slate-950 transition-all hover:bg-cyanForge/80 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </button>
        </div>
        <div className="mt-1 flex items-center justify-between px-1 text-[10px] text-slate-600">
          <span>Shift+Enter for new line • Enter to send</span>
          <span>Backend :8787 • Frontend :3000</span>
        </div>
      </div>
    </div>
  );
}
