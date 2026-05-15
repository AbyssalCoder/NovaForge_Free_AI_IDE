"use client";

import {
  AlertTriangle,
  Boxes,
  Bug,
  CheckCircle2,
  Coffee,
  Crown,
  ExternalLink,
  Eye,
  FilePlus2,
  Files,
  FolderPlus,
  Heart,
  HardDrive,
  Home,
  Info,
  KeyRound,
  LogIn,
  LogOut,
  Play,
  RefreshCw,
  Rocket,
  Save,
  Settings,
  Sparkles,
  Trash2,
  User,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgentPanel } from "@/components/agent-panel";
import { EditorPane } from "@/components/editor-pane";
import { TerminalPanel } from "@/components/terminal-panel";
import { AuthModal } from "@/components/auth-modal";
import { DonationModal } from "@/components/donation-modal";
import { SubscriptionModal } from "@/components/subscription-modal";
import { SettingsModal } from "@/components/settings-modal";
import { API_URL, apiFetch, clearAuthToken, demoFiles, geminiStudioUrl, getAuthToken } from "@/lib/config";

type FileMap = Record<string, string>;
type WorkspaceEntry = { path: string; type: "file" | "folder" };
type ToolTab = "Home" | "File" | "View" | "Run";
type UserInfo = { id: string; username: string; role: string; plan: string } | null;

