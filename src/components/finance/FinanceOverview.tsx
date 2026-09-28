"use client";

import Link from "next/link";
import {
  FormEvent,
  ReactNode,
  useCallback,
  useEffect,
  useId,
  useState,
} from "react";
import { AccessibleDialog } from "@/components/AccessibleDialog";

type Group = { category: string; amount: number };
type InsightData = {
  key: string;
  tone: "positive" | "info" | "warning" | "danger";
  title: string;
  detail: string;
};
type FinanceData = {
  range: { from: string; to: string };
  summary: {
    totalIncome: number;
    totalCogs: number;
    operatingExpense: number;
    totalExpense: number;
    grossProfit: number;
    netProfit: number;
    grossMarginPercent: number;
    netMarginPercent: number;
    incomingCash: number;
    outgoingCash: number;
    receivables: number;
    payables: number;
    overduePayables: number;
    notDuePayables: number;
  };
  trend: Array<{
    date: string;
    income: number;
    expense: number;
    profit: number;
  }>;
  incomeComposition: Group[];
  expenseComposition: Group[];
  payableVendors: Array<{
    id: string;
    vendor: string;
    total: number;
    notDue: number;
    overdue: number;
    nearestDueAt?: string | null;
  }>;
  payableAging: {
    notDue: number;
    overdue1To30: number;
    overdue31To60: number;
    overdue61Plus: number;
  };
  topExpenses: Array<Group & { percentage: number }>;
  insights: InsightData[];
  activity: Array<{
    kind: "income" | "expense" | "payable";
    reference: string;
    counterparty: string;
    amount: number;
    occurred_at: string;
  }>;
};
type Envelope<T> = { data: T; error?: { message?: string } | null };

const money = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
const compactMoney = new Intl.NumberFormat("id-ID", {
  notation: "compact",
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 1,
});
const date = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" });
const day = (value = new Date()) => value.toISOString().slice(0, 10);
const monthStart = () => {
  const value = new Date();
  value.setDate(1);
  return day(value);
};

async function request<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = (await response.json()) as Envelope<T>;
  if (!response.ok)
    throw new Error(
      body.error?.message || "Data keuangan belum dapat diproses",
    );
  return body.data;
}

