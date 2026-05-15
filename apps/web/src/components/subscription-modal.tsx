"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Crown, CheckCircle2, X, Zap, Sparkles, Clock } from "lucide-react";
import { useState } from "react";
import { apiFetch } from "@/lib/config";

type Props = { open: boolean; onClose: () => void; currentPlan: string; onUpgrade: () => void };

export function SubscriptionModal({ open, onClose, currentPlan, onUpgrade }: Props) {
  const [upgrading, setUpgrading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleUpgrade() {
    setUpgrading(true);
    try {
      const res = await apiFetch("/api/subscriptions/upgrade", { method: "POST" });
      if (res.ok) {
        setDone(true);
        onUpgrade();
        setTimeout(() => { setDone(false); onClose(); }, 2000);
      }
    } catch { /* offline */ }
    setUpgrading(false);
  }

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="glass mx-4 w-full max-w-lg rounded-xl p-6" onClick={(e) => e.stopPropagation()}>
          {done ? (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex flex-col items-center gap-4 py-8">
              <Crown className="h-16 w-16 text-amberForge" />
              <h3 className="text-xl font-bold text-white">Welcome to PRO!</h3>
              <p className="text-sm text-slate-400">Enjoy unlimited AI, faster builds, and priority support.</p>
            </motion.div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">Choose Your Plan</h3>
                <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {/* Free Plan */}
                <div className={`rounded-lg border p-4 ${currentPlan === "free" ? "border-cyanForge/60 bg-cyanForge/5" : "border-slate-700"}`}>
                  <div className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-cyanForge" />
                    <h4 className="font-bold text-white">FREE</h4>
                  </div>
                  <p className="mt-1 text-2xl font-bold text-white">₹0 <span className="text-sm font-normal text-slate-400">forever</span></p>
                  <ul className="mt-3 space-y-2 text-xs text-slate-300">
                    <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-mintForge" /> 50 AI requests/day</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-mintForge" /> Docker sandboxed runs</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-mintForge" /> All languages supported</li>
                    <li className="flex items-center gap-2"><Clock className="h-3.5 w-3.5 text-slate-500" /> Community queue</li>
                  </ul>
                  {currentPlan === "free" && <div className="mt-3 rounded-md bg-cyanForge/10 py-1.5 text-center text-xs font-medium text-cyanForge">Current Plan</div>}
                </div>

                {/* Pro Plan */}
                <div className={`rounded-lg border p-4 ${currentPlan === "pro" ? "border-amberForge/60 bg-amberForge/5" : "border-amberForge/30 bg-amberForge/5"}`}>
                  <div className="flex items-center gap-2">
                    <Crown className="h-5 w-5 text-amberForge" />
                    <h4 className="font-bold text-white">PRO</h4>
                    <span className="rounded bg-amberForge/20 px-1.5 py-0.5 text-[10px] font-bold text-amberForge">POPULAR</span>
                  </div>
                  <p className="mt-1 text-2xl font-bold text-white">₹150 <span className="text-sm font-normal text-slate-400">first month</span></p>
                  <p className="text-xs text-slate-500">then ₹299/month</p>
                  <ul className="mt-3 space-y-2 text-xs text-slate-300">
                    <li className="flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-amberForge" /> 500 AI requests/day</li>
                    <li className="flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-amberForge" /> Priority AI queue</li>
                    <li className="flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-amberForge" /> Better AI models</li>
                    <li className="flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-amberForge" /> Unlimited projects</li>
                  </ul>
                  {currentPlan === "pro" ? (
                    <div className="mt-3 rounded-md bg-amberForge/10 py-1.5 text-center text-xs font-medium text-amberForge">Current Plan</div>
                  ) : (
                    <button onClick={handleUpgrade} disabled={upgrading} className="mt-3 w-full rounded-md bg-gradient-to-r from-amberForge to-orange-500 py-2 text-sm font-bold text-slate-950 disabled:opacity-50">
                      {upgrading ? "Processing..." : "Upgrade to PRO"}
                    </button>
                  )}
                </div>
              </div>
              <p className="mt-3 text-center text-[10px] text-slate-500">Payment integration coming soon. Demo mode active.</p>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
