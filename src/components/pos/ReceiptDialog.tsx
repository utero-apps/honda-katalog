"use client";

import { useId } from "react";
import { AccessibleDialog } from "@/components/AccessibleDialog";
import type { CartItem, CheckoutPayment, Receipt } from "./types";

const money = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" });

const paymentLabels: Record<CheckoutPayment["method"], string> = { cash: "Tunai", transfer: "Transfer", card: "Kartu", other: "Lainnya" };

export function ReceiptDialog({ receipt, fallbackItems, fallbackPayment, onClose }: { receipt: Receipt; fallbackItems: CartItem[]; fallbackPayment: CheckoutPayment; onClose: () => void }) {
  const titleId = useId();
  const receiptItems: NonNullable<Receipt["items"]> = receipt.items?.length ? receipt.items : fallbackItems.map((item) => ({ productId: item.id, partCode: item.partCode, name: item.name, quantity: item.cartQuantity, unitPrice: item.het, subtotal: item.cartQuantity * item.het }));
  const total = receipt.total ?? receipt.subtotal ?? receiptItems.reduce((sum, item) => sum + (item.subtotal ?? item.quantity * item.unitPrice), 0);
  const payment = receipt.payment ?? receipt.payments?.[0] ?? fallbackPayment;
  const change = receipt.change ?? (payment.method === "cash" ? Math.max(payment.amount - total, 0) : 0);

  return (
    <AccessibleDialog labelledBy={titleId} onClose={onClose} panelClassName="max-w-lg p-0 sm:p-0">
      <style>{`@media print { body * { visibility: hidden !important; } #pos-print-receipt, #pos-print-receipt * { visibility: visible !important; } #pos-print-receipt { position: fixed; inset: 0 auto auto 0; width: 80mm; padding: 8mm; background: white; color: black; box-shadow: none; } .pos-print-actions { display: none !important; } }`}</style>
      <div id="pos-print-receipt" className="bg-white">
        <header className="border-b border-dashed border-slate-300 px-6 py-6 text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-emerald-100 text-emerald-700" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m5 12 4 4L19 6" /></svg>
          </div>
          <p className="mt-3 text-xs font-black uppercase tracking-[0.22em] text-red-600">Honda Workshop</p>
          <h2 id={titleId} className="mt-1 text-2xl font-black text-slate-950">Transaksi berhasil</h2>
          <p className="mt-1 text-sm text-slate-600">{receipt.receiptNumber ?? receipt.transactionNumber ?? receipt.id ?? "Receipt POS"}</p>
          <p className="mt-1 text-xs text-slate-500">{date.format(receipt.createdAt ? new Date(receipt.createdAt) : new Date())}</p>
        </header>

        <div className="px-6 py-5">
          {(receipt.customerName || receipt.cashierName) && <dl className="mb-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-xs"><div><dt className="text-slate-500">Pelanggan</dt><dd className="mt-0.5 font-bold text-slate-900">{receipt.customerName || "Umum"}</dd></div><div className="text-right"><dt className="text-slate-500">Kasir</dt><dd className="mt-0.5 font-bold text-slate-900">{receipt.cashierName || "-"}</dd></div></dl>}
          <ul className="divide-y divide-dashed divide-slate-200">
            {receiptItems.map((item, index) => (
              <li key={item.id ?? item.productId ?? `${item.partCode}-${index}`} className="py-3">
                <div className="flex justify-between gap-4"><div><p className="font-bold text-slate-950">{item.name || item.partCode || "Produk"}</p><p className="mt-0.5 text-xs text-slate-500">{item.partCode}</p></div><p className="shrink-0 font-black tabular-nums text-slate-950">{money.format(item.subtotal ?? item.quantity * item.unitPrice)}</p></div>
                <p className="mt-1 text-xs text-slate-600">{item.quantity} x {money.format(item.unitPrice)}</p>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-2 border-t-2 border-slate-950 pt-4 text-sm">
            <div className="flex justify-between"><dt className="font-bold text-slate-600">Total</dt><dd className="text-lg font-black tabular-nums text-slate-950">{money.format(total)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-600">{paymentLabels[payment.method]}</dt><dd className="font-bold tabular-nums text-slate-900">{money.format(payment.amount)}</dd></div>
            {payment.reference && <div className="flex justify-between gap-4"><dt className="text-slate-600">Referensi</dt><dd className="truncate font-bold text-slate-900">{payment.reference}</dd></div>}
            {payment.method === "cash" && <div className="flex justify-between"><dt className="text-slate-600">Kembalian</dt><dd className="font-bold tabular-nums text-emerald-700">{money.format(change)}</dd></div>}
          </dl>
          <p className="mt-6 text-center text-xs leading-5 text-slate-500">Terima kasih. Simpan receipt ini sebagai bukti transaksi.</p>
        </div>
      </div>

      <footer className="pos-print-actions grid grid-cols-2 gap-2 border-t border-slate-200 bg-slate-50 p-4">
        <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">Transaksi baru</button>
        <button type="button" onClick={() => window.print()} data-dialog-initial-focus className="min-h-11 rounded-xl bg-slate-950 px-4 text-sm font-black text-white hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950">Cetak receipt</button>
      </footer>
    </AccessibleDialog>
  );
}
