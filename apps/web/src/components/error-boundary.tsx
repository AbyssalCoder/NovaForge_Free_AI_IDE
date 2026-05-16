"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean; error: string };

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: "" };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("NovaForge error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen items-center justify-center bg-[#05070d] p-8">
          <div className="max-w-lg rounded-xl border border-red-500/30 bg-[#0f1420] p-8 text-center">
            <h2 className="mb-2 text-xl font-bold text-red-400">Something went wrong</h2>
            <p className="mb-4 text-sm text-slate-400">{this.state.error}</p>
            <button onClick={() => { this.setState({ hasError: false, error: "" }); window.location.reload(); }}
              className="rounded-md bg-cyan-500 px-6 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400">
              Reload NovaForge
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
