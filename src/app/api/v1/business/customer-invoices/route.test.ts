import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

describe("legacy customer invoice safety", () => {
  it("delegates invoice creation to the canonical service-order backend", () => {
    expect(route).toContain('import { createServiceInvoice } from "@/features/service-orders/service"');
    expect(route).toContain("client=>createServiceInvoice");
    expect(route).not.toContain("INSERT INTO app.customer_invoices");
    expect(route).not.toContain("UPDATE app.service_orders SET status='invoiced'");
  });

  it("keeps origin and finance authorization checks", () => {
    expect(route).toContain("assertSameOrigin(request)");
    expect(route).toContain('requirePermission(request,requestId,"finance.post")');
  });
});
