"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";

type IconName = "dashboard" | "customers" | "service" | "inventory" | "vendors" | "expenses" | "crm" | "refresh" | "alert" | "empty";

interface Module {
  key: string;
  label: string;
  description: string;
  endpoint: string;
  roles: string[];
  icon: IconName;
}

const modules: Module[] = [
  { key: "dashboard", label: "Dashboard", description: "Ringkasan performa operasional", endpoint: "/api/v1/intelligence/dashboard", roles: ["owner", "admin", "finance"], icon: "dashboard" },
  { key: "customers", label: "Pelanggan", description: "Database dan riwayat pelanggan", endpoint: "/api/v1/operations/customers", roles: ["owner", "admin", "cashier", "mechanic"], icon: "customers" },
  { key: "service", label: "Service Order", description: "Antrean pekerjaan bengkel", endpoint: "/api/v1/operations/service-orders", roles: ["owner", "admin", "cashier", "mechanic"], icon: "service" },
  { key: "inventory", label: "Inventori", description: "Posisi stok seluruh gudang", endpoint: "/api/v1/operations/inventory/balances", roles: ["owner", "admin", "warehouse"], icon: "inventory" },
  { key: "vendors", label: "Vendor", description: "Mitra dan pemasok aktif", endpoint: "/api/v1/business/vendors", roles: ["owner", "admin", "warehouse", "finance"], icon: "vendors" },
  { key: "expenses", label: "Keuangan", description: "Pengeluaran operasional", endpoint: "/api/v1/business/expenses", roles: ["owner", "admin", "finance"], icon: "expenses" },
  { key: "crm", label: "CRM", description: "Tindak lanjut pelanggan", endpoint: "/api/v1/intelligence/follow-ups", roles: ["owner", "admin", "cashier"], icon: "crm" },
];

const currency = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("id-ID");
const dateFormatter = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" });
const dashboardMetrics = [
  { key: "open_orders", label: "Service aktif", helper: "Order belum selesai", icon: "service" as const, tone: "bg-blue-50 text-blue-700 ring-blue-100" },
  { key: "low_stock", label: "Stok menipis", helper: "Perlu segera dipenuhi", icon: "inventory" as const, tone: "bg-amber-50 text-amber-700 ring-amber-100" },
  { key: "monthly_income", label: "Pendapatan bulan ini", helper: "Pembayaran masuk", icon: "dashboard" as const, tone: "bg-emerald-50 text-emerald-700 ring-emerald-100", money: true },
  { key: "monthly_expense", label: "Pengeluaran bulan ini", helper: "Biaya operasional", icon: "expenses" as const, tone: "bg-rose-50 text-rose-700 ring-rose-100", money: true },
];

function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  const paths: Record<IconName, ReactNode> = {
    dashboard: <><path d="M4 13h6V4H4v9Zm0 7h6v-3H4v3Zm10 0h6v-9h-6v9Zm0-13h6V4h-6v3Z" /></>,
    customers: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    service: <><path d="M14.7 6.3a4 4 0 0 0-5-5L7.4 3.6l3 3 2.3-2.3a4 4 0 0 1-5 5L2.3 14.7a2.4 2.4 0 0 0 3 3l5.4-5.4a4 4 0 0 0 5-5Z" /><path d="m15 15 6 6" /></>,
    inventory: <><path d="m21 8-9 5-9-5" /><path d="m3 8 9-5 9 5v8l-9 5-9-5V8Z" /><path d="M12 13v8" /></>,
    vendors: <><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-5h6v5M8 10h.01M12 10h.01M16 10h.01" /></>,
    expenses: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M16 15h2" /></>,
    crm: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z" /><path d="M8 9h8M8 13h5" /></>,
    refresh: <><path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 4v5h5M4 13a8.1 8.1 0 0 0 15.5 2M20 20v-5h-5" /></>,
    alert: <><path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></>,
    empty: <><path d="M3 7.5 12 3l9 4.5-9 4.5-9-4.5Z" /><path d="M3 12.5 12 17l9-4.5M3 17l9 4 9-4" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">{paths[name]}</svg>;
}

