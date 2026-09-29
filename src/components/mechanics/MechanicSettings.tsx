"use client";

import { FormEvent, useEffect, useState } from "react";
import { buildMechanicManagementPayload, canManageMechanics } from "./mechanic-detail-state";

export type MechanicSettingsProfile = {
  id: string;
  employeeCode: string;
  feePercent: number;
  isActive: boolean;
  monthlyTargetOrders: number | null;
  weeklyCapacityOrders: number | null;
  bonusPerCompletedOrder: number | null;
};

export function MechanicSettings({ profile, onSaved }: { profile: MechanicSettingsProfile; onSaved: () => Promise<void> }) {
  const [allowed, setAllowed] = useState(false);
  const [target, setTarget] = useState(String(profile.monthlyTargetOrders ?? ""));
  const [capacity, setCapacity] = useState(String(profile.weeklyCapacityOrders ?? ""));
  const [bonus, setBonus] = useState(String(profile.bonusPerCompletedOrder ?? ""));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/v1/auth/me")
      .then(async (response) => {
        if (!response.ok) return null;
        const body = await response.json() as { data?: { user?: { role?: string } } };
        return body.data?.user?.role;
      })
      .then((role) => { if (active) setAllowed(canManageMechanics(role)); })
      .catch(() => { if (active) setAllowed(false); });
    return () => { active = false; };
  }, []);

  if (!allowed) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setMessage(""); setSaving(true);
    try {
      const response = await fetch("/api/v1/operations/mechanics/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildMechanicManagementPayload({
          userId: profile.id, employeeCode: profile.employeeCode, feePercent: profile.feePercent,
          isActive: profile.isActive, monthlyTargetOrders: target, weeklyCapacityOrders: capacity,
          bonusPerCompletedOrder: bonus,
        })),
      });
      const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      if (!response.ok) throw new Error(body?.error?.message || "Pengaturan gagal disimpan");
      await onSaved();
      setMessage("Pengaturan mekanik tersimpan.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Pengaturan gagal disimpan");
    } finally {
      setSaving(false);
    }
  }

  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
    <h2 className="text-base font-black">Pengaturan mekanik</h2>
    <p className="mt-1 text-sm text-slate-600">Target dan kapasitas order serta bonus per order selesai.</p>
    <form onSubmit={(event) => void submit(event)} className="mt-4 grid gap-3 sm:grid-cols-3">
      <label className="text-sm font-bold text-slate-700">Target bulanan (order)<input required type="number" min="1" step="1" value={target} onChange={(event) => setTarget(event.target.value)} className="mt-1 block min-h-11 w-full rounded-xl border border-slate-300 px-3 font-normal" /></label>
      <label className="text-sm font-bold text-slate-700">Kapasitas mingguan (order)<input required type="number" min="1" step="1" value={capacity} onChange={(event) => setCapacity(event.target.value)} className="mt-1 block min-h-11 w-full rounded-xl border border-slate-300 px-3 font-normal" /></label>
      <label className="text-sm font-bold text-slate-700">Bonus per order selesai (Rp)<input required type="number" min="0" step="0.01" value={bonus} onChange={(event) => setBonus(event.target.value)} className="mt-1 block min-h-11 w-full rounded-xl border border-slate-300 px-3 font-normal" /></label>
      <div className="sm:col-span-3 flex flex-wrap items-center gap-3"><button disabled={saving} className="min-h-11 rounded-xl bg-slate-950 px-4 text-sm font-black text-white disabled:opacity-60">{saving ? "Menyimpan..." : "Simpan pengaturan"}</button>{message && <p role="status" className="text-sm font-bold text-emerald-700">{message}</p>}{error && <p role="alert" className="text-sm font-bold text-red-700">{error}</p>}</div>
    </form>
  </section>;
}
