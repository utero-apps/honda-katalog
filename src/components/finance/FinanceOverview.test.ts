import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const component = readFileSync(
  new URL("./FinanceOverview.tsx", import.meta.url),
  "utf8",
);
describe("FinanceOverview", () => {
  it("loads integrated finance data with a date range", () => {
    expect(component).toContain("/api/v1/intelligence/finance-overview?from=");
    expect(component).toContain('type="date"');
  });
  it("links finance decisions to operational modules", () => {
    expect(component).toContain('href="/business/service-orders"');
    expect(component).toContain('href="/business/inventory"');
    expect(component).toContain('href="/business/vendors"');
  });
  it("supports direct expense recording", () => {
    expect(component).toContain("/api/v1/business/expenses");
    expect(component).toContain("Data langsung masuk perhitungan net profit");
  });
  it("renders payable aging, expense ranking, and owner insight sections", () => {
    expect(component).toContain("Aging hutang vendor");
    expect(component).toContain("Top pengeluaran periode ini");
    expect(component).toContain("Insight untuk owner");
  });
  it("provides accessible finance chart data and responsive payable cards", () => {
    expect(component).toContain("Lihat data grafik");
    expect(component).toContain("Tren keuangan periode terpilih");
    expect(component).toContain("md:hidden");
  });
});
