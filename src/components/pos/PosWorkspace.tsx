"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { BarcodeScannerDialog } from "@/components/CatalogTools";
import { PaymentDialog } from "./PaymentDialog";
import { ReceiptDialog } from "./ReceiptDialog";
import type { ApiEnvelope, CartItem, CheckoutPayment, Customer, PosRegister, Product, Receipt } from "./types";

const money = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const body = await response.json().catch(() => null) as ApiEnvelope<T> | null;
  if (!response.ok) throw new Error(body?.error?.message || "Permintaan tidak dapat diproses");
  if (!body) throw new Error("Respons server tidak valid");
  return body.data;
}

function productStock(product: Product) {
  return product.availableQuantity ?? product.quantity;
}

function Icon({ name }: { name: "search" | "scan" | "cart" | "minus" | "plus" | "trash" | "back" | "refresh" }) {
  const paths = {
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
    scan: <><path d="M3 5v4M3 5h4M21 5v4M21 5h-4M3 19v-4M3 19h4M21 19v-4M21 19h-4M7 9v6M10 8v8M14 8v8M17 9v6" /></>,
    cart: <><path d="M3 3h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 7H6" /><circle cx="10" cy="20" r="1" /><circle cx="18" cy="20" r="1" /></>,
    minus: <path d="M5 12h14" />,
    plus: <path d="M12 5v14M5 12h14" />,
    trash: <><path d="M4 7h16M9 7V4h6v3M8 11v6M12 11v6M16 11v6M6 7l1 14h10l1-14" /></>,
    back: <path d="m15 18-6-6 6-6" />,
    refresh: <><path d="M20 6v5h-5" /><path d="M4 18v-5h5" /><path d="M18.5 9A7 7 0 0 0 6 6.5L4 9M5.5 15A7 7 0 0 0 18 17.5l2-2.5" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export function PosWorkspace() {
  const searchRef = useRef<HTMLInputElement>(null);
  const requestSequence = useRef(0);
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [registers, setRegisters] = useState<PosRegister[]>([]);
  const [registerId, setRegisterId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("Siap menerima scan barcode atau pencarian produk.");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [receiptItems, setReceiptItems] = useState<CartItem[]>([]);
  const [receiptPayment, setReceiptPayment] = useState<CheckoutPayment | null>(null);

  const itemCount = cart.reduce((sum, item) => sum + item.cartQuantity, 0);
  const subtotal = cart.reduce((sum, item) => sum + item.cartQuantity * item.het, 0);

  const addProduct = useCallback((product: Product) => {
    const stock = productStock(product);
    setCart((current) => {
      const existing = current.find((item) => item.id === product.id);
      if (stock !== undefined && (existing?.cartQuantity ?? 0) >= stock) {
        setNotice(`Stok ${product.name} hanya ${stock} ${product.unit}.`);
        return current;
      }
      if (existing) return current.map((item) => item.id === product.id ? { ...item, cartQuantity: item.cartQuantity + 1 } : item);
      return [...current, { ...product, cartQuantity: 1 }];
    });
    setNotice(`${product.name} ditambahkan ke keranjang.`);
  }, []);

  const loadProducts = useCallback(async (search = "", autoAdd = false) => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: "1", pageSize: "48" });
      if (registerId) params.set("registerId", registerId);
      if (search.trim()) params.set("query", search.trim());
      const data = await request<Product[]>(`/api/v1/pos/products?${params}`);
      if (sequence !== requestSequence.current) return;
      setProducts(data);
      if (autoAdd) {
        const normalized = search.trim().toLowerCase();
        const exact = data.find((product) => product.partCode.toLowerCase() === normalized || product.barcodes?.some((barcode) => barcode.toLowerCase() === normalized));
        if (exact) {
          addProduct(exact);
          setQuery("");
          window.requestAnimationFrame(() => searchRef.current?.focus());
        } else {
          setNotice(data.length === 1 ? "Produk ditemukan. Pilih produk untuk menambahkannya." : `Tidak ada kecocokan tepat untuk ${search}.`);
        }
      }
    } catch (reason) {
      if (sequence === requestSequence.current) {
        setProducts([]);
        setError(reason instanceof Error ? reason.message : "Produk belum dapat dimuat");
      }
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [addProduct, registerId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      request<PosRegister[]>("/api/v1/pos/registers").then((items) => {
        setRegisters(items);
        setRegisterId((current) => current || items[0]?.id || "");
      }).catch((reason) => setError(reason instanceof Error ? reason.message : "Register POS gagal dimuat"));
      request<Customer[]>("/api/v1/operations/customers").then(setCustomers).catch(() => setCustomers([]));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "F2") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
      if (event.key === "F8" && cart.length > 0 && !receipt) {
        event.preventDefault();
        setCheckoutError("");
        setPaymentOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cart.length, receipt]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadProducts(query), 300);
    return () => window.clearTimeout(timeout);
  }, [loadProducts, query]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (query.trim()) void loadProducts(query, true);
  }

  function updateQuantity(productId: string, quantity: number) {
    setCart((current) => current.flatMap((item) => {
      if (item.id !== productId) return [item];
      if (quantity <= 0) return [];
      const stock = productStock(item);
      if (stock !== undefined && quantity > stock) {
        setNotice(`Jumlah maksimal ${item.name}: ${stock} ${item.unit}.`);
        return [item];
      }
      return [{ ...item, cartQuantity: quantity }];
    }));
  }

  async function checkout(payment: CheckoutPayment) {
    if (!registerId) { setCheckoutError("Pilih register POS aktif sebelum checkout."); return; }
    setCheckingOut(true);
    setCheckoutError("");
    const submittedItems = cart.map((item) => ({ ...item }));
    try {
      const data = await request<Receipt & { saleNumber?: string; completedAt?: string; changeAmount?: string | number }>("/api/v1/pos/checkout", {
        method: "POST",
        body: JSON.stringify({
          registerId,
          customerId: customerId || null,
          items: cart.map((item) => ({ productId: item.id, quantity: String(item.cartQuantity), discount: "0" })),
          payments: [{ ...payment, amount: payment.amount.toFixed(2), idempotencyKey: crypto.randomUUID() }],
          tax: "0",
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      setReceiptItems(submittedItems);
      setReceiptPayment(payment);
      setReceipt({
        ...data,
        receiptNumber: data.saleNumber ?? data.receiptNumber,
        createdAt: data.completedAt ?? data.createdAt,
        subtotal: Number(data.subtotal ?? 0),
        total: Number(data.total ?? 0),
        change: Number(data.changeAmount ?? data.change ?? 0),
        items: data.items?.map((item) => ({ ...item, name: item.name ?? (item as { productName?: string }).productName, quantity: Number(item.quantity), unitPrice: Number(item.unitPrice), subtotal: Number(item.subtotal ?? (item as { lineTotal?: string | number }).lineTotal ?? 0) })),
        payments: data.payments?.map((item) => ({ ...item, amount: Number(item.amount) })),
      });
      setPaymentOpen(false);
      setCart([]);
      setCustomerId("");
      setNotice("Transaksi berhasil disimpan.");
    } catch (reason) {
      setCheckoutError(reason instanceof Error ? reason.message : "Checkout gagal. Cart tetap tersimpan untuk dicoba kembali.");
    } finally {
      setCheckingOut(false);
    }
  }

  const customerOptions = useMemo(() => customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.phone ? ` - ${customer.phone}` : ""}</option>), [customers]);

  return (
    <main className="min-h-dvh bg-[radial-gradient(circle_at_top_left,_#dbeafe_0,_transparent_28rem),linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)] text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200/90 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[96rem] items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" aria-label="Kembali ke dashboard" className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"><Icon name="back" /></Link>
            <div className="min-w-0"><p className="text-xs font-black uppercase tracking-[0.2em] text-red-600">Honda Workshop</p><h1 className="truncate text-xl font-black tracking-tight sm:text-2xl">Point of Sale</h1></div>
          </div>
          <div className="flex items-center gap-3 text-xs font-bold text-slate-500"><Link href="/service/reception" className="hidden min-h-11 items-center rounded-xl border border-blue-200 bg-blue-50 px-3 text-blue-800 transition hover:bg-blue-100 sm:inline-flex">Terima motor service</Link><span className="hidden sm:inline"><kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 py-1 text-slate-700">F2</kbd> Cari</span><span className="hidden sm:inline"><kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 py-1 text-slate-700">F8</kbd> Bayar</span></div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[96rem] gap-5 px-4 py-5 pb-32 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)] lg:px-8 lg:pb-8 xl:grid-cols-[minmax(0,1.45fr)_minmax(380px,.55fr)]">
        <section aria-labelledby="pos-products-title" className="min-w-0">
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div><p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">Katalog aktif</p><h2 id="pos-products-title" className="mt-1 text-2xl font-black tracking-tight">Cari sparepart</h2><p className="mt-1 text-sm text-slate-600">Scan barcode, kode part, atau ketik nama produk.</p></div>
              <button type="button" onClick={() => setScannerOpen(true)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-black text-white hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"><Icon name="scan" />Scan kamera</button>
            </div>
            <form onSubmit={submitSearch} className="mt-4 flex gap-2">
              <label className="relative min-w-0 flex-1"><span className="sr-only">Cari produk</span><span className="pointer-events-none absolute inset-y-0 left-4 grid place-items-center text-slate-400"><Icon name="search" /></span><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" enterKeyHint="search" placeholder="Scan atau cari kode / nama produk" className="min-h-12 w-full rounded-2xl border border-slate-300 bg-white pl-12 pr-4 text-base font-semibold text-slate-950 outline-none placeholder:text-slate-400 focus:border-blue-700 focus:ring-4 focus:ring-blue-100" /></label>
              <button type="submit" className="min-h-12 rounded-2xl bg-blue-700 px-5 text-sm font-black text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">Cari</button>
            </form>
            <label className="mt-3 block text-sm font-bold text-slate-700">Register dan gudang<select value={registerId} onChange={(event) => { setRegisterId(event.target.value); setCart([]); }} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-950 focus:border-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100" disabled={registers.length === 0}><option value="">Pilih register aktif</option>{registers.map((register) => <option key={register.id} value={register.id}>{register.name} · {register.warehouseName}</option>)}</select></label>
            <p className="mt-3 text-sm font-semibold text-slate-600" role="status" aria-live="polite">{notice}</p>
          </div>

          <div className="mt-4">
            {loading ? <div aria-label="Memuat produk" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-44 animate-pulse rounded-2xl border border-slate-200 bg-white p-4"><div className="h-3 w-20 rounded bg-slate-200" /><div className="mt-4 h-5 w-4/5 rounded bg-slate-200" /><div className="mt-8 h-8 w-1/2 rounded bg-slate-100" /></div>)}</div> : error ? <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-center"><p className="font-black text-red-900">Produk gagal dimuat</p><p className="mt-1 text-sm text-red-700">{error}</p><button type="button" onClick={() => void loadProducts(query)} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-red-700 px-4 text-sm font-black text-white"><Icon name="refresh" />Coba lagi</button></div> : products.length === 0 ? <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center"><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-500"><Icon name="search" /></div><p className="mt-4 font-black text-slate-950">Produk tidak ditemukan</p><p className="mt-1 text-sm text-slate-600">Periksa kode atau gunakan istilah pencarian lain.</p><button type="button" onClick={() => setQuery("")} className="mt-4 min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800">Reset pencarian</button></div> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{products.map((product) => { const stock = productStock(product); const unavailable = stock !== undefined && stock <= 0; return <button key={product.id} type="button" disabled={unavailable} onClick={() => addProduct(product)} className="group min-h-44 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transform-none"><div className="flex items-start justify-between gap-3"><span className="rounded-lg bg-blue-50 px-2 py-1 font-mono text-xs font-bold text-blue-800">{product.partCode}</span>{stock !== undefined && <span className={`text-xs font-bold ${stock <= (product.minimumStock ?? 0) ? "text-amber-700" : "text-slate-500"}`}>Stok {stock}</span>}</div><h3 className="mt-3 line-clamp-2 text-base font-black leading-6 text-slate-950">{product.name}</h3><p className="mt-1 text-xs font-semibold text-slate-500">{product.category || "Sparepart"} · {product.unit}</p><div className="mt-4 flex items-end justify-between gap-3"><p className="text-lg font-black tabular-nums text-red-600">{money.format(product.het)}</p><span className="text-xs font-bold text-blue-700">{unavailable ? "Stok habis" : "Tambah +"}</span></div></button>; })}</div>}
          </div>
        </section>

        <aside aria-labelledby="pos-cart-title" className="lg:sticky lg:top-[85px] lg:h-[calc(100dvh-105px)]">
          <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5">
            <div className="border-b border-slate-200 bg-slate-950 px-5 py-4 text-white"><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-red-400">Transaksi aktif</p><h2 id="pos-cart-title" className="mt-1 flex items-center gap-2 text-xl font-black"><Icon name="cart" />Keranjang</h2></div><span className="rounded-full bg-white/10 px-3 py-1 text-sm font-bold tabular-nums">{itemCount} item</span></div></div>
            <div className="border-b border-slate-200 p-4"><div className="flex items-center justify-between gap-3"><span className="text-xs font-black uppercase tracking-wide text-slate-500">Pelanggan opsional</span><Link href="/service/reception" className="text-xs font-black text-blue-700 hover:text-blue-900">Tambah pelanggan / motor</Link></div><select aria-label="Pelanggan retail opsional" value={customerId} onChange={(event) => setCustomerId(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-100"><option value="">Pelanggan umum</option>{customerOptions}</select></div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
              {cart.length === 0 ? <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center"><div><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-white text-slate-400 shadow-sm"><Icon name="cart" /></div><p className="mt-4 font-black text-slate-900">Keranjang masih kosong</p><p className="mt-1 text-sm leading-5 text-slate-600">Pilih produk atau scan barcode untuk memulai transaksi.</p></div></div> : <ul className="space-y-3">{cart.map((item) => <li key={item.id} className="rounded-2xl border border-slate-200 p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-black text-slate-950">{item.name}</p><p className="mt-0.5 font-mono text-xs font-bold text-slate-500">{item.partCode}</p></div><button type="button" onClick={() => updateQuantity(item.id, 0)} aria-label={`Hapus ${item.name}`} className="grid min-h-11 min-w-11 place-items-center rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-red-600"><Icon name="trash" /></button></div><div className="mt-3 flex items-center justify-between gap-3"><div className="flex items-center rounded-xl border border-slate-200"><button type="button" onClick={() => updateQuantity(item.id, item.cartQuantity - 1)} aria-label={`Kurangi ${item.name}`} className="grid min-h-11 min-w-11 place-items-center rounded-l-xl hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-700"><Icon name="minus" /></button><input aria-label={`Jumlah ${item.name}`} type="number" inputMode="numeric" min="1" value={item.cartQuantity} onChange={(event) => updateQuantity(item.id, Number(event.target.value))} className="h-11 w-12 border-x border-slate-200 text-center text-sm font-black tabular-nums outline-none focus:ring-2 focus:ring-inset focus:ring-blue-600" /><button type="button" onClick={() => updateQuantity(item.id, item.cartQuantity + 1)} aria-label={`Tambah ${item.name}`} className="grid min-h-11 min-w-11 place-items-center rounded-r-xl hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-700"><Icon name="plus" /></button></div><div className="text-right"><p className="text-xs text-slate-500">{money.format(item.het)} / {item.unit}</p><p className="font-black tabular-nums text-slate-950">{money.format(item.het * item.cartQuantity)}</p></div></div></li>)}</ul>}
            </div>
            <div className="border-t border-slate-200 bg-slate-50 p-4"><div className="flex items-end justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Total</p><p className="mt-1 text-xs text-slate-500">{itemCount} item dalam transaksi</p></div><p className="text-2xl font-black tabular-nums text-slate-950">{money.format(subtotal)}</p></div><button type="button" onClick={() => { setCheckoutError(""); setPaymentOpen(true); }} disabled={cart.length === 0} className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-red-600 px-5 text-base font-black text-white shadow-lg shadow-red-600/20 hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 disabled:shadow-none">Bayar sekarang <span className="text-xs opacity-75">F8</span></button></div>
          </div>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 p-3 backdrop-blur lg:hidden"><button type="button" disabled={cart.length === 0} onClick={() => { setCheckoutError(""); setPaymentOpen(true); }} className="flex min-h-12 w-full items-center justify-between rounded-2xl bg-red-600 px-5 font-black text-white shadow-lg disabled:bg-slate-300 disabled:text-slate-600"><span>{itemCount} item</span><span>Bayar {money.format(subtotal)}</span></button></div>

      {scannerOpen && <BarcodeScannerDialog title="Scan produk POS" description="Scan barcode produk. Produk yang cocok akan langsung masuk ke keranjang." onClose={() => setScannerOpen(false)} onDetected={(value) => { setQuery(value); void loadProducts(value, true); }} />}
      {paymentOpen && <PaymentDialog total={subtotal} busy={checkingOut} error={checkoutError} onClose={() => { if (!checkingOut) setPaymentOpen(false); }} onConfirm={checkout} />}
      {receipt && receiptPayment && <ReceiptDialog receipt={receipt} fallbackItems={receiptItems} fallbackPayment={receiptPayment} onClose={() => { setReceipt(null); setReceiptItems([]); setReceiptPayment(null); window.requestAnimationFrame(() => searchRef.current?.focus()); }} />}
    </main>
  );
}
