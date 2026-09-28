"use client";

import { AccessibleDialog } from "@/components/AccessibleDialog";
import { FormEvent, ReactNode, useCallback, useEffect, useId, useMemo, useState } from "react";

type Warehouse = { id: string; code: string; name: string };
type StockItem = { warehouseId: string; warehouse: string; productId: string; partCode: string; name: string; quantity: number; reservedQuantity: number; minimumStock: number; lowStock: boolean; value?: number | null };
type TrendPoint = { date: string; incoming: number; outgoing: number };
type Overview = {
  summary: { totalItems?: number; inventoryValue?: number | null; lowStockCount?: number; incomingTransactions?: number; outgoingTransactions?: number };
  stockOverview: Array<{ warehouseId: string; warehouseCode: string; warehouseName: string; quantity: number; reservedQuantity: number; availableQuantity: number; value: number | null; lowStockCount: number }>;
  movementTrend: TrendPoint[];
  topUsed: Array<{ productId: string; partCode: string; name: string; quantity: number }>;
  lowStock: StockItem[];
};
type Movement = { id: string; occurredAt?: string; movementType: string; quantity: number; partCode?: string; productName?: string; warehouseName?: string; unitCost?: number | null; value?: number | null; reason?: string | null };
type Vendor = { id: string; code: string; name: string };
type PurchaseOrder = { id: string; orderNumber: string; status: string; vendor?: string; vendorName?: string; expectedDate?: string | null; items?: Array<{ id: string; productId: string; partCode?: string; name?: string; productName?: string; quantity?: number; orderedQuantity?: number; receivedQuantity?: number; unitPrice?: number }> };
type Receipt = { id: string; receiptNumber: string; purchaseOrderNumber?: string; warehouse?: string; receivedAt?: string; status?: string };
type Opname = { id: string; opnameNumber: string; warehouse?: string; status: string; startedAt?: string; postedAt?: string | null };
type ApiEnvelope<T> = { data: T; error?: { message?: string; fields?: Record<string, string[]> } | null };
type Dialog = "adjustment" | "opname" | "purchase" | "receiving" | null;

const money = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });
const date = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" });
const today = () => new Date().toISOString().slice(0, 10);
const startOfMonth = () => `${today().slice(0, 8)}01`;
const orderNumber = (prefix: string) => `${prefix}-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;

async function api<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const body = await response.json().catch(() => null) as ApiEnvelope<T> | null;
  if (!response.ok || !body?.data) throw new Error(body?.error?.message || "Permintaan inventory gagal");
  return body.data;
}

function Panel({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"><div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-lg font-black tracking-tight text-slate-950">{title}</h2>{description && <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>}</div></div><div className="mt-5">{children}</div></section>;
}

function Empty({ text }: { text: string }) { return <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-sm text-slate-600">{text}</p>; }

function Status({ value }: { value: string }) {
  const tone = value.includes("approved") || value === "received" || value === "posted" ? "bg-emerald-100 text-emerald-800" : value.includes("partial") || value === "counting" ? "bg-amber-100 text-amber-900" : value.includes("cancel") || value.includes("reject") ? "bg-red-100 text-red-800" : "bg-blue-100 text-blue-800";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-black ${tone}`}>{value.replaceAll("_", " ")}</span>;
}

