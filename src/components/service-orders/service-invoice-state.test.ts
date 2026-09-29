import { describe, expect, it } from "vitest";
import { isServiceInvoicePaid } from "./service-invoice-state";

describe("isServiceInvoicePaid", () => {
  it("closes payment form after invoice is paid", () => {
    expect(isServiceInvoicePaid({ status: "paid", total: 312000, outstandingAmount: 0 })).toBe(true);
    expect(isServiceInvoicePaid({ status: "partially_paid", total: 312000, outstandingAmount: 0 })).toBe(true);
  });

  it("keeps payment form for outstanding invoice", () => {
    expect(isServiceInvoicePaid({ status: "partially_paid", total: 312000, outstandingAmount: 12000 })).toBe(false);
    expect(isServiceInvoicePaid({ status: "issued", total: 312000 })).toBe(false);
  });

  it("does not treat a reversed or empty invoice as paid", () => {
    expect(isServiceInvoicePaid({ status: "reversed", total: 312000, outstandingAmount: 0 })).toBe(false);
    expect(isServiceInvoicePaid({ status: "issued", total: 0, outstandingAmount: 0 })).toBe(false);
    expect(isServiceInvoicePaid(null)).toBe(false);
  });
});
