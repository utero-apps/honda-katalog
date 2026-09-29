"use client";

import { useId, useState } from "react";

export type ServiceOrderPhase = {
  key: string;
  label: string;
  done: boolean;
  current: boolean;
  description?: string;
};

type ServiceOrderProgressProps = {
  phases: ServiceOrderPhase[];
  cancelled?: boolean;
  completedCount: number;
};

export function ServiceOrderProgress({
  phases,
  cancelled = false,
  completedCount,
}: ServiceOrderProgressProps) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const total = phases.length;
  const completed = Math.min(Math.max(completedCount, 0), total);
  const currentPhase = phases.find((phase) => phase.current && !phase.done);

  return (
    <section
      aria-labelledby={`${detailsId}-title`}
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${detailsId}-title`} className="text-lg font-black text-slate-950">
          Progress Service Order
        </h2>
        <span
          className={`rounded-full px-3 py-1 text-sm font-bold ${cancelled ? "bg-red-100 text-red-800" : "bg-blue-50 text-blue-900"}`}
        >
          {cancelled ? "Dibatalkan" : `${completed} dari ${total} fase selesai`}
        </span>
      </div>

      <div className="mt-4 md:hidden">
        <p className="text-sm font-semibold text-slate-700">
          {cancelled
            ? "Service Order dibatalkan"
            : currentPhase
              ? `Saat ini: ${currentPhase.label}`
              : completed === total && total > 0
                ? "Semua fase selesai"
                : "Menunggu fase berikutnya"}
        </p>
        <div
          role="progressbar"
          aria-label="Fase Service Order selesai"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={completed}
          aria-valuetext={`${completed} dari ${total} fase selesai`}
          className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-200"
        >
          <div
            className={`h-full rounded-full ${cancelled ? "bg-red-700" : "bg-blue-700"}`}
            style={{ width: `${total ? (completed / total) * 100 : 0}%` }}
          />
        </div>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={detailsId}
          onClick={() => setExpanded((value) => !value)}
          className="mt-3 inline-flex min-h-11 w-full cursor-pointer items-center justify-between rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-blue-800 transition-colors hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
        >
          {expanded ? "Sembunyikan rincian fase" : "Lihat rincian fase"}
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`size-5 shrink-0 ${expanded ? "rotate-180" : ""}`}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>

      <ol
        id={detailsId}
        className={`${expanded ? "grid" : "hidden"} mt-4 gap-2 md:grid md:grid-cols-6`}
      >
        {phases.map((phase, index) => {
          const state = cancelled
            ? "Dibatalkan"
            : phase.done
              ? "Selesai"
              : phase.current
                ? "Sedang berlangsung"
                : "Belum dimulai";
          return (
            <li
              key={phase.key}
              aria-current={!cancelled && phase.current && !phase.done ? "step" : undefined}
              className={`min-w-0 rounded-xl border p-3 ${cancelled ? "border-red-200 bg-red-50" : phase.done ? "border-emerald-200 bg-emerald-50" : phase.current ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-slate-50"}`}
            >
              <span
                aria-hidden="true"
                className={`grid size-7 place-items-center rounded-full text-xs font-black ${cancelled ? "bg-red-700 text-white" : phase.done ? "bg-emerald-700 text-white" : phase.current ? "bg-blue-700 text-white" : "bg-slate-200 text-slate-700"}`}
              >
                {index + 1}
              </span>
              <p className="mt-2 break-words text-sm font-bold text-slate-950">{phase.label}</p>
              <p className="mt-1 text-xs font-semibold text-slate-700">{state}</p>
              {phase.description && (
                <p className="mt-2 break-words text-xs leading-5 text-slate-700">
                  {phase.description}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
