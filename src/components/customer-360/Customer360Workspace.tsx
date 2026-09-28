"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";

type Profile = {
  customer: {
    id: string;
    name: string;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    notes?: string | null;
    createdAt?: string;
  };
  vehicles: Array<{
    id: string;
    plateNumber: string;
    year?: number | null;
    odometer?: number | null;
    model?: string | null;
  }>;
  orders: Array<{
    id: string;
    orderNumber: string;
    status: string;
    complaint?: string | null;
    openedAt?: string;
    completedAt?: string | null;
  }>;
  followUps: Array<{
    id: string;
    dueAt?: string;
    channel?: string;
    status?: string;
    notes?: string | null;
  }>;
  reminders?: Array<{
    id: string;
    dueAt?: string;
    odometerDue?: number | null;
    status?: string;
    notes?: string | null;
  }>;
};
type Envelope<T> = { data: T; error?: { message?: string } | null };
const date = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" });
const statusLabel = (value?: string) =>
  ({
    open: "Aktif",
    in_progress: "Dikerjakan",
    quality_check: "QC",
    completed: "Selesai",
    paid: "Lunas",
    pending: "Menunggu",
    done: "Selesai",
  })[value ?? ""] ??
  value ??
  "-";

export function Customer360Workspace({ customerId }: { customerId: string }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void fetch(`/api/v1/operations/customers/${customerId}/profile`)
      .then(async (response) => {
        const body = (await response.json()) as Envelope<Profile>;
        if (!response.ok)
          throw new Error(
            body.error?.message || "Profil pelanggan belum dapat dimuat",
          );
        if (active) setProfile(body.data);
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
  const reminders = useMemo(
    () =>
      profile?.reminders ??
      profile?.followUps.filter(
        (item) => item.channel === "service_reminder",
      ) ??
      [],
    [profile],
  );
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
        </div>
      </Shell>
    );
  const { customer } = profile;
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
            </div>
            <Link
              href="/service/reception"
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-700 px-4 text-sm font-black text-white"
            >
              Terima motor service
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:px-8">
        <div className="space-y-5">
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
                  </article>
                ))
              ) : (
                <Empty text="Belum ada kendaraan." />
              )}
            </div>
          </Card>
          <Card title="Riwayat Service Order">
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
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <Empty text="Belum ada riwayat servis." />
            )}
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
          </Card>
          <Card title="Follow-up">
            <Activity items={profile.followUps} empty="Belum ada follow-up." />
          </Card>
          <Card title="Reminder service">
            <Activity items={reminders} empty="Belum ada reminder." />
          </Card>
        </aside>
      </main>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-slate-50 text-slate-950">{children}</div>;
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
function Activity({
  items,
  empty,
}: {
  items: Array<{
    id: string;
    dueAt?: string;
    status?: string;
    channel?: string;
    notes?: string | null;
    odometerDue?: number | null;
  }>;
  empty: string;
}) {
  return items.length ? (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.id} className="rounded-xl border border-slate-200 p-3">
          <div className="flex justify-between gap-3">
            <span className="text-xs font-bold uppercase text-blue-700">
              {item.channel || "Service"}
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
