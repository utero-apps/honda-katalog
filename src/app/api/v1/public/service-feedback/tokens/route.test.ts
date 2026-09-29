import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), requirePermission: vi.fn(), recordAudit: vi.fn() }));
vi.mock("@/server/auth/permissions", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/server/audit", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/server/db", () => ({ withActorTransaction: (_identity: unknown, work: (client: { query: typeof mocks.query }) => unknown) => work({ query: mocks.query }) }));
import { POST } from "./route";

const serviceOrderId = "11111111-1111-4111-8111-111111111111";
function request(origin = "http://localhost") {
  return new Request("http://localhost/api/v1/public/service-feedback/tokens", {
    method: "POST", headers: { origin, host: "localhost", "content-type": "application/json" }, body: JSON.stringify({ serviceOrderId }),
  }) as never;
}

describe("issue customer feedback token", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.recordAudit.mockReset();
    mocks.requirePermission.mockReset().mockResolvedValue({ id: "22222222-2222-4222-8222-222222222222", role: "cashier" });
  });

  it("mewajibkan handover selesai dan menyimpan hash, bukan token mentah", async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ status: "completed", handedOverAt: new Date() }] })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const response = await POST(request());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.path).toMatch(/^\/service-feedback\/[A-Za-z0-9_-]{43}$/);
    const rawToken = body.data.path.split("/").at(-1);
    expect(mocks.query.mock.calls[3][1][1]).toMatch(/^[a-f0-9]{64}$/);
    expect(mocks.query.mock.calls[3][1][1]).not.toBe(rawToken);
  });

  it("menolak penerbitan sebelum handover", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ status: "paid", handedOverAt: null }] });
    expect((await POST(request())).status).toBe(409);
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it("menolak origin silang sebelum autentikasi", async () => {
    expect((await POST(request("https://attacker.invalid"))).status).toBe(403);
    expect(mocks.requirePermission).not.toHaveBeenCalled();
  });

  it("menolak staf selain owner, admin, atau cashier", async () => {
    mocks.requirePermission.mockResolvedValueOnce({ id: "22222222-2222-4222-8222-222222222222", role: "mechanic" });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
