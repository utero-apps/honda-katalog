import { describe, expect, it } from "vitest";
import { movementInput } from "./route";

const baseMovement = {
  warehouseId: "11111111-1111-4111-8111-111111111111",
  productId: "22222222-2222-4222-8222-222222222222",
  unitCost: 0,
  referenceType: "manual_adjustment",
  idempotencyKey: "movement-test-key",
};

describe("inventory movement input", () => {
  it.each([
    ["opening", 1],
    ["receiving", 1],
    ["adjustment_in", 1],
    ["return_in", 1],
    ["service_usage", -1],
    ["adjustment_out", -1],
    ["return_out", -1],
    ["opname", -1],
    ["opname", 1],
  ] as const)("accepts %s with quantity %i", (movementType, quantity) => {
    expect(movementInput.safeParse({ ...baseMovement, movementType, quantity }).success).toBe(true);
  });

  it.each([
    ["opening", -1],
    ["receiving", -1],
    ["adjustment_in", -1],
    ["return_in", -1],
    ["service_usage", 1],
    ["adjustment_out", 1],
    ["return_out", 1],
  ] as const)("rejects invalid sign for %s", (movementType, quantity) => {
    expect(movementInput.safeParse({ ...baseMovement, movementType, quantity }).success).toBe(false);
  });
});
