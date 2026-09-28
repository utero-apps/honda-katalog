import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

describe("customer finance reversal integrity", () => {
  it("denies payment reversal after handover", () => {
    expect(route).toContain('s.handed_over_at AS "handedOverAt"');
    expect(route).toContain("HANDOVER_ALREADY_COMPLETED");
    expect(route).toContain("FOR UPDATE OF s");
  });

  it("reconciles customer invoice and service-order status", () => {
    expect(route).toContain("RETURNING id,vendor_invoice_id,customer_invoice_id");
    expect(route).toContain("customer_invoice_id=$1 AND direction='incoming' AND reversed_at IS NULL");
    expect(route).toContain("UPDATE app.customer_invoices SET status=$1::app.invoice_status");
    expect(route).toContain("UPDATE app.service_orders SET status=$1::app.service_status");
    expect(route).toContain("Pembayaran direversal");
  });

  it("rejects legacy service invoice reversal that cannot be safely reissued", () => {
    expect(route).toContain("SERVICE_INVOICE_REVERSAL_UNSUPPORTED");
  });
});
