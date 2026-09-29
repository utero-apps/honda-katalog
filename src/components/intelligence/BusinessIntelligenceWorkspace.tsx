"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { delta, presetRange } from "./business-period";

type Overview = {
  range: { from: string; to: string };
  previousRange: { from: string; to: string };
  previousSummary: Pick<Overview["summary"], "totalRevenue" | "serviceRevenue" | "sparepartRevenue" | "totalCogs" | "grossProfit">;
  repeatWindow: { from: string; to: string };
  summary: {
    totalRevenue: number; serviceRevenue: number; sparepartRevenue: number; totalCogs: number; grossProfit: number; grossMarginPercent: number;
    totalCustomers: number; activeCustomers: number; returningCustomers: number; repeatServicePercent: number; inventoryValue: number; inventoryTurnover: number;
    overdueFollowUps: number; dueReminders: number; openOrders: number; repeatActiveCustomers: number; repeatReturningCustomers: number;
  };
  mechanics: Array<{ id: string; name: string; employeeCode: string; isActive: boolean; totalOrders: number; completed: number; averageHours: number; serviceValue: number; fees: number; qualityPassRate: number | null }>;
  topParts: Array<{ id: string; partCode: string; name: string; quantity: number }>;
  slowMoving: Array<{ id: string; partCode: string; name: string; quantity: number; usedLast90Days: number }>;
  trend: Array<{ date: string; service: number; sparepart: number }>;
};

const money = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });
const date = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" });

async function request(url: string): Promise<Overview> {
  const response = await fetch(url);
  const payload = await response.json().catch(() => null) as { data?: Overview; error?: { message?: string } } | null;
  if (!response.ok || !payload?.data) throw new Error(payload?.error?.message || "Business intelligence tidak dapat dimuat");
  return payload.data;
}

function Card({ label, value, helper, change, href, tone = "blue" }: { label: string; value: string; helper: string; change: ReturnType<typeof delta>; href: string; tone?: "blue" | "emerald" | "violet" | "amber" }) {
  const tones = { blue: "border-blue-100 bg-blue-50 text-blue-800", emerald: "border-emerald-100 bg-emerald-50 text-emerald-800", violet: "border-violet-100 bg-violet-50 text-violet-800", amber: "border-amber-100 bg-amber-50 text-amber-900" };
  const positive = change.amount >= 0;
  return <article className={`rounded-2xl border p-5 shadow-sm ${tones[tone]}`}><p className="text-xs font-black uppercase tracking-[.14em]">{label}</p><p className="mt-3 text-2xl font-black tracking-tight tabular-nums text-slate-950">{value}</p><p className={`mt-2 text-sm font-black ${positive ? "text-emerald-700" : "text-red-700"}`}>{positive ? "+" : ""}{money.format(change.amount)} · {change.percent === null ? "periode sebelumnya nol" : `${positive ? "+" : ""}${number.format(change.percent)}%`}</p><p className="mt-3 border-t border-current/10 pt-3 text-xs font-semibold text-slate-600">{helper}</p><Link href={href} className="mt-3 inline-flex min-h-11 items-center text-xs font-black underline underline-offset-4">Lihat sumber data</Link></article>;
}

