import { describe, expect, it } from "vitest";
import { buildMechanicDetailUrl, buildMechanicManagementPayload, calculateServiceValue, canManageMechanics } from "./mechanic-detail-state";

describe("mechanic detail state", () => {
  it("adds selected period to detail request", () => {
    expect(buildMechanicDetailUrl("mechanic-1", { from: "2026-09-01", to: "2026-09-30" })).toBe(
      "/api/v1/intelligence/mechanics/mechanic-1?from=2026-09-01&to=2026-09-30",
    );
  });

  it("omits empty period values", () => {
    expect(buildMechanicDetailUrl("mechanic-1", { from: "", to: "" })).toBe(
      "/api/v1/intelligence/mechanics/mechanic-1",
    );
  });

  it("calculates total and average service value", () => {
    expect(calculateServiceValue([{ price: 150_000 }, { price: 50_000 }])).toEqual({ total: 200_000, average: 100_000 });
    expect(calculateServiceValue([])).toEqual({ total: 0, average: 0 });
  });

  it("allows mechanic settings only for owner and admin", () => {
    expect(canManageMechanics("owner")).toBe(true);
    expect(canManageMechanics("admin")).toBe(true);
    expect(canManageMechanics("mechanic")).toBe(false);
    expect(canManageMechanics(undefined)).toBe(false);
  });

  it("builds numeric mechanic management payload", () => {
    expect(buildMechanicManagementPayload({
      userId: "mechanic-1",
      employeeCode: "M-01",
      feePercent: 12.5,
      isActive: true,
      monthlyTargetOrders: "40",
      weeklyCapacityOrders: "12",
      bonusPerCompletedOrder: "25000",
    })).toEqual({
      userId: "mechanic-1",
      employeeCode: "M-01",
      feePercent: 12.5,
      isActive: true,
      monthlyTargetOrders: 40,
      weeklyCapacityOrders: 12,
      bonusPerCompletedOrder: 25000,
    });
  });
});
