"use client";

import { AnimatePresence, motion } from "framer-motion";
import { LogIn, UserPlus, X, Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { apiFetch, setAuthToken } from "@/lib/config";

type Props = {
  open: boolean;
  onClose: () => void;
  onAuth: (user: { id: string; username: string; role: string; plan: string }) => void;
};

export function AuthModal({ open, onClose, onAuth }: Props) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const body: Record<string, string> = { username, password };
      if (mode === "signup" && email) body.email = email;

      const res = await apiFetch(endpoint, { method: "POST", body: JSON.stringify(body) });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        setLoading(false);
        return;
      }

      setAuthToken(data.token);
      onAuth(data.user);
      onClose();
      setUsername("");
      setPassword("");
      setEmail("");
    } catch {
      setError("Cannot reach server. Is the backend running?");
    }
    setLoading(false);
  }

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
        <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }}
          className="glass mx-4 w-full max-w-sm rounded-xl p-6" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {mode === "login" ? <LogIn className="h-5 w-5 text-cyanForge" /> : <UserPlus className="h-5 w-5 text-mintForge" />}
              <h3 className="text-lg font-bold text-white">{mode === "login" ? "Login" : "Sign Up"}</h3>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
          </div>

          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:border-cyanForge/60 focus:outline-none"
            />
            {mode === "signup" && (
              <input
                type="email"
                placeholder="Email (optional)"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:border-cyanForge/60 focus:outline-none"
              />
            )}
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:border-cyanForge/60 focus:outline-none"
            />

            {error && <p className="text-xs text-red-400">{error}</p>}

            <button type="submit" disabled={loading} className="w-full rounded-md bg-cyanForge py-2.5 text-sm font-bold text-slate-950 disabled:opacity-50">
              {loading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : mode === "login" ? "Login" : "Create Account"}
            </button>
          </form>

          <div className="mt-3 flex items-center justify-center gap-1 text-xs text-slate-500">
            {mode === "login" ? (
              <>Don&apos;t have an account? <button className="text-cyanForge hover:underline" onClick={() => { setMode("signup"); setError(""); }}>Sign up</button></>
            ) : (
              <>Already have an account? <button className="text-cyanForge hover:underline" onClick={() => { setMode("login"); setError(""); }}>Login</button></>
            )}
          </div>

          <div className="mt-3 flex items-center gap-2 rounded-md border border-slate-800 bg-slate-900/50 p-2 text-[10px] text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-mintForge" />
            Free to use. Sign up to start coding with AI.
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
