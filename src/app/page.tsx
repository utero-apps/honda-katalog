"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AccessibleDialog } from "@/components/AccessibleDialog";
import { BarcodeScannerDialog, CatalogTools } from "@/components/CatalogTools";
import { BusinessWorkspace } from "@/components/BusinessWorkspace";
import { DashboardMobileNav } from "@/components/DashboardMobileNav";
import { WorkspaceOverview } from "@/components/WorkspaceOverview";

interface User {
  id: string;
  email: string;
  displayName: string;
  role: string;
}
interface Reference {
  id: string;
  name: string;
}
interface Product {
  id: string;
  partCode: string;
  name: string;
  categoryId: string | null;
  category: string | null;
  het: number;
  hpp: number;
  unit: string;
  minimumStock: number;
  status: string;
  description: string | null;
  imageUrl: string | null;
  barcodes: string[];
  compatibleModels: string[];
  compatibleModelIds: string[];
}
interface Envelope<T> {
  data: T;
  meta: { total?: number };
  error: { message: string; fields?: Record<string, string[]> } | null;
}

class ApiRequestError extends Error {
  constructor(
    message: string,
    public fields: Record<string, string[]> = {},
  ) {
    super(message);
  }
}

function FieldError({
  errors,
  name,
}: {
  errors: Record<string, string[]>;
  name: string;
}) {
  const error = errors[name]?.[0];
  return error ? (
    <span
      id={`${name}-error`}
      className="mt-1 block text-sm font-semibold text-red-700"
    >
      {error}
    </span>
  ) : null;
}

const money = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

async function api<T>(url: string, init?: RequestInit): Promise<Envelope<T>> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = (await response.json()) as Envelope<T>;
  if (!response.ok)
    throw new ApiRequestError(
      body.error?.message || "Permintaan gagal",
      body.error?.fields,
    );
  return body;
}

