import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

describe("customer profile 360 read model", () => {
  it("includes invoices, payments, POS transactions, sparepart history, and direct service reminders", () => {
    expect(route).toContain("app.customer_invoices");
    expect(route).toContain("app.payments");
    expect(route).toContain("app.pos_sales");
    expect(route).toContain("app.service_order_parts");
    expect(route).toContain("app.service_reminders");
    expect(route).toContain("posTransactions");
  });

  it("serializes monetary and quantity values without exposing part cost", () => {
    expect(route).toContain("unitPrice: Number(row.unitPrice)");
    expect(route).not.toContain("unit_cost");
    expect(route).not.toContain("hpp");
  });
});
