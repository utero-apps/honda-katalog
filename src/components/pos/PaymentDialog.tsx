"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { AccessibleDialog } from "@/components/AccessibleDialog";
import type { CheckoutPayment, PaymentMethod } from "./types";

const money = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

const methods: Array<{ value: PaymentMethod; label: string; helper: string }> = [
  { value: "cash", label: "Tunai", helper: "Hitung kembalian otomatis" },
  { value: "transfer", label: "Transfer", helper: "Catat nomor referensi bank" },
  { value: "card", label: "Kartu", helper: "Debit atau kartu kredit" },
  { value: "other", label: "Lainnya", helper: "Metode pembayaran lain" },
];

export function PaymentDialog({
  total,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  total: number;
  busy: boolean;
  error: string;
  onClose: () => void;
  onConfirm: (payment: CheckoutPayment) => Promise<void>;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const amountRef = useRef<HTMLInputElement>(null);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [amount, setAmount] = useState(String(total));
  const [reference, setReference] = useState("");

  const numericAmount = Number(amount || 0);
  const change = method === "cash" ? Math.max(numericAmount - total, 0) : 0;
  const valid = numericAmount >= total && (method === "cash" || reference.trim().length >= 3);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || busy) return;
    await onConfirm({ method, amount: numericAmount, reference: reference.trim() || undefined });
  }

  return (
    <AccessibleDialog labelledBy={titleId} describedBy={descriptionId} onClose={busy ? () => undefined : onClose} panelClassName="max-w-xl p-0 sm:p-0">
      <form onSubmit={submit}>
        <header className="border-b border-slate-200 px-5 py-5 sm:px-6">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-red-600">Checkout POS</p>
          <h2 id={titleId} className="mt-1 text-2xl font-black tracking-tight text-slate-950">Pilih pembayaran</h2>
          <p id={descriptionId} className="mt-1 text-sm text-slate-600">Pastikan metode dan nominal sesuai sebelum menyelesaikan transaksi.</p>
        </header>

        <div className="space-y-5 px-5 py-5 sm:px-6">
          <div className="rounded-2xl bg-slate-950 p-5 text-white">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Total tagihan</p>
            <p className="mt-2 text-3xl font-black tabular-nums">{money.format(total)}</p>
          </div>

          <fieldset>
            <legend className="text-sm font-black text-slate-900">Metode pembayaran</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {methods.map((item) => (
                <label key={item.value} className={`cursor-pointer rounded-2xl border p-3 transition-colors ${method === item.value ? "border-blue-700 bg-blue-50 ring-2 ring-blue-100" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                  <input className="sr-only" type="radio" name="payment-method" value={item.value} checked={method === item.value} onChange={() => { setMethod(item.value); window.requestAnimationFrame(() => amountRef.current?.focus()); }} />
                  <span className="block text-sm font-black text-slate-950">{item.label}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-slate-600">{item.helper}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-black text-slate-900">Nominal dibayar</span>
              <input ref={amountRef} data-dialog-initial-focus inputMode="numeric" min={total} step="1" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base font-bold tabular-nums text-slate-950 outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-100" />
            </label>
            {method !== "cash" ? (
              <label className="block">
                <span className="text-sm font-black text-slate-900">Referensi pembayaran</span>
                <input type="text" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Minimal 3 karakter" className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base font-semibold text-slate-950 outline-none placeholder:text-slate-400 focus:border-blue-700 focus:ring-4 focus:ring-blue-100" />
              </label>
            ) : (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Kembalian</p>
                <p className="mt-1 text-xl font-black tabular-nums text-emerald-900">{money.format(change)}</p>
              </div>
            )}
          </div>

          {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{error}</p>}
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <button type="button" onClick={onClose} disabled={busy} className="min-h-11 rounded-xl border border-slate-300 bg-white px-5 text-sm font-bold text-slate-800 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:opacity-50">Batal</button>
          <button type="submit" disabled={!valid || busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-6 text-sm font-black text-white shadow-sm hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600">
            {busy && <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />}
            {busy ? "Memproses..." : "Selesaikan transaksi"}
          </button>
        </footer>
      </form>
    </AccessibleDialog>
  );
}
