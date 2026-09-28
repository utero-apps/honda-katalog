"use client";

import Link from "next/link";
import Image from "next/image";
import { BarcodeScannerDialog } from "@/components/CatalogTools";
import { ServiceOrderContextPanels } from "@/components/service-orders/ServiceOrderContextPanels";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type {
  ApiEnvelope,
  ServiceOrderWorkflow,
  WorkflowItem,
} from "./service-order-types";

const money = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
const date = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
});
const stages = [
  "open",
  "diagnosed",
  "in_progress",
  "quality_check",
  "invoiced",
  "paid",
  "handed_over",
];
const stageByStatus: Record<string, number> = {
  open: 0,
  assigned: 1,
  diagnosed: 1,
  in_progress: 2,
  waiting_parts: 2,
  quality_check: 3,
  completed: 6,
  invoiced: 4,
  paid: 5,
  handed_over: 6,
};
const labels: Record<string, string> = {
  open: "Diterima",
  diagnosed: "Diagnosis",
  in_progress: "Pengerjaan",
  waiting_parts: "Menunggu part",
  quality_check: "Quality Control",
  completed: "Selesai",
  invoiced: "Invoice",
  paid: "Lunas",
  handed_over: "Diserahkan",
};

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
  return body?.data as T;
}
const number = (value?: number | string | null) => Number(value ?? 0);
const dateTime = (value?: string | null) =>
  value ? date.format(new Date(value)) : "";
type CatalogItem = {
  id: string;
  code: string;
  name: string;
  price: number;
};
type CatalogProduct = {
  id: string;
  partCode: string;
  name: string;
  het: number;
  barcodes: string[];
};
type CatalogService = {
  id: string;
  code: string;
  name: string;
  fixedPrice: number;
};

