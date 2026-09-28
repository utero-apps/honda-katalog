"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ApiEnvelope, ServiceOrder } from "./service-order-types";

const date = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
});

async function request<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const body = (await response
    .json()
    .catch(() => null)) as ApiEnvelope<T> | null;
  if (!response.ok)
    throw new Error(
      body?.error?.message || "Data Service Order belum dapat dimuat",
    );
  return body?.data as T;
}
const statusLabel = (status?: string) =>
  ({
    open: "Diterima",
    in_progress: "Dikerjakan",
    quality_check: "QC",
    waiting_parts: "Menunggu part",
    completed: "Selesai",
    invoiced: "Menunggu bayar",
    paid: "Lunas",
    handed_over: "Diserahkan",
  })[status || ""] ||
  status ||
  "Belum diketahui";
const statusClass = (status?: string) =>
  status === "completed" || status === "paid" || status === "handed_over"
    ? "bg-emerald-100 text-emerald-800"
    : status === "waiting_parts"
      ? "bg-amber-100 text-amber-800"
      : status === "quality_check"
        ? "bg-violet-100 text-violet-800"
        : "bg-blue-100 text-blue-800";

export function ServiceOrdersWorkspace() {
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("active");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void request<ServiceOrder[]>("/api/v1/operations/service-orders")
      .then((items) => {
        if (active) setOrders(items);
      })
      .catch((reason) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "Data Service Order belum dapat dimuat",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const filtered = useMemo(
    () =>
      orders.filter((order) => {
        const haystack =
          `${order.orderNumber} ${order.customerName ?? order.customer?.name ?? ""} ${order.plateNumber ?? order.vehicle?.plateNumber ?? ""}`.toLowerCase();
        const closed = ["completed", "paid", "handed_over"].includes(
          order.status,
        );
        return (
          haystack.includes(query.toLowerCase()) &&
          (status === "all" || status === "active"
            ? !closed
            : order.status === status)
        );
      }),
    [orders, query, status],
  );
  return (
    <section className="mx-auto max-w-7xl" aria-labelledby="service-orders-heading">
      <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 text-white shadow-xl">
        <div className="flex flex-col justify-between gap-4 px-5 py-5 sm:flex-row sm:items-end sm:px-7 sm:py-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[.18em] text-red-400">
                Workshop operation
              </p>
              <h2 id="service-orders-heading" className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">
                Service Order Desk
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                Pantau penerimaan, pengerjaan, QC, invoice, hingga serah terima
                motor.
              </p>
            </div>
            <Link
              href="/service/reception"
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-black text-slate-950 hover:bg-slate-100"
            >
              Terima motor baru
            </Link>
          </div>
        </div>
      </div>
      <section className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-sm sm:p-6">
        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_auto]">
          <label className="block">
            <span className="sr-only">Cari Service Order</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari nomor SO, pelanggan, atau plat kendaraan"
              className="min-h-12 w-full rounded-xl border border-slate-300 px-4 text-base font-semibold outline-none focus:border-blue-700 focus:ring-4 focus:ring-blue-100"
            />
          </label>
          <label className="text-sm font-bold text-slate-700">
            Status
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 md:w-48"
            >
              <option value="active">Aktif</option>
              <option value="all">Semua status</option>
              <option value="waiting_parts">Menunggu part</option>
              <option value="quality_check">Quality control</option>
              <option value="completed">Selesai</option>
            </select>
          </label>
        </div>
        {loading ? (
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <div
                key={index}
                className="h-48 animate-pulse rounded-2xl bg-slate-200"
              />
            ))}
          </div>
        ) : error ? (
          <div
            role="alert"
            className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800"
          >
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-600">
            Tidak ada Service Order pada filter ini.
          </div>
        ) : (
          <>
            <div className="mt-5 hidden overflow-hidden rounded-2xl border border-slate-200 bg-white lg:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-4">Service Order</th>
                    <th className="px-5 py-4">Pelanggan & motor</th>
                    <th className="px-5 py-4">Mekanik</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4">Masuk</th>
                    <th className="px-5 py-4" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((order) => (
                    <tr key={order.id} className="hover:bg-slate-50">
                      <td className="px-5 py-4 font-mono font-bold text-blue-800">
                        {order.orderNumber}
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-bold">
                          {order.customerName ?? order.customer?.name ?? "-"}
                        </p>
                        <p className="text-xs text-slate-500">
                          {order.plateNumber ??
                            order.vehicle?.plateNumber ??
                            "-"}{" "}
                          ·{" "}
                          {order.model ??
                            order.vehicle?.model ??
                            "Model belum dicatat"}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        {order.assignedMechanicName ?? "Belum ditugaskan"}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusClass(order.status)}`}
                        >
                          {statusLabel(order.status)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {order.openedAt
                          ? date.format(new Date(order.openedAt))
                          : "-"}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Link
                          href={`/business/service-orders/${order.id}`}
                          className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 px-3 font-bold text-slate-800 hover:border-blue-300 hover:text-blue-800"
                        >
                          Buka
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-5 grid gap-3 lg:hidden">
              {filtered.map((order) => (
                <Link
                  key={order.id}
                  href={`/business/service-orders/${order.id}`}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-300"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-mono font-bold text-blue-800">
                      {order.orderNumber}
                    </p>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-bold ${statusClass(order.status)}`}
                    >
                      {statusLabel(order.status)}
                    </span>
                  </div>
                  <p className="mt-3 font-black">
                    {order.customerName ?? order.customer?.name ?? "-"}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {order.plateNumber ?? order.vehicle?.plateNumber ?? "-"} ·{" "}
                    {order.model ??
                      order.vehicle?.model ??
                      "Model belum dicatat"}
                  </p>
                  <p className="mt-3 text-xs font-semibold text-slate-500">
                    {order.assignedMechanicName ?? "Belum ditugaskan"}
                  </p>
                </Link>
              ))}
            </div>
          </>
        )}
      </section>
    </section>
  );
}
