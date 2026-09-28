"use client";

import {
  FormEvent,
  ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";
import { AccessibleDialog } from "@/components/AccessibleDialog";
import Link from "next/link";

type PurchasingSummary = {
  totalPurchaseOrders: number;
  totalReceipts: number;
  purchaseValue: number;
  outstandingVendorDebt: number;
  outgoingVendorPayments: number;
  receivingValue: number;
};

type PurchaseHistoryRow = {
  purchaseOrderId: string;
  purchaseOrderNumber: string;
  orderDate: string;
  status: string;
  vendorId: string;
  vendorName: string;
  receiptCount: number;
  receivedValue: number;
  invoiceNumber?: string | null;
  total: number;
  invoiceTotal?: number | null;
  outstanding?: number | null;
  purchaseOrderOutstanding: number;
  paymentStatus?: string | null;
  invoices: Array<{ id: string; invoiceNumber: string; total: number; paid: number; outstanding: number; paymentStatus: string }>;
};

type PayableAging = {
  notDue: number;
  overdue1To30: number;
  overdue31To60: number;
  overdue61Plus: number;
};

type TopVendor = {
  vendorId: string;
  name: string;
  purchaseValue: number;
  outstanding: number;
  purchaseOrderCount: number;
};

type PaymentStatus = {
  status: string;
  count: number;
  total: number;
  outstanding: number;
};

export type PurchasingOverview = {
  range: { from: string; to: string };
  summary: PurchasingSummary;
  recentPurchaseChain: PurchaseHistoryRow[];
  payableAging: PayableAging;
  topVendors: TopVendor[];
  paymentStatusComposition: PaymentStatus[];
};

type VendorReference = { id: string; code: string; name: string };
type OrderReference = { id: string; orderNumber: string; vendorId: string; vendor: string; status: string };
type InvoiceReference = { id: string; invoiceNumber: string; vendor: string; total: number; status: string; outstanding?: number; outstandingAmount?: number };
type Action = "vendor" | "invoice" | "payment";

type ApiEnvelope<T> = {
  data?: T;
  error?: { message?: string } | null;
};

const money = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
const integer = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" });
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 8)}01`;

async function requestOverview(
  from: string,
  to: string,
  signal?: AbortSignal,
): Promise<PurchasingOverview> {
  const query = new URLSearchParams({ from, to });
  const response = await fetch(
    `/api/v1/intelligence/purchasing-overview?${query.toString()}`,
    { signal },
  );
  const payload = (await response.json().catch(() => null)) as
    | ApiEnvelope<PurchasingOverview>
    | null;
  if (!response.ok || !payload?.data) {
    throw new Error(
      payload?.error?.message || "Dashboard purchasing belum dapat dimuat",
    );
  }
  return payload.data;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!response.ok || !payload || payload.data === undefined) {
    throw new Error(payload?.error?.message || "Permintaan tidak dapat diproses");
  }
  return payload.data;
}

export function PurchasingWorkspace({ role }: { role: string }) {
  const [draftFrom, setDraftFrom] = useState(monthStart);
  const [draftTo, setDraftTo] = useState(today);
  const [range, setRange] = useState({ from: monthStart(), to: today() });
  const [data, setData] = useState<PurchasingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [action, setAction] = useState<Action | null>(null);
  const [referencesLoading, setReferencesLoading] = useState(false);
  const [referencesReady, setReferencesReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [vendors, setVendors] = useState<VendorReference[]>([]);
  const [orders, setOrders] = useState<OrderReference[]>([]);
  const [invoices, setInvoices] = useState<InvoiceReference[]>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [operationId, setOperationId] = useState("");

  const load = useCallback(async (from: string, to: string, signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      setData(await requestOverview(from, to, signal));
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setData(null);
      setError(
        reason instanceof Error
          ? reason.message
          : "Dashboard purchasing belum dapat dimuat",
      );
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => void load(range.from, range.to, controller.signal), 0);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [load, range]);

  function applyFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draftFrom > draftTo) {
      setError("Tanggal awal tidak boleh melewati tanggal akhir.");
      return;
    }
    const start = new Date(`${draftFrom}T00:00:00Z`).getTime();
    const end = new Date(`${draftTo}T00:00:00Z`).getTime();
    if ((end - start) / 86_400_000 >= 366) {
      setError("Rentang laporan maksimal 366 hari.");
      return;
    }
    if (range.from === draftFrom && range.to === draftTo) {
      void load(range.from, range.to);
      return;
    }
    setRange({ from: draftFrom, to: draftTo });
  }

  async function openAction(next: Action) {
    setAction(next);
    setActionError("");
    setReferencesReady(false);
    setSelectedInvoiceId("");
    setSelectedOrderId("");
    setPaymentAmount("");
    setOperationId(crypto.randomUUID());
    setReferencesLoading(true);
    try {
      if (next === "vendor") {
        setVendors(await request<VendorReference[]>("/api/v1/business/vendors"));
      } else if (next === "invoice") {
        const [vendorRows, orderRows] = await Promise.all([
          request<VendorReference[]>("/api/v1/business/vendors"),
          request<OrderReference[]>("/api/v1/business/purchase-orders?limit=100"),
        ]);
        setVendors(vendorRows);
        setOrders(orderRows);
      } else {
        const invoiceRows = await request<InvoiceReference[]>("/api/v1/business/vendor-invoices");
        setInvoices(invoiceRows);
      }
      setReferencesReady(true);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Referensi belum dapat dimuat");
    } finally {
      setReferencesLoading(false);
    }
  }

  function outstanding(invoice: InvoiceReference) {
    return Math.max(0, Number(invoice.outstanding ?? invoice.outstandingAmount ?? invoice.total));
  }

  const selectedInvoice = invoices.find((invoice) => invoice.id === selectedInvoiceId);
  const remaining = selectedInvoice ? outstanding(selectedInvoice) : 0;
  const payableInvoices = invoices.filter((invoice) =>
    ["posted", "partially_paid"].includes(invoice.status) && outstanding(invoice) > 0);

  async function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action || saving) return;
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) || "").trim();
    setActionError("");
    let endpoint: string;
    let body: Record<string, unknown>;
    if (action === "vendor") {
      endpoint = "/api/v1/business/vendors";
      body = { code: value("code"), name: value("name"), phone: value("phone") || undefined,
        email: value("email") || undefined, address: value("address") || undefined,
        paymentTermsDays: Number(value("paymentTermsDays") || 0) };
    } else if (action === "invoice") {
      endpoint = "/api/v1/business/vendor-invoices";
      const selectedOrder = orders.find((order) => order.id === selectedOrderId);
      if (selectedOrder && selectedOrder.vendorId !== value("vendorId")) {
        setActionError("Vendor invoice harus sama dengan vendor PO yang dipilih.");
        return;
      }
      if (value("dueAt") && value("dueAt") < value("issuedAt")) {
        setActionError("Tanggal jatuh tempo tidak boleh sebelum tanggal terbit.");
        return;
      }
      body = { invoiceNumber: value("invoiceNumber"), vendorId: value("vendorId"),
        purchaseOrderId: selectedOrderId || null, total: Number(value("total")),
        issuedAt: value("issuedAt"), dueAt: value("dueAt") || undefined };
    } else {
      endpoint = "/api/v1/business/payments";
      const amount = Number(paymentAmount);
      if (!selectedInvoice || !Number.isFinite(amount) || amount <= 0 || amount > remaining) {
        setActionError(`Jumlah pembayaran harus lebih dari nol dan tidak melebihi sisa ${money.format(remaining)}.`);
        return;
      }
      body = { paymentNumber: `PAY-${operationId.slice(0, 12).toUpperCase()}`,
        direction: "outgoing", vendorInvoiceId: selectedInvoice.id, amount,
        method: value("method"), reference: value("reference") || undefined,
        idempotencyKey: operationId };
    }
    setSaving(true);
    try {
      await request(endpoint, { method: "POST", body: JSON.stringify(body) });
      setAction(null);
      setNotice(action === "vendor" ? "Vendor berhasil dibuat." : action === "invoice" ? "Invoice vendor berhasil dicatat." : "Pembayaran vendor berhasil dicatat.");
      await load(range.from, range.to);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Data gagal disimpan");
    } finally {
      setSaving(false);
    }
  }

  const displayedRange = data?.range ?? range;

  return (
    <section className="mx-auto max-w-7xl">
      <header className="overflow-hidden rounded-3xl bg-slate-950 text-white shadow-xl shadow-slate-950/10">
        <div className="grid gap-6 px-5 py-6 sm:px-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-red-400">
              Purchasing control
            </p>
            <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
              Purchasing &amp; Vendor Dashboard
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Pantau alur PO, penerimaan, invoice, hutang, dan pembayaran vendor
              dalam satu periode kerja.
            </p>
          </div>

          <form
            onSubmit={applyFilter}
            className="grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
            aria-label="Filter periode purchasing"
          >
            <DateField
              label="Dari"
              value={draftFrom}
              max={draftTo}
              onChange={setDraftFrom}
            />
            <DateField
              label="Sampai"
              value={draftTo}
              min={draftFrom}
              max={today()}
              onChange={setDraftTo}
            />
            <button
              type="submit"
              disabled={loading}
              className="min-h-11 cursor-pointer rounded-xl bg-red-600 px-5 text-sm font-black text-white transition-colors hover:bg-red-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Memuat..." : "Terapkan"}
            </button>
          </form>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-white/10 px-5 py-3 sm:px-7">
          {([ ["vendor", "Buat vendor"], ["invoice", "Catat invoice vendor"], ["payment", "Catat pembayaran vendor"] ] as const).filter(([key]) => key === "vendor" ? ["owner", "admin", "warehouse"].includes(role) : ["owner", "admin", "finance"].includes(role)).map(([key, label]) => (
            <button key={key} type="button" onClick={() => void openAction(key)}
              className="min-h-11 cursor-pointer rounded-xl border border-white/20 bg-white/10 px-4 text-sm font-bold text-white transition hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              {label}
            </button>
          ))}
        </div>
        <div className="border-t border-white/10 px-5 py-3 text-xs font-semibold text-slate-400 sm:px-7">
          Periode {formatDate(displayedRange.from)} - {formatDate(displayedRange.to)}
        </div>
      </header>

      {notice && <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">{notice}</p>}

      {action && (
        <AccessibleDialog labelledBy="purchasing-action-title" onClose={() => { if (!saving) setAction(null); }}>
          <h2 id="purchasing-action-title" className="pr-12 text-xl font-black text-slate-950">
            {action === "vendor" ? "Buat vendor" : action === "invoice" ? "Catat invoice vendor" : "Catat pembayaran vendor"}
          </h2>
          <p className="mt-1 text-sm text-slate-600">Lengkapi data berikut sebelum menyimpan.</p>
          {referencesLoading ? <p role="status" className="mt-6 text-sm text-slate-600">Memuat referensi...</p> : !referencesReady ? (
            <div className="mt-6 space-y-4"><p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-900">{actionError}</p>
              <button type="button" onClick={() => void openAction(action)} className="min-h-11 cursor-pointer rounded-xl bg-red-700 px-4 text-sm font-bold text-white hover:bg-red-800">Coba lagi</button>
            </div>
          ) : (
            <form onSubmit={(event) => void submitAction(event)} className="mt-6 space-y-4">
              {actionError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-900">{actionError}</p>}
              {action === "vendor" && <>
                <ActionField label="Kode vendor" name="code" required minLength={2} maxLength={40} />
                <ActionField label="Nama vendor" name="name" required minLength={2} maxLength={160} />
                <ActionField label="Telepon" name="phone" maxLength={40} />
                <ActionField label="Email" name="email" type="email" />
                <ActionField label="Alamat" name="address" maxLength={1000} />
                <ActionField label="Termin pembayaran (hari)" name="paymentTermsDays" type="number" min="0" max="365" defaultValue="0" required />
              </>}
              {action === "invoice" && <>
                <ActionField label="Nomor invoice" name="invoiceNumber" required minLength={2} maxLength={100} />
                <label className="block text-sm font-bold text-slate-700">Vendor
                  <select name="vendorId" required defaultValue="" className={actionInput}>
                    <option value="" disabled>Pilih vendor</option>
                    {vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.code} - {vendor.name}</option>)}
                  </select>
                </label>
                <label className="block text-sm font-bold text-slate-700">Purchase order (opsional)
                  <select value={selectedOrderId} onChange={(event) => setSelectedOrderId(event.target.value)} className={actionInput}>
                    <option value="">Tanpa PO</option>
                    {orders.filter((order) => ["partially_received", "received"].includes(order.status)).map((order) => <option key={order.id} value={order.id}>{order.orderNumber} - {order.vendor}</option>)}
                  </select>
                </label>
                <ActionField label="Total invoice (Rp)" name="total" type="number" min="0.01" step="0.01" required />
                <div className="grid gap-4 sm:grid-cols-2">
                  <ActionField label="Tanggal terbit" name="issuedAt" type="date" defaultValue={today()} required />
                  <ActionField label="Jatuh tempo" name="dueAt" type="date" />
                </div>
              </>}
              {action === "payment" && <>
                <label className="block text-sm font-bold text-slate-700">Invoice dengan sisa hutang
                  <select required value={selectedInvoiceId} onChange={(event) => { setSelectedInvoiceId(event.target.value); setPaymentAmount(""); }} className={actionInput}>
                    <option value="">Pilih invoice</option>
                    {payableInvoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoiceNumber} - {invoice.vendor} ({money.format(outstanding(invoice))})</option>)}
                  </select>
                </label>
                {!payableInvoices.length && <p className="text-sm text-amber-800">Belum ada invoice yang dapat dibayar.</p>}
                <label className="block text-sm font-bold text-slate-700">Jumlah pembayaran (maks. {money.format(remaining)})
                  <input name="amount" type="number" min="0.01" step="0.01" max={remaining || undefined} value={paymentAmount}
                    onChange={(event) => setPaymentAmount(event.target.value)} required className={actionInput} />
                </label>
                <label className="block text-sm font-bold text-slate-700">Metode pembayaran
                  <select name="method" defaultValue="transfer" className={actionInput}>
                    <option value="transfer">Transfer</option><option value="cash">Tunai</option>
                    <option value="card">Kartu</option><option value="other">Lainnya</option>
                  </select>
                </label>
                <ActionField label="Referensi pembayaran (opsional)" name="reference" maxLength={200} />
              </>}
              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                <button type="button" disabled={saving} onClick={() => setAction(null)} className="min-h-11 cursor-pointer rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Batal</button>
                <button type="submit" disabled={saving || (action === "payment" && !payableInvoices.length)} className="min-h-11 cursor-pointer rounded-xl bg-red-700 px-5 text-sm font-black text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Menyimpan..." : "Simpan"}</button>
              </div>
            </form>
          )}
        </AccessibleDialog>
      )}

      {error ? (
        <ErrorState
          message={error}
          onRetry={() => load(range.from, range.to)}
        />
      ) : loading ? (
        <LoadingState />
      ) : data ? (
        <DashboardContent data={data} />
      ) : null}
    </section>
  );
}

function DashboardContent({ data }: { data: PurchasingOverview }) {
  const metrics = [
    {
      label: "Purchase order",
      value: integer.format(data.summary.totalPurchaseOrders),
      helper: "PO pada periode terpilih",
      tone: "slate" as const,
      icon: "document" as const,
    },
    {
      label: "Receiving",
      value: integer.format(data.summary.totalReceipts),
      helper: "Dokumen penerimaan barang",
      tone: "blue" as const,
      icon: "box" as const,
    },
    {
      label: "Nilai pembelian",
      value: money.format(data.summary.purchaseValue),
      helper: "Nilai PO periode berjalan",
      tone: "emerald" as const,
      icon: "chart" as const,
    },
    {
      label: "Total hutang",
      value: money.format(data.summary.outstandingVendorDebt),
      helper: "Outstanding invoice vendor",
      tone: "amber" as const,
      icon: "clock" as const,
    },
    {
      label: "Pembayaran periode ini",
      value: money.format(data.summary.outgoingVendorPayments),
      helper: "Kas keluar untuk vendor pada periode terpilih",
      tone: "red" as const,
      icon: "wallet" as const,
    },
  ];

  return (
    <div className="mt-5 space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </div>

      <ProcessFlow data={data} />
      <PurchaseHistory rows={data.recentPurchaseChain} />

      <div className="grid gap-5 xl:grid-cols-12">
        <div className="xl:col-span-5">
          <PayableAgingPanel aging={data.payableAging} />
        </div>
        <div className="xl:col-span-4">
          <TopVendorsPanel rows={data.topVendors} />
        </div>
        <div className="xl:col-span-3">
          <PaymentStatusPanel rows={data.paymentStatusComposition} />
        </div>
      </div>
    </div>
  );
}

function DateField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs font-bold uppercase tracking-wide text-slate-300">
      {label}
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 min-h-11 w-full rounded-xl border border-white/15 bg-white/10 px-3 text-sm font-semibold text-white scheme-dark outline-none transition focus:border-white/40 focus:ring-2 focus:ring-white/20"
      />
    </label>
  );
}

function MetricCard({
  label,
  value,
  helper,
  tone,
  icon,
}: {
  label: string;
  value: string;
  helper: string;
  tone: "slate" | "blue" | "emerald" | "amber" | "red";
  icon: IconName;
}) {
  const tones = {
    slate: "border-slate-200 bg-white text-slate-700",
    blue: "border-blue-100 bg-blue-50 text-blue-800",
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-800",
    amber: "border-amber-100 bg-amber-50 text-amber-900",
    red: "border-red-100 bg-red-50 text-red-800",
  };
  return (
    <article className={`rounded-2xl border p-4 shadow-sm ${tones[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-black uppercase tracking-wide opacity-75">{label}</p>
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/80 shadow-sm ring-1 ring-black/5">
          <Icon name={icon} className="size-4" />
        </span>
      </div>
      <p className="mt-4 break-words text-xl font-black tabular-nums text-slate-950">
        {value}
      </p>
      <p className="mt-1 text-xs leading-5 opacity-75">{helper}</p>
    </article>
  );
}