function humanize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function display(value: unknown, key = "") {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Ya" : "Tidak";
  if (typeof value === "number") return number.format(value);
  if (typeof value === "object") return JSON.stringify(value);
  if (/(amount|price|total|het|hpp|income|expense|cost)/i.test(key) && !Number.isNaN(Number(value))) return currency.format(Number(value));
  if (/(date|_at)$/i.test(key)) {
    const parsed = new Date(String(value));
    if (!Number.isNaN(parsed.getTime())) return dateFormatter.format(parsed);
  }
  return String(value);
}

function LoadingSkeleton({ dashboard }: { dashboard: boolean }) {
  if (dashboard) return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-hidden="true">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-36 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />)}</div>;
  return <div className="overflow-hidden rounded-2xl border border-slate-200" aria-hidden="true"><div className="h-12 animate-pulse bg-slate-100" />{Array.from({ length: 4 }, (_, index) => <div key={index} className="mx-4 flex gap-4 border-t border-slate-100 py-4"><div className="h-4 w-1/4 animate-pulse rounded bg-slate-100" /><div className="h-4 flex-1 animate-pulse rounded bg-slate-100" /><div className="h-4 w-1/5 animate-pulse rounded bg-slate-100" /></div>)}</div>;
}

function Dashboard({ data }: { data: Record<string, unknown> }) {
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{dashboardMetrics.map((metric) => <article key={metric.key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/50">
    <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-slate-600">{metric.label}</p><p className="mt-2 text-2xl font-black tracking-tight text-slate-950 tabular-nums sm:text-3xl">{metric.money ? currency.format(Number(data[metric.key] ?? 0)) : number.format(Number(data[metric.key] ?? 0))}</p></div><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ring-1 ${metric.tone}`}><Icon name={metric.icon} /></span></div>
    <p className="mt-4 border-t border-slate-100 pt-3 text-xs font-medium text-slate-500">{metric.helper}</p>
  </article>)}</div>;
}

function DataView({ rows }: { rows: Record<string, unknown>[] }) {
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).slice(0, 8);
  return <>
    <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 lg:block">
      <table className="w-full min-w-[760px] border-collapse text-left text-sm">
        <thead className="bg-slate-100 text-xs font-bold uppercase tracking-wider text-slate-600"><tr>{columns.map((column) => <th key={column} scope="col" className="border-b border-slate-200 px-4 py-3">{humanize(column)}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100 bg-white">{rows.map((row, index) => <tr key={String(row.id ?? index)} className="transition-colors hover:bg-slate-50">{columns.map((column) => <td key={column} className="max-w-64 px-4 py-3.5 align-top font-medium text-slate-700"><span className="block break-words">{display(row[column], column)}</span></td>)}</tr>)}</tbody>
      </table>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 lg:hidden">{rows.map((row, index) => <article key={String(row.id ?? index)} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><dl>{columns.map((column) => <div key={column} className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-3 border-b border-slate-100 py-2.5 first:pt-0 last:border-0 last:pb-0"><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{humanize(column)}</dt><dd className="break-words text-right text-sm font-semibold text-slate-800">{display(row[column], column)}</dd></div>)}</dl></article>)}</div>
  </>;
}

