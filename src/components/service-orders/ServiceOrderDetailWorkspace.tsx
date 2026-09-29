"use client";

import Link from "next/link";
import Image from "next/image";
import { BarcodeScannerDialog } from "@/components/CatalogTools";
import { ServiceOrderContextPanels } from "@/components/service-orders/ServiceOrderContextPanels";
import { HandoverAssetsPanel } from "@/components/service-orders/handover";
import { CustomerFeedbackPanel } from "@/components/service-orders/CustomerFeedbackPanel";
import { NextActionPanel, type NextActionPanelAction } from "@/components/service-orders/detail/NextActionPanel";
import { ServiceOrderProgress } from "@/components/service-orders/detail/ServiceOrderProgress";
import { RepairItemsList } from "@/components/service-orders/detail/RepairItemsList";
import { isServiceInvoicePaid } from "./service-invoice-state";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
type StageKey = "received" | "customer_vehicle" | "diagnosed" | "assigned" | "started" | "work_done" | "qc_passed" | "invoiced" | "paid" | "handed_over";
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
type DetailTab = "summary" | "work" | "billing" | "history";

export function ServiceOrderDetailWorkspace({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<ServiceOrderWorkflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [activeTab, setActiveTab] = useState<DetailTab>("summary");
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
        return true;
      } catch (reason) {
        setMessage(
          reason instanceof Error
            ? reason.message
            : "Perubahan belum dapat disimpan",
        );
        return false;
      } finally {
        setBusy("");
      }
    },
    [orderId],
  );
  const openSection = useCallback((tab: DetailTab, id: string) => {
    setActiveTab(tab);
    window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }, []);
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
  const paid = isServiceInvoicePaid(order.invoice);
  const invoiced = Boolean(order.invoice && order.invoice.status !== "reversed");
  const workDone = order.repairSummary?.completedWork ?? Boolean((order.jobs?.length || order.parts?.length) && (order.jobs ?? []).every((item) => item.status === "completed") && (order.parts ?? []).every((item) => Boolean(item.consumedAt)));
  const stageDone: Record<StageKey, boolean> = {
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
  const mechanicNames = new Map((order.mechanics ?? []).map((mechanic) => [mechanic.id, mechanic.name]));
  const repairItems = [
    ...(order.jobs ?? []).map((item) => ({ ...item, kind: "Jasa" as const })),
    ...(order.parts ?? []).map((item) => ({ ...item, kind: "Sparepart" as const })),
  ];
  const completedJobs = order.repairSummary?.completedJobs ?? (order.jobs ?? []).filter((item) => item.status === "completed").length;
  const usedParts = order.repairSummary?.partsUsed ?? (order.parts ?? []).filter((item) => Boolean(item.consumedAt)).length;
  const totalJobs = order.repairSummary?.totalJobs ?? order.jobs?.length ?? 0;
  const totalRepair = number(order.repairSummary?.total ?? order.estimate?.total ?? totals.jobs + totals.parts);
  const phases = [
    { key: "reception", label: "Penerimaan", done: stageDone.received && stageDone.customer_vehicle },
    { key: "diagnosis", label: "Diagnosis", done: stageDone.assigned && stageDone.diagnosed && approved },
    { key: "repair", label: "Pengerjaan", done: stageDone.started && stageDone.work_done },
    { key: "quality", label: "Quality Control", done: stageDone.qc_passed },
    { key: "billing", label: "Pembayaran", done: stageDone.invoiced && stageDone.paid },
    { key: "handover", label: "Serah-terima", done: stageDone.handed_over },
  ].map((phase, index, all) => ({ ...phase, current: order.status !== "cancelled" && !phase.done && all.slice(0, index).every((item) => item.done) }));
  const completedPhaseCount = phases.filter((phase) => phase.done).length;
  const incompleteJobs = (order.jobs ?? []).filter((item) => item.status !== "completed").length;
  const unusedParts = (order.parts ?? []).filter((item) => !item.consumedAt).length;
  let nextAction: { title: string; description: string; blockers: string[]; completedChecks: string[]; action?: NextActionPanelAction };
  if (order.status === "cancelled" || handedOver) {
    nextAction = {
      title: handedOver ? "Service Order selesai" : "Service Order dibatalkan",
      description: handedOver ? "Kendaraan telah diserahkan kepada penerima." : "Tidak ada tindakan operasional lanjutan.",
      blockers: [], completedChecks: ["Riwayat Service Order tersimpan"],
      action: { label: "Lihat riwayat", onClick: () => openSection("history", "service-order-tabs") },
    };
  } else if (!order.assignedMechanicId || !hasDiagnosis) {
    nextAction = !order.assignedMechanicId ? {
      title: "Tugaskan mekanik", description: "Pilih mekanik sebelum diagnosis dilanjutkan.",
      blockers: ["Mekanik belum ditugaskan"], completedChecks: ["Kendaraan diterima"],
      action: { label: "Pilih mekanik", onClick: () => openSection("summary", "mechanic-panel") },
    } : {
      title: "Lengkapi diagnosis", description: "Catat temuan agar estimasi dapat diproses.",
      blockers: ["Diagnosis belum disimpan"], completedChecks: ["Mekanik sudah ditugaskan"],
      action: { label: "Isi diagnosis", onClick: () => openSection("summary", "diagnosis-panel") },
    };
  } else if (!approved || order.status === "assigned") {
    nextAction = !approved ? {
      title: "Setujui pekerjaan", description: "Periksa diagnosis dan estimasi sebelum pekerjaan dimulai.",
      blockers: [], completedChecks: ["Mekanik dan diagnosis siap"],
      action: { label: "Setujui pekerjaan", busy: busy === "approve", onClick: () => void mutate("approve", { notes: "Diagnosis dan estimasi disetujui" }) },
    } : {
      title: "Mulai pengerjaan", description: "Pekerjaan siap dimulai.", blockers: [], completedChecks: ["Diagnosis dan estimasi disetujui"],
      action: { label: "Mulai pengerjaan", busy: busy === "start", onClick: () => void mutate("start", {}) },
    };
  } else if (!workDone || !qcPassed) {
    nextAction = !workDone ? {
      title: "Selesaikan pekerjaan", description: "Konfirmasi pekerjaan jasa dan pemakaian sparepart.",
      blockers: [incompleteJobs ? `${incompleteJobs} jasa belum selesai` : "", unusedParts ? `${unusedParts} sparepart belum dipakai` : "", !(order.jobs?.length || order.parts?.length) ? "Pekerjaan belum dicatat" : ""].filter(Boolean),
      completedChecks: ["Pengerjaan dimulai"], action: { label: "Buka pekerjaan", onClick: () => openSection("work", "service-order-tabs") },
    } : {
      title: "Lakukan Quality Control", description: "Periksa kondisi akhir kendaraan sebelum membuat invoice.",
      blockers: ["Quality Control belum lulus"], completedChecks: ["Pekerjaan bengkel selesai"],
      action: { label: "Buka QC", onClick: () => openSection("work", "quality-control-panel") },
    };
  } else if (order.invoice?.status === "reversed") {
    nextAction = {
      title: "Invoice telah dibatalkan", description: "Pembayaran tidak dapat dicatat pada invoice yang dibatalkan. Periksa riwayat sebelum melanjutkan.",
      blockers: ["Invoice dibatalkan"], completedChecks: ["Quality Control lulus"],
      action: { label: "Lihat tagihan", onClick: () => openSection("billing", "billing-panel") },
    };
  } else if (!invoiced || !paid) {
    nextAction = {
      title: invoiced ? "Selesaikan pembayaran" : "Buat invoice",
      description: invoiced ? `Sisa tagihan ${money.format(number(order.invoice?.outstandingAmount))}.` : "Quality Control lulus. Buat invoice dari pekerjaan tercatat.",
      blockers: invoiced ? ["Tagihan belum lunas"] : [], completedChecks: ["Quality Control lulus"],
      action: { label: invoiced ? "Catat pembayaran" : "Buka tagihan", onClick: () => openSection("billing", "billing-panel") },
    };
  } else {
    nextAction = {
      title: "Lengkapi serah-terima", description: "Checklist, foto akhir, dan tanda tangan penerima diperlukan.",
      blockers: ["Bukti serah-terima belum dikonfirmasi"], completedChecks: ["Invoice lunas", "Quality Control lulus"],
      action: { label: "Buka serah-terima", onClick: () => openSection("billing", "handover-panel") },
    };
  }
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
      <main className="mx-auto grid max-w-[96rem] gap-5 px-4 pb-28 pt-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:pb-8 lg:px-8">
        <div className="min-w-0 space-y-5">
          <ServiceOrderProgress phases={phases} completedCount={completedPhaseCount} cancelled={order.status === "cancelled"} />
          <NextActionPanel {...nextAction} />
          <nav id="service-order-tabs" aria-label="Bagian Service Order" className="sticky top-0 z-20 grid grid-cols-4 gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm lg:static">
            {([ ["summary", "Ringkasan"], ["work", "Pekerjaan"], ["billing", "Tagihan"], ["history", "Riwayat"] ] as const).map(([key, label]) => (
              <button key={key} type="button" aria-pressed={activeTab === key} onClick={() => setActiveTab(key)} className={`min-h-11 rounded-lg px-1 text-xs font-bold focus-visible:outline-2 focus-visible:outline-blue-700 sm:px-3 sm:text-sm ${activeTab === key ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}>{label}</button>
            ))}
          </nav>
          {message && <p role="status" className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-bold text-blue-900">{message}</p>}
          {activeTab === "summary" && <>
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
            <div id="diagnosis-panel" className="scroll-mt-20"><InfoCard title="Keluhan & diagnosis">
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
            </InfoCard></div>
          </div>
          <ServiceOrderContextPanels orderId={order.id} vehicleId={order.vehicle?.id} />
          <div id="mechanic-panel" className="scroll-mt-20"><InfoCard title="Mekanik">
            <p className="text-sm font-bold text-slate-900">{order.assignedMechanicName ?? "Belum ditugaskan"}</p>
            <AssignMechanic mechanics={order.mechanics ?? []} value={order.assignedMechanicId ?? ""} busy={busy === "assign"} onSubmit={(mechanicId) => void mutate("assign", { mechanicId })} />
          </InfoCard></div>
          </>}
          {activeTab === "work" && <>
          <div className="grid gap-5 xl:grid-cols-2">
            <InfoCard title="Tambah pekerjaan / jasa">
              <QuickLineForm
                kind="job"
                busy={busy === "add_job"}
                disabled={!(["assigned", "in_progress"].includes(order.status))}
                disabledMessage="Jasa hanya dapat ditambahkan sebelum Quality Control."
                onSubmit={(payload) => mutate("add_job", payload)}
              />
            </InfoCard>
            <InfoCard title="Tambah sparepart">
              <QuickLineForm
                kind="part"
                busy={busy === "add_part"}
                disabled={order.status !== "in_progress"}
                disabledMessage="Sparepart dapat ditambahkan setelah tombol Mulai pengerjaan ditekan."
                onSubmit={(payload) => mutate("add_part", payload)}
              />
            </InfoCard>
          </div>
          <div className="lg:hidden"><RepairItemsList
            items={repairItems.map((item) => ({ ...item, name: item.name ?? "Tanpa nama", mechanicName: item.kind === "Jasa" ? item.mechanicName ?? mechanicNames.get(item.mechanicId ?? "") ?? order.assignedMechanicName : null, price: item.price ?? item.unitPrice }))}
            canUpdate={order.status === "in_progress"}
            busy={Boolean(busy)}
            onCompleteJob={(jobId) => void mutate("complete_job", { jobId })}
            onConsumePart={(partId) => void mutate("consume_part", { partId, idempotencyKey: crypto.randomUUID() })}
          /></div>
          <div className="hidden lg:block"><InfoCard title="Daftar pekerjaan & sparepart">
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
          </InfoCard></div>
          <div id="quality-control-panel" className="scroll-mt-20">{order.status === "in_progress" && workDone ? <QualityControl value={order.qualityControl} busy={busy === "quality_check"} onSubmit={(payload) => void mutate("quality_check", payload)} /> : <InfoCard title="Quality Control"><p className="text-sm text-slate-700">{qcPassed ? "Pemeriksaan akhir sudah lulus." : "Selesaikan pekerjaan jasa dan konfirmasi pemakaian sparepart sebelum QC."}</p></InfoCard>}</div>
          </>}
          {activeTab === "history" && <>
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
          </>}
          {activeTab === "billing" && <>
            <div id="billing-panel" className="scroll-mt-20">{qcPassed || order.invoice ? <InvoiceCard orderId={orderId} invoice={order.invoice} onCreated={load} /> : <InfoCard title="Invoice & pembayaran"><p className="text-sm text-slate-700">Invoice dapat diproses setelah Quality Control lulus.</p></InfoCard>}</div>
            <div id="handover-panel" className="scroll-mt-20">{paid || handedOver ? <HandoverAssetsPanel orderId={orderId} defaultRecipientName={order.customer?.name ?? ""} onCompleted={load} /> : <InfoCard title="Serah-terima"><p className="text-sm text-slate-700">Lengkapi pembayaran sebelum mengisi bukti serah-terima kendaraan.</p></InfoCard>}</div>
            {handedOver && <CustomerFeedbackPanel orderId={orderId} />}
          </>}
        </div>
        <aside className="hidden space-y-5 lg:sticky lg:top-5 lg:block lg:self-start" aria-label="Ringkasan Service Order">
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
          <InfoCard title="Status sekarang"><StatusBadge status={order.status} /><p className="mt-3 text-sm text-slate-700">{nextAction.title}</p></InfoCard>
        </aside>
      </main>
      {nextAction.action && <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-lg backdrop-blur lg:hidden"><button type="button" disabled={nextAction.action.busy || nextAction.action.disabled} onClick={nextAction.action.onClick} className="min-h-12 w-full rounded-xl bg-blue-800 px-4 text-sm font-black text-white disabled:opacity-50">{nextAction.action.label}</button></div>}
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
  onSubmit: (payload: Record<string, unknown>) => Promise<boolean>;
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
      onSubmit={async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (disabled) return;
        const formElement = event.currentTarget;
        const form = new FormData(formElement);
        const saved = await onSubmit({
          name,
          productId: kind === "part" ? selectedProductId || undefined : undefined,
          quantity: Number(form.get("quantity")),
          price: Number(price),
        });
        if (!saved) return;
        formElement.reset();
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
      <label className="grid gap-1 text-sm font-bold text-slate-700">{kind === "job" ? "Nama pekerjaan" : "Kode / nama sparepart"}<input name="name" required disabled={disabled} value={name} onChange={(event) => setName(event.target.value)} className="min-h-11 rounded-xl border border-slate-300 px-3 font-normal" /></label>
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
  const pendingPayment = useRef<{ fingerprint: string; key: string } | null>(null);
  const outstandingAmount = number(invoice?.outstandingAmount);
  const invoicePaid = isServiceInvoicePaid(invoice);
  async function submit(payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      await request(`/api/v1/operations/service-orders/${orderId}/invoice`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await onCreated();
      pendingPayment.current = null;
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
      {invoice && invoice.status !== "reversed" ? (
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
          {invoicePaid ? (
            <div role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-emerald-700 font-black text-white">✓</span>
                <div>
                  <p className="font-black">Pembayaran lunas</p>
                  <p className="mt-1 text-sm leading-6 text-emerald-900">Seluruh tagihan sudah dibayar. Form pembayaran ditutup untuk mencegah pencatatan ganda.</p>
                </div>
              </div>
            </div>
          ) : (
            <form
              className="mt-3 grid gap-2 border-t border-slate-100 pt-3"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const payment = {
                  method: String(form.get("method")),
                  amount: Number(form.get("amount")),
                  reference: String(form.get("reference") || "") || null,
                };
                const fingerprint = JSON.stringify(payment);
                if (pendingPayment.current?.fingerprint !== fingerprint) {
                  pendingPayment.current = { fingerprint, key: crypto.randomUUID() };
                }
                void submit({ action: "record_payment", ...payment, idempotencyKey: pendingPayment.current.key });
              }}
            >
              <label className="grid gap-1 text-sm font-bold text-slate-700">Metode pembayaran<select name="method" className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 font-normal">
                <option value="cash">Tunai</option>
                <option value="transfer">Transfer</option>
                <option value="card">Kartu</option>
                <option value="qris">QRIS</option>
                <option value="other">Lainnya</option>
              </select></label>
              <label className="grid gap-1 text-sm font-bold text-slate-700">Jumlah pembayaran<input name="amount" type="number" min="1" max={outstandingAmount} defaultValue={outstandingAmount || undefined} required className="min-h-11 rounded-xl border border-slate-300 px-3 font-normal" /></label>
              <label className="grid gap-1 text-sm font-bold text-slate-700">Nomor referensi <span className="font-normal text-slate-500">Opsional</span><input name="reference" maxLength={200} className="min-h-11 rounded-xl border border-slate-300 px-3 font-normal" /></label>
              <button disabled={busy} className="min-h-11 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white disabled:opacity-50">
                {busy ? "Mencatat…" : "Catat pembayaran"}
              </button>
            </form>
          )}
        </>
      ) : invoice?.status === "reversed" ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4"><p className="font-black text-red-900">Invoice dibatalkan</p><p className="mt-1 text-sm text-red-800">Invoice reversal tidak dapat menerima pembayaran. Riwayat tetap tersimpan untuk audit.</p></div>
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