function Panel({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div><h2 className="text-lg font-black tracking-tight text-slate-950">{title}</h2>{description && <p className="mt-1 text-sm text-slate-600">{description}</p>}</div><div className="mt-5">{children}</div></section>;
}

function Trend({ points }: { points: Overview["trend"] }) {
  const visible = points.slice(-31);
  const max = Math.max(1, ...visible.flatMap((point) => [point.service, point.sparepart]));
  const width = 720; const height = 230; const padding = 28;
  const line = (key: "service" | "sparepart") => visible.map((point, index) => {
    const x = padding + index * ((width - padding * 2) / Math.max(visible.length - 1, 1));
    const y = height - padding - (point[key] / max) * (height - padding * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  if (!visible.length) return <p className="text-sm text-slate-500">Belum ada transaksi pada periode ini.</p>;
  return <div><div className="mb-3 flex flex-wrap gap-4 text-xs font-bold"><span className="text-blue-700">● Jasa service</span><span className="text-emerald-700">● Sparepart</span></div><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Tren pendapatan jasa dan sparepart" className="h-auto w-full"><path d={`M${padding} ${height - padding}H${width - padding} M${padding} ${padding}V${height - padding}`} fill="none" stroke="#cbd5e1" /><polyline points={line("service")} fill="none" stroke="#2563eb" strokeWidth="4" strokeLinejoin="round" /><polyline points={line("sparepart")} fill="none" stroke="#059669" strokeWidth="4" strokeLinejoin="round" /></svg><div className="mt-2 flex justify-between text-xs text-slate-500"><span>{date.format(new Date(visible[0].date))}</span><span>{date.format(new Date(visible.at(-1)!.date))}</span></div></div>;
}

export function BusinessIntelligenceWorkspace() {
  const today = new Date().toISOString().slice(0, 10);
  const first = new Date(); first.setDate(1);
  const [from, setFrom] = useState(first.toISOString().slice(0, 10));
  const [to, setTo] = useState(today);
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const applyPreset = (preset: "month" | "last30" | "last90") => { const range = presetRange(preset, today); setFrom(range.from); setTo(range.to); };
  const load = useCallback(async () => { setLoading(true); setError(""); try { setData(await request(`/api/v1/intelligence/business-overview?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)); } catch (reason) { setData(null); setError(reason instanceof Error ? reason.message : "Data tidak dapat dimuat"); } finally { setLoading(false); } }, [from, to]);
  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);
  const comparison = data && { revenue: delta(data.summary.totalRevenue, data.previousSummary.totalRevenue), service: delta(data.summary.serviceRevenue, data.previousSummary.serviceRevenue), parts: delta(data.summary.sparepartRevenue, data.previousSummary.sparepartRevenue), profit: delta(data.summary.grossProfit, data.previousSummary.grossProfit) };
  return <section className="mx-auto max-w-7xl text-slate-950"><header className="rounded-3xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-5 px-5 py-6 sm:px-7"><div><p className="text-xs font-black uppercase tracking-[.2em] text-red-600">Business Intelligence</p><h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">Keputusan dari data operasional</h1><p className="mt-2 text-sm text-slate-600">KPI dibandingkan dengan periode sebelumnya yang berdurasi sama.</p></div><div className="flex flex-wrap gap-2" aria-label="Preset periode">{([['month','Bulan ini'],['last30','30 hari'],['last90','90 hari']] as const).map(([key,label]) => <button key={key} type="button" onClick={() => applyPreset(key)} className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-black hover:bg-slate-100">{label}</button>)}</div><form onSubmit={(event) => { event.preventDefault(); void load(); }} className="grid gap-2 sm:grid-cols-[auto_auto_auto]"><label className="text-xs font-bold text-slate-600">Dari<input value={from} onChange={(event) => setFrom(event.target.value)} max={to} type="date" className="mt-1 block min-h-11 rounded-xl border border-slate-300 px-3" /></label><label className="text-xs font-bold text-slate-600">Sampai<input value={to} onChange={(event) => setTo(event.target.value)} min={from} max={today} type="date" className="mt-1 block min-h-11 rounded-xl border border-slate-300 px-3" /></label><button className="mt-auto min-h-11 rounded-xl bg-blue-700 px-4 text-sm font-black text-white">Terapkan</button></form></div></header><div className="space-y-5 py-5">{error && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 font-bold text-red-800">{error}</div>}{loading && <div aria-busy="true" className="h-40 animate-pulse rounded-2xl bg-slate-200" />}{data && comparison && <><p className="text-sm text-slate-600">Pembanding: {data.previousRange.from} s.d. {data.previousRange.to}</p><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Card label="Total revenue" value={money.format(data.summary.totalRevenue)} helper={`${data.range.from} s.d. ${data.range.to}`} change={comparison.revenue} href="/business/finance" /><Card label="Revenue service" value={money.format(data.summary.serviceRevenue)} helper="Invoice dan POS jasa" change={comparison.service} href="/business/service-orders" tone="emerald" /><Card label="Revenue sparepart" value={money.format(data.summary.sparepartRevenue)} helper="Invoice dan POS sparepart" change={comparison.parts} href="/business/inventory" tone="violet" /><Card label="Gross profit" value={money.format(data.summary.grossProfit)} helper={`Margin ${number.format(data.summary.grossMarginPercent)}%`} change={comparison.profit} href="/business/finance" tone="amber" /></div><Panel title="Tren pendapatan" description="Jasa dan sparepart pada periode terpilih."><Trend points={data.trend} /></Panel><div className="grid gap-5 xl:grid-cols-2"><Panel title="Repeat service rolling 6 bulan" description={`${data.repeatWindow.from} s.d. ${data.repeatWindow.to}; hanya service order selesai.`}><p className="text-5xl font-black text-blue-800">{number.format(data.summary.repeatServicePercent)}%</p><p className="mt-2 text-sm text-slate-600">{number.format(data.summary.repeatReturningCustomers)} dari {number.format(data.summary.repeatActiveCustomers)} pelanggan aktif punya service selesai sebelum jendela ini.</p><Link href="/business/customers" className="mt-4 inline-flex min-h-11 items-center font-black text-blue-700 underline">Drill-down pelanggan</Link></Panel><Panel title="Sumber operasional" description="Buka data pembentuk laporan."><div className="grid gap-3 sm:grid-cols-2"><Link href="/business/service-orders" className="rounded-2xl bg-blue-50 p-4 font-black text-blue-800">Service order</Link><Link href="/business/inventory" className="rounded-2xl bg-emerald-50 p-4 font-black text-emerald-800">Inventori</Link><Link href="/business/customers" className="rounded-2xl bg-amber-50 p-4 font-black text-amber-800">Pelanggan</Link><Link href="/business/finance" className="rounded-2xl bg-slate-100 p-4 font-black text-slate-800">Keuangan</Link></div></Panel></div></>}</div></section>;
}
