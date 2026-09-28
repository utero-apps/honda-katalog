"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Mechanic = {
  id: string;
  name: string;
  totalOrders: number;
  completed: number;
  averageHours: number;
  fees: number;
};

type Envelope<T> = { data: T; error?: { message?: string } | null };
const money = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

export function MechanicsWorkspace() {
  const [mechanics, setMechanics] = useState<Mechanic[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void fetch("/api/v1/intelligence/mechanics")
      .then(async (response) => {
        const body = (await response.json()) as Envelope<Mechanic[]>;
        if (!response.ok) throw new Error(body.error?.message || "Data mekanik belum dapat dimuat");
        if (active) setMechanics(body.data);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Data mekanik belum dapat dimuat");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="min-h-dvh bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <Link href="/business/intelligence" className="text-sm font-bold text-blue-700">← Business Intelligence</Link>
          <p className="mt-4 text-xs font-black uppercase tracking-[.18em] text-red-600">Mechanic Management</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">Performa mekanik</h1>
          <p className="mt-2 text-sm text-slate-600">Buka profil untuk melihat Service Order, pekerjaan, sparepart, QC, serta fee mekanik.</p>
        </div>
      </header>
      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {loading ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-44 animate-pulse rounded-2xl bg-slate-200" />)}</div> : error ? <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 font-bold text-red-800">{error}</p> : mechanics.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{mechanics.map((mechanic) => <Link key={mechanic.id} href={`/business/mechanics/${mechanic.id}`} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md"><div className="flex items-start justify-between gap-3"><div><h2 className="font-black text-slate-950">{mechanic.name}</h2><p className="mt-1 text-xs font-semibold text-slate-500">Detail performa dan pekerjaan</p></div><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-800">Aktif</span></div><dl className="mt-5 grid grid-cols-2 gap-3"><Metric label="Order selesai" value={`${mechanic.completed}/${mechanic.totalOrders}`} /><Metric label="Rata-rata" value={`${mechanic.averageHours.toLocaleString("id-ID")} jam`} /><Metric label="Fee" value={money.format(mechanic.fees)} wide /><Metric label="Completion" value={mechanic.totalOrders ? `${Math.round(mechanic.completed / mechanic.totalOrders * 100)}%` : "0%"} /></dl><span className="mt-5 inline-flex text-sm font-black text-blue-700">Buka detail →</span></Link>)}</div> : <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">Belum ada mekanik aktif.</p>}
      </section>
    </main>
  );
}

function Metric({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return <div className={`rounded-xl bg-slate-50 p-3 ${wide ? "col-span-2" : ""}`}><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 font-black text-slate-900">{value}</dd></div>;
}
