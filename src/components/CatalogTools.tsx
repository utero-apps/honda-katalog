"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { Html5Qrcode } from "html5-qrcode";

import { AccessibleDialog } from "./AccessibleDialog";

interface ImportSummary {
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
}

interface Props {
  onBarcode: (value: string) => void;
  onImported: () => Promise<void>;
  onMessage: (value: string) => void;
}

type ImportAction = "reading" | "preview" | "import" | null;

function Spinner() {
  return (
    <svg className="size-4 animate-spin" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-90" fill="currentColor" d="M12 3a9 9 0 0 1 9 9h-3a6 6 0 0 0-6-6V3Z" />
    </svg>
  );
}

function cameraErrorMessage(reason: unknown) {
  const name = reason instanceof Error ? reason.name : "";
  const message = reason instanceof Error ? reason.message : String(reason ?? "");
  const signal = `${name} ${message}`.toLowerCase();
  if (/notallowed|security|permission|denied/.test(signal)) return "Akses kamera ditolak. Izinkan kamera untuk situs ini pada browser dan pengaturan privasi sistem operasi.";
  if (/notfound|not found|no camera/.test(signal)) return "Kamera tidak ditemukan. Hubungkan atau aktifkan kamera, lalu coba lagi.";
  if (/notreadable|trackstart|device in use|could not start video/.test(signal)) return "Kamera sedang dipakai aplikasi atau tab lain. Tutup aplikasi tersebut, lalu coba lagi.";
  if (/overconstrained|constraint/.test(signal)) return "Konfigurasi kamera tidak didukung. Coba pakai kamera lain atau scan dari foto.";
  const detail = message.replace(/\s+/g, " ").trim().slice(0, 160);
  return detail ? `Scanner gagal membuka kamera: ${detail}` : "Scanner gagal membuka kamera. Gunakan scan dari foto atau input manual.";
}

interface BarcodeScannerDialogProps {
  onDetected: (value: string) => void;
  onClose: () => void;
  title?: string;
  description?: string;
}

export function BarcodeScannerDialog({
  onDetected,
  onClose,
  title = "Scan barcode",
  description = "Posisikan seluruh garis barcode di dalam bingkai. Jaga jarak 15–30 cm dan hindari pantulan cahaya.",
}: BarcodeScannerDialogProps) {
  const rawId = useId();
  const scannerId = `scanner-${rawId.replaceAll(":", "")}`;
  const imageInputId = `${scannerId}-image`;
  const titleId = `${scannerId}-title`;
  const scanner = useRef<Html5Qrcode | null>(null);
  const detected = useRef(false);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(true);
  const [manualValue, setManualValue] = useState("");

  const finish = useCallback((value: string) => {
    const normalized = value.trim();
    if (!normalized || detected.current) return;
    detected.current = true;
    onDetected(normalized);
    onClose();
  }, [onClose, onDetected]);

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      try {
        const scannerLibrary = await import("html5-qrcode");
        if (cancelled) return;
        const instance = new scannerLibrary.Html5Qrcode(scannerId);
        scanner.current = instance;
        await instance.start(
          { facingMode: "environment" },
          {
            fps: 10,
            disableFlip: false,
            qrbox: { width: 280, height: 140 },
          },
          finish,
          () => undefined,
        );
        if (!cancelled) setStarting(false);
      } catch (reason) {
        if (!cancelled) {
          setStarting(false);
          setError(cameraErrorMessage(reason));
        }
      }
    };
    void start();
    return () => {
      cancelled = true;
      const active = scanner.current;
      scanner.current = null;
      if (active?.isScanning) void active.stop().catch(() => undefined);
    };
  }, [finish, scannerId]);

  async function scanImage(file?: File) {
    if (!file || detected.current) return;
    setError("");
    setStarting(true);
    try {
      const active = scanner.current;
      if (!active) throw new Error("Scanner belum siap");
      if (active.isScanning) await active.stop();
      finish(await active.scanFile(file, false));
    } catch {
      setError("Barcode pada foto belum terbaca. Pastikan gambar tajam, terang, dan seluruh garis barcode terlihat.");
    } finally {
      setStarting(false);
    }
  }

  function submitManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!manualValue.trim()) {
      setError("Masukkan angka atau kode yang tercetak di bawah barcode.");
      return;
    }
    finish(manualValue);
  }

  return (
    <AccessibleDialog labelledBy={titleId} onClose={onClose} showCloseButton closeLabel="Tutup pemindai barcode" panelClassName="max-w-lg">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-red-600">Pemindai Produk</p>
        <h2 id={titleId} className="mt-1 text-xl font-black text-slate-950">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
      </div>
      <div className="relative mt-5 min-h-64 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-inner">
        <div id={scannerId} className="min-h-64" />
        {starting && <div className="absolute inset-0 grid place-items-center bg-slate-950 text-sm font-semibold text-white" role="status"><span className="flex items-center gap-2"><Spinner /> Menyiapkan kamera...</span></div>}
      </div>
      {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800" role="alert">{error}</p>}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <input id={imageInputId} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(event) => void scanImage(event.target.files?.[0])} />
        <label htmlFor={imageInputId} className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 transition hover:bg-slate-50 sm:col-span-2">Scan dari foto</label>
        <form onSubmit={submitManual} className="flex gap-2 sm:col-span-2">
          <label htmlFor={`${scannerId}-manual`} className="sr-only">Masukkan barcode manual</label>
          <input id={`${scannerId}-manual`} value={manualValue} onChange={(event) => setManualValue(event.target.value)} autoComplete="off" placeholder="Ketik kode barcode" className="dashboard-input min-w-0 flex-1 rounded-xl border px-3 py-2" />
          <button type="submit" className="min-h-11 rounded-xl bg-blue-900 px-4 text-sm font-bold text-white transition hover:bg-blue-800">Gunakan</button>
        </form>
      </div>
    </AccessibleDialog>
  );
}