export function FinanceOverview({ role }: { role: string }) {
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(() => day());
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const canWrite = ["owner", "admin", "finance", "cashier"].includes(role);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(
        await request<FinanceData>(
          `/api/v1/intelligence/finance-overview?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        ),
      );
    } catch (reason) {
      setData(null);
      setError(
        reason instanceof Error
          ? reason.message
          : "Dashboard keuangan belum dapat dimuat",
      );
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  async function submitExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      await request("/api/v1/business/expenses", {
        method: "POST",
        body: JSON.stringify({
          expenseNumber: `EXP-${crypto.randomUUID().slice(0, 12).toUpperCase()}`,
          category: form.get("category"),
          description: form.get("description"),
          amount: Number(form.get("amount")),
          occurredAt: new Date(String(form.get("occurredAt"))).toISOString(),
        }),
      });
      setExpenseOpen(false);
      setMessage("Pengeluaran tersimpan dan profitabilitas diperbarui.");
      await load();
    } catch (reason) {
      setMessage(
        reason instanceof Error ? reason.message : "Pengeluaran gagal disimpan",
      );
    } finally {
      setSaving(false);
    }
  }

  const summary = data?.summary;
  return (
    <section className="mx-auto max-w-7xl" aria-labelledby="finance-heading">
      <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 text-white shadow-xl">
        <div className="flex flex-col gap-5 px-5 py-6 sm:px-7 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[.2em] text-emerald-400">
              Finance & Profitability
            </p>
            <h1
              id="finance-heading"
              className="mt-2 text-2xl font-black sm:text-3xl"
            >
              Visibilitas keuangan bengkel
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Pendapatan, HPP, pengeluaran, piutang, dan hutang vendor dari
              Service Order, POS, inventori, serta purchasing.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <DateField label="Dari" value={from} max={to} onChange={setFrom} />
            <DateField
              label="Sampai"
              value={to}
              min={from}
              max={day()}
              onChange={setTo}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-white/10 px-5 py-3 sm:px-7">
          <button
            type="button"
            onClick={() => void load()}
            className="min-h-11 rounded-xl bg-white px-4 text-sm font-black text-slate-950"
          >
            Muat ulang
          </button>
          {canWrite && (
            <button
              type="button"
              onClick={() => setExpenseOpen(true)}
              className="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-black text-white"
            >
              Catat pengeluaran
            </button>
          )}
          <Link
            href="/business/service-orders"
            className="inline-flex min-h-11 items-center rounded-xl border border-white/15 px-4 text-sm font-bold"
          >
            Service Order
          </Link>
          <Link
            href="/business/inventory"
            className="inline-flex min-h-11 items-center rounded-xl border border-white/15 px-4 text-sm font-bold"
          >
            Inventori & HPP
          </Link>
          <Link
            href="/business/vendors"
            className="inline-flex min-h-11 items-center rounded-xl border border-white/15 px-4 text-sm font-bold"
          >
            Vendor
          </Link>
        </div>
      </div>

      {message && (
        <p
          role="status"
          className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-bold text-blue-900"
        >
          {message}
        </p>
      )}
      {loading && <Loading />}
      {!loading && error && <ErrorState error={error} onRetry={load} />}
      {!loading && data && summary && (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Metric
              label="Total pendapatan"
              value={money.format(summary.totalIncome)}
              helper="Service order dan penjualan POS"
              tone="bg-emerald-50 text-emerald-700"
            />
            <Metric
              label="Total biaya"
              value={money.format(summary.totalExpense)}
              helper="HPP dan operasional"
              tone="bg-red-50 text-red-700"
            />
            <Metric
              label="Gross profit"
              value={money.format(summary.grossProfit)}
              helper="Pendapatan dikurangi HPP"
              tone="bg-blue-50 text-blue-700"
            />
            <Metric
              label="Gross margin"
              value={`${summary.grossMarginPercent.toLocaleString("id-ID")}%`}
              helper="Margin laba kotor"
              tone="bg-violet-50 text-violet-700"
            />
            <Metric
              label="Net profit"
              value={money.format(summary.netProfit)}
              helper="Setelah biaya operasional"
              tone="bg-amber-50 text-amber-700"
            />
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
            <Panel title="Tren pendapatan, biaya, dan profit">
              <Trend points={data.trend} />
            </Panel>
            <Panel title="Profitability summary">
              <Row
                label="Total revenue"
                value={money.format(summary.totalIncome)}
              />
              <Row label="Total HPP" value={money.format(summary.totalCogs)} />
              <Row
                label="Gross profit"
                value={money.format(summary.grossProfit)}
                accent
              />
              <Row
                label="Biaya operasional"
                value={money.format(summary.operatingExpense)}
              />
              <Row
                label="Net profit"
                value={money.format(summary.netProfit)}
                accent
              />
              <Row
                label="Net margin"
                value={`${summary.netMarginPercent.toLocaleString("id-ID")}%`}
              />
            </Panel>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Composition
              title="Komposisi pendapatan"
              items={data.incomeComposition}
              palette="income"
            />
            <Composition
              title="Komposisi biaya"
              items={data.expenseComposition}
              palette="expense"
            />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="Total hutang"
              value={money.format(summary.payables)}
              helper="Saldo vendor terbuka"
              tone="bg-slate-100 text-slate-800"
            />
            <Metric
              label="Belum jatuh tempo"
              value={money.format(summary.notDuePayables)}
              helper="Masih dalam termin"
              tone="bg-blue-50 text-blue-700"
            />
            <Metric
              label="Jatuh tempo"
              value={money.format(summary.overduePayables)}
              helper="Perlu diprioritaskan"
              tone="bg-red-50 text-red-700"
            />
            <Metric
              label="Piutang pelanggan"
              value={money.format(summary.receivables)}
              helper="Invoice belum lunas"
              tone="bg-amber-50 text-amber-800"
            />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[.8fr_1.2fr]">
            <PayableAging value={data.payableAging} />
            <TopExpenses rows={data.topExpenses} />
          </div>
          <div className="mt-4">
            <OwnerInsights rows={data.insights} />
          </div>
          <div className="mt-4 grid gap-4 xl:grid-cols-[1.35fr_.65fr]">
            <Panel title="Ringkasan payable vendor">
              <Payables rows={data.payableVendors} />
            </Panel>
            <Panel title="Aktivitas periode terpilih">
              <Activity rows={data.activity} />
            </Panel>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SmallInsight
              label="Kas masuk"
              value={money.format(summary.incomingCash)}
              helper="Pembayaran pelanggan"
            />
            <SmallInsight
              label="Kas keluar vendor"
              value={money.format(summary.outgoingCash)}
              helper="Pembayaran hutang vendor"
            />
            <SmallInsight
              label="Gross margin"
              value={`${summary.grossMarginPercent.toLocaleString("id-ID")}%`}
              helper="Efisiensi HPP"
            />
            <SmallInsight
              label="Net margin"
              value={`${summary.netMarginPercent.toLocaleString("id-ID")}%`}
              helper="Profit akhir periode"
            />
          </div>
        </>
      )}

      {expenseOpen && (
        <ExpenseDialog
          saving={saving}
          onClose={() => setExpenseOpen(false)}
          onSubmit={submitExpense}
        />
      )}
    </section>
  );
}

function DateField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs font-bold uppercase tracking-wide text-slate-300">
      {label}
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 min-h-11 w-full rounded-xl border border-white/15 bg-white/10 px-3 text-sm text-white"
      />
    </label>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-black text-slate-950">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
function Metric({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  tone: string;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <span
        className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-black uppercase tracking-wide ${tone}`}
      >
        {label}
      </span>
      <p className="mt-3 text-2xl font-black tracking-tight text-slate-950 tabular-nums">
        {value}
      </p>
      <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
        {helper}
      </p>
    </article>
  );
}
function Row({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-3 last:border-0">
      <span className="text-sm text-slate-600">{label}</span>
      <strong
        className={`tabular-nums ${accent ? "text-emerald-700" : "text-slate-950"}`}
      >
        {value}
      </strong>
    </div>
  );
}
function SmallInsight({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-xl font-black tabular-nums text-slate-950">
        {value}
      </p>
      <p className="mt-2 text-xs text-slate-600">{helper}</p>
    </article>
  );
}

