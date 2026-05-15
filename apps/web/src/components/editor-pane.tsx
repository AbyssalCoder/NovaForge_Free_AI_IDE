"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  language: string;
  value: string;
  onChange: (value: string | undefined) => void;
  fontSize?: number;
  onSave?: () => void;
};

type MonacoEditor = typeof import("@monaco-editor/react").default;

export function EditorPane({ language, value, onChange, fontSize = 14, onSave }: Props) {
  const [Editor, setEditor] = useState<MonacoEditor | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = useRef<any>(null);

  useEffect(() => {
    let alive = true;
    import("@monaco-editor/react").then((module) => {
      if (alive) setEditor(() => module.default);
    });
    return () => { alive = false; };
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleMount(editor: any) {
    editorRef.current = editor;
    // Ctrl+S handler
    editor.addCommand(2097 /* KeyMod.CtrlCmd | KeyCode.KeyS */, () => {
      onSave?.();
    });
  }

  if (!Editor) {
    return <div className="flex h-full min-h-[360px] items-center justify-center bg-slate-950 text-sm text-cyanForge">Loading editor...</div>;
  }

  return (
    <Editor
      height="100%"
      language={language}
      theme="vs-dark"
      value={value}
      onChange={onChange}
      onMount={handleMount}
      options={{
        minimap: { enabled: false },
        fontSize,
        fontFamily: "JetBrains Mono, Consolas, Monaco, monospace",
        wordWrap: "on",
        automaticLayout: true,
        padding: { top: 8 },
        scrollBeyondLastLine: false,
        renderLineHighlight: "gutter",
        bracketPairColorization: { enabled: true },
        guides: { indentation: true, bracketPairs: true },
      }}
    />
  );
}
