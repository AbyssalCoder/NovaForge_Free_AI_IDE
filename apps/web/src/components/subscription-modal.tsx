"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Crown, CheckCircle2, X, Zap, Sparkles, Clock, QrCode, ArrowRight, Loader2 } from "lucide-react";
import { useState } from "react";
import { apiFetch } from "@/lib/config";

type Props = { open: boolean; onClose: () => void; currentPlan: string; onUpgrade: () => void };

type Step = "plans" | "payment" | "submitted";

export function SubscriptionModal({ open, onClose, currentPlan, onUpgrade }: Props) {
  const [step, setStep] = useState<Step>("plans");
  const [txnId, setTxnId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function handleClose() {
    setStep("plans");
    setTxnId("");
    setError("");
    onClose();
  }

  async function handleSubmitPayment() {
    if (txnId.trim().length < 5) {
      setError("Please enter a valid UPI transaction ID (min 5 characters)");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await apiFetch("/api/subscriptions/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId: txnId.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setStep("submitted");
      } else {
        setError(data.error || "Something went wrong");
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setSubmitting(false);
  }

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="glass mx-4 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl p-6"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          {/* Step 3: Submitted */}
          {step === "submitted" && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex flex-col items-center gap-4 py-8">
              <div className="rounded-full bg-mintForge/20 p-4">
                <CheckCircle2 className="h-12 w-12 text-mintForge" />
              </div>
              <h3 className="text-xl font-bold text-white">Request Submitted!</h3>
              <p className="text-center text-sm text-slate-400">
                Your upgrade request has been sent for verification.<br />
                You&apos;ll be upgraded to PRO within <strong className="text-amberForge">24-48 hours</strong>.
              </p>
              <p className="text-xs text-slate-500">We&apos;ll verify your payment and activate your PRO plan.</p>
              <button
                onClick={handleClose}
                className="mt-2 rounded-md bg-cyanForge/20 px-6 py-2 text-sm font-medium text-cyanForge hover:bg-cyanForge/30"
              >
                Got it
              </button>
            </motion.div>
          )}

          {/* Step 2: Payment QR + Transaction ID */}
          {step === "payment" && (
            <>
              <div className="flex items-center justify-between">
                <button onClick={() => setStep("plans")} className="text-sm text-slate-400 hover:text-white">
                  ← Back
                </button>
                <h3 className="text-lg font-bold text-white">Complete Payment</h3>
                <button onClick={handleClose} className="text-slate-400 hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-4 flex flex-col items-center gap-4">
                {/* QR Code */}
                <div className="rounded-lg border border-slate-700 bg-white p-3">
                  <img
                    src="/qr-donate.jpg"
                    alt="Scan to pay via UPI"
                    className="h-48 w-48 object-contain"
                  />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-white">Scan & Pay <span className="text-amberForge">₹150</span> via UPI</p>
                  <p className="mt-1 text-xs text-slate-500">Google Pay / PhonePe / Paytm / any UPI app</p>
                </div>

                {/* Divider */}
                <div className="flex w-full items-center gap-3">
                  <div className="h-px flex-1 bg-slate-700" />
                  <span className="text-xs text-slate-500">After payment</span>
                  <div className="h-px flex-1 bg-slate-700" />
                </div>

                {/* Transaction ID Input */}
                <div className="w-full space-y-2">
                  <label htmlFor="txn-id" className="text-xs font-medium text-slate-300">
                    Enter UPI Transaction ID / Reference Number
                  </label>
                  <input
                    id="txn-id"
                    type="text"
                    value={txnId}
                    onChange={(e) => setTxnId(e.target.value)}
                    placeholder="e.g. 423891672834 or UPI ref number"
                    className="w-full rounded-md border border-slate-700 bg-slate-800/50 px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-cyanForge"
                    maxLength={100}
                    autoFocus
                  />
                  {error && <p className="text-xs text-red-400">{error}</p>}
                </div>

                <button
                  onClick={handleSubmitPayment}
                  disabled={submitting || txnId.trim().length < 5}
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-gradient-to-r from-amberForge to-orange-500 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-50"
                >
                  {submitting ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Submitting...</>
                  ) : (
                    <><ArrowRight className="h-4 w-4" /> Submit & Request Upgrade</>
                  )}
                </button>

                <p className="text-center text-[10px] text-slate-500">
                  Your PRO access will be activated within 24-48 hours after payment verification.
                </p>
              </div>
            </>
          )}

          {/* Step 1: Plan Selection */}
          {step === "plans" && (
            <>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">Choose Your Plan</h3>
                <button onClick={handleClose} className="text-slate-400 hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {/* Free Plan */}
                <div className={`rounded-lg border p-4 ${currentPlan === "free" ? "border-cyanForge/60 bg-cyanForge/5" : "border-slate-700"}`}>
                  <div className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-cyanForge" />
                    <h4 className="font-bold text-white">FREE</h4>
                  </div>
                  <p className="mt-1 text-2xl font-bold text-white">
                    ₹0 <span className="text-sm font-normal text-slate-400">forever</span>
                  </p>
                  <ul className="mt-3 space-y-2 text-xs text-slate-300">
                    <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-mintForge" /> 50 AI requests/day</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-mintForge" /> Docker sandboxed runs</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-mintForge" /> All languages supported</li>
                    <li className="flex items-center gap-2"><Clock className="h-3.5 w-3.5 text-slate-500" /> Community queue</li>
                  </ul>
                  {currentPlan === "free" && (
                    <div className="mt-3 rounded-md bg-cyanForge/10 py-1.5 text-center text-xs font-medium text-cyanForge">Current Plan</div>
                  )}
                </div>

                {/* Pro Plan */}
                <div className={`rounded-lg border p-4 ${currentPlan === "pro" ? "border-amberForge/60 bg-amberForge/5" : "border-amberForge/30 bg-amberForge/5"}`}>
                  <div className="flex items-center gap-2">
                    <Crown className="h-5 w-5 text-amberForge" />
                    <h4 className="font-bold text-white">PRO</h4>
                    <span className="rounded bg-amberForge/20 px-1.5 py-0.5 text-[10px] font-bold text-amberForge">POPULAR</span>
                  </div>
                  <p className="mt-1 text-2xl font-bold text-white">
                    ₹150 <span className="text-sm font-normal text-slate-400">first month</span>
                  </p>
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
                    <button
                      onClick={() => setStep("payment")}
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-md bg-gradient-to-r from-amberForge to-orange-500 py-2 text-sm font-bold text-slate-950"
                    >
                      <QrCode className="h-4 w-4" /> Pay & Upgrade
                    </button>
                  )}
                </div>
              </div>
              <p className="mt-3 text-center text-[10px] text-slate-500">
                Scan QR code to pay via UPI. PRO activates within 24-48 hrs after verification.
              </p>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
