import Link from "next/link";
import type { VehicleServiceHistory as VehicleServiceHistoryData } from "@/features/service-history/queries";

const currency = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" });

export function VehicleServiceHistory({ data }: { data: VehicleServiceHistoryData }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-200 px-4 py-4 sm:px-5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-700">Riwayat kendaraan</p>
        <h2 className="mt-1 text-lg font-black text-slate-950">{data.vehicle.plateNumber} · {data.vehicle.model ?? "Model belum tercatat"}</h2>
        <p className="mt-1 text-sm text-slate-600">{data.vehicle.customerName}</p>
      </header>
      {data.services.length === 0 ? (
        <p className="px-5 py-8 text-sm text-slate-600">Belum ada service order yang selesai.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-[760px] w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-5 py-3">Tanggal</th><th className="px-5 py-3">Service order</th>
                <th className="px-5 py-3">Odometer</th><th className="px-5 py-3">Pekerjaan</th>
                <th className="px-5 py-3">Mekanik</th><th className="px-5 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.services.map((service) => (
                <tr key={service.id} className="align-top text-slate-700">
                  <td className="whitespace-nowrap px-5 py-4">{date.format(new Date(service.completedAt))}</td>
                  <td className="px-5 py-4 font-bold text-slate-950"><Link className="hover:text-red-700" href={`/business/service-orders/${service.id}`}>{service.orderNumber}</Link></td>
                  <td className="whitespace-nowrap px-5 py-4">{service.odometer === null ? "-" : `${service.odometer.toLocaleString("id-ID")} km`}</td>
                  <td className="max-w-sm px-5 py-4">{service.work.length ? service.work.join(", ") : "-"}</td>
                  <td className="px-5 py-4">{service.mechanic?.name ?? "-"}</td>
                  <td className="whitespace-nowrap px-5 py-4 text-right font-bold text-slate-950">{currency.format(service.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
