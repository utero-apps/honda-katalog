"use client";

import Link from "next/link";
import Image from "next/image";
import { BarcodeScannerDialog } from "@/components/CatalogTools";
import { ServiceOrderContextPanels } from "@/components/service-orders/ServiceOrderContextPanels";
import { HandoverAssetsPanel } from "@/components/service-orders/handover";
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
  { key: "received", label: "Motor datang" },
  { key: "customer_vehicle", label: "Pelanggan & kendaraan" },
  { key: "diagnosed", label: "Keluhan & diagnosis" },
  { key: "assigned", label: "Assign mekanik" },
  { key: "started", label: "Pengerjaan servis" },
  { key: "work_done", label: "Sparepart & jasa" },
  { key: "qc_passed", label: "Quality check" },
  { key: "invoiced", label: "Invoice" },
  { key: "paid", label: "Pembayaran" },
  { key: "handed_over", label: "Motor keluar" },
] as const;
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
  const qcPassed = order.qualityControl?.status === "passed";
  const handedOver = Boolean(order.handover?.handedOverAt);
  const paid = Boolean(order.invoice && order.invoice.status !== "reversed" && (order.invoice.status === "paid" || (number(order.invoice.total) > 0 && number(order.invoice.outstandingAmount) <= 0)));
  const invoiced = Boolean(order.invoice && order.invoice.status !== "reversed");
  const workDone = order.repairSummary?.completedWork ?? Boolean((order.jobs?.length || order.parts?.length) && (order.jobs ?? []).every((item) => item.status === "completed") && (order.parts ?? []).every((item) => Boolean(item.consumedAt)));
  const stageDone: Record<(typeof stages)[number]["key"], boolean> = {
    received: true,
    customer_vehicle: Boolean(order.customer?.id && order.vehicle?.id),
    assigned: Boolean(order.assignedMechanicId),
    diagnosed: hasDiagnosis,
    started: approved && (["in_progress", "quality_check", "invoiced", "paid", "completed"].includes(order.status) || Boolean(order.jobs?.length || order.parts?.length)),
    work_done: workDone || qcPassed,
    qc_passed: qcPassed,
    invoiced,
    paid,
    handed_over: handedOver,
  };
  const completedStageCount = stages.filter((stage) => stageDone[stage.key]).length;
  const currentStage = stages.find((stage) => !stageDone[stage.key])?.key;
  const mechanicNames = new Map((order.mechanics ?? []).map((mechanic) => [mechanic.id, mechanic.name]));
  const repairItems = [
    ...(order.jobs ?? []).map((item) => ({ ...item, kind: "Jasa" as const })),
    ...(order.parts ?? []).map((item) => ({ ...item, kind: "Sparepart" as const })),
  ];
  const completedJobs = order.repairSummary?.completedJobs ?? (order.jobs ?? []).filter((item) => item.status === "completed").length;
  const usedParts = order.repairSummary?.partsUsed ?? (order.parts ?? []).filter((item) => Boolean(item.consumedAt)).length;
  const totalJobs = order.repairSummary?.totalJobs ?? order.jobs?.length ?? 0;
  const totalRepair = number(order.repairSummary?.total ?? order.estimate?.total ?? totals.jobs + totals.parts);
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
              <p className="mt-1 text-sm text-slate-600">
                Masuk {dateTime(order.openedAt) || "belum tercatat"}
                {order.targetCompletionAt ? ` · Target ${dateTime(order.targetCompletionAt)}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/business/service-orders/${orderId}/print`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-900 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
              >
                Cetak job card / nota
              </Link>
              <StatusBadge status={order.status} />
            </div>
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
            <p className="mt-1 text-sm text-slate-600" role="status">
              {order.status === "cancelled" ? "Order dibatalkan" : `${completedStageCount} dari ${stages.length} tahap tercatat selesai`}
            </p>
            <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {stages.map((stage, index) => {
                const done = stageDone[stage.key];
                const current = order.status !== "cancelled" && stage.key === currentStage;
                return (
                  <li
                    key={stage.key}
                    aria-current={current ? "step" : undefined}
                    className={`rounded-xl border p-3 ${done ? "border-emerald-200 bg-emerald-50 text-emerald-950" : current ? "border-blue-300 bg-blue-50 text-blue-950" : "border-slate-200 bg-slate-50 text-slate-700"}`}
                  >
                    <span className={`grid size-7 place-items-center rounded-full text-xs font-black ${done ? "bg-emerald-700 text-white" : current ? "bg-blue-700 text-white" : "bg-slate-200 text-slate-700"}`}>
                      {index + 1}
                    </span>
                    <p className="mt-2 text-sm font-bold">{stage.label}</p>
                    <p className="mt-1 text-xs font-semibold">{done ? "Selesai" : current ? "Berikutnya" : "Belum selesai"}</p>
                  </li>
                );
              })}
            </ol>
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
              <Data label="Tahun" value={order.vehicle?.year ?? "Belum dicatat"} />
              <Data label="Alamat" value={order.customerAddress ?? order.customer?.address ?? "Belum dicatat"} />
              <Data label="Tanggal masuk" value={dateTime(order.openedAt) || "Belum dicatat"} />
              <Data label="Target selesai" value={dateTime(order.targetCompletionAt) || "Belum dijadwalkan"} />
              <Data label="Tanggal selesai" value={dateTime(order.completedAt ?? order.handover?.handedOverAt) || "Belum selesai"} />
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
            <InfoCard title="Tambah pekerjaan / jasa">
              <QuickLineForm
                kind="job"
                busy={busy === "add_job"}
                onSubmit={(payload) => void mutate("add_job", payload)}
              />
            </InfoCard>
            <InfoCard title="Tambah sparepart">
              <QuickLineForm
                kind="part"
                busy={busy === "add_part"}
                disabled={order.status !== "in_progress"}
                disabledMessage="Sparepart dapat ditambahkan setelah tombol Mulai pengerjaan ditekan."
                onSubmit={(payload) => void mutate("add_part", payload)}
              />
            </InfoCard>
          </div>
          <InfoCard title="Daftar pekerjaan & sparepart">
            {repairItems.length ? (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[52rem] border-collapse text-left text-sm">
                  <caption className="sr-only">Rincian jenis, deskripsi, mekanik, estimasi biaya, dan status pekerjaan</caption>
                  <thead className="bg-slate-100 text-slate-700">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-bold">Jenis</th>
                      <th scope="col" className="px-4 py-3 font-bold">Deskripsi</th>
                      <th scope="col" className="px-4 py-3 font-bold">Mekanik</th>
                      <th scope="col" className="px-4 py-3 text-right font-bold">Estimasi</th>
                      <th scope="col" className="px-4 py-3 font-bold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {repairItems.map((item, index) => (
                      <tr key={`${item.kind}-${item.id ?? index}`} className="align-top hover:bg-slate-50">
                        <td className="px-4 py-3 font-semibold text-slate-900">{item.kind}</td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-950">{item.name ?? "Tanpa nama"}</p>
                          {item.description && <p className="mt-1 max-w-md whitespace-pre-wrap text-slate-700">{item.description}</p>}
                          <p className="mt-1 text-xs text-slate-600">
                            {item.partCode ? `${item.partCode} · ` : ""}{number(item.quantity ?? 1)} {item.unit ?? (item.kind === "Jasa" ? "jasa" : "unit")}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {item.kind === "Jasa" ? item.mechanicName ?? mechanicNames.get(item.mechanicId ?? "") ?? order.assignedMechanicName ?? "Belum ditugaskan" : "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-slate-950">
                          {money.format(number(item.subtotal ?? number(item.price ?? item.unitPrice) * number(item.quantity ?? 1)))}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${item.kind === "Jasa" ? item.status === "completed" ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-950" : item.consumedAt ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-950"}`}>
                            {item.kind === "Jasa" ? item.status === "completed" ? "Selesai" : "Belum selesai" : item.consumedAt ? "Terpakai" : "Belum dipakai"}
                          </span>
                          {order.status === "in_progress" && item.id && item.kind === "Jasa" && item.status !== "completed" && (
                            <button type="button" onClick={() => void mutate("complete_job", { jobId: item.id })} className="mt-2 block min-h-9 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-800">
                              Selesaikan pekerjaan
                            </button>
                          )}
                          {order.status === "in_progress" && item.id && item.kind === "Sparepart" && !item.consumedAt && (
                            <button type="button" onClick={() => void mutate("consume_part", { partId: item.id, idempotencyKey: crypto.randomUUID() })} className="mt-2 block min-h-9 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-800">
                              Gunakan sparepart
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-700">Pekerjaan dan sparepart belum dicatat.</p>
            )}
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-600">Pekerjaan selesai</p>
                <p className="mt-1 text-lg font-black tabular-nums text-slate-950">{completedJobs} / {totalJobs}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-600">Sparepart terpakai</p>
                <p className="mt-1 text-lg font-black tabular-nums text-slate-950">{usedParts} / {order.parts?.length ?? 0}</p>
              </div>
              <div className="rounded-xl bg-blue-50 p-4">
                <p className="text-sm font-semibold text-blue-900">Estimasi perbaikan</p>
                <p className="mt-1 text-lg font-black tabular-nums text-blue-950">{money.format(totalRepair)}</p>
              </div>
            </div>
          </InfoCard>
          <InfoCard title="Ringkasan perbaikan">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-600">Keluhan pelanggan</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-800">{order.complaint || "Belum dicatat."}</p>
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-600">Hasil diagnosis</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-800">{diagnosisText || "Belum dicatat."}</p>
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-600">Pemeriksaan akhir</p>
                <p className="mt-1 text-sm leading-6 text-slate-800">{order.qualityControl?.notes || (qcPassed ? "QC lulus." : "Menunggu QC.")}</p>
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-600">Serah terima</p>
                <p className="mt-1 text-sm leading-6 text-slate-800">
                  {handedOver ? `${dateTime(order.handover?.handedOverAt)} · ${order.handover?.recipientName ?? "Penerima belum dicatat"}` : "Motor belum diserahkan."}
                </p>
                {order.handover?.notes && <p className="mt-1 text-sm leading-6 text-slate-700">{order.handover.notes}</p>}
              </div>
            </div>
          </InfoCard>
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
              value={money.format(number(order.repairSummary?.labor ?? order.estimate?.labor ?? totals.jobs))}
            />
            <Data
              label="Sparepart"
              value={money.format(
                number(order.repairSummary?.parts ?? order.estimate?.parts ?? totals.parts),
              )}
            />
            <div className="mt-3 flex justify-between border-t pt-3">
              <span className="font-bold">Total</span>
              <strong className="text-xl">
                {money.format(totalRepair)}
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
          <HandoverAssetsPanel
            orderId={orderId}
            defaultRecipientName={order.customer?.name ?? ""}
            onCompleted={load}
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
