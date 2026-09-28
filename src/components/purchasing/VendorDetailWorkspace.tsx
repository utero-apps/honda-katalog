"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";

type VendorDetail = {
  profile: {
    id: string;
    code: string;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    paymentTermsDays: number;
    isActive: boolean;
    createdAt: string;
  };
  products: Array<{
    productId: string;
    partCode: string;
    name: string;
    unit: string;
    status: string;
    vendorPartCode: string | null;
    lastPrice: number;
    leadTimeDays: number;
  }>;
  purchaseOrders: Array<{
    id: string;
    orderNumber: string;
    status: string;
    orderDate: string;
    expectedDate: string | null;
    notes: string | null;
    itemCount: number;
    total: number;
    orderedQuantity: number;
    receivedQuantity: number;
  }>;
  receipts: Array<{
    id: string;
    receiptNumber: string;
    purchaseOrderId: string;
    orderNumber: string;
    receivedAt: string;
    warehouse: string;
    itemCount: number;
    quantity: number;
    value: number;
  }>;
  outstanding: number | null;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    purchaseOrderId: string | null;
    orderNumber: string | null;
    status: string;
    issuedAt: string;
    dueAt: string | null;
    total: number;
    paid: number;
    outstanding: number;
  }> | null;
  payments: Array<{
    id: string;
    paymentNumber: string;
    invoiceId: string;
    invoiceNumber: string;
    amount: number;
    method: string;
    reference: string | null;
    paidAt: string;
    reversedAt: string | null;
  }> | null;
};

const money = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
const quantity = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 });
const date = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" });

function formatDate(value: string | null) {
  return value ? date.format(new Date(value)) : "-";
}

function humanize(value: string) {
  return value.replaceAll("_", " ");
}

async function requestDetail(vendorId: string, signal?: AbortSignal) {
  const response = await fetch(`/api/v1/business/vendors/${vendorId}`, { signal });
  const body = (await response.json().catch(() => null)) as
    | { data?: VendorDetail; error?: { message?: string } }
    | null;
  if (!response.ok || !body?.data) {
    throw new Error(body?.error?.message || "Detail vendor belum dapat dimuat");
  }
  return body.data;
}

