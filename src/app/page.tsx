"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { AccessibleDialog } from "@/components/AccessibleDialog";
import { CatalogTools } from "@/components/CatalogTools";
import { WorkspaceOverview } from "@/components/WorkspaceOverview";

interface User { id: string; email: string; displayName: string; role: string }
interface Reference { id: string; name: string }
interface Product {
  id: string; partCode: string; name: string; categoryId: string | null; category: string | null;
  het: number; hpp: number; unit: string; minimumStock: number; status: string;
  description: string | null; barcodes: string[]; compatibleModels: string[]; compatibleModelIds: string[];
}
interface Envelope<T> { data: T; meta: { total?: number }; error: { message: string; fields?: Record<string, string[]> } | null }

class ApiRequestError extends Error {
  constructor(message: string, public fields: Record<string, string[]> = {}) { super(message); }
}

function FieldError({ errors, name }: { errors: Record<string, string[]>; name: string }) {
  const error = errors[name]?.[0];
  return error ? <span id={`${name}-error`} className="mt-1 block text-sm font-semibold text-red-700">{error}</span> : null;
}

const money = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

async function api<T>(url: string, init?: RequestInit): Promise<Envelope<T>> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const body = await response.json() as Envelope<T>;
  if (!response.ok) throw new ApiRequestError(body.error?.message || "Permintaan gagal", body.error?.fields);
  return body;
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Reference[]>([]);
  const [models, setModels] = useState<Reference[]>([]);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Product | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const closeProductForm = useCallback(() => {
    setShowForm(false);
    setEditing(null);
    setFieldErrors({});
  }, []);

  function openProductForm(product: Product | null) {
    setEditing(product);
    setFieldErrors({});
    setShowForm(true);
  }

  function fieldA11y(name: string) {
    const hasError = Boolean(fieldErrors[name]?.length);
    return { "aria-invalid": hasError || undefined, "aria-describedby": hasError ? `${name}-error` : undefined };
  }

  const loadProducts = useCallback(async (search = query) => {
    const result = await api<Product[]>(`/api/v1/catalog/products?query=${encodeURIComponent(search)}&pageSize=100`);
    setProducts(result.data);
  }, [query]);
  const handleBarcode = useCallback((value: string) => { setQuery(value); void loadProducts(value); }, [loadProducts]);
  const handleImported = useCallback(() => loadProducts(""), [loadProducts]);

  const bootstrap = useCallback(async () => {
    try {
      const session = await api<{ user: User }>("/api/v1/auth/me");
      setUser(session.data.user);
      const [categoryData, modelData] = await Promise.all([
        api<Reference[]>("/api/v1/catalog/categories"),
        api<Reference[]>("/api/v1/catalog/models"),
      ]);
      setCategories(categoryData.data);
      setModels(modelData.data);
      await loadProducts("");
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [loadProducts]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => { void bootstrap(); }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [bootstrap]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const result = await api<{ user: User }>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      setUser(result.data.user);
      setMessage("");
      await bootstrap();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Login gagal"); }
  }

  async function logout() {
    await api("/api/v1/auth/logout", { method: "POST", body: "{}" });
    setUser(null);
    setProducts([]);
  }

  async function submitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = {
      partCode: form.get("partCode"), name: form.get("name"), categoryId: form.get("categoryId"),
      het: Number(form.get("het")), hpp: Number(form.get("hpp")), unit: form.get("unit"),
      minimumStock: Number(form.get("minimumStock")), status: form.get("status"),
      description: form.get("description") || null,
      barcodes: String(form.get("barcodes") || "").split(",").map((value) => value.trim()).filter(Boolean),
      compatibleModelIds: form.getAll("compatibleModelIds"),
    };
    try {
      setFieldErrors({});
      await api(editing ? `/api/v1/catalog/products/${editing.id}` : "/api/v1/catalog/products", {
        method: editing ? "PATCH" : "POST", body: JSON.stringify(body),
      });
      setMessage(editing ? "Produk diperbarui" : "Produk ditambahkan");
      closeProductForm(); await loadProducts();
    } catch (error) {
      if (error instanceof ApiRequestError) setFieldErrors(error.fields);
      setMessage(error instanceof Error ? error.message : "Penyimpanan gagal");
    }
  }

  if (loading) return <main className="grid min-h-screen place-items-center font-semibold text-slate-600">Memuat sistem...</main>;
  if (!user) return (
    <main className="grid min-h-screen place-items-center bg-slate-950 p-6">
      <form onSubmit={login} aria-describedby={message ? "login-error" : undefined} className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-red-600">Honda Workshop</p>
        <h1 className="mt-2 text-2xl font-black text-slate-900">Masuk ke Sistem</h1>
        <label htmlFor="login-email" className="mt-8 block text-sm font-bold text-slate-700">Email</label><input id="login-email" name="email" type="email" autoComplete="username" required aria-invalid={Boolean(message) || undefined} aria-describedby={message ? "login-error" : undefined} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" />
        <label htmlFor="login-password" className="mt-4 block text-sm font-bold text-slate-700">Password</label><input id="login-password" name="password" type="password" autoComplete="current-password" required minLength={8} aria-invalid={Boolean(message) || undefined} aria-describedby={message ? "login-error" : undefined} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" />
        {message && <p id="login-error" role="alert" className="mt-4 text-sm font-semibold text-red-700">{message}</p>}
        <button className="mt-6 w-full rounded-xl bg-red-600 px-4 py-3 font-bold text-white hover:bg-red-700">Masuk</button>
      </form>
    </main>
  );

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-red-600">Honda Workshop</p><h1 className="text-xl font-black">Katalog Suku Cadang</h1></div>
          <div className="flex items-center gap-3 text-right"><div><p className="text-sm font-bold">{user.displayName}</p><p className="text-xs uppercase text-slate-500">{user.role}</p></div><button onClick={logout} className="rounded-xl border px-3 py-2 text-sm font-bold">Keluar</button></div>
        </div>
      </header>
      <section className="mx-auto max-w-7xl p-4 sm:p-6">
        <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm sm:flex-row">
          <form onSubmit={(event) => { event.preventDefault(); void loadProducts(); }} role="search" className="flex flex-1 flex-col gap-2 min-[400px]:flex-row">
            <label htmlFor="catalog-search" className="sr-only">Cari produk</label>
            <input id="catalog-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari kode, nama, atau barcode" className="min-w-0 flex-1 rounded-xl border px-4 py-3" />
            <button className="rounded-xl bg-slate-900 px-5 py-3 font-bold text-white">Cari</button>
          </form>
          <button onClick={() => openProductForm(null)} className="rounded-xl bg-red-600 px-5 py-3 font-bold text-white">Tambah Produk</button>
        </div>
        <CatalogTools onBarcode={handleBarcode} onImported={handleImported} onMessage={setMessage} />
        {message && <p role="status" className="mt-4 rounded-xl bg-white p-3 text-sm font-semibold text-slate-700">{message}</p>}
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => <article key={product.id} className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase text-slate-500">{product.category || "Tanpa kategori"}</p><h2 className="mt-1 font-black">{product.name}</h2></div><button onClick={() => openProductForm(product)} className="min-h-11 min-w-11 rounded-lg px-2 text-sm font-bold text-red-700">Edit</button></div>
            <code className="mt-4 block rounded-xl bg-slate-100 p-3 font-bold">{product.partCode}</code>
            <div className="mt-4 flex justify-between"><span className="text-sm text-slate-500">HET</span><strong className="text-red-600">{money.format(product.het)}</strong></div>
            <p className="mt-3 text-xs text-slate-500">{product.compatibleModels.join(", ") || "Kompatibilitas belum diatur"}</p>
          </article>)}
        </div>
      </section>
      <WorkspaceOverview role={user.role} />
      {showForm && <AccessibleDialog labelledBy="product-dialog-title" onClose={closeProductForm}><form onSubmit={submitProduct} noValidate>
        <div className="flex items-start justify-between gap-4"><h2 id="product-dialog-title" className="text-xl font-black">{editing ? "Edit Produk" : "Tambah Produk"}</h2><button type="button" onClick={closeProductForm} aria-label="Tutup formulir produk" className="min-h-11 rounded-xl border px-3 font-bold">Tutup</button></div>
        {message && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">{message}</p>}
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div><label htmlFor="partCode" className="text-sm font-bold">Kode</label><input id="partCode" name="partCode" required defaultValue={editing?.partCode} {...fieldA11y("partCode")} data-dialog-initial-focus className="mt-1 w-full rounded-xl border px-3 py-2" /><FieldError errors={fieldErrors} name="partCode" /></div>
          <div><label htmlFor="product-name" className="text-sm font-bold">Nama</label><input id="product-name" name="name" required defaultValue={editing?.name} {...fieldA11y("name")} className="mt-1 w-full rounded-xl border px-3 py-2" /><FieldError errors={fieldErrors} name="name" /></div>
          <div><label htmlFor="categoryId" className="text-sm font-bold">Kategori</label><select id="categoryId" name="categoryId" defaultValue={editing?.categoryId || ""} {...fieldA11y("categoryId")} className="mt-1 w-full rounded-xl border px-3 py-2"><option value="">Tanpa kategori</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><FieldError errors={fieldErrors} name="categoryId" /></div>
          <div><label htmlFor="product-status" className="text-sm font-bold">Status</label><select id="product-status" name="status" defaultValue={editing?.status || "active"} {...fieldA11y("status")} className="mt-1 w-full rounded-xl border px-3 py-2"><option value="active">Aktif</option><option value="inactive">Nonaktif</option><option value="archived">Arsip</option></select><FieldError errors={fieldErrors} name="status" /></div>
          <div><label htmlFor="het" className="text-sm font-bold">HET</label><input id="het" name="het" type="number" min="0" required defaultValue={editing?.het || 0} {...fieldA11y("het")} className="mt-1 w-full rounded-xl border px-3 py-2" /><FieldError errors={fieldErrors} name="het" /></div>
          <div><label htmlFor="hpp" className="text-sm font-bold">HPP</label><input id="hpp" name="hpp" type="number" min="0" defaultValue={editing?.hpp || 0} {...fieldA11y("hpp")} className="mt-1 w-full rounded-xl border px-3 py-2" /><FieldError errors={fieldErrors} name="hpp" /></div>
          <div><label htmlFor="unit" className="text-sm font-bold">Unit</label><input id="unit" name="unit" defaultValue={editing?.unit || "pcs"} {...fieldA11y("unit")} className="mt-1 w-full rounded-xl border px-3 py-2" /><FieldError errors={fieldErrors} name="unit" /></div>
          <div><label htmlFor="minimumStock" className="text-sm font-bold">Stok Minimum</label><input id="minimumStock" name="minimumStock" type="number" min="0" defaultValue={editing?.minimumStock || 0} {...fieldA11y("minimumStock")} className="mt-1 w-full rounded-xl border px-3 py-2" /><FieldError errors={fieldErrors} name="minimumStock" /></div>
          <div className="sm:col-span-2"><label htmlFor="barcodes" className="text-sm font-bold">Barcode, pisahkan koma</label><input id="barcodes" name="barcodes" defaultValue={editing?.barcodes.join(", ")} {...fieldA11y("barcodes")} className="mt-1 w-full rounded-xl border px-3 py-2" /><FieldError errors={fieldErrors} name="barcodes" /></div>
          <div className="sm:col-span-2"><label htmlFor="compatibleModelIds" className="text-sm font-bold">Kompatibilitas</label><select id="compatibleModelIds" name="compatibleModelIds" multiple defaultValue={editing?.compatibleModelIds || []} {...fieldA11y("compatibleModelIds")} className="mt-1 h-36 w-full rounded-xl border px-3 py-2">{models.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><FieldError errors={fieldErrors} name="compatibleModelIds" /></div>
          <div className="sm:col-span-2"><label htmlFor="description" className="text-sm font-bold">Deskripsi</label><textarea id="description" name="description" defaultValue={editing?.description || ""} {...fieldA11y("description")} className="mt-1 w-full rounded-xl border px-3 py-2" /><FieldError errors={fieldErrors} name="description" /></div>
        </div>
        <button className="mt-6 w-full rounded-xl bg-red-600 px-4 py-3 font-bold text-white">Simpan</button>
      </form></AccessibleDialog>}
    </main>
  );
}
