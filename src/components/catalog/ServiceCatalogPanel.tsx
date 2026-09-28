"use client";

import { AccessibleDialog } from "@/components/AccessibleDialog";
import { useCallback, useEffect, useState, type FormEvent } from "react";

type ServiceItem = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  fixedPrice: number;
  sortOrder: number;
};

type Envelope<T> = {
  data: T;
  error?: { message?: string } | null;
};

const money = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

export function ServiceCatalogPanel() {
  const [items, setItems] = useState<ServiceItem[]>([]);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<ServiceItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/v1/operations/service-catalog");
      const body = (await response.json()) as Envelope<ServiceItem[]>;
      if (!response.ok)
        throw new Error(body.error?.message || "Katalog jasa gagal dimuat");
      setItems(body.data);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Katalog jasa gagal dimuat",
      );
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  function openForm(item: ServiceItem | null) {
    setEditing(item);
    setError("");
    setFormOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        editing
          ? `/api/v1/operations/service-catalog/${editing.id}`
          : "/api/v1/operations/service-catalog",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: form.get("code"),
            name: form.get("name"),
            description: form.get("description") || null,
            fixedPrice: Number(form.get("fixedPrice")),
            sortOrder: Number(form.get("sortOrder")),
          }),
        },
      );
      const body = (await response.json()) as Envelope<ServiceItem>;
      if (!response.ok)
        throw new Error(body.error?.message || "Jasa belum dapat disimpan");
      setFormOpen(false);
      setEditing(null);
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Jasa belum dapat disimpan",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mb-6 rounded-2xl border border-blue-200 bg-blue-50/60 p-4 sm:p-5">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">
        Kategori katalog
      </p>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h3 className="mt-1 text-xl font-black text-slate-950">Pekerjaan / jasa</h3>
          <p className="mt-1 text-sm text-slate-600">
            Dipakai untuk biaya tenaga kerja pada Service Order dan transaksi POS.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openForm(null)}
          className="min-h-11 rounded-xl bg-blue-700 px-4 text-sm font-bold text-white"
        >
          Tambah jasa
        </button>
      </div>
      {error ? (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
          {error}
        </p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {items.map((item) => (
            <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-bold text-blue-700">{item.code}</p>
              <h4 className="mt-1 font-black text-slate-950">{item.name}</h4>
              <p className="mt-2 text-sm font-black text-slate-900">
                {money.format(item.fixedPrice)}
              </p>
              <button
                type="button"
                onClick={() => openForm(item)}
                className="mt-3 min-h-9 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-800"
              >
                Edit jasa
              </button>
            </article>
          ))}
        </div>
      )}
      {formOpen && (
        <AccessibleDialog
          labelledBy="service-catalog-dialog-title"
          onClose={() => {
            if (!saving) setFormOpen(false);
          }}
        >
          <form onSubmit={submit} className="space-y-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">
                Katalog jasa
              </p>
              <h2 id="service-catalog-dialog-title" className="mt-1 text-xl font-black text-slate-950">
                {editing ? "Edit jasa" : "Tambah jasa"}
              </h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-bold text-slate-800">
                Kode jasa
                <input name="code" required minLength={2} maxLength={80} defaultValue={editing?.code} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" />
              </label>
              <label className="text-sm font-bold text-slate-800">
                Urutan tampil
                <input name="sortOrder" type="number" min="0" required defaultValue={editing?.sortOrder ?? items.length + 1} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" />
              </label>
              <label className="text-sm font-bold text-slate-800 sm:col-span-2">
                Nama jasa
                <input name="name" required minLength={2} maxLength={160} defaultValue={editing?.name} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" />
              </label>
              <label className="text-sm font-bold text-slate-800">
                Harga jasa
                <input name="fixedPrice" type="number" min="1" required defaultValue={editing?.fixedPrice} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3" />
              </label>
              <label className="text-sm font-bold text-slate-800 sm:col-span-2">
                Keterangan
                <textarea name="description" maxLength={2000} defaultValue={editing?.description ?? ""} className="mt-1 min-h-24 w-full rounded-xl border border-slate-300 p-3" />
              </label>
            </div>
            {error && (
              <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
                {error}
              </p>
            )}
            <button disabled={saving} className="min-h-11 w-full rounded-xl bg-blue-700 px-4 text-sm font-bold text-white disabled:opacity-50">
              {saving ? "Menyimpan…" : "Simpan jasa"}
            </button>
          </form>
        </AccessibleDialog>
      )}
    </section>
  );
}
