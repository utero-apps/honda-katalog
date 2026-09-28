"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { SignaturePad } from "@/components/service-orders/handover/SignaturePad";
import { emptyHandoverChecklist, type HandoverAssetsData, type HandoverChecklist } from "@/components/service-orders/handover/types";

type Envelope<T> = { data: T; error?: { message?: string; fields?: Record<string, string[]> } | null };

async function request<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => null) as Envelope<T> | null;
  if (!response.ok || !body?.data) throw new Error(body?.error?.message || "Data serah terima belum dapat diproses");
  return body.data;
}

export function HandoverAssetsPanel({ orderId, defaultRecipientName = "", onCompleted }: { orderId: string; defaultRecipientName?: string; onCompleted?: () => void | Promise<void> }) {
  const endpoint = `/api/v1/operations/service-orders/${orderId}/handover-assets`;
  const [data, setData] = useState<HandoverAssetsData | null>(null);
  const [checklist, setChecklist] = useState<HandoverChecklist>(emptyHandoverChecklist);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const next = await request<HandoverAssetsData>(endpoint);
    setData(next);
    setChecklist(next.checklist ?? emptyHandoverChecklist);
  }, [endpoint]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load().catch((reason) => setError(reason instanceof Error ? reason.message : "Data serah terima belum dapat dimuat")), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  async function run(name: string, work: () => Promise<void>) {
    setBusy(name); setError(""); setMessage("");
    try { await work(); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Aksi serah terima gagal"); }
    finally { setBusy(""); }
  }

  async function upload(kind: "final_photo" | "signature", file: File) {
    const form = new FormData(); form.set("kind", kind); form.set("image", file);
    await request(endpoint, { method: "POST", body: form });
  }

  const locked = Boolean(data?.handedOverAt);
  const photos = data?.assets.filter((asset) => asset.kind === "final_photo") ?? [];
  const signature = data?.assets.find((asset) => asset.kind === "signature");

  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="handover-assets-title"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><h2 id="handover-assets-title" className="text-lg font-black text-slate-950">Checklist keluar dan bukti akhir</h2><p className="mt-1 text-sm leading-6 text-slate-600">Lengkapi pemeriksaan, foto kondisi akhir, dan tanda tangan sebelum motor diserahkan.</p></div>{data && <span className={`w-fit rounded-full px-3 py-1.5 text-xs font-black ${data.readiness.ready ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{data.readiness.ready ? "Siap diserahkan" : "Belum lengkap"}</span>}</div>{error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">{error}</p>}{message && <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{message}</p>}<form className="mt-5 space-y-3" onSubmit={(event) => { event.preventDefault(); void run("checklist", async () => { await request(endpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(checklist) }); setMessage("Checklist keluar tersimpan."); }); }}><fieldset disabled={locked || busy === "checklist"} className="space-y-3"><legend className="sr-only">Checklist keluar kendaraan</legend>{([ ["vehicleChecked", "Kondisi kendaraan akhir sudah diperiksa"], ["belongingsReturned", "Barang pribadi pelanggan sudah dikembalikan"], ["keysReturned", "Kunci kendaraan sudah diserahkan"], ["workExplained", "Pekerjaan, sparepart, dan saran perawatan sudah dijelaskan"] ] as const).map(([key, label]) => <label key={key} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm font-bold text-slate-800"><input type="checkbox" checked={checklist[key]} onChange={(event) => setChecklist((current) => ({ ...current, [key]: event.target.checked }))} className="mt-0.5 size-5 accent-red-600" /><span>{label}</span></label>)}<label className="block text-sm font-bold text-slate-700">Catatan keluar<textarea value={checklist.notes} onChange={(event) => setChecklist((current) => ({ ...current, notes: event.target.value }))} maxLength={2000} className="mt-2 min-h-20 w-full rounded-xl border border-slate-300 p-3 font-normal text-slate-950" placeholder="Opsional" /></label><button disabled={locked || Boolean(busy)} className="min-h-11 w-full rounded-xl bg-blue-700 px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">{busy === "checklist" ? "Menyimpan…" : "Simpan checklist"}</button></fieldset></form><div className="mt-6 border-t border-slate-200 pt-5"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-black text-slate-950">Foto kondisi akhir</h3><p className="mt-1 text-xs text-slate-500">Minimal satu, maksimal enam foto. JPEG, PNG, atau WebP; maksimal 3 MB.</p></div><label className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-black text-blue-800"><span>{busy === "photos" ? "Mengunggah…" : "Tambah foto"}</span><input type="file" multiple accept="image/jpeg,image/png,image/webp" capture="environment" disabled={locked || Boolean(busy) || photos.length >= 6} className="sr-only" onChange={(event) => { const files = Array.from(event.target.files ?? []); event.currentTarget.value = ""; if (!files.length) return; void run("photos", async () => { for (const file of files.slice(0, Math.max(0, 6 - photos.length))) await upload("final_photo", file); setMessage("Foto akhir tersimpan."); }); }} /></label></div>{photos.length ? <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">{photos.map((photo, index) => <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-xl border border-slate-200 bg-slate-50"><Image src={photo.url} alt={`Foto kondisi akhir ${index + 1}`} width={480} height={320} unoptimized className="aspect-[3/2] h-auto w-full object-cover transition group-hover:opacity-90" /><span className="block p-2 text-xs font-bold text-slate-600">Foto {index + 1}</span></a>)}</div> : <p className="mt-3 rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">Belum ada foto akhir.</p>}</div><div className="mt-6 border-t border-slate-200 pt-5">{signature && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3"><p className="text-sm font-black text-emerald-900">Tanda tangan tersimpan</p><Image src={signature.url} alt="Tanda tangan penerima" width={600} height={180} unoptimized className="mt-2 h-24 w-full rounded-lg bg-white object-contain" /></div>}<SignaturePad disabled={locked} busy={busy === "signature"} onSave={(file) => run("signature", async () => { await upload("signature", file); setMessage("Tanda tangan tersimpan."); })} /></div>{!locked && <HandoverCompletionForm ready={Boolean(data?.readiness.ready)} busy={busy === "complete"} defaultRecipientName={defaultRecipientName} onSubmit={(payload) => run("complete", async () => { await request(`${endpoint}/complete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); setMessage("Motor berhasil diserahterimakan."); await onCompleted?.(); })} />}</section>;
}