function TrendChart({ points }: { points: TrendPoint[] }) {
  const visible = points.slice(-30);
  if (!visible.length) return <Empty text="Belum ada pergerakan pada periode ini." />;
  const width = 760; const height = 220; const pad = 30; const max = Math.max(1, ...visible.flatMap((point) => [Math.abs(point.incoming), Math.abs(point.outgoing)]));
  const line = (key: "incoming" | "outgoing") => visible.map((point, index) => {
    const x = pad + index * ((width - pad * 2) / Math.max(visible.length - 1, 1));
    const y = height - pad - (Math.abs(point[key]) / max) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return <div><div className="mb-3 flex flex-wrap gap-4 text-xs font-bold"><span className="text-emerald-700">● Masuk</span><span className="text-red-700">● Keluar</span></div><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Grafik pergerakan stok masuk dan keluar" className="h-auto w-full"><path d={`M${pad} ${height - pad}H${width - pad} M${pad} ${pad}V${height - pad}`} fill="none" stroke="#cbd5e1" /><polyline points={line("incoming")} fill="none" stroke="#059669" strokeWidth="4" strokeLinejoin="round" /><polyline points={line("outgoing")} fill="none" stroke="#dc2626" strokeWidth="4" strokeLinejoin="round" /></svg><div className="mt-2 flex justify-between text-xs text-slate-500"><span>{date.format(new Date(visible[0].date))}</span><span>{date.format(new Date(visible.at(-1)!.date))}</span></div><table className="sr-only"><caption>Data pergerakan stok</caption><tbody>{visible.map((point) => <tr key={point.date}><td>{point.date}</td><td>{point.incoming}</td><td>{point.outgoing}</td></tr>)}</tbody></table></div>;
}

export function InventoryWorkspace() {
  const [warehouseId, setWarehouseId] = useState("");
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(today());
  const [tab, setTab] = useState("overview");
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [opnames, setOpnames] = useState<Opname[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [saving, setSaving] = useState(false);
  const [selectedPurchaseOrderId, setSelectedPurchaseOrderId] = useState("");
  const titleId = useId();

  const query = useMemo(() => new URLSearchParams({ ...(warehouseId ? { warehouseId } : {}), from, to }).toString(), [warehouseId, from, to]);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [nextWarehouses, nextOverview, nextStock, nextMovements, nextOrders, nextReceipts, nextOpnames, nextVendors] = await Promise.all([
        api<Warehouse[]>("/api/v1/operations/warehouses"),
        api<Overview>(`/api/v1/intelligence/inventory-overview?${query}`),
        api<StockItem[]>("/api/v1/operations/inventory/balances"),
        api<Movement[]>(`/api/v1/operations/inventory/movements?${query}`),
        api<PurchaseOrder[]>("/api/v1/business/purchase-orders"),
        api<Receipt[]>("/api/v1/business/receipts"),
        api<Opname[]>("/api/v1/operations/inventory/opnames"),
        api<Vendor[]>("/api/v1/business/vendors"),
      ]);
      setWarehouses(nextWarehouses); setOverview(nextOverview); setStock(nextStock.filter((item) => !warehouseId || item.warehouseId === warehouseId)); setMovements(nextMovements); setPurchaseOrders(nextOrders); setReceipts(nextReceipts); setOpnames(nextOpnames); setVendors(nextVendors);
      if (!warehouseId && nextWarehouses[0]) setWarehouseId(nextWarehouses[0].id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Data inventory belum dapat dimuat"); }
    finally { setLoading(false); }
  }, [query, warehouseId]);
  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const products = useMemo(() => [...stock].sort((first, second) => first.name.localeCompare(second.name)), [stock]);
  const selectedPurchaseOrder = purchaseOrders.find((order) => order.id === selectedPurchaseOrderId);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setSaving(true); setMessage("");
    try {
      if (dialog === "adjustment") {
        const movementType = String(form.get("movementType")); const quantity = Number(form.get("quantity"));
        const signedQuantity = movementType === "adjustment_out" ? -Math.abs(quantity) : Math.abs(quantity);
        await api("/api/v1/operations/inventory/movements", { method: "POST", body: JSON.stringify({ warehouseId: form.get("warehouseId"), productId: form.get("productId"), movementType, quantity: signedQuantity, unitCost: Number(form.get("unitCost") || 0), referenceType: "manual_adjustment", idempotencyKey: crypto.randomUUID(), reason: form.get("reason") || undefined }) });
        setMessage("Penyesuaian stok berhasil dicatat.");
      }
      if (dialog === "opname") {
        await api("/api/v1/operations/inventory/opnames", { method: "POST", body: JSON.stringify({ opnameNumber: form.get("opnameNumber"), warehouseId: form.get("warehouseId"), notes: form.get("notes") || undefined }) });
        setMessage("Stock opname dibuat. Lanjutkan penghitungan sebelum posting.");
      }
      if (dialog === "purchase") {
        const productIds = form.getAll("productId").map(String);
        const quantities = form.getAll("quantity").map(Number);
        const unitPrices = form.getAll("unitPrice").map(Number);
        const items = productIds.map((productId, index) => ({ productId, quantity: quantities[index], unitPrice: unitPrices[index] }));
        if (!items.length || items.some((item) => !item.productId || !Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.unitPrice) || item.unitPrice < 0)) throw new Error("Lengkapi setiap item PO dengan produk, kuantitas, dan harga/unit yang valid.");
        if (new Set(productIds).size !== productIds.length) throw new Error("Produk yang sama tidak boleh ditambahkan lebih dari sekali dalam satu PO.");
        await api("/api/v1/business/purchase-orders", { method: "POST", body: JSON.stringify({ orderNumber: form.get("orderNumber"), vendorId: form.get("vendorId"), expectedDate: form.get("expectedDate") || undefined, notes: form.get("notes") || undefined, items }) });
        setMessage("Purchase order draft dibuat.");
      }
      if (dialog === "receiving") {
        const order = selectedPurchaseOrder; if (!order) throw new Error("Pilih purchase order terlebih dahulu");
        const items = (order.items ?? []).map((item) => {
          const ordered = Number(item.orderedQuantity ?? item.quantity ?? 0);
          const previouslyReceived = Number(item.receivedQuantity ?? 0);
          const remaining = Math.max(0, ordered - previouslyReceived);
          const quantity = Number(form.get(`quantity-${item.id}`) || 0);
          const unitCost = Number(form.get(`unitCost-${item.id}`) || 0);
          const itemName = item.productName || item.name || item.partCode || "Produk";
          if (!Number.isFinite(quantity) || quantity < 0) throw new Error(`Kuantitas penerimaan ${itemName} tidak valid.`);
          if (quantity > remaining + Number.EPSILON) throw new Error(`Kuantitas penerimaan ${itemName} melebihi sisa ${number.format(remaining)}.`);
          if (!Number.isFinite(unitCost) || unitCost < 0) throw new Error(`Biaya/unit ${itemName} tidak valid.`);
          return { purchaseOrderItemId: item.id, quantity, unitCost };
        }).filter((item) => item.quantity > 0);
        if (!items.length) throw new Error("Masukkan minimal satu jumlah penerimaan");
        await api("/api/v1/business/receipts", { method: "POST", body: JSON.stringify({ receiptNumber: form.get("receiptNumber"), purchaseOrderId: order.id, warehouseId: form.get("warehouseId"), notes: form.get("notes") || undefined, idempotencyKey: crypto.randomUUID(), items }) });
        setMessage("Penerimaan barang berhasil dicatat dan stok diperbarui.");
      }
      setDialog(null); setSelectedPurchaseOrderId(""); await load();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Aksi inventory gagal"); }
    finally { setSaving(false); }
  }
  async function updatePurchaseOrder(id: string, status: "submitted" | "approved") {
    setSaving(true); setMessage("");
    try {
      await api(`/api/v1/business/purchase-orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      setMessage(status === "submitted" ? "Purchase order diajukan untuk approval." : "Purchase order disetujui dan siap diterima.");
      await load();
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Status purchase order gagal diperbarui"); }
    finally { setSaving(false); }
  }

  const tabs = [{ key: "overview", label: "Overview" }, { key: "movement", label: "Movement" }, { key: "purchasing", label: "Purchasing" }, { key: "receiving", label: "Receiving" }, { key: "opname", label: "Opname" }];
  return <section className="mx-auto max-w-7xl" aria-labelledby="inventory-title">
    <section className="overflow-hidden rounded-3xl border border-slate-900 bg-slate-950 text-white shadow-xl"><div className="flex flex-col gap-5 p-5 sm:p-7 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-black uppercase tracking-[.2em] text-red-400">Page 6 · Inventory Control</p><h1 id="inventory-title" className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Kontrol stok, pembelian, dan opname.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Pantau saldo gudang, pergerakan, kebutuhan restock, serta penerimaan barang dalam satu workspace.</p></div><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setDialog("adjustment")} className="min-h-11 rounded-xl bg-white px-4 text-sm font-black text-slate-950 hover:bg-slate-100">Penyesuaian stok</button><button type="button" onClick={() => setDialog("opname")} className="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-black text-white hover:bg-red-500">Buat opname</button></div></div><div className="border-t border-white/10 px-5 py-3 sm:px-7"><div role="tablist" aria-label="Workspace inventory" className="flex gap-2 overflow-x-auto">{tabs.map((item) => <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} onClick={() => setTab(item.key)} className={`min-h-11 shrink-0 rounded-xl px-4 text-sm font-bold ${tab === item.key ? "bg-red-600 text-white" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}>{item.label}</button>)}</div></div></section>

    <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_11rem_11rem_auto]"><label><span className="mb-1 block text-sm font-bold text-slate-700">Gudang</span><select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} className="dashboard-input min-h-11 w-full rounded-xl border px-3">{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</select></label><label><span className="mb-1 block text-sm font-bold text-slate-700">Dari</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="dashboard-input min-h-11 w-full rounded-xl border px-3" /></label><label><span className="mb-1 block text-sm font-bold text-slate-700">Sampai</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="dashboard-input min-h-11 w-full rounded-xl border px-3" /></label><button type="button" onClick={() => void load()} className="mt-6 min-h-11 rounded-xl border border-slate-300 bg-slate-50 px-4 text-sm font-black text-slate-700 hover:bg-slate-100">Muat ulang</button></div>{message && <p role="status" className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm font-bold text-blue-900">{message}</p>}</section>

    {loading && <div aria-busy="true" className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="h-32 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />)}</div>}
    {!loading && error && <section role="alert" className="mt-5 rounded-3xl border border-red-200 bg-red-50 p-6 text-red-950"><h2 className="font-black">Data inventory belum dapat dimuat</h2><p className="mt-1 text-sm">{error}</p><button type="button" onClick={() => void load()} className="mt-4 min-h-11 rounded-xl bg-red-700 px-4 text-sm font-bold text-white">Coba lagi</button></section>}
    {!loading && !error && overview && <>
      <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Kpi label="Nilai stok" value={overview.summary.inventoryValue === null ? "Akses finance diperlukan" : money.format(overview.summary.inventoryValue ?? 0)} helper="Nilai persediaan terpantau" tone="blue" /><Kpi label="SKU aktif" value={number.format(overview.summary.totalItems ?? stock.length)} helper="Produk pada gudang pilihan" tone="emerald" /><Kpi label="Stok rendah" value={number.format(overview.summary.lowStockCount ?? overview.lowStock.length)} helper="Perlu restock atau cek minimum" tone="amber" /><Kpi label="Stok terpesan" value={number.format(stock.reduce((total, item) => total + item.reservedQuantity, 0))} helper="Dialokasikan untuk service" tone="violet" /></section>
      {tab === "overview" && <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(18rem,.8fr)]"><div className="space-y-5"><Panel title="Saldo stok" description="Saldo aktual, terpesan, dan batas minimum per produk."><StockTable rows={stock} /></Panel><Panel title="Tren pergerakan" description="Masuk dan keluar dalam periode yang dipilih."><TrendChart points={overview.movementTrend} /></Panel></div><div className="space-y-5"><Panel title="Stok rendah" description="Prioritaskan sebelum stok habis."><LowStock rows={overview.lowStock} /></Panel><Panel title="Pemakaian terbanyak" description="Produk paling sering keluar."><TopUsed rows={overview.topUsed} /></Panel></div></div>}
      {tab === "movement" && <div className="mt-5"><Panel title="Ledger pergerakan" description="Riwayat mutasi stok pada gudang dan periode terpilih."><MovementList rows={movements} /></Panel></div>}
      {tab === "purchasing" && <div className="mt-5"><Panel title="Purchase order" description="Buat draft PO, ajukan, setujui, lalu teruskan ke penerimaan barang."><div className="mb-4 flex justify-end"><button type="button" onClick={() => setDialog("purchase")} className="min-h-11 rounded-xl bg-blue-700 px-4 text-sm font-black text-white hover:bg-blue-800">Buat purchase order</button></div><PurchaseList rows={purchaseOrders} busy={saving} onStatusChange={updatePurchaseOrder} /></Panel></div>}
      {tab === "receiving" && <div className="mt-5"><Panel title="Penerimaan barang" description="Pilih PO yang disetujui, cek sisa barang, lalu catat biaya aktual."><div className="mb-4 flex justify-end"><button type="button" onClick={() => setDialog("receiving")} className="min-h-11 rounded-xl bg-emerald-700 px-4 text-sm font-black text-white hover:bg-emerald-800">Terima barang</button></div><ReceiptList rows={receipts} /></Panel></div>}
      {tab === "opname" && <div className="mt-5"><Panel title="Stock opname" description="Buat sesi hitung stok untuk gudang, lalu posting hasil dari proses opname."><div className="mb-4 flex justify-end"><button type="button" onClick={() => setDialog("opname")} className="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-black text-white hover:bg-red-700">Buat sesi opname</button></div><OpnameList rows={opnames} /></Panel></div>}
    </>}

    {dialog && <AccessibleDialog labelledBy={titleId} onClose={() => !saving && setDialog(null)} showCloseButton panelClassName={dialog === "purchase" || dialog === "receiving" ? "max-w-5xl" : "max-w-2xl"}><form onSubmit={submit} className="space-y-5"><div><p className="dashboard-eyebrow">Inventory action</p><h2 id={titleId} className="mt-1 text-2xl font-black text-slate-950">{dialog === "adjustment" ? "Penyesuaian stok" : dialog === "opname" ? "Buat stock opname" : dialog === "purchase" ? "Buat purchase order" : "Terima barang"}</h2><p className="mt-1 text-sm leading-6 text-slate-600">{dialog === "receiving" ? "Hanya PO approved atau partially received yang dapat diterima." : "Data divalidasi server sebelum disimpan."}</p></div>{dialog === "adjustment" && <AdjustmentFields warehouses={warehouses} products={products} warehouseId={warehouseId} />}{dialog === "opname" && <OpnameFields warehouses={warehouses} warehouseId={warehouseId} />}{dialog === "purchase" && <PurchaseFields vendors={vendors} products={products} />}{dialog === "receiving" && <ReceivingFields warehouses={warehouses} warehouseId={warehouseId} orders={purchaseOrders} selectedId={selectedPurchaseOrderId} onSelect={setSelectedPurchaseOrderId} selected={selectedPurchaseOrder} />}<div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={() => setDialog(null)} disabled={saving} className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700">Batal</button><button disabled={saving} className="min-h-11 rounded-xl bg-blue-700 px-4 text-sm font-black text-white disabled:opacity-60">{saving ? "Menyimpan…" : dialog === "receiving" ? "Catat penerimaan" : "Simpan"}</button></div></form></AccessibleDialog>}
  </section>;
}

function Kpi({ label, value, helper, tone }: { label: string; value: string; helper: string; tone: "blue" | "emerald" | "amber" | "violet" }) { const styles = { blue: "border-blue-100 bg-blue-50", emerald: "border-emerald-100 bg-emerald-50", amber: "border-amber-100 bg-amber-50", violet: "border-violet-100 bg-violet-50" }; return <article className={`rounded-2xl border p-5 shadow-sm ${styles[tone]}`}><p className="text-xs font-black uppercase tracking-[.14em] text-slate-600">{label}</p><p className="mt-3 text-2xl font-black tracking-tight tabular-nums text-slate-950">{value}</p><p className="mt-3 border-t border-slate-900/10 pt-3 text-xs font-semibold text-slate-600">{helper}</p></article>; }
function StockTable({ rows }: { rows: StockItem[] }) { return rows.length ? <><div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Produk</th><th className="px-3 py-3">Gudang</th><th className="px-3 py-3 text-right">Saldo</th><th className="px-3 py-3 text-right">Tereservasi</th><th className="px-3 py-3 text-right">Minimum</th></tr></thead><tbody>{rows.map((item) => <tr key={`${item.warehouseId}-${item.productId}`} className="border-b border-slate-100 last:border-0"><td className="px-3 py-3"><p className="font-mono text-xs font-bold text-blue-700">{item.partCode}</p><p className="mt-1 font-bold text-slate-950">{item.name}</p></td><td className="px-3 py-3 text-slate-600">{item.warehouse}</td><td className="px-3 py-3 text-right font-black tabular-nums">{number.format(item.quantity)}</td><td className="px-3 py-3 text-right tabular-nums text-slate-600">{number.format(item.reservedQuantity)}</td><td className="px-3 py-3 text-right"><span className={item.lowStock ? "font-black text-red-700" : "tabular-nums text-slate-600"}>{number.format(item.minimumStock)}{item.lowStock ? " · rendah" : ""}</span></td></tr>)}</tbody></table></div><div className="space-y-3 md:hidden">{rows.map((item) => <article key={`${item.warehouseId}-${item.productId}`} className="rounded-xl border border-slate-200 p-4"><p className="font-mono text-xs font-bold text-blue-700">{item.partCode}</p><p className="mt-1 font-black">{item.name}</p><p className="mt-1 text-sm text-slate-600">{item.warehouse}</p><div className="mt-3 grid grid-cols-3 gap-2 text-xs"><Stat label="Saldo" value={number.format(item.quantity)} /><Stat label="Pesan" value={number.format(item.reservedQuantity)} /><Stat label="Min." value={number.format(item.minimumStock)} danger={item.lowStock} /></div></article>)}</div></> : <Empty text="Tidak ada saldo stok untuk filter ini." />; }
function Stat({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) { return <div className="rounded-lg bg-slate-50 p-2"><p className="text-slate-500">{label}</p><p className={danger ? "mt-1 font-black text-red-700" : "mt-1 font-black text-slate-950"}>{value}</p></div>; }
function LowStock({ rows }: { rows: StockItem[] }) { return rows.length ? <ul className="space-y-3">{rows.slice(0, 8).map((item) => <li key={`${item.warehouseId}-${item.productId}`} className="rounded-xl border border-red-100 bg-red-50 p-3"><p className="font-mono text-xs font-bold text-red-700">{item.partCode}</p><p className="mt-1 font-black text-slate-950">{item.name}</p><p className="mt-2 text-sm text-red-800">{number.format(item.quantity)} tersedia · min. {number.format(item.minimumStock)}</p></li>)}</ul> : <Empty text="Tidak ada stok di bawah minimum." />; }
function TopUsed({ rows }: { rows: Overview["topUsed"] }) { const max = Math.max(1, ...rows.map((item) => item.quantity)); return rows.length ? <ol className="space-y-3">{rows.slice(0, 8).map((item, index) => <li key={item.productId} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-2"><span className="grid size-6 place-items-center rounded-full bg-blue-100 text-xs font-black text-blue-800">{index + 1}</span><div><p className="truncate font-bold text-slate-950">{item.name}</p><p className="mt-1 text-xs text-slate-500">{item.partCode} · {number.format(item.quantity)} unit</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${(item.quantity / max) * 100}%` }} /></div></div></li>)}</ol> : <Empty text="Belum ada data pemakaian." />; }
function MovementList({ rows }: { rows: Movement[] }) { return rows.length ? <div className="space-y-3">{rows.map((movement) => <article key={movement.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-black text-slate-950">{movement.productName || movement.partCode || "Produk"}</p><p className="mt-1 text-xs text-slate-500">{movement.warehouseName || "Gudang"} · {movement.occurredAt ? date.format(new Date(movement.occurredAt)) : "-"}</p>{movement.reason && <p className="mt-2 text-sm text-slate-600">{movement.reason}</p>}</div><div className="sm:text-right"><Status value={movement.movementType} /><p className={movement.quantity < 0 ? "mt-2 font-black tabular-nums text-red-700" : "mt-2 font-black tabular-nums text-emerald-700"}>{movement.quantity > 0 ? "+" : ""}{number.format(movement.quantity)}</p></div></article>)}</div> : <Empty text="Belum ada movement untuk filter ini." />; }
function PurchaseList({ rows, busy, onStatusChange }: { rows: PurchaseOrder[]; busy: boolean; onStatusChange: (id: string, status: "submitted" | "approved") => void }) { return rows.length ? <div className="space-y-3">{rows.map((order) => <article key={order.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-mono font-black text-slate-950">{order.orderNumber}</p><p className="mt-1 text-sm text-slate-600">{order.vendorName || order.vendor || "Vendor belum tersedia"}{order.expectedDate ? ` · Estimasi ${date.format(new Date(order.expectedDate))}` : ""}</p></div><div className="flex flex-wrap items-center gap-2"><Status value={order.status} />{order.status === "draft" && <button type="button" disabled={busy} onClick={() => void onStatusChange(order.id, "submitted")} className="min-h-10 rounded-xl border border-blue-200 bg-blue-50 px-3 text-xs font-black text-blue-800 disabled:opacity-50">Ajukan</button>}{order.status === "submitted" && <button type="button" disabled={busy} onClick={() => void onStatusChange(order.id, "approved")} className="min-h-10 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-black text-emerald-800 disabled:opacity-50">Setujui</button>}</div></article>)}</div> : <Empty text="Belum ada purchase order." />; }
function ReceiptList({ rows }: { rows: Receipt[] }) { return rows.length ? <div className="space-y-3">{rows.map((receipt) => <article key={receipt.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-mono font-black text-slate-950">{receipt.receiptNumber}</p><p className="mt-1 text-sm text-slate-600">{receipt.purchaseOrderNumber || "PO"} · {receipt.warehouse || "Gudang"}</p></div><p className="text-sm font-bold text-slate-600">{receipt.receivedAt ? date.format(new Date(receipt.receivedAt)) : "-"}</p></article>)}</div> : <Empty text="Belum ada penerimaan barang." />; }
function OpnameList({ rows }: { rows: Opname[] }) { return rows.length ? <div className="space-y-3">{rows.map((opname) => <article key={opname.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-mono font-black text-slate-950">{opname.opnameNumber}</p><p className="mt-1 text-sm text-slate-600">{opname.warehouse || "Gudang"} · {opname.startedAt ? date.format(new Date(opname.startedAt)) : "-"}</p></div><Status value={opname.status} /></article>)}</div> : <Empty text="Belum ada stock opname." />; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block"><span className="mb-1 block text-sm font-bold text-slate-700">{label}</span>{children}</label>; }
const input = "dashboard-input min-h-11 w-full rounded-xl border px-3";
function AdjustmentFields({ warehouses, products, warehouseId }: { warehouses: Warehouse[]; products: StockItem[]; warehouseId: string }) { return <div className="grid gap-4 sm:grid-cols-2"><Field label="Gudang"><select required name="warehouseId" defaultValue={warehouseId} className={input}>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</select></Field><Field label="Produk"><select required name="productId" className={input}><option value="">Pilih produk</option>{products.map((product) => <option key={product.productId} value={product.productId}>{product.partCode} · {product.name}</option>)}</select></Field><Field label="Tipe"><select required name="movementType" className={input}><option value="adjustment_in">Tambah stok</option><option value="adjustment_out">Kurangi stok</option></select></Field><Field label="Kuantitas"><input required name="quantity" type="number" min="0.001" step="0.001" className={input} /></Field><Field label="Biaya/unit"><input name="unitCost" type="number" min="0" step="0.01" defaultValue="0" className={input} /></Field><Field label="Alasan"><input required name="reason" maxLength={1000} className={input} placeholder="Contoh: koreksi selisih fisik" /></Field></div>; }
function OpnameFields({ warehouses, warehouseId }: { warehouses: Warehouse[]; warehouseId: string }) { return <div className="grid gap-4 sm:grid-cols-2"><Field label="Nomor opname"><input required name="opnameNumber" defaultValue={orderNumber("OPN")} className={input} /></Field><Field label="Gudang"><select required name="warehouseId" defaultValue={warehouseId} className={input}>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</select></Field><div className="sm:col-span-2"><Field label="Catatan"><textarea name="notes" maxLength={2000} className={`${input} min-h-24 py-3`} placeholder="Ruang lingkup penghitungan atau catatan tim" /></Field></div></div>; }
function PurchaseFields({ vendors, products }: { vendors: Vendor[]; products: StockItem[] }) {
  const [rows, setRows] = useState([1]);
  return <div className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><Field label="Nomor PO"><input required name="orderNumber" defaultValue={orderNumber("PO")} className={input} /></Field><Field label="Vendor"><select required name="vendorId" className={input}><option value="">Pilih vendor</option>{vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.code} · {vendor.name}</option>)}</select></Field><Field label="Estimasi tiba"><input name="expectedDate" type="date" className={input} /></Field><Field label="Catatan"><input name="notes" maxLength={4000} className={input} placeholder="Opsional" /></Field></div><fieldset className="rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4"><legend className="px-2 text-sm font-black text-slate-950">Item purchase order</legend><div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm leading-6 text-slate-600">Tambahkan seluruh produk, kuantitas, dan harga beli per unit.</p><button type="button" onClick={() => setRows((current) => [...current, (current.at(-1) ?? 0) + 1])} className="min-h-11 shrink-0 rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-black text-blue-800 hover:bg-blue-100">Tambah baris</button></div><div className="space-y-3">{rows.map((row, index) => <div key={row} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4"><div className="mb-3 flex items-center justify-between gap-3"><p className="text-sm font-black text-slate-950">Item {index + 1}</p><button type="button" disabled={rows.length === 1} onClick={() => setRows((current) => current.filter((item) => item !== row))} aria-label={`Hapus item ${index + 1}`} className="min-h-11 rounded-xl border border-red-200 px-3 text-sm font-bold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 disabled:opacity-60">Hapus</button></div><div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_9rem_11rem]"><Field label="Produk"><select required name="productId" className={input}><option value="">Pilih produk</option>{products.map((product) => <option key={`${row}-${product.productId}`} value={product.productId}>{product.partCode} · {product.name}</option>)}</select></Field><Field label="Kuantitas"><input required name="quantity" type="number" min="0.001" step="0.001" inputMode="decimal" className={`${input} tabular-nums`} /></Field><Field label="Harga/unit"><input required name="unitPrice" type="number" min="0" step="0.01" inputMode="decimal" className={`${input} tabular-nums`} /></Field></div></div>)}</div></fieldset></div>;
}
function ReceivingFields({ warehouses, warehouseId, orders, selectedId, onSelect, selected }: { warehouses: Warehouse[]; warehouseId: string; orders: PurchaseOrder[]; selectedId: string; onSelect: (id: string) => void; selected?: PurchaseOrder }) {
  const eligible = orders.filter((order) => order.status === "approved" || order.status === "partially_received");
  return <div className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><Field label="Nomor penerimaan"><input required name="receiptNumber" defaultValue={orderNumber("GR")} className={input} /></Field><Field label="Gudang"><select required name="warehouseId" defaultValue={warehouseId} className={input}>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</select></Field></div><Field label="Purchase order"><select required value={selectedId} onChange={(event) => onSelect(event.target.value)} className={input}><option value="">Pilih PO approved</option>{eligible.map((order) => <option key={order.id} value={order.id}>{order.orderNumber} · {order.vendorName || order.vendor || "Vendor"}</option>)}</select></Field>{selected && <fieldset key={selected.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4"><legend className="px-2 text-sm font-black text-slate-950">Rincian penerimaan</legend><p className="mb-4 text-sm leading-6 text-slate-600">Isi hanya kuantitas yang diterima sekarang. Nilai tidak boleh melebihi sisa PO.</p>{selected.items?.length ? <div className="space-y-3">{selected.items.map((item, index) => { const ordered = Number(item.orderedQuantity ?? item.quantity ?? 0); const previouslyReceived = Number(item.receivedQuantity ?? 0); const remaining = Math.max(0, ordered - previouslyReceived); const descriptionId = `receiving-remaining-${item.id}`; return <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4"><div className="grid gap-4 lg:grid-cols-[minmax(13rem,1fr)_7rem_8rem_7rem_9rem_11rem] lg:items-end"><div><p className="text-xs font-black uppercase tracking-[.14em] text-slate-500">Item {index + 1}</p><p className="mt-1 font-black text-slate-950">{item.productName || item.name || item.partCode || "Produk"}</p>{item.partCode && <p className="mt-1 font-mono text-xs text-slate-500">{item.partCode}</p>}</div><div><p className="text-xs font-bold text-slate-500">Dipesan</p><p className="mt-1 font-black tabular-nums text-slate-950">{number.format(ordered)}</p></div><div><p className="text-xs font-bold text-slate-500">Sebelumnya</p><p className="mt-1 font-black tabular-nums text-slate-950">{number.format(previouslyReceived)}</p></div><div><p className="text-xs font-bold text-slate-500">Sisa</p><p className="mt-1 font-black tabular-nums text-amber-800">{number.format(remaining)}</p></div><Field label="Terima sekarang"><input name={`quantity-${item.id}`} type="number" min="0" max={remaining} step="0.001" inputMode="decimal" defaultValue={remaining || ""} disabled={remaining <= 0} aria-describedby={descriptionId} onInput={(event) => { const quantity = Number(event.currentTarget.value || 0); event.currentTarget.setCustomValidity(quantity > remaining ? `Kuantitas tidak boleh melebihi sisa ${number.format(remaining)}.` : ""); }} onBlur={(event) => event.currentTarget.reportValidity()} className={`${input} tabular-nums disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500`} /></Field><Field label="Biaya/unit"><input name={`unitCost-${item.id}`} type="number" min="0" step="0.01" inputMode="decimal" defaultValue={item.unitPrice ?? ""} disabled={remaining <= 0} className={`${input} tabular-nums disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500`} /></Field></div><p id={descriptionId} className="mt-2 text-xs text-slate-500">Maksimal penerimaan saat ini: {number.format(remaining)} unit.</p></div>; })}</div> : <Empty text="PO ini tidak memiliki item yang dapat diterima." />}</fieldset>}<Field label="Catatan"><input name="notes" maxLength={1000} className={input} placeholder="Opsional" /></Field></div>;
}
