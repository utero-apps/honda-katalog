"use client";

export type RepairItem = {
  id?: string;
  kind: "Jasa" | "Sparepart";
  name: string;
  description?: string | null;
  partCode?: string | null;
  mechanicName?: string | null;
  quantity?: number | string | null;
  unit?: string | null;
  price?: number | string | null;
  subtotal?: number | string | null;
  status?: string | null;
  consumedAt?: string | null;
};

export type RepairItemsListProps = {
  items: RepairItem[];
  formatMoney?: (amount: number) => string;
  onCompleteJob?: (itemId: string) => void | Promise<void>;
  onConsumePart?: (itemId: string) => void | Promise<void>;
  canUpdate?: boolean;
  busy?: boolean;
};

const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
const count = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });

function amount(value: number | string | null | undefined, fallback = 0) {
  const parsed = Number(value);
  return value == null || value === "" || !Number.isFinite(parsed)
    ? fallback
    : parsed;
}

function itemStatus(item: RepairItem) {
  if (item.kind === "Sparepart") {
    return item.consumedAt ? "Terpakai" : "Belum terpakai";
  }
  const status = item.status?.trim().toLowerCase();
  if (status === "completed") return "Selesai";
  if (status === "in_progress") return "Dikerjakan";
  if (status === "open") return "Menunggu";
  return item.status?.replaceAll("_", " ") || "Belum ada status";
}

function itemSubtotal(item: RepairItem) {
  if (item.subtotal !== undefined && item.subtotal !== null && item.subtotal !== "") {
    return amount(item.subtotal);
  }
  return amount(item.quantity, 1) * amount(item.price);
}