export default function Home() {
  const pathname = usePathname();
  const view =
    pathname === "/catalog"
      ? "catalog"
      : pathname === "/business" || pathname.startsWith("/business/")
        ? "business"
        : "dashboard";
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState("");
  const [categories, setCategories] = useState<Reference[]>([]);
  const [models, setModels] = useState<Reference[]>([]);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Product | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showProductScanner, setShowProductScanner] = useState(false);
  const [partCodeValue, setPartCodeValue] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [imageUrl, setImageUrl] = useState("");
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState("");
  const [isImageDropActive, setIsImageDropActive] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const closeProductForm = useCallback(() => {
    setShowForm(false);
    setShowProductScanner(false);
    setPartCodeValue("");
    setEditing(null);
    setFieldErrors({});
    setImageUrl("");
    setImageError("");
    setImageUploading(false);
    setIsImageDropActive(false);
  }, []);

  function openProductForm(product: Product | null) {
    setEditing(product);
    setPartCodeValue(product?.partCode ?? "");
    setFieldErrors({});
    setImageUrl(product?.imageUrl ?? "");
    setImageError("");
    setImageUploading(false);
    setIsImageDropActive(false);
    setShowForm(true);
  }

  function fieldA11y(name: string) {
    const hasError = Boolean(fieldErrors[name]?.length);
    return {
      "aria-invalid": hasError || undefined,
      "aria-describedby": hasError ? `${name}-error` : undefined,
    };
  }

  async function uploadProductImage(file?: File) {
    if (!file) return;
    const acceptedTypes = ["image/jpeg", "image/png", "image/webp", "image/avif"];
    if (!acceptedTypes.includes(file.type)) {
      setImageError("Gunakan gambar JPEG, PNG, WebP, atau AVIF.");
      if (imageInputRef.current) imageInputRef.current.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageError("Ukuran gambar maksimal 5 MB.");
      if (imageInputRef.current) imageInputRef.current.value = "";
      return;
    }
    setImageUploading(true);
    setImageError("");
    try {
      const form = new FormData();
      form.set("image", file);
      const response = await fetch("/api/v1/catalog/product-images", {
        method: "POST",
        body: form,
      });
      const result = (await response.json()) as Envelope<{ imageUrl: string }>;
      if (!response.ok)
        throw new Error(result.error?.message || "Gambar belum dapat diunggah");
      setImageUrl(result.data.imageUrl);
      setFieldErrors((current) => ({ ...current, imageUrl: [] }));
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "Gambar belum dapat diunggah");
    } finally {
      setImageUploading(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  }

  const loadProducts = useCallback(
    async (search = query) => {
      setProductsLoading(true);
      setProductsError("");
      setProducts([]);
      try {
        const result = await api<Product[]>(
          `/api/v1/catalog/products?query=${encodeURIComponent(search)}&pageSize=100`,
        );
        setProducts(result.data);
      } catch (error) {
        setProductsError(
          error instanceof Error ? error.message : "Katalog gagal dimuat",
        );
        setProducts([]);
      } finally {
        setProductsLoading(false);
      }
    },
    [query],
  );
  const handleBarcode = useCallback(
    (value: string) => {
      setQuery(value);
      void loadProducts(value);
    },
    [loadProducts],
  );
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
    const timeoutId = window.setTimeout(() => {
      void bootstrap();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [bootstrap]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const result = await api<{ user: User }>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      setUser(result.data.user);
      setMessage("");
      await bootstrap();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Login gagal");
    }
  }

  async function logout() {
    await api("/api/v1/auth/logout", { method: "POST", body: "{}" });
    setUser(null);
    setProducts([]);
  }

  async function submitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (imageUploading) {
      setImageError("Tunggu unggahan gambar selesai sebelum menyimpan produk.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const body = {
      partCode: form.get("partCode"),
      name: form.get("name"),
      categoryId: form.get("categoryId"),
      het: Number(form.get("het")),
      hpp: Number(form.get("hpp")),
      unit: form.get("unit"),
      minimumStock: Number(form.get("minimumStock")),
      status: form.get("status"),
      description: form.get("description") || null,
      imageUrl: imageUrl || null,
      barcodes: String(form.get("barcodes") || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      compatibleModelIds: form.getAll("compatibleModelIds"),
    };
    try {
      setFieldErrors({});
      await api(
        editing
          ? `/api/v1/catalog/products/${editing.id}`
          : "/api/v1/catalog/products",
        {
          method: editing ? "PATCH" : "POST",
          body: JSON.stringify(body),
        },
      );
      setMessage(editing ? "Produk diperbarui" : "Produk ditambahkan");
      closeProductForm();
      await loadProducts();
    } catch (error) {
      if (error instanceof ApiRequestError) setFieldErrors(error.fields);
      setMessage(error instanceof Error ? error.message : "Penyimpanan gagal");
    }
  }

  if (loading)
    return (
      <main className="dashboard-shell grid min-h-screen place-items-center">
        <div className="space-y-4 text-center">
          <div className="mx-auto h-10 w-10 animate-pulse rounded-2xl bg-blue-700" />
          <p className="text-sm font-bold text-slate-600">
            Menyiapkan workspace…
          </p>
        </div>
      </main>
    );
  if (!user)
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 p-4 sm:p-6">
        <form
          onSubmit={login}
          aria-describedby={message ? "login-error" : undefined}
          className="dashboard-login w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl sm:p-9"
        >
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-800 text-lg font-black text-white">
              H
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-700">
                Honda Workshop
              </p>
              <p className="mt-0.5 text-xs font-medium text-slate-500">
                Operations command center
              </p>
            </div>
          </div>
          <h1 className="mt-8 text-3xl font-black tracking-tight text-slate-950">
            Masuk ke sistem
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Kelola katalog, servis, inventori, dan keuangan bengkel dari satu
            workspace.
          </p>
          <label
            htmlFor="login-email"
            className="mt-8 block text-sm font-bold text-slate-800"
          >
            Email
          </label>
          <input
            id="login-email"
            name="email"
            type="email"
            autoComplete="username"
            required
            placeholder="admin@honda.local"
            aria-invalid={Boolean(message) || undefined}
            aria-describedby={message ? "login-error" : undefined}
            className="dashboard-input mt-2 w-full rounded-xl border px-4 py-3"
          />
          <label
            htmlFor="login-password"
            className="mt-5 block text-sm font-bold text-slate-800"
          >
            Password
          </label>
          <input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            minLength={8}
            placeholder="Masukkan password"
            aria-invalid={Boolean(message) || undefined}
            aria-describedby={message ? "login-error" : undefined}
            className="dashboard-input mt-2 w-full rounded-xl border px-4 py-3"
          />
          {message && (
            <p
              id="login-error"
              role="alert"
              className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700"
            >
              {message}
            </p>
          )}
          <button className="dashboard-primary-button mt-7 w-full rounded-xl px-4 py-3 font-bold">
            Masuk ke Workspace
          </button>
        </form>
      </main>
    );

  return (
    <main className="dashboard-shell min-h-screen text-slate-950">
      <a href="#main-content" className="skip-link">
        Lewati navigasi
      </a>
      <div className="lg:grid lg:min-h-screen lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="hidden border-r border-blue-950/10 bg-blue-950 p-5 text-blue-50 lg:flex lg:flex-col">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-500 font-black text-blue-950">
              H
            </div>
            <div>
              <p className="text-sm font-black">Honda Workshop</p>
              <p className="text-xs text-blue-200">Control Center</p>
            </div>
          </div>
          <nav className="mt-10 space-y-2" aria-label="Navigasi utama">
            <Link
              href="/"
              aria-current={view === "dashboard" ? "page" : undefined}
              className={`dashboard-nav-link ${view === "dashboard" ? "dashboard-nav-link-active" : ""}`}
            >
              Ringkasan Operasional
            </Link>
            <Link href="/pos" className="dashboard-nav-link">
              Service Order Baru
            </Link>
            <Link href="/business/service-orders" className="dashboard-nav-link">
              Daftar Service Order
            </Link>
            <Link
              href="/catalog"
              aria-current={view === "catalog" ? "page" : undefined}
              className={`dashboard-nav-link ${view === "catalog" ? "dashboard-nav-link-active" : ""}`}
            >
              Katalog Sparepart
            </Link>
            <Link
              href="/business"
              aria-current={view === "business" ? "page" : undefined}
              className={`dashboard-nav-link ${view === "business" ? "dashboard-nav-link-active" : ""}`}
            >
              Modul Bisnis
            </Link>
          </nav>
          <div className="mt-auto rounded-2xl border border-blue-800 bg-blue-900/70 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-200">
              Akun aktif
            </p>
            <p className="mt-2 truncate text-sm font-bold">
              {user.displayName}
            </p>
            <p className="mt-1 text-xs capitalize text-blue-200">{user.role}</p>
            <button
              onClick={logout}
              className="mt-4 w-full rounded-xl border border-blue-700 px-3 py-2 text-sm font-bold text-white transition hover:bg-blue-800"
            >
              Keluar
            </button>
          </div>
        </aside>
        <div className="min-w-0">
          <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-slate-50/90 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-[96rem] items-center justify-between gap-4">
              <div className="flex items-center gap-3 lg:hidden">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-800 font-black text-white">
                  H
                </div>
                <p className="text-sm font-black text-blue-950">
                  Honda Workshop
                </p>
              </div>
              <div className="hidden lg:block">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">
                  Operations dashboard
                </p>
                <p className="mt-0.5 text-sm text-slate-500">
                  Bengkel, katalog, dan inventori dalam satu tampilan.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="hidden text-right sm:block">
                  <p className="text-sm font-bold text-slate-900">
                    {user.displayName}
                  </p>
                  <p className="text-xs capitalize text-slate-500">
                    {user.role}
                  </p>
                </div>
                <button
                  onClick={logout}
                  aria-label="Keluar dari sistem"
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:border-blue-300 hover:text-blue-800 lg:hidden"
                >
                  Keluar
                </button>
              </div>
            </div>
          </header>
          <DashboardMobileNav view={view} />
          <div
            id="main-content"
            className={`dashboard-page dashboard-page--${view} mx-auto max-w-[96rem] px-4 py-6 sm:px-6 lg:px-8 lg:py-8`}
          >
            <section className="dashboard-hero rounded-3xl px-5 py-6 text-white sm:px-7 sm:py-8">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-200">
                Honda Workshop
              </p>
              <div className="mt-4 flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
                <div>
                  <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                    {view === "catalog"
                      ? "Kelola katalog suku cadang."
                      : view === "business"
                        ? "Kelola modul bisnis bengkel."
                        : "Kendalikan operasi bengkel."}
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-100 sm:text-base">
                    {view === "catalog"
                      ? "Cari, scan, impor, dan perbarui data sparepart dari satu halaman khusus."
                      : view === "business"
                        ? "Kelola pelanggan, servis, inventori, vendor, keuangan, dan tindak lanjut."
                        : "Pantau ringkasan pekerjaan bengkel dan indikator operasional utama."}
                  </p>
                </div>
                {view !== "catalog" && (
                  <Link
                    href="/catalog"
                    className="inline-flex w-fit items-center rounded-xl bg-amber-400 px-4 py-3 text-sm font-black text-blue-950 transition hover:bg-amber-300"
                  >
                    Buka Katalog
                  </Link>
                )}
              </div>
            </section>
            <section
              id="catalog"
              className="dashboard-page-catalog mt-8"
              aria-labelledby="catalog-heading"
            >
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                <div>
                  <p className="dashboard-eyebrow">Catalog workspace</p>
                  <h2
                    id="catalog-heading"
                    className="mt-1 text-2xl font-black tracking-tight"
                  >
                    Katalog Suku Cadang
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {products.length} produk ditampilkan. Cari, scan, atau
                    tambah data baru.
                  </p>
                </div>
                <button
                  onClick={() => openProductForm(null)}
                  className="dashboard-primary-button rounded-xl px-4 py-3 text-sm font-bold"
                >
                  Tambah Produk
                </button>
              </div>
              <div className="dashboard-panel mt-5 rounded-2xl p-4 sm:p-5">
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void loadProducts();
                  }}
                  role="search"
                  className="flex flex-col gap-3 lg:flex-row"
                >
                  <div className="relative flex-1">
                    <label htmlFor="catalog-search" className="sr-only">
                      Cari produk
                    </label>
                    <input
                      id="catalog-search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Cari kode, nama, atau barcode"
                      className="dashboard-input w-full rounded-xl border px-4 py-3 pl-11"
                    />
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
                    >
                      <circle cx="11" cy="11" r="6" />
                      <path d="m20 20-4.35-4.35" />
                    </svg>
                  </div>
                  <button className="rounded-xl bg-blue-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-800">
                    Cari
                  </button>
                </form>
                <CatalogTools
                  onBarcode={handleBarcode}
                  onImported={handleImported}
                  onMessage={setMessage}
                />
              </div>
              {message && (
                <p
                  role="status"
                  className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm font-semibold text-blue-900"
                >
                  {message}
                </p>
              )}
              {productsLoading && (
                <div
                  className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
                  aria-live="polite"
                  aria-busy="true"
                >
                  <span className="sr-only">Memuat katalog</span>
                  {Array.from({ length: 3 }, (_, index) => (
                    <div
                      key={index}
                      className="h-56 animate-pulse rounded-2xl border border-slate-200 bg-slate-100"
                    />
                  ))}
                </div>
              )}
              {!productsLoading && productsError && (
                <div
                  role="alert"
                  className="mt-5 flex flex-col items-start gap-4 rounded-2xl border border-red-200 bg-red-50 p-5 sm:flex-row sm:items-center"
                >
                  <div className="flex-1">
                    <h3 className="font-black text-red-950">
                      Katalog belum dapat dimuat
                    </h3>
                    <p className="mt-1 text-sm text-red-800">{productsError}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadProducts()}
                    className="min-h-11 rounded-xl bg-red-700 px-4 text-sm font-bold text-white hover:bg-red-800"
                  >
                    Coba lagi
                  </button>
                </div>
              )}
              {!productsLoading && !productsError && products.length === 0 && (
                <div className="mt-5 grid min-h-56 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center">
                  <div>
                    <h3 className="font-black text-slate-900">
                      Produk tidak ditemukan
                    </h3>
                    <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-slate-600">
                      Ubah kata pencarian, scan barcode, impor CSV, atau
                      tambahkan produk baru.
                    </p>
                    <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
                      <button
                        type="button"
                        onClick={() => {
                          setQuery("");
                          void loadProducts("");
                        }}
                        className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
                      >
                        Reset pencarian
                      </button>
                      <button
                        type="button"
                        onClick={() => openProductForm(null)}
                        className="dashboard-primary-button min-h-11 rounded-xl px-4 text-sm font-bold"
                      >
                        Tambah produk
                      </button>
                    </div>
                  </div>
                </div>
              )}
              <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {products.map((product) => (
                  <article
                    key={product.id}
                    className="dashboard-product-card rounded-2xl p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                          {product.category || "Tanpa kategori"}
                        </p>
                        <h3 className="mt-2 truncate text-lg font-black text-slate-950">
                          {product.name}
                        </h3>
                      </div>
                      <button
                        onClick={() => openProductForm(product)}
                        className="rounded-lg px-2 py-1.5 text-sm font-bold text-blue-800 transition hover:bg-blue-50"
                      >
                        Edit
                      </button>
                    </div>
                    <code className="mt-5 block rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700">
                      {product.partCode}
                    </code>
                    <div className="mt-5 flex items-end justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Harga eceran
                        </p>
                        <strong className="mt-1 block text-lg font-black text-blue-900">
                          {money.format(product.het)}
                        </strong>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-bold ${product.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
                      >
                        {product.status === "active"
                          ? "Aktif"
                          : product.status === "archived"
                            ? "Arsip"
                            : "Nonaktif"}
                      </span>
                    </div>
                    <p className="mt-4 line-clamp-2 text-xs leading-5 text-slate-500">
                      {product.compatibleModels.join(", ") ||
                        "Kompatibilitas belum diatur"}
                    </p>
                  </article>
                ))}
              </div>
            </section>
            <div id="workspace" className="dashboard-page-workspace mt-8">
              {view === "dashboard" ? (
                <WorkspaceOverview
                  key={view}
                  role={user.role}
                  scope="dashboard"
                />
              ) : (
                <BusinessWorkspace role={user.role} />
              )}
            </div>
          </div>
        </div>
      </div>
      {showForm && (
        <AccessibleDialog
          labelledBy="product-dialog-title"
          onClose={closeProductForm}
        >
          <form onSubmit={submitProduct} noValidate>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="dashboard-eyebrow">Catalog workspace</p>
                <h2
                  id="product-dialog-title"
                  className="mt-1 text-xl font-black text-slate-950"
                >
                  {editing ? "Edit Produk" : "Tambah Produk"}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeProductForm}
                aria-label="Tutup formulir produk"
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
              >
                Tutup
              </button>
            </div>
            {message && (
              <p
                role="alert"
                className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800"
              >
                {message}
              </p>
            )}
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="partCode" className="text-sm font-bold">
                    Kode
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowProductScanner(true)}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-800 transition hover:border-blue-300 hover:bg-blue-100"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="h-4 w-4"
                      aria-hidden="true"
                    >
                      <path d="M3 5v4M3 5h4M21 5v4M21 5h-4M3 19v-4M3 19h4M21 19v-4M21 19h-4M7 9v6M10 8v8M14 8v8M17 9v6" />
                    </svg>
                    Scan kode
                  </button>
                </div>
                <input
                  id="partCode"
                  name="partCode"
                  required
                  value={partCodeValue}
                  onChange={(event) => setPartCodeValue(event.target.value)}
                  {...fieldA11y("partCode")}
                  data-dialog-initial-focus
                  className="dashboard-input mt-1 w-full rounded-xl border px-3 py-2"
                />
                <FieldError errors={fieldErrors} name="partCode" />
              </div>
              <div>
                <label htmlFor="product-name" className="text-sm font-bold">
                  Nama
                </label>
                <input
                  id="product-name"
                  name="name"
                  required
                  defaultValue={editing?.name}
                  {...fieldA11y("name")}
                  className="dashboard-input mt-1 w-full rounded-xl border px-3 py-2"
                />
                <FieldError errors={fieldErrors} name="name" />
              </div>
              <div>
                <label htmlFor="categoryId" className="text-sm font-bold">
                  Kategori
                </label>
                <select
                  id="categoryId"
                  name="categoryId"
                  defaultValue={editing?.categoryId || ""}
                  {...fieldA11y("categoryId")}
                  className="dashboard-input mt-1 w-full rounded-xl border px-3 py-2"
                >
                  <option value="">Tanpa kategori</option>
                  {categories.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <FieldError errors={fieldErrors} name="categoryId" />
              </div>
              <div>
                <label htmlFor="product-status" className="text-sm font-bold">
                  Status
                </label>
                <select
                  id="product-status"
                  name="status"
                  defaultValue={editing?.status || "active"}
                  {...fieldA11y("status")}
                  className="dashboard-input mt-1 w-full rounded-xl border px-3 py-2"
                >
                  <option value="active">Aktif</option>
                  <option value="inactive">Nonaktif</option>
                  <option value="archived">Arsip</option>
                </select>
                <FieldError errors={fieldErrors} name="status" />
              </div>
              <div>
                <label htmlFor="het" className="text-sm font-bold">
                  HET
                </label>
                <input
                  id="het"
                  name="het"
                  type="number"
                  min="0"
                  required
                  defaultValue={editing?.het || 0}
                  {...fieldA11y("het")}
                  className="dashboard-input mt-1 w-full rounded-xl border px-3 py-2"
                />
                <FieldError errors={fieldErrors} name="het" />
              </div>
              <div>
                <label htmlFor="hpp" className="text-sm font-bold">
                  HPP
                </label>
                <input
                  id="hpp"
                  name="hpp"
                  type="number"
                  min="0"
                  defaultValue={editing?.hpp || 0}
                  {...fieldA11y("hpp")}
                  className="dashboard-input mt-1 w-full rounded-xl border px-3 py-2"
                />
                <FieldError errors={fieldErrors} name="hpp" />
              </div>
              <div>
                <label htmlFor="unit" className="text-sm font-bold">
                  Unit
                </label>
                <input
                  id="unit"
                  name="unit"
                  defaultValue={editing?.unit || "pcs"}
                  {...fieldA11y("unit")}
                  className="dashboard-input mt-1 w-full rounded-xl border px-3 py-2"
                />
                <FieldError errors={fieldErrors} name="unit" />
              </div>
              <div>
                <label htmlFor="minimumStock" className="text-sm font-bold">
                  Stok Minimum
                </label>
                <input
                  id="minimumStock"
                  name="minimumStock"
                  type="number"
                  min="0"
                  defaultValue={editing?.minimumStock || 0}
                  {...fieldA11y("minimumStock")}
                  className="dashboard-input mt-1 w-full rounded-xl border px-3 py-2"
                />
                <FieldError errors={fieldErrors} name="minimumStock" />
              </div>
              <div className="sm:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="product-image" className="text-sm font-bold">
                    Gambar produk
                  </label>
                  <span className="text-xs font-medium text-slate-500">JPEG, PNG, WebP, AVIF · maks. 5 MB</span>
                </div>
                <input
                  ref={imageInputRef}
                  id="product-image"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  className="sr-only"
                  onChange={(event) => void uploadProductImage(event.target.files?.[0])}
                />
                <label
                  htmlFor="product-image"
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setIsImageDropActive(true);
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={() => setIsImageDropActive(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setIsImageDropActive(false);
                    void uploadProductImage(event.dataTransfer.files?.[0]);
                  }}
                  className={`mt-2 flex min-h-40 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed p-4 transition ${isImageDropActive ? "border-blue-600 bg-blue-50" : "border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-blue-50/50"}`}
                >
                  {imageUrl ? (
                    <div className="flex w-full items-center gap-4">
                      <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
                        <Image loader={({ src }) => src} unoptimized fill sizes="112px" src={imageUrl} alt="Pratinjau gambar produk" className="object-cover" />
                      </div>
                      <span className="min-w-0 text-left">
                        <span className="block text-sm font-bold text-slate-900">Gambar siap dipakai</span>
                        <span className="mt-1 block truncate text-xs text-slate-500">Klik atau seret gambar lain untuk mengganti.</span>
                      </span>
                    </div>
                  ) : (
                    <span className="text-center">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="mx-auto h-8 w-8 text-blue-700" aria-hidden="true"><path d="M12 16V4m0 0L8 8m4-4 4 4M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" /></svg>
                      <span className="mt-2 block text-sm font-bold text-slate-900">Seret dan lepas gambar di sini</span>
                      <span className="mt-1 block text-xs text-slate-500">atau klik untuk memilih file dari perangkat</span>
                    </span>
                  )}
                </label>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-xs text-slate-500">Gambar tersimpan pada server dan tampil di katalog sparepart.</p>
                  {imageUrl && (
                    <button type="button" onClick={() => setImageUrl("")} className="min-h-11 shrink-0 rounded-lg px-3 text-xs font-bold text-red-700 transition hover:bg-red-50">
                      Hapus gambar
                    </button>
                  )}
                </div>
                {imageUploading && <p aria-live="polite" className="mt-2 text-sm font-semibold text-blue-800">Mengunggah gambar…</p>}
                {imageError && <p role="alert" className="mt-2 text-sm font-semibold text-red-700">{imageError}</p>}
                <FieldError errors={fieldErrors} name="imageUrl" />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="barcodes" className="text-sm font-bold">
                  Barcode, pisahkan koma
                </label>
                <input
                  id="barcodes"
                  name="barcodes"
                  defaultValue={editing?.barcodes.join(", ")}
                  {...fieldA11y("barcodes")}
                  className="dashboard-input mt-1 w-full rounded-xl border px-3 py-2"
                />
                <FieldError errors={fieldErrors} name="barcodes" />
              </div>
              <div className="sm:col-span-2">
                <label
                  htmlFor="compatibleModelIds"
                  className="text-sm font-bold"
                >
                  Kompatibilitas
                </label>
                <select
                  id="compatibleModelIds"
                  name="compatibleModelIds"
                  multiple
                  defaultValue={editing?.compatibleModelIds || []}
                  {...fieldA11y("compatibleModelIds")}
                  className="dashboard-input mt-1 h-36 w-full rounded-xl border px-3 py-2"
                >
                  {models.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <FieldError errors={fieldErrors} name="compatibleModelIds" />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="description" className="text-sm font-bold">
                  Deskripsi
                </label>
                <textarea
                  id="description"
                  name="description"
                  defaultValue={editing?.description || ""}
                  {...fieldA11y("description")}
                  className="dashboard-input mt-1 w-full rounded-xl border px-3 py-2"
                />
                <FieldError errors={fieldErrors} name="description" />
              </div>
            </div>
            <button disabled={imageUploading} className="dashboard-primary-button mt-6 w-full rounded-xl px-4 py-3 font-bold disabled:cursor-not-allowed disabled:opacity-60">
              {imageUploading ? "Mengunggah gambar…" : "Simpan Produk"}
            </button>
          </form>
        </AccessibleDialog>
      )}
      {showProductScanner && (
        <BarcodeScannerDialog
          title="Scan kode produk"
          description="Arahkan barcode atau QR kode produk ke kamera. Hasil scan akan langsung mengisi field Kode."
          onDetected={(value) => {
            setPartCodeValue(value);
            setFieldErrors((current) => ({ ...current, partCode: [] }));
          }}
          onClose={() => setShowProductScanner(false)}
        />
      )}
    </main>
  );
}