function ProcessFlow({ data }: { data: PurchasingOverview }) {
  const stages = [
    { key: "po", label: "Purchase order", count: data.summary.totalPurchaseOrders, value: data.summary.purchaseValue },
    { key: "receiving", label: "Receiving", count: data.summary.totalReceipts, value: data.summary.receivingValue },
    { key: "invoices", label: "Invoice vendor", count: data.paymentStatusComposition.reduce((sum, row) => sum + row.count, 0), value: data.paymentStatusComposition.reduce((sum, row) => sum + row.total, 0) },
    { key: "debt", label: "Hutang terbuka", count: data.paymentStatusComposition.filter((row) => row.status !== "paid").reduce((sum, row) => sum + row.count, 0), value: data.summary.outstandingVendorDebt },
    { key: "payment", label: "Pembayaran", count: data.paymentStatusComposition.find((row) => row.status === "paid")?.count ?? 0, value: data.summary.outgoingVendorPayments },
  ];
  return (
    <Panel
      title="Process flow purchasing"
      description="Posisi dokumen dari permintaan pembelian hingga pembayaran vendor."
    >
      {stages.length ? (
        <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {stages.map((stage, index) => (
            <li
              key={stage.key}
              className="relative rounded-2xl border border-slate-200 bg-slate-50 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="grid size-8 place-items-center rounded-full bg-slate-950 text-xs font-black text-white">
                  {index + 1}
                </span>
                <span className="text-xs font-bold text-slate-500">
                  {integer.format(stage.count)} dokumen
                </span>
              </div>
              <h3 className="mt-4 font-black text-slate-950">{stage.label}</h3>
              <p className="mt-1 text-sm font-black tabular-nums text-red-700">
                {money.format(stage.value)}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState text="Belum ada proses purchasing pada periode ini." />
      )}
    </Panel>
  );
}

function PurchaseHistory({ rows }: { rows: PurchaseHistoryRow[] }) {
  return (
    <Panel
      title="Riwayat pembelian terintegrasi"
      description="Jejak PO, receiving, invoice, dan pembayaran dalam satu tampilan."
    >
      {rows.length ? (
        <>
          <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 lg:block">
            <table className="w-full min-w-[1080px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">PO / Tanggal</th>
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3">Receiving</th>
                  <th className="px-4 py-3">Invoice</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Terbayar</th>
                  <th className="px-4 py-3 text-right">Sisa</th>
                  <th className="px-4 py-3">Pembayaran</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {rows.map((row) => (
                  <tr key={row.purchaseOrderId} className="transition-colors hover:bg-slate-50/80">
                    <td className="px-4 py-4">
                      <strong className="block text-slate-950">{row.purchaseOrderNumber}</strong>
                      <span className="mt-1 block text-xs text-slate-500">
                        {formatDate(row.orderDate)}
                      </span>
                      <StatusBadge value={row.status} />
                    </td>
                    <td className="px-4 py-4">
                      <strong className="block text-slate-900">{row.vendorName}</strong>
                      <span className="text-xs text-slate-500">Vendor</span>
                    </td>
                    <td className="px-4 py-4">
                      <span className="block font-bold text-slate-800">
                        {row.receiptCount ? `${integer.format(row.receiptCount)} penerimaan` : "Belum diterima"}
                      </span>
                      {row.receiptCount ? <span className="text-xs text-slate-500">{money.format(row.receivedValue)}</span> : null}
                    </td>
                    <td className="px-4 py-4">
                      <span className="block font-bold text-slate-800">
                        {row.invoiceNumber || "Belum ditagihkan"}
                      </span>
                      <span className="mt-1 block text-xs text-slate-500">
                        {row.invoices.length > 1 ? `${row.invoices.length} invoice terkait` : "-"}
                      </span>
                    </td>
                    <MoneyCell value={row.total} />
                    <MoneyCell value={row.invoices.reduce((sum, invoice) => sum + invoice.paid, 0)} />
                    <MoneyCell value={row.purchaseOrderOutstanding} emphasis />
                    <td className="px-4 py-4"><StatusBadge value={row.paymentStatus || (row.invoices.length ? "unpaid" : "belum ditagihkan")} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 lg:hidden">
            {rows.map((row) => (
              <article key={row.purchaseOrderId} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-slate-950">{row.purchaseOrderNumber}</p>
                    <p className="mt-1 text-xs text-slate-500">{formatDate(row.orderDate)}</p>
                  </div>
                  <StatusBadge value={row.paymentStatus || (row.invoices.length ? "unpaid" : "belum ditagihkan")} />
                </div>
                <p className="mt-4 text-sm font-bold text-slate-900">{row.vendorName}</p>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <MobileDatum label="Receiving" value={row.receiptCount ? `${integer.format(row.receiptCount)} penerimaan` : "Belum diterima"} />
                  <MobileDatum label="Invoice" value={row.invoiceNumber || "Belum ditagihkan"} />
                  <MobileDatum label="Total" value={money.format(row.total)} />
                  <MobileDatum label="Sisa hutang" value={money.format(row.purchaseOrderOutstanding)} accent />
                </dl>
              </article>
            ))}
          </div>
        </>
      ) : (
        <EmptyState text="Belum ada riwayat pembelian pada periode ini." />
      )}
    </Panel>
  );
}

function PayableAgingPanel({ aging }: { aging: PayableAging }) {
  const rows = [
    { label: "Belum jatuh tempo", value: aging.notDue, tone: "bg-blue-600" },
    { label: "Overdue 1-30 hari", value: aging.overdue1To30, tone: "bg-amber-500" },
    { label: "Overdue 31-60 hari", value: aging.overdue31To60, tone: "bg-orange-600" },
    { label: "Overdue >60 hari", value: aging.overdue61Plus, tone: "bg-red-700" },
  ];
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  return (
    <Panel title="Aging hutang" description="Prioritas pembayaran berdasarkan umur tagihan.">
      <div className="space-y-4">
        {rows.map((row) => {
          const percentage = total ? (row.value / total) * 100 : 0;
          return (
            <div key={row.label}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-bold text-slate-700">{row.label}</span>
                <strong className="tabular-nums text-slate-950">{money.format(row.value)}</strong>
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${row.tone}`}
                  style={{ width: `${percentage ? Math.max(percentage, 2) : 0}%` }}
                  aria-hidden="true"
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
        <span className="text-sm font-bold text-slate-600">Total outstanding</span>
        <strong className="tabular-nums text-slate-950">{money.format(total)}</strong>
      </div>
    </Panel>
  );
}

function TopVendorsPanel({ rows }: { rows: TopVendor[] }) {
  const maximum = Math.max(1, ...rows.map((row) => row.purchaseValue));
  return (
    <Panel title="Top vendor" description="Vendor dengan nilai pembelian terbesar.">
      {rows.length ? (
        <ol className="space-y-3">
          {rows.slice(0, 5).map((row, index) => {
            const percentage = (row.purchaseValue / maximum) * 100;
            return (
                  <li key={row.vendorId} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3">
                <span className="grid size-8 place-items-center rounded-lg bg-slate-950 text-xs font-black text-white">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/business/vendors/${row.vendorId}`} className="block truncate text-sm font-black text-blue-800 hover:underline">{row.name}</Link>
                      <p className="text-xs text-slate-500">{integer.format(row.purchaseOrderCount)} PO</p>
                    </div>
                    <strong className="shrink-0 text-sm tabular-nums text-slate-950">
                      {money.format(row.purchaseValue)}
                    </strong>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-slate-700" style={{ width: `${Math.min(Math.max(percentage, 2), 100)}%` }} />
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500">
                    Outstanding {money.format(row.outstanding)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <EmptyState text="Belum ada aktivitas vendor pada periode ini." />
      )}
    </Panel>
  );
}

function PaymentStatusPanel({ rows }: { rows: PaymentStatus[] }) {
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const tones = ["bg-emerald-600", "bg-amber-500", "bg-red-700", "bg-slate-500"];
  return (
    <Panel title="Status pembayaran" description="Komposisi invoice vendor.">
      {rows.length ? (
        <div className="space-y-4">
          <div className="flex h-3 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
            {rows.map((row, index) => {
              const percentage = total ? (row.total / total) * 100 : 0;
              return <span key={row.status} className={tones[index % tones.length]} style={{ width: `${percentage}%` }} />;
            })}
          </div>
          <ul className="space-y-3">
            {rows.map((row, index) => (
              <li key={row.status} className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2">
                  <span className={`mt-1 size-2.5 shrink-0 rounded-full ${tones[index % tones.length]}`} />
                  <div>
                    <p className="text-sm font-bold capitalize text-slate-800">{humanize(row.status)}</p>
                    <p className="text-xs text-slate-500">{integer.format(row.count)} invoice</p>
                  </div>
                </div>
                <strong className="shrink-0 text-sm tabular-nums text-slate-950">{money.format(row.total)}</strong>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <EmptyState text="Belum ada invoice vendor pada periode ini." />
      )}
    </Panel>
  );
}

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="h-full rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div>
        <h2 className="text-lg font-black tracking-tight text-slate-950">{title}</h2>
        {description ? <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p> : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function MoneyCell({ value, emphasis = false }: { value: number; emphasis?: boolean }) {
  return (
    <td className={`px-4 py-4 text-right font-black tabular-nums ${emphasis && value > 0 ? "text-red-700" : "text-slate-900"}`}>
      {money.format(value)}
    </td>
  );
}

function MobileDatum({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={`mt-1 break-words font-black tabular-nums ${accent ? "text-red-700" : "text-slate-900"}`}>
        {value}
      </dd>
    </div>
  );
}

function StatusBadge({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const tone = normalized.includes("overdue") || normalized.includes("rejected") || normalized.includes("cancel")
      ? "bg-red-100 text-red-800"
      : normalized.includes("partial") || normalized.includes("pending") || normalized.includes("draft")
        ? "bg-amber-100 text-amber-900"
        : normalized === "paid"
          ? "bg-emerald-100 text-emerald-800"
        : normalized.includes("received") || normalized.includes("approved")
          ? "bg-blue-100 text-blue-800"
          : "bg-slate-100 text-slate-700";
  return (
    <span className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-black capitalize ${tone}`}>
      {humanize(value)}
    </span>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => Promise<void> }) {
  return (
    <div role="alert" className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-950">
      <p className="font-black">Dashboard belum dapat dimuat</p>
      <p className="mt-1 text-sm leading-6">{message}</p>
      <button
        type="button"
        onClick={() => void onRetry()}
        className="mt-4 min-h-11 cursor-pointer rounded-xl bg-red-700 px-4 text-sm font-black text-white transition-colors hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
      >
        Coba lagi
      </button>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="mt-5 space-y-5" aria-busy="true" aria-label="Memuat dashboard purchasing">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="h-36 animate-pulse rounded-2xl bg-slate-200" />
        ))}
      </div>
      <div className="h-52 animate-pulse rounded-3xl bg-slate-200" />
      <div className="h-80 animate-pulse rounded-3xl bg-slate-200" />
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm leading-6 text-slate-600">
      {text}
    </p>
  );
}

const actionInput = "mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-950 outline-none focus:border-red-600 focus:ring-2 focus:ring-red-100";

function ActionField({ label, name, type = "text", ...props }: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: string;
  max?: string;
  step?: string;
  defaultValue?: string;
}) {
  return <label className="block text-sm font-bold text-slate-700">{label}
    <input name={name} type={type} className={actionInput} {...props} />
  </label>;
}

type IconName = "document" | "box" | "chart" | "clock" | "wallet";

function Icon({ name, className }: { name: IconName; className?: string }) {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (name === "document") return <svg {...common}><path d="M6 2h9l3 3v17H6z" /><path d="M14 2v5h5M9 13h6M9 17h6" /></svg>;
  if (name === "box") return <svg {...common}><path d="m21 8-9 5-9-5 9-5z" /><path d="m3 8 9 5 9-5v8l-9 5-9-5z" /><path d="M12 13v8" /></svg>;
  if (name === "chart") return <svg {...common}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>;
  if (name === "clock") return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
  return <svg {...common}><path d="M3 6h18v14H3z" /><path d="M3 9h18M16 14h2" /></svg>;
}

function formatDate(value: string) {
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? "-" : date.format(parsed);
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replaceAll("-", " ");
}