export function CatalogTools({ onBarcode, onImported, onMessage }: Props) {
  const fileInputId = useId();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [action, setAction] = useState<ImportAction>(null);
  const [status, setStatus] = useState("Belum ada file CSV dipilih.");
  const closeScanner = useCallback(() => setScannerOpen(false), []);
  const busy = action !== null;

  async function request(mode: "preview" | "import") {
    setAction(mode);
    setStatus(mode === "preview" ? "Memeriksa isi CSV..." : "Mengimpor data katalog...");
    try {
      const response = await fetch("/api/v1/catalog/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv, mode }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Import gagal");
      if (mode === "preview") {
        setSummary(result.data.summary);
        setStatus("Preview selesai. Periksa ringkasan sebelum mengimpor.");
      } else {
        const message = `Import selesai: ${result.data.created} baru, ${result.data.updated} diperbarui`;
        onMessage(message);
        await onImported();
        setCsv("");
        setFileName("");
        setSummary(null);
        setStatus(message);
      }
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Import gagal";
      setStatus(`Gagal: ${message}`);
      onMessage(message);
    } finally {
      setAction(null);
    }
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setAction("reading");
    setSummary(null);
    setFileName(file.name);
    setStatus(`Membaca ${file.name}...`);
    try {
      const contents = await file.text();
      setCsv(contents);
      setStatus(`${file.name} siap dipreview.`);
    } catch {
      setCsv("");
      setFileName("");
      const message = "File CSV tidak dapat dibaca. Pilih file lain dan coba lagi.";
      setStatus(`Gagal: ${message}`);
      onMessage(message);
    } finally {
      setAction(null);
    }
  }

  return <>
    <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="catalog-tools-title">
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/80 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 id="catalog-tools-title" className="text-sm font-black text-slate-950">Alat katalog</h2><p className="mt-0.5 text-sm text-slate-600">Cari cepat dengan scanner atau perbarui banyak produk melalui CSV.</p></div>
        <button type="button" onClick={() => setScannerOpen(true)} disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:cursor-not-allowed disabled:opacity-50"><svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 5v4M3 5h4M21 5v4M21 5h-4M3 19v-4M3 19h4M21 19v-4M21 19h-4M7 9v6M10 8v8M14 8v8M17 9v6" /></svg>Scan barcode</button>
      </div>
      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="min-w-0">
          <label htmlFor={fileInputId} className="text-sm font-bold text-slate-800">File data katalog</label>
          <div className="mt-2 flex min-w-0 flex-col gap-2 sm:flex-row">
            <input id={fileInputId} type="file" accept=".csv,text/csv" className="sr-only" disabled={busy} onChange={(event) => void handleFile(event.target.files?.[0])} />
            <label htmlFor={fileInputId} aria-disabled={busy} className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 shadow-sm transition focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-red-600 ${busy ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:border-slate-400 hover:bg-slate-50"}`}><svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 16V4m0 0L7 9m5-5 5 5M5 14v5h14v-5" /></svg>{fileName ? "Ganti CSV" : "Pilih CSV"}</label>
            <div className="flex min-h-11 min-w-0 flex-1 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600"><span className="truncate">{fileName || "Format .csv, satu produk per baris"}</span></div>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={() => void request("preview")} disabled={!csv || busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:cursor-not-allowed disabled:opacity-50">{action === "preview" && <Spinner />}{action === "preview" ? "Memeriksa..." : "Preview CSV"}</button>
          <button type="button" onClick={() => void request("import")} disabled={!summary || summary.invalid > 0 || busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 disabled:shadow-none">{action === "import" && <Spinner />}{action === "import" ? "Mengimpor..." : `Import${summary ? ` ${summary.valid} data` : " data"}`}</button>
        </div>
      </div>
      <div className="border-t border-slate-200 px-4 py-3" aria-live="polite" aria-atomic="true">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className={`flex items-center gap-2 text-sm font-semibold ${status.startsWith("Gagal:") ? "text-red-700" : "text-slate-700"}`} role={status.startsWith("Gagal:") ? "alert" : "status"}>{busy && <Spinner />}{status}</p>
          {summary && <dl className="grid grid-cols-4 gap-x-4 text-center text-xs"><div><dt className="text-slate-500">Total</dt><dd className="mt-0.5 font-black tabular-nums text-slate-900">{summary.total}</dd></div><div><dt className="text-slate-500">Valid</dt><dd className="mt-0.5 font-black tabular-nums text-emerald-700">{summary.valid}</dd></div><div><dt className="text-slate-500">Invalid</dt><dd className={`mt-0.5 font-black tabular-nums ${summary.invalid ? "text-red-700" : "text-slate-900"}`}>{summary.invalid}</dd></div><div><dt className="text-slate-500">Duplikat</dt><dd className="mt-0.5 font-black tabular-nums text-amber-700">{summary.duplicates}</dd></div></dl>}
        </div>
        {summary && summary.invalid > 0 && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">Import dinonaktifkan karena masih ada {summary.invalid} baris invalid. Perbaiki CSV lalu preview ulang.</p>}
      </div>
    </section>
    {scannerOpen && <BarcodeScannerDialog onDetected={onBarcode} onClose={closeScanner} />}
  </>;
}
