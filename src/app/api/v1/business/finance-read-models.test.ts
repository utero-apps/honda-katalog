import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const customerInvoices = readFileSync(new URL("./customer-invoices/route.ts", import.meta.url), "utf8");
const payments = readFileSync(new URL("./payments/route.ts", import.meta.url), "utf8");

describe("finance read models", () => {
  it("exposes customer invoice balances and reversal state to finance readers", () => {
    expect(customerInvoices).toContain("finance.read");
    expect(customerInvoices).toContain('AS "paidAmount"');
    expect(customerInvoices).toContain('AS "outstandingAmount"');
    expect(customerInvoices).toContain("AS reversed");
    expect(customerInvoices).toContain('AS "overdueDays"');
    expect(customerInvoices).toContain("paidAmount:Number(paidAmount)");
  });

  it("exposes payment counterparty and reversal fields with numeric amount", () => {
    expect(payments).toContain("finance.read");
    expect(payments).toContain('AS "counterpartyName"');
    expect(payments).toContain('AS "reversedAt"');
    expect(payments).toContain('AS "reversalReason"');
    expect(payments).toContain("AS status");
    expect(payments).toContain("amount:Number(amount)");
  });

  it("keeps write permissions and idempotency on existing POST handlers", () => {
    expect(customerInvoices).toContain("finance.post");
    expect(payments).toContain("finance.pay");
    expect(payments).toContain("idempotency_key");
  });
});
