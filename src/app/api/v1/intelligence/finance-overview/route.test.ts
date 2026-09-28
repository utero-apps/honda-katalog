import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

describe("finance overview read model", () => {
  it("protects finance data and validates the report range", () => {
    expect(route).toContain(
      'requirePermission(request, requestId, "finance.read")',
    );
    expect(route).toContain("Rentang laporan maksimal 92 hari");
  });
  it("integrates income, cost, expense, payable and cash sources", () => {
    for (const table of [
      "app.customer_invoices",
      "app.pos_sales",
      "app.service_order_parts",
      "app.expenses",
      "app.vendor_invoices",
      "app.payments",
    ])
      expect(route).toContain(table);
  });
  it("returns profitability and owner drill-downs", () => {
    expect(route).toContain("grossMarginPercent");
    expect(route).toContain("incomeComposition");
    expect(route).toContain("payableVendors");
    expect(route).toContain("AS bucket");
  });
  it("returns payable KPI, aging, ranked expense and owner insight data", () => {
    expect(route).toContain('"notDuePayables"');
    expect(route).toContain("overdue1To30");
    expect(route).toContain("topExpenses");
    expect(route).toContain("ownerInsights");
  });
  it("bounds recent activity to the selected finance period", () => {
    expect(route).toContain("i.issued_at >= $1::date");
    expect(route).toContain("e.occurred_at >= $1::date");
    expect(route).toContain("s.completed_at >= $1::date");
  });
});