function Status({ item }: { item: RepairItem }) {
  const completed = item.kind === "Sparepart"
    ? Boolean(item.consumedAt)
    : item.status?.toLowerCase() === "completed";
  return (
    <span className={`inline-flex max-w-full rounded-full px-2.5 py-1 text-xs font-bold ${completed ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
      {itemStatus(item)}
    </span>
  );
}

function ItemAction({
  item,
  canUpdate,
  busy,
  onCompleteJob,
  onConsumePart,
}: {
  item: RepairItem;
  canUpdate: boolean;
  busy: boolean;
  onCompleteJob?: RepairItemsListProps["onCompleteJob"];
  onConsumePart?: RepairItemsListProps["onConsumePart"];
}) {
  const isService = item.kind === "Jasa";
  const handler = isService ? onCompleteJob : onConsumePart;
  if (!handler) return null;
  const incomplete = isService
    ? item.status?.toLowerCase() !== "completed"
    : !item.consumedAt;
  const enabled = Boolean(canUpdate && item.id && incomplete && !busy);
  return (
    <button
      type="button"
      disabled={!enabled}
      onClick={() => item.id && void handler(item.id)}
      className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-xs font-black text-slate-800 transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
    >
      {busy && incomplete ? "Memproses..." : isService ? "Selesaikan" : "Pakai part"}
    </button>
  );
}

export function RepairItemsList({
  items,
  formatMoney = rupiah.format.bind(rupiah),
  onCompleteJob,
  onConsumePart,
  canUpdate = false,
  busy = false,
}: RepairItemsListProps) {
  const services = items.filter((item) => item.kind === "Jasa").length;
  const parts = items.length - services;
  const total = items.reduce(
    (sum, item) => sum + itemSubtotal(item),
    0,
  );

  return (
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 text-slate-950 shadow-sm sm:p-5" aria-labelledby="repair-items-heading">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-red-700">Rincian perbaikan</p>
          <h2 id="repair-items-heading" className="mt-1 text-lg font-black tracking-tight">Pekerjaan &amp; sparepart</h2>
        </div>
        <span className="text-sm font-semibold text-slate-600">{count.format(items.length)} item</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Ringkasan biaya perbaikan">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold text-slate-600">Pekerjaan jasa</p>
          <p className="mt-1 font-black tabular-nums">{count.format(services)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold text-slate-600">Sparepart</p>
          <p className="mt-1 font-black tabular-nums">{count.format(parts)}</p>
        </div>
        <div className="col-span-2 rounded-xl border border-red-100 bg-red-50 p-3 sm:col-span-1">
          <p className="text-xs font-semibold text-red-800">Total estimasi</p>
          <p className="mt-1 break-words font-black tabular-nums text-red-900">{formatMoney(total)}</p>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
          Belum ada pekerjaan jasa atau sparepart pada service order ini.
        </p>
      ) : (
        <>
          <div className="mt-4 hidden overflow-hidden rounded-xl border border-slate-200 lg:block">
            <table className="w-full table-fixed text-left text-sm">
              <caption className="sr-only">Daftar pekerjaan jasa dan sparepart beserta mekanik, jumlah, biaya, dan status.</caption>
              <colgroup>
                <col className="w-[29%]" /><col className="w-[15%]" /><col className="w-[9%]" />
                <col className="w-[13%]" /><col className="w-[13%]" /><col className="w-[10%]" /><col className="w-[11%]" />
              </colgroup>
              <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-600">
                <tr>
                  <th scope="col" className="px-4 py-3">Item</th>
                  <th scope="col" className="px-4 py-3">Mekanik</th>
                  <th scope="col" className="px-4 py-3 text-right">Jumlah</th>
                  <th scope="col" className="px-4 py-3 text-right">Harga</th>
                  <th scope="col" className="px-4 py-3 text-right">Subtotal</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item, index) => {
                  const quantity = amount(item.quantity, 1);
                  const price = amount(item.price);
                  const subtotal = itemSubtotal(item);
                  return (
                    <tr key={item.id ?? `${item.kind}-${index}`}>
                      <th scope="row" className="break-words px-4 py-3 text-left align-top font-semibold text-slate-900">
                        <span className="block text-xs font-bold text-slate-600">{item.kind}</span>
                        {item.name}
                        {item.partCode && <span className="mt-1 block font-mono text-xs font-semibold text-slate-600">{item.partCode}</span>}
                        {item.description && <span className="mt-1 block text-xs font-normal leading-5 text-slate-600">{item.description}</span>}
                      </th>
                      <td className="break-words px-4 py-3 align-top text-slate-700">{item.mechanicName || "—"}</td>
                      <td className="px-4 py-3 text-right align-top tabular-nums">{count.format(quantity)}{item.unit ? ` ${item.unit}` : ""}</td>
                      <td className="break-words px-4 py-3 text-right align-top tabular-nums">{formatMoney(price)}</td>
                      <td className="break-words px-4 py-3 text-right align-top font-semibold tabular-nums">{formatMoney(subtotal)}</td>
                      <td className="px-4 py-3 align-top"><Status item={item} /></td>
                      <td className="px-4 py-3 align-top"><ItemAction item={item} canUpdate={canUpdate} busy={busy} onCompleteJob={onCompleteJob} onConsumePart={onConsumePart} /></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t border-slate-200 bg-slate-50 font-black">
                <tr><th scope="row" colSpan={4} className="px-4 py-3 text-right">Total estimasi</th>
                  <td className="break-words px-4 py-3 text-right tabular-nums">{formatMoney(total)}</td><td colSpan={2} /></tr>
              </tfoot>
            </table>
          </div>

          <ul className="mt-4 grid min-w-0 gap-3 lg:hidden">
            {items.map((item, index) => {
              const quantity = amount(item.quantity, 1);
              const price = amount(item.price);
              const subtotal = itemSubtotal(item);
              return (
                <li key={item.id ?? `${item.kind}-${index}`} className="min-w-0 rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-600">{item.kind}</span>
                    <Status item={item} />
                  </div>
                  <p className="mt-2 break-words font-bold text-slate-900">{item.name}</p>
                  {item.partCode && <p className="mt-1 break-words font-mono text-xs font-semibold text-slate-600">{item.partCode}</p>}
                  {item.description && <p className="mt-1 break-words text-sm leading-6 text-slate-600">{item.description}</p>}
                  {item.mechanicName && <p className="mt-1 break-words text-sm text-slate-600">Mekanik: {item.mechanicName}</p>}
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-slate-100 pt-3 text-sm">
                    <div className="min-w-0"><dt className="text-slate-600">Jumlah</dt><dd className="font-semibold tabular-nums">{count.format(quantity)}{item.unit ? ` ${item.unit}` : ""}</dd></div>
                    <div className="min-w-0 text-right"><dt className="text-slate-600">Harga satuan</dt><dd className="break-words font-semibold tabular-nums">{formatMoney(price)}</dd></div>
                    <div className="col-span-2 flex min-w-0 flex-wrap items-baseline justify-between gap-2 border-t border-slate-100 pt-2">
                      <dt className="font-semibold text-slate-700">Subtotal</dt>
                      <dd className="break-words font-black tabular-nums text-slate-950">{formatMoney(subtotal)}</dd>
                    </div>
                  </dl>
                  <div className="mt-3 flex justify-end border-t border-slate-100 pt-3">
                    <ItemAction item={item} canUpdate={canUpdate} busy={busy} onCompleteJob={onCompleteJob} onConsumePart={onConsumePart} />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