export function ServiceOrderDetailWorkspace({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<ServiceOrderWorkflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setOrder(
        await request<ServiceOrderWorkflow>(
          `/api/v1/operations/service-orders/${orderId}/workflow`,
        ),
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Detail Service Order belum dapat dimuat",
      );
    } finally {
      setLoading(false);
    }
  }, [orderId]);
  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);
  const mutate = useCallback(
    async (action: string, payload: Record<string, unknown>) => {
      setBusy(action);
      setMessage("");
      try {
        const data = await request<ServiceOrderWorkflow>(
          `/api/v1/operations/service-orders/${orderId}/workflow`,
          { method: "POST", body: JSON.stringify({ action, ...payload }) },
        );
        setOrder(data);
        setMessage("Perubahan berhasil disimpan.");
      } catch (reason) {
        setMessage(
          reason instanceof Error
            ? reason.message
            : "Perubahan belum dapat disimpan",
        );
      } finally {
        setBusy("");
      }
    },
    [orderId],
  );
  const totals = useMemo(
    () => ({
      jobs: (order?.jobs ?? []).reduce(
        (sum, item) =>
          sum +
          number(item.subtotal ?? number(item.price) * number(item.quantity)),
        0,
      ),
      parts: (order?.parts ?? []).reduce(
        (sum, item) =>
          sum +
          number(item.subtotal ?? number(item.price) * number(item.quantity)),
        0,
      ),
    }),
    [order],
  );
  if (loading)
    return (
      <PageShell>
        <div className="grid min-h-[60dvh] place-items-center">
          <p className="font-bold text-slate-600">
            Memuat workflow Service Order…
          </p>
        </div>
      </PageShell>
    );
  if (error || !order)
    return (
      <PageShell>
        <div
          role="alert"
          className="mx-auto mt-10 max-w-xl rounded-2xl border border-red-200 bg-red-50 p-6 text-center"
        >
          <p className="font-black text-red-900">Detail belum dapat dibuka</p>
          <p className="mt-2 text-sm text-red-700">{error}</p>
          <button
            onClick={() => void load()}
            className="mt-4 min-h-11 rounded-xl bg-red-700 px-4 font-bold text-white"
          >
            Coba lagi
          </button>
        </div>
      </PageShell>
    );
  const customerName =
    order.customerName ?? order.customer?.name ?? "Pelanggan";
  const plate = order.plateNumber ?? order.vehicle?.plateNumber ?? "-";
  const model = order.model ?? order.vehicle?.model ?? "Model belum dicatat";
  const diagnosisText =
    order.diagnosis?.findings ?? order.diagnosis?.notes ?? "";
  const diagnosisLines = diagnosisText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const hasDiagnosis = Boolean(
    order.diagnosis?.findings || order.diagnosis?.notes,
  );
  const approved = Boolean(order.estimate?.approvedAt);
  return (
    <PageShell>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-[96rem] px-4 py-5 sm:px-6 lg:px-8">
          <Link
            href="/business/service-orders"
            className="text-sm font-bold text-blue-700"
          >
            ← Daftar Service Order
          </Link>
          <div className="mt-3 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <p className="font-mono text-sm font-bold text-blue-800">
                {order.orderNumber}
              </p>
              <h1 className="mt-1 text-3xl font-black tracking-tight">
                {plate} · {model}
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                {customerName}
                {order.customerPhone ? ` · ${order.customerPhone}` : ""}
              </p>
            </div>
            <StatusBadge status={order.status} />
          </div>
        </div>
      </header>
      <main className="mx-auto grid max-w-[96rem] gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:px-8">
        <div className="min-w-0 space-y-5">
          <section
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
            aria-labelledby="progress-title"
          >
            <h2 id="progress-title" className="text-lg font-black">
              Progress pekerjaan
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
              {stages.map((stage, index) => {
                const current = stageByStatus[order.status] ?? 0;
                const done = index <= current;
                return (
                  <div
                    key={stage}
                    className={`rounded-xl border p-3 ${done ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-slate-50"}`}
                  >
                    <span
                      className={`grid size-7 place-items-center rounded-full text-xs font-black ${done ? "bg-blue-700 text-white" : "bg-slate-200 text-slate-600"}`}
                    >
                      {index + 1}
                    </span>
                    <p className="mt-2 text-xs font-bold">{labels[stage]}</p>
                  </div>
                );
              })}
            </div>
            {["open", "assigned"].includes(order.status) && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-black text-amber-950">
                  Langkah berikutnya
                </p>
                <p className="mt-1 text-sm leading-6 text-amber-900">
                  {!order.assignedMechanicId
                    ? "Pilih mekanik terlebih dahulu."
                    : !hasDiagnosis
                      ? "Simpan diagnosis teknisi terlebih dahulu."
                      : !approved
                        ? "Setujui diagnosis dan estimasi pekerjaan."
                        : "Mulai pengerjaan agar sparepart dapat ditambahkan."}
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  {!approved && (
                    <button
                      type="button"
                      disabled={
                        !order.assignedMechanicId ||
                        !hasDiagnosis ||
                        busy === "approve"
                      }
                      onClick={() =>
                        void mutate("approve", {
                          notes: "Diagnosis dan estimasi disetujui",
                        })
                      }
                      className="min-h-11 rounded-xl bg-amber-600 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busy === "approve"
                        ? "Menyetujui…"
                        : "Setujui pekerjaan"}
                    </button>
                  )}
                  {approved && order.status === "assigned" && (
                    <button
                      type="button"
                      disabled={busy === "start"}
                      onClick={() => void mutate("start", {})}
                      className="min-h-11 rounded-xl bg-blue-700 px-4 text-sm font-bold text-white disabled:opacity-50"
                    >
                      {busy === "start"
                        ? "Memulai…"
                        : "Mulai pengerjaan"}
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>
          <div className="grid gap-5 xl:grid-cols-2">
            <InfoCard title="Pelanggan & kendaraan">
              {order.vehicle?.imageUrl && (
                <Image
                  loader={({ src }) => src}
                  unoptimized
                  src={order.vehicle.imageUrl}
                  alt={`Foto kendaraan ${plate}`}
                  width={960}
                  height={540}
                  className="mb-4 aspect-video w-full rounded-xl border border-slate-200 object-cover"
                />
              )}
              <Data label="Pelanggan" value={customerName} />
              <Data
                label="Telepon"
                value={order.customerPhone ?? order.customer?.phone ?? "-"}
              />
              <Data label="Kendaraan" value={`${plate} · ${model}`} />
              <Data
                label="Odometer"
                value={
                  (order.odometer ?? order.vehicle?.odometer)
                    ? `${Number(order.odometer ?? order.vehicle?.odometer).toLocaleString("id-ID")} km`
                    : "-"
                }
              />
            </InfoCard>
            <InfoCard title="Keluhan & diagnosis">
              <p className="text-sm leading-6 text-slate-700">
                {order.complaint || "Keluhan belum dicatat."}
              </p>
              <div className="mt-4 border-t border-slate-100 pt-4">
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                  Diagnosis
                </p>
                {diagnosisLines.length ? (
                  <ul className="mt-2 space-y-1 text-sm leading-6 text-slate-700">
                    {diagnosisLines.map((line, index) => (
                      <li key={`${index}-${line}`} className="flex gap-2">
                        <span aria-hidden="true">-</span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    Belum ada hasil diagnosis.
                  </p>
                )}
              </div>
              <DiagnosisForm
                busy={busy === "diagnosis"}
                onSubmit={(payload) => void mutate("diagnosis", payload)}
              />
            </InfoCard>
          </div>
          <ServiceOrderContextPanels orderId={order.id} vehicleId={order.vehicle?.id} />
          <div className="grid gap-5 xl:grid-cols-2">
            <LineItems
              title="Pekerjaan / jasa"
              items={order.jobs ?? []}
              empty="Belum ada pekerjaan."
              total={totals.jobs}
              itemAction={
                order.status === "in_progress"
                  ? {
                      label: "Selesaikan pekerjaan",
                      isAvailable: (item) => item.status !== "completed",
                      onClick: (item) =>
                        item.id && void mutate("complete_job", { jobId: item.id }),
                    }
                  : undefined
              }
            >
              <QuickLineForm
                kind="job"
                busy={busy === "add_job"}
                onSubmit={(payload) => void mutate("add_job", payload)}
              />
            </LineItems>
            <LineItems
              title="Sparepart"
              items={order.parts ?? []}
              empty="Belum ada sparepart."
              total={totals.parts}
              itemAction={
                order.status === "in_progress"
                  ? {
                      label: "Gunakan sparepart",
                      isAvailable: (item) => !item.consumedAt,
                      onClick: (item) =>
                        item.id &&
                        void mutate("consume_part", {
                          partId: item.id,
                          idempotencyKey: crypto.randomUUID(),
                        }),
                    }
                  : undefined
              }
            >
              <QuickLineForm
                kind="part"
                busy={busy === "add_part"}
                disabled={order.status !== "in_progress"}
                disabledMessage="Sparepart dapat ditambahkan setelah tombol Mulai pengerjaan ditekan."
                onSubmit={(payload) => void mutate("add_part", payload)}
              />
            </LineItems>
          </div>
          <InfoCard title="Timeline">
            <ol className="relative ml-3 border-l border-slate-200 pl-6">
              {(order.timeline ?? []).length ? (
                order.timeline?.map((item, index) => (
                  <li key={item.id ?? index} className="pb-5 last:pb-0">
                    <span className="absolute -left-2 mt-1.5 size-4 rounded-full border-4 border-white bg-blue-700" />
                    <p className="font-bold">
                      {item.label ?? labels[item.status ?? ""] ?? item.status}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {dateTime(item.occurredAt ?? item.createdAt)}
                      {item.actorName ? ` · ${item.actorName}` : ""}
                    </p>
                    {item.notes && (
                      <p className="mt-1 text-sm text-slate-600">
                        {item.notes}
                      </p>
                    )}
                  </li>
                ))
              ) : (
                <li className="text-sm text-slate-600">
                  Timeline belum tersedia.
                </li>
              )}
            </ol>
          </InfoCard>
        </div>
        <aside className="space-y-5 lg:sticky lg:top-5 lg:self-start">
          <InfoCard title="Mekanik">
            <p className="text-sm font-bold text-slate-900">
              {order.assignedMechanicName ?? "Belum ditugaskan"}
            </p>
            <AssignMechanic
              mechanics={order.mechanics ?? []}
              value={order.assignedMechanicId ?? ""}
              busy={busy === "assign"}
              onSubmit={(mechanicId) => void mutate("assign", { mechanicId })}
            />
          </InfoCard>
          <InfoCard title="Estimasi">
            <Data
              label="Jasa"
              value={money.format(number(order.estimate?.labor ?? totals.jobs))}
            />
            <Data
              label="Sparepart"
              value={money.format(
                number(order.estimate?.parts ?? totals.parts),
              )}
            />
            <div className="mt-3 flex justify-between border-t pt-3">
              <span className="font-bold">Total</span>
              <strong className="text-xl">
                {money.format(
                  number(order.estimate?.total ?? totals.jobs + totals.parts),
                )}
              </strong>
            </div>
          </InfoCard>
          <QualityControl
            value={order.qualityControl}
            busy={busy === "quality_check"}
            onSubmit={(payload) => void mutate("quality_check", payload)}
          />
          <InvoiceCard
            orderId={orderId}
            invoice={order.invoice}
            onCreated={load}
          />
          <Handover
            value={order.handover}
            busy={busy === "handover"}
            onSubmit={(payload) => void mutate("handover", payload)}
          />
          {message && (
            <p
              role="status"
              className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-bold text-blue-900"
            >
              {message}
            </p>
          )}
        </aside>
      </main>
    </PageShell>
  );
}

function PageShell({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-slate-50 text-slate-950">{children}</div>;
}
function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="mb-4 text-lg font-black">{title}</h2>
      {children}
    </section>
  );
}
function Data({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-2 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <strong className="text-right text-sm">{value}</strong>
    </div>
  );
}
function StatusBadge({ status }: { status: string }) {
  return (
    <span className="inline-flex w-fit rounded-full bg-blue-100 px-3 py-1.5 text-sm font-black text-blue-800">
      {labels[status] ?? status}
    </span>
  );
}

function DiagnosisForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (payload: Record<string, unknown>) => void;
}) {
  return (
    <form
      className="mt-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        onSubmit({ diagnosis: form.get("findings") });
      }}
    >
      <label className="text-xs font-black uppercase text-slate-500">
        Perbarui diagnosis
        <textarea
          name="findings"
          required
          minLength={3}
          className="mt-2 min-h-24 w-full rounded-xl border border-slate-300 p-3 text-sm font-medium normal-case text-slate-900"
          placeholder={"Tulis satu temuan setiap baris, misalnya:\nBusi kotor\nOli hampir habis"}
        />
      </label>
      <button
        disabled={busy}
        className="mt-2 min-h-11 w-full rounded-xl bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-50"
      >
        {busy ? "Menyimpan…" : "Simpan diagnosis"}
      </button>
    </form>
  );
}
function AssignMechanic({
  mechanics,
  value,
  busy,
  onSubmit,
}: {
  mechanics: Array<{ id: string; name: string }>;
  value: string;
  busy: boolean;
  onSubmit: (id: string) => void;
}) {
  const [selected, setSelected] = useState(value);
  return (
    <div className="mt-3">
      <select
        aria-label="Pilih mekanik"
        value={selected}
        onChange={(event) => setSelected(event.target.value)}
        className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3"
      >
        <option value="">Pilih mekanik</option>
        {mechanics.map((mechanic) => (
          <option key={mechanic.id} value={mechanic.id}>
            {mechanic.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!selected || busy}
        onClick={() => onSubmit(selected)}
        className="mt-2 min-h-11 w-full rounded-xl bg-blue-700 px-4 text-sm font-bold text-white disabled:opacity-50"
      >
        {busy ? "Menugaskan…" : "Assign mekanik"}
      </button>
    </div>
  );
}
function LineItems({
  title,
  items,
  empty,
  total,
  itemAction,
  children,
}: {
  title: string;
  items: WorkflowItem[];
  empty: string;
  total: number;
  itemAction?: {
    label: string;
    isAvailable: (item: WorkflowItem) => boolean;
    onClick: (item: WorkflowItem) => void;
  };
  children: ReactNode;
}) {
  return (
    <InfoCard title={title}>
      {items.length ? (
        <ul className="divide-y divide-slate-100">
          {items.map((item, index) => (
            <li
              key={item.id ?? index}
              className="flex justify-between gap-4 py-3"
            >
              <div>
                <p className="font-bold">{item.name}</p>
                <p className="text-xs text-slate-500">
                  {number(item.quantity)} {item.unit ?? "unit"} ×{" "}
                  {money.format(number(item.price))}
                </p>
                {itemAction?.isAvailable(item) && (
                  <button
                    type="button"
                    onClick={() => itemAction.onClick(item)}
                    className="mt-2 min-h-9 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-800"
                  >
                    {itemAction.label}
                  </button>
                )}
              </div>
              <strong className="text-sm">
                {money.format(
                  number(
                    item.subtotal ?? number(item.quantity) * number(item.price),
                  ),
                )}
              </strong>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">{empty}</p>
      )}
      <div className="mt-3 flex justify-between border-t pt-3">
        <span className="text-sm font-bold">Subtotal</span>
        <strong>{money.format(total)}</strong>
      </div>
      {children}
    </InfoCard>
  );
}
function QuickLineForm({
  kind,
  busy,
  disabled = false,
  disabledMessage,
  onSubmit,
}: {
  kind: "job" | "part";
  busy: boolean;
  disabled?: boolean;
  disabledMessage?: string;
  onSubmit: (payload: Record<string, unknown>) => void;
}) {
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [catalogError, setCatalogError] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const catalog =
      kind === "job"
        ? request<CatalogService[]>("/api/v1/operations/service-catalog").then(
            (services) =>
              services.map((service) => ({
                id: service.id,
                code: service.code,
                name: service.name,
                price: service.fixedPrice,
              })),
          )
        : request<CatalogProduct[]>(
            "/api/v1/catalog/products?status=active&pageSize=100",
          ).then((products) =>
            products.map((product) => ({
              id: product.id,
              code: product.partCode,
              name: product.name,
              price: product.het,
            })),
          );
    void catalog
      .then((items) => {
        if (active) setCatalogItems(items);
      })
      .catch(() => {
        if (active) setCatalogError("Katalog belum dapat dimuat.");
      });
    return () => {
      active = false;
    };
  }, [kind]);

  function selectCatalogItem(item: CatalogItem) {
    setSelectedProductId(item.id);
    setName(item.name);
    setPrice(String(item.price));
  }

  function selectCatalogProduct(productId: string) {
    const product = catalogItems.find((item) => item.id === productId);
    if (product) selectCatalogItem(product);
  }

  async function selectSparepartByBarcode(barcode: string) {
    setCatalogError("");
    try {
      const products = await request<CatalogProduct[]>(
        `/api/v1/catalog/products?status=active&pageSize=100&query=${encodeURIComponent(barcode)}`,
      );
      const product = products.find(
        (item) => item.partCode === barcode || item.barcodes.includes(barcode),
      );
      if (!product)
        throw new Error("Sparepart dengan barcode tersebut tidak ditemukan.");
      selectCatalogItem({
        id: product.id,
        code: product.partCode,
        name: product.name,
        price: product.het,
      });
    } catch (reason) {
      setCatalogError(
        reason instanceof Error
          ? reason.message
          : "Barcode sparepart belum dapat diproses.",
      );
    }
  }

  return (
    <>
      <form
      className="mt-4 grid gap-2"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (disabled) return;
        const form = new FormData(event.currentTarget);
        onSubmit({
          name,
          productId: kind === "part" ? selectedProductId || undefined : undefined,
          quantity: Number(form.get("quantity")),
          price: Number(price),
        });
        event.currentTarget.reset();
        setSelectedProductId("");
        setName("");
        setPrice("");
      }}
    >
      {disabled && disabledMessage && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
          {disabledMessage}
        </p>
      )}
      <label className="grid gap-1 text-sm font-bold text-slate-700">
        Ambil dari katalog {kind === "job" ? "jasa" : "sparepart"}
        <select
            aria-label={`Pilih katalog ${
              kind === "job" ? "jasa" : "sparepart"
            }`}
            value={selectedProductId}
            disabled={disabled}
            onChange={(event) => selectCatalogProduct(event.target.value)}
            className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 font-normal"
          >
            <option value="">Pilih {kind === "job" ? "jasa" : "sparepart"} (opsional)</option>
            {catalogItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code} · {item.name} · {money.format(item.price)}
              </option>
            ))}
          </select>
          {catalogError && (
            <span className="text-xs font-medium text-slate-500">
              {catalogError} Input manual tetap tersedia.
            </span>
          )}
      </label>
      {kind === "part" && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setScannerOpen(true)}
          className="min-h-11 rounded-xl border border-violet-300 bg-violet-50 px-3 text-sm font-bold text-violet-800"
        >
          Scan kode sparepart
        </button>
      )}
      <input
        name="name"
        required
        disabled={disabled}
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder={
          kind === "job" ? "Nama pekerjaan" : "Kode / nama sparepart"
        }
        className="min-h-11 rounded-xl border border-slate-300 px-3"
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          name="quantity"
          type="number"
          min="0.001"
          step="0.001"
          defaultValue="1"
          required
          disabled={disabled}
          aria-label="Jumlah"
          className="min-h-11 rounded-xl border border-slate-300 px-3"
        />
        <input
          name="price"
          type="number"
          min="0"
          required
          disabled={disabled}
          placeholder="Harga"
          aria-label="Harga"
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          className="min-h-11 rounded-xl border border-slate-300 px-3"
        />
      </div>
      <button
        disabled={busy || disabled}
        className="min-h-11 rounded-xl border border-blue-300 bg-blue-50 text-sm font-bold text-blue-800 disabled:opacity-50"
      >
        {busy
          ? "Menambahkan…"
          : `Tambah ${kind === "job" ? "pekerjaan" : "sparepart"}`}
      </button>
      </form>
      {scannerOpen && (
        <BarcodeScannerDialog
          title="Scan barcode sparepart"
          description="Arahkan kamera ke barcode sparepart. Hasil scan mengisi produk dan harga otomatis."
          onClose={() => setScannerOpen(false)}
          onDetected={(barcode) => void selectSparepartByBarcode(barcode)}
        />
      )}
    </>
  );
}
function QualityControl({
  value,
  busy,
  onSubmit,
}: {
  value: ServiceOrderWorkflow["qualityControl"];
  busy: boolean;
  onSubmit: (payload: Record<string, unknown>) => void;
}) {
  return (
    <InfoCard title="Quality Control">
      <StatusBadge status={value?.status ?? "pending"} />
      <p className="mt-3 text-sm text-slate-600">
        {value?.notes ?? "Pemeriksaan akhir belum dilakukan."}
      </p>
      <form
        className="mt-3"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          onSubmit({
            passed: form.get("status") === "passed",
            notes: form.get("notes") || null,
          });
        }}
      >
        <select
          name="status"
          defaultValue={value?.status ?? "passed"}
          className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3"
        >
          <option value="passed">Lulus QC</option>
          <option value="rework">Perlu perbaikan</option>
        </select>
        <textarea
          name="notes"
          placeholder="Catatan QC"
          className="mt-2 min-h-20 w-full rounded-xl border border-slate-300 p-3 text-sm"
        />
        <button
          disabled={busy}
          className="mt-2 min-h-11 w-full rounded-xl bg-violet-700 px-4 text-sm font-bold text-white disabled:opacity-50"
        >
          Simpan QC
        </button>
      </form>
    </InfoCard>
  );
}
function InvoiceCard({
  orderId,
  invoice,
  onCreated,
}: {
  orderId: string;
  invoice: ServiceOrderWorkflow["invoice"];
  onCreated: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      await request(`/api/v1/operations/service-orders/${orderId}/invoice`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await onCreated();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Invoice belum dapat diproses",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <InfoCard title="Invoice & pembayaran">
      {invoice ? (
        <>
          <Data label="Nomor" value={invoice.invoiceNumber ?? "-"} />
          <Data label="Total" value={money.format(number(invoice.total))} />
          <Data
            label="Terbayar"
            value={money.format(number(invoice.paidAmount))}
          />
          <Data
            label="Sisa"
            value={money.format(number(invoice.outstandingAmount))}
          />
          <form
            className="mt-3 grid gap-2 border-t border-slate-100 pt-3"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void submit({
                action: "record_payment",
                method: form.get("method"),
                amount: Number(form.get("amount")),
                reference: String(form.get("reference") || "") || null,
                idempotencyKey: crypto.randomUUID(),
              });
            }}
          >
            <select
              name="method"
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-3"
            >
              <option value="cash">Tunai</option>
              <option value="transfer">Transfer</option>
              <option value="card">Kartu</option>
              <option value="qris">QRIS</option>
              <option value="other">Lainnya</option>
            </select>
            <input
              name="amount"
              type="number"
              min="1"
              required
              placeholder="Jumlah pembayaran"
              className="min-h-11 rounded-xl border border-slate-300 px-3"
            />
            <input
              name="reference"
              maxLength={200}
              placeholder="Nomor referensi (opsional)"
              className="min-h-11 rounded-xl border border-slate-300 px-3"
            />
            <button
              disabled={busy}
              className="min-h-11 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white disabled:opacity-50"
            >
              {busy ? "Mencatat…" : "Catat pembayaran"}
            </button>
          </form>
        </>
      ) : (
        <button
          disabled={busy}
          onClick={() => void submit({ action: "create", discount: 0, tax: 0 })}
          className="min-h-11 w-full rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white disabled:opacity-50"
        >
          Buat invoice
        </button>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm font-bold text-red-700">
          {error}
        </p>
      )}
    </InfoCard>
  );
}
function Handover({
  value,
  busy,
  onSubmit,
}: {
  value: ServiceOrderWorkflow["handover"];
  busy: boolean;
  onSubmit: (payload: Record<string, unknown>) => void;
}) {
  return (
    <InfoCard title="Serah terima">
      {value?.handedOverAt ? (
        <>
          <Data label="Penerima" value={value.recipientName ?? "-"} />
          <Data
            label="Waktu"
            value={date.format(new Date(value.handedOverAt ?? 0))}
          />
          <p className="mt-2 text-sm text-slate-600">{value.notes}</p>
        </>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            onSubmit({
              recipientName: form.get("recipientName"),
              notes: form.get("notes"),
            });
          }}
        >
          <input
            name="recipientName"
            required
            placeholder="Nama penerima motor"
            className="min-h-11 w-full rounded-xl border border-slate-300 px-3"
          />
          <textarea
            name="notes"
            placeholder="Catatan serah terima"
            className="mt-2 min-h-20 w-full rounded-xl border border-slate-300 p-3 text-sm"
          />
          <button
            disabled={busy}
            className="mt-2 min-h-11 w-full rounded-xl bg-red-600 px-4 text-sm font-bold text-white disabled:opacity-50"
          >
            Konfirmasi motor keluar
          </button>
        </form>
      )}
    </InfoCard>
  );
}
