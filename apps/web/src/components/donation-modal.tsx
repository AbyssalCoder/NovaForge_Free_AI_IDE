"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Heart, X, Copy, CheckCircle2 } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { apiFetch } from "@/lib/config";

type Props = { open: boolean; onClose: () => void };

const presets = [10, 20, 50, 100];

export function DonationModal({ open, onClose }: Props) {
  const [amount, setAmount] = useState(50);
  const [custom, setCustom] = useState("");
  const [message, setMessage] = useState("");
  const [showQR, setShowQR] = useState(false);
  const [donated, setDonated] = useState(false);
  const [copied, setCopied] = useState(false);

  const effectiveAmount = custom ? Number(custom) : amount;

  async function handleDonate() {
    if (effectiveAmount < 1) return;
    setShowQR(true);
  }

  async function confirmDonation() {
    try {
      await apiFetch("/api/donations", {
        method: "POST",
        body: JSON.stringify({ amount: effectiveAmount, message })
      });
    } catch { /* offline mode */ }
    setDonated(true);
    setTimeout(() => { setDonated(false); setShowQR(false); onClose(); }, 2500);
  }

  function copyUPI() {
    navigator.clipboard.writeText("novaforge@upi");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="glass mx-4 w-full max-w-md rounded-xl p-6"
          onClick={(e) => e.stopPropagation()}
        >
          {donated ? (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex flex-col items-center gap-4 py-8">
              <motion.div animate={{ rotate: [0, 10, -10, 0] }} transition={{ repeat: 3, duration: 0.4 }}>
                <Heart className="h-16 w-16 text-pink-500" fill="currentColor" />
              </motion.div>
              <h3 className="text-xl font-bold text-white">Thank You!</h3>
              <p className="text-sm text-slate-400">Your support means everything to NovaForge.</p>
            </motion.div>
          ) : showQR ? (
            <div className="flex flex-col items-center gap-4">
              <div className="flex w-full items-center justify-between">
                <h3 className="text-lg font-bold text-white">Scan to Pay ₹{effectiveAmount}</h3>
                <button onClick={() => setShowQR(false)} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
              </div>
              <div className="rounded-lg border border-slate-700 bg-white p-3">
                <Image src="/qr-donate.jpg" alt="Donation QR Code" width={192} height={192} className="h-48 w-48 object-contain" />
              </div>
              <div className="flex w-full items-center gap-2">
                <input value="novaforge@upi" readOnly className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300" />
                <button onClick={copyUPI} className="rounded-md border border-cyanForge/40 bg-cyanForge/10 px-3 py-2 text-sm text-cyanForge">
                  {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
              {message && <p className="text-xs text-slate-500 italic">&quot;{message}&quot;</p>}
              <button onClick={confirmDonation} className="w-full rounded-md bg-cyanForge py-2 text-sm font-semibold text-slate-950">
                I&apos;ve Completed Payment
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Heart className="h-5 w-5 text-pink-500" />
                  <h3 className="text-lg font-bold text-white">Support NovaForge</h3>
                </div>
                <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
              </div>
              <p className="mt-2 text-sm text-slate-400">NovaForge is free forever. Your donation helps keep it running.</p>
              <div className="mt-4 grid grid-cols-4 gap-2">
                {presets.map((p) => (
                  <button
                    key={p}
                    onClick={() => { setAmount(p); setCustom(""); }}
                    className={`rounded-md border py-2 text-sm font-medium transition ${
                      amount === p && !custom
                        ? "border-cyanForge bg-cyanForge/15 text-cyanForge"
                        : "border-slate-700 text-slate-300 hover:border-slate-500"
                    }`}
                  >
                    ₹{p}
                  </button>
                ))}
              </div>
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value.replace(/\D/g, ""))}
                placeholder="Custom amount (₹)"
                className="mt-3 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              />
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Leave a support message (optional)"
                className="mt-2 w-full resize-none rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                rows={2}
              />
              <button
                onClick={handleDonate}
                disabled={effectiveAmount < 1}
                className="mt-4 w-full rounded-md bg-gradient-to-r from-pink-500 to-cyanForge py-2.5 text-sm font-bold text-white shadow-lg disabled:opacity-50"
              >
                Donate ₹{effectiveAmount || "..."}
              </button>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
