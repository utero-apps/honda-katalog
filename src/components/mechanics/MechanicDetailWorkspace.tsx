"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Detail = {
  profile: { id: string; name: string; email: string; employeeCode: string; isActive: boolean };
  performance: { totalOrders: number; completedOrders: number; activeOrders: number; completionRate: number; averageHours: number; fees: number; jobsCompleted: number; partsConsumed: number; qualityPassed: number; qualityFailed: number };
  orders: Array<{ id: string; orderNumber: string; status: string; customerName: string; plateNumber: string; openedAt: string | null; completedAt: string | null; totalJobs: number; completedJobs: number; consumedParts: number; qualityPassed: boolean | null }>;
  jobs: Array<{ id: string; serviceOrderId: string; orderNumber: string; name: string; status: string; price: number; createdAt: string }>;
  parts: Array<{ id: string; serviceOrderId: string; orderNumber: string; partCode: string; name: string; quantity: number; unit: string; consumedAt: string | null }>;
  qualityChecks: Array<{ id: string; serviceOrderId: string; orderNumber: string; passed: boolean; notes: string | null; checkedAt: string }>;
  fees: Array<{ id: string; serviceOrderId: string; orderNumber: string; amount: number; createdAt: string }>;
};

const date = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" });
const money = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const status = (value: string) => value.replaceAll("_", " ");

async function request(url: string): Promise<Detail> {
  const response = await fetch(url);
  const body = await response.json().catch(() => null) as { data?: Detail; error?: { message?: string } } | null;
  if (!response.ok || !body?.data) throw new Error(body?.error?.message || "Detail mekanik belum dapat dimuat");
  return body.data;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><h2 className="text-base font-black text-slate-950">{title}</h2>{children}</section>;
}

export function MechanicDetailWorkspace({ mechanicId }: { mechanicId: string }) {
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await request(`/api/v1/intelligence/mechanics/${mechanicId}`)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Detail mekanik belum dapat dimuat"); }
    finally { setLoading(false); }
  }, [mechanicId]);
  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  if (loading) return <main className="min-h-dvh bg-slate-50 p-6"><div className="mx-auto grid max-w-7xl gap-4 animate-pulse"><div className="h-32 rounded-2xl bg-slate-200" /><div className="grid gap-3 sm:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-28 rounded-2xl bg-slate-200" />)}</div></div></main>;
  if (error || !data) return <main className="grid min-h-dvh place-items-center bg-slate-50 p-4"><div role="alert" className="max-w-md rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm"><p className="font-black text-red-900">Detail mekanik belum dapat dibuka</p><p className="mt-2 text-sm text-red-700">{error}</p><button onClick={() => void load()} className="mt-4 min-h-11 rounded-xl bg-red-700 px-4 text-sm font-bold text-white">Coba lagi</button></div></main>;

  const { profile, performance } = data;
  const cards = [["Order selesai", `${performance.completedOrders} / ${performance.totalOrders}`, `${performance.completionRate}% selesai`], ["Pekerjaan aktif", String(performance.activeOrders), "Butuh pemantauan"], ["Waktu rata-rata", `${performance.averageHours} jam`, `${performance.jobsCompleted} job selesai`], ["Fee tercatat", money.format(performance.fees), `${performance.partsConsumed} part dipakai`]];
  return <main className="min-h-dvh bg-slate-50 text-slate-950"><header className="border-b border-slate-200 bg-white"><div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8"><Link href="/business/service-orders" className="text-sm font-bold text-blue-700 hover:text-blue-900">← Service Order</Link><div className="mt-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-black uppercase tracking-[.18em] text-red-600">Mekanik · {profile.employeeCode}</p><h1 className="mt-1 text-3xl font-black tracking-tight">{profile.name}</h1><p className="mt-2 text-sm text-slate-600">{profile.email}</p></div><span className="w-fit rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-black text-emerald-800">Aktif</span></div></div></header><div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:px-8"><section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label, value, hint]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-2xl font-black">{value}</p><p className="mt-1 text-xs text-slate-500">{hint}</p></div>)}</section><div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,.8fr)]"><Panel title="Service Order ditangani"><div className="mt-4 space-y-3">{data.orders.length ? data.orders.map((order) => <Link key={order.id} href={`/business/service-orders/${order.id}`} className="block rounded-xl border border-slate-200 p-3 transition hover:border-blue-300 hover:bg-blue-50"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-mono text-sm font-black text-blue-800">{order.orderNumber}</p><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold capitalize text-slate-700">{status(order.status)}</span></div><p className="mt-2 font-bold">{order.customerName} · {order.plateNumber}</p><p className="mt-1 text-xs text-slate-600">{order.completedJobs}/{order.totalJobs} job · {order.consumedParts} part · QC {order.qualityPassed === null ? "belum ada" : order.qualityPassed ? "lulus" : "gagal"}</p><p className="mt-1 text-xs text-slate-500">Masuk {order.openedAt ? date.format(new Date(order.openedAt)) : "-"}</p></Link>) : <p className="py-6 text-center text-sm text-slate-500">Belum ada Service Order.</p>}</div></Panel><div className="space-y-5"><Panel title="Quality Control"><div className="mt-3 space-y-2">{data.qualityChecks.length ? data.qualityChecks.map((item) => <div key={item.id} className="rounded-xl bg-slate-50 p-3"><p className={`text-sm font-black ${item.passed ? "text-emerald-700" : "text-red-700"}`}>{item.passed ? "Lulus QC" : "Perlu perbaikan"} · {item.orderNumber}</p><p className="mt-1 text-sm text-slate-600">{item.notes || "Tanpa catatan"}</p></div>) : <p className="py-4 text-sm text-slate-500">Belum ada hasil QC.</p>}</div></Panel><Panel title="Fee Mekanik"><div className="mt-3 space-y-2">{data.fees.length ? data.fees.map((item) => <div key={item.id} className="flex justify-between rounded-xl bg-slate-50 p-3 text-sm"><span className="font-mono font-bold text-blue-800">{item.orderNumber}</span><span className="font-black">{money.format(item.amount)}</span></div>) : <p className="py-4 text-sm text-slate-500">Belum ada fee tercatat.</p>}</div></Panel></div></div><div className="grid gap-5 xl:grid-cols-2"><Panel title="Pekerjaan jasa"><div className="mt-4 grid gap-2 sm:grid-cols-2">{data.jobs.length ? data.jobs.map((item) => <div key={item.id} className="rounded-xl border border-slate-200 p-3"><p className="font-bold">{item.name}</p><p className="mt-1 font-mono text-xs text-blue-800">{item.orderNumber}</p><p className="mt-2 text-sm font-black">{money.format(item.price)}</p><p className="mt-1 text-xs capitalize text-slate-500">{status(item.status)}</p></div>) : <p className="text-sm text-slate-500">Belum ada job.</p>}</div></Panel><Panel title="Pemakaian sparepart"><div className="mt-4 space-y-2">{data.parts.length ? data.parts.map((item) => <div key={item.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 p-3"><div><p className="font-bold">{item.name}</p><p className="mt-1 font-mono text-xs text-blue-800">{item.partCode} · {item.orderNumber}</p></div><p className="shrink-0 text-sm font-black">{item.quantity} {item.unit}</p></div>) : <p className="text-sm text-slate-500">Belum ada sparepart.</p>}</div></Panel></div></div></main>;
}
