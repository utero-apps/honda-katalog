import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkout } from "@/features/pos/service";

const source = readFileSync(new URL("./service.ts", import.meta.url), "utf8");

describe("POS cashier RLS contract", () => {
  it("reads product metadata without an update lock", () => {
    expect(source).toContain("FROM app.products p WHERE p.id=ANY($1::uuid[]) ORDER BY p.id");
    expect(source).not.toContain("FROM app.products p WHERE p.id=ANY($1::uuid[]) ORDER BY p.id FOR UPDATE");
  });

  it("retains inventory balance locking for stock integrity", () => {
    expect(source).toContain('ORDER BY product_id${lockBalances ? " FOR UPDATE" : ""}');
    expect(source).toContain("resolveItems(client, register.warehouse_id, input.items, true)");
  });

  it("resolves open bill drafts without balance or service row locks", () => {
    expect(source).toContain("resolveItems(client, register.warehouse_id, input.items, false)");
    expect(source).not.toContain("app.pos_services WHERE id=ANY($1::uuid[]) ORDER BY id FOR SHARE");
  });

  it("rejects another customer's open bill before product or inventory access", async () => {
    const calls: string[] = [];
    const client = {
      query: async (query: string) => {
        calls.push(query);
        if (query.includes("hashtextextended")) return { rows: [], rowCount: 0 };
        if (query.includes("FROM app.pos_sales WHERE idempotency_key")) return { rows: [], rowCount: 0 };
        if (query.includes("FROM app.pos_open_bills")) return { rows: [], rowCount: 0 };
        throw new Error(`Unexpected query: ${query}`);
      },
    };
    await expect(checkout(client as never, { id: "33333333-3333-4333-8333-333333333333", role: "cashier", requestId: "44444444-4444-4444-8444-444444444444" }, {
      registerId: "11111111-1111-4111-8111-111111111111",
      customerId: "55555555-5555-4555-8555-555555555555",
      openBillId: "66666666-6666-4666-8666-666666666666",
      items: [{ productId: "77777777-7777-4777-8777-777777777777", quantity: "1", discount: "0" }],
      payments: [{ method: "cash", amount: "1", idempotencyKey: "payment-key-123" }],
      tax: "0",
      idempotencyKey: "checkout-key-123",
    })).rejects.toMatchObject({ code: "OPEN_BILL_NOT_FOUND", status: 404 });
    expect(calls.some((query) => query.includes("app.pos_registers") || query.includes("app.products") || query.includes("app.inventory_balances") || query.includes("app.pos_open_bill_items"))).toBe(false);
    expect(calls.find((query) => query.includes("app.pos_open_bills"))).toContain("customer_id=$2 AND register_id=$3 AND status='open'");
  });
});
