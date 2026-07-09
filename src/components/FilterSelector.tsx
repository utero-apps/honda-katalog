import React from "react";

interface FilterSelectorProps {
  selectedMotor: string;
  onSelectMotor: (motor: string) => void;
  motors: string[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  categories: string[];
}

export const FilterSelector: React.FC<FilterSelectorProps> = ({
  selectedMotor,
  onSelectMotor,
  motors,
  selectedCategory,
  onSelectCategory,
  categories,
}) => {
  return (
    <div className="space-y-4 w-full">
      {/* Motor Filter */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Pilih Tipe Motor
          </label>
          {selectedMotor && (
            <button
              onClick={() => onSelectMotor("")}
              className="text-xs font-semibold text-red-500 hover:text-red-700"
            >
              Reset
            </button>
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
          <button
            onClick={() => onSelectMotor("")}
            className={"flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all " +
              (selectedMotor === ""
                ? "bg-red-500 text-white shadow-md shadow-red-200"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200")
            }
          >
            Semua Motor
          </button>
          {motors.map((motor) => (
            <button
              key={motor}
              onClick={() => onSelectMotor(motor)}
              className={"flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all " +
                (selectedMotor === motor
                  ? "bg-red-500 text-white shadow-md shadow-red-200"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200")
              }
            >
              {motor}
            </button>
          ))}
        </div>
      </div>

      {/* Category Filter */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Kategori Sparepart
          </label>
          {selectedCategory && (
            <button
              onClick={() => onSelectCategory("")}
              className="text-xs font-semibold text-red-500 hover:text-red-700"
            >
              Reset
            </button>
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
          <button
            onClick={() => onSelectCategory("")}
            className={"flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all " +
              (selectedCategory === ""
                ? "bg-slate-800 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200")
            }
          >
            Semua Kategori
          </button>
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => onSelectCategory(category)}
              className={"flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all " +
                (selectedCategory === category
                  ? "bg-slate-800 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200")
              }
            >
              {category}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
