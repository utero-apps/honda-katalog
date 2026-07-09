import React from "react";
import { SparePart } from "@/types";

interface SparePartCardProps {
  part: SparePart;
  onCopy: (code: string) => void;
  onEdit?: (part: SparePart) => void;
}

export const SparePartCard: React.FC<SparePartCardProps> = ({ part, onCopy, onEdit }) => {
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price);
  };

  return (
    <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow flex flex-col justify-between group">
      <div>
        <div className="flex justify-between items-start mb-2">
          <div className="flex-1">
            <span className="inline-block px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-lg uppercase tracking-wide mb-2">
              {part.category}
            </span>
            <h3 className="font-bold text-slate-800 text-base leading-tight mb-1">
              {part.name}
            </h3>
          </div>
          <div className="text-right ml-3 shrink-0">
            <div className="font-extrabold text-red-600 text-sm">
              {formatPrice(part.price)}
            </div>
            {onEdit && (
              <button
                onClick={() => onEdit(part)}
                className="text-xs font-semibold text-slate-400 hover:text-red-600 mt-1 flex items-center gap-1 justify-end ml-auto group-hover:opacity-100 opacity-0 sm:opacity-100 transition-opacity"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                Edit
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-100 mb-3">
          <code className="text-slate-800 font-mono font-bold text-sm tracking-wide flex-1">
            {part.code}
          </code>
          <button
            onClick={() => onCopy(part.code)}
            className="p-2 bg-white border border-slate-200 rounded-lg text-slate-600 hover:text-red-500 hover:border-red-200 hover:bg-red-50 active:scale-95 transition-all focus:outline-none focus:ring-2 focus:ring-red-100"
            title="Copy Kode"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
        </div>

        <div>
          <p className="text-[11px] font-semibold text-slate-400 mb-1.5 uppercase">Cocok Untuk:</p>
          <div className="flex flex-wrap gap-1.5">
            {part.compatibleMotors.map((motor) => (
              <span
                key={motor}
                className="px-2 py-1 bg-white border border-slate-200 text-slate-600 text-[11px] font-medium rounded-md"
              >
                {motor}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
