import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ApiError } from "@/server/http";
import {
  assertIdempotencyPayloadMatches,
  assertCustomerInvoicePayable,
  assertPaymentWithinOutstanding,
  assertVendorInvoicePayable,
  paymentInput,
} from "./route";

const invoiceId = "11111111-1111-4111-8111-111111111111";
const payload = {
  paymentNumber: "PAY-TEST-001",
  direction: "outgoing" as const,
  vendorInvoiceId: invoiceId,
  amount: 40000,
  method: "transfer" as const,
  reference: "TRF-001",
  idempotencyKey: "payment-test-key",
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

describe("outgoing vendor payment safety", () => {
  it("locks invoice, ignores reversed payments, updates status, and records audit", () => {
    const route = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
    expect(route).toContain("FROM app.vendor_invoices WHERE id=$1 FOR UPDATE");
    expect(route).toContain("reversed_at IS NULL");
    expect(route).toContain("UPDATE app.vendor_invoices SET status=$1::app.invoice_status");
    expect(route).toContain('action: "finance.vendor_invoice.payment"');
  });

  it("accepts a valid outgoing payment payload", () => {
    expect(paymentInput.safeParse(payload).success).toBe(true);
  });

  it("rejects mismatched invoices for outgoing payments", () => {
    expect(paymentInput.safeParse({ ...payload, customerInvoiceId: invoiceId }).success).toBe(false);
  });

  it.each(["draft", "reversed"])("rejects inactive vendor invoice %s", (status) => {
    expectApiError(
      () => assertVendorInvoicePayable({ status, total: "100000" }),
      409,
      "INVOICE_NOT_PAYABLE",
    );
  });

  it("rechecks the balance even when a reversed payment left invoice status paid", () => {
    expect(() => assertVendorInvoicePayable({ status: "paid", total: "100000" })).not.toThrow();
    expectApiError(() => assertPaymentWithinOutstanding(1, 100000, 100000), 409, "INVOICE_ALREADY_PAID");
  });

  it("rejects overpayment against non-reversed payment total", () => {
    expectApiError(
      () => assertPaymentWithinOutstanding(60001, 100000, 40000),
      422,
      "PAYMENT_OVERPAY",
    );
  });

  it("accepts exact settlement and returns zero outstanding before payment", () => {
    expect(assertPaymentWithinOutstanding(60000, 100000, 40000)).toBe(60000);
  });

  it("rejects idempotency-key reuse with different payload", () => {
    expectApiError(
      () =>
        assertIdempotencyPayloadMatches(
          {
            id: "22222222-2222-4222-8222-222222222222",
            paymentNumber: payload.paymentNumber,
            direction: payload.direction,
            customerInvoiceId: null,
            vendorInvoiceId: invoiceId,
            amount: "40000",
            method: payload.method,
            reference: payload.reference,
            reversedAt: null,
          },
          { ...payload, amount: 40001 },
        ),
      409,
      "IDEMPOTENCY_CONFLICT",
    );
  });
});

describe("incoming customer payment safety", () => {
  it("rejects missing and inactive customer invoices", () => {
    expectApiError(() => assertCustomerInvoicePayable(undefined), 404, "CUSTOMER_INVOICE_NOT_FOUND");
    expectApiError(() => assertCustomerInvoicePayable({ status: "reversed", total: "100000" }), 409, "INVOICE_NOT_PAYABLE");
  });

  it("locks invoice and service order, reconciles statuses, and records audit", () => {
    const route = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
    expect(route).toContain("FOR UPDATE OF s");
    expect(route).toContain("FROM app.customer_invoices WHERE id=$1 FOR UPDATE");
    expect(route).toContain("customer_invoice_id=$1 AND direction='incoming' AND reversed_at IS NULL");
    expect(route).toContain("UPDATE app.customer_invoices SET status=$1::app.invoice_status");
    expect(route).toContain("UPDATE app.service_orders SET status='paid'");
    expect(route).toContain('action: "finance.customer_invoice.payment"');
  });
});
