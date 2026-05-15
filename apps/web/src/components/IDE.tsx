"use client";

import {
  AlertTriangle,
  Boxes,
  Bug,
  CheckCircle2,
  Coffee,
  Copy,
  ExternalLink,
  Eye,
  FilePlus2,
  Files,
  FolderPlus,
  GitFork,
  Github,
  HardDrive,
  Home,
  KeyRound,
  Play,
  RefreshCw,
  Rocket,
  Save,
  Share2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AgentPanel } from "@/components/agent-panel";
import { EditorPane } from "@/components/editor-pane";
import { TerminalPanel } from "@/components/terminal-panel";
import { API_URL, demoFiles, geminiStudioUrl } from "@/lib/config";

type FileMap = Record<string, string>;
type WorkspaceEntry = { path: string; type: "file" | "folder" };
type ToolTab = "Home" | "File" | "View" | "Run";

const languages = ["TypeScript", "Python", "C", "C++", "Java", "Rust", "HTML", "CSS", "JavaScript"];

export default function IDE() {
  const [files, setFiles] = useState<FileMap>(demoFiles);
  const [activeFile, setActiveFile] = useState("app/page.tsx");
  const [entries, setEntries] = useState<WorkspaceEntry[]>([]);
  const [activeTab, setActiveTab] = useState<ToolTab>("Home");
  const [provider, setProvider] = useState("auto");
  const [apiKey, setApiKey] = useState("");
  const [newFilePath, setNewFilePath] = useState("src/index.js");
  const [newFolderPath, setNewFolderPath] = useState("src");
  const [previewUrl, setPreviewUrl] = useState("http://localhost:3000");
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [status, setStatus] = useState("Local-first mode ready");
  const [runOutput, setRunOutput] = useState("Run output will appear here.");
  const [sandboxStatus, setSandboxStatus] = useState<Array<{ image: string; present: boolean; reason?: string }>>([]);
  const [showPreview, setShowPreview] = useState(true);
  const [showAgent, setShowAgent] = useState(true);
  const [showAllFiles, setShowAllFiles] = useState(false);
  const [highlightedFile, setHighlightedFile] = useState<string | null>(null);

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

  useEffect(() => {
    const savedKey = window.localStorage.getItem("novaforge_gemini_key") || "";
    if (savedKey) {
      setApiKey(savedKey);
      setProvider("auto");
    }

    async function boot() {
      try {
        await fetch(`${API_URL}/api/projects`);
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
    if (apiKey) {
      window.localStorage.setItem("novaforge_gemini_key", apiKey);
    }
  }, [apiKey]);

  async function runSmokeTest() {
    setStatus("Running smoke test...");
    try {
      const response = await fetch(`${API_URL}/api/smoke`, { method: "POST" });
      const data = await response.json();
      setStatus(data.ok ? "Smoke test passed" : data.message || "Smoke test completed");
    } catch {
      setStatus("Smoke test needs the Node API on port 8787");
    }
  }

  async function refreshWorkspace() {
    const treeResponse = await fetch(`${API_URL}/api/workspace/tree?workspaceId=demo-js`);
    const treeData = (await treeResponse.json()) as { entries: WorkspaceEntry[] };
    setEntries(treeData.entries);
    const fileEntries = treeData.entries.filter((entry) => entry.type === "file");
    const nextFiles: FileMap = {};

    for (const entry of fileEntries.slice(0, 24)) {
      const fileResponse = await fetch(`${API_URL}/api/workspace/file?workspaceId=demo-js&path=${encodeURIComponent(entry.path)}`);
      if (fileResponse.ok) {
        const data = (await fileResponse.json()) as { content: string };
        nextFiles[entry.path] = data.content;
      }
    }

    if (Object.keys(nextFiles).length > 0) {
      setFiles(nextFiles);
      setActiveFile((current) => nextFiles[current] ? current : Object.keys(nextFiles)[0]);
    }
  }

  async function refreshSandboxStatus() {
    const response = await fetch(`${API_URL}/api/sandbox/status`);
    if (!response.ok) return;
    const data = (await response.json()) as { images: Array<{ image: string; present: boolean; reason?: string }> };
    setSandboxStatus(data.images);
  }

  async function saveActiveFile() {
    await fetch(`${API_URL}/api/workspace/file`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceId: "demo-js", path: activeFile, content: files[activeFile] || "" })
    });
  }

  async function createFile() {
    const path = newFilePath.trim();
    if (!path) return;
    const content = starterContentFor(path);
    await fetch(`${API_URL}/api/workspace/file`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceId: "demo-js", path, content })
    });
    setFiles((current) => ({ ...current, [path]: content }));
    setActiveFile(path);
    await refreshWorkspace();
    setStatus(`Created ${path}`);
  }

  async function createFolder() {
    const path = newFolderPath.trim();
    if (!path) return;
    await fetch(`${API_URL}/api/workspace/folder`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceId: "demo-js", path })
    });
    await refreshWorkspace();
    setStatus(`Created folder ${path}`);
  }

  async function deleteActiveFile() {
    await fetch(`${API_URL}/api/workspace/entry`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceId: "demo-js", path: activeFile })
    });
    await refreshWorkspace();
    setStatus(`Deleted ${activeFile}`);
  }

  async function runActiveFile() {
    setStatus(`Running ${activeFile} in Docker...`);
    setRunOutput("Starting sandbox...");
    await saveActiveFile();

    const runSpec = commandFor(activeFile);
    const response = await fetch(`${API_URL}/api/sandbox/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workspaceId: "demo-js",
        language: runSpec.language,
        command: runSpec.command
      })
    });
    const data = (await response.json()) as { ok: boolean; output: string };
    setRunOutput(data.output || (data.ok ? "Command completed." : "Command failed without output."));
    setStatus(data.ok ? "Run completed" : "Run failed");
    await refreshSandboxStatus();
  }

  async function joinWaitlist() {
    if (!waitlistEmail.includes("@")) {
      setStatus("Enter a valid email for the PRO waitlist");
      return;
    }
    const response = await fetch(`${API_URL}/api/waitlist`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: waitlistEmail })
    });
    setStatus(response.ok ? "Waitlist saved locally" : "Waitlist API unavailable");
  }

  function updateFile(value: string | undefined) {
    setFiles((current) => ({
      ...current,
      [activeFile]: value || ""
    }));
  }

  const fileEntries = entries.filter((entry) => entry.type === "file");
  const folderEntries = entries.filter((entry) => entry.type === "folder");

  return (
    <main className="scanline flex h-screen flex-col overflow-hidden bg-void p-2 text-slate-100 md:p-3">
      <div className="mx-auto flex h-full max-w-[1920px] flex-col gap-2">
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
              <button
                key={item}
                onClick={() => setActiveTab(item)}
                className={`rounded border px-3 py-1.5 ${
                  activeTab === item ? "border-cyanForge/60 bg-cyanForge/15 text-cyanForge" : "border-slate-700 bg-slate-900/70 text-slate-300"
                }`}
              >
                {item}
              </button>
            ))}
            <span className="rounded border border-cyanForge/30 bg-cyanForge/10 px-2 py-1 text-cyanForge">{languageLabel}</span>
          </div>
        </header>

        <section className="grid flex-1 gap-2 overflow-hidden xl:grid-cols-[260px_minmax(0,1fr)_360px]">
          <aside className="glass thin-scrollbar flex flex-col overflow-y-auto rounded-lg p-3">
            <PanelTitle icon={<Files className="h-4 w-4" />} title={`${activeTab} Explorer`} />
            <ToolPane
              activeTab={activeTab}
              newFilePath={newFilePath}
              newFolderPath={newFolderPath}
              setNewFilePath={setNewFilePath}
              setNewFolderPath={setNewFolderPath}
              createFile={createFile}
              createFolder={createFolder}
              deleteActiveFile={deleteActiveFile}
              saveActiveFile={saveActiveFile}
              refreshWorkspace={refreshWorkspace}
              setShowAgent={setShowAgent}
              setShowPreview={setShowPreview}
              showAgent={showAgent}
              showPreview={showPreview}
              runActiveFile={runActiveFile}
              runOutput={runOutput}
              sandboxStatus={sandboxStatus}
            />
            <div className="mt-3 space-y-1">
              {folderEntries.slice(0, 5).map((folder) => (
                <div key={folder.path} className="rounded-md border border-slate-800 bg-slate-950/30 px-2 py-1 text-xs text-slate-500">
                  / {folder.path}
                </div>
              ))}
              {(showAllFiles ? fileEntries : fileEntries.slice(0, 6)).map((entry) => (
                <button
                  key={entry.path}
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
              {fileEntries.length > 6 && (
                <button
                  onClick={() => setShowAllFiles(!showAllFiles)}
                  className="w-full rounded-md border border-slate-800 px-3 py-1 text-center text-xs text-slate-500 hover:text-slate-300"
                >
                  {showAllFiles ? "Show less" : `+${fileEntries.length - 6} more files`}
                </button>
              )}
            </div>

            <div className="mt-4 rounded-md border border-slate-800 bg-slate-950/50 p-3">
              <PanelTitle icon={<KeyRound className="h-4 w-4" />} title="Bring Your Own Key" />
              <select
                value={provider}
                onChange={(event) => setProvider(event.target.value)}
                className="mt-3 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              >
                <option value="auto">Auto: Gemini key, else Ollama</option>
                <option value="gemini">Gemini BYO key</option>
                <option value="ollama">Ollama local</option>
                <option value="openrouter">OpenRouter BYO key</option>
                <option value="deepseek">DeepSeek compatible</option>
                <option value="qwen">Qwen coder local/API</option>
              </select>
              <input
                value={apiKey}
                onChange={(event) => {
                  setApiKey(event.target.value);
                  if (event.target.value.trim()) setProvider("auto");
                }}
                placeholder="Paste key for this browser session only"
                type="password"
                className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              />
              <a
                href={geminiStudioUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-md border border-amberForge/40 bg-amberForge/10 px-3 py-2 text-sm text-amberForge transition hover:bg-amberForge/15"
              >
                Gemini AI Studio <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>

            <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
              <ActionButton icon={<Share2 className="h-4 w-4" />} label="Share" />
              <ActionButton icon={<GitFork className="h-4 w-4" />} label="Fork" />
              <ActionButton icon={<Copy className="h-4 w-4" />} label="Clone" />
              <ActionButton icon={<Github className="h-4 w-4" />} label="Sponsors" />
            </div>
          </aside>

          <section className="flex flex-col gap-2 overflow-hidden">
            <div className="glass flex flex-1 flex-col overflow-hidden rounded-lg">
              <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
                <div className="flex items-center gap-2">
                  <PanelTitle icon={<Boxes className="h-4 w-4" />} title={activeFile} />
                  <span className="rounded bg-cyanForge/15 px-2 py-0.5 text-xs text-cyanForge">{languageLabel}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={runSmokeTest}
                    className="inline-flex items-center gap-2 rounded-md border border-mintForge/40 bg-mintForge/10 px-3 py-1.5 text-xs text-mintForge"
                  >
                    <Bug className="h-3.5 w-3.5" /> Smoke
                  </button>
                  <button
                    onClick={runActiveFile}
                    className="inline-flex items-center gap-2 rounded-md border border-cyanForge/40 bg-cyanForge/10 px-3 py-1.5 text-xs text-cyanForge"
                  >
                    <Play className="h-3.5 w-3.5" /> Run
                  </button>
                </div>
              </div>
              <EditorPane
                language={language}
                value={files[activeFile]}
                onChange={updateFile}
              />
            </div>
            <div className="flex h-[200px] min-h-[150px] shrink-0 gap-2">
              <div className="flex-1"><TerminalPanel /></div>
              <div className="glass thin-scrollbar w-[260px] overflow-auto rounded-lg p-3">
                <PanelTitle icon={<Play className="h-4 w-4" />} title="Output" />
                <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-300">{runOutput}</pre>
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-2 overflow-hidden">
            {showAgent ? <AgentPanel provider={provider} apiKey={apiKey} files={files} onStatus={setStatus} onHighlightFile={setHighlightedFile} /> : null}

            {showPreview ? <div className="glass flex flex-col overflow-hidden rounded-lg">
              <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
                <PanelTitle icon={<Rocket className="h-4 w-4" />} title="Live Preview" />
                <input
                  value={previewUrl}
                  onChange={(event) => setPreviewUrl(event.target.value)}
                  className="w-52 rounded border border-slate-800 bg-slate-950 px-2 py-1 text-xs text-slate-300"
                />
              </div>
              <iframe title="NovaForge preview" src={previewUrl} className="h-full min-h-[170px] w-full bg-white" />
            </div> : null}
          </section>
        </section>

        <div className="flex shrink-0 items-center justify-between rounded-md border border-slate-800/50 bg-panel px-3 py-1 text-xs text-slate-400">
          <div className="flex items-center gap-3">
            <span>{status}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-cyanForge">{languageLabel}</span>
            <span>UTF-8</span>
            <span>Spaces: 2</span>
            <a
              href="https://www.buymeacoffee.com/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-amberForge hover:text-amberForge/80"
            >
              <Coffee className="h-3 w-3" /> Donate
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}

function ToolPane({
  activeTab,
  newFilePath,
  newFolderPath,
  setNewFilePath,
  setNewFolderPath,
  createFile,
  createFolder,
  deleteActiveFile,
  saveActiveFile,
  refreshWorkspace,
  setShowAgent,
  setShowPreview,
  showAgent,
  showPreview,
  runActiveFile,
  runOutput,
  sandboxStatus
}: {
  activeTab: ToolTab;
  newFilePath: string;
  newFolderPath: string;
  setNewFilePath: (value: string) => void;
  setNewFolderPath: (value: string) => void;
  createFile: () => void;
  createFolder: () => void;
  deleteActiveFile: () => void;
  saveActiveFile: () => Promise<void>;
  refreshWorkspace: () => Promise<void>;
  setShowAgent: (value: boolean) => void;
  setShowPreview: (value: boolean) => void;
  showAgent: boolean;
  showPreview: boolean;
  runActiveFile: () => void;
  runOutput: string;
  sandboxStatus: Array<{ image: string; present: boolean; reason?: string }>;
}) {
  if (activeTab === "Home") {
    return (
      <div className="mt-3 rounded-md border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-400">
        <div className="flex items-center gap-2 text-slate-100"><Home className="h-4 w-4 text-cyanForge" /> Local beta workspace</div>
        <p className="mt-2">Create files, run code in Docker, and use Gemini when you paste a BYO key.</p>
      </div>
    );
  }

  if (activeTab === "File") {
    return (
      <div className="mt-3 space-y-3 rounded-md border border-slate-800 bg-slate-950/50 p-3">
        <div className="space-y-2">
          <input value={newFilePath} onChange={(event) => setNewFilePath(event.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-xs" />
          <button onClick={createFile} className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-cyanForge/40 px-3 py-2 text-xs text-cyanForge">
            <FilePlus2 className="h-4 w-4" /> New File
          </button>
        </div>
        <div className="space-y-2">
          <input value={newFolderPath} onChange={(event) => setNewFolderPath(event.target.value)} className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-2 text-xs" />
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
          <span>{showAgent ? "On" : "Off"}</span>
        </button>
        <button onClick={() => setShowPreview(!showPreview)} className="inline-flex w-full items-center justify-between rounded-md border border-slate-700 px-3 py-2 text-xs text-slate-300">
          <span className="inline-flex items-center gap-2"><Eye className="h-4 w-4" /> Preview Panel</span>
          <span>{showPreview ? "On" : "Off"}</span>
        </button>
      </div>
    );
  }

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
      <span>{title}</span>
    </div>
  );
}

function ActionButton({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-700 bg-slate-950/60 px-2 py-2 text-xs text-slate-300 transition hover:border-cyanForge/50 hover:text-cyanForge">
      {icon}
      {label}
    </button>
  );
}

function commandFor(file: string) {
  if (file.endsWith(".ts") || file.endsWith(".tsx")) return { language: "typescript", command: `node -e "console.log('TypeScript/TSX saved. Run the full Next.js build from the terminal with npm run build.')" ` };
  if (file.endsWith(".py")) return { language: "python", command: `python ${quote(file)}` };
  if (file.endsWith(".c")) return { language: "c", command: `gcc ${quote(file)} -o main && ./main` };
  if (file.endsWith(".cpp")) return { language: "cpp", command: `g++ ${quote(file)} -o main && ./main` };
  if (file.endsWith(".java")) return { language: "java", command: `javac ${quote(file)} && java -cp ${quote(dirname(file) || ".")} ${basename(file).replace(".java", "")}` };
  if (file.endsWith(".rs")) return { language: "rust", command: `rustc ${quote(file)} -o main && ./main` };
  if (file.endsWith(".html")) return { language: "html", command: `node -e "console.log('HTML file ready for preview: ${file.replaceAll("'", "")}')" ` };
  if (file.endsWith(".css")) return { language: "css", command: `node -e "console.log('CSS file saved: ${file.replaceAll("'", "")}')" ` };
  return { language: "javascript", command: `node ${quote(file)}` };
}

function starterContentFor(file: string) {
  if (file.endsWith(".py")) return "print('Hello from NovaForge')\n";
  if (file.endsWith(".c")) return "#include <stdio.h>\n\nint main(void) {\n  printf(\"Hello from NovaForge C\\n\");\n  return 0;\n}\n";
  if (file.endsWith(".cpp")) return "#include <iostream>\n\nint main() {\n  std::cout << \"Hello from NovaForge C++\" << std::endl;\n  return 0;\n}\n";
  if (file.endsWith(".java")) return "public class Main {\n  public static void main(String[] args) {\n    System.out.println(\"Hello from NovaForge Java\");\n  }\n}\n";
  if (file.endsWith(".rs")) return "fn main() {\n    println!(\"Hello from NovaForge Rust\");\n}\n";
  if (file.endsWith(".html")) return "<!doctype html>\n<html><body><h1>Hello from NovaForge</h1></body></html>\n";
  if (file.endsWith(".css")) return "body {\n  font-family: system-ui, sans-serif;\n}\n";
  return "console.log('Hello from NovaForge');\n";
}

function quote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function dirname(file: string) {
  return file.split("/").slice(0, -1).join("/");
}

function basename(file: string) {
  return file.split("/").pop() || file;
}

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
