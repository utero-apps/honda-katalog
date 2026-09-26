import { describe, expect, it } from "vitest";
import { catalogQuerySchema, productInputSchema } from "@/features/catalog/schemas";

describe("catalog schemas", () => {
  it("normalizes pagination defaults", () => {
    expect(catalogQuerySchema.parse({})).toMatchObject({ query: "", page: 1, pageSize: 24 });
  });

  it("rejects invalid product values", () => {
    expect(() => productInputSchema.parse({ partCode: "A", name: "X", het: -1 })).toThrow();
  });

  it("accepts safe product input", () => {
    expect(productInputSchema.parse({ partCode: "123-ABC", name: "Kampas Rem", het: 45000 })).toMatchObject({ unit: "pcs", status: "active" });
  });
});