export function WorkspaceOverview({ role }: { role: string }) {
  const allowed = modules.filter((module) => module.roles.includes(role));
  const [active, setActive] = useState("");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeModule = allowed.find((module) => module.key === active);

  async function load(module: Module) {
    const currentRequest = ++requestId.current;
    setActive(module.key);
    setLoading(true);
    setError("");
    try {
      const response = await fetch(module.endpoint);
      const envelope = await response.json();
      if (!response.ok) throw new Error(envelope.error?.message || "Data gagal dimuat");
      if (currentRequest === requestId.current) setRows(Array.isArray(envelope.data) ? envelope.data : [envelope.data]);
    } catch (reason) {
      if (currentRequest === requestId.current) {
        setRows([]);
        setError(reason instanceof Error ? reason.message : "Data gagal dimuat");
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex = index;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % allowed.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + allowed.length) % allowed.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = allowed.length - 1;
    else return;
    event.preventDefault();
    tabRefs.current[nextIndex]?.focus();
    void load(allowed[nextIndex]);
  }

  if (!allowed.length) return null;
  const visibleModule = activeModule ?? allowed[0];
  const isDashboard = visibleModule.key === "dashboard";

  return <section className="mx-auto max-w-7xl px-4 pb-10 sm:px-6" aria-labelledby="workspace-heading">
    <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 text-white shadow-xl shadow-slate-950/10">
      <div className="flex flex-col gap-4 border-b border-white/10 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-red-400">Honda Operations</p><h2 id="workspace-heading" className="mt-1 text-xl font-black tracking-tight sm:text-2xl">Workspace Operasional</h2><p className="mt-1 max-w-2xl text-sm text-slate-400">Pantau bengkel, stok, pelanggan, dan keuangan dari satu ruang kerja.</p></div>
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-300"><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />Sistem operasional aktif</div>
      </div>
      <div className="overflow-x-auto px-3 py-3 sm:px-4">
        <div role="tablist" aria-label="Modul workspace" className="flex min-w-max gap-1.5">
          {allowed.map((module, index) => {
            const selected = active === module.key;
            return <button key={module.key} ref={(node) => { tabRefs.current[index] = node; }} id={`workspace-tab-${module.key}`} type="button" role="tab" aria-selected={selected} aria-controls="workspace-panel" tabIndex={selected ? 0 : -1} onClick={() => void load(module)} onKeyDown={(event) => handleTabKeyDown(event, index)} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-bold transition-colors ${selected ? "bg-red-600 text-white shadow-sm" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}><Icon name={module.icon} className="h-4 w-4" />{module.label}</button>;
          })}
        </div>
      </div>
    </div>

    {activeModule && <div id="workspace-panel" role="tabpanel" aria-labelledby={`workspace-tab-${activeModule.key}`} aria-busy={loading} className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-sm sm:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><div className="flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-xl bg-white text-red-600 shadow-sm ring-1 ring-slate-200"><Icon name={activeModule.icon} className="h-4 w-4" /></span><h3 className="text-lg font-black text-slate-950">{activeModule.label}</h3></div><p className="mt-1 pl-11 text-sm text-slate-600">{activeModule.description}</p></div>
        {!loading && !error && <div className="flex items-center gap-3"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">{isDashboard ? "Diperbarui langsung" : `${number.format(rows.length)} data`}</p><button type="button" onClick={() => void load(activeModule)} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 text-sm font-bold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50"><Icon name="refresh" className="h-4 w-4" />Muat ulang</button></div>}
      </div>

      <div aria-live="polite" aria-atomic="true">
        {loading && <><span className="sr-only">Memuat data {activeModule.label}</span><LoadingSkeleton dashboard={isDashboard} /></>}
        {!loading && error && <div role="alert" className="flex flex-col items-start gap-4 rounded-2xl border border-red-200 bg-red-50 p-5 sm:flex-row sm:items-center"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-red-100 text-red-700"><Icon name="alert" /></span><div className="flex-1"><h4 className="font-black text-red-950">Data belum dapat dimuat</h4><p className="mt-1 text-sm text-red-800">{error}</p></div><button type="button" onClick={() => void load(activeModule)} className="min-h-11 cursor-pointer rounded-xl bg-red-700 px-4 text-sm font-bold text-white hover:bg-red-800">Coba lagi</button></div>}
        {!loading && !error && rows.length === 0 && <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center"><div><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-500"><Icon name="empty" /></span><h4 className="mt-4 font-black text-slate-900">Belum ada data {activeModule.label.toLowerCase()}</h4><p className="mx-auto mt-1 max-w-sm text-sm text-slate-600">Data akan muncul setelah aktivitas pertama tercatat pada modul ini.</p></div></div>}
        {!loading && !error && rows.length > 0 && (isDashboard ? <Dashboard data={rows[0]} /> : <DataView rows={rows} />)}
      </div>
    </div>}
  </section>;
}
