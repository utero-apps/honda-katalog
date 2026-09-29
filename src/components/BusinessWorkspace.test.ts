import { describe, expect, it } from "vitest";
import { customerListEndpoint, vehicleBelongsToCustomer, vehiclesForCustomer } from "./BusinessWorkspace";

const vehicles = [
  { id: "vehicle-a", customerId: "customer-a", plateNumber: "B 1234 AA" },
  { id: "vehicle-b", customerId: "customer-b", plateNumber: "B 5678 BB" },
];

describe("BusinessWorkspace service order references", () => {
  it("filters vehicles by selected customer", () => {
    expect(vehiclesForCustomer(vehicles, "customer-a")).toEqual([vehicles[0]]);
    expect(vehiclesForCustomer(vehicles, "")).toEqual([]);
  });

  it("rejects customer and vehicle pairs that do not match", () => {
    expect(vehicleBelongsToCustomer(vehicles, "customer-a", "vehicle-a")).toBe(true);
    expect(vehicleBelongsToCustomer(vehicles, "customer-a", "vehicle-b")).toBe(false);
  });

  it("builds paginated server-side customer search URLs", () => {
    expect(customerListEndpoint("  Budi & Sons  ", 100)).toBe("/api/v1/operations/customers?limit=100&offset=100&query=Budi+%26+Sons");
    expect(customerListEndpoint("", -100)).toBe("/api/v1/operations/customers?limit=100&offset=0");
  });
});
