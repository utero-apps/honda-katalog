"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import type { HandoverAssetsData, HandoverChecklist } from "@/components/service-orders/handover/types";
import {
  amount,
  canPrintDocument,
  handoverEvidence,
  lineTotal,
  type PrintableWorkflow,
  type PrintDocumentType,
} from "./print-model";

const titles: Record<PrintDocumentType, string> = {
  "job-card": "Job Card",
  estimate: "Estimasi Service",
  invoice: "Invoice / Nota Service",
  handover: "Bukti Serah-Terima Kendaraan",
};
const documentOptions = Object.entries(titles) as Array<[PrintDocumentType, string]>;
const money = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });
const date = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" });

function formattedDate(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "-" : date.format(parsed);
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
  return <div className="border-b border-slate-200 py-2"><dt className="text-xs font-semibold uppercase tracking-wider text-slate-600">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm font-medium text-slate-950">{value || "-"}</dd></div>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="break-inside-avoid py-4"><h2 className="border-b-2 border-slate-900 pb-2 text-base font-bold text-slate-950">{title}</h2><div className="mt-2">{children}</div></section>;
}

function Signatures({ labels }: { labels: [string, string] }) {
  return <section className="mt-8 grid grid-cols-2 gap-8 break-inside-avoid text-center text-sm"><div><p>{labels[0]}</p><div className="h-20" /><p className="border-t border-slate-900 pt-2">Nama dan tanda tangan</p></div><div><p>{labels[1]}</p><div className="h-20" /><p className="border-t border-slate-900 pt-2">Nama dan tanda tangan</p></div></section>;
}

function Items({ order, showPrices }: { order: PrintableWorkflow; showPrices: boolean }) {
  const jobs = (order.jobs ?? []).map((item) => ({ ...item, kind: "Jasa", quantity: 1, unit: "pekerjaan" }));
  const parts = (order.parts ?? []).map((item) => ({ ...item, kind: "Sparepart" }));
  const items = [...jobs, ...parts];
  return <Section title="Rincian pekerjaan dan sparepart">
    {items.length ? <div className="overflow-x-auto"><table className="w-full border-collapse text-left text-sm"><thead><tr className="border-b border-slate-500 text-slate-800"><th scope="col" className="py-2 pr-3">Jenis</th><th scope="col" className="py-2 pr-3">Uraian</th><th scope="col" className="py-2 pr-3 text-right">Jumlah</th>{showPrices && <><th scope="col" className="py-2 pr-3 text-right">Harga</th><th scope="col" className="py-2 text-right">Subtotal</th></>}</tr></thead><tbody>{items.map((item, index) => <tr key={item.id ?? `${item.kind}-${index}`} className="break-inside-avoid border-b border-slate-200 align-top"><td className="py-2 pr-3 font-semibold">{item.kind}</td><td className="py-2 pr-3"><span className="font-medium">{item.name || item.partCode || "-"}</span>{item.description && <span className="block text-slate-600">{item.description}</span>}{!showPrices && <span className="block text-slate-600">{item.kind === "Jasa" ? `Mekanik: ${item.mechanicName || order.assignedMechanicName || "-"} · ${item.status || "open"}` : item.consumedAt ? "Terpasang" : "Belum terpasang"}</span>}</td><td className="py-2 pr-3 text-right tabular-nums">{number.format(amount(item.quantity ?? 1))} {item.unit ?? ""}</td>{showPrices && <><td className="py-2 pr-3 text-right tabular-nums">{money.format(amount(item.price ?? item.unitPrice))}</td><td className="py-2 text-right tabular-nums">{money.format(lineTotal(item))}</td></>}</tr>)}</tbody></table></div> : <p className="text-sm text-slate-700">Belum ada pekerjaan atau sparepart yang dicatat.</p>}
  </Section>;
}

function PaymentTotal({ order, estimate }: { order: PrintableWorkflow; estimate: boolean }) {
  const jobs = (order.jobs ?? []).reduce((total, item) => total + lineTotal(item), 0);
  const parts = (order.parts ?? []).reduce((total, item) => total + lineTotal(item), 0);
  const invoice = order.invoice;
  return <Section title={estimate ? "Ringkasan estimasi" : "Ringkasan pembayaran"}><dl className="ml-auto max-w-xs text-sm"><div className="flex justify-between gap-4 py-1"><dt>Jasa</dt><dd className="tabular-nums">{money.format(jobs)}</dd></div><div className="flex justify-between gap-4 py-1"><dt>Sparepart</dt><dd className="tabular-nums">{money.format(parts)}</dd></div>{!estimate && invoice && <><div className="flex justify-between gap-4 border-t py-2 font-bold"><dt>Total invoice</dt><dd className="tabular-nums">{money.format(amount(invoice.total))}</dd></div><div className="flex justify-between gap-4 py-1"><dt>Sudah dibayar</dt><dd className="tabular-nums">{money.format(amount(invoice.paidAmount))}</dd></div><div className="flex justify-between gap-4 py-1 font-bold"><dt>Sisa tagihan</dt><dd className="tabular-nums">{money.format(amount(invoice.outstandingAmount))}</dd></div></>}{estimate && <div className="flex justify-between gap-4 border-t-2 border-slate-900 py-2 font-bold"><dt>Total estimasi</dt><dd className="tabular-nums">{money.format(amount(order.estimate?.total ?? jobs + parts))}</dd></div>}</dl></Section>;
}

