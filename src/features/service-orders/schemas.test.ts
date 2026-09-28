import { describe, expect, it } from "vitest";
import { invoiceInputSchema, workflowActionSchema } from "@/features/service-orders/schemas";
import { canHandover } from "@/features/service-orders/service";

describe("service order workflow schemas", () => {
  it("accepts QRIS payment with idempotency", () => {
    expect(invoiceInputSchema.parse({ action: "record_payment", method: "qris", amount: 25000, idempotencyKey: "payment-key-123" })).toMatchObject({ action: "record_payment", method: "qris", amount: 25000 });
  });

  it("accepts URL evidence and rejects base64 payloads", () => {
    expect(workflowActionSchema.parse({ action: "add_evidence", evidenceType: "vehicle", url: "https://cdn.example.com/vehicle.jpg" })).toMatchObject({ action: "add_evidence", url: "https://cdn.example.com/vehicle.jpg" });
    expect(() => workflowActionSchema.parse({ action: "add_evidence", evidenceType: "vehicle", url: "data:image/png;base64,abc" })).toThrow();
  });

  it("requires handover recipient and accepts signature reference", () => {
    expect(workflowActionSchema.parse({ action: "handover", recipientName: "Budi", signatureReference: "/evidence/signature.png" })).toMatchObject({ action: "handover", recipientName: "Budi" });
  });

  it("allows handover only after full payment changes order to paid", () => {
    expect(canHandover("paid", { handoverReady: true, outstanding: 0 })).toBe(true);
    expect(canHandover("invoiced", { handoverReady: true, outstanding: 0 })).toBe(false);
    expect(canHandover("paid", { handoverReady: false, outstanding: 1000 })).toBe(false);
  });
});