export default function IDE() {
  const [files, setFiles] = useState<FileMap>(demoFiles);
  const [activeFile, setActiveFile] = useState("app/page.tsx");
  const [entries, setEntries] = useState<WorkspaceEntry[]>([]);
  const [activeTab, setActiveTab] = useState<ToolTab>("Home");
  const [provider, setProvider] = useState("auto");
  const [apiKey, setApiKey] = useState("");
  const [newFilePath, setNewFilePath] = useState("src/index.js");
  const [newFolderPath, setNewFolderPath] = useState("src");
  const [previewUrl, setPreviewUrl] = useState("");
  const [status, setStatus] = useState("Local-first mode ready");
  const [runOutput, setRunOutput] = useState("Run output will appear here.");
  const [sandboxStatus, setSandboxStatus] = useState<Array<{ image: string; present: boolean; reason?: string }>>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [showAgent, setShowAgent] = useState(true);
  const [showAllFiles, setShowAllFiles] = useState(false);
  const [highlightedFile, setHighlightedFile] = useState<string | null>(null);
  const [editorFontSize, setEditorFontSize] = useState(14);

  // Auth & modals
  const [user, setUser] = useState<UserInfo>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showDonation, setShowDonation] = useState(false);
  const [showSubscription, setShowSubscription] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Auto-save timer
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const language = useMemo(() => {
    if (activeFile.endsWith(".tsx") || activeFile.endsWith(".ts")) return "typescript";
    if (activeFile.endsWith(".py")) return "python";
    if (activeFile.endsWith(".rs")) return "rust";
    if (activeFile.endsWith(".java")) return "java";
    if (activeFile.endsWith(".css")) return "css";
    if (activeFile.endsWith(".html")) return "html";
    if (activeFile.endsWith(".cpp")) return "cpp";
    if (activeFile.endsWith(".c")) return "c";
    if (activeFile.endsWith(".json")) return "json";
    if (activeFile.endsWith(".md")) return "markdown";
    return "javascript";
  }, [activeFile]);

  const languageLabel = useMemo(() => getLanguageLabel(activeFile), [activeFile]);

  function showToast(msg: string, duration = 2000) {
    setToast(msg);
    setTimeout(() => setToast(null), duration);
  }

  // Boot: check token, load settings, connect backend
  useEffect(() => {
    const savedKey = window.localStorage.getItem("novaforge_gemini_key") || "";
    if (savedKey) { setApiKey(savedKey); setProvider("auto"); }

    // Load local settings
    try {
      const s = JSON.parse(window.localStorage.getItem("novaforge_settings") || "{}");
      if (s.editor_font_size) setEditorFontSize(s.editor_font_size);
    } catch {}

    // Check existing auth
    if (getAuthToken()) {
      apiFetch("/api/auth/me").then((r) => r.json()).then((data) => {
        if (data.user) setUser(data.user);
        else clearAuthToken();
      }).catch(() => {});
    }

    async function boot() {
      try {
        await fetch(`${API_URL}/api/health`);
        await refreshWorkspace();
        await refreshSandboxStatus();
        setStatus("Backend connected");
      } catch {
        setStatus("Frontend running; backend offline");
      }
    }
    boot();
  }, []);

  useEffect(() => {
    if (apiKey) window.localStorage.setItem("novaforge_gemini_key", apiKey);
  }, [apiKey]);

  // Global keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        saveActiveFile();
        showToast("File saved");
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFile, files]);

  async function refreshWorkspace() {
    try {
      const treeResponse = await fetch(`${API_URL}/api/workspace/tree?workspaceId=demo-js`);
      const treeData = (await treeResponse.json()) as { entries: WorkspaceEntry[] };
      setEntries(treeData.entries);
      const fileEntries = treeData.entries.filter((e) => e.type === "file");
      const nextFiles: FileMap = {};

      for (const entry of fileEntries.slice(0, 24)) {
        const r = await fetch(`${API_URL}/api/workspace/file?workspaceId=demo-js&path=${encodeURIComponent(entry.path)}`);
        if (r.ok) {
          const data = (await r.json()) as { content: string };
          nextFiles[entry.path] = data.content;
        }
      }

      if (Object.keys(nextFiles).length > 0) {
        setFiles(nextFiles);
        setActiveFile((c) => nextFiles[c] ? c : Object.keys(nextFiles)[0]);
      }
    } catch {}
  }

  async function refreshSandboxStatus() {
    try {
      const r = await fetch(`${API_URL}/api/sandbox/status`);
      if (!r.ok) return;
      const data = (await r.json()) as { images: Array<{ image: string; present: boolean; reason?: string }> };
      setSandboxStatus(data.images);
    } catch {}
  }

  const saveActiveFile = useCallback(async () => {
    try {
      await fetch(`${API_URL}/api/workspace/file`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId: "demo-js", path: activeFile, content: files[activeFile] || "" })
      });
    } catch {}
  }, [activeFile, files]);

  async function createFile() {
    const path = newFilePath.trim();
    if (!path) return;
    const content = starterContentFor(path);
    try {
      await fetch(`${API_URL}/api/workspace/file`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId: "demo-js", path, content })
      });
    } catch {}
    setFiles((c) => ({ ...c, [path]: content }));
    setActiveFile(path);
    await refreshWorkspace();
    showToast(`Created ${path}`);
  }

  async function createFolder() {
    const path = newFolderPath.trim();
    if (!path) return;
    try {
      await fetch(`${API_URL}/api/workspace/folder`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId: "demo-js", path })
      });
    } catch {}
    await refreshWorkspace();
    showToast(`Created folder ${path}`);
  }

  async function deleteActiveFile() {
    try {
      await fetch(`${API_URL}/api/workspace/entry`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId: "demo-js", path: activeFile })
      });
    } catch {}
    await refreshWorkspace();
    showToast(`Deleted ${activeFile}`);
  }

  async function runActiveFile() {
    setStatus(`Running ${activeFile}...`);
    setRunOutput("Starting sandbox...");
    await saveActiveFile();

    const spec = commandFor(activeFile);
    try {
      const r = await fetch(`${API_URL}/api/sandbox/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId: "demo-js", language: spec.language, command: spec.command })
      });
      const data = (await r.json()) as { ok: boolean; output: string };
      setRunOutput(data.output || (data.ok ? "Done." : "Failed."));
      setStatus(data.ok ? "Run completed" : "Run failed");
    } catch {
      setRunOutput("Backend offline.");
      setStatus("Backend offline");
    }
  }

  async function runSmokeTest() {
    setStatus("Running smoke test...");
    try {
      const r = await fetch(`${API_URL}/api/smoke`, { method: "POST" });
      const data = await r.json();
      setStatus(data.ok ? "Smoke test passed" : data.message || "Smoke test completed");
    } catch {
      setStatus("Backend offline for smoke test");
    }
  }

  function updateFile(value: string | undefined) {
    setFiles((c) => ({ ...c, [activeFile]: value || "" }));
    // Auto-save debounce
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveActiveFile(), 2000);
  }

  function handleLogout() {
    clearAuthToken();
    setUser(null);
    showToast("Logged out");
  }

  const fileEntries = entries.filter((e) => e.type === "file");
  const folderEntries = entries.filter((e) => e.type === "folder");

  return (
    <main className="scanline flex h-screen flex-col overflow-hidden bg-void p-2 text-slate-100 md:p-3">
      <div className="mx-auto flex h-full max-w-[1920px] flex-col gap-2">
        {/* Header */}
        <header className="glass flex flex-col gap-3 rounded-lg px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-md border border-cyanForge/40 bg-cyanForge/10 shadow-neon">
              <Sparkles className="h-5 w-5 text-cyanForge" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-wide text-white md:text-2xl">NovaForge</h1>
              <p className="text-xs text-slate-400">{status}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {(["Home", "File", "View", "Run"] as ToolTab[]).map((item) => (
              <button key={item} onClick={() => setActiveTab(item)}
                className={`rounded border px-3 py-1.5 transition ${
                  activeTab === item ? "border-cyanForge/60 bg-cyanForge/15 text-cyanForge" : "border-slate-700 bg-slate-900/70 text-slate-300 hover:border-slate-500"
                }`}
              >
                {item}
              </button>
            ))}
            <span className="rounded border border-cyanForge/30 bg-cyanForge/10 px-2 py-1 text-cyanForge">{languageLabel}</span>

            {/* Auth / User */}
            {user ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900/70 px-2 py-1 text-slate-300">
                  <User className="h-3 w-3" /> {user.username}
                </span>
                {user.plan === "pro" || user.role === "admin" ? (
                  <span className="inline-flex items-center gap-1 rounded bg-amberForge/15 px-2 py-1 text-amberForge">
                    <Crown className="h-3 w-3" /> {user.role === "admin" ? "Admin" : "PRO"}
                  </span>
                ) : (
                  <button onClick={() => setShowSubscription(true)} className="rounded bg-amberForge/15 px-2 py-1 text-amberForge hover:bg-amberForge/25">Upgrade</button>
                )}
                <button onClick={handleLogout} className="rounded border border-slate-700 p-1.5 text-slate-400 hover:text-white" title="Logout">
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button onClick={() => setShowAuth(true)} className="inline-flex items-center gap-1.5 rounded border border-cyanForge/40 bg-cyanForge/10 px-3 py-1.5 text-cyanForge hover:bg-cyanForge/20">
                <LogIn className="h-3.5 w-3.5" /> Login
              </button>
            )}
            <button onClick={() => setShowSettings(true)} className="rounded border border-slate-700 p-1.5 text-slate-400 hover:text-white" title="Settings">
              <Settings className="h-3.5 w-3.5" />
            </button>
          </div>
        </header>

        {/* Main Layout */}
        <section className="grid flex-1 gap-2 overflow-hidden xl:grid-cols-[260px_minmax(0,1fr)_360px]">
          {/* Sidebar */}
          <aside className="glass thin-scrollbar flex flex-col overflow-y-auto rounded-lg p-3">
            <PanelTitle icon={<Files className="h-4 w-4" />} title={`${activeTab} Explorer`} />

            <ToolPane
              activeTab={activeTab}
              newFilePath={newFilePath} newFolderPath={newFolderPath}
              setNewFilePath={setNewFilePath} setNewFolderPath={setNewFolderPath}
              createFile={createFile} createFolder={createFolder}
              deleteActiveFile={deleteActiveFile} saveActiveFile={saveActiveFile}
              refreshWorkspace={refreshWorkspace}
              setShowAgent={setShowAgent} setShowPreview={setShowPreview}
              showAgent={showAgent} showPreview={showPreview}
              runActiveFile={runActiveFile} runOutput={runOutput}
              sandboxStatus={sandboxStatus}
            />

            {/* File Tree */}
            <div className="mt-3 space-y-1">
              {folderEntries.slice(0, 5).map((f) => (
                <div key={f.path} className="rounded-md border border-slate-800 bg-slate-950/30 px-2 py-1 text-xs text-slate-500">/ {f.path}</div>
              ))}
              {(showAllFiles ? fileEntries : fileEntries.slice(0, 8)).map((entry) => (
                <button key={entry.path}
                  className={`flex w-full items-center justify-between rounded-md border px-3 py-1.5 text-left text-sm transition ${
                    activeFile === entry.path
                      ? "border-cyanForge/60 bg-cyanForge/12 text-white"
                      : highlightedFile === entry.path
                      ? "border-violetForge/60 bg-violetForge/10 text-violetForge animate-pulse"
                      : "border-slate-800 bg-slate-950/50 text-slate-400 hover:border-slate-600"
                  }`}
                  onClick={() => setActiveFile(entry.path)}
                >
                  <span className="truncate">{entry.path}</span>
                  <span className="ml-1 shrink-0 text-[10px] text-slate-500">{getLanguageLabel(entry.path)}</span>
                </button>
              ))}
              {fileEntries.length > 8 && (
                <button onClick={() => setShowAllFiles(!showAllFiles)}
                  className="w-full rounded-md border border-slate-800 px-3 py-1 text-center text-xs text-slate-500 hover:text-slate-300">
                  {showAllFiles ? "Show less" : `+${fileEntries.length - 8} more files`}
                </button>
              )}
            </div>

            {/* BYO Key */}
            <div className="mt-4 rounded-md border border-slate-800 bg-slate-950/50 p-3">
              <PanelTitle icon={<KeyRound className="h-4 w-4" />} title="Bring Your Own Key" />
              <select value={provider} onChange={(e) => setProvider(e.target.value)}
                className="mt-3 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100">
                <option value="auto">Auto: Gemini → Ollama</option>
                <option value="gemini">Gemini</option>
                <option value="ollama">Ollama local</option>
                <option value="openrouter">OpenRouter</option>
                <option value="deepseek">DeepSeek</option>
                <option value="groq">Groq</option>
                <option value="together">Together AI</option>
              </select>
              <input value={apiKey} onChange={(e) => { setApiKey(e.target.value); if (e.target.value.trim()) setProvider("auto"); }}
                placeholder="Paste API key" type="password"
                className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
              <a href={geminiStudioUrl} target="_blank" rel="noreferrer"
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-md border border-amberForge/40 bg-amberForge/10 px-3 py-2 text-sm text-amberForge hover:bg-amberForge/15">
                Gemini AI Studio <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>

            {/* Action Buttons */}
            <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
              <ActionButton icon={<Heart className="h-4 w-4" />} label="Donate" onClick={() => setShowDonation(true)} accent />
              <ActionButton icon={<Crown className="h-4 w-4" />} label="PRO" onClick={() => setShowSubscription(true)} />
              <ActionButton icon={<Info className="h-4 w-4" />} label="About" onClick={() => showToast("NovaForge IDE v1.0 – Free & Open Source")} />
              <ActionButton icon={<Settings className="h-4 w-4" />} label="Settings" onClick={() => setShowSettings(true)} />
            </div>
          </aside>

          {/* Editor + Terminal */}
          <section className="flex flex-col gap-2 overflow-hidden">
            <div className="glass flex flex-1 flex-col overflow-hidden rounded-lg">
              <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
                <div className="flex items-center gap-2">
                  <PanelTitle icon={<Boxes className="h-4 w-4" />} title={activeFile} />
                  <span className="rounded bg-cyanForge/15 px-2 py-0.5 text-xs text-cyanForge">{languageLabel}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { saveActiveFile(); showToast("Saved"); }}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:border-cyanForge/50 hover:text-cyanForge">
                    <Save className="h-3.5 w-3.5" /> Save
                  </button>
                  <button onClick={runSmokeTest}
                    className="inline-flex items-center gap-1.5 rounded-md border border-mintForge/40 bg-mintForge/10 px-2.5 py-1.5 text-xs text-mintForge">
                    <Bug className="h-3.5 w-3.5" /> Smoke
                  </button>
                  <button onClick={runActiveFile}
                    className="inline-flex items-center gap-1.5 rounded-md border border-cyanForge/40 bg-cyanForge/10 px-2.5 py-1.5 text-xs text-cyanForge">
                    <Play className="h-3.5 w-3.5" /> Run
                  </button>
                </div>
              </div>
              <EditorPane language={language} value={files[activeFile]} onChange={updateFile} fontSize={editorFontSize} onSave={() => { saveActiveFile(); showToast("Saved"); }} />
            </div>
            <div className="flex h-[200px] min-h-[150px] shrink-0 gap-2">
              <div className="flex-1"><TerminalPanel /></div>
              <div className="glass thin-scrollbar w-[260px] overflow-auto rounded-lg p-3">
                <PanelTitle icon={<Play className="h-4 w-4" />} title="Output" />
                <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-300">{runOutput}</pre>
              </div>
            </div>
          </section>

          {/* Right Panel: Agent + Preview */}
          <section className="flex flex-col gap-2 overflow-hidden">
            {showAgent && <AgentPanel provider={provider} apiKey={apiKey} files={files} onStatus={setStatus} onHighlightFile={setHighlightedFile} onFilesCreated={refreshWorkspace} onOpenFile={(path) => { if (files[path] !== undefined) setActiveFile(path); else refreshWorkspace().then(() => setActiveFile(path)); }} onPreviewUrl={(url) => { setPreviewUrl(url); setShowPreview(true); }} />}

            {showPreview && (
              <div className="glass flex flex-col overflow-hidden rounded-lg">
                <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
                  <PanelTitle icon={<Rocket className="h-4 w-4" />} title="Live Preview" />
                  <input value={previewUrl} onChange={(e) => setPreviewUrl(e.target.value)}
                    placeholder="Enter URL to preview..."
                    className="w-52 rounded border border-slate-800 bg-slate-950 px-2 py-1 text-xs text-slate-300" />
                </div>
                {previewUrl ? (
                  <iframe title="NovaForge preview" src={previewUrl} className="h-full min-h-[170px] w-full bg-white" sandbox="allow-scripts allow-same-origin" />
                ) : (
                  <div className="flex h-[170px] items-center justify-center text-xs text-slate-500">
                    Enter a URL above to preview
                  </div>
                )}
              </div>
            )}
          </section>
        </section>

        {/* Status Bar */}
        <div className="flex shrink-0 items-center justify-between rounded-md border border-slate-800/50 bg-panel px-3 py-1 text-xs text-slate-400">
          <div className="flex items-center gap-3">
            <span>{status}</span>
            {user && <span className="text-slate-600">|</span>}
            {user && <span className="text-cyanForge">{user.username} ({user.plan})</span>}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-cyanForge">{languageLabel}</span>
            <span>UTF-8</span>
            <span>Spaces: 2</span>
            <button onClick={() => setShowDonation(true)} className="inline-flex items-center gap-1 text-amberForge hover:text-amberForge/80">
              <Coffee className="h-3 w-3" /> Donate
            </button>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-16 left-1/2 z-50 -translate-x-1/2 animate-bounce rounded-lg border border-cyanForge/40 bg-slate-900/95 px-4 py-2 text-sm text-cyanForge shadow-lg backdrop-blur">
          {toast}
        </div>
      )}

      {/* Modals */}
      <AuthModal open={showAuth} onClose={() => setShowAuth(false)} onAuth={(u) => { setUser(u); showToast(`Welcome, ${u.username}!`); }} />
      <DonationModal open={showDonation} onClose={() => setShowDonation(false)} />
      <SubscriptionModal open={showSubscription} onClose={() => setShowSubscription(false)} currentPlan={user?.plan || "free"} onUpgrade={() => setUser((u) => u ? { ...u, plan: "pro" } : u)} />
      <SettingsModal open={showSettings} onClose={() => setShowSettings(false)} onSettingsChange={(s) => {
        if (s.editor_font_size) setEditorFontSize(s.editor_font_size);
      }} />
    </main>
  );
}

/* ─── Sub-components ─── */

function ToolPane({
  activeTab, newFilePath, newFolderPath, setNewFilePath, setNewFolderPath,
  createFile, createFolder, deleteActiveFile, saveActiveFile, refreshWorkspace,
  setShowAgent, setShowPreview, showAgent, showPreview, runActiveFile, runOutput, sandboxStatus
}: {
  activeTab: ToolTab; newFilePath: string; newFolderPath: string;
  setNewFilePath: (v: string) => void; setNewFolderPath: (v: string) => void;
  createFile: () => void; createFolder: () => void; deleteActiveFile: () => void;
  saveActiveFile: () => Promise<void>; refreshWorkspace: () => Promise<void>;
  setShowAgent: (v: boolean) => void; setShowPreview: (v: boolean) => void;
  showAgent: boolean; showPreview: boolean;
  runActiveFile: () => void; runOutput: string;
  sandboxStatus: Array<{ image: string; present: boolean; reason?: string }>;
}) {
  if (activeTab === "Home") {
    return (
      <div className="mt-3 rounded-md border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-400">
        <div className="flex items-center gap-2 text-slate-100"><Home className="h-4 w-4 text-cyanForge" /> NovaForge IDE</div>
        <p className="mt-2">Create files, run code in Docker sandboxes, and use AI models with your own API key.</p>
        <p className="mt-1 text-slate-500">Ctrl+S to save · Ctrl+Enter to run</p>
      </div>
    );
  }

  if (activeTab === "File") {
    return (
      <div className="mt-3 space-y-3 rounded-md border border-slate-800 bg-slate-950/50 p-3">
        <div className="space-y-2">
          <input value={newFilePath} onChange={(e) => setNewFilePath(e.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-100" />
          <button onClick={createFile} className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-cyanForge/40 px-3 py-2 text-xs text-cyanForge">
            <FilePlus2 className="h-4 w-4" /> New File
          </button>
        </div>
        <div className="space-y-2">
          <input value={newFolderPath} onChange={(e) => setNewFolderPath(e.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-slate-100" />
          <button onClick={createFolder} className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-mintForge/40 px-3 py-2 text-xs text-mintForge">
            <FolderPlus className="h-4 w-4" /> New Folder
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={saveActiveFile} className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-700 px-2 py-2 text-xs text-slate-300">
            <Save className="h-4 w-4" /> Save
          </button>
          <button onClick={deleteActiveFile} className="inline-flex items-center justify-center gap-2 rounded-md border border-red-400/40 px-2 py-2 text-xs text-red-300">
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        </div>
        <button onClick={refreshWorkspace} className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-slate-700 px-2 py-2 text-xs text-slate-300">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>
    );
  }

  if (activeTab === "View") {
    return (
      <div className="mt-3 space-y-2 rounded-md border border-slate-800 bg-slate-950/50 p-3">
        <button onClick={() => setShowAgent(!showAgent)} className="inline-flex w-full items-center justify-between rounded-md border border-slate-700 px-3 py-2 text-xs text-slate-300">
          <span className="inline-flex items-center gap-2"><Eye className="h-4 w-4" /> Agent Panel</span>
          <span className={showAgent ? "text-mintForge" : "text-slate-500"}>{showAgent ? "On" : "Off"}</span>
        </button>
        <button onClick={() => setShowPreview(!showPreview)} className="inline-flex w-full items-center justify-between rounded-md border border-slate-700 px-3 py-2 text-xs text-slate-300">
          <span className="inline-flex items-center gap-2"><Eye className="h-4 w-4" /> Preview Panel</span>
          <span className={showPreview ? "text-mintForge" : "text-slate-500"}>{showPreview ? "On" : "Off"}</span>
        </button>
      </div>
    );
  }

  // Run tab
  return (
    <div className="mt-3 space-y-3 rounded-md border border-slate-800 bg-slate-950/50 p-3">
      <button onClick={runActiveFile} className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-cyanForge px-3 py-2 text-xs font-semibold text-slate-950">
        <Play className="h-4 w-4" /> Run Current File
      </button>
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-xs text-slate-100"><HardDrive className="h-4 w-4 text-cyanForge" /> Compiler Images</div>
        {sandboxStatus.map((item) => (
          <div key={item.image} className="flex items-center justify-between text-xs text-slate-400">
            <span>{item.image}</span>
            {item.present ? <CheckCircle2 className="h-3.5 w-3.5 text-mintForge" /> : <AlertTriangle className="h-3.5 w-3.5 text-amberForge" />}
          </div>
        ))}
      </div>
      <pre className="max-h-24 overflow-auto whitespace-pre-wrap text-xs text-slate-500">{runOutput}</pre>
    </div>
  );
}

function PanelTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 text-sm font-medium text-slate-100">
      <span className="text-cyanForge">{icon}</span>
      <span className="truncate">{title}</span>
    </div>
  );
}

function ActionButton({ icon, label, onClick, accent }: { icon: React.ReactNode; label: string; onClick?: () => void; accent?: boolean }) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-md border px-2 py-2 text-xs transition hover:border-cyanForge/50 hover:text-cyanForge ${
        accent ? "border-pink-500/40 bg-pink-500/10 text-pink-400" : "border-slate-700 bg-slate-950/60 text-slate-300"
      }`}>
      {icon}
      {label}
    </button>
  );
}