const checklistRows: Array<[keyof Pick<HandoverChecklist, "vehicleChecked" | "belongingsReturned" | "keysReturned" | "workExplained">, string]> = [
  ["vehicleChecked", "Kondisi akhir kendaraan telah diperiksa"],
  ["belongingsReturned", "Barang pribadi pelanggan telah dikembalikan"],
  ["keysReturned", "Kunci kendaraan telah diserahkan"],
  ["workExplained", "Pekerjaan, sparepart, dan saran perawatan telah dijelaskan"],
];

function HandoverEvidence({ assets, recipientName }: { assets: HandoverAssetsData; recipientName: string }) {
  const evidence = handoverEvidence(assets);
  return <>
    <Section title="Checklist kendaraan keluar">
      <div className="grid gap-2 sm:grid-cols-2 print:grid-cols-2">{checklistRows.map(([key, label]) => <div key={key} className="flex break-inside-avoid items-start gap-3 border border-slate-300 p-3 text-sm"><span className={`inline-flex min-w-12 justify-center border px-2 py-1 text-xs font-black ${evidence.checklist?.[key] ? "border-slate-900 bg-slate-900 text-white print:bg-white print:text-slate-950" : "border-slate-400 text-slate-700"}`}>{evidence.checklist?.[key] ? "YA" : "TIDAK"}</span><span>{label}</span></div>)}</div>
      <dl className="mt-3"><Field label="Catatan checklist" value={evidence.checklist?.notes} /><Field label="Checklist dikonfirmasi" value={formattedDate(evidence.checklist?.confirmedAt)} /></dl>
    </Section>
    <Section title="Foto kondisi akhir">
      {evidence.photos.length ? <div className="grid grid-cols-2 gap-3 print:grid-cols-2">{evidence.photos.map((photo, index) => <figure key={photo.id} className="break-inside-avoid overflow-hidden border border-slate-300 bg-slate-50"><Image src={photo.url} alt={`Foto kondisi akhir kendaraan ${index + 1}`} width={720} height={480} unoptimized className="aspect-[3/2] h-auto w-full object-cover" /><figcaption className="border-t border-slate-300 px-3 py-2 text-xs font-semibold">Foto akhir {index + 1} - {formattedDate(photo.createdAt)}</figcaption></figure>)}</div> : <p className="border border-dashed border-slate-400 p-4 text-sm">Foto kondisi akhir tidak tersedia.</p>}
    </Section>
    <Section title="Persetujuan penerima">
      <div className="grid items-end gap-6 sm:grid-cols-2 print:grid-cols-2"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-600">Tanda tangan digital penerima</p>{evidence.signature ? <Image src={evidence.signature.url} alt={`Tanda tangan digital ${recipientName}`} width={720} height={240} unoptimized className="mt-2 h-32 w-full border border-slate-300 bg-white object-contain p-2" /> : <div className="mt-2 flex h-32 items-center justify-center border border-dashed border-slate-400 text-sm">Tanda tangan tidak tersedia</div>}<p className="border-t border-slate-900 pt-2 text-center text-sm font-semibold">{recipientName}</p></div><div className="text-center text-sm"><p>Petugas penyerahan</p><div className="h-32" /><p className="border-t border-slate-900 pt-2">Nama dan tanda tangan</p></div></div>
    </Section>
  </>;
}

