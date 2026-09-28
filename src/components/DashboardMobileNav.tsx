import Link from "next/link";

type DashboardView = "dashboard" | "catalog" | "business";

const items: Array<{ href: string; label: string; view: DashboardView }> = [
  { href: "/", label: "Ringkasan", view: "dashboard" },
  { href: "/catalog", label: "Katalog", view: "catalog" },
  { href: "/business", label: "Bisnis", view: "business" },
];

export function DashboardMobileNav({ view }: { view: DashboardView }) {
  return <nav aria-label="Navigasi utama mobile" className="sticky top-[69px] z-20 border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur lg:hidden">
    <div className="mx-auto grid max-w-[96rem] grid-cols-4 gap-2">
      {items.map((item) => <Link key={item.view} href={item.href} aria-current={view === item.view ? "page" : undefined} className={`flex min-h-11 items-center justify-center rounded-xl px-2 text-center text-sm font-bold transition-colors ${view === item.view ? "bg-blue-900 text-white shadow-sm" : "text-slate-700 hover:bg-slate-100"}`}>{item.label}</Link>)}
      <Link href="/pos" className="flex min-h-11 items-center justify-center rounded-xl px-2 text-center text-sm font-bold text-slate-700 transition-colors hover:bg-slate-100">POS</Link>
    </div>
  </nav>;
}
