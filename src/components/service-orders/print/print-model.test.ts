import { describe, expect, it } from "vitest";
import { canPrintDocument, handoverEvidence, lineTotal, type PrintableWorkflow } from "./print-model";

const order = { id: "order-id", orderNumber: "SO-001", status: "open" } satisfies PrintableWorkflow;

describe("service order print model", () => {
  it("calculates line totals from explicit subtotal or quantity and price", () => {
    expect(lineTotal({ quantity: 2, price: 15_000 })).toBe(30_000);
    expect(lineTotal({ quantity: 2, price: 15_000, subtotal: 25_000 })).toBe(25_000);
  });

  it("requires active invoice data before invoice printing", () => {
    expect(canPrintDocument(order, "invoice")).toBe(false);
    expect(canPrintDocument({ ...order, invoice: { invoiceNumber: "INV-001", status: "posted" } }, "invoice")).toBe(true);
    expect(canPrintDocument({ ...order, invoice: { invoiceNumber: "INV-001", status: "reversed" } }, "invoice")).toBe(false);
  });

  it("requires completed handover data before handover printing", () => {
    expect(canPrintDocument(order, "handover")).toBe(false);
    expect(canPrintDocument({ ...order, handover: { handedOverAt: "2026-09-29T10:00:00.000Z" } }, "handover")).toBe(true);
  });

  it("separates final photos and signature for handover evidence", () => {
    const evidence = handoverEvidence({
      serviceOrderId: "order-id",
      status: "completed",
      handedOverAt: "2026-09-29T10:00:00.000Z",
      checklist: { vehicleChecked: true, belongingsReturned: true, keysReturned: true, workExplained: true, notes: "Lengkap" },
      assets: [
        { id: "photo", kind: "final_photo", mimeType: "image/jpeg", size: 100, sha256: "photo-hash", createdAt: "2026-09-29T09:00:00.000Z", url: "/photo" },
        { id: "signature", kind: "signature", mimeType: "image/png", size: 100, sha256: "signature-hash", createdAt: "2026-09-29T09:05:00.000Z", url: "/signature" },
      ],
      readiness: { checklistReady: true, photoCount: 1, hasSignature: true, ready: true },
    });
    expect(evidence.photos.map((asset) => asset.id)).toEqual(["photo"]);
    expect(evidence.signature?.id).toBe("signature");
    expect(evidence.checklist?.workExplained).toBe(true);
  });
});