function DocumentBody({ order, type, handoverAssets }: { order: PrintableWorkflow; type: PrintDocumentType; handoverAssets: HandoverAssetsData | null }) {
  const handedOverAt = order.handover?.handedOverAt || order.handedOverAt;
  return <article className="mx-auto min-h-[270mm] w-full max-w-[210mm] bg-white p-5 text-slate-950 shadow-lg sm:p-10 print:min-h-0 print:max-w-none print:p-0 print:shadow-none">
    <header className="flex flex-wrap justify-between gap-4 border-b-4 border-slate-900 pb-5"><div><p className="text-sm font-bold uppercase tracking-widest text-red-700 print:text-slate-900">Honda Workshop</p><h1 className="mt-1 text-2xl font-black">{titles[type]}</h1><p className="text-sm text-slate-700">Service & Customer Management</p></div><div className="text-left text-sm sm:text-right"><p className="font-bold">SO {order.orderNumber}</p><p>Status: {order.status.replaceAll("_", " ")}</p><p>Dibuka: {formattedDate(order.openedAt)}</p>{type === "invoice" && <p>Invoice: {order.invoice?.invoiceNumber}</p>}</div></header>
    <div className="grid gap-5 py-3 sm:grid-cols-2 print:grid-cols-2"><dl><Field label="Nama pelanggan" value={order.customer?.name ?? order.customerName} /><Field label="Telepon" value={order.customer?.phone ?? order.customerPhone} />{type === "invoice" && <Field label="Alamat" value={order.customer?.address ?? order.customerAddress} />}</dl><dl><Field label="Plat nomor" value={order.vehicle?.plateNumber ?? order.plateNumber} /><Field label="Model / tahun" value={`${order.vehicle?.model ?? order.model ?? "-"} / ${order.vehicle?.year ?? order.vehicleYear ?? "-"}`} /><Field label="Kilometer masuk" value={order.odometer === null || order.odometer === undefined ? "-" : `${number.format(amount(order.odometer))} km`} /></dl></div>
    {(type === "job-card" || type === "estimate") && <><Section title="Keluhan dan pemeriksaan"><dl className="grid gap-x-5 sm:grid-cols-2 print:grid-cols-2"><Field label="Keluhan pelanggan" value={order.complaint} /><Field label="Diagnosis" value={order.diagnosis?.findings ?? order.diagnosis?.notes} /><Field label="Mekanik" value={order.assignedMechanicName} /><Field label="Target selesai" value={formattedDate(order.targetCompletionAt)} /></dl></Section><Items order={order} showPrices={type === "estimate"} /></>}
    {type === "job-card" && <><Section title="Catatan pelaksanaan"><div className="grid gap-5 sm:grid-cols-2 print:grid-cols-2"><p className="text-sm">QC: {order.qualityControl?.status === "passed" ? "Lulus" : order.qualityControl?.status === "rework" ? "Perlu perbaikan" : "Belum dilakukan"}</p><p className="text-sm">Catatan QC: {order.qualityControl?.notes || "-"}</p></div><div className="mt-6 border-b border-slate-400" /><div className="mt-6 border-b border-slate-400" /></Section><Signatures labels={["Mekanik", "Pemeriksa / QC"]} /></>}
    {type === "estimate" && <><PaymentTotal order={order} estimate /><p className="text-sm">{order.estimate?.approvedAt ? `Disetujui: ${formattedDate(order.estimate.approvedAt)}` : "Estimasi belum disetujui. Nilai dapat berubah sebelum approval pelanggan."}</p>{order.estimate?.notes && <p className="mt-2 text-sm">Catatan persetujuan: {order.estimate.notes}</p>}<Signatures labels={["Pelanggan (persetujuan)", "Petugas"]} /></>}
    {type === "invoice" && <><Section title="Informasi invoice"><dl className="grid gap-x-5 sm:grid-cols-2 print:grid-cols-2"><Field label="Tanggal terbit" value={formattedDate(order.invoice?.issuedAt)} /><Field label="Jatuh tempo" value={formattedDate(order.invoice?.dueAt)} /></dl></Section><Items order={order} showPrices /><PaymentTotal order={order} estimate={false} />{Boolean(order.invoice?.payments?.length) && <Section title="Riwayat pembayaran"><ul className="space-y-1 text-sm">{order.invoice?.payments?.map((payment, index) => <li key={payment.id ?? index} className="flex justify-between gap-4"><span>{payment.paymentNumber || `Pembayaran ${index + 1}`} · {formattedDate(payment.paidAt)} · {payment.method || "-"}</span><span className="tabular-nums">{money.format(amount(payment.amount))}</span></li>)}</ul></Section>}<Signatures labels={["Pelanggan", "Kasir"]} /></>}
    {type === "handover" && <><Section title="Pemeriksaan sebelum serah-terima"><dl className="grid gap-x-5 sm:grid-cols-2 print:grid-cols-2"><Field label="QC" value={order.qualityControl?.status === "passed" ? "Lulus" : order.qualityControl?.status === "rework" ? "Perlu perbaikan" : "Tidak tercatat"} /><Field label="Catatan QC" value={order.qualityControl?.notes} /><Field label="Tagihan" value={order.invoice?.invoiceNumber} /><Field label="Sisa pembayaran" value={money.format(amount(order.invoice?.outstandingAmount))} /></dl></Section><Section title="Data serah-terima"><dl><Field label="Diterima oleh" value={order.handover?.recipientName ?? order.handoverRecipientName} /><Field label="Waktu kendaraan keluar" value={formattedDate(handedOverAt)} /><Field label="Catatan" value={order.handover?.notes ?? order.handoverNotes} /></dl></Section>{handoverAssets && <HandoverEvidence assets={handoverAssets} recipientName={order.handover?.recipientName ?? order.handoverRecipientName ?? "Penerima kendaraan"} />}</>}
    <footer className="mt-10 border-t border-slate-300 pt-3 text-xs text-slate-700">Dokumen ini berasal dari data Service Order {order.orderNumber}. Periksa kesesuaian kendaraan dan nominal sebelum menyerahkan salinan.</footer>
  </article>;
}

