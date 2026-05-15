"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Settings, X, Monitor, Type, Bot, Terminal, Keyboard, Save } from "lucide-react";
import { useState, useEffect } from "react";
import { apiFetch, getAuthToken } from "@/lib/config";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Props = { open: boolean; onClose: () => void; onSettingsChange: (settings: any) => void };

export function SettingsModal({ open, onClose, onSettingsChange }: Props) {
  const [theme, setTheme] = useState("cyberpunk");
  const [editorFontSize, setEditorFontSize] = useState(14);
  const [terminalFontSize, setTerminalFontSize] = useState(13);
  const [aiProvider, setAiProvider] = useState("auto");
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open || !getAuthToken()) return;
    apiFetch("/api/settings").then((r) => r.json()).then((data) => {
      if (data.settings) {
        setTheme(data.settings.theme || "cyberpunk");
        setEditorFontSize(data.settings.editor_font_size || 14);
        setTerminalFontSize(data.settings.terminal_font_size || 13);
        setAiProvider(data.settings.ai_provider || "auto");
        setAutoSaveEnabled(Boolean(data.settings.auto_save));
      }
    }).catch(() => {});
  }, [open]);

  async function saveSettings() {
    const settings = {
      theme,
      editor_font_size: editorFontSize,
      terminal_font_size: terminalFontSize,
      ai_provider: aiProvider,
      auto_save: autoSaveEnabled ? 1 : 0
    };

    if (getAuthToken()) {
      try { await apiFetch("/api/settings", { method: "PUT", body: JSON.stringify(settings) }); } catch {}
    }

    // Also save locally
    window.localStorage.setItem("novaforge_settings", JSON.stringify(settings));
    onSettingsChange(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
          className="glass thin-scrollbar mx-4 max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl p-6" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-cyanForge" />
              <h3 className="text-lg font-bold text-white">Settings</h3>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
          </div>

          <div className="mt-4 space-y-4">
            {/* Theme */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-200"><Monitor className="h-4 w-4 text-cyanForge" /> Theme</label>
              <select value={theme} onChange={(e) => setTheme(e.target.value)} className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100">
                <option value="cyberpunk">Cyberpunk (Default)</option>
                <option value="midnight">Midnight Blue</option>
                <option value="emerald">Emerald Dark</option>
                <option value="amber">Amber Glow</option>
              </select>
            </div>

            {/* Editor Font Size */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-200"><Type className="h-4 w-4 text-cyanForge" /> Editor Font Size: {editorFontSize}px</label>
              <input type="range" min={10} max={24} value={editorFontSize} onChange={(e) => setEditorFontSize(Number(e.target.value))} className="mt-1 w-full accent-cyanForge" />
            </div>

            {/* Terminal Font Size */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-200"><Terminal className="h-4 w-4 text-cyanForge" /> Terminal Font Size: {terminalFontSize}px</label>
              <input type="range" min={10} max={20} value={terminalFontSize} onChange={(e) => setTerminalFontSize(Number(e.target.value))} className="mt-1 w-full accent-cyanForge" />
            </div>

            {/* AI Provider */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-200"><Bot className="h-4 w-4 text-cyanForge" /> AI Provider</label>
              <select value={aiProvider} onChange={(e) => setAiProvider(e.target.value)} className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100">
                <option value="auto">Auto (Gemini → Ollama)</option>
                <option value="gemini">Gemini</option>
                <option value="ollama">Ollama Local</option>
                <option value="openrouter">OpenRouter</option>
                <option value="deepseek">DeepSeek</option>
                <option value="groq">Groq</option>
                <option value="together">Together AI</option>
              </select>
            </div>

            {/* Auto Save */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-200"><Save className="h-4 w-4 text-cyanForge" /> Auto Save</label>
              <button onClick={() => setAutoSaveEnabled(!autoSaveEnabled)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${autoSaveEnabled ? "bg-cyanForge/20 text-cyanForge" : "bg-slate-800 text-slate-500"}`}>
                {autoSaveEnabled ? "ON" : "OFF"}
              </button>
            </div>

            {/* Keyboard Shortcuts */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-200"><Keyboard className="h-4 w-4 text-cyanForge" /> Keyboard Shortcuts</label>
              <div className="mt-1 rounded-md border border-slate-800 bg-slate-950/50 p-2 text-xs text-slate-400 space-y-1">
                <div className="flex justify-between"><span>Save File</span><kbd className="rounded bg-slate-800 px-1.5 py-0.5">Ctrl+S</kbd></div>
                <div className="flex justify-between"><span>Run File</span><kbd className="rounded bg-slate-800 px-1.5 py-0.5">Ctrl+Enter</kbd></div>
                <div className="flex justify-between"><span>Toggle Terminal</span><kbd className="rounded bg-slate-800 px-1.5 py-0.5">Ctrl+`</kbd></div>
                <div className="flex justify-between"><span>New File</span><kbd className="rounded bg-slate-800 px-1.5 py-0.5">Ctrl+N</kbd></div>
              </div>
            </div>
          </div>

          <button onClick={saveSettings} className="mt-5 w-full rounded-md bg-cyanForge py-2 text-sm font-semibold text-slate-950">
            {saved ? "✓ Saved!" : "Save Settings"}
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
