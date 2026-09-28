import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

describe("stock opname list read model", () => {
  it("uses inventory read access and validated filters", () => {
    expect(route).toContain(
      'requirePermission(request, requestId, "inventory.read")',
    );
    expect(route).toContain("querySchema.parse");
    expect(route).toContain("warehouseId");
  });
  it("returns warehouse, count progress, and stock difference", () => {
    for (const field of [
      "warehouse",
      "itemCount",
      "countedItemCount",
      "progressPercent",
      "difference",
    ])
      expect(route).toContain(field);
    expect(route).toContain("ORDER BY o.started_at DESC");
  });
  it("preserves the existing secure opname POST", () => {
    expect(route).toMatch(
      /requirePermission\(\s*request,\s*requestId,\s*"inventory\.adjust"/,
    );
    expect(route).toContain("assertSameOrigin(request)");
    expect(route).toContain("INSERT INTO app.stock_opnames");
    expect(route).toContain("INSERT INTO app.stock_opname_items");
  });
});
