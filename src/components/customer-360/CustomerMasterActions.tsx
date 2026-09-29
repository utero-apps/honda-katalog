"use client";

import { useEffect, useState, type FormEvent } from "react";

type Customer = { id: string; name: string; phone?: string | null; email?: string | null; address?: string | null; notes?: string | null; isActive?: boolean; communicationConsent?: boolean; preferredChannel?: "phone" | "whatsapp" | "email" };
type Vehicle = { id: string; plateNumber: string; year?: number | null; odometer?: number | null; vehicleModelId?: string | null; vin?: string | null; engineNumber?: string | null };
type Action = { kind: "customer" | "status" | "addVehicle" | "vehicle" | "merge" | "transfer"; vehicle?: Vehicle };

const inputClass = "mt-1 block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700";
const buttonClass = "min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-700 disabled:opacity-50";

async function send(url: string, method: "PATCH" | "POST", data: Record<string, unknown>) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  if (!response.ok) throw new Error(body?.error?.message || `Gagal menyimpan (${response.status}). Periksa data dan coba lagi.`);
}

export function CustomerMasterActions({ customer, vehicles, onSaved }: { customer: Customer; vehicles: Vehicle[]; onSaved: (message: string, merged?: boolean) => Promise<void> }) {
  const [action, setAction] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [models, setModels] = useState<Array<{ id: string; name: string }>>([]);
  const [candidates, setCandidates] = useState<Array<{ id: string; name: string; phone?: string | null }>>([]);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [channel, setChannel] = useState<"phone" | "whatsapp" | "email">("phone");
  const [consent, setConsent] = useState(false);
  const [modelError, setModelError] = useState("");
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/v1/auth/me").then((response) => {
      if (!response.ok) throw new Error("Sesi tidak tersedia");
      return response.json();
    }).then((body: { data?: { user?: { role?: string } } }) => {
      if (active) setRole(body.data?.user?.role ?? "");
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  function open(next: Action) {
    setError("");
    setModelError("");
    setChannel(customer.preferredChannel ?? (!customer.phone && customer.email ? "email" : "phone"));
    setConsent(customer.communicationConsent ?? false);
    setSearch("");
    setCandidates([]);
    setAction(next);
    if (next.kind === "addVehicle" || next.kind === "vehicle") {
      setModels([]);
      void fetch("/api/v1/catalog/models").then((response) => {
        if (!response.ok) throw new Error("Daftar model gagal dimuat. Coba tutup dan buka kembali formulir.");
        return response.json();
      }).then((body: { data?: typeof models }) => setModels(body.data ?? [])).catch((reason) => setModelError(reason instanceof Error ? reason.message : "Daftar model gagal dimuat"));
    }
  }

  async function findCandidates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSearching(true);
    try {
      const response = await fetch(`/api/v1/operations/customers?query=${encodeURIComponent(search.trim())}`);
      const body = await response.json() as { data?: typeof candidates; error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message || "Pencarian pelanggan gagal");
      setCandidates((body.data ?? []).filter((candidate) => candidate.id !== customer.id));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Pencarian pelanggan gagal"); }
    finally { setSearching(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action || busy) return;
    const data = new FormData(event.currentTarget);
    const value = (key: string) => String(data.get(key) ?? "").trim();
    if (action.kind === "customer") {
      if (!value("phone") && !value("email")) { setError("Isi minimal nomor telepon atau email."); return; }
      if (channel === "email" && !value("email")) { setError("Isi email untuk memilih kanal email."); return; }
      if (channel !== "email" && !value("phone")) { setError("Isi nomor telepon untuk kanal telepon atau WhatsApp."); return; }
    }
    setBusy(true);
    setError("");
    try {
      if (action.kind === "customer") {
        await send(`/api/v1/operations/customers/${customer.id}`, "PATCH", { name: value("name"), phone: value("phone") || null, email: value("email") || null, address: value("address") || null, notes: value("notes") || null, communicationConsent: consent, preferredChannel: channel });
      } else if (action.kind === "status") {
        await send(`/api/v1/operations/customers/${customer.id}`, "PATCH", { isActive: !customer.isActive });
      } else if (action.kind === "addVehicle" || action.kind === "vehicle") {
        const payload = { plateNumber: value("plateNumber"), vehicleModelId: value("vehicleModelId") || null, year: value("year") ? Number(value("year")) : null, vin: value("vin") || null, engineNumber: value("engineNumber") || null };
        if (action.kind === "addVehicle") await send("/api/v1/operations/vehicles", "POST", { ...payload, customerId: customer.id, odometer: Number(value("odometer") || 0) });
        else await send(`/api/v1/operations/vehicles/${action.vehicle?.id}`, "PATCH", payload);
      } else if (action.kind === "merge") {
        const sourceCustomerId = value("sourceCustomerId");
        if (sourceCustomerId === customer.id) throw new Error("Tidak dapat menggabungkan pelanggan dengan dirinya sendiri.");
        await send(`/api/v1/operations/customers/${customer.id}/merge`, "POST", { sourceCustomerId, reason: value("reason") });
      } else {
        const customerId = value("customerId");
        if (customerId === customer.id) throw new Error("Pilih pemilik baru yang berbeda.");
        await send(`/api/v1/operations/vehicles/${action.vehicle?.id}/transfer`, "POST", { customerId, reason: value("reason") });
      }
      setAction(null);
      await onSaved(action.kind === "merge" ? "Data pelanggan berhasil digabungkan." : "Perubahan berhasil disimpan.", action.kind === "merge");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Perubahan gagal disimpan"); }
    finally { setBusy(false); }
  }

  return <>
    <div className="flex flex-wrap gap-2">
      <button className={buttonClass} type="button" onClick={() => open({ kind: "customer" })}>Edit pelanggan</button>
      <button className={buttonClass} type="button" onClick={() => open({ kind: "addVehicle" })}>Tambah kendaraan</button>
      {["owner", "admin"].includes(role) && <button className={buttonClass} type="button" onClick={() => open({ kind: "merge" })}>Gabung pelanggan</button>}
      {["owner", "admin"].includes(role) && <a className={`${buttonClass} inline-flex items-center`} href="/api/v1/operations/customers/export" download>Ekspor CSV pelanggan</a>}
      <button className={buttonClass} type="button" onClick={() => open({ kind: "status" })}>{customer.isActive === false ? "Aktifkan" : "Nonaktifkan"}</button>
    </div>
    {vehicles.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{vehicles.map((vehicle) => <div key={vehicle.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm"><span className="font-mono font-bold">{vehicle.plateNumber}</span><button className="min-h-11 font-bold text-blue-800 underline" type="button" onClick={() => open({ kind: "vehicle", vehicle })}>Edit</button><button className="min-h-11 font-bold text-blue-800 underline" type="button" onClick={() => open({ kind: "transfer", vehicle })}>Pindah pemilik</button></div>)}</div>}
    {action && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/60 p-3 sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setAction(null); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="customer-action-title" className="my-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 text-slate-950 shadow-xl sm:p-6">
        <div className="flex items-start justify-between gap-3"><h2 id="customer-action-title" className="text-xl font-black">{{ customer: "Edit pelanggan", status: customer.isActive === false ? "Aktifkan pelanggan" : "Nonaktifkan pelanggan", addVehicle: "Tambah kendaraan", vehicle: "Edit kendaraan", merge: "Gabungkan pelanggan", transfer: "Pindah kepemilikan" }[action.kind]}</h2><button className={buttonClass} type="button" disabled={busy} onClick={() => setAction(null)}>Tutup</button></div>
        {(action.kind === "merge" || action.kind === "transfer") && <p className="mt-3 text-sm text-slate-700">{action.kind === "merge" ? `Pelanggan ${customer.name} tetap menjadi data utama. Data pelanggan sumber akan digabung; periksa identitas sebelum melanjutkan.` : `Kendaraan ${action.vehicle?.plateNumber} akan berpindah dari ${customer.name}. Pastikan pemilik baru benar.`}</p>}
        {(action.kind === "merge" || action.kind === "transfer") && <form className="mt-4 flex gap-2" onSubmit={(event) => void findCandidates(event)}><label className="flex-1 text-sm font-bold">Cari pelanggan lain<input className={inputClass} value={search} onChange={(event) => setSearch(event.target.value)} required minLength={2} placeholder="Nama, telepon, atau email" /></label><button className={`${buttonClass} self-end`} type="submit" disabled={searching}>{searching ? "Mencari…" : "Cari"}</button></form>}
        <form key={`${action.kind}-${action.vehicle?.id ?? customer.id}`} onSubmit={(event) => void submit(event)} className="mt-4 space-y-4">
          {action.kind === "customer" && <><Field label="Nama" name="name" required defaultValue={customer.name} /><div><Field label="Telepon" name="phone" type="tel" defaultValue={customer.phone ?? ""} /><p className="mt-1 text-xs text-slate-500">Telepon boleh kosong bila pelanggan hanya menggunakan email.</p></div><Field label="Email" name="email" type="email" defaultValue={customer.email ?? ""} /><Field label="Alamat" name="address" defaultValue={customer.address ?? ""} /><Field label="Catatan" name="notes" defaultValue={customer.notes ?? ""} /><fieldset className="space-y-3 rounded-xl border border-slate-200 p-3"><legend className="px-1 text-sm font-black">Izin komunikasi</legend><label className="flex min-h-11 items-start gap-3 text-sm font-bold"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-0.5 size-5 accent-blue-700" /><span><span className="block">Pelanggan menyetujui reminder.</span><span className="mt-1 block font-normal text-slate-600">Aktifkan hanya setelah pelanggan memberi persetujuan.</span></span></label><label className="block text-sm font-bold">Kanal pilihan<select value={channel} onChange={(event) => setChannel(event.target.value as typeof channel)} className={inputClass}><option value="phone">Telepon</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option></select></label>{!consent && <p className="text-xs text-slate-500">Kanal disimpan sebagai preferensi, tetapi reminder tidak dikirim sampai izin diberikan.</p>}</fieldset></>}
          {action.kind === "status" && <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-950">{customer.isActive === false ? "Pelanggan akan kembali aktif." : "Pelanggan akan dinonaktifkan. Riwayat transaksi tidak dihapus."}</p>}
          {(action.kind === "vehicle" || action.kind === "addVehicle") && <><Field label="Nomor plat" name="plateNumber" required defaultValue={action.vehicle?.plateNumber ?? ""} /><label className="block text-sm font-bold">Model kendaraan<select name="vehicleModelId" className={inputClass} defaultValue={action.vehicle?.vehicleModelId ?? ""} disabled={Boolean(modelError)}><option value="">{modelError ? "Model tidak tersedia" : "Tanpa model"}</option>{models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</select></label>{modelError && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">{modelError}</p>}<Field label="Tahun" name="year" type="number" min={1950} max={2100} defaultValue={action.vehicle?.year ?? ""} /><Field label="VIN" name="vin" defaultValue={action.vehicle?.vin ?? ""} /><Field label="Nomor mesin" name="engineNumber" defaultValue={action.vehicle?.engineNumber ?? ""} />{action.kind === "addVehicle" && <Field label="KM awal" name="odometer" type="number" min={0} defaultValue={0} />}</>}
          {(action.kind === "merge" || action.kind === "transfer") && <><label className="block text-sm font-bold">{action.kind === "merge" ? "Pelanggan sumber" : "Pemilik baru"}<select name={action.kind === "merge" ? "sourceCustomerId" : "customerId"} required className={inputClass} defaultValue=""><option value="">Pilih hasil pencarian</option>{candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.phone || "Tanpa telepon"}</option>)}</select></label><Field label={action.kind === "merge" ? "Alasan penggabungan" : "Alasan pemindahan"} name="reason" required minLength={3} /></>}
          {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4"><button className={buttonClass} type="button" disabled={busy} onClick={() => setAction(null)}>Batal</button><button className="min-h-11 rounded-xl bg-blue-700 px-4 text-sm font-bold text-white disabled:opacity-50" disabled={busy}>{busy ? "Menyimpan…" : "Konfirmasi & simpan"}</button></div>
        </form>
      </section>
    </div>}
  </>;
}

function Field({ label, name, ...props }: { label: string; name: string; required?: boolean; type?: string; min?: number; max?: number; minLength?: number; defaultValue?: string | number }) {
  return <label className="block text-sm font-bold">{label}<input name={name} className={inputClass} {...props} /></label>;
}
