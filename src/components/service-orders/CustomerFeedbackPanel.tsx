"use client";

import { useEffect, useState } from "react";

const feedbackLinkRoles = new Set(["owner", "admin", "cashier"]);

export function canIssueCustomerFeedbackLink(role?: string | null) {
  return Boolean(role && feedbackLinkRoles.has(role));
}

export function toAbsoluteFeedbackUrl(path: string, origin: string) {
  return new URL(path, origin).toString();
}

export function CustomerFeedbackPanel({ orderId }: { orderId: string }) {
  const [allowed, setAllowed] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [path, setPath] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/v1/auth/me")
      .then(async (response) => {
        if (!response.ok) return null;
        const body = await response.json() as { data?: { user?: { role?: string } } };
        return body.data?.user?.role;
      })
      .then((role) => { if (active) setAllowed(canIssueCustomerFeedbackLink(role)); })
      .catch(() => { if (active) setAllowed(false); })
      .finally(() => { if (active) setCheckingAccess(false); });
    return () => { active = false; };
  }, []);

  if (checkingAccess || !allowed) return null;

  async function createLink() {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/v1/public/service-feedback/tokens", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ serviceOrderId: orderId }),
      });
      const body = await response.json().catch(() => null) as { data?: { path?: string; expiresAt?: string }; error?: { message?: string } } | null;
      if (!response.ok || !body?.data?.path) throw new Error(body?.error?.message || "Tautan rating belum dapat dibuat");
      setPath(body.data.path);
      setExpiresAt(body.data.expiresAt ?? "");
      setMessage(path ? "Tautan baru dibuat. Tautan sebelumnya tidak berlaku." : "Tautan rating dibuat dan siap disalin.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Tautan rating belum dapat dibuat");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    setError(""); setMessage("");
    try {
      await navigator.clipboard.writeText(toAbsoluteFeedbackUrl(path, window.location.origin));
      setMessage("Tautan rating disalin ke clipboard.");
    } catch {
      setError("Tautan belum dapat disalin. Salin path secara manual.");
    }
  }

  return <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 shadow-sm sm:p-5">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div><h2 className="text-lg font-black text-slate-950">Tautan rating pelanggan</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-700">Buat tautan sekali pakai setelah serah-terima. Berikan tautan kepada pelanggan melalui kanal yang Anda pilih.</p></div>
      <button type="button" disabled={busy} onClick={() => void createLink()} className="min-h-11 shrink-0 cursor-pointer rounded-xl bg-slate-950 px-4 text-sm font-black text-white transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950 disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Membuat…" : path ? "Refresh tautan" : "Buat tautan"}</button>
    </div>
    {path && <div className="mt-4 rounded-xl border border-amber-200 bg-white p-3">
      <label htmlFor="customer-feedback-path" className="text-xs font-black uppercase tracking-wide text-slate-600">Path publik</label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row"><input id="customer-feedback-path" readOnly value={path} onFocus={(event) => event.currentTarget.select()} className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3 font-mono text-sm text-slate-900" /><button type="button" onClick={() => void copyLink()} className="min-h-11 cursor-pointer rounded-xl border border-slate-300 bg-white px-4 text-sm font-black text-slate-900 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900">Copy tautan</button></div>
      {expiresAt && <p className="mt-2 text-xs font-semibold text-slate-600">Berlaku sampai {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(expiresAt))}. Refresh membuat tautan sebelumnya tidak berlaku.</p>}
    </div>}
    {message && <p role="status" className="mt-3 text-sm font-bold text-emerald-800">{message}</p>}
    {error && <p role="alert" className="mt-3 text-sm font-bold text-red-700">{error}</p>}
  </section>;
}
