import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), requirePermission: vi.fn(), recordAudit: vi.fn() }));
vi.mock("@/server/auth/permissions", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/server/audit", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/server/db", () => ({ withActorTransaction: (_identity: unknown, work: (client: { query: typeof mocks.query }) => unknown) => work({ query: mocks.query }) }));
import { POST } from "./route";

const id = "11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ id }) };
function request(body: unknown, origin = "http://localhost") {
  return new Request(`http://localhost/api/v1/operations/service-orders/${id}/feedback`, {
    method: "POST", headers: { "content-type": "application/json", origin, host: "localhost" }, body: JSON.stringify(body),
  }) as never;
}

describe("feedback Service Order", () => {
  beforeEach(() => { mocks.query.mockReset(); mocks.requirePermission.mockReset().mockResolvedValue({ id: "22222222-2222-4222-8222-222222222222", role: "admin" }); mocks.recordAudit.mockReset(); });

  it("menolak rating sebelum handover", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ customerId: "customer", mechanicId: "mechanic", status: "paid" }] });
    expect((await POST(request({ rating: 5 }), context)).status).toBe(409);
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("menyimpan rating hanya untuk SO completed dengan mekanik", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ customerId: "customer", mechanicId: "mechanic", status: "completed" }] })
      .mockResolvedValueOnce({ rows: [{ rating: 4, comments: "Baik" }] });
    expect((await POST(request({ rating: 4, comments: "Baik" }), context)).status).toBe(200);
    expect(mocks.query.mock.calls[1][1]).toEqual([id, "customer", "mechanic", 4, "Baik", "22222222-2222-4222-8222-222222222222"]);
    expect(mocks.recordAudit).toHaveBeenCalledTimes(1);
  });

  it("menolak nilai tidak valid dan origin silang", async () => {
    expect((await POST(request({ rating: 6 }), context)).status).toBe(422);
    expect((await POST(request({ rating: 5 }, "https://evil.example"), context)).status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
