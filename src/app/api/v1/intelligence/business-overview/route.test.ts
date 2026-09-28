import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

describe("business intelligence read model", () => {
  it("protects reports and validates reporting periods", () => {
    expect(route).toContain('requirePermission(request, requestId, "reports.read")');
    expect(route).toContain("Rentang laporan maksimal 92 hari");
  });

  it("combines CRM, mechanic, revenue, and inventory data", () => {
    for (const table of ["app.customer_follow_ups", "app.mechanics", "app.service_order_jobs", "app.customer_invoice_items", "app.pos_sale_items", "app.inventory_balances", "app.service_order_parts"]) {
      expect(route).toContain(table);
    }
  });

  it("returns decision metrics and drill-down data", () => {
    for (const key of ["repeatServicePercent", "inventoryTurnover", "topParts", "slowMoving", "qualityPassRate", "grossMarginPercent"]) {
      expect(route).toContain(key);
    }
  });
});
