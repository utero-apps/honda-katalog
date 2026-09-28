import { describe, expect, it } from "vitest";
import { openBillItemToCart } from "./PosWorkspace";

describe("openBillItemToCart", () => {
  it("memulihkan item milik Open Bill pelanggan terpilih tanpa data cart lama", () => {
    const restored = [
      {
        itemType: "product" as const,
        productId: "product-b",
        quantity: "2",
        itemCode: "PART-B",
        itemName: "Produk pelanggan B",
        unit: "pcs",
        unitPrice: "25000",
      },
    ]
      .map(openBillItemToCart)
      .filter((item) => item !== null);

    expect(restored).toHaveLength(1);
    expect(restored[0]).toMatchObject({
      id: "product-b",
      name: "Produk pelanggan B",
      cartQuantity: 2,
      unitPrice: 25000,
    });
    expect(restored.some((item) => item.id === "product-a")).toBe(false);
  });
});
