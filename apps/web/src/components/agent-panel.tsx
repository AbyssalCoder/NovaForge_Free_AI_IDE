"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bot, CheckCircle2, Circle, FileCode2, Loader2, Send, Wrench } from "lucide-react";
import { useState } from "react";
import { API_URL } from "@/lib/config";

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
};

export function AgentPanel({ provider, apiKey, files, onStatus, onHighlightFile }: Props) {
  const [prompt, setPrompt] = useState("Build a polished todo app with local persistence and tests.");
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [log, setLog] = useState<string[]>([
    "Agent online.",
    "Default mode: Ollama local models, no paid API required.",
    "Tools: create/edit/delete files, run guarded commands, retry builds."
  ]);

  async function runAgent() {
    setBusy(true);
    setSteps([
      { text: "Analyzing project structure...", status: "in-progress" },
      { text: "Planning file changes...", status: "pending" },
      { text: "Writing code...", status: "pending" },
      { text: "Running tests...", status: "pending" },
    ]);
    onStatus("Agent is planning");

    try {
      // Simulate step progress
      await new Promise((r) => setTimeout(r, 600));
      setSteps((s) => s.map((step, i) => i === 0 ? { ...step, status: "completed" } : i === 1 ? { ...step, status: "in-progress" } : step));

      const response = await fetch(`${API_URL}/api/agent/run`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(apiKey ? { "x-novaforge-api-key": apiKey } : {})
        },
        body: JSON.stringify({
          provider,
          prompt,
          projectId: "demo-js",
          files
        })
      });
      const data = await response.json();

      // Parse response steps into agent steps
      const responseSteps = (data.steps || []).map((step: string) => {
        const fileMatch = step.match(/(?:create|edit|update|modify|write|reading|wrote)\s+['"]?(\S+\.\w+)['"]?/i);
        if (fileMatch) onHighlightFile?.(fileMatch[1]);
        return {
          text: step,
          status: "completed" as const,
          file: fileMatch?.[1]
        };
      });

      setSteps(responseSteps.length > 0 ? responseSteps : [
        { text: data.message || "Agent completed.", status: "completed" }
      ]);

      setLog((current) => [data.message || "Agent completed.", ...(data.steps || []), ...current]);
      onStatus(response.ok ? "Agent completed" : "Agent needs provider configuration");
    } catch {
      setSteps([{ text: "Agent API offline. Start backend first.", status: "completed" }]);
      setLog((current) => ["Node API offline. Start npm run dev from the project root.", ...current]);
      onStatus("Agent API offline");
    } finally {
      setBusy(false);
      setTimeout(() => onHighlightFile?.(null), 2000);
    }
  }

  return (
    <div className="glass flex flex-1 flex-col overflow-hidden rounded-lg">
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-100">
          <Bot className="h-4 w-4 text-cyanForge" />
          Autonomous Agent
        </div>
        <span className="rounded border border-cyanForge/30 bg-cyanForge/10 px-2 py-1 text-xs text-cyanForge">{provider}</span>
      </div>
      <div className="thin-scrollbar flex flex-1 flex-col gap-2 overflow-y-auto p-3">
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          className="min-h-16 resize-none rounded-md border border-slate-700 bg-slate-950/80 p-2 text-sm text-slate-100 outline-none focus:border-cyanForge/70"
        />
        <button
          onClick={runAgent}
          disabled={busy}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-cyanForge px-3 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Build With Agent
        </button>

        {/* Agent Steps / Todos */}
        {steps.length > 0 && (
          <div className="rounded-md border border-slate-800 bg-slate-950/70 p-2">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-200">
              <Wrench className="h-3.5 w-3.5 text-amberForge" />
              Agent Progress
            </div>
            <AnimatePresence>
              {steps.map((step, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.08 }}
                  className="mb-1.5 flex items-start gap-2 text-xs"
                >
                  {step.status === "completed" ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mintForge" />
                  ) : step.status === "in-progress" ? (
                    <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-cyanForge" />
                  ) : (
                    <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-600" />
                  )}
                  <span className={step.status === "completed" ? "text-slate-400" : step.status === "in-progress" ? "text-cyanForge" : "text-slate-500"}>
                    {step.text}
                  </span>
                  {step.file && (
                    <span
                      className="ml-auto shrink-0 cursor-pointer rounded bg-violetForge/15 px-1.5 py-0.5 text-[10px] text-violetForge hover:bg-violetForge/25"
                      onClick={() => onHighlightFile?.(step.file!)}
                    >
                      {step.file}
                    </span>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Log */}
        <div className="thin-scrollbar flex-1 overflow-auto rounded-md border border-slate-800 bg-slate-950/70 p-2">
          {log.map((entry, index) => (
            <motion.div
              key={`${entry}-${index}`}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-1.5 flex gap-2 text-xs text-slate-300"
            >
              {entry.includes("file") ? <FileCode2 className="mt-0.5 h-3.5 w-3.5 text-mintForge" /> : <Wrench className="mt-0.5 h-3.5 w-3.5 text-amberForge" />}
              <span>{entry}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
