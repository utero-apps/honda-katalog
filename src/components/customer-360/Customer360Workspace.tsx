"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { CustomerMasterActions } from "./CustomerMasterActions";

type Profile = {
  customer: {
    id: string;
    name: string;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    notes?: string | null;
    isActive?: boolean;
    communicationConsent?: boolean;
    preferredChannel?: "phone" | "whatsapp" | "email";
    createdAt?: string;
  };
  vehicles: Array<{
    id: string;
    plateNumber: string;
    year?: number | null;
    odometer?: number | null;
    model?: string | null;
    vehicleModelId?: string | null;
    vin?: string | null;
    engineNumber?: string | null;
  }>;
  orders: Array<{
    id: string;
    orderNumber: string;
    status: string;
    complaint?: string | null;
    openedAt?: string;
    completedAt?: string | null;
    odometer?: number | null;
    plateNumber?: string;
    mechanicName?: string | null;
    total?: number | null;
    repairSummary?: string | null;
  }>;
  repeatRepairCount?: number;
  followUps: Array<{
    id: string;
    dueAt?: string;
    channel?: string;
    status?: string;
    notes?: string | null;
  }>;
  reminders: Array<{
    id: string;
    vehicleId: string;
    plateNumber: string;
    dueAt?: string;
    odometerDue?: number | null;
    status?: string;
  }>;
  spareParts: Array<{
    id: string;
    serviceOrderId: string;
    orderNumber: string;
    openedAt?: string | null;
    productId: string;
    partCode: string;
    name: string;
    quantity: number;
    unitPrice: number;
    consumedAt?: string | null;
  }>;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    serviceOrderId?: string | null;
    orderNumber?: string | null;
    status: string;
    total: number;
    paidAmount: number;
    outstandingAmount: number;
    issuedAt?: string | null;
    dueAt?: string | null;
  }>;
  payments: Array<{
    id: string;
    paymentNumber: string;
    invoiceNumber: string;
    amount: number;
    method: string;
    reference?: string | null;
    paidAt?: string;
    status: string;
  }>;
  posTransactions: Array<{
    id: string;
    saleNumber: string;
    status: string;
    total: number;
    completedAt?: string;
    voidedAt?: string | null;
  }>;
  auditHistory?: Array<{
    id: string;
    action: string;
    actorName?: string | null;
    createdAt: string;
    summary?: string | null;
  }>;
};
type Envelope<T> = { data: T; error?: { message?: string } | null };
async function requestProfile(customerId: string) {
  const response = await fetch(`/api/v1/operations/customers/${customerId}/profile`);
  const body = await response.json().catch(() => null) as Envelope<Profile> | null;
  if (!response.ok) throw new Error(body?.error?.message || "Profil pelanggan belum dapat dimuat");
  if (!body?.data) throw new Error("Respons profil pelanggan tidak lengkap. Muat ulang halaman.");
  return body.data;
}
const date = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" });
const money = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const channelLabel = (channel?: "phone" | "whatsapp" | "email") => ({ phone: "telepon", whatsapp: "WhatsApp", email: "email" })[channel ?? "phone"];
const statusLabel = (value?: string) =>
  ({
    open: "Aktif",
    in_progress: "Dikerjakan",
    quality_check: "QC",
    completed: "Selesai",
    paid: "Lunas",
    posted: "Terbit",
    partially_paid: "Sebagian",
    reversed: "Dibatalkan",
    voided: "Void",
    sent: "Terkirim",
    cancelled: "Dibatalkan",
    pending: "Menunggu",
    done: "Selesai",
  })[value ?? ""] ??
  value ??
  "-";

