"use client";

import Link from "next/link";
import Image from "next/image";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { BarcodeScannerDialog } from "@/components/CatalogTools";
import { PaymentDialog } from "./PaymentDialog";
import { ReceiptDialog } from "./ReceiptDialog";
import type {
  ApiEnvelope,
  CartItem,
  CheckoutPayment,
  Customer,
  OpenBill,
  PosRegister,
  PosService,
  Product,
  Receipt,
} from "./types";

const money = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
type SaveState = "local" | "loading" | "saving" | "saved" | "error";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = (await response
    .json()
    .catch(() => null)) as ApiEnvelope<T> | null;
  if (!response.ok)
    throw new Error(body?.error?.message || "Permintaan tidak dapat diproses");
  if (!body) throw new Error("Respons server tidak valid");
  return body.data;
}

const productStock = (product: Product) =>
  product.availableQuantity ?? product.quantity;
const cartKey = (item: Pick<CartItem, "id" | "itemType">) =>
  `${item.itemType}:${item.id}`;
const catalogPrice = (
  item: Product | PosService,
  itemType: CartItem["itemType"],
) =>
  itemType === "service"
    ? ((item as PosService).price ?? (item as PosService).fixedPrice ?? 0)
    : ((item as Product).het ?? 0);

function Icon({
  name,
}: {
  name:
    | "search"
    | "scan"
    | "cart"
    | "minus"
    | "plus"
    | "trash"
    | "back"
    | "refresh"
    | "image"
    | "save";
}) {
  const paths = {
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </>
    ),
    scan: (
      <>
        <path d="M3 5v4M3 5h4M21 5v4M21 5h-4M3 19v-4M3 19h4M21 19v-4M21 19h-4M7 9v6M10 8v8M14 8v8M17 9v6" />
      </>
    ),
    cart: (
      <>
        <path d="M3 3h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 7H6" />
        <circle cx="10" cy="20" r="1" />
        <circle cx="18" cy="20" r="1" />
      </>
    ),
    minus: <path d="M5 12h14" />,
    plus: <path d="M12 5v14M5 12h14" />,
    trash: (
      <>
        <path d="M4 7h16M9 7V4h6v3M8 11v6M12 11v6M16 11v6M6 7l1 14h10l1-14" />
      </>
    ),
    back: <path d="m15 18-6-6 6-6" />,
    refresh: (
      <>
        <path d="M20 6v5h-5M4 18v-5h5" />
        <path d="M18.5 9A7 7 0 0 0 6 6.5L4 9M5.5 15A7 7 0 0 0 18 17.5l2-2.5" />
      </>
    ),
    image: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="8.5" cy="9" r="1.5" />
        <path d="m21 15-5-5L5 20" />
      </>
    ),
    save: (
      <>
        <path d="M5 3h12l2 2v16H5Z" />
        <path d="M8 3v6h8V3M8 21v-7h8v7" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

function ItemImage({
  item,
}: {
  item: { imageUrl?: string | null; name: string };
}) {
  const [failed, setFailed] = useState(false);
  if (!item.imageUrl || failed)
    return (
      <div className="grid aspect-square place-items-center bg-slate-100 text-slate-400">
        <Icon name="image" />
        <span className="sr-only">Gambar {item.name} belum tersedia</span>
      </div>
    );
  return (
    <Image
      loader={({ src }) => src}
      unoptimized
      fill
      sizes="(max-width: 640px) 50vw, (max-width: 1280px) 33vw, 20vw"
      src={item.imageUrl}
      alt={`Gambar ${item.name}`}
      onError={() => setFailed(true)}
      className="object-cover"
    />
  );
}

export function openBillItemToCart(
  item: OpenBill["items"][number],
): CartItem | null {
  const itemType = item.itemType ?? (item.serviceId ? "service" : "product");
  const source = itemType === "service" ? item.service : item.product;
  const id = itemType === "service" ? item.serviceId : item.productId;
  if (!id) return null;
  const unitPrice = Number(
    item.unitPrice ??
      item.price ??
      (source && "price" in source
        ? source.price
        : source && "het" in source
          ? source.het
          : 0),
  );
  const base = {
    id,
    name: item.itemName ?? item.name ?? source?.name ?? "Item Open Bill",
    unit: item.unit ?? source?.unit ?? "unit",
    category: source?.category ?? null,
    imageUrl: item.imageUrl ?? source?.imageUrl ?? null,
    status: "active",
    itemType,
    unitPrice,
    cartQuantity: Number(item.quantity),
  };
  return itemType === "service"
    ? {
        ...base,
        code:
          item.itemCode ??
          item.code ??
          (source && "code" in source ? source.code : "JASA"),
        price: unitPrice,
        description: null,
      }
    : ({
        ...base,
        partCode:
          item.itemCode ??
          item.code ??
          (source && "partCode" in source ? source.partCode : "PRODUK"),
        het: unitPrice,
        barcodes: source && "barcodes" in source ? source.barcodes : [],
      } as CartItem);
}

export function PosWorkspace() {
  const searchRef = useRef<HTMLInputElement>(null);
  const requestSequence = useRef(0);
  const openBillRequestSequence = useRef(0);
  const skipAutosave = useRef(false);
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [services, setServices] = useState<PosService[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [registers, setRegisters] = useState<PosRegister[]>([]);
  const [registerId, setRegisterId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(
    "Siap menerima scan barcode atau pencarian produk.",
  );
  const [scannerOpen, setScannerOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [receiptItems, setReceiptItems] = useState<CartItem[]>([]);
  const [receiptPayment, setReceiptPayment] = useState<CheckoutPayment | null>(
    null,
  );
  const [openBillId, setOpenBillId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("local");
  const itemCount = cart.reduce((sum, item) => sum + item.cartQuantity, 0);
  const subtotal = cart.reduce(
    (sum, item) => sum + item.cartQuantity * item.unitPrice,
    0,
  );

  const addItem = useCallback(
    (item: Product | PosService, itemType: CartItem["itemType"]) => {
      setCart((current) => {
        const stock =
          itemType === "product" ? productStock(item as Product) : undefined;
        const found = current.find(
          (entry) => cartKey(entry) === `${itemType}:${item.id}`,
        );
        if (stock !== undefined && (found?.cartQuantity ?? 0) >= stock) {
          setNotice(`Stok ${item.name} hanya ${stock} ${item.unit}.`);
          return current;
        }
        if (found)
          return current.map((entry) =>
            cartKey(entry) === `${itemType}:${item.id}`
              ? { ...entry, cartQuantity: entry.cartQuantity + 1 }
              : entry,
          );
        return [
          ...current,
          {
            ...item,
            itemType,
            unitPrice: catalogPrice(item, itemType),
            cartQuantity: 1,
          },
        ];
      });
      setNotice(`${item.name} ditambahkan ke keranjang.`);
    },
    [],
  );

  const loadProducts = useCallback(
    async (search = "", autoAdd = false) => {
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
          const exact = data.find(
            (product) =>
              product.partCode.toLowerCase() === normalized ||
              product.barcodes?.some(
                (barcode) => barcode.toLowerCase() === normalized,
              ),
          );
          if (exact) {
            addItem(exact, "product");
            setQuery("");
            window.requestAnimationFrame(() => searchRef.current?.focus());
          } else setNotice(`Tidak ada kecocokan tepat untuk ${search}.`);
        }
      } catch (reason) {
        if (sequence === requestSequence.current) {
          setProducts([]);
          setError(
            reason instanceof Error
              ? reason.message
              : "Produk belum dapat dimuat",
          );
        }
      } finally {
        if (sequence === requestSequence.current) setLoading(false);
      }
    },
    [addItem, registerId],
  );

  const loadOpenBill = useCallback(
    async (selectedCustomerId: string) => {
      const sequence = ++openBillRequestSequence.current;
      setSaveState("loading");
      try {
        const bill = await request<OpenBill | null>(
          `/api/v1/pos/open-bills?customerId=${encodeURIComponent(selectedCustomerId)}`,
        );
        const restored = (bill?.items ?? [])
          .map(openBillItemToCart)
          .filter((item): item is CartItem => Boolean(item));
        if (sequence !== openBillRequestSequence.current) return;
        setOpenBillId(bill?.id ?? null);
        setCart(restored);
        setSaveState(bill ? "saved" : "local");
        setNotice(
          bill
            ? "Open Bill pelanggan dipulihkan."
            : "Belum ada Open Bill pelanggan ini.",
        );
      } catch (reason) {
        if (sequence !== openBillRequestSequence.current) return;
        setSaveState("error");
        setNotice(
          reason instanceof Error ? reason.message : "Open Bill gagal dimuat.",
        );
      }
    },
    [],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      request<PosRegister[]>("/api/v1/pos/registers")
        .then((items) => {
          setRegisters(items);
          setRegisterId((current) => current || items[0]?.id || "");
        })
        .catch((reason) =>
          setError(
            reason instanceof Error ? reason.message : "Register gagal dimuat",
          ),
        );
      request<Customer[]>("/api/v1/operations/customers")
        .then(setCustomers)
        .catch(() => setCustomers([]));
      request<PosService[]>("/api/v1/pos/services")
        .then((items) =>
          setServices(
            items.map((item) => ({
              ...item,
              price: item.price ?? item.fixedPrice ?? 0,
              unit: item.unit ?? "jasa",
              category: item.category ?? "Jasa bengkel",
              imageUrl: item.imageUrl ?? null,
            })),
          ),
        )
        .catch((reason) =>
          setError(
            reason instanceof Error ? reason.message : "Layanan gagal dimuat",
          ),
        )
        .finally(() => setServicesLoading(false));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadProducts(query), 300);
    return () => window.clearTimeout(timeout);
  }, [loadProducts, query]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "F2") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "F8" && cart.length) {
        event.preventDefault();
        setPaymentOpen(true);
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [cart.length]);
  useEffect(() => {
    if (!customerId || !registerId || skipAutosave.current) {
      skipAutosave.current = false;
      return;
    }
    const timeout = window.setTimeout(() => {
      if (cart.length === 0) {
        if (!openBillId) {
          setSaveState("local");
          return;
        }
        setSaveState("saving");
        request(`/api/v1/pos/open-bills/${openBillId}`, { method: "DELETE" })
          .then(() => {
            setOpenBillId(null);
            setSaveState("local");
          })
          .catch((reason) => {
            setSaveState("error");
            setNotice(
              reason instanceof Error
                ? reason.message
                : "Open Bill belum dapat dihapus.",
            );
          });
        return;
      }
      setSaveState("saving");
      request<OpenBill>("/api/v1/pos/open-bills", {
        method: "PUT",
        body: JSON.stringify({
          customerId,
          registerId,
          items: cart.map((item) =>
            item.itemType === "service"
              ? {
                  itemType: "service",
                  serviceId: item.id,
                  quantity: String(item.cartQuantity),
                }
              : {
                  itemType: "product",
                  productId: item.id,
                  quantity: String(item.cartQuantity),
                },
          ),
        }),
      })
        .then((bill) => {
          setOpenBillId(bill.id);
          setSaveState("saved");
        })
        .catch((reason) => {
          setSaveState("error");
          setNotice(
            reason instanceof Error
              ? reason.message
              : "Open Bill belum tersimpan.",
          );
        });
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [cart, customerId, openBillId, registerId]);

  function updateQuantity(key: string, quantity: number) {
    setCart((current) =>
      current.flatMap((item) => {
        if (cartKey(item) !== key) return [item];
        if (quantity <= 0) return [];
        const stock =
          item.itemType === "product"
            ? productStock(item as Product)
            : undefined;
        if (stock !== undefined && quantity > stock) {
          setNotice(`Jumlah maksimal ${item.name}: ${stock} ${item.unit}.`);
          return [item];
        }
        return [{ ...item, cartQuantity: quantity }];
      }),
    );
  }

  async function selectCustomer(nextId: string) {
    skipAutosave.current = true;
    if (!nextId) {
      openBillRequestSequence.current += 1;
      setCustomerId("");
      setOpenBillId(null);
      setCart([]);
      setSaveState("local");
      setNotice("Transaksi pelanggan umum dimulai dengan keranjang kosong.");
      return;
    }
    setCustomerId(nextId);
    setOpenBillId(null);
    setCart([]);
    await loadOpenBill(nextId);
  }

  async function checkout(payment: CheckoutPayment) {
    if (!registerId) {
      setCheckoutError("Pilih register POS aktif sebelum checkout.");
      return;
    }
    setCheckingOut(true);
    setCheckoutError("");
    const submittedItems = cart.map((item) => ({ ...item }));
    try {
      const data = await request<
        Receipt & {
          saleNumber?: string;
          completedAt?: string;
          changeAmount?: string | number;
        }
      >("/api/v1/pos/checkout", {
        method: "POST",
        body: JSON.stringify({
          registerId,
          customerId: customerId || null,
          openBillId: openBillId || undefined,
          items: cart.map((item) =>
            item.itemType === "service"
              ? {
                  serviceId: item.id,
                  quantity: String(item.cartQuantity),
                  discount: "0",
                }
              : {
                  productId: item.id,
                  quantity: String(item.cartQuantity),
                  discount: "0",
                },
          ),
          payments: [
            {
              ...payment,
              amount: payment.amount.toFixed(2),
              idempotencyKey: crypto.randomUUID(),
            },
          ],
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
      });
      setPaymentOpen(false);
      setCart([]);
      setCustomerId("");
      setOpenBillId(null);
      setSaveState("local");
      setNotice("Transaksi berhasil disimpan.");
    } catch (reason) {
      setCheckoutError(
        reason instanceof Error
          ? reason.message
          : "Checkout gagal. Cart tetap tersimpan.",
      );
    } finally {
      setCheckingOut(false);
    }
  }

  const customerOptions = useMemo(
    () =>
      customers.map((customer) => (
        <option key={customer.id} value={customer.id}>
          {customer.name}
          {customer.phone ? ` - ${customer.phone}` : ""}
        </option>
      )),
    [customers],
  );
  const saveLabel = !customerId
    ? "Pelanggan umum · lokal"
    : saveState === "loading"
      ? "Memuat Open Bill"
      : saveState === "saving"
        ? "Menyimpan…"
        : saveState === "saved"
          ? "Tersimpan · Open Bill"
          : saveState === "error"
            ? "Gagal menyimpan"
            : "Open Bill baru";
  const itemGrid = "grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4";

  return (
    <main className="min-h-dvh overflow-x-hidden bg-[radial-gradient(circle_at_top_left,_#dbeafe_0,_transparent_28rem),linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)] text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200/90 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[96rem] items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/"
              aria-label="Kembali ke dashboard"
              className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-slate-200 bg-white"
            >
              <Icon name="back" />
            </Link>
            <div>
              <p className="text-xs font-black uppercase tracking-[.2em] text-red-600">
                Honda Workshop
              </p>
              <h1 className="text-xl font-black sm:text-2xl">Point of Sale</h1>
            </div>
          </div>
          <Link
            href="/service/reception"
            className="hidden min-h-11 items-center rounded-xl border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-800 sm:inline-flex"
          >
            Terima motor service
          </Link>
        </div>
      </header>
      <div className="mx-auto grid max-w-[96rem] gap-5 px-4 py-5 pb-32 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)] lg:px-8 lg:pb-8 xl:grid-cols-[minmax(0,1.45fr)_minmax(380px,.55fr)]">
        <section className="min-w-0">
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[.18em] text-blue-700">
                  Katalog aktif
                </p>
                <h2 className="mt-1 text-2xl font-black">
                  Sparepart & layanan
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Layanan tampil lebih dulu untuk transaksi cepat.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-black text-white"
              >
                <Icon name="scan" />
                Scan kamera
              </button>
            </div>
            <form
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                if (query.trim()) void loadProducts(query, true);
              }}
              className="mt-4 flex gap-2"
            >
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">Cari produk</span>
                <span className="pointer-events-none absolute inset-y-0 left-4 grid place-items-center text-slate-400">
                  <Icon name="search" />
                </span>
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Scan atau cari kode / nama produk"
                  className="min-h-12 w-full rounded-2xl border border-slate-300 pl-12 pr-4 text-base font-semibold outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-100"
                />
              </label>
              <button className="min-h-12 rounded-2xl bg-blue-700 px-5 text-sm font-black text-white">
                Cari
              </button>
            </form>
            <label className="mt-3 block text-sm font-bold text-slate-700">
              Register dan gudang
              <select
                value={registerId}
                onChange={(event) => {
                  setRegisterId(event.target.value);
                  setCart([]);
                  setOpenBillId(null);
                }}
                className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3"
              >
                <option value="">Pilih register aktif</option>
                {registers.map((register) => (
                  <option key={register.id} value={register.id}>
                    {register.name} · {register.warehouseName}
                  </option>
                ))}
              </select>
            </label>
            <p
              className="mt-3 text-sm font-semibold text-slate-600"
              role="status"
              aria-live="polite"
            >
              {notice}
            </p>
          </div>
          <section className="mt-4" aria-labelledby="services-title">
            <p className="text-xs font-black uppercase tracking-[.18em] text-red-600">
              Jasa bengkel
            </p>
            <h2 id="services-title" className="mb-3 mt-1 text-xl font-black">
              Layanan cepat
            </h2>
            {servicesLoading ? (
              <div className={itemGrid}>
                {Array.from({ length: 4 }, (_, index) => (
                  <div
                    key={index}
                    className="aspect-square animate-pulse rounded-2xl bg-slate-200"
                  />
                ))}
              </div>
            ) : services.length ? (
              <div className={itemGrid}>
                {services.map((service) => (
                  <ItemCard
                    key={service.id}
                    item={service}
                    code={service.code}
                    price={catalogPrice(service, "service")}
                    accent="red"
                    onAdd={() => addItem(service, "service")}
                  />
                ))}
              </div>
            ) : (
              <Empty text="Belum ada layanan aktif." />
            )}
          </section>
          <section className="mt-6" aria-labelledby="parts-title">
            <p className="text-xs font-black uppercase tracking-[.18em] text-blue-700">
              Inventori
            </p>
            <h2 id="parts-title" className="mb-3 mt-1 text-xl font-black">
              Sparepart
            </h2>
            {loading ? (
              <div className={itemGrid}>
                {Array.from({ length: 8 }, (_, index) => (
                  <div
                    key={index}
                    className="aspect-square animate-pulse rounded-2xl bg-slate-200"
                  />
                ))}
              </div>
            ) : error ? (
              <Empty text={error} action={() => void loadProducts(query)} />
            ) : products.length ? (
              <div className={itemGrid}>
                {products.map((product) => (
                  <ItemCard
                    key={product.id}
                    item={product}
                    code={product.partCode}
                    price={product.het}
                    stock={productStock(product)}
                    disabled={(productStock(product) ?? 1) <= 0}
                    accent="blue"
                    onAdd={() => addItem(product, "product")}
                  />
                ))}
              </div>
            ) : (
              <Empty
                text="Produk tidak ditemukan."
                action={() => setQuery("")}
              />
            )}
          </section>
        </section>
        <aside className="lg:sticky lg:top-[85px] lg:h-[calc(100dvh-105px)]">
          <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
            <div className="bg-slate-950 px-5 py-4 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[.18em] text-red-400">
                    Transaksi aktif
                  </p>
                  <h2 className="mt-1 flex items-center gap-2 text-xl font-black">
                    <Icon name="cart" />
                    Keranjang
                  </h2>
                </div>
                <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-bold">
                  {itemCount} item
                </span>
              </div>
            </div>
            <div className="border-b p-4">
              <div className="flex justify-between gap-3">
                <span className="text-xs font-black uppercase text-slate-500">
                  Pelanggan opsional
                </span>
                <Link
                  href="/service/reception"
                  className="text-xs font-black text-blue-700"
                >
                  Tambah pelanggan / motor
                </Link>
              </div>
              <select
                aria-label="Pelanggan retail opsional"
                value={customerId}
                onChange={(event) => void selectCustomer(event.target.value)}
                className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3"
              >
                <option value="">Pelanggan umum</option>
                {customerOptions}
              </select>
              <p
                className={`mt-2 flex items-center gap-1.5 text-xs font-bold ${saveState === "error" ? "text-red-700" : "text-slate-600"}`}
                role="status"
                aria-live="polite"
              >
                <Icon name="save" />
                {saveLabel}
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
              {cart.length ? (
                <ul className="space-y-3">
                  {cart.map((item) => (
                    <CartRow
                      key={cartKey(item)}
                      item={item}
                      onQuantity={(quantity) =>
                        updateQuantity(cartKey(item), quantity)
                      }
                    />
                  ))}
                </ul>
              ) : (
                <Empty text="Keranjang masih kosong. Pilih layanan atau sparepart." />
              )}
            </div>
            <div className="border-t bg-slate-50 p-4">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs font-bold uppercase text-slate-500">
                    Total
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {itemCount} item
                  </p>
                </div>
                <p className="text-2xl font-black tabular-nums">
                  {money.format(subtotal)}
                </p>
              </div>
              <button
                type="button"
                disabled={!cart.length}
                onClick={() => setPaymentOpen(true)}
                className="mt-4 min-h-12 w-full rounded-2xl bg-red-600 px-5 font-black text-white disabled:bg-slate-300 disabled:text-slate-600"
              >
                Bayar sekarang
              </button>
            </div>
          </div>
        </aside>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-white/95 p-3 backdrop-blur lg:hidden">
        <button
          type="button"
          disabled={!cart.length}
          onClick={() => setPaymentOpen(true)}
          className="flex min-h-12 w-full items-center justify-between rounded-2xl bg-red-600 px-5 font-black text-white disabled:bg-slate-300 disabled:text-slate-600"
        >
          <span>{itemCount} item</span>
          <span>Bayar {money.format(subtotal)}</span>
        </button>
      </div>
      {scannerOpen && (
        <BarcodeScannerDialog
          title="Scan produk POS"
          description="Scan barcode produk. Produk yang cocok langsung masuk keranjang."
          onClose={() => setScannerOpen(false)}
          onDetected={(value) => {
            setQuery(value);
            void loadProducts(value, true);
          }}
        />
      )}
      {paymentOpen && (
        <PaymentDialog
          total={subtotal}
          busy={checkingOut}
          error={checkoutError}
          onClose={() => {
            if (!checkingOut) setPaymentOpen(false);
          }}
          onConfirm={checkout}
        />
      )}
      {receipt && receiptPayment && (
        <ReceiptDialog
          receipt={receipt}
          fallbackItems={receiptItems}
          fallbackPayment={receiptPayment}
          onClose={() => {
            setReceipt(null);
            setReceiptItems([]);
            setReceiptPayment(null);
          }}
        />
      )}
    </main>
  );
}

function ItemCard({
  item,
  code,
  price,
  stock,
  accent,
  disabled,
  onAdd,
}: {
  item: Product | PosService;
  code: string;
  price: number;
  stock?: number;
  accent: "red" | "blue";
  disabled?: boolean;
  onAdd: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onAdd}
      className={`group flex aspect-square min-w-0 flex-col overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transform-none ${accent === "red" ? "border-red-100 focus-visible:outline-red-700" : "border-slate-200 focus-visible:outline-blue-700"}`}
    >
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <ItemImage item={item} />
        <span className="absolute left-2 top-2 rounded-md bg-white/95 px-2 py-1 font-mono text-[10px] font-bold text-slate-800 shadow-sm">
          {code}
        </span>
        {stock !== undefined && (
          <span className="absolute right-2 top-2 rounded-md bg-slate-950/85 px-2 py-1 text-[10px] font-bold text-white">
            Stok {stock}
          </span>
        )}
      </div>
      <div className="w-full p-3">
        <p className="line-clamp-2 text-sm font-black leading-5">{item.name}</p>
        <div className="mt-2 flex items-end justify-between gap-2">
          <p className="text-sm font-black tabular-nums text-red-600">
            {money.format(price)}
          </p>
          <span
            className={`text-xs font-bold ${accent === "red" ? "text-red-700" : "text-blue-700"}`}
          >
            {disabled ? "Habis" : "Tambah +"}
          </span>
        </div>
      </div>
    </button>
  );
}

function CartRow({
  item,
  onQuantity,
}: {
  item: CartItem;
  onQuantity: (quantity: number) => void;
}) {
  const code = "code" in item ? item.code : item.partCode;
  return (
    <li className="rounded-2xl border border-slate-200 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-black">{item.name}</p>
          <p className="mt-0.5 font-mono text-xs font-bold text-slate-500">
            {item.itemType === "service" ? "JASA · " : ""}
            {code}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onQuantity(0)}
          aria-label={`Hapus ${item.name}`}
          className="grid min-h-11 min-w-11 place-items-center rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-700"
        >
          <Icon name="trash" />
        </button>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex items-center rounded-xl border">
          <button
            type="button"
            onClick={() => onQuantity(item.cartQuantity - 1)}
            aria-label={`Kurangi ${item.name}`}
            className="grid min-h-11 min-w-11 place-items-center"
          >
            <Icon name="minus" />
          </button>
          <input
            aria-label={`Jumlah ${item.name}`}
            type="number"
            min="1"
            value={item.cartQuantity}
            onChange={(event) => onQuantity(Number(event.target.value))}
            className="h-11 w-12 border-x text-center font-black outline-none"
          />
          <button
            type="button"
            onClick={() => onQuantity(item.cartQuantity + 1)}
            aria-label={`Tambah ${item.name}`}
            className="grid min-h-11 min-w-11 place-items-center"
          >
            <Icon name="plus" />
          </button>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500">
            {money.format(item.unitPrice)} / {item.unit}
          </p>
          <p className="font-black tabular-nums">
            {money.format(item.unitPrice * item.cartQuantity)}
          </p>
        </div>
      </div>
    </li>
  );
}

function Empty({ text, action }: { text: string; action?: () => void }) {
  return (
    <div className="grid min-h-40 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-center">
      <div>
        <p className="text-sm font-semibold text-slate-600">{text}</p>
        {action && (
          <button
            type="button"
            onClick={action}
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-bold"
          >
            <Icon name="refresh" />
            Coba lagi
          </button>
        )}
      </div>
    </div>
  );
}
