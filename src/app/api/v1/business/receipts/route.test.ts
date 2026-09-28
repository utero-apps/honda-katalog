import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ApiError } from "@/server/http";
import {
  assertReceivablePurchaseOrder,
  assertReceiptItemBelongsToPurchaseOrder,
  receiptInput,
} from "./route";

const receipt = {
  receiptNumber: "GR-TEST-001",
  purchaseOrderId: "11111111-1111-4111-8111-111111111111",
  warehouseId: "22222222-2222-4222-8222-222222222222",
  idempotencyKey: "receipt-test-key",
  items: [
    {
      purchaseOrderItemId: "33333333-3333-4333-8333-333333333333",
      quantity: 1,
      unitCost: 1000,
    },
  ],
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

describe("goods receipt safety", () => {
  it("uses purchasing read access and a newest-first UI list", () => {
    const route = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
    expect(route).toContain(
      'requirePermission(request, requestId, "purchasing.read")',
    );
    expect(route).toContain("ORDER BY gr.received_at DESC");
    for (const field of [
      "purchaseOrderNumber",
      "vendor",
      "warehouse",
      "itemCount",
      "totalQuantity",
    ])
      expect(route).toContain(field);
  });
  it("preserves inventory receive permission and same-origin protection for POST", () => {
    const route = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
    expect(route).toMatch(
      /requirePermission\(\s*request,\s*requestId,\s*"inventory\.receive"/,
    );
    expect(route).toContain("assertSameOrigin(request)");
    expect(route).toContain("INSERT INTO app.goods_receipts");
    expect(route).toContain("INSERT INTO app.stock_movements");
  });
  it.each(["approved", "partially_received"])(
    "accepts PO status %s",
    (status) => {
      expect(() => assertReceivablePurchaseOrder({ status })).not.toThrow();
    },
  );

  it.each([
    "draft",
    "submitted",
    "received",
    "closed",
    "rejected",
    "cancelled",
  ])("rejects PO status %s", (status) => {
    expectApiError(
      () => assertReceivablePurchaseOrder({ status }),
      409,
      "PO_NOT_RECEIVABLE",
    );
  });

  it("rejects missing PO", () => {
    expectApiError(
      () => assertReceivablePurchaseOrder(undefined),
      404,
      "PO_NOT_FOUND",
    );
  });

  it("rejects receipt item outside the PO", () => {
    expectApiError(
      () => assertReceiptItemBelongsToPurchaseOrder(undefined),
      422,
      "RECEIPT_ITEM_NOT_IN_PO",
    );
  });

  it("rejects duplicate PO items in one receipt", () => {
    expect(
      receiptInput.safeParse({
        ...receipt,
        items: [receipt.items[0], receipt.items[0]],
      }).success,
    ).toBe(false);
  });

  it("accepts a valid receipt payload", () => {
    expect(receiptInput.safeParse(receipt).success).toBe(true);
  });
});