export function Customer360Workspace({ customerId }: { customerId: string }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [busyId, setBusyId] = useState("");
  const load = useCallback(async () => {
    setProfile(await requestProfile(customerId));
  }, [customerId]);
  const retryLoad = useCallback(async () => {
    setLoading(true);
    setError("");
    try { setProfile(await requestProfile(customerId)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Profil pelanggan belum dapat dimuat"); }
    finally { setLoading(false); }
  }, [customerId]);
  useEffect(() => {
    let active = true;
    void requestProfile(customerId)
      .then((data) => {
        if (active) setProfile(data);
      })
      .catch((reason) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "Profil pelanggan belum dapat dimuat",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [customerId]);
  async function updateActivity(kind: "follow-ups" | "reminders", id: string, changes: { status?: string; dueAt?: string }) {
    setBusyId(id);
    setActionMessage("");
    try {
      const response = await fetch(`/api/v1/intelligence/${kind}/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes),
      });
      const body = (await response.json()) as Envelope<unknown>;
      if (!response.ok) throw new Error(body.error?.message || "Perubahan CRM gagal disimpan");
      await load();
      setActionMessage("Perubahan CRM tersimpan.");
    } catch (reason) {
      setActionMessage(reason instanceof Error ? reason.message : "Perubahan CRM gagal disimpan");
    } finally {
      setBusyId("");
    }
  }
  if (loading)
    return (
      <Shell>
        <div className="grid min-h-[65dvh] place-items-center font-bold text-slate-600">
          Memuat Customer 360…
        </div>
      </Shell>
    );
  if (error || !profile)
    return (
      <Shell>
        <div
          role="alert"
          className="mx-auto mt-10 max-w-xl rounded-2xl border border-red-200 bg-red-50 p-6 text-center font-bold text-red-800"
        >
          {error}
          <button type="button" onClick={() => void retryLoad()} className="mx-auto mt-4 block min-h-11 rounded-xl bg-red-700 px-4 text-sm font-black text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-800">Coba lagi</button>
        </div>
      </Shell>
    );
  const { customer } = profile;
  async function handleMasterSaved(message: string) {
    try {
      await load();
      setActionMessage(message);
    } catch {
      setActionMessage(`${message} Tampilan terbaru belum dapat dimuat; gunakan Coba lagi atau muat ulang halaman.`);
    }
  }
  return (
    <Shell>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <Link
            href="/business/customers"
            className="text-sm font-bold text-blue-700"
          >
            ← Daftar pelanggan
          </Link>
          <div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[.18em] text-red-600">
                Customer 360
              </p>
              <h1 className="mt-1 text-3xl font-black tracking-tight">
                {customer.name}
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                {customer.phone || "Telepon belum dicatat"}
                {customer.email ? ` · ${customer.email}` : ""}
              </p>
              <span className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-xs font-black ${customer.isActive === false ? "bg-slate-200 text-slate-700" : "bg-emerald-100 text-emerald-800"}`}>
                {customer.isActive === false ? "Pelanggan nonaktif" : "Pelanggan aktif"}
              </span>
              <p className="mt-2 text-xs font-semibold text-slate-500">Reminder: {customer.communicationConsent ? `diizinkan melalui ${channelLabel(customer.preferredChannel)}` : "belum disetujui pelanggan"}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/service/reception" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-700 px-4 text-sm font-black text-white">Terima motor service</Link>
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:px-8">
        {actionMessage && <p role="status" className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-950 lg:col-span-2">{actionMessage}</p>}
        <div className="space-y-5">
          <Card title="Kelola data pelanggan">
            <p className="mb-4 text-sm text-slate-600">Perbarui identitas, kendaraan, kepemilikan, atau gabungkan data duplikat tanpa meninggalkan halaman.</p>
            <CustomerMasterActions customer={customer} vehicles={profile.vehicles} onSaved={handleMasterSaved} />
          </Card>
          <Card title="Kendaraan">
            <div className="grid gap-3 sm:grid-cols-2">
              {profile.vehicles.length ? (
                profile.vehicles.map((vehicle) => (
                  <article
                    key={vehicle.id}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <p className="font-mono text-lg font-black text-blue-800">
                      {vehicle.plateNumber}
                    </p>
                    <p className="mt-2 font-bold">
                      {vehicle.model ?? "Model belum dicatat"}
                      {vehicle.year ? ` · ${vehicle.year}` : ""}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      KM terakhir:{" "}
                      {Number(vehicle.odometer ?? 0).toLocaleString("id-ID")}
                    </p>
                    {(vehicle.vin || vehicle.engineNumber) && <p className="mt-2 text-xs text-slate-500">{vehicle.vin ? `VIN ${vehicle.vin}` : ""}{vehicle.vin && vehicle.engineNumber ? " · " : ""}{vehicle.engineNumber ? `Mesin ${vehicle.engineNumber}` : ""}</p>}
                  </article>
                ))
              ) : (
                <Empty text="Belum ada kendaraan." />
              )}
            </div>
          </Card>
          <Card title="Riwayat Service Order">
            <p className="mb-3 text-xs font-semibold text-slate-500">Kunjungan ulang dalam 30 hari: {profile.repeatRepairCount ?? 0}. Tinjau keluhan sebelum menandai sebagai perbaikan berulang.</p>
            {profile.orders.length ? (
              <div className="divide-y divide-slate-100">
                {profile.orders.map((order) => (
                  <Link
                    key={order.id}
                    href={`/business/service-orders/${order.id}`}
                    className="flex min-h-16 items-center justify-between gap-4 py-3 hover:text-blue-800"
                  >
                    <div>
                      <p className="font-mono text-sm font-bold">
                        {order.orderNumber}
                      </p>
                      <p className="mt-1 line-clamp-1 text-sm text-slate-600">
                        {order.complaint || "Tanpa catatan keluhan"}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{order.plateNumber ?? "-"} · {order.odometer?.toLocaleString("id-ID") ?? "-"} km · {order.mechanicName ?? "Mekanik belum ditentukan"}</p>
                      {order.repairSummary && <p className="mt-1 line-clamp-2 text-xs text-slate-600">Perbaikan: {order.repairSummary}</p>}
                    </div>
                    <div className="text-right">
                      <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-bold text-blue-800">
                        {statusLabel(order.status)}
                      </span>
                      <p className="mt-1 text-xs text-slate-500">
                        {order.openedAt
                          ? date.format(new Date(order.openedAt))
                          : "-"}
                      </p>
                      {order.total !== null && order.total !== undefined && <p className="mt-1 text-xs font-bold text-slate-800">{money.format(order.total)}</p>}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <Empty text="Belum ada riwayat servis." />
            )}
          </Card>
          <Card title="Riwayat Sparepart">
            {profile.spareParts.length ? (
              <div className="divide-y divide-slate-100">
                {profile.spareParts.map((part) => (
                  <article key={part.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div>
                      <p className="font-mono text-xs font-bold text-blue-700">{part.partCode}</p>
                      <p className="font-bold text-slate-950">{part.name}</p>
                      <Link href={`/business/service-orders/${part.serviceOrderId}`} className="mt-1 inline-block text-xs font-bold text-blue-700 hover:underline">
                        {part.orderNumber}
                      </Link>
                    </div>
                    <div className="sm:text-right">
                      <p className="font-black">{part.quantity.toLocaleString("id-ID")} × {money.format(part.unitPrice)}</p>
                      <p className="text-xs text-slate-500">{part.consumedAt ? "Sudah digunakan" : "Masih direservasi"}</p>
                    </div>
                  </article>
                ))}
              </div>
            ) : <Empty text="Belum ada pemakaian sparepart." />}
          </Card>
          <Card title="Invoice & Pembayaran">
            {profile.invoices.length ? (
              <div className="space-y-3">
                {profile.invoices.map((invoice) => (
                  <article key={invoice.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-sm font-black">{invoice.invoiceNumber}</p>
                        <p className="mt-1 text-xs text-slate-500">{invoice.issuedAt ? date.format(new Date(invoice.issuedAt)) : "Tanggal belum tersedia"}</p>
                      </div>
                      <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-800">{statusLabel(invoice.status)}</span>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                      <Metric label="Total" value={money.format(invoice.total)} />
                      <Metric label="Dibayar" value={money.format(invoice.paidAmount)} />
                      <Metric label="Sisa" value={money.format(invoice.outstandingAmount)} emphasis={invoice.outstandingAmount > 0} />
                    </div>
                  </article>
                ))}
                {profile.payments.length > 0 && (
                  <div className="border-t border-slate-200 pt-3">
                    <p className="mb-2 text-xs font-black uppercase tracking-[.14em] text-slate-500">Pembayaran terakhir</p>
                    {profile.payments.slice(0, 5).map((payment) => (
                      <div key={payment.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                        <div><p className="font-bold">{payment.paymentNumber}</p><p className="text-xs text-slate-500">{payment.invoiceNumber} · {payment.method}</p></div>
                        <strong className={payment.status === "reversed" ? "text-red-700 line-through" : "text-slate-950"}>{money.format(payment.amount)}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : <Empty text="Belum ada invoice pelanggan yang dapat ditampilkan." />}
          </Card>
          <Card title="Transaksi POS">
            {profile.posTransactions.length ? (
              <div className="divide-y divide-slate-100">
                {profile.posTransactions.map((transaction) => (
                  <div key={transaction.id} className="flex items-center justify-between gap-4 py-3">
                    <div><p className="font-mono text-sm font-bold">{transaction.saleNumber}</p><p className="mt-1 text-xs text-slate-500">{transaction.completedAt ? date.format(new Date(transaction.completedAt)) : "-"}</p></div>
                    <div className="text-right"><p className="font-black">{money.format(transaction.total)}</p><p className="text-xs font-bold text-slate-500">{statusLabel(transaction.status)}</p></div>
                  </div>
                ))}
              </div>
            ) : <Empty text="Belum ada transaksi POS atas nama pelanggan ini." />}
          </Card>
        </div>
        <aside className="space-y-5">
          <Card title="Kontak & catatan">
            <Data label="Telepon" value={customer.phone || "-"} />
            <Data label="Email" value={customer.email || "-"} />
            <Data label="Alamat" value={customer.address || "-"} />
            {customer.notes && (
              <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                {customer.notes}
              </p>
            )}
            <Data label="Terdaftar" value={customer.createdAt ? date.format(new Date(customer.createdAt)) : "-"} />
          </Card>
          <Card title="Audit & aktivitas data">
            {profile.auditHistory?.length ? <ol className="space-y-3">{profile.auditHistory.map((entry) => <li key={entry.id} className="border-l-2 border-slate-200 pl-3"><p className="text-sm font-bold text-slate-900">{auditLabel(entry.action)}</p><p className="mt-1 text-xs text-slate-500">{date.format(new Date(entry.createdAt))}{entry.actorName ? ` · ${entry.actorName}` : ""}</p>{entry.summary && <p className="mt-1 text-sm text-slate-600">{entry.summary}</p>}</li>)}</ol> : <div className="space-y-3"><p className="text-sm text-slate-600">Log audit rinci akan muncul saat endpoint profil menyediakannya.</p><ol className="space-y-2 text-sm"><HistoryItem label="Pelanggan terdaftar" value={customer.createdAt ? date.format(new Date(customer.createdAt)) : "Tanggal tidak tersedia"} /><HistoryItem label="Kendaraan tercatat" value={`${profile.vehicles.length} kendaraan`} /><HistoryItem label="Service Order" value={`${profile.orders.length} riwayat`} /><HistoryItem label="Pembayaran" value={`${profile.payments.length} transaksi`} /></ol></div>}
          </Card>
          <Card title="Follow-up">
            <Activity items={profile.followUps} empty="Belum ada follow-up." kind="follow-ups" busyId={busyId} phone={customer.phone} onUpdate={updateActivity} />
          </Card>
          <Card title="Reminder service">
            <Activity items={profile.reminders} empty="Belum ada reminder service terjadwal." kind="reminders" busyId={busyId} phone={customer.phone} onUpdate={updateActivity} />
          </Card>
        </aside>
      </main>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-slate-50 text-slate-950">{children}</div>;
}
function auditLabel(action: string) {
  return ({ "customer.update": "Data pelanggan diperbarui", "customer.merge": "Pelanggan digabung", "vehicle.update": "Data kendaraan diperbarui", "vehicle.owner.transfer": "Kepemilikan kendaraan dipindah" } as Record<string, string>)[action] ?? action;
}
function HistoryItem({ label, value }: { label: string; value: string }) {
  return <li className="flex flex-wrap justify-between gap-2 border-b border-slate-100 py-2"><span className="font-semibold">{label}</span><span className="text-slate-600">{value}</span></li>;
}
function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="mb-4 text-lg font-black">{title}</h2>
      {children}
    </section>
  );
}
function Data({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-2 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <strong className="max-w-[65%] text-right text-sm">{value}</strong>
    </div>
  );
}
function Metric({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return <div className="min-w-0 rounded-lg bg-slate-50 p-2"><p className="text-xs text-slate-500">{label}</p><p className={`mt-1 truncate font-black ${emphasis ? "text-red-700" : "text-slate-950"}`}>{value}</p></div>;
}
function Activity({
  items,
  empty,
  kind,
  busyId,
  phone,
  onUpdate,
}: {
  items: Array<{
    id: string;
    dueAt?: string;
    status?: string;
    channel?: string;
    notes?: string | null;
    odometerDue?: number | null;
    plateNumber?: string;
  }>;
  empty: string;
  kind: "follow-ups" | "reminders";
  busyId: string;
  phone?: string | null;
  onUpdate: (kind: "follow-ups" | "reminders", id: string, changes: { status?: string; dueAt?: string }) => Promise<void>;
}) {
  const whatsappNumber = phone?.replace(/\D/g, "").replace(/^0/, "62");
  return items.length ? (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.id} className="rounded-xl border border-slate-200 p-3">
          <div className="flex justify-between gap-3">
            <span className="text-xs font-bold uppercase text-blue-700">
              {item.plateNumber || item.channel || "Service"}
            </span>
            <span className="text-xs font-bold text-slate-500">
              {statusLabel(item.status)}
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-700">
            {item.notes ||
              (item.odometerDue
                ? `Jatuh tempo pada ${item.odometerDue.toLocaleString("id-ID")} km`
                : "Tanpa catatan")}
          </p>
          {item.dueAt && (
            <p className="mt-1 text-xs text-slate-500">
              {date.format(new Date(item.dueAt))}
            </p>
          )}
          {!["completed", "cancelled"].includes(item.status ?? "") && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={busyId === item.id} onClick={() => void onUpdate(kind, item.id, { status: "completed" })} className="min-h-11 rounded-lg bg-blue-700 px-3 text-xs font-bold text-white disabled:opacity-50">Selesai</button>
              <button type="button" disabled={busyId === item.id} onClick={() => void onUpdate(kind, item.id, { status: "cancelled" })} className="min-h-11 rounded-lg border border-slate-300 px-3 text-xs font-bold disabled:opacity-50">Batalkan</button>
              {whatsappNumber && <a className="inline-flex min-h-11 items-center rounded-lg border border-green-700 px-3 text-xs font-bold text-green-800" href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noopener noreferrer">Buka WhatsApp</a>}
              <form className="flex w-full flex-wrap items-end gap-2" onSubmit={(event) => {
                event.preventDefault();
                const value = new FormData(event.currentTarget).get("dueAt");
                if (typeof value === "string" && value) void onUpdate(kind, item.id, { dueAt: new Date(value).toISOString() });
              }}>
                <label className="text-xs font-bold text-slate-700">Jadwalkan ulang<input name="dueAt" type="datetime-local" required className="mt-1 block min-h-11 rounded-lg border border-slate-300 px-2 text-sm text-slate-950" /></label>
                <button disabled={busyId === item.id} className="min-h-11 rounded-lg border border-blue-700 px-3 text-xs font-bold text-blue-800 disabled:opacity-50">Simpan jadwal</button>
              </form>
            </div>
          )}
        </li>
      ))}
    </ul>
  ) : (
    <Empty text={empty} />
  );
}
function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">
      {text}
    </p>
  );
}
