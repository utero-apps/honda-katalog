import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

describe("purchase order list read model", () => {
  it("uses purchasing read access and validated filter parameters", () => {
    expect(route).toContain(
      'requirePermission(request, requestId, "purchasing.read")',
    );
    expect(route).toContain("querySchema.parse");
    expect(route).toContain("po.status");
    expect(route).toContain("vendorId");
  });
  it("returns vendor, totals, receipt progress, and selectable item details", () => {
    for (const field of [
      "vendorStatus",
      "orderedQuantity",
      "receivedQuantity",
      "receiptProgressPercent",
      "productName",
      "unitPrice",
      "items",
    ])
      expect(route).toContain(field);
    expect(route).toContain("jsonb_agg");
  });
  it("preserves the existing secure purchase order POST", () => {
    expect(route).toMatch(
      /requirePermission\(\s*request,\s*requestId,\s*"purchasing\.write"/,
    );
    expect(route).toContain("assertSameOrigin(request)");
    expect(route).toContain("INSERT INTO app.purchase_orders");
    expect(route).toContain("INSERT INTO app.purchase_order_items");
  });
});
