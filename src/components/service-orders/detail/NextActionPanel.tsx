"use client";

import { useId } from "react";

export type NextActionPanelAction = {
  label: string;
  busy?: boolean;
  disabled?: boolean;
  onClick: () => void;
  tone?: "primary" | "success" | "danger";
};

export type NextActionPanelProps = {
  title: string;
  description: string;
  blockers: string[];
  completedChecks: string[];
  action?: NextActionPanelAction;
  secondaryAction?: NextActionPanelAction;
};

const actionTones: Record<NonNullable<NextActionPanelAction["tone"]>, string> = {
  primary: "bg-blue-800 text-white hover:bg-blue-900 focus-visible:outline-blue-700",
  success: "bg-emerald-700 text-white hover:bg-emerald-800 focus-visible:outline-emerald-700",
  danger: "bg-red-700 text-white hover:bg-red-800 focus-visible:outline-red-700",
};

function StatusIcon({ complete }: { complete: boolean }) {
  return complete ? (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-0.5 size-5 shrink-0 fill-current">
      <path fillRule="evenodd" d="M16.704 5.292a1 1 0 0 1 .004 1.414l-7.25 7.292a1 1 0 0 1-1.42 0l-3.746-3.77a1 1 0 1 1 1.416-1.41l3.04 3.058 6.542-6.58a1 1 0 0 1 1.414-.004Z" clipRule="evenodd" />
    </svg>
  ) : (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="mt-0.5 size-5 shrink-0 fill-current">
      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.72-1.36 3.486 0l6.516 11.585C19.009 16.018 18.045 17.667 16.516 17.667H3.484c-1.53 0-2.493-1.65-1.743-2.983L8.257 3.1ZM10 6.5a.875.875 0 0 1 .875.875v3.25a.875.875 0 0 1-1.75 0v-3.25A.875.875 0 0 1 10 6.5Zm0 7.25a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
    </svg>
  );
}

function ActionButton({ action, secondary = false }: { action: NextActionPanelAction; secondary?: boolean }) {
  const disabled = action.disabled || action.busy;
  const tone = action.tone ?? "primary";
  return (
    <button
      type="button"
      onClick={action.onClick}
      disabled={disabled}
      aria-busy={action.busy || undefined}
      className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto ${secondary ? "border border-slate-300 bg-white text-slate-800 hover:bg-slate-100 focus-visible:outline-slate-700" : actionTones[tone]}`}
    >
      {action.busy && <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" />}
      <span>{action.busy ? `${action.label}...` : action.label}</span>
    </button>
  );
}

export function NextActionPanel({
  title,
  description,
  blockers,
  completedChecks,
  action,
  secondaryAction,
}: NextActionPanelProps) {
  const headingId = useId();
  const hasBlockers = blockers.length > 0;

  return (
    <section aria-labelledby={headingId} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-950 px-4 py-4 text-white sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-300">Tindakan berikutnya</p>
            <h2 id={headingId} className="mt-1 text-lg font-black leading-tight sm:text-xl">{title}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-200">{description}</p>
          </div>
          <p className={`w-fit shrink-0 rounded-full border px-3 py-1.5 text-xs font-black ${hasBlockers ? "border-amber-300 bg-amber-50 text-amber-950" : "border-emerald-300 bg-emerald-50 text-emerald-950"}`}>
            {hasBlockers ? `${blockers.length} hambatan belum selesai` : "Siap dijalankan"}
          </p>
        </div>
      </div>

      <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-black text-slate-950">Prasyarat yang perlu diselesaikan</h3>
          {hasBlockers ? (
            <ul className="mt-3 space-y-2" aria-label="Hambatan tindakan">
              {blockers.map((blocker, index) => (
                <li key={`${blocker}-${index}`} className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-semibold leading-5 text-amber-950">
                  <StatusIcon complete={false} />
                  <span>{blocker}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-950">
              <StatusIcon complete />
              <span>Semua prasyarat tindakan sudah terpenuhi.</span>
            </p>
          )}
        </div>

        <div>
          <h3 className="text-sm font-black text-slate-950">Pemeriksaan yang sudah selesai</h3>
          {completedChecks.length ? (
            <ul className="mt-3 space-y-2" aria-label="Pemeriksaan selesai">
              {completedChecks.map((check, index) => (
                <li key={`${check}-${index}`} className="flex items-start gap-2 px-1 py-1.5 text-sm font-semibold leading-5 text-slate-700">
                  <span className="text-emerald-700"><StatusIcon complete /></span>
                  <span>{check}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm leading-6 text-slate-600">Belum ada pemeriksaan yang ditandai selesai.</p>
          )}
        </div>
      </div>

      {(action || secondaryAction) && (
        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-5">
          {secondaryAction && <ActionButton action={secondaryAction} secondary />}
          {action && <ActionButton action={action} />}
        </div>
      )}
    </section>
  );
}
