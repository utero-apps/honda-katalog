"use client";

import { useState } from "react";

interface Module { key: string; label: string; endpoint: string; roles: string[] }
const modules: Module[] = [
  { key: "dashboard", label: "Dashboard", endpoint: "/api/v1/intelligence/dashboard", roles: ["owner","admin","finance"] },
  { key: "customers", label: "Pelanggan", endpoint: "/api/v1/operations/customers", roles: ["owner","admin","cashier","mechanic"] },
  { key: "service", label: "Service Order", endpoint: "/api/v1/operations/service-orders", roles: ["owner","admin","cashier","mechanic"] },
  { key: "inventory", label: "Inventori", endpoint: "/api/v1/operations/inventory/balances", roles: ["owner","admin","warehouse"] },
  { key: "vendors", label: "Vendor", endpoint: "/api/v1/business/vendors", roles: ["owner","admin","warehouse","finance"] },
  { key: "expenses", label: "Keuangan", endpoint: "/api/v1/business/expenses", roles: ["owner","admin","finance"] },
  { key: "crm", label: "CRM", endpoint: "/api/v1/intelligence/follow-ups", roles: ["owner","admin","cashier"] },
];

function display(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Ya" : "Tidak";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function WorkspaceOverview({ role }: { role: string }) {
  const allowed = modules.filter((module) => module.roles.includes(role));
  const [active, setActive] = useState("");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load(module: Module) {
    setActive(module.key); setLoading(true); setError("");
    try {
      const response = await fetch(module.endpoint);
      const envelope = await response.json();
      if (!response.ok) throw new Error(envelope.error?.message || "Data gagal dimuat");
      setRows(Array.isArray(envelope.data) ? envelope.data : [envelope.data]);
    } catch (reason) { setRows([]); setError(reason instanceof Error ? reason.message : "Data gagal dimuat"); }
    finally { setLoading(false); }
  }

  return <section className="mx-auto max-w-7xl px-6 pb-8" aria-labelledby="workspace-heading">
    <div className="rounded-2xl bg-slate-900 p-4 text-white shadow-sm">
      <h2 id="workspace-heading" className="text-lg font-black">Workspace Operasional</h2>
      <nav className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Modul aplikasi">
        {allowed.map((module) => <button key={module.key} onClick={() => void load(module)} aria-pressed={active===module.key} className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold ${active===module.key?"bg-red-600 text-white":"bg-slate-800 text-slate-200 hover:bg-slate-700"}`}>{module.label}</button>)}
      </nav>
    </div>
    {active && <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm" aria-live="polite">
      {loading && <p className="text-sm font-semibold text-slate-500">Memuat data...</p>}
      {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
      {!loading && !error && rows.length===0 && <p className="text-sm text-slate-500">Belum ada data.</p>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rows.map((row,index)=><article key={String(row.id??index)} className="rounded-xl border border-slate-200 p-4">{Object.entries(row).slice(0,8).map(([key,value])=><div key={key} className="flex justify-between gap-3 border-b border-slate-100 py-1 text-sm last:border-0"><span className="font-semibold text-slate-500">{key}</span><span className="max-w-[65%] break-words text-right text-slate-900">{display(value)}</span></div>)}</article>)}</div>
    </div>}
  </section>;
}