function Trend({ points }: { points: FinanceData["trend"] }) {
  const tableId = useId();
  if (!points.length) return <Empty text="Belum ada tren pada periode ini." />;
  const width = 760,
    height = 230,
    padding = 28;
  const max = Math.max(
    1,
    ...points.flatMap((item) => [
      item.income,
      item.expense,
      Math.max(item.profit, 0),
    ]),
  );
  const polyline = (key: "income" | "expense" | "profit") =>
    points
      .map(
        (item, index) =>
          `${(padding + index * ((width - padding * 2) / Math.max(points.length - 1, 1))).toFixed(1)},${(height - padding - (Math.max(item[key], 0) / max) * (height - padding * 2)).toFixed(1)}`,
      )
      .join(" ");
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-4 text-xs font-bold">
        <span className="text-emerald-700">● Pendapatan</span>
        <span className="text-red-700">■ Biaya</span>
        <span className="text-blue-700">▲ Profit</span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={`${tableId}-title ${tableId}-desc`}
        className="h-auto w-full"
      >
        <title id={`${tableId}-title`}>Tren keuangan periode terpilih</title>
        <desc id={`${tableId}-desc`}>
          Perbandingan pendapatan, biaya, dan profit harian. Data lengkap
          tersedia setelah grafik.
        </desc>
        <path
          d={`M${padding} ${height - padding}H${width - padding} M${padding} ${padding}V${height - padding}`}
          stroke="#cbd5e1"
          fill="none"
        />
        <polyline
          points={polyline("income")}
          fill="none"
          stroke="#059669"
          strokeWidth="4"
          strokeLinejoin="round"
        />
        <polyline
          points={polyline("expense")}
          fill="none"
          stroke="#dc2626"
          strokeWidth="4"
          strokeLinejoin="round"
        />
        <polyline
          points={polyline("profit")}
          fill="none"
          stroke="#2563eb"
          strokeWidth="4"
          strokeLinejoin="round"
        />
      </svg>
      <div className="mt-2 flex justify-between text-xs text-slate-500">
        <span>{date.format(new Date(points[0].date))}</span>
        <span>{date.format(new Date(points.at(-1)!.date))}</span>
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-bold text-blue-800">
          Lihat data grafik
        </summary>
        <div className="mt-2 max-h-64 overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-50">
              <tr>
                <th className="p-2">Tanggal</th>
                <th className="p-2">Pendapatan</th>
                <th className="p-2">Biaya</th>
                <th className="p-2">Profit</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.date} className="border-t border-slate-100">
                  <td className="p-2">{date.format(new Date(point.date))}</td>
                  <td className="p-2">{money.format(point.income)}</td>
                  <td className="p-2">{money.format(point.expense)}</td>
                  <td className="p-2">{money.format(point.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function Composition({
  title,
  items,
  palette,
}: {
  title: string;
  items: Group[];
  palette: "income" | "expense";
}) {
  const colors =
    palette === "income"
      ? ["bg-emerald-600", "bg-blue-600", "bg-amber-500", "bg-slate-500"]
      : ["bg-red-600", "bg-orange-500", "bg-blue-600", "bg-slate-500"];
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  return (
    <Panel title={title}>
      {items.length ? (
        <ul className="space-y-4" aria-label={title}>
          {items.map((item, index) => {
            const percent = total ? (item.amount / total) * 100 : 0;
            return (
              <li key={item.category}>
                <div className="flex flex-wrap justify-between gap-2 text-sm">
                  <span className="font-bold text-slate-800">
                    <span
                      className={`mr-2 inline-block size-3 rounded-sm ${colors[index % colors.length]}`}
                      aria-hidden="true"
                    />
                    {item.category}
                  </span>
                  <span className="tabular-nums text-slate-600">
                    {money.format(item.amount)} · {percent.toFixed(1)}%
                  </span>
                </div>
                <div
                  className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"
                  role="meter"
                  aria-label={`${item.category} ${percent.toFixed(1)} persen`}
                  aria-valuenow={percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className={`h-full rounded-full ${colors[index % colors.length]}`}
                    style={{ width: `${Math.max(percent, 2)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty text="Belum ada data pada periode ini." />
      )}
    </Panel>
  );
}

function PayableAging({ value }: { value: FinanceData["payableAging"] }) {
  const rows = [
    { label: "Belum jatuh tempo", amount: value.notDue, tone: "bg-blue-500" },
    {
      label: "Overdue 1-30 hari",
      amount: value.overdue1To30,
      tone: "bg-amber-500",
    },
    {
      label: "Overdue 31-60 hari",
      amount: value.overdue31To60,
      tone: "bg-orange-500",
    },
    {
      label: "Overdue >60 hari",
      amount: value.overdue61Plus,
      tone: "bg-red-600",
    },
  ];
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  return (
    <Panel title="Aging hutang vendor">
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="flex justify-between gap-3 text-sm">
              <span className="font-bold text-slate-700">{row.label}</span>
              <strong className="tabular-nums">
                {money.format(row.amount)}
              </strong>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${row.tone}`}
                style={{
                  width: `${total ? Math.max((row.amount / total) * 100, 2) : 0}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function TopExpenses({ rows }: { rows: FinanceData["topExpenses"] }) {
  return (
    <Panel title="Top pengeluaran periode ini">
      {rows.length ? (
        <ol className="space-y-3">
          {rows.map((row, index) => (
            <li
              key={row.category}
              className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-slate-100 p-3"
            >
              <span className="grid size-8 place-items-center rounded-lg bg-slate-950 text-sm font-black text-white">
                {index + 1}
              </span>
              <div>
                <p className="font-bold text-slate-900">{row.category}</p>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-red-500"
                    style={{ width: `${Math.max(row.percentage, 2)}%` }}
                  />
                </div>
              </div>
              <div className="text-right">
                <strong className="block tabular-nums text-slate-950">
                  {money.format(row.amount)}
                </strong>
                <span className="text-xs text-slate-500">
                  {row.percentage.toFixed(1)}%
                </span>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <Empty text="Belum ada pengeluaran pada periode ini." />
      )}
    </Panel>
  );
}

function OwnerInsights({ rows }: { rows: InsightData[] }) {
  const tones = {
    positive: "border-emerald-200 bg-emerald-50 text-emerald-950",
    info: "border-blue-200 bg-blue-50 text-blue-950",
    warning: "border-amber-200 bg-amber-50 text-amber-950",
    danger: "border-red-200 bg-red-50 text-red-950",
  };
  return (
    <section
      aria-labelledby="owner-insights"
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <h2 id="owner-insights" className="text-lg font-black text-slate-950">
        Insight untuk owner
      </h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {rows.map((row) => (
          <article
            key={row.key}
            className={`rounded-2xl border p-4 ${tones[row.tone]}`}
          >
            <h3 className="font-black">{row.title}</h3>
            <p className="mt-2 text-sm leading-5 opacity-80">
              {formatInsight(row.detail)}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
function formatInsight(value: string) {
  return value.replace(/(\d{4,})/g, (number) => money.format(Number(number)));
}

function Payables({ rows }: { rows: FinanceData["payableVendors"] }) {
  if (!rows.length) return <Empty text="Tidak ada hutang vendor aktif." />;
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[650px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-3">Vendor</th>
              <th className="px-3 py-3">Total</th>
              <th className="px-3 py-3">Belum tempo</th>
              <th className="px-3 py-3">Jatuh tempo</th>
              <th className="px-3 py-3">Tempo terdekat</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-3 py-3 font-bold">{row.vendor}</td>
                <td className="px-3 py-3 tabular-nums">
                  {money.format(row.total)}
                </td>
                <td className="px-3 py-3 tabular-nums">
                  {money.format(row.notDue)}
                </td>
                <td className="px-3 py-3 font-bold tabular-nums text-red-700">
                  {money.format(row.overdue)}
                </td>
                <td className="px-3 py-3">
                  {row.nearestDueAt
                    ? date.format(new Date(row.nearestDueAt))
                    : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 md:hidden">
        {rows.map((row) => (
          <article
            key={row.id}
            className="rounded-2xl border border-slate-200 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-black text-slate-950">{row.vendor}</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Tempo terdekat:{" "}
                  {row.nearestDueAt
                    ? date.format(new Date(row.nearestDueAt))
                    : "Belum ditentukan"}
                </p>
              </div>
              <strong className="tabular-nums">
                {compactMoney.format(row.total)}
              </strong>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-blue-50 p-3">
                <dt className="text-xs font-bold text-blue-700">Belum tempo</dt>
                <dd className="mt-1 font-black tabular-nums text-blue-950">
                  {compactMoney.format(row.notDue)}
                </dd>
              </div>
              <div className="rounded-xl bg-red-50 p-3">
                <dt className="text-xs font-bold text-red-700">Jatuh tempo</dt>
                <dd className="mt-1 font-black tabular-nums text-red-950">
                  {compactMoney.format(row.overdue)}
                </dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </>
  );
}

function Activity({ rows }: { rows: FinanceData["activity"] }) {
  if (!rows.length)
    return <Empty text="Belum ada aktivitas pada periode ini." />;
  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((item) => (
        <li
          key={`${item.kind}-${item.reference}`}
          className="flex justify-between gap-3 py-3"
        >
          <div>
            <p className="font-bold text-slate-900">{item.counterparty}</p>
            <p className="mt-1 text-xs text-slate-500">
              {item.reference} · {date.format(new Date(item.occurred_at))}
            </p>
          </div>
          <strong
            className={`shrink-0 tabular-nums ${item.kind === "income" ? "text-emerald-700" : "text-red-700"}`}
          >
            {item.kind === "income" ? "+" : "-"}
            {compactMoney.format(item.amount)}
          </strong>
        </li>
      ))}
    </ul>
  );
}

function ExpenseDialog({
  saving,
  onClose,
  onSubmit,
}: {
  saving: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <AccessibleDialog
      labelledBy="expense-title"
      onClose={onClose}
      showCloseButton
      panelClassName="max-w-lg"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[.18em] text-red-600">
            Operational expense
          </p>
          <h2 id="expense-title" className="mt-1 text-2xl font-black">
            Catat pengeluaran
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Data langsung masuk perhitungan net profit.
          </p>
        </div>
        <label className="block text-sm font-bold">
          Kategori
          <input
            name="category"
            required
            minLength={2}
            data-dialog-initial-focus
            className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3"
            placeholder="Operasional, listrik, transportasi"
          />
        </label>
        <label className="block text-sm font-bold">
          Keterangan
          <textarea
            name="description"
            required
            minLength={2}
            className="mt-1 min-h-24 w-full rounded-xl border border-slate-300 p-3"
          />
        </label>
        <label className="block text-sm font-bold">
          Jumlah
          <input
            name="amount"
            type="number"
            min="1"
            required
            className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3"
          />
        </label>
        <label className="block text-sm font-bold">
          Waktu transaksi
          <input
            name="occurredAt"
            type="datetime-local"
            required
            defaultValue={new Date().toISOString().slice(0, 16)}
            className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3"
          />
        </label>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-bold"
          >
            Batal
          </button>
          <button
            disabled={saving}
            className="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-black text-white disabled:opacity-50"
          >
            {saving ? "Menyimpan..." : "Simpan pengeluaran"}
          </button>
        </div>
      </form>
    </AccessibleDialog>
  );
}

function ErrorState({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => Promise<void>;
}) {
  return (
    <div
      role="alert"
      className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-900"
    >
      <p className="font-black">Dashboard belum dapat dimuat</p>
      <p className="mt-1 text-sm">{error}</p>
      <button
        type="button"
        onClick={() => void onRetry()}
        className="mt-4 min-h-11 rounded-xl bg-red-700 px-4 text-sm font-bold text-white"
      >
        Coba lagi
      </button>
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
      {text}
    </p>
  );
}
function Loading() {
  return (
    <div
      className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
      aria-busy="true"
      aria-label="Memuat dashboard keuangan"
    >
      {Array.from({ length: 5 }, (_, index) => (
        <div
          key={index}
          className="h-36 animate-pulse rounded-2xl bg-slate-100"
        />
      ))}
    </div>
  );
}