function Panel({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div>
        <h2 className="text-base font-black text-slate-950">{title}</h2>
        {description ? <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Status({ value }: { value: string }) {
  const tone = ["paid", "received", "closed", "active"].includes(value)
    ? "bg-emerald-100 text-emerald-800"
    : ["rejected", "cancelled", "reversed", "inactive"].includes(value)
      ? "bg-red-100 text-red-800"
      : "bg-amber-100 text-amber-900";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold capitalize ${tone}`}>{humanize(value)}</span>;
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">{children}</p>;
}

export function VendorDetailWorkspace({ vendorId }: { vendorId: string }) {
  const [data, setData] = useState<VendorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      setData(await requestDetail(vendorId, signal));
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setError(reason instanceof Error ? reason.message : "Detail vendor belum dapat dimuat");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [vendorId]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => void load(controller.signal), 0);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [load]);

  if (loading) {
    return (
      <main className="min-h-dvh bg-slate-50 p-4 sm:p-6" aria-busy="true" aria-label="Memuat detail vendor">
        <div className="mx-auto grid max-w-7xl animate-pulse gap-4">
          <div className="h-40 rounded-3xl bg-slate-200" />
          <div className="grid gap-4 sm:grid-cols-3"><div className="h-24 rounded-2xl bg-slate-200" /><div className="h-24 rounded-2xl bg-slate-200" /><div className="h-24 rounded-2xl bg-slate-200" /></div>
          <div className="h-80 rounded-2xl bg-slate-200" />
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="grid min-h-dvh place-items-center bg-slate-50 p-4">
        <div role="alert" className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm">
          <p className="font-black text-red-900">Detail vendor belum dapat dibuka</p>
          <p className="mt-2 text-sm leading-6 text-red-700">{error}</p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button type="button" onClick={() => void load()} className="min-h-11 rounded-xl bg-red-700 px-4 text-sm font-bold text-white transition hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-700 focus:ring-offset-2">Coba lagi</button>
            <Link href="/business/purchasing" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-800 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-700 focus:ring-offset-2">Kembali ke purchasing</Link>
          </div>
        </div>
      </main>
    );
  }

  const { profile } = data;
  const purchaseValue = data.purchaseOrders.reduce((sum, item) => sum + item.total, 0);
  const receivedValue = data.receipts.reduce((sum, item) => sum + item.value, 0);

  return (
    <main className="min-h-dvh bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <Link href="/business/purchasing" className="inline-flex min-h-11 items-center text-sm font-bold text-blue-800 transition hover:text-blue-950 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:ring-offset-2">Kembali ke Purchasing & Vendor</Link>
          <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-red-700">Vendor {profile.code}</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">{profile.name}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Profil, katalog produk, penerimaan, serta histori transaksi vendor dalam satu tampilan.</p>
            </div>
            <Status value={profile.isActive ? "active" : "inactive"} />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Ringkasan vendor">
          {[
            ["Purchase Order", String(data.purchaseOrders.length), money.format(purchaseValue)],
            ["Penerimaan", String(data.receipts.length), money.format(receivedValue)],
            ["Produk vendor", String(data.products.length), `Termin ${profile.paymentTermsDays} hari`],
            ["Hutang aktif", data.outstanding === null ? "Terbatas" : money.format(data.outstanding), data.outstanding === null ? "Khusus role keuangan" : `${data.invoices?.length ?? 0} invoice`],
          ].map(([label, value, hint]) => (
            <article key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
              <p className="mt-2 break-words text-2xl font-black tabular-nums">{value}</p>
              <p className="mt-1 text-xs text-slate-500">{hint}</p>
            </article>
          ))}
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,.55fr)]">
          <Panel title="Produk dan harga vendor" description="Harga terakhir serta estimasi lead time untuk kebutuhan pembelian.">
            {data.products.length ? <div className="grid gap-3 sm:grid-cols-2">{data.products.map((item) => (
              <article key={item.productId} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3"><div><p className="font-bold text-slate-950">{item.name}</p><p className="mt-1 font-mono text-xs text-blue-800">{item.partCode}{item.vendorPartCode ? ` / ${item.vendorPartCode}` : ""}</p></div><Status value={item.status} /></div>
                <div className="mt-4 flex items-end justify-between gap-3"><div><p className="text-xs text-slate-500">Harga terakhir</p><p className="mt-1 font-black tabular-nums">{money.format(item.lastPrice)}</p></div><p className="text-right text-xs font-semibold text-slate-600">{item.leadTimeDays} hari<br />per {item.unit}</p></div>
              </article>
            ))}</div> : <Empty>Belum ada produk yang dipetakan ke vendor ini.</Empty>}
          </Panel>

          <Panel title="Profil dan kontak">
            <dl className="space-y-4 text-sm">
              {[['Telepon', profile.phone || '-'], ['Email', profile.email || '-'], ['Alamat', profile.address || '-'], ['Termin pembayaran', `${profile.paymentTermsDays} hari`], ['Terdaftar', formatDate(profile.createdAt)]].map(([label, value]) => (
                <div key={label} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0"><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 break-words font-semibold leading-6 text-slate-800">{value}</dd></div>
              ))}
            </dl>
          </Panel>
        </div>

        <Panel title="Riwayat pembelian" description="Progres PO dibandingkan kuantitas yang sudah diterima.">
          {data.purchaseOrders.length ? <div className="grid gap-3 lg:grid-cols-2">{data.purchaseOrders.map((order) => {
            const progress = order.orderedQuantity ? Math.min(100, Math.round((order.receivedQuantity / order.orderedQuantity) * 100)) : 0;
            return <article key={order.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-mono text-sm font-black text-blue-800">{order.orderNumber}</p><Status value={order.status} /></div><p className="mt-3 text-lg font-black tabular-nums">{money.format(order.total)}</p><p className="mt-1 text-xs text-slate-500">{order.itemCount} item · Pesan {formatDate(order.orderDate)} · Estimasi {formatDate(order.expectedDate)}</p><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100" aria-label={`Penerimaan ${progress}%`}><div className="h-full rounded-full bg-blue-700" style={{ width: `${progress}%` }} /></div><div className="mt-2 flex justify-between text-xs font-semibold text-slate-600"><span>{quantity.format(order.receivedQuantity)} diterima</span><span>{progress}% dari {quantity.format(order.orderedQuantity)}</span></div></article>;
          })}</div> : <Empty>Belum ada Purchase Order untuk vendor ini.</Empty>}
        </Panel>

        <div className="grid gap-5 xl:grid-cols-2">
          <Panel title="Goods receipt" description="Barang yang sudah masuk ke gudang.">
            {data.receipts.length ? <div className="space-y-3">{data.receipts.map((receipt) => <article key={receipt.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap justify-between gap-2"><div><p className="font-mono text-sm font-black text-blue-800">{receipt.receiptNumber}</p><p className="mt-1 text-sm font-semibold">{receipt.orderNumber} · {receipt.warehouse}</p></div><p className="text-sm font-black tabular-nums">{money.format(receipt.value)}</p></div><p className="mt-3 text-xs text-slate-500">{formatDate(receipt.receivedAt)} · {receipt.itemCount} item · {quantity.format(receipt.quantity)} unit</p></article>)}</div> : <Empty>Belum ada penerimaan barang.</Empty>}
          </Panel>

          <Panel title="Invoice dan hutang" description={data.invoices === null ? "Nilai finansial disembunyikan untuk role warehouse." : "Saldo invoice memperhitungkan pembayaran aktif."}>
            {data.invoices === null ? <Empty>Detail invoice hanya tersedia untuk owner, admin, dan finance.</Empty> : data.invoices.length ? <div className="space-y-3">{data.invoices.map((invoice) => <article key={invoice.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-mono text-sm font-black text-blue-800">{invoice.invoiceNumber}</p><Status value={invoice.status} /></div><p className="mt-2 text-sm font-semibold text-slate-700">{invoice.orderNumber || "Tanpa referensi PO"} · Jatuh tempo {formatDate(invoice.dueAt)}</p><div className="mt-3 grid grid-cols-3 gap-2 text-xs"><div><p className="text-slate-500">Total</p><p className="mt-1 font-bold tabular-nums">{money.format(invoice.total)}</p></div><div><p className="text-slate-500">Dibayar</p><p className="mt-1 font-bold tabular-nums">{money.format(invoice.paid)}</p></div><div><p className="text-slate-500">Sisa</p><p className="mt-1 font-black tabular-nums text-red-700">{money.format(invoice.outstanding)}</p></div></div></article>)}</div> : <Empty>Belum ada invoice vendor.</Empty>}
          </Panel>
        </div>

        <Panel title="Riwayat pembayaran" description="Pembayaran dibalik tetap ditampilkan sebagai jejak audit.">
          {data.payments === null ? <Empty>Riwayat pembayaran hanya tersedia untuk owner, admin, dan finance.</Empty> : data.payments.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{data.payments.map((payment) => <article key={payment.id} className="rounded-xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-2"><div><p className="font-mono text-sm font-black text-blue-800">{payment.paymentNumber}</p><p className="mt-1 text-xs text-slate-500">Invoice {payment.invoiceNumber}</p></div>{payment.reversedAt ? <Status value="reversed" /> : null}</div><p className="mt-3 text-lg font-black tabular-nums">{money.format(payment.amount)}</p><p className="mt-1 text-xs capitalize text-slate-600">{humanize(payment.method)} · {formatDate(payment.paidAt)}</p>{payment.reference ? <p className="mt-2 break-words text-xs text-slate-500">Ref: {payment.reference}</p> : null}</article>)}</div> : <Empty>Belum ada pembayaran vendor.</Empty>}
        </Panel>
      </div>
    </main>
  );
}
