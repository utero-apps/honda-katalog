import React, { useState, useEffect } from "react";
import { addSparePartAction, updateSparePartAction } from "@/app/actions";
import { BarcodeScannerModal } from "./BarcodeScannerModal";
import { SparePart } from "@/types";

interface SparePartFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editPart: SparePart | null;
  onToast: (msg: string) => void;
}

export const SparePartFormModal: React.FC<SparePartFormModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  editPart,
  onToast,
}) => {
  const [partCode, setPartCode] = useState("");
  const [partName, setPartName] = useState("");
  const [het, setHet] = useState("");
  const [status, setStatus] = useState("Active");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Scanner State inside Form
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  useEffect(() => {
    if (editPart) {
      setPartCode(editPart.code);
      setPartName(editPart.name);
      setHet(editPart.price.toString());
      setStatus("Active");
    } else {
      setPartCode("");
      setPartName("");
      setHet("");
      setStatus("Active");
    }
    setError("");
  }, [editPart, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partCode.trim() || !partName.trim() || !het) {
      setError("Semua kolom (Kode, Nama, Harga) wajib diisi!");
      return;
    }

    const price = parseInt(het, 10);
    if (isNaN(price) || price < 0) {
      setError("Harga HET harus berupa angka positif!");
      return;
    }

    setIsSubmitting(true);
    setError("");

    let result;
    if (editPart) {
      result = await updateSparePartAction(editPart.id, partCode, partName, price, status);
    } else {
      result = await addSparePartAction(partCode, partName, price, status);
    }

    setIsSubmitting(false);

    if (result.success) {
      onToast(editPart ? "Sparepart berhasil diperbarui!" : "Sparepart baru berhasil ditambahkan!");
      onSuccess();
      onClose();
    } else {
      setError(result.error || "Gagal menyimpan data ke database.");
    }
  };

  const handleScanSuccess = (scannedCode: string) => {
    setPartCode(scannedCode);
    onToast("Barcode berhasil di-scan: " + scannedCode);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
        <div className="bg-white rounded-3xl shadow-xl w-full max-w-md border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          {/* Modal Header */}
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-extrabold text-slate-800 text-lg">
              {editPart ? "Edit Sparepart" : "Tambah Sparepart Baru"}
            </h3>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors"
              type="button"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Modal Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
              <div className="bg-red-50 text-red-700 p-3 rounded-xl text-xs font-semibold border border-red-100">
                {error}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Kode Part
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Contoh: 06455-K84-901"
                  value={partCode}
                  onChange={(e) => setPartCode(e.target.value)}
                  className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-mono font-bold text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:bg-white transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setIsScannerOpen(true)}
                  className="px-3.5 bg-red-50 text-red-600 border border-red-100 rounded-xl hover:bg-red-100 hover:text-red-700 active:scale-95 transition-all focus:outline-none focus:ring-2 focus:ring-red-200 flex items-center justify-center"
                  title="Scan Barcode Kode"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Nama Part
              </label>
              <textarea
                placeholder="Contoh: KAMPAS REM DEPAN BEAT 125 / VARIO 125"
                value={partName}
                onChange={(e) => setPartName(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:bg-white transition-all h-20 resize-none"
                required
              />
              <p className="text-[10px] text-slate-400 italic font-semibold">
                Tip: Tulis nama motor kecocokan di nama part (misal: BEAT 125) untuk mengaktifkan filter motor otomatis.
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Harga HET (Rp)
              </label>
              <input
                type="number"
                placeholder="Contoh: 55000"
                value={het}
                onChange={(e) => setHet(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:bg-white transition-all"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:bg-white transition-all"
              >
                <option value="Active">Aktif (Active)</option>
                <option value="Discontinue">Tidak Diproduksi (Discontinued)</option>
              </select>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-xl transition-all"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 py-3 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white text-sm font-bold rounded-xl transition-all shadow-md shadow-red-100 flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : editPart ? (
                  "Simpan Perubahan"
                ) : (
                  "Tambah Data"
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Barcode Scanner Modal inside Form */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleScanSuccess}
      />
    </>
  );
};
