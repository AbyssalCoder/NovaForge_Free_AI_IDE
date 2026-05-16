"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Shield, X, CheckCircle2, XCircle, Clock, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/config";

type UpgradeRequest = {
  id: string;
  user_id: string;
  username: string;
  transaction_id: string;
  amount: number;
  status: string;
  admin_note: string;
  created_at: string;
  resolved_at: string | null;
};

type Props = { open: boolean; onClose: () => void };

export function AdminPanel({ open, onClose }: Props) {
  const [requests, setRequests] = useState<UpgradeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    loadRequests();
  }, [open]);

  async function loadRequests() {
    setLoading(true);
    try {
      const res = await apiFetch("/api/admin/upgrade-requests");
      const data = await res.json();
      if (res.ok) setRequests(data.requests || []);
    } catch { /* offline */ }
    setLoading(false);
  }

  async function handleAction(id: string, action: "approve" | "reject") {
    setActionLoading(id);
    try {
      const res = await apiFetch(`/api/admin/upgrade-requests/${id}/${action}`, { method: "POST" });
      if (res.ok) {
        await loadRequests();
      }
    } catch { /* offline */ }
    setActionLoading(null);
  }

  if (!open) return null;

  const pending = requests.filter((r) => r.status === "pending");
  const resolved = requests.filter((r) => r.status !== "pending");

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
          className="glass mx-4 w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl p-6"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-lg font-bold text-white">
              <Shield className="h-5 w-5 text-amberForge" /> Admin: Upgrade Requests
            </h3>
            <button onClick={onClose} className="text-slate-400 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-cyanForge" />
            </div>
          ) : (
            <>
              {/* Pending Requests */}
              <div className="mt-4">
                <h4 className="flex items-center gap-2 text-sm font-medium text-amberForge">
                  <Clock className="h-4 w-4" /> Pending ({pending.length})
                </h4>
                {pending.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500">No pending requests.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {pending.map((req) => (
                      <div key={req.id} className="rounded-lg border border-amberForge/30 bg-amberForge/5 p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-white">{req.username}</p>
                            <p className="text-xs text-slate-400">
                              Txn: <span className="font-mono text-cyanForge">{req.transaction_id}</span>
                            </p>
                            <p className="text-xs text-slate-500">
                              ₹{req.amount} • {new Date(req.created_at).toLocaleString()}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleAction(req.id, "approve")}
                              disabled={actionLoading === req.id}
                              className="flex items-center gap-1 rounded bg-mintForge/20 px-3 py-1.5 text-xs font-medium text-mintForge hover:bg-mintForge/30 disabled:opacity-50"
                            >
                              {actionLoading === req.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-3 w-3" />
                              )}
                              Approve
                            </button>
                            <button
                              onClick={() => handleAction(req.id, "reject")}
                              disabled={actionLoading === req.id}
                              className="flex items-center gap-1 rounded bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/30 disabled:opacity-50"
                            >
                              <XCircle className="h-3 w-3" /> Reject
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Resolved Requests */}
              {resolved.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-slate-400">History ({resolved.length})</h4>
                  <div className="mt-2 space-y-1">
                    {resolved.slice(0, 20).map((req) => (
                      <div key={req.id} className="flex items-center justify-between rounded-lg border border-slate-700/50 bg-slate-800/30 px-3 py-2">
                        <div className="flex items-center gap-2">
                          {req.status === "approved" ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-mintForge" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 text-red-400" />
                          )}
                          <span className="text-xs text-white">{req.username}</span>
                          <span className="font-mono text-[10px] text-slate-500">{req.transaction_id}</span>
                        </div>
                        <span className="text-[10px] text-slate-500">
                          {req.resolved_at ? new Date(req.resolved_at).toLocaleDateString() : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
