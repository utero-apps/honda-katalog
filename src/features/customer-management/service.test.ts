import { describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import { mergeCustomers, transferVehicle } from "./service";

const actor = { id: "actor-id", role: "admin", requestId: "request-id" };

function clientWith(handler: (sql: string, values: unknown[] | undefined) => unknown) {
  return { query: vi.fn(async (sql: string, values?: unknown[]) => handler(sql, values)) } as unknown as PoolClient & { query: ReturnType<typeof vi.fn> };
}

describe("customer management integrity", () => {
  it("blocks vehicle transfer while a completed order has not been handed over", async () => {
    const client = clientWith((sql) => {
      if (sql.includes("FROM app.customer_vehicles")) return { rows: [{ customerId: "source" }], rowCount: 1 };
      if (sql.includes("FROM app.customers")) return { rows: [{}], rowCount: 1 };
      if (sql.includes("FROM app.service_orders")) return { rows: [{}], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });

    await expect(transferVehicle(client, actor, "vehicle", "target", "Motor dijual")).rejects.toMatchObject({ code: "VEHICLE_TRANSFER_ACTIVE_ORDER" });
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("handed_over_at IS NULL"), ["vehicle"]);
  });

  it("moves dependent customer relations and copies missing target contacts", async () => {
    const statements: string[] = [];
    const client = clientWith((sql) => {
      statements.push(sql);
      if (sql.includes("FROM app.customers") && sql.includes("FOR UPDATE")) return {
        rowCount: 2,
        rows: [
          { id: "source", is_active: true, merged_into_id: null, phone: "08123", email: "source@example.com", normalized_phone: "628123", normalized_email: "source@example.com", communication_consent: true, preferred_channel: "whatsapp" },
          { id: "target", is_active: true, merged_into_id: null, phone: null, email: null, normalized_phone: null, normalized_email: null, communication_consent: false, preferred_channel: "phone" },
        ],
      };
      if (sql.includes("FROM app.pos_open_bills")) return { rowCount: 1, rows: [{ customer_id: "source" }] };
      return { rowCount: 1, rows: [] };
    });

    await mergeCustomers(client, actor, "target", "source", "Data duplikat");

    expect(statements.some((sql) => sql.includes("normalized_email=NULL,communication_consent=false"))).toBe(true);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining("communication_consent=$5"), ["08123", "source@example.com", "628123", "source@example.com", false, "phone", "actor-id", "target"]);
    expect(statements.some((sql) => sql.includes("UPDATE app.service_orders SET customer_id=$1"))).toBe(true);
    expect(statements.some((sql) => sql.includes("UPDATE app.service_order_feedback SET customer_id=$1"))).toBe(true);
    expect(statements.some((sql) => sql.includes("UPDATE app.pos_open_bills SET customer_id=$1"))).toBe(true);
  });

  it("rejects merge when both customers own an open POS bill", async () => {
    const client = clientWith((sql) => {
      if (sql.includes("FROM app.customers")) return { rowCount: 2, rows: [
        { id: "source", is_active: true, merged_into_id: null },
        { id: "target", is_active: true, merged_into_id: null },
      ] };
      if (sql.includes("FROM app.pos_open_bills")) return { rowCount: 2, rows: [{ customer_id: "source" }, { customer_id: "target" }] };
      return { rowCount: 0, rows: [] };
    });

    await expect(mergeCustomers(client, actor, "target", "source", "Data duplikat")).rejects.toMatchObject({ code: "CUSTOMER_MERGE_OPEN_BILLS" });
  });
});
