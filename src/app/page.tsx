"use client";

import React, { useState, useEffect, useCallback } from "react";
import { MOTOR_TYPES, CATEGORIES } from "@/data/spareparts";
import { SearchBar } from "@/components/SearchBar";
import { FilterSelector } from "@/components/FilterSelector";
import { SparePartCard } from "@/components/SparePartCard";
import { Toast } from "@/components/Toast";
import { SparePartFormModal } from "@/components/SparePartFormModal";
import { BarcodeScannerModal } from "@/components/BarcodeScannerModal";
import { searchSparePartsAction } from "@/app/actions";
import { SparePart } from "@/types";

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMotor, setSelectedMotor] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  
  const [spareParts, setSpareParts] = useState<SparePart[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [toastMessage, setToastMessage] = useState("");

  // Modal & Scanner State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPart, setEditingPart] = useState<SparePart | null>(null);
  const [isSearchScannerOpen, setIsSearchScannerOpen] = useState(false);

  // Fetch from database
  const fetchParts = useCallback(async (query: string, motor: string, category: string) => {
    setIsLoading(true);
    setErrorMessage("");
    
    const result = await searchSparePartsAction(query, motor, category);
    
    if (result.success) {
      setSpareParts(result.data);
    } else {
      setErrorMessage(result.error || "Gagal memuat data sparepart.");
      setSpareParts([]);
    }
    setIsLoading(false);
  }, []);

  // Fetch data on change
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchParts(searchQuery, selectedMotor, selectedCategory);
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, selectedMotor, selectedCategory, fetchParts]);

  const handleCopyCode = (code: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code);
      setToastMessage("Kode " + code + " berhasil disalin!");
    } else {
      setToastMessage("Browser tidak mendukung salin otomatis.");
    }
  };

  const handleEditPart = (part: SparePart) => {
    setEditingPart(part);
    setIsModalOpen(true);
  };

  const handleAddNewPart = () => {
    setEditingPart(null);
    setIsModalOpen(true);
  };

  const handleFormSuccess = () => {
    fetchParts(searchQuery, selectedMotor, selectedCategory);
  };

  const handleSearchScanSuccess = (scannedCode: string) => {
    setSearchQuery(scannedCode);
    setToastMessage("Hasil scan: " + scannedCode);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-between">
      <div>
        {/* Header Sticky for quick access */}
        <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm pt-4 pb-4 px-4 sm:px-6">
          <div className="max-w-3xl mx-auto space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center shadow-sm shrink-0">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-xl font-extrabold text-slate-800 tracking-tight">Katalog Honda</h1>
                  <p className="text-xs font-semibold text-slate-500">Pencarian Cepat Sparepart</p>
                </div>
              </div>
              
              {/* Button Tambah Sparepart */}
              <button
                onClick={handleAddNewPart}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm font-bold rounded-xl transition-all shadow-md shadow-red-100 flex items-center gap-1.5 focus:outline-none"
              >
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                Tambah Baru
              </button>
            </div>

            <SearchBar 
              value={searchQuery} 
              onChange={setSearchQuery} 
              onScanClick={() => setIsSearchScannerOpen(true)}
            />
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">
          {/* Error Banner */}
          {errorMessage && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-2xl text-sm space-y-2">
              <div className="flex gap-2 items-center">
                <svg className="w-5 h-5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="font-bold">Info Koneksi Database:</span>
              </div>
              <p>
                Aplikasi belum terhubung dengan Supabase. Pastikan kamu sudah:
              </p>
              <ol className="list-decimal pl-5 space-y-1 text-xs">
                <li>Menjalankan script SQL dari file <code className="bg-amber-100 px-1 py-0.5 rounded">supabase_schema.sql</code> di Supabase editor.</li>
                <li>Mengisi <code className="bg-amber-100 px-1 py-0.5 rounded">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> di file <code className="bg-amber-100 px-1 py-0.5 rounded">.env.local</code>.</li>
              </ol>
              <p className="text-xs text-amber-700 italic">
                Detail Error: {errorMessage}
              </p>
            </div>
          )}

          <FilterSelector
            selectedMotor={selectedMotor}
            onSelectMotor={setSelectedMotor}
            motors={MOTOR_TYPES}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
            categories={CATEGORIES}
          />

          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold text-slate-700">Hasil Pencarian</h2>
              <span className="bg-slate-200 text-slate-700 text-xs font-bold px-2.5 py-1 rounded-full">
                {spareParts.length} Ditemukan
              </span>
            </div>

            {isLoading ? (
              /* Skeleton Loader */
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[...Array(4)].map((_, index) => (
                  <div key={index} className="bg-white p-4 rounded-2xl border border-slate-100 animate-pulse space-y-3">
                    <div className="h-4 bg-slate-200 rounded w-1/4"></div>
                    <div className="h-6 bg-slate-200 rounded w-3/4"></div>
                    <div className="h-10 bg-slate-100 rounded w-full"></div>
                    <div className="h-4 bg-slate-200 rounded w-1/2"></div>
                  </div>
                ))}
              </div>
            ) : spareParts.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {spareParts.map((part) => (
                  <SparePartCard 
                    key={part.id} 
                    part={part} 
                    onCopy={handleCopyCode} 
                    onEdit={handleEditPart}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-slate-300">
                <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 className="text-lg font-bold text-slate-600 mb-1">Tidak Ditemukan</h3>
                <p className="text-slate-500 text-sm">Coba cari dengan kata kunci atau filter lain.</p>
                <button 
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedMotor("");
                    setSelectedCategory("");
                  }}
                  className="mt-4 px-4 py-2 bg-red-50 text-red-600 text-sm font-semibold rounded-xl hover:bg-red-100"
                >
                  Reset Filter
                </button>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Footer */}
      <footer className="mt-12 border-t border-slate-200 bg-white py-6 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-center sm:text-left">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pembuat Aplikasi</p>
            <a
              href="https://maskhar.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-extrabold text-slate-800 hover:text-red-600 transition-colors"
            >
              MasKhar DevOps
            </a>
          </div>

          <div className="flex items-center gap-3">
            {/* Website Link */}
            <a
              href="https://maskhar.com"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 bg-slate-50 border border-slate-200 text-slate-500 hover:text-red-600 hover:bg-red-50 hover:border-red-100 rounded-xl transition-all"
              title="Website Resmi"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
            </a>

            {/* Instagram Link */}
            <a
              href="https://www.instagram.com/maskhar_2708"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 bg-slate-50 border border-slate-200 text-slate-500 hover:text-pink-600 hover:bg-pink-50 hover:border-pink-100 rounded-xl transition-all"
              title="Instagram"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                <path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z" />
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
              </svg>
            </a>

            {/* Tiktok Link */}
            <a
              href="https://www.tiktok.com/@maskhar2708"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 bg-slate-50 border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-100 hover:border-slate-300 rounded-xl transition-all"
              title="TikTok"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.17-2.86-.74-3.94-1.74-.22-.2-.43-.4-.63-.62v7.39c.02 3.76-2.58 7.37-6.38 8.09-3.8.72-7.86-1.39-8.93-5.07-1.07-3.68 1.02-7.9 4.75-8.8 1.25-.3 2.57-.2 3.77.26v4.1c-1-.44-2.18-.45-3.15-.02-1.6.72-2.48 2.62-1.95 4.31.53 1.68 2.37 2.68 4.09 2.22 1.72-.46 2.78-2.28 2.48-4.04V0h-.36z"/>
              </svg>
            </a>

            {/* WhatsApp Link */}
            <a
              href="https://wa.me/62817270898?text=Saya%20tertarik%20dengan%20fitur%20catalog%20ini"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 bg-slate-50 border border-slate-200 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 hover:border-emerald-100 rounded-xl transition-all"
              title="WhatsApp Chat"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </a>
          </div>
        </div>
      </footer>

      {/* Form Modal for Add/Edit */}
      <SparePartFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleFormSuccess}
        editPart={editingPart}
        onToast={setToastMessage}
      />

      {/* Global Barcode Scanner for Search */}
      <BarcodeScannerModal
        isOpen={isSearchScannerOpen}
        onClose={() => setIsSearchScannerOpen(false)}
        onScanSuccess={handleSearchScanSuccess}
      />

      {toastMessage && (
        <Toast message={toastMessage} onClose={() => setToastMessage("")} />
      )}
    </div>
  );
}
