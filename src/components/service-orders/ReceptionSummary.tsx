import type { ServiceOrderReceptionSummary as ReceptionSummaryData } from "@/features/service-order-reception-summary/queries";

const labels = { general: "Umum", monthly: "Bulanan", mileage: "Berdasarkan kilometer", routine: "Berkala" } as const;
const dateTime = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" });

export function ReceptionSummary({ data }: { data: ReceptionSummaryData }) {
  const reception = data.reception;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-red-700">Penerimaan kendaraan</p><h2 className="mt-1 text-lg font-black text-slate-950">Checklist awal service</h2></div>
        {reception && <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-800">{labels[reception.serviceType]}</span>}
      </div>
      {!reception ? <p className="mt-5 text-sm text-slate-600">Service order ini tidak dibuat melalui penerimaan kendaraan.</p> : (
        <>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <Item label="Odometer" value={reception.odometer === null ? "-" : `${reception.odometer.toLocaleString("id-ID")} km`} />
            <Item label="Bahan bakar" value={reception.fuelLevel === null ? "-" : `${reception.fuelLevel}%`} />
            <Item label="Kondisi fisik" value={reception.physicalCondition || "-"} />
            <Item label="Barang tertinggal" value={reception.belongings.length ? reception.belongings.join(", ") : "Tidak ada"} />
            <Item label="Diterima oleh" value={`${reception.receivedBy.name} · ${dateTime.format(new Date(reception.receivedAt))}`} />
            <Item label="Catatan" value={reception.notes || "-"} />
          </dl>
          {reception.odometerCorrectionReason && <Notice title="Koreksi odometer" text={reception.odometerCorrectionReason} />}
          {reception.recommendations.length > 0 && <Notice title="Rekomendasi awal" text={reception.recommendations.map(formatRecommendation).join(" · ")} />}
        </>
      )}
    </section>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</dt><dd className="mt-1 text-sm font-semibold text-slate-900">{value}</dd></div>;
}

function Notice({ title, text }: { title: string; text: string }) {
  return <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"><p className="text-xs font-bold uppercase tracking-wider text-amber-800">{title}</p><p className="mt-1 text-sm text-amber-950">{text}</p></div>;
}

function formatRecommendation(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const item = value as Record<string, unknown>;
    const label = item.title ?? item.name ?? item.label ?? item.reason;
    if (typeof label === "string") return label;
  }
  return "Rekomendasi service";
}
