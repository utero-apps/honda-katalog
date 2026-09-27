"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { Html5Qrcode } from "html5-qrcode";

interface ImportSummary { total: number; valid: number; invalid: number; duplicates: number }
interface Props { onBarcode: (value: string) => void; onImported: () => Promise<void>; onMessage: (value: string) => void }

function Scanner({ onDetected, onClose }: { onDetected: (value: string) => void; onClose: () => void }) {
  const rawId = useId();
  const scannerId = `scanner-${rawId.replaceAll(":", "")}`;
  const scanner = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      try {
        const scannerLibrary = await import("html5-qrcode");
        if (cancelled) return;
        const instance = new scannerLibrary.Html5Qrcode(scannerId);
        scanner.current = instance;
        await instance.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 100 } }, (value) => {
          onDetected(value);
          onClose();
        }, () => undefined);
      } catch {
        setError("Kamera tidak dapat dibuka. Gunakan HTTPS dan izinkan akses kamera.");
      }
    };
    void start();
    return () => {
      cancelled = true;
      const active = scanner.current;
      scanner.current = null;
      if (active?.isScanning) void active.stop().catch(() => undefined);
    };
  }, [onClose, onDetected, scannerId]);

  return <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/80 p-4">
    <div className="w-full max-w-lg rounded-3xl bg-white p-5">
      <div className="flex items-center justify-between"><h2 className="font-black">Scan Barcode</h2><button onClick={onClose} className="font-bold">Tutup</button></div>
      <div id={scannerId} className="mt-4 min-h-64 overflow-hidden rounded-2xl bg-slate-900" />
      {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
    </div>
  </div>;
}

export function CatalogTools({ onBarcode, onImported, onMessage }: Props) {
  const [scannerOpen, setScannerOpen] = useState(false);
  const [csv, setCsv] = useState("");
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const closeScanner = useCallback(() => setScannerOpen(false), []);

  async function request(mode: "preview" | "import") {
    const response = await fetch("/api/v1/catalog/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv, mode }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || "Import gagal");
    if (mode === "preview") setSummary(result.data.summary);
    else { onMessage(`Import selesai: ${result.data.created} baru, ${result.data.updated} diperbarui`); await onImported(); setCsv(""); setSummary(null); }
  }

  return <>
    <div className="mt-3 flex flex-wrap gap-2">
      <button onClick={() => setScannerOpen(true)} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold">Scan Barcode</button>
      <label className="cursor-pointer rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold">Pilih CSV<input type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => { const file=event.target.files?.[0]; if(file) void file.text().then(setCsv); }} /></label>
      {csv && <button onClick={() => void request("preview").catch((error:Error)=>onMessage(error.message))} className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-bold text-white">Preview CSV</button>}
      {summary && summary.invalid===0 && <button onClick={() => void request("import").catch((error:Error)=>onMessage(error.message))} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white">Import {summary.valid} Data</button>}
      {summary && <span className="self-center text-sm text-slate-600">Total {summary.total}, valid {summary.valid}, invalid {summary.invalid}, duplikat {summary.duplicates}</span>}
    </div>
    {scannerOpen && <Scanner onDetected={onBarcode} onClose={closeScanner} />}
  </>;
}
