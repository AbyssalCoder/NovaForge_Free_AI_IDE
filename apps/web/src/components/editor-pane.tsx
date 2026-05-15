"use client";

import { useEffect, useState } from "react";

type Props = {
  language: string;
  value: string;
  onChange: (value: string | undefined) => void;
};

type MonacoEditor = typeof import("@monaco-editor/react").default;

export function EditorPane({ language, value, onChange }: Props) {
  const [Editor, setEditor] = useState<MonacoEditor | null>(null);

  useEffect(() => {
    let alive = true;
    import("@monaco-editor/react").then((module) => {
      if (alive) setEditor(() => module.default);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!Editor) {
    return <div className="flex h-full min-h-[360px] items-center justify-center bg-slate-950 text-sm text-cyanForge">Loading editor</div>;
  }

  return (
    <Editor
      height="100%"
      language={language}
      theme="vs-dark"
      value={value}
      onChange={onChange}
      options={{
        minimap: { enabled: false },
        fontSize: 14,
        fontFamily: "Consolas, Monaco, monospace",
        wordWrap: "on",
        automaticLayout: true
      }}
    />
  );
}