/* ─── Helpers ─── */

function commandFor(file: string) {
  if (file.endsWith(".ts") || file.endsWith(".tsx")) return { language: "typescript", command: `node -e "console.log('TypeScript saved. Run build from terminal.')" ` };
  if (file.endsWith(".py")) return { language: "python", command: `python ${quote(file)}` };
  if (file.endsWith(".c")) return { language: "c", command: `gcc ${quote(file)} -o main && ./main` };
  if (file.endsWith(".cpp")) return { language: "cpp", command: `g++ ${quote(file)} -o main && ./main` };
  if (file.endsWith(".java")) return { language: "java", command: `javac ${quote(file)} && java -cp ${quote(dirname(file) || ".")} ${basename(file).replace(".java", "")}` };
  if (file.endsWith(".rs")) return { language: "rust", command: `rustc ${quote(file)} -o main && ./main` };
  if (file.endsWith(".html")) return { language: "html", command: `node -e "console.log('HTML ready for preview')" ` };
  if (file.endsWith(".css")) return { language: "css", command: `node -e "console.log('CSS saved')" ` };
  return { language: "javascript", command: `node ${quote(file)}` };
}

function starterContentFor(file: string) {
  if (file.endsWith(".py")) return "print('Hello from NovaForge')\n";
  if (file.endsWith(".c")) return '#include <stdio.h>\n\nint main(void) {\n  printf("Hello from NovaForge C\\n");\n  return 0;\n}\n';
  if (file.endsWith(".cpp")) return '#include <iostream>\n\nint main() {\n  std::cout << "Hello from NovaForge C++" << std::endl;\n  return 0;\n}\n';
  if (file.endsWith(".java")) return 'public class Main {\n  public static void main(String[] args) {\n    System.out.println("Hello from NovaForge Java");\n  }\n}\n';
  if (file.endsWith(".rs")) return 'fn main() {\n    println!("Hello from NovaForge Rust");\n}\n';
  if (file.endsWith(".html")) return "<!doctype html>\n<html><body><h1>Hello from NovaForge</h1></body></html>\n";
  if (file.endsWith(".css")) return "body {\n  font-family: system-ui, sans-serif;\n}\n";
  return "console.log('Hello from NovaForge');\n";
}

function quote(v: string) { return `'${v.replaceAll("'", "'\\''")}'`; }
function dirname(f: string) { return f.split("/").slice(0, -1).join("/"); }
function basename(f: string) { return f.split("/").pop() || f; }

function getLanguageLabel(file: string): string {
  if (file.endsWith(".c")) return "C";
  if (file.endsWith(".cpp") || file.endsWith(".cc") || file.endsWith(".cxx")) return "C++";
  if (file.endsWith(".py")) return "Python";
  if (file.endsWith(".ts") || file.endsWith(".tsx")) return "TypeScript";
  if (file.endsWith(".js") || file.endsWith(".jsx")) return "JavaScript";
  if (file.endsWith(".java")) return "Java";
  if (file.endsWith(".rs")) return "Rust";
  if (file.endsWith(".html")) return "HTML";
  if (file.endsWith(".css")) return "CSS";
  if (file.endsWith(".json")) return "JSON";
  if (file.endsWith(".md")) return "Markdown";
  return "Text";
}
