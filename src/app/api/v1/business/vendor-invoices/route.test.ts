import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ApiError } from "@/server/http";
import {
  assertExistingInvoiceMatches,
  assertInvoiceWithinRemaining,
  assertPurchaseOrderInvoiceable,
  vendorInvoiceInput,
} from "./route";

const vendorId = "11111111-1111-4111-8111-111111111111";
const purchaseOrderId = "22222222-2222-4222-8222-222222222222";
const input = {
  invoiceNumber: "VI-TEST-001",
  vendorId,
  purchaseOrderId,
  total: 75000,
  issuedAt: "2026-09-29",
  dueAt: "2026-10-29",
};

function expectApiError(action: () => void, status: number, code: string) {
  try {
    action();
    throw new Error("Expected ApiError");
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status, code });
  }
}

describe("vendor invoice integrity", () => {
  it("validates monetary and date input", () => {
    expect(vendorInvoiceInput.safeParse(input).success).toBe(true);
    expect(vendorInvoiceInput.safeParse({ ...input, total: 0 }).success).toBe(false);
    expect(vendorInvoiceInput.safeParse({ ...input, dueAt: "2026-09-28" }).success).toBe(false);
  });

  it.each(["partially_received", "received"])("accepts invoiceable purchase order status %s", (status) => {
    expect(() =>
      assertPurchaseOrderInvoiceable(
        { id: purchaseOrderId, vendorId, status },
        vendorId,
      ),
    ).not.toThrow();
  });

  it("rejects missing, mismatched, and premature purchase orders", () => {
    expectApiError(() => assertPurchaseOrderInvoiceable(undefined, vendorId), 404, "PURCHASE_ORDER_NOT_FOUND");
    expectApiError(
      () => assertPurchaseOrderInvoiceable(
        { id: purchaseOrderId, vendorId: "33333333-3333-4333-8333-333333333333", status: "received" },
        vendorId,
      ),
      422,
      "PURCHASE_ORDER_VENDOR_MISMATCH",
    );
    expectApiError(
      () => assertPurchaseOrderInvoiceable(
        { id: purchaseOrderId, vendorId, status: "approved" },
        vendorId,
      ),
      409,
      "PURCHASE_ORDER_NOT_INVOICEABLE",
    );
  });

  it("enforces remaining PO value using cent-safe comparison", () => {
    expect(assertInvoiceWithinRemaining(75000, 100000, 25000)).toBe(75000);
    expectApiError(() => assertInvoiceWithinRemaining(75000.01, 100000, 25000), 422, "PURCHASE_ORDER_INVOICE_TOTAL_EXCEEDED");
    expectApiError(() => assertInvoiceWithinRemaining(1, 100000, 100000), 409, "PURCHASE_ORDER_FULLY_INVOICED");
  });

  it("treats an identical vendor invoice retry as idempotent", () => {
    expect(() => assertExistingInvoiceMatches(
      {
        id: "44444444-4444-4444-8444-444444444444",
        invoiceNumber: input.invoiceNumber.toLowerCase(),
        vendorId,
        purchaseOrderId,
        status: "posted",
        total: "75000.00",
        issuedAt: input.issuedAt,
        dueAt: input.dueAt,
      },
      input,
    )).not.toThrow();
  });

  it("rejects duplicate vendor invoice number with changed payload", () => {
    expectApiError(
      () => assertExistingInvoiceMatches(
        {
          id: "44444444-4444-4444-8444-444444444444",
          invoiceNumber: input.invoiceNumber,
          vendorId,
          purchaseOrderId,
          status: "posted",
          total: "75000.00",
          issuedAt: input.issuedAt,
          dueAt: input.dueAt,
        },
        { ...input, total: 76000 },
      ),
      409,
      "DUPLICATE_VENDOR_INVOICE",
    );
  });

  it("does not replay a reversed invoice", () => {
    expectApiError(
      () => assertExistingInvoiceMatches(
        {
          id: "44444444-4444-4444-8444-444444444444",
          invoiceNumber: input.invoiceNumber,
          vendorId,
          purchaseOrderId,
          status: "reversed",
          total: "75000.00",
          issuedAt: input.issuedAt,
          dueAt: input.dueAt,
        },
        input,
      ),
      409,
      "VENDOR_INVOICE_REVERSED",
    );
  });

  it("locks the PO, ignores reversed invoices/payments, and records audit", () => {
    const route = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
    expect(route).toContain("FOR UPDATE OF po");
    expect(route).toContain("invoice.status<>'reversed'");
    expect(route).toContain("reversed_at IS NULL");
    expect(route).toContain("SUM(amount) AS paid");
    expect(route).toContain('action: "finance.vendor_invoice.create"');
    expect(route).toContain("pg_advisory_xact_lock");
  });
});