function HandoverCompletionForm({ ready, busy, defaultRecipientName, onSubmit }: { ready: boolean; busy: boolean; defaultRecipientName: string; onSubmit: (payload: { recipientName: string; recipientAcknowledged: true; notes: string | null }) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); onSubmit({ recipientName: String(form.get("recipientName") ?? ""), recipientAcknowledged: true, notes: String(form.get("notes") ?? "").trim() || null }); }
  return <form onSubmit={submit} className="mt-6 grid gap-3 border-t border-slate-200 pt-5"><h3 className="font-black text-slate-950">Konfirmasi motor keluar</h3><label className="text-sm font-bold text-slate-700">Nama penerima<input required minLength={2} maxLength={160} name="recipientName" defaultValue={defaultRecipientName} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 font-normal text-slate-950" /></label><label className="text-sm font-bold text-slate-700">Catatan serah terima<textarea name="notes" maxLength={2000} className="mt-2 min-h-20 w-full rounded-xl border border-slate-300 p-3 font-normal text-slate-950" /></label><label className="flex min-h-11 items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm font-bold text-slate-800"><input type="checkbox" name="recipientAcknowledged" required className="mt-0.5 size-5 accent-red-600" /><span>Penerima sudah melihat kondisi akhir, menerima kendaraan dan barangnya, serta menyetujui pencatatan tanda tangan.</span></label><button disabled={!ready || busy} className="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Memproses…" : ready ? "Konfirmasi motor keluar" : "Lengkapi bukti serah terima"}</button></form>;
}