export function ServiceOrderPrint({ orderId, documentType }: { orderId: string; documentType: PrintDocumentType }) {
  const [order, setOrder] = useState<PrintableWorkflow | null>(null);
  const [handoverAssets, setHandoverAssets] = useState<HandoverAssetsData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError("");
      setOrder(null);
      setHandoverAssets(null);
      try {
        const endpoint = `/api/v1/operations/service-orders/${encodeURIComponent(orderId)}`;
        const requests = [fetch(`${endpoint}/workflow`, { signal: controller.signal, cache: "no-store", credentials: "same-origin" })];
        if (documentType === "handover") requests.push(fetch(`${endpoint}/handover-assets`, { signal: controller.signal, cache: "no-store", credentials: "same-origin" }));
        const responses = await Promise.all(requests);
        const workflowResult = await responses[0].json() as { data?: PrintableWorkflow; error?: { message?: string } };
        if (!responses[0].ok || !workflowResult.data) throw new Error(workflowResult.error?.message || "Data Service Order gagal dimuat.");
        if (documentType === "handover") {
          const assetsResult = await responses[1].json() as { data?: HandoverAssetsData; error?: { message?: string } };
          if (!responses[1].ok || !assetsResult.data) throw new Error(assetsResult.error?.message || "Bukti serah-terima gagal dimuat.");
          setHandoverAssets(assetsResult.data);
        } else setHandoverAssets(null);
        setOrder(workflowResult.data);
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Dokumen gagal dimuat.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [documentType, orderId]);

  async function printDocument() {
    setPrinting(true);
    try {
      const images = Array.from(document.querySelectorAll<HTMLImageElement>(".so-print-document img"));
      await Promise.all(images.map((image) => {
        if (image.complete) return image.naturalWidth > 0 ? Promise.resolve() : Promise.reject(new Error("Gambar bukti gagal dimuat."));
        return new Promise<void>((resolve, reject) => {
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => reject(new Error("Gambar bukti gagal dimuat.")), { once: true });
        });
      }));
      window.print();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Dokumen belum siap dicetak.");
    } finally {
      setPrinting(false);
    }
  }

  const base = `/business/service-orders/${encodeURIComponent(orderId)}`;
  const available = order && canPrintDocument(order, documentType);
  return <main className="min-h-dvh w-full bg-slate-100 px-3 py-5 text-slate-950 sm:px-6 print:bg-white print:p-0">
    <style>{`@page { size: A4; margin: 14mm; } @media print { body { background: white !important; } .so-print-toolbar { display: none !important; } .so-print-document { break-inside: auto; } }`}</style>
    <nav className="so-print-toolbar mx-auto mb-5 flex max-w-[210mm] flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3" aria-label="Pilihan dokumen cetak"><Link className="inline-flex min-h-11 items-center rounded-lg px-3 font-semibold text-slate-900 underline focus-visible:outline-2 focus-visible:outline-blue-700" href={base}>Kembali ke SO</Link>{documentOptions.map(([value, title]) => <Link key={value} href={`${base}/print?document=${value}`} aria-current={documentType === value ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-blue-700 ${documentType === value ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-900 hover:bg-slate-200"}`}>{title}</Link>)}<button type="button" onClick={() => void printDocument()} disabled={!available || loading || printing} className="ml-auto min-h-11 rounded-lg bg-red-700 px-4 font-bold text-white hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{printing ? "Menyiapkan gambar..." : "Cetak / simpan PDF"}</button></nav>
    {loading && <p role="status" className="mx-auto max-w-[210mm] rounded-xl bg-white p-5">Memuat data Service Order...</p>}
    {error && <p role="alert" className="mx-auto max-w-[210mm] rounded-xl border border-red-300 bg-red-50 p-5 font-semibold text-red-900">{error} Kembali ke detail SO, lalu coba lagi.</p>}
    {!loading && order && !available && <p role="alert" className="mx-auto max-w-[210mm] rounded-xl border border-amber-300 bg-amber-50 p-5 font-semibold text-amber-950">{documentType === "invoice" ? "Invoice belum diterbitkan atau sudah dibatalkan." : "Serah-terima kendaraan belum dicatat."} Selesaikan proses pada detail SO sebelum mencetak dokumen ini.</p>}
    {!loading && order && available && <div className="so-print-document"><DocumentBody order={order} type={documentType} handoverAssets={handoverAssets} /></div>}
  </main>;
}
